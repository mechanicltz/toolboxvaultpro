/**
 * TBV asset registry — wraps every official Toolbox Vault asset behind a
 * named accessor so screens never hard-code paths.
 * All assets are under /app/frontend/assets/tbv/.
 */
import { ImageSourcePropType } from "react-native";
import { useTBV } from "./TBVThemeContext";

function safe(req: () => ImageSourcePropType): ImageSourcePropType | null {
  try { return req(); } catch { return null; }
}

export const TBV_ASSETS = {
  // Branding
  master_logo_dark: safe(() => require("../../../assets/tbv/tbv_master_logo_dark_v2.png")),
  master_logo_light: safe(() => require("../../../assets/tbv/tbv_master_logo_light.png")),
  app_icon_dark: safe(() => require("../../../assets/tbv/tbv_app_icon_dark.png")),
  app_icon_light: safe(() => require("../../../assets/tbv/tbv_app_icon_light.png")),
  wordmark_dark: safe(() => require("../../../assets/tbv/tbv_wordmark_dark.png")),
  wordmark_light: safe(() => require("../../../assets/tbv/tbv_wordmark_light.png")),
  // Brand badge / emblem (per user: backup/reference only)
  brand_badge_dark: safe(() => require("../../../assets/tbv/tbv_brand_badge_dark.png")),
  brand_badge_light: safe(() => require("../../../assets/tbv/tbv_brand_badge_light.png")),
  brand_emblem_dark: safe(() => require("../../../assets/tbv/tbv_brand_emblem_dark.png")),
  // Backgrounds (JPEG compressed)
  background_dark: safe(() => require("../../../assets/tbv/tbv_background_dark.jpg")),
  background_light: safe(() => require("../../../assets/tbv/tbv_background_light.jpg")),
  splash_dark: safe(() => require("../../../assets/tbv/tbv_splash_dark.jpg")),
  splash_light: safe(() => require("../../../assets/tbv/tbv_splash_light.jpg")),
  // UI — used selectively per Part 5C rules
  gear_overlay_dark: safe(() => require("../../../assets/tbv/tbv_gear_overlay_dark.png")),
  gear_overlay_light: safe(() => require("../../../assets/tbv/tbv_gear_overlay_light.png")),
  hex_bolts_dark: safe(() => require("../../../assets/tbv/tbv_hex_bolts_dark.png")),
  hex_bolts_light: safe(() => require("../../../assets/tbv/tbv_hex_bolts_light.png")),
  panel_frame_dark: safe(() => require("../../../assets/tbv/tbv_panel_frame_dark.png")),
  panel_frame_light: safe(() => require("../../../assets/tbv/tbv_panel_frame_light.png")),
} as const;

export type TBVAssetKey = keyof typeof TBV_ASSETS;

export function getTBVAsset(key: TBVAssetKey): ImageSourcePropType | null {
  return TBV_ASSETS[key] ?? null;
}

/** Theme-aware accessor: returns the correct variant for current mode. */
export function useTBVAsset(
  pair: { dark: TBVAssetKey; light: TBVAssetKey } | TBVAssetKey,
): ImageSourcePropType | null {
  const { resolvedMode } = useTBV();
  if (typeof pair === "string") return TBV_ASSETS[pair];
  return TBV_ASSETS[resolvedMode === "light" ? pair.light : pair.dark];
}

export function useBackground(): ImageSourcePropType | null {
  return useTBVAsset({ dark: "background_dark", light: "background_light" });
}
export function useMasterLogo(): ImageSourcePropType | null {
  return useTBVAsset({ dark: "master_logo_dark", light: "master_logo_light" });
}
export function useWordmark(): ImageSourcePropType | null {
  return useTBVAsset({ dark: "wordmark_dark", light: "wordmark_light" });
}
export function useSplash(): ImageSourcePropType | null {
  return useTBVAsset({ dark: "splash_dark", light: "splash_light" });
}
export function usePanelFrame(): ImageSourcePropType | null {
  return useTBVAsset({ dark: "panel_frame_dark", light: "panel_frame_light" });
}
