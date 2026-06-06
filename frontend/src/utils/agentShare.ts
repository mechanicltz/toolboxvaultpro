/**
 * agentShare
 * ----------
 * Helpers to (a) share an agent's details via the native share sheet
 * (Messages, Mail, etc.) and (b) save the agent to the device's Contacts.
 *
 * Contacts saving follows the permission contract: check first, request
 * contextually, and if blocked offer a route to Settings.
 */
import { Share, Alert, Linking } from "react-native";
import * as Contacts from "expo-contacts";

export type ShareableAgent = {
  name?: string;
  phone?: string;
  email?: string;
  location?: string;
  notes?: string;
};

/** Build a clean plain-text business card for sharing. */
export function buildAgentText(a: ShareableAgent, company?: string): string {
  const lines: string[] = [];
  if (a.name) lines.push(a.name);
  if (company) lines.push(company);
  if (a.phone) lines.push(`Phone: ${a.phone}`);
  if (a.email) lines.push(`Email: ${a.email}`);
  if (a.location) lines.push(`Address: ${a.location}`);
  if (a.notes) lines.push(`Notes: ${a.notes}`);
  return lines.join("\n");
}

/** Open the native share sheet (text / email / messages). */
export async function shareAgent(a: ShareableAgent, company?: string): Promise<void> {
  try {
    await Share.share({
      message: buildAgentText(a, company),
      title: a.name || "Contact",
    });
  } catch {
    /* user dismissed — no-op */
  }
}

function promptOpenSettings() {
  Alert.alert(
    "Contacts access needed",
    "To save this contact, allow Contacts access in Settings.",
    [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: () => Linking.openSettings() },
    ],
  );
}

/** Save the agent into the device's Contacts registry. */
export async function saveAgentToContacts(a: ShareableAgent, company?: string): Promise<void> {
  // 1) Check existing permission first.
  let { status, canAskAgain } = await Contacts.getPermissionsAsync();

  // 2) Request contextually if not yet granted.
  if (status !== "granted") {
    if (canAskAgain) {
      const res = await Contacts.requestPermissionsAsync();
      status = res.status;
      canAskAgain = res.canAskAgain;
    }
    if (status !== "granted") {
      // Denied / blocked — never dead-end, route to Settings.
      promptOpenSettings();
      return;
    }
  }

  // 3) Build and save the contact.
  const name = (a.name || "").trim();
  const [first, ...rest] = name.split(/\s+/);
  const contact: Contacts.Contact = {
    [Contacts.Fields.FirstName]: first || name || "Contact",
    [Contacts.Fields.LastName]: rest.join(" "),
    [Contacts.Fields.ContactType]: Contacts.ContactTypes.Person,
    name: name || "Contact",
  } as Contacts.Contact;

  if (company) (contact as any)[Contacts.Fields.Company] = company;
  if (a.phone)
    (contact as any)[Contacts.Fields.PhoneNumbers] = [
      { label: "mobile", number: a.phone },
    ];
  if (a.email)
    (contact as any)[Contacts.Fields.Emails] = [{ label: "work", email: a.email }];
  if (a.location)
    (contact as any)[Contacts.Fields.Addresses] = [
      { label: "work", street: a.location },
    ];
  if (a.notes) (contact as any)[Contacts.Fields.Note] = a.notes;

  try {
    await Contacts.addContactAsync(contact);
    Alert.alert("Saved", `${name || "Contact"} was added to your Contacts.`);
  } catch {
    Alert.alert("Couldn't save", "Something went wrong adding this contact.");
  }
}

/** Show the Share / Save action menu for an agent. */
export function shareOrSaveAgent(a: ShareableAgent, company?: string): void {
  Alert.alert(
    a.name || "Contact",
    "Share these details or save them to your device.",
    [
      { text: "Share", onPress: () => shareAgent(a, company) },
      { text: "Save to Contacts", onPress: () => saveAgentToContacts(a, company) },
      { text: "Cancel", style: "cancel" },
    ],
  );
}
