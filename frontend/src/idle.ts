// Tracks when the app was last "active" (in the foreground) so other
// parts of the app can decide whether enough time has passed to replay
// the intro splash video.
//
// The product spec is: replay the intro every time the app is opened
// AND it has been inactive for more than 5 minutes (i.e. left in
// background / killed and reopened).

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "tbv.last_active_ts";
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Record that the app is currently active. Call this whenever the user
 * is interacting (or right after the intro finishes) so we don't
 * needlessly re-trigger the splash on quick foreground/background
 * flickers.
 */
export async function markAppActive(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Returns true if the splash intro should play right now — either
 * because the app has never run, or because the last recorded activity
 * was more than IDLE_THRESHOLD_MS ago.
 */
export async function shouldShowIntro(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return true;
    const last = parseInt(raw, 10);
    if (!Number.isFinite(last)) return true;
    return Date.now() - last > IDLE_THRESHOLD_MS;
  } catch {
    return true;
  }
}
