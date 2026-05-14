import { Platform } from "react-native";

// ---------------------------------------------------------------------------
// COLOR PALETTES
//
// The app has two palettes — DARK (the original industrial workshop look) and
// LIGHT (a soft cool-grey/blue alternative). Both share the same KEYS so any
// `c.bg`, `c.textPrimary` etc. works in either mode.
//
// The active palette is held in `currentPalette` and is mutated by the
// ThemeProvider when the user toggles. Components consume colors via
// `useColors()` (see themeContext.tsx) — that hook returns whatever palette
// is currently active AND triggers re-renders when it changes.
//
// `theme.colors` itself is a Proxy that ALWAYS returns the live palette
// value at property-access time. This means inline color usages — like
// `<Ionicons color={theme.colors.accent}/>` or `style={{ color: theme.colors.bg }}`
// — pick up the new theme automatically on the next render without any code
// changes. ONLY top-level `StyleSheet.create({...})` blocks need to be
// migrated to `useThemedStyles()`, because those snapshot color values at
// module-load time.
// ---------------------------------------------------------------------------

export type ColorPalette = {
  bg: string;
  bgSecondary: string;
  surface: string;
  surfaceAlt: string;
  glass: string;
  glassBorder: string;
  accent: string;
  accentSecondary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnAccent: string;
  border: string;
  borderSubtle: string;
  success: string;
  danger: string;
  warning: string;
  highlight: string;
  shadowDeep: string;
  shadowSoft: string;
  // Solid-color used by `theme.elevation.*` shadow stacks. In dark mode this
  // is the brand orange so the raised-card shadows actually glow on the
  // near-black bg (pure-black shadow disappears). In light mode it's plain
  // black so cards drop a normal dark shadow on the grey-blue page.
  shadowColor: string;
  // Shadow stack opacities — dark mode bumps these higher so the orange
  // glow registers against the dark bg.
  shadowOpacitySm: number;
  shadowOpacityMd: number;
  shadowOpacityLg: number;
  // Gradient endpoints for row/card tops + bottoms — used by LinearGradient
  // overlays so cards keep their 3D feel in both themes.
  rowGradTop: string;
  rowGradBottom: string;
  // Bottom tab bar background — adapts to theme (dark stays workshop-dark,
  // light becomes pure white with a top border).
  tabBarBg: string;
  tabBarBorder: string;
};

// Original Industrial Dark — orange/black workshop with 3D depth.
export const darkPalette: ColorPalette = {
  bg: "#0A0A0A",
  bgSecondary: "#1A1A1A",
  surface: "#0F0F0F",
  surfaceAlt: "#171717",
  glass: "rgba(249, 115, 22, 0.08)",
  glassBorder: "rgba(249, 115, 22, 0.22)",
  accent: "#F97316",
  accentSecondary: "#EA580C",
  textPrimary: "#FFFFFF",
  textSecondary: "#E5E5E5",
  textMuted: "#737373",
  textOnAccent: "#000000",
  border: "#2D2D2D",
  borderSubtle: "#1F1F1F",
  success: "#10B981",
  danger: "#EF4444",
  warning: "#F59E0B",
  highlight: "rgba(255, 255, 255, 0.10)",
  shadowDeep: "rgba(0, 0, 0, 0.8)",
  shadowSoft: "rgba(0, 0, 0, 0.5)",
  // Pure black shadow stack — classic invisible-on-dark behaviour but
  // matches the spec the user prefers.
  shadowColor: "#000000",
  shadowOpacitySm: 0.45,
  shadowOpacityMd: 0.55,
  shadowOpacityLg: 0.65,
  rowGradTop: "#1F1F1F",
  rowGradBottom: "#0E0E0E",
  tabBarBg: "#0A0A0A",
  tabBarBorder: "#1F1F1F",
};

// Light palette — soft cool grey-blue (NOT pure white per user request).
// Cards are pure white so they "raise" out of the grey-blue background.
// Yellow accent kept as the industrial brand colour. Text is near-black for
// AAA contrast against both the grey-blue background and the white cards.
export const lightPalette: ColorPalette = {
  bg: "#F1F4F8",              // soft cool grey-blue page background
  bgSecondary: "#FFFFFF",     // raised cards
  surface: "#FFFFFF",         // input fields / chips
  surfaceAlt: "#E9EDF3",      // alternate surface (table stripes, etc.)
  glass: "rgba(234, 88, 12, 0.10)",
  glassBorder: "rgba(234, 88, 12, 0.30)",
  accent: "#EA580C",          // deep orange — high contrast on white
  accentSecondary: "#C2410C",
  textPrimary: "#0F172A",     // near-black
  textSecondary: "#334155",
  textMuted: "#64748B",
  textOnAccent: "#FFFFFF",
  border: "#D8DEE6",
  borderSubtle: "#E5EAF1",
  success: "#059669",
  danger: "#DC2626",
  warning: "#D97706",
  highlight: "rgba(15, 23, 42, 0.06)",
  shadowDeep: "rgba(15, 23, 42, 0.18)",
  shadowSoft: "rgba(15, 23, 42, 0.10)",
  // Light mode keeps a plain dark navy shadow (no glow needed — already
  // pops on the grey-blue page bg).
  shadowColor: "#0F172A",
  shadowOpacitySm: 0.15,
  shadowOpacityMd: 0.18,
  shadowOpacityLg: 0.22,
  rowGradTop: "#FFFFFF",
  rowGradBottom: "#F3F5F8",
  tabBarBg: "#FFFFFF",
  tabBarBorder: "#D8DEE6",
};

