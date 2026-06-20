/**
 * Persistent stale-while-revalidate cache.
 *
 * - In-memory mirror gives instant synchronous reads from screens
 * - AsyncStorage backs every entry so cached data survives app restarts
 *   AND is available offline
 * - `loadCacheFromDisk()` is fired once at app start to hydrate memory
 * - Same `getCached/setCached/clearCached/hasCached` API as before so no
 *   existing screen needs to change
 *
 * Cache keys:
 *   GET cache:     `tt.cache.api:<path>`
 *   Generic store: free-form keys passed by callers
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "tt.cache.";
const memory = new Map<string, any>();
const meta = new Map<string, number>(); // last-updated timestamp (ms) per key
let hydrated = false;
let writeQueue: Promise<void> = Promise.resolve();

function diskKey(k: string) {
  return PREFIX + k;
}

function metaDiskKey(k: string) {
  return PREFIX + "@meta:" + k;
}

export function getCached<T>(key: string, fallback: T): T {
  return memory.has(key) ? (memory.get(key) as T) : fallback;
}

export function getCachedAt(key: string): number | null {
  return meta.has(key) ? (meta.get(key) as number) : null;
}

export function hasCached(key: string): boolean {
  return memory.has(key);
}

export function setCached<T>(key: string, value: T): T {
  memory.set(key, value);
  const now = Date.now();
  meta.set(key, now);
  // queue the disk write — never block the caller
  writeQueue = writeQueue.then(async () => {
    try {
      await AsyncStorage.setItem(diskKey(key), JSON.stringify(value));
      await AsyncStorage.setItem(metaDiskKey(key), String(now));
    } catch {
      /* disk write best-effort */
    }
  });
  return value;
}

export function clearCached(...keys: string[]) {
  if (!keys.length) {
    memory.clear();
    meta.clear();
    writeQueue = writeQueue.then(async () => {
      try {
        const all = await AsyncStorage.getAllKeys();
        const ours = all.filter((k) => k.startsWith(PREFIX));
        if (ours.length) await AsyncStorage.multiRemove(ours);
      } catch {
        /* ignore */
      }
    });
    return;
  }
  for (const k of keys) {
    memory.delete(k);
    meta.delete(k);
    writeQueue = writeQueue.then(async () => {
      try {
        await AsyncStorage.removeItem(diskKey(k));
        await AsyncStorage.removeItem(metaDiskKey(k));
      } catch {
        /* ignore */
      }
    });
  }
}

/**
 * Clear every cache entry whose key starts with `prefix`.
 *
 * Used by mutation cache-invalidation so that a write to `/tools` busts not
 * just the bare `api:/tools` list but also every filtered/searched variant
 * (`api:/tools?search=...`) and per-item entry (`api:/tools/<id>`). Without
 * this, creating an item while a search filter was active left the cached
 * filtered list stale, so the new item appeared to "not save" until the
 * user pulled to refresh.
 */
export function clearCachedByPrefix(prefix: string) {
  const matches: string[] = [];
  for (const k of memory.keys()) {
    if (k.startsWith(prefix)) matches.push(k);
  }
  // Also pick up any meta-only keys that have no live memory entry.
  for (const k of meta.keys()) {
    if (k.startsWith(prefix) && !matches.includes(k)) matches.push(k);
  }
  if (matches.length) clearCached(...matches);
}

/**
 * Hydrate the in-memory mirror from disk. Call once during app launch
 * (in the AuthProvider for example) so the very first render of any
 * screen that uses `getCached(...)` already has data.
 */
export async function loadCacheFromDisk(): Promise<void> {
  if (hydrated) return;
  try {
    const all = await AsyncStorage.getAllKeys();
    const ours = all.filter((k) => k.startsWith(PREFIX) && !k.startsWith(PREFIX + "@meta:"));
    if (ours.length) {
      const pairs = await AsyncStorage.multiGet(ours);
      for (const [k, v] of pairs) {
        if (v == null) continue;
        const shortKey = k.substring(PREFIX.length);
        try {
          memory.set(shortKey, JSON.parse(v));
        } catch {
          /* skip corrupt entry */
        }
        try {
          const t = await AsyncStorage.getItem(metaDiskKey(shortKey));
          if (t) meta.set(shortKey, parseInt(t, 10) || 0);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* hydration is best-effort */
  } finally {
    hydrated = true;
  }
}

// Convenience key-builder for API GET responses
export function apiCacheKey(path: string): string {
  return `api:${path}`;
}
