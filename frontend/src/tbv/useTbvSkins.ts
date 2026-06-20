/**
 * Toolbox Vault — industrial skin preloader.
 *
 * The login / forgot-password / (future) home screens are built entirely from
 * PNG image skins. On a COLD boot (or web, where nothing is cached) those
 * bitmaps haven't been decoded yet, so the layout paints first and the metal
 * art "pops in" a moment later — the tacky black-screen-then-images effect.
 *
 * This module decodes + caches every skin ONCE (via expo-asset) so screens can
 * gate their first paint until the art is ready. We also warm the cache during
 * the boot intro video (see app/_layout.tsx) so by the time a skin-based screen
 * appears the images are already decoded → no spinner, no pop-in.
 */
import { useEffect, useState } from "react";
import { Asset } from "expo-asset";
import { SKIN_LIST } from "./skins";
import { SILVER_SRC_BY_COLOR } from "./silver";

let _ready = false;
let _promise: Promise<void> | null = null;

// Every industrial bitmap to warm at boot: the Iron Forge skin set PLUS the
// Steel family's brushed-silver panel art (all 4 colour variants). The Steel
// panels were previously NOT in this list, so they decoded lazily on the first
// Steel screen — the art "took a moment to appear" vs Iron Forge's instant
// paint. Preloading them here makes both families paint instantly.
const PRELOAD_LIST = [
  ...(SKIN_LIST as number[]),
  ...(Object.values(SILVER_SRC_BY_COLOR) as number[]),
];

/** Kick off (or reuse) the one-time decode of every industrial skin. */
export function preloadTbvSkins(): Promise<void> {
  if (_ready) return Promise.resolve();
  if (!_promise) {
    _promise = Asset.loadAsync(PRELOAD_LIST)
      .then(() => {
        _ready = true;
      })
      .catch(() => {
        // Never block the UI forever if a single asset fails to prefetch —
        // the <Image> will still attempt its own load.
        _ready = true;
      });
  }
  return _promise;
}

/** True once every skin has been decoded/cached. */
export function tbvSkinsReady(): boolean {
  return _ready;
}

/** Hook: returns true once the industrial skins are decoded & cached. */
export function useTbvSkinsReady(): boolean {
  const [ready, setReady] = useState(_ready);
  useEffect(() => {
    if (_ready) {
      if (!ready) setReady(true);
      return;
    }
    let mounted = true;
    preloadTbvSkins().then(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ready;
}
