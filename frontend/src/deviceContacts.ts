// Device contacts picker — wraps expo-contacts with permission handling.
//
// iOS:
//   - Use the NATIVE iOS contact picker (`presentContactPickerAsync`).
//     This works in Expo Go and in dev builds without the contacts
//     entitlement that `getContactsAsync` requires on iOS 14+.
//
// Android:
//   - There is no native picker, so we load all contacts with
//     `getContactsAsync()` and let the caller render an in-app picker.
//
// Web: not supported — the caller hides the import button.

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

export function isAndroidPickerNeeded(): boolean {
  // Only Android needs an in-app picker. iOS uses the native sheet.
  return Platform.OS === "android";
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
    name: String(name || "").trim(),
    phone: phone ? String(phone).trim() : undefined,
    email: email ? String(email).trim() : undefined,
  };
}

export function formatContactField(p: PickedContact): string {
  const parts: string[] = [];
  if (p.phone) parts.push(p.phone);
  if (p.email) parts.push(p.email);
  return parts.join(" · ");
}

/**
 * iOS — present the native contact picker sheet. Returns the picked
 * contact (already normalised) or null if the user cancelled. Caller
 * should use this on iOS instead of loading the full list.
 */
export async function pickContactNativeIOS(): Promise<PickedContact | null> {
  if (Platform.OS !== "ios") return null;
  try {
    const fn = (Contacts as any).presentContactPickerAsync;
    if (typeof fn !== "function") {
      Alert.alert(
        "Contacts unavailable",
        "Your version of Expo Contacts is too old to support the native picker. Please update the app.",
      );
      return null;
    }
    const picked: any = await fn();
    if (!picked) return null; // user tapped Cancel
    const out = normalize(picked);
    if (!out.name) {
      Alert.alert(
        "Couldn't read contact",
        "We couldn't read a name from that contact. Try picking another one.",
      );
      return null;
    }
    return out;
  } catch (e: any) {
    Alert.alert(
      "Couldn't open contacts",
      e?.message || "Something went wrong opening the iOS contact picker.",
    );
    return null;
  }
}

/**
 * Android — load all contacts so we can render an in-app picker.
 * Caller is responsible for showing the modal & filter UI.
 */
export async function loadAllDeviceContactsAndroid(): Promise<PickedContact[]> {
  if (Platform.OS !== "android") return [];

  try {
    const res = await Contacts.requestPermissionsAsync();
    if (res.status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Toolbox Vault needs permission to read your contacts. Open your device Settings → Apps → Toolbox Vault → Permissions → Contacts to allow it.",
      );
      return [];
    }
  } catch (e: any) {
    Alert.alert(
      "Permission error",
      e?.message || "Couldn't request contacts permission.",
    );
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
      const norm = normalize(c);
      if (!norm.name) continue;
      out.push(norm);
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  } catch (e: any) {
    Alert.alert(
      "Couldn't load contacts",
      e?.message || "Something went wrong reading your contacts list.",
    );
    return [];
  }
}
