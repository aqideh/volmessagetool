import type { AssignmentRecord, EventRecord, ShiftRecord, VolunteerRecord } from "./types";

export const DEFAULT_TEMPLATE = `Hi {{first_name}}, thank you for volunteering for *{{event_name}}*.

📅 {{date}}
⏰ Reporting time: {{reporting_time}}
📍 {{venue}}
{{role_line}}
Please reply to this message if you have any questions.`;

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function sanitizeTemplate(template: string): string {
  return template
    .replace(/\\(?=\r?\n)/g, "")
    .replace(/^\uFFFD\s*(?={{\s*(date|shift_date)\s*}})/gm, "📅 ")
    .replace(/^\uFFFD\s*(?=Reporting time:)/gm, "⏰ ")
    .replace(/^\uFFFD\s*(?={{\s*(venue|shift_venue)\s*}})/gm, "📍 ")
    .replace(/\r\n/g, "\n");
}

export function renderMessage(
  template: string,
  event: EventRecord,
  volunteer: VolunteerRecord,
  shift?: ShiftRecord,
  assignment?: AssignmentRecord,
): string {
  const effectiveDate = shift?.date || event.date;
  const effectiveVenue = shift?.venue || event.venue;
  const effectiveReportingTime = shift?.reportingTime || shift?.startTime || event.time;
  const effectiveRole = assignment?.role || volunteer.role || "";

  const values: Record<string, string> = {
    name: volunteer.name,
    first_name: firstName(volunteer.name),
    phone: volunteer.phone,
    role: effectiveRole,
    role_line: effectiveRole ? `\nYour assigned role is *${effectiveRole}*.\n` : "",
    event_name: event.name,
    event_date: event.date,
    event_venue: event.venue,
    date: effectiveDate,
    time: effectiveReportingTime,
    venue: effectiveVenue,
    shift_name: shift?.name || "",
    shift_date: shift?.date || event.date,
    shift_start: shift?.startTime || "",
    shift_end: shift?.endTime || "",
    reporting_time: effectiveReportingTime,
    shift_venue: effectiveVenue,
    shift_notes: shift?.notes || "",
    ...volunteer.fields,
  };

  return sanitizeTemplate(template).replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => values[key] ?? "");
}
