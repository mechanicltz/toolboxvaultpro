// Splash intro trigger logic.
//
// Rule: the intro plays on every cold boot (when AuthGate's React
// state initializes fresh). The 5-minute background-resume rule is
// handled via the AppState listener in AuthGate combined with the
// sessionIntroShown flag below: if the user has already seen the
// intro this process, returning from a brief background does NOT
// replay it. Quitting the app from the iOS app switcher destroys the
// JS VM, so this module reloads fresh and the intro plays again on
// the next launch.
//
// User preference: the intro video can be turned OFF from the Vault →
// Settings screen. We cache it in memory (synchronous access for the
// cold-boot decision) and persist it in AsyncStorage. Default = ON.

import AsyncStorage from "@react-native-async-storage/async-storage";

let sessionIntroShown = false;

const INTRO_PREF_KEY = "tbv_intro_video_enabled";
let introVideoEnabled = true; // in-memory cache (default ON)
let prefLoaded = false;

// Warm the cache on import (fire-and-forget) so the cold-boot read is
// ready by the time AuthGate decides whether to play the intro.
const _loadPromise = (async () => {
  try {
    const v = await AsyncStorage.getItem(INTRO_PREF_KEY);
    if (v === "0") introVideoEnabled = false;
  } catch {
    /* keep default ON */
  } finally {
    prefLoaded = true;
  }
})();

/** Synchronous best-effort read of the cached preference. */
export function getIntroVideoEnabled(): boolean {
  return introVideoEnabled;
}

/** Awaits the first load so callers get the persisted value. */
export async function getIntroVideoEnabledAsync(): Promise<boolean> {
  if (!prefLoaded) {
    try {
      await _loadPromise;
    } catch {
      /* ignore */
    }
  }
  return introVideoEnabled;
}

/** Persist + update the cached preference. */
export async function setIntroVideoEnabled(on: boolean): Promise<void> {
  introVideoEnabled = on;
  try {
    await AsyncStorage.setItem(INTRO_PREF_KEY, on ? "1" : "0");
  } catch {
    /* best-effort */
  }
}

/**
 * Record that the intro has been shown (or skipped) for the current
 * process. After this call shouldShowIntro() will return false until
 * the next cold boot.
 */
export function markAppActive(): void {
  sessionIntroShown = true;
}

/**
 * Returns true if the splash intro should play right now.
 * False if the user disabled it, or it was already shown this process.
 */
export async function shouldShowIntro(): Promise<boolean> {
  if (!introVideoEnabled) return false;
  return !sessionIntroShown;
}
