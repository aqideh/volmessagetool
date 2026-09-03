"use client";

import { useEffect, useRef, useState } from "react";

export default function SidebarEventSearch() {
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let pageObserver: MutationObserver | undefined;
    let listObserver: MutationObserver | undefined;

    const applyFilter = (list: Element, value: string) => {
      const normalized = value.trim().toLocaleLowerCase("en-SG");
      list.querySelectorAll<HTMLButtonElement>(".event-item").forEach((button) => {
        const searchable = (button.textContent || "").toLocaleLowerCase("en-SG");
        button.hidden = Boolean(normalized) && !searchable.includes(normalized);
      });
    };

    const mountIntoSidebar = () => {
      const list = document.querySelector(".sidebar .event-list");
      if (!list) return;

      let host = list.querySelector<HTMLDivElement>(".event-search-host");
      if (!host) {
        host = document.createElement("div");
        host.className = "event-search-host";
        list.appendChild(host);
      }
      containerRef.current = host;
      applyFilter(list, query);

      listObserver?.disconnect();
      listObserver = new MutationObserver(() => applyFilter(list, query));
      listObserver.observe(list, { childList: true, subtree: true, characterData: true });
    };

    mountIntoSidebar();
    pageObserver = new MutationObserver(mountIntoSidebar);
    pageObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      pageObserver?.disconnect();
      listObserver?.disconnect();
      document.querySelectorAll<HTMLButtonElement>(".sidebar .event-item").forEach((button) => {
        button.hidden = false;
      });
      containerRef.current?.remove();
      containerRef.current = null;
    };
  }, [query]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    host.replaceChildren();
    const wrapper = document.createElement("div");
    wrapper.className = "event-search-control";

    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Search events";
    input.setAttribute("aria-label", "Search events");
    input.value = query;
    input.addEventListener("input", (event) => setQuery((event.target as HTMLInputElement).value));

    wrapper.appendChild(input);

    if (query) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "event-search-clear";
      clear.setAttribute("aria-label", "Clear event search");
      clear.textContent = "×";
      clear.addEventListener("click", () => setQuery(""));
      wrapper.appendChild(clear);
    }

    host.appendChild(wrapper);
  }, [query]);

  return null;
}
