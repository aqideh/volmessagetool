import type { EventRecord, VolunteerRecord } from "./types";

export const DEFAULT_TEMPLATE = `Hi {{first_name}}, thank you for volunteering for *{{event_name}}*.

📅 {{date}}
⏰ Reporting time: {{time}}
📍 {{venue}}
{{role_line}}
Please reply to this message if you have any questions.`;

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function renderMessage(template: string, event: EventRecord, volunteer: VolunteerRecord): string {
  const values: Record<string, string> = {
    name: volunteer.name,
    first_name: firstName(volunteer.name),
    phone: volunteer.phone,
    role: volunteer.role,
    role_line: volunteer.role ? `\nYour assigned role is *${volunteer.role}*.\n` : "",
    event_name: event.name,
    date: event.date,
    time: event.time,
    venue: event.venue,
    ...volunteer.fields,
  };

  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => values[key] ?? "");
}
