/*
 * introState — a tiny global signal for "has the boot/idle intro video
 * finished playing?".
 *
 * The intro plays as a full-screen OVERLAY (zIndex 10000) in _layout's
 * AuthGate. React Native `Modal`s and native `Alert.alert`s render in a
 * SEPARATE native window that sits ABOVE any in-tree zIndex, so first-launch
 * popups (What's New, the demo-data welcome, the "was this payment processed?"
 * prompt) would otherwise appear ON TOP of the video. Those popups subscribe to
 * this signal and hold off until the intro is gone.
 */
import { useEffect, useState } from "react";

let finished = false;
const listeners = new Set<() => void>();

/** Set by AuthGate: mirrors `!showIntro` so popups block while the intro plays. */
export function setIntroFinished(v: boolean): void {
  if (finished === v) return;
  finished = v;
  listeners.forEach((l) => l());
}

export function isIntroFinished(): boolean {
  return finished;
}

/** Reactive hook — re-renders when the intro overlay appears/disappears. */
export function useIntroFinished(): boolean {
  const [v, setV] = useState(finished);
  useEffect(() => {
    const l = () => setV(finished);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}
