// Device contacts picker — wraps expo-contacts with permission handling.
// Returns a normalized picked contact or null if the user cancels / denies.
//
// Shape: { name: string, phone?: string, email?: string }
//
// On web (where expo-contacts is not supported) this returns null immediately,
// so callers can conditionally hide the "Import from Contacts" button.

import { Platform, Alert } from "react-native";
import * as Contacts from "expo-contacts";

export type PickedContact = {
  name: string;
  phone?: string;
  email?: string;
};

export function isDeviceContactsAvailable(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

export async function pickDeviceContact(): Promise<PickedContact | null> {
  if (!isDeviceContactsAvailable()) {
    Alert.alert(
      "Not available",
      "Importing from your device contacts is only available on iOS and Android.",
    );
    return null;
  }

  // Ask for permission
  let status: string;
  try {
    const res = await Contacts.requestPermissionsAsync();
    status = res.status;
  } catch (e) {
    Alert.alert("Contacts unavailable", "Could not request permission to access contacts.");
    return null;
  }

  if (status !== "granted") {
    Alert.alert(
      "Permission needed",
      "Toolbox Vault needs permission to access your contacts so you can import them. You can enable this from your device Settings.",
    );
    return null;
  }

  // Use the native contact picker when available (iOS only on expo-contacts 55+).
  // Fallback: load the contacts list and let the caller handle selection.
  try {
    // presentContactPickerAsync is available on iOS 14+.
    const pickerFn = (Contacts as any).presentContactPickerAsync;
    if (typeof pickerFn === "function") {
      const picked = await pickerFn();
      if (!picked) return null;
      return normalize(picked);
    }
  } catch {
    // fall through to fallback loader
  }

  return null;
}

// Load all contacts (name + first phone + first email). Useful for building a
// custom in-app picker on Android (no native picker ships with expo-contacts).
export async function loadAllDeviceContacts(): Promise<PickedContact[]> {
  if (!isDeviceContactsAvailable()) return [];

  try {
    const res = await Contacts.requestPermissionsAsync();
    if (res.status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Toolbox Vault needs permission to access your contacts so you can import them. You can enable this from your device Settings.",
      );
      return [];
    }
  } catch {
    return [];
  }

  try {
    const { data } = await Contacts.getContactsAsync({
      fields: [
        Contacts.Fields.Name,
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Emails,
      ],
      pageSize: 5000,
      pageOffset: 0,
    });

    const out: PickedContact[] = [];
    for (const c of data) {
      const name = (c.name || "").trim();
      if (!name) continue;
      const phone = c.phoneNumbers?.[0]?.number || undefined;
      const email = c.emails?.[0]?.email || undefined;
      out.push({
        name,
        phone: phone ? String(phone) : undefined,
        email: email ? String(email) : undefined,
      });
    }
    // Sort alphabetically for a predictable picker list
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  } catch {
    return [];
  }
}

function normalize(c: any): PickedContact {
  const name =
    c.name ||
    [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
    c.company ||
    "";
  const phone = c.phoneNumbers?.[0]?.number;
  const email = c.emails?.[0]?.email;
  return {
    name: String(name || ""),
    phone: phone ? String(phone) : undefined,
    email: email ? String(email) : undefined,
  };
}

// Convenience: pack phone/email into the single `contact` string the app stores.
export function formatContactField(p: PickedContact): string {
  const parts: string[] = [];
  if (p.phone) parts.push(p.phone);
  if (p.email) parts.push(p.email);
  return parts.join(" · ");
}
