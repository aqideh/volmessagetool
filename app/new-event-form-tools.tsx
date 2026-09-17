"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { db } from "@/lib/db";

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

const emptyForm = () => ({
  name: "",
  date: "",
  endDate: "",
  time: "",
  venue: "",
});

export default function NewEventFormTools() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState("");

  useEffect(() => {
    const legacyForm = document.querySelector<HTMLFormElement>(".sidebar .event-form");
    if (!legacyForm) return;

    const portalHost = document.createElement("div");
    portalHost.className = "new-event-form-host";
    legacyForm.before(portalHost);
    legacyForm.hidden = true;
    setHost(portalHost);

    return () => {
      legacyForm.hidden = false;
      portalHost.remove();
    };
  }, []);

  async function createEvent(event: FormEvent) {
    event.preventDefault();
    setError("");

    const name = form.name.trim();
    if (!name || !form.date) {
      setError("Event name and start date are required.");
      return;
    }
    if (form.endDate && form.endDate < form.date) {
      setError("End date cannot be before the start date.");
      return;
    }

    await db.events.add({
      id: id(),
      name,
      date: form.date,
      endDate: form.endDate || undefined,
      time: form.time,
      venue: form.venue.trim(),
      status: "active",
      createdAt: now(),
    });

    setForm(emptyForm());
    window.location.reload();
  }

  if (!host) return null;

  return createPortal(
    <form className="event-form replacement-event-form" onSubmit={createEvent}>
      <h2>New event</h2>
      <input
        placeholder="Event name"
        aria-label="Event name"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.currentTarget.value })}
      />

      <div className="field-row">
        <label style={{ color: "#aeb8c8", gap: 4, fontSize: 10, fontWeight: 700 }}>
          Start date
          <input
            type="date"
            aria-label="Start date"
            value={form.date}
            onChange={(event) => {
              const date = event.currentTarget.value;
              setForm((current) => ({
                ...current,
                date,
                endDate: current.endDate && current.endDate < date ? "" : current.endDate,
              }));
            }}
          />
        </label>
        <label style={{ color: "#aeb8c8", gap: 4, fontSize: 10, fontWeight: 700 }}>
          End date <span style={{ fontWeight: 500, opacity: 0.75 }}>(optional)</span>
          <input
            type="date"
            aria-label="End date"
            min={form.date || undefined}
            value={form.endDate}
            onChange={(event) => setForm({ ...form, endDate: event.currentTarget.value })}
          />
        </label>
      </div>

      <input
        type="time"
        aria-label="Event time"
        title="Event time (optional)"
        value={form.time}
        onChange={(event) => setForm({ ...form, time: event.currentTarget.value })}
      />
      <input
        placeholder="Venue"
        aria-label="Venue"
        value={form.venue}
        onChange={(event) => setForm({ ...form, venue: event.currentTarget.value })}
      />

      {error && <p style={{ margin: 0, color: "#ffb4b4", fontSize: 11 }}>{error}</p>}
      <button className="primary" type="submit">Create event</button>
    </form>,
    host,
  );
}
