// Splash intro trigger logic — simplified.
//
// Rule: the intro plays exactly once per JS process (i.e. on cold
// boot). Any subsequent calls during the same process — including
// foreground/background cycles — return false. Quitting the app from
// the iOS app switcher (or fully killing Expo Go) destroys the JS
// VM, so the module-level flag below resets and the intro will play
// again on the next launch.

let sessionIntroShown = false;

// Eagerly log so we can verify the bundle is fresh after a reload.
// If you see this exact line in Metro/Expo Go logs and the value is
// `false`, we know cold-boot detection is working as designed.
// eslint-disable-next-line no-console
console.log("[intro] idle module init — sessionIntroShown =", sessionIntroShown);

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
  const result = !sessionIntroShown;
  // eslint-disable-next-line no-console
  console.log("[intro] shouldShowIntro() →", result, "(sessionIntroShown:", sessionIntroShown, ")");
  return result;
}
