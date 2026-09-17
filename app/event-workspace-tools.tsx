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
type ShiftActionHost = { shiftId: string; host: HTMLElement };

const DUPLICATE_SHIFT_KEY = "volmessagetool-edit-shift-after-duplicate";

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

function nextDuplicateName(shift: ShiftRecord, eventShifts: ShiftRecord[]): string {
  const names = new Set(eventShifts.map((item) => item.name.trim().toLocaleLowerCase("en-SG")));
  const base = `${shift.name.trim()} copy`;
  let candidate = base;
  let number = 2;
  while (names.has(candidate.toLocaleLowerCase("en-SG"))) {
    candidate = `${base} ${number}`;
    number += 1;
  }
  return candidate;
}

export default function EventWorkspaceTools() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [query, setQuery] = useState("");
  const [searchHost, setSearchHost] = useState<HTMLElement | null>(null);
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null);
  const [shiftActionHosts, setShiftActionHosts] = useState<ShiftActionHost[]>([]);
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
    return { allEvents, allShifts };
  }, []);

  const syncSelectedEvent = useCallback((allEvents: EventRecord[]) => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar .event-list .event-item"));
    const selectedIndex = buttons.findIndex((button) => button.classList.contains("selected"));
    const nextEventId = selectedIndex >= 0 ? allEvents[selectedIndex]?.id || "" : "";
    setSelectedEventId(nextEventId);
    return nextEventId;
  }, []);

  const syncShiftActionHosts = useCallback((eventId: string, allShifts: ShiftRecord[]) => {
    const eventShifts = allShifts.filter((shift) => shift.eventId === eventId);
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".workspace .shift-card"));
    const nextHosts: ShiftActionHost[] = [];

    cards.forEach((card) => {
      const shiftName = card.querySelector("h2")?.textContent?.trim();
      if (!shiftName) return;
      const shift = eventShifts.find((item) => item.name === shiftName);
      const actions = card.querySelector<HTMLElement>(".shift-card-actions");
      if (!shift || !actions) return;

      let host = actions.querySelector<HTMLElement>(`.shift-duplicate-host[data-shift-id="${shift.id}"]`);
      if (!host) {
        host = document.createElement("span");
        host.className = "shift-duplicate-host";
        host.dataset.shiftId = shift.id;
        const removeButton = Array.from(actions.querySelectorAll<HTMLButtonElement>("button"))
          .find((button) => button.textContent?.trim() === "Remove");
        if (removeButton) actions.insertBefore(host, removeButton);
        else actions.appendChild(host);
      }
      nextHosts.push({ shiftId: shift.id, host });
    });

    setShiftActionHosts((current) => {
      const unchanged = current.length === nextHosts.length
        && current.every((item, index) => item.shiftId === nextHosts[index]?.shiftId && item.host === nextHosts[index]?.host);
      return unchanged ? current : nextHosts;
    });
  }, []);

  const resumeDuplicatedShiftEdit = useCallback((eventId: string, allShifts: ShiftRecord[]) => {
    const pendingShiftId = sessionStorage.getItem(DUPLICATE_SHIFT_KEY);
    if (!pendingShiftId) return;

    const pendingShift = allShifts.find((shift) => shift.id === pendingShiftId && shift.eventId === eventId);
    if (!pendingShift) return;

    const cards = Array.from(document.querySelectorAll<HTMLElement>(".workspace .shift-card"));
    if (cards.length === 0) {
      const shiftsTab = Array.from(document.querySelectorAll<HTMLButtonElement>(".workspace .tabs button"))
        .find((button) => button.textContent?.trim() === "Shifts");
      if (shiftsTab && !shiftsTab.classList.contains("active")) shiftsTab.click();
      return;
    }

    const card = cards.find((item) => item.querySelector("h2")?.textContent?.trim() === pendingShift.name);
    if (!card) return;
    const editButton = Array.from(card.querySelectorAll<HTMLButtonElement>(".shift-card-actions button"))
      .find((button) => button.textContent?.trim() === "Edit");
    if (!editButton) return;

    sessionStorage.removeItem(DUPLICATE_SHIFT_KEY);
    editButton.click();
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  useEffect(() => {
    let observer: MutationObserver | undefined;
    let cancelled = false;
    let ensuring = false;

    const ensureHosts = async () => {
      if (ensuring) return;
      ensuring = true;
      try {
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

        const { allEvents, allShifts } = await loadEvents();
        if (cancelled) return;
        const eventId = syncSelectedEvent(allEvents);
        syncShiftActionHosts(eventId, allShifts);
        resumeDuplicatedShiftEdit(eventId, allShifts);
      } finally {
        ensuring = false;
      }
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
      document.querySelectorAll(".shift-duplicate-host").forEach((host) => host.remove());
    };
  }, [loadEvents, resumeDuplicatedShiftEdit, syncSelectedEvent, syncShiftActionHosts]);

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

  async function duplicateShift(shiftId: string) {
    const source = shifts.find((shift) => shift.id === shiftId);
    if (!source) return;
    const eventShifts = shifts.filter((shift) => shift.eventId === source.eventId);
    const duplicateId = crypto.randomUUID();

    await db.shifts.add({
      ...source,
      id: duplicateId,
      name: nextDuplicateName(source, eventShifts),
      createdAt: new Date().toISOString(),
    });

    // Only shift configuration is duplicated. Volunteers, assignments and campaigns
    // remain linked to the original shift until staff explicitly changes them.
    sessionStorage.setItem(DUPLICATE_SHIFT_KEY, duplicateId);
    window.location.reload();
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

  const duplicateButtons = shiftActionHosts.map(({ shiftId, host }) => createPortal(
    <button className="secondary compact" type="button" onClick={() => void duplicateShift(shiftId)}>
      Duplicate
    </button>,
    host,
    shiftId,
  ));

  return (
    <>
      {search}
      {editButton}
      {duplicateButtons}
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
