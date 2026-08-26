import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ImportedVolunteer {
  sourceRow: number;
  name: string;
  phone: string;
  role: string;
  shift: string;
  fields: Record<string, string>;
}

function keyOf(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  const entries = Object.entries(row);
  const match = entries.find(([key]) => keys.includes(keyOf(key)));
  return match ? String(match[1] ?? "").trim() : "";
}

function normalizeRows(rows: Record<string, unknown>[]): ImportedVolunteer[] {
  return rows
    .map((row, index) => {
      const name = pick(row, ["name", "fullname", "volunteername"]);
      const phone = pick(row, ["phone", "phonenumber", "mobile", "mobilenumber", "mobileno", "contact", "contactnumber", "contactno", "handphone", "handphoneno", "hp", "hpno"]);
      const role = pick(row, ["role", "volunteerrole", "assignment", "station"]);
      const shift = pick(row, ["shift", "shiftname", "timeslot", "slot"]);
      const fields = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [keyOf(key), String(value ?? "").trim()]),
      );
      return { sourceRow: index + 2, name, phone, role, shift, fields };
    })
    .filter((row) => row.name || row.phone || row.shift);
}

export async function parseRoster(file: File): Promise<ImportedVolunteer[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    const text = await file.text();
    const result = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
    if (result.errors.length) throw new Error(result.errors[0].message);
    return normalizeRows(result.data);
  }

  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return normalizeRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
  }

  throw new Error("Upload a CSV, XLSX or XLS roster file.");
}
