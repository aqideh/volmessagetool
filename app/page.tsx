"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/db";
import { parseRoster } from "@/lib/import";
import { DEFAULT_TEMPLATE, renderMessage } from "@/lib/message";
import { normalizePhone, whatsappUrl } from "@/lib/phone";
import type { BackupPayload, CampaignRecord, EventRecord, SendRecord, SendStatus, VolunteerRecord } from "@/lib/types";

type Tab = "roster" | "message" | "send" | "backup";

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

export default function Home() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerRecord[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [sendRecords, setSendRecords] = useState<SendRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [tab, setTab] = useState<Tab>("roster");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [newVolunteer, setNewVolunteer] = useState({ name: "", phone: "", role: "" });
  const [eventForm, setEventForm] = useState({ name: "", date: "", time: "", venue: "" });
  const [campaignName, setCampaignName] = useState("Event details");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  async function refresh(preferredEventId?: string) {
    const [allEvents, allVolunteers, allCampaigns, allSendRecords] = await Promise.all([
      db.events.orderBy("date").reverse().toArray(),
      db.volunteers.toArray(),
      db.campaigns.toArray(),
      db.sendRecords.toArray(),
    ]);
    setEvents(allEvents);
    setVolunteers(allVolunteers);
    setCampaigns(allCampaigns);
    setSendRecords(allSendRecords);
    const next = preferredEventId || selectedEventId || allEvents.find((event) => event.status === "active")?.id || allEvents[0]?.id || "";
    setSelectedEventId(next);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const eventVolunteers = useMemo(
    () => volunteers.filter((volunteer) => volunteer.eventId === selectedEventId),
    [volunteers, selectedEventId],
  );
  const eventCampaigns = campaigns.filter((campaign) => campaign.eventId === selectedEventId);
  const activeCampaign = eventCampaigns[0];

  useEffect(() => {
    if (activeCampaign) {
      setCampaignName(activeCampaign.name);
      setTemplate(activeCampaign.template);
    } else {
      setCampaignName("Event details");
      setTemplate(DEFAULT_TEMPLATE);
    }
  }, [activeCampaign?.id, selectedEventId]);

  const recordsByVolunteer = useMemo(() => {
    const map = new Map<string, SendRecord>();
    if (!activeCampaign) return map;
    sendRecords.filter((record) => record.campaignId === activeCampaign.id).forEach((record) => map.set(record.volunteerId, record));
    return map;
  }, [sendRecords, activeCampaign]);

  const filteredVolunteers = eventVolunteers.filter((volunteer) => {
    const q = search.toLowerCase();
    return !q || `${volunteer.name} ${volunteer.phone} ${volunteer.role}`.toLowerCase().includes(q);
  });

  const counts = eventVolunteers.reduce(
    (acc, volunteer) => {
      const status = recordsByVolunteer.get(volunteer.id)?.status || "pending";
      acc[status] += 1;
      return acc;
    },
    { pending: 0, opened: 0, sent: 0, skipped: 0, error: 0 } as Record<SendStatus, number>,
  );

  async function createEvent(event: React.FormEvent) {
    event.preventDefault();
    if (!eventForm.name || !eventForm.date) return setNotice("Event name and date are required.");
    const record: EventRecord = { id: id(), ...eventForm, status: "active", createdAt: now() };
    await db.events.add(record);
    setEventForm({ name: "", date: "", time: "", venue: "" });
    setNotice("Event created.");
    await refresh(record.id);
  }

  async function archiveEvent() {
    if (!selectedEvent) return;
    await db.events.update(selectedEvent.id, { status: selectedEvent.status === "active" ? "archived" : "active" });
    setNotice(selectedEvent.status === "active" ? "Event archived." : "Event restored.");
    await refresh(selectedEvent.id);
  }

  async function addVolunteer(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedEvent) return;
    const phone = normalizePhone(newVolunteer.phone);
    if (!newVolunteer.name || !phone) return setNotice("Enter a volunteer name and valid phone number.");
    const duplicate = eventVolunteers.some((volunteer) => volunteer.phone === phone);
    if (duplicate) return setNotice("That phone number is already on this event roster.");
    await db.volunteers.add({ id: id(), eventId: selectedEvent.id, name: newVolunteer.name.trim(), phone, role: newVolunteer.role.trim(), fields: {}, createdAt: now() });
    setNewVolunteer({ name: "", phone: "", role: "" });
    setNotice("Volunteer added.");
    await refresh(selectedEvent.id);
  }

  async function importRoster(file?: File) {
    if (!selectedEvent || !file) return;
    try {
      const rows = await parseRoster(file);
      const existing = new Set(eventVolunteers.map((volunteer) => volunteer.phone));
      let added = 0;
      let skipped = 0;
      for (const row of rows) {
        const phone = normalizePhone(row.phone);
        if (!row.name || !phone || existing.has(phone)) {
          skipped += 1;
          continue;
        }
        existing.add(phone);
        await db.volunteers.add({ id: id(), eventId: selectedEvent.id, name: row.name, phone, role: row.role, fields: row.fields, createdAt: now() });
        added += 1;
      }
      setNotice(`Imported ${added} volunteer${added === 1 ? "" : "s"}${skipped ? `; skipped ${skipped} invalid or duplicate row${skipped === 1 ? "" : "s"}` : ""}.`);
      await refresh(selectedEvent.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Roster import failed.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeVolunteer(volunteer: VolunteerRecord) {
    await db.transaction("rw", db.volunteers, db.sendRecords, async () => {
      await db.volunteers.delete(volunteer.id);
      await db.sendRecords.where("volunteerId").equals(volunteer.id).delete();
    });
    setNotice(`${volunteer.name} removed from the roster.`);
    await refresh(selectedEventId);
  }

  async function saveCampaign() {
    if (!selectedEvent) return;
    if (activeCampaign) {
      await db.campaigns.update(activeCampaign.id, { name: campaignName.trim() || "Event details", template, updatedAt: now() });
    } else {
      await db.campaigns.add({ id: id(), eventId: selectedEvent.id, name: campaignName.trim() || "Event details", template, createdAt: now(), updatedAt: now() });
    }
    setNotice("Message saved.");
    await refresh(selectedEvent.id);
  }

  async function setSendStatus(volunteer: VolunteerRecord, status: SendStatus) {
    if (!activeCampaign || !selectedEvent) return;
    const existing = recordsByVolunteer.get(volunteer.id);
    const timestamp = now();
    const payload: SendRecord = {
      id: existing?.id || id(),
      eventId: selectedEvent.id,
      campaignId: activeCampaign.id,
      volunteerId: volunteer.id,
      status,
      openedAt: status === "opened" || status === "sent" ? existing?.openedAt || timestamp : existing?.openedAt,
      sentAt: status === "sent" ? timestamp : existing?.sentAt,
      updatedAt: timestamp,
    };
    await db.sendRecords.put(payload);
    await refresh(selectedEvent.id);
  }

  async function openWhatsApp(volunteer: VolunteerRecord) {
    if (!activeCampaign || !selectedEvent) return;
    const message = renderMessage(activeCampaign.template, selectedEvent, volunteer);
    await setSendStatus(volunteer, "opened");
    window.open(whatsappUrl(volunteer.phone, message), "_blank", "noopener,noreferrer");
  }

  async function exportBackup() {
    const payload: BackupPayload = {
      version: 1,
      exportedAt: now(),
      events: await db.events.toArray(),
      volunteers: await db.volunteers.toArray(),
      campaigns: await db.campaigns.toArray(),
      sendRecords: await db.sendRecords.toArray(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `volunteer-message-tool-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function restoreBackup(file?: File) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as BackupPayload;
      if (payload.version !== 1 || !Array.isArray(payload.events) || !Array.isArray(payload.volunteers)) throw new Error("Unsupported backup file.");
      await db.transaction("rw", db.events, db.volunteers, db.campaigns, db.sendRecords, async () => {
        await Promise.all([db.events.clear(), db.volunteers.clear(), db.campaigns.clear(), db.sendRecords.clear()]);
        await db.events.bulkAdd(payload.events);
        await db.volunteers.bulkAdd(payload.volunteers);
        await db.campaigns.bulkAdd(payload.campaigns || []);
        await db.sendRecords.bulkAdd(payload.sendRecords || []);
      });
      setNotice("Backup restored.");
      await refresh(payload.events[0]?.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Backup restore failed.");
    } finally {
      if (restoreRef.current) restoreRef.current.value = "";
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">VM</div>
          <div><strong>Volunteer Message Tool</strong><span>Local-first WhatsApp assistant</span></div>
        </div>
        <form className="event-form" onSubmit={createEvent}>
          <h2>New event</h2>
          <input placeholder="Event name" value={eventForm.name} onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} />
          <div className="field-row"><input type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} /><input type="time" value={eventForm.time} onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })} /></div>
          <input placeholder="Venue" value={eventForm.venue} onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })} />
          <button className="primary" type="submit">Create event</button>
        </form>
        <div className="event-list">
          <h2>Events</h2>
          {events.length === 0 && <p className="muted">Create your first event to begin.</p>}
          {events.map((event) => (
            <button key={event.id} className={`event-item ${event.id === selectedEventId ? "selected" : ""}`} onClick={() => setSelectedEventId(event.id)}>
              <span>{event.name}</span><small>{event.date} · {event.status}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="workspace">
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
        {!selectedEvent ? (
          <div className="empty-state"><h1>Start with an event</h1><p>Create an event, then upload a roster and prepare a WhatsApp message.</p></div>
        ) : (
          <>
            <header className="event-header">
              <div><p className="eyebrow">{selectedEvent.status}</p><h1>{selectedEvent.name}</h1><p>{selectedEvent.date}{selectedEvent.time ? ` · ${selectedEvent.time}` : ""}{selectedEvent.venue ? ` · ${selectedEvent.venue}` : ""}</p></div>
              <button className="secondary" onClick={archiveEvent}>{selectedEvent.status === "active" ? "Archive event" : "Restore event"}</button>
            </header>
            <nav className="tabs">
              {(["roster", "message", "send", "backup"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "send" ? "Send queue" : item[0].toUpperCase() + item.slice(1)}</button>)}
            </nav>

            {tab === "roster" && (
              <div className="stack">
                <section className="panel split">
                  <div><h2>Roster</h2><p className="muted">Upload CSV/XLSX or add late sign-ups manually. Extra columns become message variables.</p></div>
                  <div className="actions"><input ref={fileRef} className="file-input" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => importRoster(e.target.files?.[0])} /><button className="secondary" onClick={() => fileRef.current?.click()}>Upload roster</button></div>
                </section>
                <section className="panel">
                  <form className="inline-form" onSubmit={addVolunteer}><input placeholder="Name" value={newVolunteer.name} onChange={(e) => setNewVolunteer({ ...newVolunteer, name: e.target.value })} /><input placeholder="Phone" value={newVolunteer.phone} onChange={(e) => setNewVolunteer({ ...newVolunteer, phone: e.target.value })} /><input placeholder="Role (optional)" value={newVolunteer.role} onChange={(e) => setNewVolunteer({ ...newVolunteer, role: e.target.value })} /><button className="primary" type="submit">Add volunteer</button></form>
                </section>
                <section className="panel">
                  <div className="table-toolbar"><strong>{eventVolunteers.length} volunteer{eventVolunteers.length === 1 ? "" : "s"}</strong><input className="search" placeholder="Search roster" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                  <div className="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>{filteredVolunteers.map((volunteer) => <tr key={volunteer.id}><td>{volunteer.name}</td><td>{volunteer.phone}</td><td>{volunteer.role || "—"}</td><td><StatusPill status={recordsByVolunteer.get(volunteer.id)?.status || "pending"} /></td><td><button className="text-button danger" onClick={() => removeVolunteer(volunteer)}>Remove</button></td></tr>)}</tbody></table></div>
                </section>
              </div>
            )}

            {tab === "message" && (
              <div className="message-grid">
                <section className="panel"><h2>Message</h2><label>Campaign name<input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} /></label><label>Template<textarea rows={15} value={template} onChange={(e) => setTemplate(e.target.value)} /></label><p className="muted">Variables: {"{{first_name}}"}, {"{{name}}"}, {"{{event_name}}"}, {"{{date}}"}, {"{{time}}"}, {"{{venue}}"}, {"{{role}}"}, plus normalized spreadsheet column names.</p><button className="primary" onClick={saveCampaign}>Save message</button></section>
                <section className="panel preview"><h2>Preview</h2>{eventVolunteers[0] ? <pre>{renderMessage(template, selectedEvent, eventVolunteers[0])}</pre> : <p className="muted">Add a volunteer to preview personalisation.</p>}</section>
              </div>
            )}

            {tab === "send" && (
              <div className="stack">
                <section className="metrics"><Metric label="Pending" value={counts.pending} /><Metric label="Opened" value={counts.opened} /><Metric label="Sent" value={counts.sent} /><Metric label="Skipped / error" value={counts.skipped + counts.error} /></section>
                {!activeCampaign ? <section className="panel"><h2>No saved message</h2><p className="muted">Save a message before opening the send queue.</p><button className="primary" onClick={() => setTab("message")}>Create message</button></section> : eventVolunteers.length === 0 ? <section className="panel"><p className="muted">Add volunteers to the roster first.</p></section> : <section className="queue">{eventVolunteers.map((volunteer, index) => { const status = recordsByVolunteer.get(volunteer.id)?.status || "pending"; return <article className="queue-card" key={volunteer.id}><div className="queue-number">{index + 1}</div><div className="queue-main"><div className="queue-head"><div><h3>{volunteer.name}</h3><p>{volunteer.phone}{volunteer.role ? ` · ${volunteer.role}` : ""}</p></div><StatusPill status={status} /></div><pre>{renderMessage(activeCampaign.template, selectedEvent, volunteer)}</pre><div className="actions"><button className="whatsapp" onClick={() => openWhatsApp(volunteer)}>Open in WhatsApp</button><button className="secondary" onClick={() => setSendStatus(volunteer, "sent")}>Mark sent</button><button className="text-button" onClick={() => setSendStatus(volunteer, "skipped")}>Skip</button><button className="text-button danger" onClick={() => setSendStatus(volunteer, "error")}>Error</button></div></div></article>; })}</section>}
                <p className="muted">Opening WhatsApp only marks a record as “Opened”. The tool cannot verify delivery without the official WhatsApp Business Platform, so “Sent” must be confirmed manually.</p>
              </div>
            )}

            {tab === "backup" && (
              <section className="panel backup-panel"><h2>Local data & backup</h2><p>All roster data is stored in this browser using IndexedDB. It is not uploaded to this app’s server.</p><div className="actions"><button className="primary" onClick={exportBackup}>Export backup</button><input ref={restoreRef} className="file-input" type="file" accept="application/json,.json" onChange={(e) => restoreBackup(e.target.files?.[0])} /><button className="secondary" onClick={() => restoreRef.current?.click()}>Restore backup</button></div><div className="warning"><strong>Important:</strong> clearing this browser’s site data will remove local records unless you have exported a backup.</div></section>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function StatusPill({ status }: { status: SendStatus }) {
  return <span className={`status status-${status}`}>{status}</span>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
