"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { db } from "@/lib/db";
import { parseRoster } from "@/lib/import";
import { DEFAULT_TEMPLATE, renderMessage } from "@/lib/message";
import { normalizePhone, whatsappUrl } from "@/lib/phone";
import type {
  AssignmentRecord,
  BackupPayload,
  CampaignAudienceType,
  CampaignRecord,
  EventRecord,
  LegacyBackupPayload,
  SendRecord,
  SendStatus,
  ShiftRecord,
  VolunteerRecord,
} from "@/lib/types";

type Tab = "shifts" | "roster" | "messages" | "send" | "backup";

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const normalizeShiftName = (value: string) => value.trim().toLowerCase();

export default function Home() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerRecord[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [sendRecords, setSendRecords] = useState<SendRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [tab, setTab] = useState<Tab>("roster");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [eventForm, setEventForm] = useState({ name: "", date: "", time: "", venue: "" });
  const [shiftForm, setShiftForm] = useState({ name: "", date: "", startTime: "", endTime: "", reportingTime: "", venue: "", notes: "" });
  const [newVolunteer, setNewVolunteer] = useState({ name: "", phone: "", role: "", shiftId: "" });
  const [importShiftId, setImportShiftId] = useState("");
  const [campaignName, setCampaignName] = useState("Event details");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [audienceType, setAudienceType] = useState<CampaignAudienceType>("event");
  const [campaignShiftId, setCampaignShiftId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  async function refresh(preferredEventId?: string, preferredCampaignId?: string) {
    const [allEvents, allShifts, allVolunteers, allAssignments, allCampaigns, allSendRecords] = await Promise.all([
      db.events.orderBy("date").reverse().toArray(),
      db.shifts.toArray(),
      db.volunteers.toArray(),
      db.assignments.toArray(),
      db.campaigns.toArray(),
      db.sendRecords.toArray(),
    ]);
    setEvents(allEvents);
    setShifts(allShifts);
    setVolunteers(allVolunteers);
    setAssignments(allAssignments);
    setCampaigns(allCampaigns);
    setSendRecords(allSendRecords);

    const nextEvent = preferredEventId || selectedEventId || allEvents.find((event) => event.status === "active")?.id || allEvents[0]?.id || "";
    setSelectedEventId(nextEvent);
    const eventCampaigns = allCampaigns.filter((campaign) => campaign.eventId === nextEvent);
    const nextCampaign = preferredCampaignId || (selectedCampaignId && eventCampaigns.some((campaign) => campaign.id === selectedCampaignId) ? selectedCampaignId : eventCampaigns[0]?.id || "");
    setSelectedCampaignId(nextCampaign);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const eventShifts = useMemo(() => shifts.filter((shift) => shift.eventId === selectedEventId).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)), [shifts, selectedEventId]);
  const eventVolunteers = useMemo(() => volunteers.filter((volunteer) => volunteer.eventId === selectedEventId), [volunteers, selectedEventId]);
  const eventAssignments = useMemo(() => assignments.filter((assignment) => assignment.eventId === selectedEventId), [assignments, selectedEventId]);
  const eventCampaigns = useMemo(() => campaigns.filter((campaign) => campaign.eventId === selectedEventId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [campaigns, selectedEventId]);
  const selectedCampaign = eventCampaigns.find((campaign) => campaign.id === selectedCampaignId);

  useEffect(() => {
    if (!selectedEvent) return;
    setShiftForm((current) => ({ ...current, date: current.date || selectedEvent.date, startTime: current.startTime || selectedEvent.time, reportingTime: current.reportingTime || selectedEvent.time, venue: current.venue || selectedEvent.venue }));
  }, [selectedEvent?.id]);

  useEffect(() => {
    const firstShift = eventShifts[0]?.id || "";
    if (!newVolunteer.shiftId || !eventShifts.some((shift) => shift.id === newVolunteer.shiftId)) setNewVolunteer((current) => ({ ...current, shiftId: firstShift }));
    if (!importShiftId || !eventShifts.some((shift) => shift.id === importShiftId)) setImportShiftId(firstShift);
  }, [selectedEventId, eventShifts.length]);

  useEffect(() => {
    if (!selectedCampaign) return;
    setCampaignName(selectedCampaign.name);
    setTemplate(selectedCampaign.template);
    setAudienceType(selectedCampaign.audienceType || "event");
    setCampaignShiftId(selectedCampaign.shiftId || eventShifts[0]?.id || "");
  }, [selectedCampaign?.id, eventShifts.length]);

  function assignmentFor(volunteerId: string, shiftId?: string) {
    if (shiftId) return eventAssignments.find((assignment) => assignment.volunteerId === volunteerId && assignment.shiftId === shiftId);
    const matches = eventAssignments.filter((assignment) => assignment.volunteerId === volunteerId);
    return matches.length === 1 ? matches[0] : undefined;
  }

  function shiftForCampaign(campaign: CampaignRecord | undefined, volunteerId: string) {
    if (!campaign) return undefined;
    if (campaign.audienceType === "shift" && campaign.shiftId) return eventShifts.find((shift) => shift.id === campaign.shiftId);
    const assignment = assignmentFor(volunteerId);
    return assignment ? eventShifts.find((shift) => shift.id === assignment.shiftId) : undefined;
  }

  function eligibleVolunteerIds(campaign: CampaignRecord | undefined): string[] {
    if (!campaign) return [];
    if (campaign.status === "closed" && campaign.recipientIds) return campaign.recipientIds;
    if (campaign.audienceType === "shift" && campaign.shiftId) {
      return [...new Set(eventAssignments.filter((assignment) => assignment.shiftId === campaign.shiftId).map((assignment) => assignment.volunteerId))];
    }
    return eventVolunteers.map((volunteer) => volunteer.id);
  }

  const campaignVolunteerIds = useMemo(() => eligibleVolunteerIds(selectedCampaign), [selectedCampaign, eventAssignments, eventVolunteers]);
  const campaignVolunteers = campaignVolunteerIds.map((volunteerId) => eventVolunteers.find((volunteer) => volunteer.id === volunteerId)).filter(Boolean) as VolunteerRecord[];
  const recordsByVolunteer = useMemo(() => {
    const map = new Map<string, SendRecord>();
    if (!selectedCampaign) return map;
    sendRecords.filter((record) => record.campaignId === selectedCampaign.id).forEach((record) => map.set(record.volunteerId, record));
    return map;
  }, [sendRecords, selectedCampaign]);

  const counts = campaignVolunteers.reduce((acc, volunteer) => {
    const status = recordsByVolunteer.get(volunteer.id)?.status || "pending";
    acc[status] += 1;
    return acc;
  }, { pending: 0, opened: 0, sent: 0, skipped: 0, error: 0 } as Record<SendStatus, number>);

  const filteredVolunteers = eventVolunteers.filter((volunteer) => {
    const q = search.toLowerCase();
    const volunteerAssignments = eventAssignments.filter((assignment) => assignment.volunteerId === volunteer.id);
    const matchesShift = shiftFilter === "all" || volunteerAssignments.some((assignment) => assignment.shiftId === shiftFilter);
    return matchesShift && (!q || `${volunteer.name} ${volunteer.phone} ${volunteerAssignments.map((a) => a.role).join(" ")}`.toLowerCase().includes(q));
  });

  async function createEvent(event: FormEvent) {
    event.preventDefault();
    if (!eventForm.name || !eventForm.date) return setNotice("Event name and date are required.");
    const eventId = id();
    const createdAt = now();
    const record: EventRecord = { id: eventId, ...eventForm, status: "active", createdAt };
    const mainShift: ShiftRecord = { id: id(), eventId, name: "Main Shift", date: eventForm.date, startTime: eventForm.time, endTime: "", reportingTime: eventForm.time, venue: eventForm.venue, notes: "", createdAt };
    await db.transaction("rw", db.events, db.shifts, async () => {
      await db.events.add(record);
      await db.shifts.add(mainShift);
    });
    setEventForm({ name: "", date: "", time: "", venue: "" });
    setNotice("Event created with a Main Shift. You can rename or add shifts from the Shifts tab.");
    await refresh(eventId);
  }

  async function archiveEvent() {
    if (!selectedEvent) return;
    await db.events.update(selectedEvent.id, { status: selectedEvent.status === "active" ? "archived" : "active" });
    setNotice(selectedEvent.status === "active" ? "Event archived." : "Event restored.");
    await refresh(selectedEvent.id);
  }

  async function createShift(event: FormEvent) {
    event.preventDefault();
    if (!selectedEvent || !shiftForm.name || !shiftForm.date) return setNotice("Shift name and date are required.");
    const duplicate = eventShifts.some((shift) => normalizeShiftName(shift.name) === normalizeShiftName(shiftForm.name));
    if (duplicate) return setNotice("A shift with that name already exists for this event.");
    await db.shifts.add({ id: id(), eventId: selectedEvent.id, ...shiftForm, createdAt: now() });
    setShiftForm({ name: "", date: selectedEvent.date, startTime: selectedEvent.time, endTime: "", reportingTime: selectedEvent.time, venue: selectedEvent.venue, notes: "" });
    setNotice("Shift added.");
    await refresh(selectedEvent.id, selectedCampaignId);
  }

  async function removeShift(shift: ShiftRecord) {
    const linkedAssignments = eventAssignments.filter((assignment) => assignment.shiftId === shift.id);
    const linkedCampaigns = eventCampaigns.filter((campaign) => campaign.shiftId === shift.id);
    if (linkedAssignments.length || linkedCampaigns.length) return setNotice("This shift is in use. Reassign its volunteers and campaigns before removing it.");
    await db.shifts.delete(shift.id);
    setNotice("Shift removed.");
    await refresh(selectedEventId, selectedCampaignId);
  }

  async function addVolunteer(event: FormEvent) {
    event.preventDefault();
    if (!selectedEvent || !newVolunteer.shiftId) return setNotice("Choose a shift first.");
    const phone = normalizePhone(newVolunteer.phone);
    if (!newVolunteer.name || !phone) return setNotice("Enter a volunteer name and valid phone number.");
    const existing = eventVolunteers.find((volunteer) => volunteer.phone === phone);
    if (existing) {
      if (eventAssignments.some((assignment) => assignment.volunteerId === existing.id && assignment.shiftId === newVolunteer.shiftId)) return setNotice("That volunteer is already assigned to this shift.");
      await db.assignments.add({ id: id(), eventId: selectedEvent.id, shiftId: newVolunteer.shiftId, volunteerId: existing.id, role: newVolunteer.role.trim(), createdAt: now() });
      setNotice(`${existing.name} assigned to an additional shift.`);
    } else {
      const volunteerId = id();
      await db.transaction("rw", db.volunteers, db.assignments, async () => {
        await db.volunteers.add({ id: volunteerId, eventId: selectedEvent.id, name: newVolunteer.name.trim(), phone, role: "", fields: {}, createdAt: now() });
        await db.assignments.add({ id: id(), eventId: selectedEvent.id, shiftId: newVolunteer.shiftId, volunteerId, role: newVolunteer.role.trim(), createdAt: now() });
      });
      setNotice("Volunteer added.");
    }
    setNewVolunteer((current) => ({ ...current, name: "", phone: "", role: "" }));
    await refresh(selectedEvent.id, selectedCampaignId);
  }

  async function importRoster(file?: File) {
    if (!selectedEvent || !file) return;
    try {
      const rows = await parseRoster(file);
      const shiftByName = new Map(eventShifts.map((shift) => [normalizeShiftName(shift.name), shift.id]));
      const volunteerByPhone = new Map(eventVolunteers.map((volunteer) => [volunteer.phone, volunteer]));
      const assignmentKeys = new Set(eventAssignments.map((assignment) => `${assignment.volunteerId}:${assignment.shiftId}`));
      let addedPeople = 0;
      let addedAssignments = 0;
      let skipped = 0;
      const unknownShifts = new Set<string>();

      await db.transaction("rw", db.volunteers, db.assignments, async () => {
        for (const row of rows) {
          const phone = normalizePhone(row.phone);
          const targetShiftId = row.shift ? shiftByName.get(normalizeShiftName(row.shift)) : importShiftId;
          if (row.shift && !targetShiftId) unknownShifts.add(row.shift);
          if (!row.name || !phone || !targetShiftId) { skipped += 1; continue; }

          let volunteer = volunteerByPhone.get(phone);
          if (!volunteer) {
            volunteer = { id: id(), eventId: selectedEvent.id, name: row.name.trim(), phone, role: "", fields: row.fields, createdAt: now() };
            await db.volunteers.add(volunteer);
            volunteerByPhone.set(phone, volunteer);
            addedPeople += 1;
          }
          const key = `${volunteer.id}:${targetShiftId}`;
          if (assignmentKeys.has(key)) { skipped += 1; continue; }
          await db.assignments.add({ id: id(), eventId: selectedEvent.id, shiftId: targetShiftId, volunteerId: volunteer.id, role: row.role, createdAt: now() });
          assignmentKeys.add(key);
          addedAssignments += 1;
        }
      });

      const unknown = unknownShifts.size ? ` Unknown shifts: ${[...unknownShifts].join(", ")}.` : "";
      setNotice(`Imported ${addedPeople} new volunteer${addedPeople === 1 ? "" : "s"} and ${addedAssignments} shift assignment${addedAssignments === 1 ? "" : "s"}; skipped ${skipped}.${unknown}`);
      await refresh(selectedEvent.id, selectedCampaignId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Roster import failed.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAssignment(assignment: AssignmentRecord) {
    await db.assignments.delete(assignment.id);
    setNotice("Shift assignment removed.");
    await refresh(selectedEventId, selectedCampaignId);
  }

  async function removeVolunteer(volunteer: VolunteerRecord) {
    await db.transaction("rw", db.volunteers, db.assignments, db.sendRecords, async () => {
      await db.assignments.where("volunteerId").equals(volunteer.id).delete();
      await db.sendRecords.where("volunteerId").equals(volunteer.id).delete();
      await db.volunteers.delete(volunteer.id);
    });
    setNotice(`${volunteer.name} removed from the event.`);
    await refresh(selectedEventId, selectedCampaignId);
  }

  function newCampaign() {
    setSelectedCampaignId("");
    setCampaignName("Event details");
    setTemplate(DEFAULT_TEMPLATE);
    setAudienceType("event");
    setCampaignShiftId(eventShifts[0]?.id || "");
  }

  async function saveCampaign() {
    if (!selectedEvent) return;
    if (audienceType === "shift" && !campaignShiftId) return setNotice("Choose a target shift.");
    const timestamp = now();
    if (selectedCampaign) {
      if (selectedCampaign.status === "closed") return setNotice("Reopen this campaign before editing it.");
      await db.campaigns.update(selectedCampaign.id, { name: campaignName.trim() || "Untitled message", template, audienceType, shiftId: audienceType === "shift" ? campaignShiftId : undefined, updatedAt: timestamp });
      setNotice("Message updated.");
      await refresh(selectedEvent.id, selectedCampaign.id);
    } else {
      const campaignId = id();
      await db.campaigns.add({ id: campaignId, eventId: selectedEvent.id, name: campaignName.trim() || "Untitled message", template, audienceType, shiftId: audienceType === "shift" ? campaignShiftId : undefined, status: "active", createdAt: timestamp, updatedAt: timestamp });
      setNotice("Message created.");
      await refresh(selectedEvent.id, campaignId);
    }
  }

  async function toggleCampaignClosed(campaign: CampaignRecord) {
    if (campaign.status === "active") {
      const recipientIds = eligibleVolunteerIds(campaign);
      await db.campaigns.update(campaign.id, { status: "closed", recipientIds, updatedAt: now() });
      setNotice("Campaign closed. Its recipient list is now frozen.");
    } else {
      await db.campaigns.update(campaign.id, { status: "active", recipientIds: undefined, updatedAt: now() });
      setNotice("Campaign reopened. Eligible late additions will now appear again.");
    }
    await refresh(selectedEventId, campaign.id);
  }

  async function deleteCampaign(campaign: CampaignRecord) {
    await db.transaction("rw", db.campaigns, db.sendRecords, async () => {
      await db.sendRecords.where("campaignId").equals(campaign.id).delete();
      await db.campaigns.delete(campaign.id);
    });
    setNotice("Message campaign deleted.");
    await refresh(selectedEventId);
  }

  async function setSendStatus(volunteer: VolunteerRecord, status: SendStatus) {
    if (!selectedCampaign || !selectedEvent) return;
    const existing = recordsByVolunteer.get(volunteer.id);
    const timestamp = now();
    const payload: SendRecord = {
      id: existing?.id || id(), eventId: selectedEvent.id, campaignId: selectedCampaign.id, volunteerId: volunteer.id, status,
      openedAt: status === "opened" || status === "sent" ? existing?.openedAt || timestamp : existing?.openedAt,
      sentAt: status === "sent" ? timestamp : existing?.sentAt, updatedAt: timestamp,
    };
    await db.sendRecords.put(payload);
    await refresh(selectedEvent.id, selectedCampaign.id);
  }

  async function openWhatsApp(volunteer: VolunteerRecord) {
    if (!selectedCampaign || !selectedEvent) return;
    const shift = shiftForCampaign(selectedCampaign, volunteer.id);
    const assignment = assignmentFor(volunteer.id, shift?.id);
    const message = renderMessage(selectedCampaign.template, selectedEvent, volunteer, shift, assignment);
    await setSendStatus(volunteer, "opened");
    window.open(whatsappUrl(volunteer.phone, message), "_blank", "noopener,noreferrer");
  }

  async function exportBackup() {
    const payload: BackupPayload = {
      version: 2, exportedAt: now(), events: await db.events.toArray(), shifts: await db.shifts.toArray(), volunteers: await db.volunteers.toArray(), assignments: await db.assignments.toArray(), campaigns: await db.campaigns.toArray(), sendRecords: await db.sendRecords.toArray(),
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
      const raw = JSON.parse(await file.text()) as BackupPayload | LegacyBackupPayload;
      if (!Array.isArray(raw.events) || !Array.isArray(raw.volunteers)) throw new Error("Unsupported backup file.");
      let payload: BackupPayload;
      if (raw.version === 2) {
        payload = raw;
      } else if (raw.version === 1) {
        const legacy = raw as LegacyBackupPayload;
        const restoredAt = now();
        const legacyShifts = legacy.events.map((event) => ({ id: `restored-main-${event.id}`, eventId: event.id, name: "Main Shift", date: event.date, startTime: event.time, endTime: "", reportingTime: event.time, venue: event.venue, notes: "Restored from a version 1 backup.", createdAt: restoredAt }));
        payload = {
          version: 2, exportedAt: legacy.exportedAt, events: legacy.events, shifts: legacyShifts, volunteers: legacy.volunteers,
          assignments: legacy.volunteers.map((volunteer) => ({ id: `restored-assignment-${volunteer.id}`, eventId: volunteer.eventId, shiftId: `restored-main-${volunteer.eventId}`, volunteerId: volunteer.id, role: volunteer.role || "", createdAt: volunteer.createdAt || restoredAt })),
          campaigns: legacy.campaigns.map((campaign) => ({ ...campaign, audienceType: "event", status: "active" })), sendRecords: legacy.sendRecords,
        };
      } else throw new Error("Unsupported backup version.");

      await db.transaction("rw", db.events, db.shifts, db.volunteers, db.assignments, db.campaigns, db.sendRecords, async () => {
        await Promise.all([db.events.clear(), db.shifts.clear(), db.volunteers.clear(), db.assignments.clear(), db.campaigns.clear(), db.sendRecords.clear()]);
        await db.events.bulkAdd(payload.events); await db.shifts.bulkAdd(payload.shifts); await db.volunteers.bulkAdd(payload.volunteers); await db.assignments.bulkAdd(payload.assignments); await db.campaigns.bulkAdd(payload.campaigns); await db.sendRecords.bulkAdd(payload.sendRecords);
      });
      setNotice("Backup restored.");
      await refresh(payload.events[0]?.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Backup restore failed.");
    } finally {
      if (restoreRef.current) restoreRef.current.value = "";
    }
  }

  function campaignProgress(campaign: CampaignRecord) {
    const ids = eligibleVolunteerIds(campaign);
    const records = sendRecords.filter((record) => record.campaignId === campaign.id && ids.includes(record.volunteerId));
    const sent = records.filter((record) => record.status === "sent").length;
    return `${sent}/${ids.length}`;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">VM</div><div><strong>Volunteer Message Tool</strong><span>Local-first WhatsApp assistant</span></div></div>
        <form className="event-form" onSubmit={createEvent}>
          <h2>New event</h2>
          <input placeholder="Event name" value={eventForm.name} onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} />
          <div className="field-row"><input type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} /><input type="time" value={eventForm.time} onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })} /></div>
          <input placeholder="Venue" value={eventForm.venue} onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })} />
          <button className="primary" type="submit">Create event</button>
        </form>
        <div className="event-list"><h2>Events</h2>{events.length === 0 && <p className="muted">Create your first event to begin.</p>}{events.map((event) => <button key={event.id} className={`event-item ${event.id === selectedEventId ? "selected" : ""}`} onClick={() => { setSelectedEventId(event.id); setSelectedCampaignId(""); }}><span>{event.name}</span><small>{event.date} · {event.status}</small></button>)}</div>
      </aside>

      <section className="workspace">
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
        {!selectedEvent ? <div className="empty-state"><h1>Start with an event</h1><p>Create an event, then configure shifts, upload a roster and prepare WhatsApp messages.</p></div> : <>
          <header className="event-header"><div><p className="eyebrow">{selectedEvent.status}</p><h1>{selectedEvent.name}</h1><p>{selectedEvent.date}{selectedEvent.time ? ` · ${selectedEvent.time}` : ""}{selectedEvent.venue ? ` · ${selectedEvent.venue}` : ""}</p></div><button className="secondary" onClick={archiveEvent}>{selectedEvent.status === "active" ? "Archive event" : "Restore event"}</button></header>
          <nav className="tabs">{(["shifts", "roster", "messages", "send", "backup"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "send" ? "Send queue" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav>

          {tab === "shifts" && <div className="stack">
            <section className="panel"><h2>Add shift</h2><form className="shift-form" onSubmit={createShift}><input placeholder="Shift name" value={shiftForm.name} onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} /><input type="date" value={shiftForm.date} onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })} /><input type="time" title="Start time" value={shiftForm.startTime} onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })} /><input type="time" title="End time" value={shiftForm.endTime} onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })} /><input type="time" title="Reporting time" value={shiftForm.reportingTime} onChange={(e) => setShiftForm({ ...shiftForm, reportingTime: e.target.value })} /><input placeholder="Venue" value={shiftForm.venue} onChange={(e) => setShiftForm({ ...shiftForm, venue: e.target.value })} /><input placeholder="Notes (optional)" value={shiftForm.notes} onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })} /><button className="primary" type="submit">Add shift</button></form></section>
            <section className="card-grid">{eventShifts.map((shift) => { const count = new Set(eventAssignments.filter((assignment) => assignment.shiftId === shift.id).map((assignment) => assignment.volunteerId)).size; return <article className="panel shift-card" key={shift.id}><div><h2>{shift.name}</h2><p>{shift.date} · {shift.startTime || "Time not set"}{shift.endTime ? `–${shift.endTime}` : ""}</p><p className="muted">Report {shift.reportingTime || "—"} · {shift.venue || selectedEvent.venue || "Venue not set"}</p><strong>{count} volunteer{count === 1 ? "" : "s"}</strong></div><button className="text-button danger" onClick={() => removeShift(shift)}>Remove</button></article>; })}</section>
          </div>}

          {tab === "roster" && <div className="stack">
            <section className="panel split"><div><h2>Roster</h2><p className="muted">Upload CSV/XLSX. If a Shift column is present it is matched by shift name; otherwise rows go to the fallback shift selected here.</p></div><div className="actions"><select value={importShiftId} onChange={(e) => setImportShiftId(e.target.value)}>{eventShifts.map((shift) => <option key={shift.id} value={shift.id}>Fallback: {shift.name}</option>)}</select><input ref={fileRef} className="file-input" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => importRoster(e.target.files?.[0])} /><button className="secondary" onClick={() => fileRef.current?.click()}>Upload roster</button></div></section>
            <section className="panel"><form className="inline-form roster-add" onSubmit={addVolunteer}><input placeholder="Name" value={newVolunteer.name} onChange={(e) => setNewVolunteer({ ...newVolunteer, name: e.target.value })} /><input placeholder="Phone" value={newVolunteer.phone} onChange={(e) => setNewVolunteer({ ...newVolunteer, phone: e.target.value })} /><select value={newVolunteer.shiftId} onChange={(e) => setNewVolunteer({ ...newVolunteer, shiftId: e.target.value })}>{eventShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select><input placeholder="Role for this shift" value={newVolunteer.role} onChange={(e) => setNewVolunteer({ ...newVolunteer, role: e.target.value })} /><button className="primary" type="submit">Add / assign</button></form></section>
            <section className="panel"><div className="table-toolbar"><strong>{eventVolunteers.length} volunteer{eventVolunteers.length === 1 ? "" : "s"}</strong><div className="actions"><select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)}><option value="all">All shifts</option>{eventShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select><input className="search" placeholder="Search roster" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Shift assignments</th><th></th></tr></thead><tbody>{filteredVolunteers.map((volunteer) => { const volunteerAssignments = eventAssignments.filter((assignment) => assignment.volunteerId === volunteer.id); return <tr key={volunteer.id}><td>{volunteer.name}</td><td>{volunteer.phone}</td><td><div className="assignment-list">{volunteerAssignments.map((assignment) => { const shift = eventShifts.find((item) => item.id === assignment.shiftId); return <span className="assignment-chip" key={assignment.id}>{shift?.name || "Unknown shift"}{assignment.role ? ` · ${assignment.role}` : ""}<button title="Remove assignment" onClick={() => removeAssignment(assignment)}>×</button></span>; })}</div></td><td><button className="text-button danger" onClick={() => removeVolunteer(volunteer)}>Remove person</button></td></tr>; })}</tbody></table></div></section>
          </div>}

          {tab === "messages" && <div className="campaign-layout">
            <section className="panel campaign-list"><div className="split"><div><h2>Messages</h2><p className="muted">Each message has its own audience and send history.</p></div><button className="primary" onClick={newCampaign}>+ New message</button></div>{eventCampaigns.length === 0 && <p className="muted">No message campaigns yet.</p>}{eventCampaigns.map((campaign) => <button className={`campaign-item ${selectedCampaignId === campaign.id ? "selected" : ""}`} key={campaign.id} onClick={() => setSelectedCampaignId(campaign.id)}><span><strong>{campaign.name}</strong><small>{campaign.audienceType === "shift" ? eventShifts.find((shift) => shift.id === campaign.shiftId)?.name || "Unknown shift" : "All volunteers"} · {campaign.status}</small></span><b>{campaignProgress(campaign)} sent</b></button>)}</section>
            <section className="panel message-editor"><div className="split"><div><h2>{selectedCampaign ? "Edit message" : "New message"}</h2>{selectedCampaign && <p className="muted">Status: {selectedCampaign.status}</p>}</div>{selectedCampaign && <div className="actions"><button className="secondary" onClick={() => toggleCampaignClosed(selectedCampaign)}>{selectedCampaign.status === "active" ? "Close campaign" : "Reopen campaign"}</button><button className="text-button danger" onClick={() => deleteCampaign(selectedCampaign)}>Delete</button></div>}</div><label>Campaign name<input disabled={selectedCampaign?.status === "closed"} value={campaignName} onChange={(e) => setCampaignName(e.target.value)} /></label><label>Audience<select disabled={selectedCampaign?.status === "closed"} value={audienceType} onChange={(e) => setAudienceType(e.target.value as CampaignAudienceType)}><option value="event">All volunteers in event</option><option value="shift">One shift</option></select></label>{audienceType === "shift" && <label>Target shift<select disabled={selectedCampaign?.status === "closed"} value={campaignShiftId} onChange={(e) => setCampaignShiftId(e.target.value)}>{eventShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select></label>}<label>Template<textarea disabled={selectedCampaign?.status === "closed"} rows={13} value={template} onChange={(e) => setTemplate(e.target.value)} /></label><p className="muted">Variables: {"{{first_name}}"}, {"{{event_name}}"}, {"{{date}}"}, {"{{venue}}"}, {"{{role}}"}, {"{{shift_name}}"}, {"{{shift_date}}"}, {"{{shift_start}}"}, {"{{shift_end}}"}, {"{{reporting_time}}"}, {"{{shift_venue}}"}, plus spreadsheet fields.</p><button className="primary" disabled={selectedCampaign?.status === "closed"} onClick={saveCampaign}>{selectedCampaign ? "Save changes" : "Create message"}</button><div className="preview"><h2>Preview</h2>{eventVolunteers[0] ? <pre>{renderMessage(template, selectedEvent, eventVolunteers[0], audienceType === "shift" ? eventShifts.find((shift) => shift.id === campaignShiftId) : shiftForCampaign(selectedCampaign, eventVolunteers[0].id), assignmentFor(eventVolunteers[0].id, audienceType === "shift" ? campaignShiftId : undefined))}</pre> : <p className="muted">Add a volunteer to preview personalisation.</p>}</div></section>
          </div>}

          {tab === "send" && <div className="stack">
            <section className="panel split"><div><h2>Send queue</h2><p className="muted">Choose a message campaign. Statuses are independent for every campaign.</p></div><select value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}><option value="">Select message</option>{eventCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></section>
            {!selectedCampaign ? <section className="panel"><p className="muted">Create or select a message campaign first.</p><button className="primary" onClick={() => setTab("messages")}>Go to messages</button></section> : <><section className="metrics"><Metric label="Pending" value={counts.pending} /><Metric label="Opened" value={counts.opened} /><Metric label="Sent" value={counts.sent} /><Metric label="Skipped / error" value={counts.skipped + counts.error} /></section><section className="panel campaign-summary"><strong>{selectedCampaign.name}</strong><span>{selectedCampaign.audienceType === "shift" ? eventShifts.find((shift) => shift.id === selectedCampaign.shiftId)?.name : "All volunteers"} · {selectedCampaign.status} · {campaignVolunteers.length} recipients</span></section>{campaignVolunteers.length === 0 ? <section className="panel"><p className="muted">No eligible volunteers for this campaign.</p></section> : <section className="queue">{campaignVolunteers.map((volunteer, index) => { const status = recordsByVolunteer.get(volunteer.id)?.status || "pending"; const shift = shiftForCampaign(selectedCampaign, volunteer.id); const assignment = assignmentFor(volunteer.id, shift?.id); return <article className="queue-card" key={volunteer.id}><div className="queue-number">{index + 1}</div><div className="queue-main"><div className="queue-head"><div><h3>{volunteer.name}</h3><p>{volunteer.phone}{shift ? ` · ${shift.name}` : ""}{assignment?.role ? ` · ${assignment.role}` : ""}</p></div><StatusPill status={status} /></div><pre>{renderMessage(selectedCampaign.template, selectedEvent, volunteer, shift, assignment)}</pre><div className="actions"><button className="whatsapp" onClick={() => openWhatsApp(volunteer)}>Open in WhatsApp</button><button className="secondary" onClick={() => setSendStatus(volunteer, "sent")}>Mark sent</button><button className="text-button" onClick={() => setSendStatus(volunteer, "skipped")}>Skip</button><button className="text-button danger" onClick={() => setSendStatus(volunteer, "error")}>Error</button></div></div></article>; })}</section>}</>}
            <p className="muted">Active campaigns automatically include new eligible volunteers. Closing a campaign freezes its recipient list. “Sent” remains staff-confirmed because the click-to-chat handoff cannot verify WhatsApp delivery.</p>
          </div>}

          {tab === "backup" && <section className="panel backup-panel"><h2>Local data & backup</h2><p>All roster, shift, campaign and send-history data is stored in this browser using IndexedDB.</p><div className="actions"><button className="primary" onClick={exportBackup}>Export backup</button><input ref={restoreRef} className="file-input" type="file" accept="application/json,.json" onChange={(e) => restoreBackup(e.target.files?.[0])} /><button className="secondary" onClick={() => restoreRef.current?.click()}>Restore backup</button></div><div className="warning"><strong>Important:</strong> clearing this browser’s site data will remove local records unless you have exported a backup. Version 1 backups remain restorable.</div></section>}
        </>}
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
