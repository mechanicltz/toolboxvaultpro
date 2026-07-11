/*
 * onboardingState — global signal for "has the first-launch permission
 * onboarding finished (or been skipped / already done)?".
 *
 * The permission priming cards must appear AFTER the intro video and BEFORE
 * any other first-launch popup (What's New, demo welcome, payments-due). Those
 * popups already wait on `introState`; they additionally wait on this signal so
 * the permission cards are never buried underneath them.
 */
import { useEffect, useState } from "react";

let done = false;
const listeners = new Set<() => void>();

export function setPermissionsOnboardingDone(v: boolean): void {
  if (done === v) return;
  done = v;
  listeners.forEach((l) => l());
}

export function isPermissionsOnboardingDone(): boolean {
  return done;
}

/** Reactive hook — re-renders when the onboarding flow completes. */
export function usePermissionsOnboardingDone(): boolean {
  const [v, setV] = useState(done);
  useEffect(() => {
    const l = () => setV(done);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}
