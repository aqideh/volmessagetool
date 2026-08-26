"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { db } from "@/lib/db";
import { parseRoster } from "@/lib/import";
import { DEFAULT_TEMPLATE, renderMessage, shiftVariablesUsed } from "@/lib/message";
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
type ShiftForm = Pick<ShiftRecord, "name" | "date" | "startTime" | "endTime" | "reportingTime" | "venue" | "notes">;
type AssignmentDraft = Pick<AssignmentRecord, "id" | "shiftId" | "role">;

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const normalizeShiftName = (value: string) => value.trim().toLowerCase();
const emptyShiftForm = (): ShiftForm => ({ name: "", date: "", startTime: "", endTime: "", reportingTime: "", venue: "", notes: "" });

function missingShiftFields(shift: ShiftForm): string[] {
  const missing: string[] = [];
  if (!shift.name.trim()) missing.push("name");
  if (!shift.date) missing.push("date");
  if (!shift.startTime) missing.push("start time");
  if (!shift.reportingTime) missing.push("reporting time");
  if (!shift.venue.trim()) missing.push("venue");
  return missing;
}

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
  const [shiftForm, setShiftForm] = useState<ShiftForm>(emptyShiftForm());
  const [editingShiftId, setEditingShiftId] = useState("");
  const [shiftEditForm, setShiftEditForm] = useState<ShiftForm>(emptyShiftForm());
  const [newVolunteer, setNewVolunteer] = useState({ name: "", phone: "", role: "", shiftId: "" });
  const [editingVolunteerId, setEditingVolunteerId] = useState("");
  const [assignmentDrafts, setAssignmentDrafts] = useState<AssignmentDraft[]>([]);
  const [newAssignment, setNewAssignment] = useState({ shiftId: "", role: "" });
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

    const nextEvent = preferredEventId || selectedEventId || allEvents.find((item) => item.status === "active")?.id || allEvents[0]?.id || "";
    setSelectedEventId(nextEvent);
    const nextEventCampaigns = allCampaigns.filter((campaign) => campaign.eventId === nextEvent);
    const nextCampaign = preferredCampaignId || (selectedCampaignId && nextEventCampaigns.some((campaign) => campaign.id === selectedCampaignId) ? selectedCampaignId : nextEventCampaigns[0]?.id || "");
    setSelectedCampaignId(nextCampaign);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const eventShifts = useMemo(
    () => shifts.filter((shift) => shift.eventId === selectedEventId).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)),
    [shifts, selectedEventId],
  );
  const eventVolunteers = useMemo(() => volunteers.filter((volunteer) => volunteer.eventId === selectedEventId), [volunteers, selectedEventId]);
  const eventAssignments = useMemo(() => assignments.filter((assignment) => assignment.eventId === selectedEventId), [assignments, selectedEventId]);
  const eventCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.eventId === selectedEventId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [campaigns, selectedEventId],
  );
  const selectedCampaign = eventCampaigns.find((campaign) => campaign.id === selectedCampaignId);

  useEffect(() => {
    setShiftForm(emptyShiftForm());
    setNewVolunteer((current) => ({ ...current, shiftId: "" }));
    setNewAssignment({ shiftId: "", role: "" });
    setEditingShiftId("");
    setEditingVolunteerId("");
  }, [selectedEventId]);

  useEffect(() => {
    if (!selectedCampaign) return;
    setCampaignName(selectedCampaign.name);
    setTemplate(selectedCampaign.template);
    setAudienceType(selectedCampaign.audienceType || "event");
    setCampaignShiftId(selectedCampaign.shiftId || "");
  }, [selectedCampaign?.id]);

  function assignmentFor(volunteerId: string, shiftId?: string) {
    if (!shiftId) return undefined;
    return eventAssignments.find((assignment) => assignment.volunteerId === volunteerId && assignment.shiftId === shiftId);
  }

  function shiftForCampaign(campaign: CampaignRecord | undefined) {
    if (!campaign || campaign.audienceType !== "shift" || !campaign.shiftId) return undefined;
    return eventShifts.find((shift) => shift.id === campaign.shiftId);
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
    return matchesShift && (!q || `${volunteer.name} ${volunteer.phone} ${volunteerAssignments.map((item) => item.role).join(" ")}`.toLowerCase().includes(q));
  });

  async function createEvent(event: FormEvent) {
    event.preventDefault();
    if (!eventForm.name || !eventForm.date) return setNotice("Event name and date are required.");
    const eventId = id();
    await db.events.add({ id: eventId, ...eventForm, status: "active", createdAt: now() });
    setEventForm({ name: "", date: "", time: "", venue: "" });
    setNotice("Event created. Add each shift explicitly from the Shifts tab.");
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
    if (!selectedEvent) return;
    const missing = missingShiftFields(shiftForm);
    if (missing.length) return setNotice(`Complete the shift before saving. Missing: ${missing.join(", ")}.`);
    const duplicate = eventShifts.some((shift) => normalizeShiftName(shift.name) === normalizeShiftName(shiftForm.name));
    if (duplicate) return setNotice("A shift with that name already exists for this event.");
    await db.shifts.add({ id: id(), eventId: selectedEvent.id, ...shiftForm, name: shiftForm.name.trim(), venue: shiftForm.venue.trim(), createdAt: now() });
    setShiftForm(emptyShiftForm());
    setNotice("Shift added.");
    await refresh(selectedEvent.id, selectedCampaignId);
  }

  function beginShiftEdit(shift: ShiftRecord) {
    setEditingShiftId(shift.id);
    setShiftEditForm({ name: shift.name, date: shift.date, startTime: shift.startTime, endTime: shift.endTime, reportingTime: shift.reportingTime, venue: shift.venue, notes: shift.notes });
  }

  async function saveShiftEdit(shiftId: string) {
    const missing = missingShiftFields(shiftEditForm);
    if (missing.length) return setNotice(`Complete the shift before saving. Missing: ${missing.join(", ")}.`);
    const duplicate = eventShifts.some((shift) => shift.id !== shiftId && normalizeShiftName(shift.name) === normalizeShiftName(shiftEditForm.name));
    if (duplicate) return setNotice("A shift with that name already exists for this event.");
    await db.shifts.update(shiftId, { ...shiftEditForm, name: shiftEditForm.name.trim(), venue: shiftEditForm.venue.trim() });
    setEditingShiftId("");
    setNotice("Shift details updated. Existing campaign links were preserved.");
    await refresh(selectedEventId, selectedCampaignId);
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
    if (!selectedEvent) return;
    if (!newVolunteer.shiftId) return setNotice("Choose a shift explicitly.");
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
    setNewVolunteer({ name: "", phone: "", role: "", shiftId: "" });
    await refresh(selectedEvent.id, selectedCampaignId);
  }

  async function importRoster(file?: File) {
    if (!selectedEvent || !file) return;
    try {
      const rows = await parseRoster(file);
      const shiftByName = new Map(eventShifts.map((shift) => [normalizeShiftName(shift.name), shift.id]));
      const volunteerByPhone = new Map(eventVolunteers.map((volunteer) => [volunteer.phone, volunteer]));
      const assignmentKeys = new Set(eventAssignments.map((assignment) => `${assignment.volunteerId}:${assignment.shiftId}`));
      const errors: string[] = [];
      let addedPeople = 0;
      let addedAssignments = 0;
      let duplicates = 0;

      await db.transaction("rw", db.volunteers, db.assignments, async () => {
        for (const row of rows) {
          const rowLabel = `Row ${row.sourceRow}${row.name ? ` (${row.name})` : ""}`;
          const phone = normalizePhone(row.phone);
          if (!row.name) { errors.push(`${rowLabel}: name is blank`); continue; }
          if (!phone) { errors.push(`${rowLabel}: invalid phone number`); continue; }
          if (!row.shift) { errors.push(`${rowLabel}: Shift is blank`); continue; }
          const targetShiftId = shiftByName.get(normalizeShiftName(row.shift));
          if (!targetShiftId) { errors.push(`${rowLabel}: unknown shift "${row.shift}"`); continue; }

          let volunteer = volunteerByPhone.get(phone);
          if (!volunteer) {
            volunteer = { id: id(), eventId: selectedEvent.id, name: row.name.trim(), phone, role: "", fields: row.fields, createdAt: now() };
            await db.volunteers.add(volunteer);
            volunteerByPhone.set(phone, volunteer);
            addedPeople += 1;
          }
          const key = `${volunteer.id}:${targetShiftId}`;
          if (assignmentKeys.has(key)) { duplicates += 1; continue; }
          await db.assignments.add({ id: id(), eventId: selectedEvent.id, shiftId: targetShiftId, volunteerId: volunteer.id, role: row.role, createdAt: now() });
          assignmentKeys.add(key);
          addedAssignments += 1;
        }
      });

      const preview = errors.slice(0, 5).join("; ");
      const remainder = errors.length > 5 ? `; +${errors.length - 5} more` : "";
      setNotice(`Imported ${addedPeople} new volunteer${addedPeople === 1 ? "" : "s"} and ${addedAssignments} assignment${addedAssignments === 1 ? "" : "s"}. ${duplicates} duplicate assignment${duplicates === 1 ? "" : "s"} skipped. ${errors.length} row${errors.length === 1 ? "" : "s"} rejected${errors.length ? `: ${preview}${remainder}` : "."}`);
      await refresh(selectedEvent.id, selectedCampaignId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Roster import failed.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function beginAssignmentEdit(volunteer: VolunteerRecord) {
    const drafts = eventAssignments.filter((assignment) => assignment.volunteerId === volunteer.id).map((assignment) => ({ id: assignment.id, shiftId: assignment.shiftId, role: assignment.role }));
    setEditingVolunteerId(volunteer.id);
    setAssignmentDrafts(drafts);
    setNewAssignment({ shiftId: "", role: "" });
  }

  function updateAssignmentDraft(assignmentId: string, patch: Partial<AssignmentDraft>) {
    setAssignmentDrafts((current) => current.map((draft) => (draft.id === assignmentId ? { ...draft, ...patch } : draft)));
  }

  async function saveAssignmentChanges(volunteer: VolunteerRecord) {
    if (!selectedEvent) return;
    const shiftIds = assignmentDrafts.map((draft) => draft.shiftId).filter(Boolean);
    if (shiftIds.length !== assignmentDrafts.length) return setNotice("Every assignment needs an explicit shift.");
    if (new Set(shiftIds).size !== shiftIds.length) return setNotice("A volunteer cannot have two assignments to the same shift.");
    await db.transaction("rw", db.assignments, async () => {
      for (const draft of assignmentDrafts) await db.assignments.update(draft.id, { shiftId: draft.shiftId, role: draft.role.trim() });
    });
    setEditingVolunteerId("");
    setNotice(`${volunteer.name}'s shift assignments were updated.`);
    await refresh(selectedEvent.id, selectedCampaignId);
  }

  async function addAssignmentToVolunteer(volunteer: VolunteerRecord) {
    if (!selectedEvent || !newAssignment.shiftId) return setNotice("Choose a shift explicitly.");
    if (assignmentDrafts.some((draft) => draft.shiftId === newAssignment.shiftId)) return setNotice("That volunteer is already assigned to this shift.");
    const record: AssignmentRecord = { id: id(), eventId: selectedEvent.id, shiftId: newAssignment.shiftId, volunteerId: volunteer.id, role: newAssignment.role.trim(), createdAt: now() };
    await db.assignments.add(record);
    setAssignmentDrafts((current) => [...current, { id: record.id, shiftId: record.shiftId, role: record.role }]);
    setNewAssignment({ shiftId: "", role: "" });
    setNotice(`${volunteer.name} assigned to another shift.`);
    await refresh(selectedEvent.id, selectedCampaignId);
  }

  async function removeAssignment(assignment: AssignmentRecord) {
    await db.assignments.delete(assignment.id);
    setAssignmentDrafts((current) => current.filter((draft) => draft.id !== assignment.id));
    setNotice("Shift assignment removed.");
    await refresh(selectedEventId, selectedCampaignId);
  }

  async function removeVolunteer(volunteer: VolunteerRecord) {
    await db.transaction("rw", db.volunteers, db.assignments, db.sendRecords, async () => {
      await db.assignments.where("volunteerId").equals(volunteer.id).delete();
      await db.sendRecords.where("volunteerId").equals(volunteer.id).delete();
      await db.volunteers.delete(volunteer.id);
    });
    if (editingVolunteerId === volunteer.id) setEditingVolunteerId("");
    setNotice(`${volunteer.name} removed from the event.`);
    await refresh(selectedEventId, selectedCampaignId);
  }

  function newCampaign() {
    setSelectedCampaignId("");
    setCampaignName("Event details");
    setTemplate(DEFAULT_TEMPLATE);
    setAudienceType("event");
    setCampaignShiftId("");
  }

  async function saveCampaign() {
    if (!selectedEvent) return;
    const usedShiftVariables = shiftVariablesUsed(template);
    if (audienceType === "event" && usedShiftVariables.length) return setNotice(`All-volunteer messages cannot use shift-specific variables: ${usedShiftVariables.map((variable) => `{{${variable}}}`).join(", ")}.`);
    if (audienceType === "shift") {
      if (!campaignShiftId) return setNotice("Choose a target shift explicitly.");
      const targetShift = eventShifts.find((shift) => shift.id === campaignShiftId);
      if (!targetShift) return setNotice("The selected target shift does not exist.");
      const missing = missingShiftFields(targetShift);
      if (missing.length) return setNotice(`Complete ${targetShift.name} before using it for messaging. Missing: ${missing.join(", ")}.`);
    }
    const timestamp = now();
    const campaignData = { name: campaignName.trim() || "Untitled message", template, audienceType, shiftId: audienceType === "shift" ? campaignShiftId : undefined, updatedAt: timestamp };
    if (selectedCampaign) {
      if (selectedCampaign.status === "closed") return setNotice("Reopen this campaign before editing it.");
      await db.campaigns.update(selectedCampaign.id, campaignData);
      setNotice("Message updated.");
      await refresh(selectedEvent.id, selectedCampaign.id);
    } else {
      const campaignId = id();
      await db.campaigns.add({ id: campaignId, eventId: selectedEvent.id, ...campaignData, status: "active", createdAt: timestamp });
      setNotice("Message created.");
      await refresh(selectedEvent.id, campaignId);
    }
  }

  async function toggleCampaignClosed(campaign: CampaignRecord) {
    if (campaign.status === "active") {
      await db.campaigns.update(campaign.id, { status: "closed", recipientIds: eligibleVolunteerIds(campaign), updatedAt: now() });
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
    await db.sendRecords.put({ id: existing?.id || id(), eventId: selectedEvent.id, campaignId: selectedCampaign.id, volunteerId: volunteer.id, status, openedAt: status === "opened" || status === "sent" ? existing?.openedAt || timestamp : existing?.openedAt, sentAt: status === "sent" ? timestamp : undefined, updatedAt: timestamp });
    await refresh(selectedEvent.id, selectedCampaign.id);
  }

  async function openWhatsApp(volunteer: VolunteerRecord) {
    if (!selectedCampaign || !selectedEvent) return;
    const shift = shiftForCampaign(selectedCampaign);
    if (selectedCampaign.audienceType === "shift") {
      if (!shift) return setNotice("This campaign's target shift no longer exists.");
      const missing = missingShiftFields(shift);
      if (missing.length) return setNotice(`Complete ${shift.name} before sending. Missing: ${missing.join(", ")}.`);
    }
    const assignment = shift ? assignmentFor(volunteer.id, shift.id) : undefined;
    const message = renderMessage(selectedCampaign.template, selectedEvent, volunteer, shift, assignment);
    window.open(whatsappUrl(volunteer.phone, message), "_blank", "noopener,noreferrer");
    await setSendStatus(volunteer, "opened");
  }

  async function exportBackup() {
    const payload: BackupPayload = { version: 2, exportedAt: now(), events: await db.events.toArray(), shifts: await db.shifts.toArray(), volunteers: await db.volunteers.toArray(), assignments: await db.assignments.toArray(), campaigns: await db.campaigns.toArray(), sendRecords: await db.sendRecords.toArray() };
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
          version: 2,
          exportedAt: legacy.exportedAt,
          events: legacy.events,
          shifts: legacyShifts,
          volunteers: legacy.volunteers,
          assignments: legacy.volunteers.map((volunteer) => ({ id: `restored-assignment-${volunteer.id}`, eventId: volunteer.eventId, shiftId: `restored-main-${volunteer.eventId}`, volunteerId: volunteer.id, role: volunteer.role || "", createdAt: volunteer.createdAt || restoredAt })),
          campaigns: legacy.campaigns.map((campaign) => ({ ...campaign, audienceType: "event", status: "active" })),
          sendRecords: legacy.sendRecords,
        };
      } else throw new Error("Unsupported backup version.");

      await db.transaction("rw", db.events, db.shifts, db.volunteers, db.assignments, db.campaigns, db.sendRecords, async () => {
        await Promise.all([db.events.clear(), db.shifts.clear(), db.volunteers.clear(), db.assignments.clear(), db.campaigns.clear(), db.sendRecords.clear()]);
        await db.events.bulkAdd(payload.events);
        await db.shifts.bulkAdd(payload.shifts);
        await db.volunteers.bulkAdd(payload.volunteers);
        await db.assignments.bulkAdd(payload.assignments);
        await db.campaigns.bulkAdd(payload.campaigns);
        await db.sendRecords.bulkAdd(payload.sendRecords);
      });
      setNotice("Backup restored. Review any incomplete legacy shifts before using them for messaging.");
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
    return `${records.filter((record) => record.status === "sent").length}/${ids.length}`;
  }

  const previewShift = audienceType === "shift" ? eventShifts.find((shift) => shift.id === campaignShiftId) : undefined;
  const previewVolunteer = eventVolunteers[0];
  const previewAssignment = previewVolunteer && previewShift ? assignmentFor(previewVolunteer.id, previewShift.id) : undefined;
  const currentShiftVariableConflict = audienceType === "event" ? shiftVariablesUsed(template) : [];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">VM</div><div><strong>Volunteer Message Tool</strong><span>Local-first WhatsApp assistant</span></div></div>
        <form className="event-form" onSubmit={createEvent}>
          <h2>New event</h2>
          <input placeholder="Event name" value={eventForm.name} onChange={(event) => setEventForm({ ...eventForm, name: event.target.value })} />
          <div className="field-row"><input type="date" value={eventForm.date} onChange={(event) => setEventForm({ ...eventForm, date: event.target.value })} /><input type="time" value={eventForm.time} onChange={(event) => setEventForm({ ...eventForm, time: event.target.value })} /></div>
          <input placeholder="Venue" value={eventForm.venue} onChange={(event) => setEventForm({ ...eventForm, venue: event.target.value })} />
          <button className="primary" type="submit">Create event</button>
        </form>
        <div className="event-list"><h2>Events</h2>{events.length === 0 && <p className="muted">Create your first event to begin.</p>}{events.map((event) => <button key={event.id} className={`event-item ${event.id === selectedEventId ? "selected" : ""}`} onClick={() => { setSelectedEventId(event.id); setSelectedCampaignId(""); }}><span>{event.name}</span><small>{event.date} - {event.status}</small></button>)}</div>
      </aside>

      <section className="workspace">
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>x</button></div>}
        {!selectedEvent ? <div className="empty-state"><h1>Start with an event</h1><p>Create an event, then explicitly configure its shifts before adding volunteers.</p></div> : <>
          <header className="event-header"><div><p className="eyebrow">{selectedEvent.status}</p><h1>{selectedEvent.name}</h1><p>{selectedEvent.date}{selectedEvent.time ? ` - ${selectedEvent.time}` : ""}{selectedEvent.venue ? ` - ${selectedEvent.venue}` : ""}</p></div><button className="secondary" onClick={archiveEvent}>{selectedEvent.status === "active" ? "Archive event" : "Restore event"}</button></header>
          <nav className="tabs">{(["shifts", "roster", "messages", "send", "backup"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "send" ? "Send queue" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav>

          {tab === "shifts" && <div className="stack">
            <section className="panel"><h2>Add shift</h2><p className="muted">Name, date, start time, reporting time and venue are required. Values are never inherited from the event.</p><form className="shift-form" onSubmit={createShift}><input placeholder="Shift name" value={shiftForm.name} onChange={(event) => setShiftForm({ ...shiftForm, name: event.target.value })} /><input type="date" value={shiftForm.date} onChange={(event) => setShiftForm({ ...shiftForm, date: event.target.value })} /><input type="time" title="Start time" value={shiftForm.startTime} onChange={(event) => setShiftForm({ ...shiftForm, startTime: event.target.value })} /><input type="time" title="End time" value={shiftForm.endTime} onChange={(event) => setShiftForm({ ...shiftForm, endTime: event.target.value })} /><input type="time" title="Reporting time" value={shiftForm.reportingTime} onChange={(event) => setShiftForm({ ...shiftForm, reportingTime: event.target.value })} /><input placeholder="Venue" value={shiftForm.venue} onChange={(event) => setShiftForm({ ...shiftForm, venue: event.target.value })} /><input placeholder="Notes (optional)" value={shiftForm.notes} onChange={(event) => setShiftForm({ ...shiftForm, notes: event.target.value })} /><button className="primary" type="submit">Add shift</button></form></section>
            <section className="card-grid">{eventShifts.map((shift) => { const count = new Set(eventAssignments.filter((assignment) => assignment.shiftId === shift.id).map((assignment) => assignment.volunteerId)).size; const isEditing = editingShiftId === shift.id; const missing = missingShiftFields(shift); return <article className={`panel shift-card ${isEditing ? "editing" : ""}`} key={shift.id}>{isEditing ? <div className="shift-edit-form"><label>Shift name<input value={shiftEditForm.name} onChange={(event) => setShiftEditForm({ ...shiftEditForm, name: event.target.value })} /></label><label>Date<input type="date" value={shiftEditForm.date} onChange={(event) => setShiftEditForm({ ...shiftEditForm, date: event.target.value })} /></label><label>Start time<input type="time" value={shiftEditForm.startTime} onChange={(event) => setShiftEditForm({ ...shiftEditForm, startTime: event.target.value })} /></label><label>End time<input type="time" value={shiftEditForm.endTime} onChange={(event) => setShiftEditForm({ ...shiftEditForm, endTime: event.target.value })} /></label><label>Reporting time<input type="time" value={shiftEditForm.reportingTime} onChange={(event) => setShiftEditForm({ ...shiftEditForm, reportingTime: event.target.value })} /></label><label>Venue<input value={shiftEditForm.venue} onChange={(event) => setShiftEditForm({ ...shiftEditForm, venue: event.target.value })} /></label><label className="wide-field">Notes<input value={shiftEditForm.notes} onChange={(event) => setShiftEditForm({ ...shiftEditForm, notes: event.target.value })} /></label><div className="actions wide-field"><button className="primary" onClick={() => saveShiftEdit(shift.id)}>Save changes</button><button className="secondary" onClick={() => setEditingShiftId("")}>Cancel</button></div></div> : <><div><h2>{shift.name || "Missing shift name"}</h2><p>{shift.date || "Date not set"} - {shift.startTime || "Start time not set"}{shift.endTime ? `-${shift.endTime}` : ""}</p><p className="muted">Reporting time: {shift.reportingTime || "Not set"}</p><p className="muted">Venue: {shift.venue || "Not set"}</p>{shift.notes && <p className="muted">{shift.notes}</p>}{missing.length ? <div className="warning"><strong>Incomplete shift:</strong> {missing.join(", ")}</div> : <span className="status status-sent">Complete</span>}<p><strong>{count} volunteer{count === 1 ? "" : "s"}</strong></p></div><div className="shift-card-actions"><button className="secondary compact" onClick={() => beginShiftEdit(shift)}>Edit</button><button className="text-button danger" onClick={() => removeShift(shift)}>Remove</button></div></>}</article>; })}</section>
          </div>}

          {tab === "roster" && <div className="stack">
            <section className="panel split"><div><h2>Roster</h2><p className="muted">CSV/XLSX imports require Name, Phone and Shift. Shift values must exactly match an existing shift name; invalid rows are rejected.</p></div><div className="actions"><input ref={fileRef} className="file-input" type="file" accept=".csv,.xlsx,.xls" onChange={(event) => importRoster(event.target.files?.[0])} /><button className="secondary" onClick={() => fileRef.current?.click()}>Upload roster</button></div></section>
            <section className="panel"><form className="inline-form roster-add" onSubmit={addVolunteer}><input placeholder="Name" value={newVolunteer.name} onChange={(event) => setNewVolunteer({ ...newVolunteer, name: event.target.value })} /><input placeholder="Phone" value={newVolunteer.phone} onChange={(event) => setNewVolunteer({ ...newVolunteer, phone: event.target.value })} /><select value={newVolunteer.shiftId} onChange={(event) => setNewVolunteer({ ...newVolunteer, shiftId: event.target.value })}><option value="">Choose shift...</option>{eventShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select><input placeholder="Role for this shift" value={newVolunteer.role} onChange={(event) => setNewVolunteer({ ...newVolunteer, role: event.target.value })} /><button className="primary" type="submit">Add / assign</button></form></section>
            <section className="panel"><div className="table-toolbar"><strong>{eventVolunteers.length} volunteer{eventVolunteers.length === 1 ? "" : "s"}</strong><div className="actions"><select value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value)}><option value="all">All shifts</option>{eventShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select><input className="search" placeholder="Search roster" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Shift assignments</th><th></th></tr></thead><tbody>{filteredVolunteers.map((volunteer) => { const volunteerAssignments = eventAssignments.filter((assignment) => assignment.volunteerId === volunteer.id); const isEditing = editingVolunteerId === volunteer.id; return <Fragment key={volunteer.id}><tr><td>{volunteer.name}</td><td>{volunteer.phone}</td><td><div className="assignment-list">{volunteerAssignments.length === 0 && <span className="warning">No shift assigned</span>}{volunteerAssignments.map((assignment) => { const shift = eventShifts.find((item) => item.id === assignment.shiftId); return <span className="assignment-chip" key={assignment.id}>{shift ? shift.name : "Missing shift record"}{assignment.role ? ` - ${assignment.role}` : ""}</span>; })}</div></td><td><div className="row-actions"><button className="secondary compact" onClick={() => isEditing ? setEditingVolunteerId("") : beginAssignmentEdit(volunteer)}>{isEditing ? "Close" : "Manage shifts"}</button><button className="text-button danger" onClick={() => removeVolunteer(volunteer)}>Remove person</button></div></td></tr>{isEditing && <tr className="assignment-manager-row"><td colSpan={4}><div className="assignment-manager"><div className="assignment-manager-header"><div><strong>Manage {volunteer.name}'s assignments</strong><p className="muted">Every assignment requires an explicit shift selection.</p></div><button className="primary" onClick={() => saveAssignmentChanges(volunteer)}>Save assignments</button></div>{assignmentDrafts.length === 0 && <p className="warning">This volunteer has no shift assignment.</p>}<div className="assignment-editor-list">{assignmentDrafts.map((draft) => { const original = eventAssignments.find((assignment) => assignment.id === draft.id); return <div className="assignment-editor-row" key={draft.id}><select value={draft.shiftId} onChange={(event) => updateAssignmentDraft(draft.id, { shiftId: event.target.value })}><option value="">Choose shift...</option>{eventShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select><input placeholder="Role (optional)" value={draft.role} onChange={(event) => updateAssignmentDraft(draft.id, { role: event.target.value })} /><button className="text-button danger" onClick={() => original && removeAssignment(original)}>Remove assignment</button></div>; })}</div>{eventShifts.length > assignmentDrafts.length && <div className="add-assignment-row"><select value={newAssignment.shiftId} onChange={(event) => setNewAssignment({ ...newAssignment, shiftId: event.target.value })}><option value="">Choose another shift...</option>{eventShifts.filter((shift) => !assignmentDrafts.some((draft) => draft.shiftId === shift.id)).map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select><input placeholder="Role for this shift" value={newAssignment.role} onChange={(event) => setNewAssignment({ ...newAssignment, role: event.target.value })} /><button className="secondary" onClick={() => addAssignmentToVolunteer(volunteer)}>+ Add assignment</button></div>}</div></td></tr>}</Fragment>; })}</tbody></table></div></section>
          </div>}

          {tab === "messages" && <div className="campaign-layout">
            <section className="panel campaign-list"><div className="split"><div><h2>Messages</h2><p className="muted">Each message has its own audience and send history.</p></div><button className="primary" onClick={newCampaign}>+ New message</button></div>{eventCampaigns.length === 0 && <p className="muted">No message campaigns yet.</p>}{eventCampaigns.map((campaign) => <button className={`campaign-item ${selectedCampaignId === campaign.id ? "selected" : ""}`} key={campaign.id} onClick={() => setSelectedCampaignId(campaign.id)}><span><strong>{campaign.name}</strong><small>{campaign.audienceType === "shift" ? eventShifts.find((shift) => shift.id === campaign.shiftId)?.name || "Missing target shift" : "All volunteers"} - {campaign.status}</small></span><b>{campaignProgress(campaign)} sent</b></button>)}</section>
            <section className="panel message-editor"><div className="split"><div><h2>{selectedCampaign ? "Edit message" : "New message"}</h2>{selectedCampaign && <p className="muted">Status: {selectedCampaign.status}</p>}</div>{selectedCampaign && <div className="actions"><button className="secondary" onClick={() => toggleCampaignClosed(selectedCampaign)}>{selectedCampaign.status === "active" ? "Close campaign" : "Reopen campaign"}</button><button className="text-button danger" onClick={() => deleteCampaign(selectedCampaign)}>Delete</button></div>}</div><label>Campaign name<input disabled={selectedCampaign?.status === "closed"} value={campaignName} onChange={(event) => setCampaignName(event.target.value)} /></label><label>Audience<select disabled={selectedCampaign?.status === "closed"} value={audienceType} onChange={(event) => { setAudienceType(event.target.value as CampaignAudienceType); setCampaignShiftId(""); }}><option value="event">All volunteers in event</option><option value="shift">One shift</option></select></label>{audienceType === "shift" && <label>Target shift<select disabled={selectedCampaign?.status === "closed"} value={campaignShiftId} onChange={(event) => setCampaignShiftId(event.target.value)}><option value="">Choose target shift...</option>{eventShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select></label>}<label>Template<textarea disabled={selectedCampaign?.status === "closed"} rows={13} value={template} onChange={(event) => setTemplate(event.target.value)} /></label>{currentShiftVariableConflict.length > 0 && <div className="warning"><strong>Cannot save as an all-volunteer message.</strong> Remove shift variables: {currentShiftVariableConflict.map((variable) => `{{${variable}}}`).join(", ")}.</div>}<p className="muted">Event variables: {"{{first_name}}"}, {"{{event_name}}"}, {"{{event_date}}"}, {"{{event_time}}"}, {"{{event_venue}}"}. Shift-targeted messages may also use {"{{role}}"}, {"{{shift_name}}"}, {"{{shift_date}}"}, {"{{shift_start}}"}, {"{{shift_end}}"}, {"{{reporting_time}}"}, {"{{shift_venue}}"}.</p><button className="primary" disabled={selectedCampaign?.status === "closed"} onClick={saveCampaign}>{selectedCampaign ? "Save changes" : "Create message"}</button><div className="preview"><h2>Preview</h2>{previewVolunteer ? <pre>{renderMessage(template, selectedEvent, previewVolunteer, previewShift, previewAssignment)}</pre> : <p className="muted">Add a volunteer to preview personalisation.</p>}</div></section>
          </div>}

          {tab === "send" && <div className="stack"><section className="panel split"><div><h2>Send queue</h2><p className="muted">Choose a message campaign. Statuses are independent for every campaign.</p></div><select value={selectedCampaignId} onChange={(event) => setSelectedCampaignId(event.target.value)}><option value="">Select message</option>{eventCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></section>{!selectedCampaign ? <section className="panel"><p className="muted">Create or select a message campaign first.</p><button className="primary" onClick={() => setTab("messages")}>Go to messages</button></section> : <><section className="metrics"><Metric label="Pending" value={counts.pending} /><Metric label="Opened" value={counts.opened} /><Metric label="Sent" value={counts.sent} /><Metric label="Skipped / error" value={counts.skipped + counts.error} /></section><section className="panel campaign-summary"><strong>{selectedCampaign.name}</strong><span>{selectedCampaign.audienceType === "shift" ? eventShifts.find((shift) => shift.id === selectedCampaign.shiftId)?.name || "Missing target shift" : "All volunteers"} - {selectedCampaign.status} - {campaignVolunteers.length} recipients</span></section>{selectedCampaign.audienceType === "shift" && (() => { const target = shiftForCampaign(selectedCampaign); const missing = target ? missingShiftFields(target) : ["target shift"]; return missing.length ? <div className="warning"><strong>Sending blocked:</strong> {target ? `${target.name} is incomplete (${missing.join(", ")}).` : "The target shift no longer exists."}</div> : null; })()}{campaignVolunteers.length === 0 ? <section className="panel"><p className="muted">No eligible volunteers for this campaign.</p></section> : <section className="queue">{campaignVolunteers.map((volunteer, index) => { const status = recordsByVolunteer.get(volunteer.id)?.status || "pending"; const shift = shiftForCampaign(selectedCampaign); const assignment = shift ? assignmentFor(volunteer.id, shift.id) : undefined; return <article className="queue-card" key={volunteer.id}><div className="queue-number">{index + 1}</div><div className="queue-main"><div className="queue-head"><div><h3>{volunteer.name}</h3><p>{volunteer.phone}{shift ? ` - ${shift.name}` : ""}{assignment?.role ? ` - ${assignment.role}` : ""}</p></div><StatusPill status={status} /></div><pre>{renderMessage(selectedCampaign.template, selectedEvent, volunteer, shift, assignment)}</pre><div className="actions"><button className="whatsapp" onClick={() => openWhatsApp(volunteer)}>Open in WhatsApp</button><button className="secondary" onClick={() => setSendStatus(volunteer, "sent")}>Mark sent</button><button className="text-button" onClick={() => setSendStatus(volunteer, "skipped")}>Skip</button><button className="text-button danger" onClick={() => setSendStatus(volunteer, "error")}>Error</button></div></div></article>; })}</section>}</>}<p className="muted">Active campaigns automatically include eligible volunteers. Closed campaigns keep their frozen recipient list. Sent remains staff-confirmed.</p></div>}

          {tab === "backup" && <section className="panel backup-panel"><h2>Local data & backup</h2><p>All roster, shift, campaign and send-history data is stored in this browser using IndexedDB.</p><div className="actions"><button className="primary" onClick={exportBackup}>Export backup</button><input ref={restoreRef} className="file-input" type="file" accept="application/json,.json" onChange={(event) => restoreBackup(event.target.files?.[0])} /><button className="secondary" onClick={() => restoreRef.current?.click()}>Restore backup</button></div><div className="warning"><strong>Important:</strong> clearing this browser's site data will remove local records unless you have exported a backup. Version 1 backups remain restorable; incomplete legacy shifts must be corrected before messaging.</div></section>}
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
