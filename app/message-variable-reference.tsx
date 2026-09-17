"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const groups = [
  {
    title: "Volunteer",
    variables: ["{{first_name}}", "{{name}}", "{{phone}}"],
  },
  {
    title: "Event",
    variables: [
      "{{event_name}}",
      "{{event_date}}",
      "{{event_start_date}}",
      "{{event_end_date}}",
      "{{event_date_range}}",
      "{{event_time}}",
      "{{event_venue}}",
      "{{briefing_link}}",
      "{{whatsapp_group_link}}",
      "{{whatsapp_group_links}}",
    ],
  },
  {
    title: "One shift",
    variables: [
      "{{role}}",
      "{{role_line}}",
      "{{shift_name}}",
      "{{shift_date}}",
      "{{shift_start}}",
      "{{shift_end}}",
      "{{reporting_time}}",
      "{{shift_venue}}",
      "{{shift_notes}}",
      "{{shift_whatsapp_group_link}}",
      "{{poc_name}}",
      "{{poc_phone}}",
      "{{poc_contact}}",
      "{{poc_line}}",
    ],
  },
  {
    title: "Multiple shifts",
    variables: ["{{shift_summary}}"],
  },
];

export default function MessageVariableReference() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const findHost = () => {
      const textarea = document.querySelector<HTMLTextAreaElement>(".message-editor textarea");
      const label = textarea?.closest("label");
      if (!label?.parentElement) {
        setHost(null);
        return;
      }

      let portalHost = label.parentElement.querySelector<HTMLElement>(":scope > .message-variable-reference-host");
      if (!portalHost) {
        portalHost = document.createElement("div");
        portalHost.className = "message-variable-reference-host";
        label.after(portalHost);
      }
      setHost(portalHost);
    };

    findHost();
    const observer = new MutationObserver(findHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelectorAll(".message-variable-reference-host").forEach((item) => item.remove());
    };
  }, []);

  if (!host) return null;

  return createPortal(
    <details style={{ marginTop: 8, marginBottom: 10 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>Available message variables</summary>
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {groups.map((group) => (
          <div key={group.title}>
            <strong style={{ fontSize: 12 }}>{group.title}</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
              {group.variables.map((variable) => (
                <code key={variable} style={{ fontSize: 12 }}>{variable}</code>
              ))}
            </div>
          </div>
        ))}
        <p className="muted" style={{ margin: 0 }}>
          POC and shift-specific variables are available only for one-shift campaigns. Multi-shift messages should use {"{{shift_summary}}"}, which includes each shift&apos;s role, notes and assigned POC when available.
        </p>
      </div>
    </details>,
    host,
  );
}
