"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type SavedMessageTemplate = {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "volmessagetool-message-templates-v1";

function loadSavedTemplates(): SavedMessageTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedMessageTemplate[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.body === "string")
      : [];
  } catch {
    return [];
  }
}

function persistSavedTemplates(templates: SavedMessageTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

function setControlledTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
  textarea.focus();
}

export default function MessageTemplateTools() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [textarea, setTextarea] = useState<HTMLTextAreaElement | null>(null);
  const [locked, setLocked] = useState(false);
  const [templates, setTemplates] = useState<SavedMessageTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setTemplates(loadSavedTemplates());
  }, []);

  useEffect(() => {
    let observer: MutationObserver | undefined;

    const findEditor = () => {
      const nextTextarea = document.querySelector<HTMLTextAreaElement>(".message-editor textarea");
      const label = nextTextarea?.closest("label");
      if (!nextTextarea || !label) {
        setHost(null);
        setTextarea(null);
        setLocked(false);
        return;
      }

      let portalHost = label.parentElement?.querySelector<HTMLElement>(":scope > .message-template-tools-host");
      if (!portalHost) {
        portalHost = document.createElement("div");
        portalHost.className = "message-template-tools-host";
        label.before(portalHost);
      }

      setHost((current) => (current === portalHost ? current : portalHost));
      setTextarea((current) => (current === nextTextarea ? current : nextTextarea));
      setLocked(nextTextarea.disabled);
    };

    findEditor();
    observer = new MutationObserver(findEditor);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "class"],
    });

    return () => {
      observer?.disconnect();
      document.querySelectorAll(".message-template-tools-host").forEach((item) => item.remove());
    };
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedId),
    [templates, selectedId],
  );

  function commit(nextTemplates: SavedMessageTemplate[]) {
    setTemplates(nextTemplates);
    persistSavedTemplates(nextTemplates);
  }

  function saveCurrentTemplate() {
    const body = textarea?.value ?? "";
    if (!body.trim()) {
      setStatus("Write a message before saving it as a template.");
      return;
    }

    const suggestedName = selectedTemplate?.name || "";
    const entered = window.prompt("Template name", suggestedName);
    if (entered === null) return;
    const name = entered.trim();
    if (!name) {
      setStatus("Template name cannot be blank.");
      return;
    }

    const existing = templates.find((item) => item.name.toLocaleLowerCase("en-SG") === name.toLocaleLowerCase("en-SG"));
    const timestamp = new Date().toISOString();
    if (existing) {
      if (!window.confirm(`Replace the saved template “${existing.name}”?`)) return;
      const next = templates.map((item) => item.id === existing.id ? { ...item, name, body, updatedAt: timestamp } : item);
      commit(next);
      setSelectedId(existing.id);
      setStatus(`Updated “${name}”.`);
      return;
    }

    const record: SavedMessageTemplate = {
      id: crypto.randomUUID(),
      name,
      body,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    commit([...templates, record]);
    setSelectedId(record.id);
    setStatus(`Saved “${name}”.`);
  }

  function loadTemplate() {
    if (!selectedTemplate || !textarea) return;
    if (locked || textarea.disabled) {
      setStatus("Reopen the campaign before loading a template.");
      return;
    }
    setControlledTextareaValue(textarea, selectedTemplate.body);
    setStatus(`Loaded “${selectedTemplate.name}”. Save the campaign when ready.`);
  }

  function renameTemplate() {
    if (!selectedTemplate) return;
    const entered = window.prompt("Rename template", selectedTemplate.name);
    if (entered === null) return;
    const name = entered.trim();
    if (!name) {
      setStatus("Template name cannot be blank.");
      return;
    }
    const duplicate = templates.some(
      (item) => item.id !== selectedTemplate.id && item.name.toLocaleLowerCase("en-SG") === name.toLocaleLowerCase("en-SG"),
    );
    if (duplicate) {
      setStatus("Another saved template already uses that name.");
      return;
    }
    const next = templates.map((item) => item.id === selectedTemplate.id ? { ...item, name, updatedAt: new Date().toISOString() } : item);
    commit(next);
    setStatus(`Renamed template to “${name}”.`);
  }

  function deleteTemplate() {
    if (!selectedTemplate) return;
    if (!window.confirm(`Delete the saved template “${selectedTemplate.name}”?`)) return;
    commit(templates.filter((item) => item.id !== selectedTemplate.id));
    setSelectedId("");
    setStatus("Saved template deleted.");
  }

  if (!host) return null;

  const sortedTemplates = [...templates].sort((a, b) => a.name.localeCompare(b.name, "en-SG"));

  return createPortal(
    <div className="message-template-tools" style={{ display: "grid", gap: 8, marginBottom: 12 }}>
      <div className="split" style={{ alignItems: "end", gap: 10 }}>
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          <strong>Saved templates</strong>
          <p className="muted" style={{ margin: "2px 0 0" }}>Reusable across all events. Only the message body is saved.</p>
        </div>
        <div className="actions" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <select
            aria-label="Saved message template"
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.currentTarget.value);
              setStatus("");
            }}
            style={{ minWidth: 180 }}
          >
            <option value="">Choose saved template...</option>
            {sortedTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button className="secondary compact" type="button" disabled={!selectedTemplate || locked} onClick={loadTemplate}>Load</button>
          <button className="secondary compact" type="button" onClick={saveCurrentTemplate}>Save current...</button>
        </div>
      </div>

      {selectedTemplate && (
        <div className="actions" style={{ justifyContent: "flex-end" }}>
          <button className="text-button" type="button" onClick={renameTemplate}>Rename</button>
          <button className="text-button danger" type="button" onClick={deleteTemplate}>Delete saved template</button>
        </div>
      )}

      {status && <p className="muted" role="status" style={{ margin: 0 }}>{status}</p>}
    </div>,
    host,
  );
}
