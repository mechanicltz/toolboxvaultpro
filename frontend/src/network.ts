// Lightweight non-React module that tracks online state.
// We import this from api.ts (which can't use hooks) AND from the
// NetworkProvider component, so they share a single source of truth.

import NetInfo from "@react-native-community/netinfo";

let onlineState = true; // optimistic default before first NetInfo event
const listeners = new Set<(online: boolean) => void>();

export function isOnline(): boolean {
  return onlineState;
}

export function setOnline(next: boolean) {
  if (onlineState === next) return;
  onlineState = next;
  listeners.forEach((l) => {
    try {
      l(next);
    } catch {
      /* ignore listener errors */
    }
  });
}

export function subscribeOnline(fn: (online: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Initialise the cross-app listener exactly once.
let started = false;
export function startNetworkWatcher() {
  if (started) return;
  started = true;
  NetInfo.addEventListener((state) => {
    // `isInternetReachable` may be null on first event; fall back to isConnected.
    const reachable =
      state.isInternetReachable === null
        ? !!state.isConnected
        : !!state.isInternetReachable;
    setOnline(reachable);
  });
  // Eagerly fetch once so the initial value is correct.
  NetInfo.fetch().then((state) => {
    const reachable =
      state.isInternetReachable === null
        ? !!state.isConnected
        : !!state.isInternetReachable;
    setOnline(reachable);
  });
}

export class OfflineError extends Error {
  constructor(message = "You're offline. This change can't be saved until you reconnect.") {
    super(message);
    this.name = "OfflineError";
  }
}
