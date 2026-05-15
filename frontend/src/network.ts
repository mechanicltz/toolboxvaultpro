// Lightweight non-React module that tracks online state.
// We import this from api.ts (which can't use hooks) AND from the
// NetworkProvider component, so they share a single source of truth.

import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

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

// --- Debounce + null-event filtering ---------------------------------------
// When the app resumes from background on iOS, NetInfo briefly fires a series
// of transient events (`isInternetReachable === null` or `isConnected === false`)
// while the OS re-establishes its network stack. Without filtering, this
// flashes the OFFLINE banner for ~1 second every time the user switches apps,
// which is what users perceive as the "random offline flash" bug.
//
// Strategy:
//   1. Ignore events where `isInternetReachable === null` AND we currently
//      think we're online — there's no reliable signal yet, so keep state.
//   2. Going OFFLINE is debounced: only report offline after a sustained
//      OFFLINE_DEBOUNCE_MS window. Brief blips (<2s) are absorbed.
//   3. Going ONLINE is instant — the user shouldn't wait for the banner to
//      disappear once the connection is verified.
// Increased from 2.5s → 6s. When iOS app-switches happen, NetInfo can fire
// transient `offline` events for up to 4-5 seconds while the network stack
// re-handshakes (especially after backgrounding for a while or on cellular).
// 6 seconds reliably absorbs those without making the user wait noticeably
// longer for a real disconnect.
const OFFLINE_DEBOUNCE_MS = 6000;
let pendingOfflineTimer: ReturnType<typeof setTimeout> | null = null;

function clearPendingOffline() {
  if (pendingOfflineTimer) {
    clearTimeout(pendingOfflineTimer);
    pendingOfflineTimer = null;
  }
}

function applyNetInfoState(state: NetInfoState) {
  // Ignore inconclusive events: if reachability is unknown and we currently
  // believe we're online, don't flip — wait for a definitive event.
  if (state.isInternetReachable === null && onlineState) {
    return;
  }

  const reachable =
    state.isInternetReachable === null
      ? !!state.isConnected
      : !!state.isInternetReachable;

  if (reachable) {
    // Recovered (or stayed online). Cancel any pending offline notification
    // and report online immediately.
    clearPendingOffline();
    setOnline(true);
    return;
  }

  // Reported offline. Only commit it after the debounce window — if we get
  // an online event within that window, we never raise the offline banner.
  if (pendingOfflineTimer) return; // already waiting
  pendingOfflineTimer = setTimeout(() => {
    pendingOfflineTimer = null;
    setOnline(false);
  }, OFFLINE_DEBOUNCE_MS);
}

// Initialise the cross-app listener exactly once.
let started = false;
export function startNetworkWatcher() {
  if (started) return;
  started = true;
  NetInfo.addEventListener(applyNetInfoState);
  // Eagerly fetch once so the initial value is correct.
  NetInfo.fetch().then(applyNetInfoState).catch(() => {
    /* ignore — keep optimistic default */
  });
}

export class OfflineError extends Error {
  constructor(message = "You're offline. This change can't be saved until you reconnect.") {
    super(message);
    this.name = "OfflineError";
  }
}
