"use client";

import { useRef, useState } from "react";
import { db } from "@/lib/db";
import type { BackupPayload, LegacyBackupPayload } from "@/lib/types";

const FORMAT = "volunteer-message-tool-backup";
const VERSION = 3;
const STORAGE_PREFIX = "volmessagetool-";

type FullBackupPayload = {
  format: typeof FORMAT;
  version: typeof VERSION;
  exportedAt: string;
  stores: Record<string, unknown[]>;
  localStorage: Record<string, string>;
};

type RestoreResult = {
  kind: "full" | "legacy";
};

function collectLocalStorage(): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) values[key] = value;
  }
  return values;
}

async function createFullBackup(): Promise<FullBackupPayload> {
  const entries = await Promise.all(
    db.tables.map(async (table) => [table.name, await table.toArray()] as const),
  );

  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    stores: Object.fromEntries(entries),
    localStorage: collectLocalStorage(),
  };
}

async function encodeBackup(payload: FullBackupPayload): Promise<Blob> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));

  if (typeof CompressionStream === "undefined") {
    return new Blob([bytes], { type: "application/json" });
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(stream).arrayBuffer()], { type: "application/gzip" });
}

async function decodeBackup(file: File): Promise<unknown> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const gzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (gzip) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("This browser cannot open compressed backups. Use a current browser or restore on the device that created the backup.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text()) as unknown;
  }

  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function isFullBackup(value: unknown): value is FullBackupPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FullBackupPayload>;
  return candidate.format === FORMAT
    && candidate.version === VERSION
    && Boolean(candidate.stores)
    && typeof candidate.stores === "object"
    && Boolean(candidate.localStorage)
    && typeof candidate.localStorage === "object";
}

async function restoreFullBackup(payload: FullBackupPayload): Promise<RestoreResult> {
  const currentTableNames = new Set(db.tables.map((table) => table.name));

  for (const [name, rows] of Object.entries(payload.stores)) {
    if (!currentTableNames.has(name)) continue;
    if (!Array.isArray(rows)) throw new Error(`Backup store "${name}" is invalid.`);
  }

  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
    for (const table of db.tables) {
      const rows = payload.stores[table.name];
      if (Array.isArray(rows) && rows.length) await table.bulkAdd(rows);
    }
  });

  const existingKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(STORAGE_PREFIX)) existingKeys.push(key);
  }
  existingKeys.forEach((key) => window.localStorage.removeItem(key));
  Object.entries(payload.localStorage).forEach(([key, value]) => {
    if (key.startsWith(STORAGE_PREFIX) && typeof value === "string") {
      window.localStorage.setItem(key, value);
    }
  });

  return { kind: "full" };
}

function upgradeLegacyBackup(raw: BackupPayload | LegacyBackupPayload): BackupPayload {
  if (raw.version === 2) return raw;

  const restoredAt = new Date().toISOString();
  const legacy = raw as LegacyBackupPayload;
  const shifts = legacy.events.map((event) => ({
    id: `restored-main-${event.id}`,
    eventId: event.id,
    name: "Main Shift",
    date: event.date,
    startTime: event.time,
    endTime: "",
    reportingTime: event.time,
    venue: event.venue,
    notes: "Restored from a version 1 backup.",
    createdAt: restoredAt,
  }));

  return {
    version: 2,
    exportedAt: legacy.exportedAt,
    events: legacy.events,
    shifts,
    volunteers: legacy.volunteers,
    assignments: legacy.volunteers.map((volunteer) => ({
      id: `restored-assignment-${volunteer.id}`,
      eventId: volunteer.eventId,
      shiftId: `restored-main-${volunteer.eventId}`,
      volunteerId: volunteer.id,
      role: volunteer.role || "",
      createdAt: volunteer.createdAt || restoredAt,
    })),
    campaigns: legacy.campaigns.map((campaign) => ({
      ...campaign,
      audienceType: "event",
      status: "active",
    })),
    sendRecords: legacy.sendRecords,
  };
}

async function restoreLegacyBackup(raw: unknown): Promise<RestoreResult> {
  if (!raw || typeof raw !== "object") throw new Error("Unsupported backup file.");
  const candidate = raw as { version?: unknown; events?: unknown; volunteers?: unknown };
  if ((candidate.version !== 1 && candidate.version !== 2)
    || !Array.isArray(candidate.events)
    || !Array.isArray(candidate.volunteers)) {
    throw new Error("Unsupported backup file.");
  }

  const payload = upgradeLegacyBackup(raw as BackupPayload | LegacyBackupPayload);

  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
    if (payload.events.length) await db.events.bulkAdd(payload.events);
    if (payload.shifts.length) await db.shifts.bulkAdd(payload.shifts);
    if (payload.volunteers.length) await db.volunteers.bulkAdd(payload.volunteers);
    if (payload.assignments.length) await db.assignments.bulkAdd(payload.assignments);
    if (payload.campaigns.length) await db.campaigns.bulkAdd(payload.campaigns);
    if (payload.sendRecords.length) await db.sendRecords.bulkAdd(payload.sendRecords);
  });

  return { kind: "legacy" };
}

export default function FullBackupTools() {
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportBackup() {
    setWorking(true);
    setStatus("Preparing full backup...");
    try {
      const payload = await createFullBackup();
      const blob = await encodeBackup(payload);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `volunteer-message-tool-${stamp}.vmtbackup`);
      const kb = Math.max(1, Math.round(blob.size / 1024));
      setStatus(`Backup downloaded (${kb} KB).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Backup export failed.");
    } finally {
      setWorking(false);
    }
  }

  async function restoreBackup(file?: File) {
    if (!file) return;
    setWorking(true);
    setStatus("Reading backup...");
    try {
      const raw = await decodeBackup(file);
      const result = isFullBackup(raw)
        ? await restoreFullBackup(raw)
        : await restoreLegacyBackup(raw);

      setStatus(result.kind === "full"
        ? "Full backup restored. Reloading..."
        : "Legacy backup restored. Reloading...");
      window.setTimeout(() => window.location.reload(), 150);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Backup restore failed.");
    } finally {
      setWorking(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="floating-backup-tools">
      <button
        className="floating-menu-action"
        type="button"
        disabled={working}
        onClick={() => void exportBackup()}
      >
        <span className="floating-menu-action-icon" aria-hidden="true">↓</span>
        <span>
          <strong>{working ? "Working..." : "Download backup"}</strong>
          <small>Save all local tool data</small>
        </span>
      </button>

      <input
        ref={fileRef}
        className="file-input"
        type="file"
        accept=".vmtbackup,.json,application/json,application/gzip"
        onChange={(event) => void restoreBackup(event.currentTarget.files?.[0])}
      />

      <button
        className="floating-menu-action"
        type="button"
        disabled={working}
        onClick={() => fileRef.current?.click()}
      >
        <span className="floating-menu-action-icon" aria-hidden="true">↑</span>
        <span>
          <strong>Restore backup</strong>
          <small>Replace local data from file</small>
        </span>
      </button>

      {status && <p className="floating-menu-status" role="status">{status}</p>}
    </div>
  );
}
