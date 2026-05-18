/**
 * Lightweight pub/sub for "app resumed from background" events.
 *
 * iOS suspends in-flight fetch() requests when the app is backgrounded.
 * When you bring the app back, those promises never resolve, leaving
 * screens stuck on their loading state forever. We solve this in two
 * steps:
 *
 *   1) api.ts gives every fetch a 20s AbortController timeout, AND
 *      registers each controller in an in-flight set so they can be
 *      aborted en masse.
 *   2) _layout.tsx's AppState listener detects background → active and
 *      calls abortAllInFlight() + notifyAppResume(). Screens that care
 *      about staying fresh subscribe via useAppResume() to immediately
 *      refetch instead of waiting for the next focus event.
 *
 * Keeping this module tiny + dependency-free so any file can import
 * without pulling in api.ts (avoids cycles).
 */
import { useEffect } from "react";

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeAppResume(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function notifyAppResume(): void {
  // Snapshot before iterating in case a listener unsubscribes mid-callback.
  const snap = Array.from(listeners);
  for (const cb of snap) {
    try {
      cb();
    } catch {
      // never let one bad listener break the others
    }
  }
}

/**
 * Hook helper — call your `load()` function whenever the app returns from
 * background to foreground. Usage:
 *
 *   useAppResume(load);
 */
export function useAppResume(cb: Listener): void {
  useEffect(() => {
    const unsub = subscribeAppResume(cb);
    return unsub;
  }, [cb]);
}
