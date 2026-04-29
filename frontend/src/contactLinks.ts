import { Linking, Alert, Platform } from "react-native";

/**
 * Format a phone-number-like string into the canonical 111-222-3333 shape.
 * - 10-digit numbers → "AAA-BBB-CCCC"
 * - 11-digit numbers starting with a 1 → "1-AAA-BBB-CCCC"
 * - 7-digit numbers → "BBB-CCCC"
 * - anything else → returned trimmed, untouched (international / short
 *   codes / weirdly-shaped inputs stay readable).
 */
export function formatPhone(raw?: string | null): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  const hasPlus = s.trim().startsWith("+");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  if (hasPlus && digits.length >= 8) {
    // Preserve international "+" prefix then group the rest.
    return `+${digits}`;
  }
  return s;
}

/**
 * Walk a free-form string and reformat every phone-like token in it
 * (leaving emails, names, separators, etc. untouched). Used for display
 * of legacy "contact" fields that users may have typed as
 * "555-867-5309 / ryan@example.com".
 */
export function formatPhonesInText(raw?: string | null): string {
  if (raw == null) return "";
  const s = String(raw);
  if (!s) return "";
  // Split on whitespace AND common separators but keep the separators so
  // the output still reads the same.
  return s.replace(
    /(\+?\d[\d\s().\-]{5,}\d)/g,
    (match) => formatPhone(match) || match,
  );
}

export type ContactKind = "email" | "phone" | "unknown";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// phone: starts optionally with +, then digits/spaces/dashes/parens/dots; min 5 digits
const PHONE_RE = /^[+]?[\s().\-\d]{5,}$/;

/**
 * Extract every email address and phone number from a free-form contact string.
 * Users often type "John 555-123-4567 / john@example.com" — we want to detect
 * both pieces and let the user pick.
 */
export function parseContacts(raw?: string | null): {
  emails: string[];
  phones: string[];
} {
  if (!raw) return { emails: [], phones: [] };
  const text = String(raw);
  const emails: string[] = [];
  const phones: string[] = [];

  // Pull out any email-shaped tokens first.
  const emailMatches = text.match(/[^\s,;|]+@[^\s,;|]+\.[^\s,;|]+/g);
  if (emailMatches) {
    for (const e of emailMatches) {
      const cleaned = e.replace(/[.,;]+$/, "");
      if (EMAIL_RE.test(cleaned) && !emails.includes(cleaned)) {
        emails.push(cleaned);
      }
    }
  }

  // Strip emails out, then look for phone-shaped tokens.
  let remaining = text;
  for (const e of emails) {
    remaining = remaining.split(e).join(" ");
  }
  // Try splitting on common separators and fall back to the whole string.
  const tokens = remaining
    .split(/[,;|/]+|\s{2,}/g)
    .map((t) => t.trim())
    .filter(Boolean);
  const candidates = tokens.length > 0 ? tokens : [remaining.trim()];
  for (const t of candidates) {
    if (!t) continue;
    const digitsOnly = t.replace(/[^\d]/g, "");
    if (digitsOnly.length >= 7 && digitsOnly.length <= 15 && PHONE_RE.test(t)) {
      const formatted = formatPhone(t);
      if (!phones.includes(formatted)) phones.push(formatted);
    }
  }

  return { emails, phones };
}

export function classifyContact(raw?: string | null): ContactKind {
  const { emails, phones } = parseContacts(raw);
  if (emails.length > 0) return "email";
  if (phones.length > 0) return "phone";
  return "unknown";
}

export async function openEmail(addr: string) {
  const url = `mailto:${encodeURIComponent(addr)}`;
  await openUrl(url, addr);
}

export async function openPhone(num: string) {
  const url = `tel:${cleanDialString(num)}`;
  await openUrl(url, num);
}

export async function openSms(num: string) {
  const url = `sms:${cleanDialString(num)}`;
  await openUrl(url, num);
}

function cleanDialString(num: string): string {
  // Strip non-dial characters except a leading +.
  return num
    .trim()
    .replace(/^[+]/, "PLUS_PLACEHOLDER")
    .replace(/[^\d]/g, "")
    .replace(/^PLUS_PLACEHOLDER/, "+");
}

async function openUrl(url: string, label: string) {
  try {
    if (Platform.OS === "web") {
      // Browsers may not have a tel: handler; fall back to clipboard prompt.
      window.location.href = url;
      return;
    }
    const ok = await Linking.canOpenURL(url);
    if (!ok) {
      Alert.alert("Cannot open", `No app available to handle ${label}.`);
      return;
    }
    await Linking.openURL(url);
  } catch (e) {
    Alert.alert("Error", String((e as Error)?.message || e));
  }
}
