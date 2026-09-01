"use client";

import { useRef, useState } from "react";
import { db } from "@/lib/db";
import type { GeneralBackupPayload } from "@/lib/types";

const now = () => new Date().toISOString();

export default function GeneralBackupPage() {
  const [notice, setNotice] = useState("");
  const restoreRef = useRef<HTMLInputElement>(null);

  async function exportBackup() {
    const payload: GeneralBackupPayload = {
      version: 1,
      exportedAt: now(),
      campaigns: await db.generalCampaigns.toArray(),
      recipients: await db.generalRecipients.toArray(),
      sendRecords: await db.generalSendRecords.toArray(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `volunteer-message-tool-general-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("General-message backup exported.");
  }

  async function restoreBackup(file?: File) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as GeneralBackupPayload;
      if (payload.version !== 1 || !Array.isArray(payload.campaigns) || !Array.isArray(payload.recipients) || !Array.isArray(payload.sendRecords)) {
        throw new Error("Unsupported general-message backup file.");
      }
      await db.transaction("rw", db.generalCampaigns, db.generalRecipients, db.generalSendRecords, async () => {
        await Promise.all([db.generalCampaigns.clear(), db.generalRecipients.clear(), db.generalSendRecords.clear()]);
        if (payload.campaigns.length) await db.generalCampaigns.bulkAdd(payload.campaigns);
        if (payload.recipients.length) await db.generalRecipients.bulkAdd(payload.recipients);
        if (payload.sendRecords.length) await db.generalSendRecords.bulkAdd(payload.sendRecords);
      });
      setNotice(`Restored ${payload.campaigns.length} general message${payload.campaigns.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "General-message restore failed.");
    } finally {
      if (restoreRef.current) restoreRef.current.value = "";
    }
  }

  return (
    <main className="general-page general-backup-page">
      <header className="general-header">
        <div><p className="eyebrow">Standalone messaging</p><h1>General Message Backup</h1><p className="muted">Back up standalone campaigns, temporary recipient lists and their send history separately from event data.</p></div>
        <a className="secondary general-back" href="/general">Back to messages</a>
      </header>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>x</button></div>}

      <section className="panel backup-panel">
        <h2>Local general-message data</h2>
        <p>General messages are stored in this browser using IndexedDB. Export a backup before clearing browser data or moving to another device.</p>
        <div className="actions">
          <button className="primary" onClick={exportBackup}>Export general backup</button>
          <input ref={restoreRef} className="file-input" type="file" accept="application/json,.json" onChange={(event) => restoreBackup(event.target.files?.[0])} />
          <button className="secondary" onClick={() => restoreRef.current?.click()}>Restore general backup</button>
        </div>
        <div className="warning"><strong>Restore replaces general-message data only.</strong> Events, event rosters, shifts and event campaigns are left unchanged.</div>
      </section>
    </main>
  );
}
