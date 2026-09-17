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

/**
 * Formats an ISO date (YYYY-MM-DD) without timezone conversion.
 * Example: 2026-09-12 -> 12th September 2026.
 */
export function formatDisplayDate(value: string): string {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  const monthName = new Intl.DateTimeFormat("en-SG", { month: "long" }).format(
    new Date(year, month - 1, day),
  );
  return `${day}${ordinalSuffix(day)} ${monthName} ${year}`;
}
