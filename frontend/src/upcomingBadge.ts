/**
 * Global "new upcoming features" badge.
 *
 * Shows a red dot on the Vault tab, the dashboard wordmark and the Vault →
 * Upcoming Features row whenever the admin has published/edited the roadmap
 * since this user last opened the Upcoming Features screen. Visiting that
 * screen calls markUpcomingSeen() which clears the dot everywhere.
 *
 * State is shared via a tiny pub-sub store (no Context wiring needed) and the
 * "seen" marker is persisted per-device in AsyncStorage.
 */
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const SEEN_KEY = "tbv_upcoming_seen_sig";

let currentSig = "";
let hasNew = false;
let lastFetch = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function computeSig(releases: any[]): string {
  if (!Array.isArray(releases) || releases.length === 0) return "";
  // Signature changes whenever a release is added/removed or edited.
  const parts = releases
    .map((r) => `${r.id || ""}:${r.updated_at || r.created_at || ""}`)
    .sort();
  return `${releases.length}|${parts.join(",")}`;
}

export async function refreshUpcomingBadge(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastFetch < 15000) return; // throttle
  lastFetch = now;
  try {
    const releases = await api.listUpcomingFeatures();
    currentSig = computeSig(Array.isArray(releases) ? releases : []);
    const seen = (await AsyncStorage.getItem(SEEN_KEY)) || "";
    const next = currentSig !== "" && currentSig !== seen;
    if (next !== hasNew) {
      hasNew = next;
      emit();
    }
  } catch {
    /* offline / not logged in — leave state as-is */
  }
}

export async function markUpcomingSeen(): Promise<void> {
  try {
    // Re-fetch the latest signature so we mark exactly what's live right now.
    const releases = await api.listUpcomingFeatures();
    currentSig = computeSig(Array.isArray(releases) ? releases : []);
  } catch {
    /* keep whatever sig we last computed */
  }
  try {
    await AsyncStorage.setItem(SEEN_KEY, currentSig);
  } catch {
    /* best-effort */
  }
  if (hasNew) {
    hasNew = false;
    emit();
  }
}

/** Subscribe a component to the badge state. Triggers a throttled refresh on mount. */
export function useUpcomingBadge(): boolean {
  const [val, setVal] = useState(hasNew);
  useEffect(() => {
    const l = () => setVal(hasNew);
    listeners.add(l);
    refreshUpcomingBadge();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return val;
}
