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

let sessionIntroShown = false;

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
 * True on the very first call of each process; false thereafter.
 */
export async function shouldShowIntro(): Promise<boolean> {
  return !sessionIntroShown;
}
