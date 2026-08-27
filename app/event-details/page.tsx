"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { EventRecord } from "@/lib/types";

export default function EventDetailsPage() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [briefingLink, setBriefingLink] = useState("");
  const [whatsappGroupLink, setWhatsappGroupLink] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh(preferredEventId?: string) {
    const allEvents = await db.events.orderBy("date").reverse().toArray();
    setEvents(allEvents);
    const nextId = preferredEventId || selectedEventId || allEvents.find((event) => event.status === "active")?.id || allEvents[0]?.id || "";
    setSelectedEventId(nextId);
    const selected = allEvents.find((event) => event.id === nextId);
    setBriefingLink(selected?.briefingLink || "");
    setWhatsappGroupLink(selected?.whatsappGroupLink || "");
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseEvent(eventId: string) {
    setSelectedEventId(eventId);
    const selected = events.find((event) => event.id === eventId);
    setBriefingLink(selected?.briefingLink || "");
    setWhatsappGroupLink(selected?.whatsappGroupLink || "");
    setNotice("");
  }

  async function save() {
    if (!selectedEventId) return;
    await db.events.update(selectedEventId, {
      briefingLink: briefingLink.trim(),
      whatsappGroupLink: whatsappGroupLink.trim(),
    });
    setNotice("Event links saved.");
    await refresh(selectedEventId);
  }

  const selectedEvent = events.find((event) => event.id === selectedEventId);

  return (
    <main className="settings-page">
      <section className="settings-card">
        <div className="settings-heading">
          <div>
            <p className="eyebrow">Event settings</p>
            <h1>Briefing & WhatsApp links</h1>
            <p className="muted">These are event-level fields and can be recalled in any message campaign.</p>
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

            {selectedEvent && <p className="muted">Editing: <strong>{selectedEvent.name}</strong></p>}

            <label>
              Briefing link
              <input type="url" placeholder="https://..." value={briefingLink} onChange={(event) => setBriefingLink(event.target.value)} />
            </label>

            <label>
              WhatsApp group link
              <input type="url" placeholder="https://chat.whatsapp.com/..." value={whatsappGroupLink} onChange={(event) => setWhatsappGroupLink(event.target.value)} />
            </label>

            <div className="variable-box">
              <strong>Message variables</strong>
              <code>{"{{briefing_link}}"}</code>
              <code>{"{{whatsapp_group_link}}"}</code>
            </div>

            <div className="actions">
              <button className="primary" onClick={save}>Save event links</button>
              {notice && <span className="status status-sent">{notice}</span>}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
