"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function RosterTemplateDownload() {
  const [host, setHost] = useState<HTMLElement | null>(null);

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

  if (!host) return null;

  return createPortal(
    <a
      className="secondary"
      href="/roster-template.csv"
      download="volunteer-roster-template.csv"
      style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}
    >
      Download roster template
    </a>,
    host,
  );
}
