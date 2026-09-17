"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { db } from "@/lib/db";
import type { EventRecord, PocRecord, ShiftRecord } from "@/lib/types";

type ShiftHost = { shiftId: string; host: HTMLElement };

export default function ShiftPocTools() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [pocs, setPocs] = useState<PocRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [hosts, setHosts] = useState<ShiftHost[]>([]);

  const eventShifts = useMemo(
    () => shifts.filter((shift) => shift.eventId === selectedEventId),
    [shifts, selectedEventId],
  );

  const loadData = useCallback(async () => {
    const [allEvents, allShifts, allPocs] = await Promise.all([
      db.events.orderBy("date").reverse().toArray(),
      db.shifts.toArray(),
      db.pocs.orderBy("name").toArray(),
    ]);
    setEvents(allEvents);
    setShifts(allShifts);
    setPocs(allPocs);
    return { allEvents, allShifts };
  }, []);

  const syncSelectedEvent = useCallback((allEvents: EventRecord[]) => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar .event-list .event-item"));
    const selectedIndex = buttons.findIndex((button) => button.classList.contains("selected"));
    const eventId = selectedIndex >= 0 ? allEvents[selectedIndex]?.id || "" : "";
    setSelectedEventId(eventId);
    return eventId;
  }, []);

  const syncHosts = useCallback((eventId: string, allShifts: ShiftRecord[]) => {
    const relevantShifts = allShifts.filter((shift) => shift.eventId === eventId);
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".workspace .shift-card"));
    const next: ShiftHost[] = [];

    cards.forEach((card) => {
      const name = card.querySelector("h2")?.textContent?.trim();
      if (!name) return;
      const shift = relevantShifts.find((item) => item.name === name);
      const info = card.querySelector<HTMLElement>(":scope > div:first-child");
      if (!shift || !info) return;

      let host = info.querySelector<HTMLElement>(`.shift-poc-host[data-shift-id="${shift.id}"]`);
      if (!host) {
        host = document.createElement("div");
        host.className = "shift-poc-host";
        host.dataset.shiftId = shift.id;
        info.appendChild(host);
      }
      next.push({ shiftId: shift.id, host });
    });

    setHosts((current) => {
      const same = current.length === next.length && current.every((item, index) => item.shiftId === next[index]?.shiftId && item.host === next[index]?.host);
      return same ? current : next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let running = false;

    const ensure = async () => {
      if (running) return;
      running = true;
      try {
        const { allEvents, allShifts } = await loadData();
        if (cancelled) return;
        const eventId = syncSelectedEvent(allEvents);
        syncHosts(eventId, allShifts);
      } finally {
        running = false;
      }
    };

    void ensure();
    const observer = new MutationObserver(() => void ensure());
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelled = true;
      observer.disconnect();
      document.querySelectorAll(".shift-poc-host").forEach((host) => host.remove());
    };
  }, [loadData, syncHosts, syncSelectedEvent]);

  async function assignPoc(shiftId: string, pocId: string) {
    await db.shifts.update(shiftId, { pocId: pocId || undefined });
    setShifts((current) => current.map((shift) => shift.id === shiftId ? { ...shift, pocId: pocId || undefined } : shift));
  }

  return <>{hosts.map(({ shiftId, host }) => {
    const shift = eventShifts.find((item) => item.id === shiftId);
    if (!shift) return null;
    const poc = pocs.find((item) => item.id === shift.pocId);
    return createPortal(
      <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          Point of contact
          <select value={shift.pocId || ""} onChange={(event) => void assignPoc(shift.id, event.currentTarget.value)}>
            <option value="">No POC assigned</option>
            {pocs.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.phone}</option>)}
          </select>
        </label>
        {poc ? <small className="muted">{poc.name} · {poc.phone}</small> : <small className="muted">Assign from the global POC directory.</small>}
      </div>,
      host,
      shiftId,
    );
  })}</>;
}
