// Tracks when the app was last "active" so other parts of the app can
// decide whether to replay the intro splash video.
//
// Product spec (refined):
//   • COLD BOOT — every time the app is launched fresh (killed and
//     reopened, OS-reboot, first install, etc.) → ALWAYS show the intro.
//   • RESUME FROM BACKGROUND — only show the intro if the app sat in
//     the background for more than 5 minutes. Quick context switches
//     (checking Messages, returning to the app) should NOT replay it.
//
// We implement this with a module-level boolean that resets to false on
// every JS bridge restart (which happens on every cold boot of the
// native app). The 5-minute logic continues to live in AsyncStorage
// for background→active transitions.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "tbv.last_active_ts";
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// In-memory flag — true only after we've already shown the intro at
// least once in the current process. Reset to false whenever the app
// is fully killed and relaunched (because JS state evaporates).
let sessionIntroShown = false;

/**
 * Record that the app is currently active and that the intro has been
 * displayed (or skipped because the 5-min idle rule didn't trigger).
 * Call this whenever the intro finishes or whenever we decide to skip
 * it on a quick foreground/background flicker.
 */
export async function markAppActive(): Promise<void> {
  sessionIntroShown = true;
  try {
    await AsyncStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Returns true if the splash intro should play right now.
 *
 *   • Cold boot (sessionIntroShown still false)               → true
 *   • Resume from background after >5 minutes                 → true
 *   • Anything else (recent foreground/background switch)     → false
 */
export async function shouldShowIntro(): Promise<boolean> {
  // Cold boot — JS context is fresh, intro hasn't been shown yet this
  // process. Always play it.
  if (!sessionIntroShown) return true;

  // Already shown this session → only replay if the user has been
  // away for more than IDLE_THRESHOLD_MS.
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
