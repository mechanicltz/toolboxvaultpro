/**
 * Toolbox Vault Industrial Design System — theme + palette.
 *
 * The design system supports BOTH dark and light themes (per user spec).
 * Colors mirror the user's reference images exactly.
 *
 * Accent color is user-configurable later via the accent-picker; for now it
 * defaults to the canonical orange #FF6A00 from the reference.
 */

export type IndustrialThemeMode = "dark" | "light";

export interface IndustrialPalette {
  bg: string;        // outer page background tint
  panel: string;     // surface inside a panel
  steel: string;     // mid-tone steel for borders, dividers
  accent: string;    // primary accent (default orange)
  accentBright: string;
  accentDeep: string;
  text: string;      // primary text
  textMuted: string; // secondary text, labels
  textInverse: string; // text on accent backgrounds
  border: string;
  shadow: string;
  success: string;
  danger: string;
  warning: string;
}

export const DARK_PALETTE: IndustrialPalette = {
  bg: "#050505",
  panel: "#111111",
  steel: "#1E1E1E",
  accent: "#FF6A00",
  accentBright: "#FF7E1B",
  accentDeep: "#D84E00",
  text: "#F2F2F2",
  textMuted: "#8A8A8A",
  textInverse: "#000000",
  border: "rgba(255,106,0,0.55)",
  shadow: "rgba(0,0,0,0.85)",
  success: "#2EA043",
  danger: "#DC3545",
  warning: "#F0B100",
};

export const LIGHT_PALETTE: IndustrialPalette = {
  bg: "#F2F2F2",
  panel: "#FFFFFF",
  steel: "#D9D9D9",
  accent: "#FF6A00",
  accentBright: "#FF7E1B",
  accentDeep: "#D84E00",
  text: "#0A0A0A",
  textMuted: "#5A5A5A",
  textInverse: "#FFFFFF",
  border: "rgba(255,106,0,0.7)",
  shadow: "rgba(0,0,0,0.18)",
  success: "#1E8E3E",
  danger: "#C2261B",
  warning: "#CE8000",
};

export function getPalette(mode: IndustrialThemeMode): IndustrialPalette {
  return mode === "light" ? LIGHT_PALETTE : DARK_PALETTE;
}

// Industrial font names — these resolve to the loaded Google Fonts; if they
// haven't loaded yet, components fall back to platform Impact/condensed.
export const INDUSTRIAL_FONTS = {
  title: "Anton_400Regular",           // heavy condensed nameplate
  label: "BebasNeue_400Regular",       // labels, chrome text
  stencil: "BlackOpsOne_400Regular",   // optional military stencil accent
};
