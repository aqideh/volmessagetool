import type { AssignmentRecord, EventRecord, ShiftRecord, VolunteerRecord } from "./types";
import { firstName, titleCaseName } from "./name";

export const SHIFT_VARIABLES = [
  "shift_name",
  "shift_date",
  "shift_start",
  "shift_end",
  "reporting_time",
  "shift_venue",
  "shift_notes",
  "role",
  "role_line",
] as const;

export const DEFAULT_TEMPLATE = `Hi {{first_name}}, thank you for volunteering for *{{event_name}}*.

📅 {{event_date}}
⏰ Event time: {{event_time}}
📍 {{event_venue}}
Please reply to this message if you have any questions.`;

function formatShiftSummary(
  volunteerId: string,
  shifts: ShiftRecord[],
  assignments: AssignmentRecord[],
): string {
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  return assignments
    .filter((assignment) => assignment.volunteerId === volunteerId)
    .map((assignment) => ({ assignment, shift: shiftById.get(assignment.shiftId) }))
    .filter((item): item is { assignment: AssignmentRecord; shift: ShiftRecord } => Boolean(item.shift))
    .sort((a, b) => `${a.shift.date}${a.shift.startTime}`.localeCompare(`${b.shift.date}${b.shift.startTime}`))
    .map(({ assignment, shift }, index) => {
      const lines = [
        `${index + 1}. ${shift.name}`,
        `📅 ${shift.date}`,
        `⏰ Report: ${shift.reportingTime}`,
        `🕘 ${shift.startTime}${shift.endTime ? `–${shift.endTime}` : ""}`,
        `📍 ${shift.venue}`,
      ];
      if (assignment.role) lines.push(`Role: ${assignment.role}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

export function sanitizeTemplate(template: string): string {
  return template
    .replace(/\\(?=\r?\n)/g, "")
    .replace(/^\uFFFD\s*(?={{\s*(date|event_date|shift_date)\s*}})/gm, "📅 ")
    .replace(/^\uFFFD\s*(?=(Reporting time:|Event time:))/gm, "⏰ ")
    .replace(/^\uFFFD\s*(?={{\s*(venue|event_venue|shift_venue)\s*}})/gm, "📍 ")
    .replace(/\r\n/g, "\n");
}

export function templateVariables(template: string): string[] {
  return [...sanitizeTemplate(template).matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].map((match) => match[1]);
}

export function shiftVariablesUsed(template: string): string[] {
  const shiftVariables = new Set<string>(SHIFT_VARIABLES);
  return [...new Set(templateVariables(template).filter((variable) => shiftVariables.has(variable)))];
}

export function renderMessage(
  template: string,
  event: EventRecord,
  volunteer: VolunteerRecord,
  shift?: ShiftRecord,
  assignment?: AssignmentRecord,
  allShifts: ShiftRecord[] = [],
  allAssignments: AssignmentRecord[] = [],
  useFullName = false,
): string {
  const role = assignment?.role ?? "";
  const shiftSummary = formatShiftSummary(volunteer.id, allShifts, allAssignments);
  const cleanedName = titleCaseName(volunteer.name);

  const values: Record<string, string> = {
    ...volunteer.fields,
    name: cleanedName,
    first_name: useFullName ? cleanedName : firstName(cleanedName),
    phone: volunteer.phone,
    role,
    role_line: role ? `\nYour assigned role is *${role}*.\n` : "",
    event_name: event.name,
    event_date: event.date,
    event_time: event.time,
    event_venue: event.venue,
    briefing_link: event.briefingLink ?? "",
    whatsapp_group_link: event.whatsappGroupLink ?? "",
    shift_summary: shiftSummary,
    // Legacy aliases are fixed to event-level fields. They never inherit shift data.
    date: event.date,
    time: event.time,
    venue: event.venue,
    shift_name: shift?.name ?? "",
    shift_date: shift?.date ?? "",
    shift_start: shift?.startTime ?? "",
    shift_end: shift?.endTime ?? "",
    reporting_time: shift?.reportingTime ?? "",
    shift_venue: shift?.venue ?? "",
    shift_notes: shift?.notes ?? "",
  };

  return sanitizeTemplate(template).replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => values[key] ?? "");
}
