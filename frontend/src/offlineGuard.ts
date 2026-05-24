// Centralised "this needs internet" alert. Used both as a manual guard
// (call before kicking off some interactive flow that *can't* even start
// offline, like opening AI Toolbox Analysis) and as the message shown
// automatically by api.ts when a mutation fails because we're offline.

import { Alert, Platform } from "react-native";
import { isOnline } from "./network";

export function showOfflineAlert(
  what: string = "This action",
  message?: string,
  title: string = "You're offline",
) {
  const body =
    message ||
    `${what} needs an internet connection. Reconnect to Wi-Fi or mobile data and try again.`;
  if (Platform.OS === "web") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w: any = (globalThis as any).window;
    if (w?.alert) {
      w.alert(`${title}\n\n${body}`);
      return;
    }
  }
  Alert.alert(title, body);
}

/**
 * Returns true if online; if offline, fires the alert and returns false.
 * Use at the top of any handler that simply cannot proceed offline
 * (e.g. AI features, sign-in, opening the contact picker that needs new
 * permission grant, etc.).
 */
export function requireOnline(what: string = "This action"): boolean {
  if (isOnline()) return true;
  showOfflineAlert(what);
  return false;
}
