/**
 * Subscription change broadcaster.
 *
 * When a user upgrades from Free to PRO (via in-app purchase OR by redeeming
 * a promo code) the backend immediately unlocks all of their tools — the
 * `_ScopedCollection` proxy stops filtering to the first 15. But mounted
 * list screens have stale data from the time when filtering WAS in effect.
 *
 * Rather than poll, the paywall fires a single "subscriptionChanged" event
 * after a successful upgrade, and every list screen listens for it and
 * re-fetches. Implementation is a deliberately tiny in-memory emitter — no
 * dependency on Zustand / Redux / RN's EventEmitter.
 *
 * Audit reference: #10 ("Free-tier 15-item cap is brittle").
 */
import { useEffect } from "react";

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Tell every subscriber that the user's subscription state changed.
 * Safe to call from anywhere (paywall purchase callback, promo redeem,
 * RevenueCat customerInfo refresh, etc).
 */
export function notifySubscriptionChanged(): void {
  // Snapshot before iterating in case a listener unsubscribes mid-loop.
  for (const fn of Array.from(listeners)) {
    try {
      fn();
    } catch (e) {
      // Never let a listener crash the broadcaster.
      // eslint-disable-next-line no-console
      console.warn("[subscriptionEvents] listener threw", e);
    }
  }
}

/**
 * React hook: re-run `callback` whenever the subscription changes.
 * Cleanup is automatic on unmount.
 */
export function useSubscriptionChange(callback: () => void): void {
  useEffect(() => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, [callback]);
}
