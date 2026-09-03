"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { EventRecord } from "@/lib/types";

type EventForm = Pick<EventRecord, "name" | "date" | "time" | "venue" | "briefingLink" | "whatsappGroupLink">;

const emptyForm = (): EventForm => ({
  name: "",
  date: "",
  time: "",
  venue: "",
  briefingLink: "",
  whatsappGroupLink: "",
});

export default function EventDetailsPage() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [form, setForm] = useState<EventForm>(emptyForm());
  const [notice, setNotice] = useState("");

  function loadForm(event?: EventRecord) {
    setForm(event ? {
      name: event.name,
      date: event.date,
      time: event.time,
      venue: event.venue,
      briefingLink: event.briefingLink || "",
      whatsappGroupLink: event.whatsappGroupLink || "",
    } : emptyForm());
  }

  async function refresh(preferredEventId?: string) {
    const allEvents = await db.events.orderBy("date").reverse().toArray();
    setEvents(allEvents);
    const nextId = preferredEventId || selectedEventId || allEvents.find((event) => event.status === "active")?.id || allEvents[0]?.id || "";
    setSelectedEventId(nextId);
    loadForm(allEvents.find((event) => event.id === nextId));
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseEvent(eventId: string) {
    setSelectedEventId(eventId);
    loadForm(events.find((event) => event.id === eventId));
    setNotice("");
  }

  async function save() {
    if (!selectedEventId) return;
    if (!form.name.trim() || !form.date) {
      setNotice("Event name and date are required.");
      return;
    }

    await db.events.update(selectedEventId, {
      name: form.name.trim(),
      date: form.date,
      time: form.time,
      venue: form.venue.trim(),
      briefingLink: form.briefingLink?.trim() || "",
      whatsappGroupLink: form.whatsappGroupLink?.trim() || "",
    });
    setNotice("Event details saved.");
    await refresh(selectedEventId);
  }

  const selectedEvent = events.find((event) => event.id === selectedEventId);

  return (
    <main className="settings-page">
      <section className="settings-card event-details-card">
        <div className="settings-heading">
          <div>
            <p className="eyebrow">Event settings</p>
            <h1>Edit event details</h1>
            <p className="muted">Update the event record without changing its ID, shifts, roster, campaigns or send history.</p>
          </div>
          <a className="secondary settings-link" href="/">Back to messaging</a>
        </div>

        {events.length === 0 ? (
          <div className="warning">Create an event first.</div>
        ) : (
          <>
            <label>
              Event
              <select value={selectedEventId} onChange={(event) => chooseEvent(event.target.value)}>
                {events.map((event) => <option key={event.id} value={event.id}>{event.name} - {event.date}</option>)}
              </select>
            </label>

            {selectedEvent && <p className="muted">Editing: <strong>{selectedEvent.name}</strong> · {selectedEvent.status}</p>}

            <div className="event-details-grid">
              <label className="event-details-wide">
                Event name
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>

              <label>
                Date
                <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
              </label>

              <label>
                Time
                <input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} />
              </label>

              <label className="event-details-wide">
                Venue
                <input placeholder="Venue" value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} />
              </label>

              <label className="event-details-wide">
                Briefing link
                <input type="url" placeholder="https://..." value={form.briefingLink || ""} onChange={(event) => setForm({ ...form, briefingLink: event.target.value })} />
              </label>

              <label className="event-details-wide">
                WhatsApp group link
                <input type="url" placeholder="https://chat.whatsapp.com/..." value={form.whatsappGroupLink || ""} onChange={(event) => setForm({ ...form, whatsappGroupLink: event.target.value })} />
              </label>
            </div>

            <div className="warning event-details-note"><strong>Shift details stay separate.</strong> Editing the event date, time or venue does not overwrite any shift fields.</div>

            <div className="variable-box">
              <strong>Message variables updated from this screen</strong>
              <code>{"{{event_name}}"}</code>
              <code>{"{{event_date}}"}</code>
              <code>{"{{event_time}}"}</code>
              <code>{"{{event_venue}}"}</code>
              <code>{"{{briefing_link}}"}</code>
              <code>{"{{whatsapp_group_link}}"}</code>
            </div>

            <div className="actions">
              <button className="primary" onClick={save}>Save event details</button>
              {notice && <span className={notice === "Event details saved." ? "status status-sent" : "warning"}>{notice}</span>}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
