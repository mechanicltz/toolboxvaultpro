/**
 * Toolbox Vault Design System — design tokens.
 *
 * Per Part 6 / 5C of the official Toolbox Vault Industrial Design System.
 * Source of truth: ToolboxVaultAssets/Toolbox design part 6.txt.
 *
 * Philosophy: 80% professional / 20% industrial branding.
 * Heavy industrial styling is reserved for LOGIN, SPLASH, EMPTY STATES.
 * Operational screens prioritize usability.
 */

export type ThemeMode = "dark" | "light" | "system";
export type ResolvedMode = "dark" | "light";

export interface Palette {
  // Surfaces
  bg: string;          // page background
  surface: string;     // surface inside a panel
  card: string;        // card background (Part 5C: #171A1F dark / #FFFFFF light)
  cardElevated: string; // raised card
  // Borders
  border: string;      // primary border (Part 5C: #2A2E35 dark / #B7BCC3 light)
  borderSubtle: string;
  divider: string;
  // Text
  text: string;        // primary text
  textSecondary: string;
  textMuted: string;
  textInverse: string; // text on accent
  // Brand accent (user-customizable later)
  accent: string;
  accentBright: string;
  accentDeep: string;
  accentSoft: string;  // tinted bg for accent surfaces
  // Status
  success: string;
  danger: string;
  warning: string;
  info: string;
  // Effects
  shadow: string;
  overlay: string;     // modal backdrop
}

export const DARK: Palette = {
  bg: "#050505",
  surface: "#0F1115",
  card: "#171A1F",       // Part 5C spec
  cardElevated: "#1F2229",
  border: "#2A2E35",     // Part 5C spec
  borderSubtle: "rgba(255,255,255,0.06)",
  divider: "rgba(255,255,255,0.08)",
  text: "#F2F2F2",
  textSecondary: "#C8C8C8",
  textMuted: "#8A8A8A",
  textInverse: "#000000",
  accent: "#FF6A00",
  accentBright: "#FF7E1B",
  accentDeep: "#D84E00",
  accentSoft: "rgba(255,106,0,0.14)",
  success: "#2EA043",
  danger: "#DC3545",
  warning: "#F0B100",
  info: "#3D8BFD",
  shadow: "rgba(0,0,0,0.55)",
  overlay: "rgba(5,5,5,0.78)",
};

export const LIGHT: Palette = {
  bg: "#ECECEC",         // user-specified light page bg
  surface: "#F4F4F4",
  card: "#FFFFFF",       // user-specified light card bg
  cardElevated: "#FFFFFF",
  border: "#B7BCC3",     // user-specified light border
  borderSubtle: "rgba(0,0,0,0.06)",
  divider: "rgba(0,0,0,0.08)",
  text: "#111111",       // user-specified primary text
  textSecondary: "#333333",
  textMuted: "#555555",  // user-specified secondary text
  textInverse: "#FFFFFF",
  accent: "#FF6A00",     // user-specified accent
  accentBright: "#FF7E1B",
  accentDeep: "#D84E00",
  accentSoft: "rgba(255,106,0,0.10)",
  success: "#1E8E3E",
  danger: "#C2261B",
  warning: "#CE8000",
  info: "#1A6FD8",
  shadow: "rgba(0,0,0,0.18)",
  overlay: "rgba(0,0,0,0.55)",
};

// ----------------------------------------------------------------------------
// Spacing tokens (8pt grid)
// ----------------------------------------------------------------------------
export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

// ----------------------------------------------------------------------------
// Radius tokens (Part 5C: cards = 14)
// ----------------------------------------------------------------------------
export const RADIUS = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,        // Part 5C card spec
  xl: 18,
  pill: 999,
} as const;

// ----------------------------------------------------------------------------
// Shadow tokens — React Native compatible (iOS shadow + Android elevation)
// ----------------------------------------------------------------------------
export interface ShadowToken {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}

export const shadows = (m: ResolvedMode) => {
  const c = m === "light" ? "#000" : "#000";
  const op = m === "light" ? 0.08 : 0.45;
  return {
    sm: { shadowColor: c, shadowOpacity: op, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    md: { shadowColor: c, shadowOpacity: op + 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
    lg: { shadowColor: c, shadowOpacity: op + 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
    glow: { shadowColor: "#FF6A00", shadowOpacity: 0.55, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  } satisfies Record<string, ShadowToken>;
};

// ----------------------------------------------------------------------------
// Typography tokens — Part 6 official font stack:
//   Bebas Neue — major headers / display
//   Rajdhani   — buttons, labels, navigation
//   Exo 2      — body text, tool data
// ----------------------------------------------------------------------------
export const FONTS = {
  display: "BebasNeue_400Regular",
  heading: "BebasNeue_400Regular",
  label: "Rajdhani_600SemiBold",
  labelBold: "Rajdhani_700Bold",
  body: "Exo2_400Regular",
  bodyMedium: "Exo2_500Medium",
  bodyBold: "Exo2_700Bold",
  // Platform fallbacks for when Google Fonts haven't loaded yet
  fallback: "System",
} as const;

export interface TextVariantStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  fontWeight?: "400" | "500" | "600" | "700" | "800" | "900";
}

export const TEXT_VARIANTS = {
  // Big nameplate headers — used sparingly (login title, splash, marketing)
  display: { fontFamily: FONTS.display, fontSize: 40, lineHeight: 44, letterSpacing: 2 },
  displaySmall: { fontFamily: FONTS.display, fontSize: 32, lineHeight: 36, letterSpacing: 1.5 },
  // Screen / section headers
  h1: { fontFamily: FONTS.heading, fontSize: 26, lineHeight: 30, letterSpacing: 1.2 },
  h2: { fontFamily: FONTS.heading, fontSize: 22, lineHeight: 26, letterSpacing: 1 },
  h3: { fontFamily: FONTS.heading, fontSize: 18, lineHeight: 22, letterSpacing: 0.8 },
  // Body / data — Exo 2
  body: { fontFamily: FONTS.body, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: FONTS.bodyMedium, fontSize: 15, lineHeight: 22 },
  bodyBold: { fontFamily: FONTS.bodyBold, fontSize: 15, lineHeight: 22 },
  bodySmall: { fontFamily: FONTS.body, fontSize: 13, lineHeight: 18 },
  // Buttons / chrome / labels — Rajdhani
  buttonLg: { fontFamily: FONTS.labelBold, fontSize: 16, lineHeight: 20, letterSpacing: 2 },
  button: { fontFamily: FONTS.labelBold, fontSize: 14, lineHeight: 18, letterSpacing: 1.5 },
  buttonSm: { fontFamily: FONTS.labelBold, fontSize: 12, lineHeight: 16, letterSpacing: 1.4 },
  label: { fontFamily: FONTS.label, fontSize: 12, lineHeight: 14, letterSpacing: 1.6 },
  labelSmall: { fontFamily: FONTS.label, fontSize: 11, lineHeight: 13, letterSpacing: 1.4 },
  caption: { fontFamily: FONTS.body, fontSize: 11, lineHeight: 15 },
} satisfies Record<string, TextVariantStyle>;

export type TextVariant = keyof typeof TEXT_VARIANTS;
