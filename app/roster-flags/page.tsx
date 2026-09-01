"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import type { AssignmentRecord, EventRecord, RosterFlag, ShiftRecord, VolunteerRecord } from "@/lib/types";

const FLAG_OPTIONS: Array<{ value: "" | RosterFlag; label: string }> = [
  { value: "", label: "Unmarked" },
  { value: "yes", label: "Yes attending" },
  { value: "no", label: "No" },
  { value: "maybe", label: "Maybe / pending" },
  { value: "follow_up", label: "Follow up" },
];

export default function RosterFlagsPage() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerRecord[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [eventId, setEventId] = useState("");
  const [flagFilter, setFlagFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh(preferredEventId?: string) {
    const [allEvents, allVolunteers, allShifts, allAssignments] = await Promise.all([
      db.events.orderBy("date").reverse().toArray(),
      db.volunteers.toArray(),
      db.shifts.toArray(),
      db.assignments.toArray(),
    ]);
    setEvents(allEvents);
    setVolunteers(allVolunteers);
    setShifts(allShifts);
    setAssignments(allAssignments);
    const nextEventId = preferredEventId || eventId || allEvents.find((item) => item.status === "active")?.id || allEvents[0]?.id || "";
    setEventId(nextEventId);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedEvent = events.find((event) => event.id === eventId);
  const eventVolunteers = useMemo(() => volunteers.filter((volunteer) => volunteer.eventId === eventId), [volunteers, eventId]);
  const eventShifts = useMemo(() => shifts.filter((shift) => shift.eventId === eventId), [shifts, eventId]);
  const eventAssignments = useMemo(() => assignments.filter((assignment) => assignment.eventId === eventId), [assignments, eventId]);

  const filtered = eventVolunteers.filter((volunteer) => {
    const q = search.trim().toLowerCase();
    const flag = volunteer.rosterFlag || "";
    const matchesFlag = flagFilter === "all" || flagFilter === flag;
    const volunteerAssignments = eventAssignments.filter((assignment) => assignment.volunteerId === volunteer.id);
    const shiftText = volunteerAssignments.map((assignment) => eventShifts.find((shift) => shift.id === assignment.shiftId)?.name || "").join(" ");
    return matchesFlag && (!q || `${volunteer.name} ${volunteer.phone} ${shiftText}`.toLowerCase().includes(q));
  });

  async function setFlag(volunteer: VolunteerRecord, value: string) {
    const rosterFlag = value ? value as RosterFlag : undefined;
    await db.volunteers.update(volunteer.id, { rosterFlag });
    setNotice(`${volunteer.name}: ${FLAG_OPTIONS.find((option) => option.value === value)?.label || "Unmarked"}.`);
    await refresh(eventId);
  }

  const counts = eventVolunteers.reduce((acc, volunteer) => {
    const key = volunteer.rosterFlag || "unmarked";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <main className="general-page roster-flags-page">
      <header className="general-header">
        <div><p className="eyebrow">Event roster</p><h1>Roster Flags</h1><p className="muted">Quickly mark attendance responses or follow-ups without changing message send status.</p></div>
        <a className="secondary general-back" href="/">Back to events</a>
      </header>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>x</button></div>}

      <section className="panel roster-flag-toolbar">
        <label>Event<select value={eventId} onChange={(event) => { setEventId(event.target.value); setFlagFilter("all"); }}><option value="">Choose event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name} · {event.date}</option>)}</select></label>
        <label>Flag<select value={flagFilter} onChange={(event) => setFlagFilter(event.target.value)}><option value="all">All flags</option>{FLAG_OPTIONS.map((option) => <option key={option.value || "unmarked"} value={option.value}>{option.label}</option>)}</select></label>
        <label>Search<input placeholder="Name, phone or shift" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      </section>

      {selectedEvent && <section className="metrics roster-flag-metrics"><Metric label="Yes" value={counts.yes || 0} /><Metric label="No" value={counts.no || 0} /><Metric label="Maybe" value={counts.maybe || 0} /><Metric label="Follow up" value={counts.follow_up || 0} /><Metric label="Unmarked" value={counts.unmarked || 0} /></section>}

      {!selectedEvent ? <section className="panel"><p className="muted">Select an event to manage its roster flags.</p></section> : <section className="panel">
        <div className="split"><div><h2>{selectedEvent.name}</h2><p className="muted">{filtered.length} of {eventVolunteers.length} volunteers shown.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Shifts</th><th>Roster flag</th></tr></thead><tbody>{filtered.map((volunteer) => { const volunteerAssignments = eventAssignments.filter((assignment) => assignment.volunteerId === volunteer.id); return <tr key={volunteer.id}><td><strong>{volunteer.name}</strong></td><td>{volunteer.phone}</td><td><div className="assignment-list">{volunteerAssignments.length === 0 && <span className="muted">No shift</span>}{volunteerAssignments.map((assignment) => { const shift = eventShifts.find((item) => item.id === assignment.shiftId); return <span className="assignment-chip" key={assignment.id}>{shift?.name || "Missing shift"}</span>; })}</div></td><td><select aria-label={`Roster flag for ${volunteer.name}`} className={`roster-flag-select flag-${volunteer.rosterFlag || "unmarked"}`} value={volunteer.rosterFlag || ""} onChange={(event) => setFlag(volunteer, event.target.value)}>{FLAG_OPTIONS.map((option) => <option key={option.value || "unmarked"} value={option.value}>{option.label}</option>)}</select></td></tr>; })}</tbody></table></div>
      </section>}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
