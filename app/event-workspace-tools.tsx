"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { db } from "@/lib/db";
import type { EventRecord } from "@/lib/types";

type EventDraft = Pick<EventRecord, "name" | "date" | "time" | "venue" | "briefingLink" | "whatsappGroupLink">;

const emptyDraft = (): EventDraft => ({
  name: "",
  date: "",
  time: "",
  venue: "",
  briefingLink: "",
  whatsappGroupLink: "",
});

export default function EventWorkspaceTools() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [query, setQuery] = useState("");
  const [searchHost, setSearchHost] = useState<HTMLElement | null>(null);
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(emptyDraft());
  const [notice, setNotice] = useState("");

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId),
    [events, selectedEventId],
  );

  const loadEvents = useCallback(async () => {
    const allEvents = await db.events.orderBy("date").reverse().toArray();
    setEvents(allEvents);
    return allEvents;
  }, []);

  const syncSelectedEvent = useCallback((allEvents: EventRecord[]) => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar .event-list .event-item"));
    const selectedIndex = buttons.findIndex((button) => button.classList.contains("selected"));
    setSelectedEventId(selectedIndex >= 0 ? allEvents[selectedIndex]?.id || "" : "");
  }, []);

  useEffect(() => {
    let observer: MutationObserver | undefined;
    let cancelled = false;

    const ensureHosts = async () => {
      const eventList = document.querySelector<HTMLElement>(".sidebar .event-list");
      const eventHeader = document.querySelector<HTMLElement>(".workspace .event-header");

      if (eventList) {
        let host = eventList.querySelector<HTMLElement>(".event-search-host");
        if (!host) {
          host = document.createElement("div");
          host.className = "event-search-host";
          const heading = eventList.querySelector("h2");
          heading?.insertAdjacentElement("afterend", host);
        }
        if (!cancelled) setSearchHost((current) => (current === host ? current : host));
      }

      if (eventHeader) {
        let host = eventHeader.querySelector<HTMLElement>(".event-header-tools-host");
        if (!host) {
          host = document.createElement("div");
          host.className = "event-header-tools-host";
          const archiveButton = eventHeader.querySelector(":scope > button.secondary");
          if (archiveButton) eventHeader.insertBefore(host, archiveButton);
          else eventHeader.appendChild(host);
        }
        if (!cancelled) setHeaderHost((current) => (current === host ? current : host));
      } else if (!cancelled) {
        setHeaderHost(null);
      }

      const currentEvents = await loadEvents();
      if (!cancelled) syncSelectedEvent(currentEvents);
    };

    void ensureHosts();
    observer = new MutationObserver(() => {
      void ensureHosts();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      document.querySelectorAll<HTMLButtonElement>(".sidebar .event-item").forEach((button) => {
        button.hidden = false;
      });
      document.querySelector(".event-search-host")?.remove();
      document.querySelector(".event-header-tools-host")?.remove();
    };
  }, [loadEvents, syncSelectedEvent]);

  useEffect(() => {
    const normalized = query.trim().toLocaleLowerCase("en-SG");
    document.querySelectorAll<HTMLButtonElement>(".sidebar .event-list .event-item").forEach((button) => {
      const searchable = (button.textContent || "").toLocaleLowerCase("en-SG");
      button.hidden = Boolean(normalized) && !searchable.includes(normalized);
    });
  }, [query, events]);

  function searchEvents(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    const firstVisible = Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar .event-list .event-item"))
      .find((button) => !button.hidden);
    firstVisible?.click();
  }

  function beginEdit() {
    if (!selectedEvent) return;
    setDraft({
      name: selectedEvent.name,
      date: selectedEvent.date,
      time: selectedEvent.time || "",
      venue: selectedEvent.venue || "",
      briefingLink: selectedEvent.briefingLink || "",
      whatsappGroupLink: selectedEvent.whatsappGroupLink || "",
    });
    setNotice("");
    setEditing(true);
  }

  async function saveEvent(event: FormEvent) {
    event.preventDefault();
    if (!selectedEvent) return;
    if (!draft.name.trim() || !draft.date) {
      setNotice("Event name and date are required.");
      return;
    }

    await db.events.update(selectedEvent.id, {
      name: draft.name.trim(),
      date: draft.date,
      time: draft.time,
      venue: draft.venue.trim(),
      briefingLink: draft.briefingLink?.trim() || "",
      whatsappGroupLink: draft.whatsappGroupLink?.trim() || "",
    });

    // The main dashboard keeps its own in-memory event state. Reload after a successful
    // edit so headers, message previews and ordering all reflect the updated record.
    window.location.reload();
  }

  const search = searchHost
    ? createPortal(
        <form className="event-search-control" onSubmit={searchEvents}>
          <input
            type="search"
            placeholder="Search events"
            aria-label="Search events"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button className="event-search-clear" type="button" aria-label="Clear event search" onClick={() => setQuery("")}>
              ×
            </button>
          )}
        </form>,
        searchHost,
      )
    : null;

  const editButton = headerHost && selectedEvent
    ? createPortal(
        <button className="secondary event-edit-button" type="button" onClick={beginEdit}>
          Edit event
        </button>,
        headerHost,
      )
    : null;

  const modal = editing && selectedEvent && typeof document !== "undefined"
    ? createPortal(
        <div className="event-edit-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setEditing(false);
        }}>
          <section className="event-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="event-edit-title">
            <div className="event-edit-heading">
              <div>
                <p className="eyebrow">Event settings</p>
                <h2 id="event-edit-title">Edit {selectedEvent.name}</h2>
                <p className="muted">Changes update this event only. Shift details remain independent.</p>
              </div>
              <button className="event-edit-close" type="button" aria-label="Close event editor" onClick={() => setEditing(false)}>×</button>
            </div>

            <form className="event-edit-form" onSubmit={saveEvent}>
              <label className="wide-field">Event name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label>Date<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
              <label>Time<input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></label>
              <label className="wide-field">Venue<input value={draft.venue} onChange={(event) => setDraft({ ...draft, venue: event.target.value })} /></label>
              <label className="wide-field">Briefing link<input type="url" placeholder="https://..." value={draft.briefingLink || ""} onChange={(event) => setDraft({ ...draft, briefingLink: event.target.value })} /></label>
              <label className="wide-field">WhatsApp group link<input type="url" placeholder="https://chat.whatsapp.com/..." value={draft.whatsappGroupLink || ""} onChange={(event) => setDraft({ ...draft, whatsappGroupLink: event.target.value })} /></label>

              {notice && <div className="warning wide-field">{notice}</div>}

              <div className="event-edit-actions wide-field">
                <button className="secondary" type="button" onClick={() => setEditing(false)}>Cancel</button>
                <button className="primary" type="submit">Save event</button>
              </div>
            </form>
          </section>
        </div>,
        document.body,
      )
    : null;

  return <>{search}{editButton}{modal}</>;
}
