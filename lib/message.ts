import type { AssignmentRecord, EventRecord, GeneralRecipientRecord, ShiftRecord, VolunteerRecord } from "./types";
import { firstName, titleCaseName } from "./name";
import { assignmentsForVolunteer } from "./assignments";
import { formatDisplayDate, formatDisplayDateRange } from "./date";

export const NAME_PREFERENCE_KEY = "volmessagetool-use-full-name";

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

export const EVENT_VARIABLES = [
  "event_name",
  "event_date",
  "event_time",
  "event_venue",
  "briefing_link",
  "whatsapp_group_link",
  "whatsapp_group_links",
  "date",
  "time",
  "venue",
  "shift_summary",
  ...SHIFT_VARIABLES,
] as const;

export const DEFAULT_TEMPLATE = `Hi {{first_name}}, thank you for volunteering for *{{event_name}}*.

📅 {{event_date}}
⏰ Event time: {{event_time}}
📍 {{event_venue}}
Please reply to this message if you have any questions.`;

export const GENERAL_DEFAULT_TEMPLATE = `Hi {{first_name}},

Thank you for your continued support as a volunteer.

Please reply to this message if you have any questions.`;

function useFullVolunteerName(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(NAME_PREFERENCE_KEY) === "true";
}

function configuredDayGroupLinks(event: EventRecord): Array<[string, string]> {
  return Object.entries(event.whatsappGroupLinksByDate ?? {})
    .map(([date, link]) => [date, link.trim()] as [string, string])
    .filter(([, link]) => Boolean(link))
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB));
}

function whatsappGroupLinkForDate(event: EventRecord, date?: string): string {
  const dayLinks = configuredDayGroupLinks(event);

  if (date) {
    const dayLink = dayLinks.find(([configuredDate]) => configuredDate === date)?.[1];
    if (dayLink) return dayLink;
  }

  if (dayLinks.length) return "";
  return event.whatsappGroupLink ?? "";
}

function formatWhatsAppGroupLinks(event: EventRecord, dates?: string[]): string {
  const allowedDates = dates?.length ? new Set(dates) : undefined;
  const allDayLinks = configuredDayGroupLinks(event);
  const entries = allDayLinks.filter(([date]) => !allowedDates || allowedDates.has(date));

  if (entries.length) {
    return entries.map(([date, link]) => `${formatDisplayDate(date)}: ${link}`).join("\n");
  }

  if (allDayLinks.length) return "";
  return event.whatsappGroupLink ?? "";
}

function formatShiftSummary(
  volunteerId: string,
  shifts: ShiftRecord[],
  assignments: AssignmentRecord[],
): string {
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const canonicalAssignments = assignmentsForVolunteer(assignments, volunteerId, shifts);

  return canonicalAssignments
    .map((assignment) => ({ assignment, shift: shiftById.get(assignment.shiftId) }))
    .filter((item): item is { assignment: AssignmentRecord; shift: ShiftRecord } => Boolean(item.shift))
    .sort((a, b) => `${a.shift.date}${a.shift.startTime}`.localeCompare(`${b.shift.date}${b.shift.startTime}`))
    .map(({ assignment, shift }, index) => {
      const lines = [
        `${index + 1}. ${shift.name}`,
        `📅 ${formatDisplayDate(shift.date)}`,
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

export function eventVariablesUsed(template: string): string[] {
  const eventVariables = new Set<string>(EVENT_VARIABLES);
  return [...new Set(templateVariables(template).filter((variable) => eventVariables.has(variable)))];
}

function personalValues(name: string, phone: string, fields: Record<string, string>) {
  const cleanedName = titleCaseName(name);
  const greetingName = useFullVolunteerName() ? cleanedName : firstName(cleanedName);
  return {
    ...fields,
    name: cleanedName,
    first_name: greetingName,
    phone,
  };
}

export function renderGeneralMessage(template: string, recipient: GeneralRecipientRecord): string {
  const values: Record<string, string> = personalValues(recipient.name, recipient.phone, recipient.fields);
  return sanitizeTemplate(template).replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => values[key] ?? "");
}

export function renderMessage(
  template: string,
  event: EventRecord,
  volunteer: VolunteerRecord,
  shift?: ShiftRecord,
  assignment?: AssignmentRecord,
  allShifts: ShiftRecord[] = [],
  allAssignments: AssignmentRecord[] = [],
): string {
  const role = assignment?.role ?? "";
  const volunteerAssignments = assignmentsForVolunteer(allAssignments, volunteer.id, allShifts);
  const volunteerShiftDates = [...new Set(
    volunteerAssignments
      .map((item) => allShifts.find((shiftItem) => shiftItem.id === item.shiftId)?.date)
      .filter((date): date is string => Boolean(date)),
  )].sort();
  const shiftSummary = formatShiftSummary(volunteer.id, allShifts, allAssignments);
  const groupDate = shift?.date || (volunteerShiftDates.length === 1 ? volunteerShiftDates[0] : event.date);
  const groupLinksForVolunteer = volunteerShiftDates.length > 1
    ? formatWhatsAppGroupLinks(event, volunteerShiftDates)
    : whatsappGroupLinkForDate(event, groupDate);
  const eventDateLabel = formatDisplayDateRange(event.date, event.endDate);

  const values: Record<string, string> = {
    ...personalValues(volunteer.name, volunteer.phone, volunteer.fields),
    role,
    role_line: role ? `\nYour assigned role is *${role}*.\n` : "",
    event_name: event.name,
    event_date: eventDateLabel,
    event_time: event.time,
    event_venue: event.venue,
    briefing_link: event.briefingLink ?? "",
    whatsapp_group_link: groupLinksForVolunteer,
    whatsapp_group_links: formatWhatsAppGroupLinks(event, volunteerShiftDates),
    shift_summary: shiftSummary,
    date: eventDateLabel,
    time: event.time,
    venue: event.venue,
    shift_name: shift?.name ?? "",
    shift_date: shift ? formatDisplayDate(shift.date) : "",
    shift_start: shift?.startTime ?? "",
    shift_end: shift?.endTime ?? "",
    reporting_time: shift?.reportingTime ?? "",
    shift_venue: shift?.venue ?? "",
    shift_notes: shift?.notes ?? "",
  };

  return sanitizeTemplate(template).replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => values[key] ?? "");
}
