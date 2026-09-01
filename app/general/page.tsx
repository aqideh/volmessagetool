"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { db } from "@/lib/db";
import { parseRoster } from "@/lib/import";
import { eventVariablesUsed, GENERAL_DEFAULT_TEMPLATE, renderGeneralMessage } from "@/lib/message";
import { normalizePhone, whatsappUrl } from "@/lib/phone";
import type { GeneralCampaignRecord, GeneralRecipientRecord, GeneralSendRecord, SendStatus } from "@/lib/types";

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

export default function GeneralMessagesPage() {
  const [campaigns, setCampaigns] = useState<GeneralCampaignRecord[]>([]);
  const [recipients, setRecipients] = useState<GeneralRecipientRecord[]>([]);
  const [sendRecords, setSendRecords] = useState<GeneralSendRecord[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [campaignName, setCampaignName] = useState("General message");
  const [template, setTemplate] = useState(GENERAL_DEFAULT_TEMPLATE);
  const [newRecipient, setNewRecipient] = useState({ name: "", phone: "" });
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh(preferredCampaignId?: string) {
    const [allCampaigns, allRecipients, allSendRecords] = await Promise.all([
      db.generalCampaigns.orderBy("updatedAt").reverse().toArray(),
      db.generalRecipients.toArray(),
      db.generalSendRecords.toArray(),
    ]);
    setCampaigns(allCampaigns);
    setRecipients(allRecipients);
    setSendRecords(allSendRecords);
    const next = preferredCampaignId || selectedCampaignId || allCampaigns[0]?.id || "";
    setSelectedCampaignId(next);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId);
  const campaignRecipients = useMemo(
    () => recipients.filter((recipient) => recipient.campaignId === selectedCampaignId),
    [recipients, selectedCampaignId],
  );
  const campaignRecords = useMemo(
    () => sendRecords.filter((record) => record.campaignId === selectedCampaignId),
    [sendRecords, selectedCampaignId],
  );
  const recordByRecipient = useMemo(() => new Map(campaignRecords.map((record) => [record.recipientId, record])), [campaignRecords]);

  useEffect(() => {
    if (!selectedCampaign) return;
    setCampaignName(selectedCampaign.name);
    setTemplate(selectedCampaign.template);
  }, [selectedCampaign?.id]);

  const counts = campaignRecipients.reduce(
    (acc, recipient) => {
      const status = recordByRecipient.get(recipient.id)?.status || "pending";
      acc[status] += 1;
      return acc;
    },
    { pending: 0, opened: 0, sent: 0, skipped: 0, error: 0 } as Record<SendStatus, number>,
  );

  const invalidVariables = eventVariablesUsed(template);

  function newCampaign() {
    setSelectedCampaignId("");
    setCampaignName("General message");
    setTemplate(GENERAL_DEFAULT_TEMPLATE);
    setNewRecipient({ name: "", phone: "" });
  }

  async function saveCampaign() {
    if (invalidVariables.length) {
      return setNotice(`General messages cannot use event or shift variables: ${invalidVariables.map((item) => `{{${item}}}`).join(", ")}.`);
    }
    const timestamp = now();
    const data = { name: campaignName.trim() || "Untitled message", template, updatedAt: timestamp };
    if (selectedCampaign) {
      if (selectedCampaign.status === "closed") return setNotice("Reopen this message before editing it.");
      await db.generalCampaigns.update(selectedCampaign.id, data);
      setNotice("General message updated.");
      await refresh(selectedCampaign.id);
      return;
    }
    const campaignId = id();
    await db.generalCampaigns.add({ id: campaignId, ...data, status: "active", createdAt: timestamp });
    setNotice("General message created. Add or upload recipients below.");
    await refresh(campaignId);
  }

  async function toggleClosed() {
    if (!selectedCampaign) return;
    await db.generalCampaigns.update(selectedCampaign.id, {
      status: selectedCampaign.status === "active" ? "closed" : "active",
      updatedAt: now(),
    });
    setNotice(selectedCampaign.status === "active" ? "General message closed." : "General message reopened.");
    await refresh(selectedCampaign.id);
  }

  async function deleteCampaign() {
    if (!selectedCampaign) return;
    await db.transaction("rw", db.generalCampaigns, db.generalRecipients, db.generalSendRecords, async () => {
      await db.generalRecipients.where("campaignId").equals(selectedCampaign.id).delete();
      await db.generalSendRecords.where("campaignId").equals(selectedCampaign.id).delete();
      await db.generalCampaigns.delete(selectedCampaign.id);
    });
    setNotice("General message deleted.");
    setSelectedCampaignId("");
    await refresh();
  }

  async function addRecipient(event: FormEvent) {
    event.preventDefault();
    if (!selectedCampaign) return setNotice("Create or select a general message first.");
    if (selectedCampaign.status === "closed") return setNotice("Reopen this message before changing recipients.");
    const phone = normalizePhone(newRecipient.phone);
    if (!newRecipient.name.trim() || !phone) return setNotice("Enter a recipient name and valid phone number.");
    if (campaignRecipients.some((recipient) => recipient.phone === phone)) return setNotice("That phone number is already in this recipient list.");
    await db.generalRecipients.add({
      id: id(),
      campaignId: selectedCampaign.id,
      name: newRecipient.name,
      phone,
      fields: {},
      createdAt: now(),
    });
    setNewRecipient({ name: "", phone: "" });
    setNotice("Recipient added.");
    await refresh(selectedCampaign.id);
  }

  async function importRecipients(file?: File) {
    if (!selectedCampaign || !file) return;
    if (selectedCampaign.status === "closed") {
      setNotice("Reopen this message before changing recipients.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    try {
      const rows = await parseRoster(file);
      const existingPhones = new Set(campaignRecipients.map((recipient) => recipient.phone));
      const additions: GeneralRecipientRecord[] = [];
      const errors: string[] = [];
      let duplicates = 0;
      for (const row of rows) {
        const phone = normalizePhone(row.phone);
        const label = `Row ${row.sourceRow}${row.name ? ` (${row.name})` : ""}`;
        if (!row.name) { errors.push(`${label}: name is blank`); continue; }
        if (!phone) { errors.push(`${label}: invalid phone number`); continue; }
        if (existingPhones.has(phone)) { duplicates += 1; continue; }
        additions.push({ id: id(), campaignId: selectedCampaign.id, name: row.name, phone, fields: row.fields, createdAt: now() });
        existingPhones.add(phone);
      }
      if (additions.length) await db.generalRecipients.bulkAdd(additions);
      const errorPreview = errors.slice(0, 4).join("; ");
      setNotice(`Imported ${additions.length} recipient${additions.length === 1 ? "" : "s"}. ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped.${errors.length ? ` ${errors.length} rejected: ${errorPreview}${errors.length > 4 ? `; +${errors.length - 4} more` : ""}` : ""}`);
      await refresh(selectedCampaign.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Recipient import failed.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeRecipient(recipient: GeneralRecipientRecord) {
    if (!selectedCampaign || selectedCampaign.status === "closed") return setNotice("Reopen this message before changing recipients.");
    await db.transaction("rw", db.generalRecipients, db.generalSendRecords, async () => {
      await db.generalSendRecords.where("recipientId").equals(recipient.id).delete();
      await db.generalRecipients.delete(recipient.id);
    });
    setNotice(`${recipient.name} removed from this message.`);
    await refresh(selectedCampaign.id);
  }

  async function setStatus(recipient: GeneralRecipientRecord, status: SendStatus) {
    if (!selectedCampaign) return;
    const existing = recordByRecipient.get(recipient.id);
    const timestamp = now();
    await db.generalSendRecords.put({
      id: existing?.id || id(),
      campaignId: selectedCampaign.id,
      recipientId: recipient.id,
      status,
      openedAt: status === "opened" || status === "sent" ? existing?.openedAt || timestamp : existing?.openedAt,
      sentAt: status === "sent" ? timestamp : undefined,
      updatedAt: timestamp,
    });
    await refresh(selectedCampaign.id);
  }

  async function openWhatsApp(recipient: GeneralRecipientRecord) {
    if (!selectedCampaign) return;
    if (eventVariablesUsed(selectedCampaign.template).length) return setNotice("This message contains event or shift variables. Remove them before sending.");
    const message = renderGeneralMessage(selectedCampaign.template, recipient);
    window.open(whatsappUrl(recipient.phone, message), "_blank", "noopener,noreferrer");
    await setStatus(recipient, "opened");
  }

  function progress(campaign: GeneralCampaignRecord) {
    const ids = recipients.filter((recipient) => recipient.campaignId === campaign.id).map((recipient) => recipient.id);
    const sent = sendRecords.filter((record) => record.campaignId === campaign.id && ids.includes(record.recipientId) && record.status === "sent").length;
    return `${sent}/${ids.length}`;
  }

  const previewRecipient = campaignRecipients[0];

  return (
    <main className="general-page">
      <header className="general-header">
        <div><p className="eyebrow">Standalone messaging</p><h1>General Messages</h1><p className="muted">Send one-off WhatsApp messages without creating an event. Recipient lists stay attached only to each message.</p></div>
        <a className="secondary general-back" href="/">Back to events</a>
      </header>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>x</button></div>}

      <div className="general-layout">
        <section className="panel campaign-list">
          <div className="split"><div><h2>General messages</h2><p className="muted">No event details required.</p></div><button className="primary" onClick={newCampaign}>+ New</button></div>
          {campaigns.length === 0 && <p className="muted">No general messages yet.</p>}
          {campaigns.map((campaign) => <button key={campaign.id} className={`campaign-item ${campaign.id === selectedCampaignId ? "selected" : ""}`} onClick={() => setSelectedCampaignId(campaign.id)}><span><strong>{campaign.name}</strong><small>{recipients.filter((recipient) => recipient.campaignId === campaign.id).length} recipients · {campaign.status}</small></span><b>{progress(campaign)} sent</b></button>)}
        </section>

        <div className="general-main stack">
          <section className="panel message-editor">
            <div className="split"><div><h2>{selectedCampaign ? "Edit general message" : "New general message"}</h2>{selectedCampaign && <p className="muted">Status: {selectedCampaign.status}</p>}</div>{selectedCampaign && <div className="actions"><button className="secondary" onClick={toggleClosed}>{selectedCampaign.status === "active" ? "Close" : "Reopen"}</button><button className="text-button danger" onClick={deleteCampaign}>Delete</button></div>}</div>
            <label>Campaign name<input disabled={selectedCampaign?.status === "closed"} value={campaignName} onChange={(event) => setCampaignName(event.target.value)} /></label>
            <label>Template<textarea disabled={selectedCampaign?.status === "closed"} rows={9} value={template} onChange={(event) => setTemplate(event.target.value)} /></label>
            {invalidVariables.length > 0 && <div className="warning"><strong>Not available in general messages:</strong> {invalidVariables.map((item) => `{{${item}}}`).join(", ")}.</div>}
            <p className="muted">Use {"{{first_name}}"}, {"{{name}}"}, {"{{phone}}"}, or custom columns imported from your spreadsheet.</p>
            <button className="primary" disabled={selectedCampaign?.status === "closed"} onClick={saveCampaign}>{selectedCampaign ? "Save changes" : "Create message"}</button>
            <div className="preview"><h2>Preview</h2>{previewRecipient ? <pre>{renderGeneralMessage(template, previewRecipient)}</pre> : <p className="muted">Add a recipient to preview personalisation.</p>}</div>
          </section>

          {selectedCampaign && <>
            <section className="panel">
              <div className="split"><div><h2>Recipients</h2><p className="muted">Temporary list for this message only. Uploads need Name and Phone; Shift is not required.</p></div><div className="actions"><input ref={fileRef} className="file-input" type="file" accept=".csv,.xlsx,.xls" onChange={(event) => importRecipients(event.target.files?.[0])} /><button className="secondary" disabled={selectedCampaign.status === "closed"} onClick={() => fileRef.current?.click()}>Upload list</button></div></div>
              <form className="general-recipient-form" onSubmit={addRecipient}><input disabled={selectedCampaign.status === "closed"} placeholder="Name" value={newRecipient.name} onChange={(event) => setNewRecipient({ ...newRecipient, name: event.target.value })} /><input disabled={selectedCampaign.status === "closed"} placeholder="Phone" value={newRecipient.phone} onChange={(event) => setNewRecipient({ ...newRecipient, phone: event.target.value })} /><button className="primary" disabled={selectedCampaign.status === "closed"} type="submit">Add recipient</button></form>
              <div className="recipient-list">{campaignRecipients.length === 0 && <p className="muted">No recipients yet.</p>}{campaignRecipients.map((recipient) => <div className="recipient-row" key={recipient.id}><div><strong>{recipient.name}</strong><span>{recipient.phone}</span></div><button className="text-button danger" disabled={selectedCampaign.status === "closed"} onClick={() => removeRecipient(recipient)}>Remove</button></div>)}</div>
            </section>

            <section className="metrics"><Metric label="Pending" value={counts.pending} /><Metric label="Opened" value={counts.opened} /><Metric label="Sent" value={counts.sent} /><Metric label="Skipped / error" value={counts.skipped + counts.error} /></section>
            <section className="queue">{campaignRecipients.map((recipient, index) => { const status = recordByRecipient.get(recipient.id)?.status || "pending"; return <article className="queue-card" key={recipient.id}><div className="queue-number">{index + 1}</div><div className="queue-main"><div className="queue-head"><div><h3>{recipient.name}</h3><p>{recipient.phone}</p></div><StatusPill status={status} /></div><pre>{renderGeneralMessage(selectedCampaign.template, recipient)}</pre><div className="actions"><button className="whatsapp" onClick={() => openWhatsApp(recipient)}>Open in WhatsApp</button><button className="secondary" onClick={() => setStatus(recipient, "sent")}>Mark sent</button><button className="text-button" onClick={() => setStatus(recipient, "skipped")}>Skip</button><button className="text-button danger" onClick={() => setStatus(recipient, "error")}>Error</button></div></div></article>; })}</section>
          </>}
        </div>
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: SendStatus }) {
  return <span className={`status status-${status}`}>{status}</span>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
