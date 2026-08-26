import { parsePhoneNumberFromString } from "libphonenumber-js";

export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const compact = raw.replace(/[\s()-]/g, "");
  const candidate = compact.startsWith("+") ? compact : compact.length === 8 ? `+65${compact}` : compact;
  const parsed = parsePhoneNumberFromString(candidate, "SG");

  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function whatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
