/**
 * Industrial design system asset registry.
 *
 * Each asset has TWO sources — a dark-mode variant and a light-mode variant
 * for backgrounds. Texture/decoration assets (logo, bolts, panel, buttons,
 * tabs) are theme-agnostic and reuse the same generated PNG.
 *
 * Returns `null` if the asset hasn't been generated yet, so components can
 * fall back to a code-rendered placeholder gracefully.
 */
import { ImageSourcePropType } from "react-native";
import { useIndustrialTheme } from "./IndustrialThemeContext";

// NOTE: require() calls are lazy in the sense that Metro picks them up at
// bundle time. We wrap each one in a try/catch using a try-require helper.
function tryRequire(loader: () => ImageSourcePropType): ImageSourcePropType | null {
  try { return loader(); } catch { return null; }
}

const REGISTRY = {
  background_dark: tryRequire(() => require("../../../assets/industrial/01_industrial_background_dark.jpg")),
  background_light: tryRequire(() => require("../../../assets/industrial/02_industrial_background_light.jpg")),
  logo_badge_octagon: tryRequire(() => require("../../../assets/industrial/03_logo_badge_octagon.png")),
  hammer_wrench_emblem: tryRequire(() => require("../../../assets/industrial/04_hammer_wrench_emblem.png")),
  panel_large_dark: tryRequire(() => require("../../../assets/industrial/05_panel_large_dark.png")),
  dashboard_tile: tryRequire(() => require("../../../assets/industrial/06_dashboard_tile.png")),
  button_primary_orange: tryRequire(() => require("../../../assets/industrial/07_button_primary_orange.png")),
  tab_active: tryRequire(() => require("../../../assets/industrial/08_tab_active.png")),
  tab_inactive: tryRequire(() => require("../../../assets/industrial/09_tab_inactive.png")),
  hex_bolts_pack: tryRequire(() => require("../../../assets/industrial/10_hex_bolts_pack.png")),
} as const;

export type IndustrialAssetKey = keyof typeof REGISTRY;

export function getAsset(key: IndustrialAssetKey): ImageSourcePropType | null {
  return REGISTRY[key] ?? null;
}

/** Theme-aware background asset (dark or light depending on current mode). */
export function useBackgroundAsset(): ImageSourcePropType | null {
  const { mode } = useIndustrialTheme();
  return mode === "light" ? REGISTRY.background_light : REGISTRY.background_dark;
}
