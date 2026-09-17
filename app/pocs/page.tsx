"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { db } from "@/lib/db";
import { titleCaseName } from "@/lib/name";
import { displayPhone, normalizePhone } from "@/lib/phone";
import type { PocRecord } from "@/lib/types";

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

export default function PocDirectoryPage() {
  const [pocs, setPocs] = useState<PocRecord[]>([]);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({ name: "", phone: "" });
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    setPocs(await db.pocs.orderBy("name").toArray());
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("en-SG");
    if (!q) return pocs;
    return pocs.filter((poc) => `${poc.name} ${displayPhone(poc.phone)}`.toLocaleLowerCase("en-SG").includes(q));
  }, [pocs, query]);

  async function addPoc(event: FormEvent) {
    event.preventDefault();
    const name = titleCaseName(form.name);
    const phone = normalizePhone(form.phone);
    if (!name || !phone) return setNotice("Enter a POC name and valid phone number.");
    if (pocs.some((poc) => poc.phone === phone)) return setNotice("That phone number already exists in the POC directory.");
    const timestamp = now();
    await db.pocs.add({ id: id(), name, phone, createdAt: timestamp, updatedAt: timestamp });
    setForm({ name: "", phone: "" });
    setNotice("POC added.");
    await refresh();
  }

  function beginEdit(poc: PocRecord) {
    setEditingId(poc.id);
    setEditForm({ name: poc.name, phone: displayPhone(poc.phone) });
    setNotice("");
  }

  async function saveEdit(poc: PocRecord) {
    const name = titleCaseName(editForm.name);
    const phone = normalizePhone(editForm.phone);
    if (!name || !phone) return setNotice("Enter a POC name and valid phone number.");
    if (pocs.some((item) => item.id !== poc.id && item.phone === phone)) return setNotice("That phone number already exists in the POC directory.");

    await db.transaction("rw", db.pocs, db.shifts, async () => {
      await db.pocs.update(poc.id, { name, phone, updatedAt: now() });
      await db.shifts.where("pocId").equals(poc.id).modify({ pocName: name, pocPhone: phone });
    });

    setEditingId("");
    setNotice("POC updated. Assigned shifts and message variables now use the updated details.");
    await refresh();
  }

  async function deletePoc(poc: PocRecord) {
    const assignedCount = await db.shifts.where("pocId").equals(poc.id).count();
    if (assignedCount > 0) {
      return setNotice(`${poc.name} is assigned to ${assignedCount} shift${assignedCount === 1 ? "" : "s"}. Reassign those shifts before deleting this POC.`);
    }
    if (!window.confirm(`Delete ${poc.name} from the POC directory?`)) return;
    await db.pocs.delete(poc.id);
    setNotice("POC deleted.");
    await refresh();
  }

  return (
    <main className="general-page">
      <header className="general-header">
        <div>
          <p className="eyebrow">Global directory</p>
          <h1>POC Directory</h1>
          <p className="muted">Maintain reusable points of contact for event shifts. Updating a record updates every assigned shift.</p>
        </div>
        <a className="secondary general-back" href="/">Back to events</a>
      </header>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>x</button></div>}

      <div className="stack">
        <section className="panel">
          <div className="split">
            <div><h2>Add POC</h2><p className="muted">Phone numbers are normalized internally; Singapore numbers display without +65.</p></div>
          </div>
          <form className="general-recipient-form" onSubmit={addPoc}>
            <input placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <input placeholder="Contact number" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            <button className="primary" type="submit">Add POC</button>
          </form>
        </section>

        <section className="panel">
          <div className="table-toolbar">
            <strong>{pocs.length} POC{pocs.length === 1 ? "" : "s"}</strong>
            <input className="search" placeholder="Search directory" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Contact number</th><th></th></tr></thead>
              <tbody>
                {filtered.map((poc) => {
                  const editing = editingId === poc.id;
                  return (
                    <tr key={poc.id}>
                      <td>{editing ? <input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /> : poc.name}</td>
                      <td>{editing ? <input value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /> : displayPhone(poc.phone)}</td>
                      <td>
                        <div className="row-actions">
                          {editing ? <>
                            <button className="primary compact" type="button" onClick={() => void saveEdit(poc)}>Save</button>
                            <button className="secondary compact" type="button" onClick={() => setEditingId("")}>Cancel</button>
                          </> : <>
                            <button className="secondary compact" type="button" onClick={() => beginEdit(poc)}>Edit</button>
                            <button className="text-button danger" type="button" onClick={() => void deletePoc(poc)}>Delete</button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <p className="muted">No POCs match this search.</p>}
        </section>
      </div>
    </main>
  );
}
