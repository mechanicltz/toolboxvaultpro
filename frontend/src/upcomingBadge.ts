/**
 * Global "new upcoming features" badge with an unseen COUNT.
 *
 * Shows a red dot carrying the number of new/changed roadmap features on the
 * Vault tab, the dashboard wordmark and the Vault → Upcoming Features row.
 * Visiting the Upcoming Features screen calls markUpcomingSeen() which clears
 * the count everywhere. The "seen" set of feature tokens is persisted per-device
 * in AsyncStorage.
 */
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { api } from "./api";

const SEEN_KEY = "tbv_upcoming_seen_tokens";

let currentTokens: string[] = [];
let newCount = 0;
let lastFetch = 0;
const listeners = new Set<() => void>();

// Mirror the unseen-features count onto the native iOS/Android app-icon badge
// (the red bubble on the home-screen icon). Best-effort: no-op on web and when
// notification/badge permission hasn't been granted.
async function syncAppIconBadge(count: number): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    /* permission not granted / unsupported — ignore */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

// One token per feature; changes when a feature is added/edited or its status
// changes. Empty releases still contribute a release-level token.
function tokensOf(releases: any[]): string[] {
  if (!Array.isArray(releases)) return [];
  const out: string[] = [];
  for (const r of releases) {
    const feats = Array.isArray(r?.features) ? r.features : [];
    if (feats.length === 0) {
      out.push(`${r?.id || ""}:_`);
    } else {
      for (const f of feats) {
        out.push(`${r?.id || ""}:${f?.id || ""}:${f?.title || ""}:${f?.status || ""}`);
      }
    }
  }
  return out;
}

async function computeFrom(releases: any[]) {
  currentTokens = tokensOf(releases);
  let seen: string[] = [];
  try {
    seen = JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) || "[]");
  } catch {
    seen = [];
  }
  const seenSet = new Set(seen);
  const next = currentTokens.filter((t) => !seenSet.has(t)).length;
  if (next !== newCount) {
    newCount = next;
    emit();
  }
  // Always keep the native app-icon badge in sync with the unseen count.
  syncAppIconBadge(next);
}

export async function refreshUpcomingBadge(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastFetch < 15000) return; // throttle
  lastFetch = now;
  try {
    const releases = await api.listUpcomingFeatures();
    await computeFrom(Array.isArray(releases) ? releases : []);
  } catch {
    /* offline / not logged in — leave state as-is */
  }
}

export async function markUpcomingSeen(): Promise<void> {
  try {
    const releases = await api.listUpcomingFeatures();
    currentTokens = tokensOf(Array.isArray(releases) ? releases : []);
  } catch {
    /* keep last-known tokens */
  }
  try {
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(currentTokens));
  } catch {
    /* best-effort */
  }
  if (newCount !== 0) {
    newCount = 0;
    emit();
  }
  // Clear the native app-icon badge too.
  syncAppIconBadge(0);
}

/** Subscribe a component to the unseen count. Triggers a throttled refresh on mount. */
export function useUpcomingBadge(): number {
  const [val, setVal] = useState(newCount);
  useEffect(() => {
    const l = () => setVal(newCount);
    listeners.add(l);
    refreshUpcomingBadge();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return val;
}
