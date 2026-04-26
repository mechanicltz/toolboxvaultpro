/**
 * Tiny in-memory cache for stale-while-revalidate pattern.
 * Lets list screens render previously-fetched data instantly on focus,
 * then refresh in the background when the network returns.
 *
 * Cache is cleared on page reload.
 */
const store = new Map<string, any>();

export function getCached<T>(key: string, fallback: T): T {
  return store.has(key) ? (store.get(key) as T) : fallback;
}

export function setCached<T>(key: string, value: T): T {
  store.set(key, value);
  return value;
}

export function clearCached(...keys: string[]) {
  if (!keys.length) {
    store.clear();
    return;
  }
  for (const k of keys) store.delete(k);
}

export function hasCached(key: string): boolean {
  return store.has(key);
}
