"use client";

import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { dateRange, formatDisplayDate } from "@/lib/date";
import { db } from "@/lib/db";
import type { EventRecord, ShiftRecord } from "@/lib/types";

type EventDraft = Pick<EventRecord, "name" | "date" | "endDate" | "time" | "venue" | "briefingLink" | "whatsappGroupLink" | "whatsappGroupLinksByDate">;

const emptyDraft = (): EventDraft => ({
  name: "",
  date: "",
  endDate: "",
  time: "",
  venue: "",
  briefingLink: "",
  whatsappGroupLink: "",
  whatsappGroupLinksByDate: {},
});

export default function EventWorkspaceTools() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
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

  const editorDates = useMemo(() => {
    if (!selectedEvent) return [];
    const rangeDates = dateRange(draft.date || selectedEvent.date, draft.endDate || draft.date || selectedEvent.endDate || selectedEvent.date);
    const shiftDates = shifts
      .filter((shift) => shift.eventId === selectedEvent.id && shift.date)
      .map((shift) => shift.date);
    return [...new Set([...rangeDates, ...shiftDates])].sort();
  }, [selectedEvent, shifts, draft.date, draft.endDate]);

  const loadEvents = useCallback(async () => {
    const [allEvents, allShifts] = await Promise.all([
      db.events.orderBy("date").reverse().toArray(),
      db.shifts.toArray(),
    ]);
    setEvents(allEvents);
    setShifts(allShifts);
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
      endDate: selectedEvent.endDate || "",
      time: selectedEvent.time || "",
      venue: selectedEvent.venue || "",
      briefingLink: selectedEvent.briefingLink || "",
      whatsappGroupLink: selectedEvent.whatsappGroupLink || "",
      whatsappGroupLinksByDate: { ...(selectedEvent.whatsappGroupLinksByDate || {}) },
    });
    setNotice("");
    setEditing(true);
  }

  function updateDayGroupLink(date: string, link: string) {
    setDraft((current) => ({
      ...current,
      whatsappGroupLinksByDate: {
        ...(current.whatsappGroupLinksByDate || {}),
        [date]: link,
      },
    }));
  }

  async function saveEvent(event: FormEvent) {
    event.preventDefault();
    if (!selectedEvent) return;
    if (!draft.name.trim() || !draft.date) {
      setNotice("Event name and start date are required.");
      return;
    }
    if (draft.endDate && draft.endDate < draft.date) {
      setNotice("End date cannot be before the start date.");
      return;
    }

    const dayLinks = Object.fromEntries(
      Object.entries(draft.whatsappGroupLinksByDate || {})
        .map(([date, link]) => [date, link.trim()])
        .filter(([, link]) => Boolean(link)),
    );

    await db.events.update(selectedEvent.id, {
      name: draft.name.trim(),
      date: draft.date,
      endDate: draft.endDate || undefined,
      time: draft.time,
      venue: draft.venue.trim(),
      briefingLink: draft.briefingLink?.trim() || "",
      whatsappGroupLink: draft.whatsappGroupLink?.trim() || "",
      whatsappGroupLinksByDate: dayLinks,
    });

    window.location.reload();
  }

  const search = searchHost
    ? createPortal(
        <form className="event-search-control" onSubmit={searchEvents}>
          <TextInput
            className="mantine-event-search"
            type="search"
            size="sm"
            placeholder="Search events"
            aria-label="Search events"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            rightSection={query ? (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Clear event search"
                onClick={() => setQuery("")}
              >
                ×
              </ActionIcon>
            ) : undefined}
          />
        </form>,
        searchHost,
      )
    : null;

  const editButton = headerHost && selectedEvent
    ? createPortal(
        <Button className="event-edit-button" variant="default" size="sm" onClick={beginEdit}>
          Edit event
        </Button>,
        headerHost,
      )
    : null;

  return (
    <>
      {search}
      {editButton}
      <Modal
        opened={editing && Boolean(selectedEvent)}
        onClose={() => setEditing(false)}
        title={selectedEvent ? `Edit ${selectedEvent.name}` : "Edit event"}
        size="lg"
      >
        {selectedEvent && (
          <form onSubmit={saveEvent}>
            <Stack gap="md">
              <Text size="sm" c="dimmed">Set an end date to make this a multi-day event. Shift details remain independent.</Text>

              <TextInput
                label="Event name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
                required
              />

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="Start date"
                  type="date"
                  value={draft.date}
                  onChange={(event) => setDraft({ ...draft, date: event.currentTarget.value })}
                  required
                />
                <TextInput
                  label="End date"
                  description="Leave blank for a single-day event"
                  type="date"
                  min={draft.date || undefined}
                  value={draft.endDate || ""}
                  onChange={(event) => setDraft({ ...draft, endDate: event.currentTarget.value })}
                />
              </SimpleGrid>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="Time"
                  type="time"
                  value={draft.time}
                  onChange={(event) => setDraft({ ...draft, time: event.currentTarget.value })}
                />
                <TextInput
                  label="Venue"
                  value={draft.venue}
                  onChange={(event) => setDraft({ ...draft, venue: event.currentTarget.value })}
                />
              </SimpleGrid>

              <TextInput
                label="Briefing link"
                type="url"
                placeholder="https://..."
                value={draft.briefingLink || ""}
                onChange={(event) => setDraft({ ...draft, briefingLink: event.currentTarget.value })}
              />

              <Paper withBorder radius="md" p="md">
                <Stack gap="sm">
                  <div>
                    <Text fw={700} size="sm">WhatsApp groups by day</Text>
                    <Text size="xs" c="dimmed">Every day in the event range appears here automatically. Shift dates outside the range are also shown.</Text>
                  </div>

                  {editorDates.map((date) => (
                    <TextInput
                      key={date}
                      label={formatDisplayDate(date)}
                      type="url"
                      placeholder="https://chat.whatsapp.com/..."
                      value={draft.whatsappGroupLinksByDate?.[date] || ""}
                      onChange={(event) => updateDayGroupLink(date, event.currentTarget.value)}
                    />
                  ))}

                  {editorDates.length === 0 && (
                    <Text size="xs" c="dimmed">Set the event dates to manage day-specific WhatsApp groups.</Text>
                  )}
                </Stack>
              </Paper>

              <TextInput
                label="Legacy/default WhatsApp group link"
                description="Optional fallback for older events"
                type="url"
                placeholder="https://chat.whatsapp.com/..."
                value={draft.whatsappGroupLink || ""}
                onChange={(event) => setDraft({ ...draft, whatsappGroupLink: event.currentTarget.value })}
              />

              {notice && <Alert color="red">{notice}</Alert>}

              <Group justify="flex-end">
                <Button variant="default" type="button" onClick={() => setEditing(false)}>Cancel</Button>
                <Button type="submit">Save event</Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>
    </>
  );
}