// Mutable container — ThemeProvider swaps this object in place when the user
// toggles modes. The Proxy below reads from it on every property access.
export const currentPalette: ColorPalette = { ...darkPalette };

export function applyPalette(p: ColorPalette) {
  Object.assign(currentPalette, p);
}

// Live colors proxy — any read of `theme.colors.X` resolves to whatever is
// currently in `currentPalette`. This makes inline color usages (e.g.
// `color={theme.colors.textPrimary}` in JSX, or `style={{ color: theme.colors.X }}`)
// theme-reactive without any refactoring.
const colorsProxy = new Proxy({} as ColorPalette, {
  get(_, key: string) {
    return (currentPalette as Record<string, string>)[key];
  },
  has(_, key: string) {
    return key in currentPalette;
  },
  ownKeys() {
    return Object.keys(currentPalette);
  },
  getOwnPropertyDescriptor(_, key: string) {
    return {
      enumerable: true,
      configurable: true,
      value: (currentPalette as Record<string, string>)[key],
    };
  },
}) as ColorPalette;

export const theme = {
  // Dynamic — every access goes through the proxy.
  colors: colorsProxy,
  gradients: {
    base: ["#0A0A0A", "#181818", "#0A0A0A"],
    accent: ["#FDBA74", "#F97316", "#C2410C"],
    danger: ["#F87171", "#DC2626"],
    success: ["#34D399", "#059669"],
    surface: ["#202020", "#0F0F0F"],
    surfaceRaised: ["#262626", "#101010"],
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  radii: { none: 0, sm: 4, md: 8, lg: 12, pill: 999 },
  font: { h1: 32, h2: 24, h3: 20, body: 16, sm: 14, xs: 12 },
  // 3D elevation system — theme-reactive. Each elevation level is a getter
  // on a Proxy so every access reads `currentPalette.shadowColor` / opacities
  // at lookup time. In dark mode the shadow is brand orange (so cards glow
  // against the near-black bg); in light mode it's plain navy/black.
  // `themedStyles` re-evaluates after each ThemeProvider toggle so the
  // updated elevation values flow through immediately.
  elevation: buildElevationProxy(),
};

// ---------------------------------------------------------------------------
// Helpers to build the dynamic elevation shadow set. We construct fresh
// objects on every access so the values track currentPalette.shadowColor.
// ---------------------------------------------------------------------------
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return { r, g, b };
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type ElevKey = "sm" | "md" | "lg" | "accent" | "inset";

function makeElevation(key: ElevKey): any {
  const sh = currentPalette.shadowColor || "#000";
  if (Platform.OS === "web") {
    if (key === "sm") {
      return {
        boxShadow: `0 1px 2px ${rgba(sh, currentPalette.shadowOpacitySm)}, 0 3px 6px ${rgba(sh, currentPalette.shadowOpacitySm - 0.05)}, inset 0 1px 0 rgba(255, 255, 255, 0.10), inset 0 -1px 0 rgba(0, 0, 0, 0.50)`,
      };
    }
    if (key === "md") {
      return {
        boxShadow: `0 2px 4px ${rgba(sh, currentPalette.shadowOpacityMd)}, 0 8px 16px ${rgba(sh, currentPalette.shadowOpacityMd - 0.05)}, 0 16px 32px ${rgba(sh, currentPalette.shadowOpacityMd - 0.15)}, inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -2px 0 rgba(0, 0, 0, 0.50)`,
      };
    }
    if (key === "lg") {
      return {
        boxShadow: `0 4px 8px ${rgba(sh, currentPalette.shadowOpacityLg)}, 0 16px 32px ${rgba(sh, currentPalette.shadowOpacityLg - 0.10)}, 0 32px 64px ${rgba(sh, currentPalette.shadowOpacityLg - 0.20)}, inset 0 2px 0 rgba(255, 255, 255, 0.12), inset 0 -3px 0 rgba(0, 0, 0, 0.55)`,
      };
    }
    if (key === "accent") {
      return {
        boxShadow: `0 2px 4px ${rgba(sh, 0.35)}, inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 0 -1px 0 ${rgba(sh, 0.35)}`,
      };
    }
    return {
      boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 4px 10px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(0, 0, 0, 0.4)",
    };
  }
  // Native (iOS / Android) — single shadow color + opacity.
  if (key === "sm") {
    return { shadowColor: sh, shadowOpacity: currentPalette.shadowOpacitySm, shadowOffset: { width: 0, height: 2 }, shadowRadius: 5, elevation: 4 };
  }
  if (key === "md") {
    return { shadowColor: sh, shadowOpacity: currentPalette.shadowOpacityMd, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 8 };
  }
  if (key === "lg") {
    return { shadowColor: sh, shadowOpacity: currentPalette.shadowOpacityLg, shadowOffset: { width: 0, height: 14 }, shadowRadius: 24, elevation: 14 };
  }
  if (key === "accent") {
    return { shadowColor: sh, shadowOpacity: 0.35, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 3 };
  }
  return { borderTopWidth: 1, borderTopColor: "rgba(0, 0, 0, 0.6)" };
}

function buildElevationProxy() {
  return new Proxy(
    {} as Record<ElevKey, any>,
    {
      get(_, key: string) {
        return makeElevation(key as ElevKey);
      },
      has(_, key: string) {
        return ["sm", "md", "lg", "accent", "inset"].includes(key);
      },
      ownKeys() {
        return ["sm", "md", "lg", "accent", "inset"];
      },
      getOwnPropertyDescriptor(_, key: string) {
        return { enumerable: true, configurable: true, value: makeElevation(key as ElevKey) };
      },
    },
  );
}
