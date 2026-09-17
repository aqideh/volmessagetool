function ordinalSuffix(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";

  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function parseIsoDate(value: string): Date | undefined {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

/**
 * Formats an ISO date (YYYY-MM-DD) without timezone conversion.
 * Example: 2026-09-12 -> 12th September 2026.
 */
export function formatDisplayDate(value: string): string {
  if (!value) return "";
  const parsed = parseIsoDate(value);
  if (!parsed) return value;

  const day = parsed.getDate();
  const year = parsed.getFullYear();
  const monthName = new Intl.DateTimeFormat("en-SG", { month: "long" }).format(parsed);
  return `${day}${ordinalSuffix(day)} ${monthName} ${year}`;
}

/** Returns an inclusive list of ISO dates between start and end. */
export function dateRange(start: string, end?: string): string[] {
  const startDate = parseIsoDate(start);
  if (!startDate) return start ? [start] : [];
  const endDate = parseIsoDate(end || start);
  if (!endDate || endDate < startDate) return [start];

  const dates: string[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function formatDisplayDateRange(start: string, end?: string): string {
  if (!end || end === start) return formatDisplayDate(start);
  return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
}
