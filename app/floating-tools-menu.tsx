"use client";

import { useEffect, useRef, useState } from "react";
import NamePreferenceToggle from "./name-preference-toggle";
import FullBackupTools from "./full-backup-tools";

export default function FloatingToolsMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!open) return;
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="floating-tools-menu" ref={rootRef}>
      {open && (
        <div className="floating-tools-popover" role="menu" aria-label="Message tool utilities">
          <div className="floating-tools-section">
            <a className="floating-menu-action" href="/general" role="menuitem">
              <span className="floating-menu-action-icon" aria-hidden="true">✉</span>
              <span><strong>General messages</strong><small>Message lists outside an event</small></span>
            </a>
            <a className="floating-menu-action" href="/pocs" role="menuitem">
              <span className="floating-menu-action-icon" aria-hidden="true">☎</span>
              <span><strong>POC directory</strong><small>Manage reusable contacts</small></span>
            </a>
            <a className="floating-menu-action" href="/roster-flags" role="menuitem">
              <span className="floating-menu-action-icon" aria-hidden="true">⚑</span>
              <span><strong>Roster flags</strong><small>Review volunteer follow-ups</small></span>
            </a>
          </div>

          <div className="floating-tools-divider" />

          <div className="floating-tools-section">
            <FullBackupTools />
          </div>

          <div className="floating-tools-divider" />

          <div className="floating-tools-section">
            <NamePreferenceToggle />
          </div>
        </div>
      )}

      <button
        className={`floating-tools-trigger ${open ? "open" : ""}`}
        type="button"
        aria-label={open ? "Close utility menu" : "Open utility menu"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true" className="burger-lines">
          <i />
          <i />
          <i />
        </span>
      </button>
    </div>
  );
}
