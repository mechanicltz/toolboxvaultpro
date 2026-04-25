import { Alert, Platform } from "react-native";

/**
 * Cross-platform confirm dialog. Returns a promise that resolves to true
 * when user confirms, false on cancel. Uses window.confirm on web (since
 * Alert.alert callback buttons don't work reliably on web) and Alert.alert
 * on native iOS/Android.
 */
export function confirm(
  title: string,
  message?: string,
  confirmLabel = "Confirm",
  destructive = false
): Promise<boolean> {
  if (Platform.OS === "web") {
    const ok = typeof window !== "undefined" && typeof window.confirm === "function"
      ? window.confirm(message ? `${title}\n\n${message}` : title)
      : false;
    return Promise.resolve(!!ok);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}
