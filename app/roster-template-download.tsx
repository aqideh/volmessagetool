"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { db } from "@/lib/db";

function csvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function safeFilename(value: string): string {
  const cleaned = value
    .trim()
    .toLocaleLowerCase("en-SG")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "event";
}

export default function RosterTemplateDownload() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const findHost = () => {
      const rosterHeading = Array.from(document.querySelectorAll<HTMLElement>(".panel h2"))
        .find((heading) => heading.textContent?.trim() === "Roster");
      const actions = rosterHeading?.closest(".panel")?.querySelector<HTMLElement>(".actions");
      if (!actions) return;

      let portalHost = actions.querySelector<HTMLElement>(".roster-template-download-host");
      if (!portalHost) {
        portalHost = document.createElement("span");
        portalHost.className = "roster-template-download-host";
        actions.insertBefore(portalHost, actions.firstChild);
      }
      setHost(portalHost);
    };

    findHost();
    const observer = new MutationObserver(findHost);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.querySelector(".roster-template-download-host")?.remove();
    };
  }, []);

  async function downloadTemplate() {
    setDownloading(true);
    try {
      const [events, shifts] = await Promise.all([
        db.events.orderBy("date").reverse().toArray(),
        db.shifts.toArray(),
      ]);

      const eventButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar .event-list .event-item"));
      const selectedIndex = eventButtons.findIndex((button) => button.classList.contains("selected"));
      const selectedEvent = selectedIndex >= 0 ? events[selectedIndex] : undefined;
      if (!selectedEvent) return;

      const eventShifts = shifts
        .filter((shift) => shift.eventId === selectedEvent.id)
        .sort((a, b) => `${a.date}${a.startTime}${a.name}`.localeCompare(`${b.date}${b.startTime}${b.name}`));

      const rows = [
        ["Name", "Phone", "Shift", "Role"],
        ...eventShifts.map((shift) => ["", "", shift.name, ""]),
      ];
      const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeFilename(selectedEvent.name)}-roster-template.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (!host) return null;

  return createPortal(
    <button
      className="secondary"
      type="button"
      onClick={() => void downloadTemplate()}
      disabled={downloading}
    >
      {downloading ? "Preparing template..." : "Download roster template"}
    </button>,
    host,
  );
}
