import { Linking, Alert, Platform } from "react-native";

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
      const norm = t.trim();
      if (!phones.includes(norm)) phones.push(norm);
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
  // Strip non-dial characters except leading +.
  const cleaned = num
    .trim()
    .replace(/^[+]/, "PLUS_PLACEHOLDER")
    .replace(/[^\d]/g, "")
    .replace(/^PLUS_PLACEHOLDER/, "+");
  const url = `tel:${cleaned}`;
  await openUrl(url, num);
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
