/**
 * ============================================================================
 *  STEEL THEME — CENTRALIZED DATA SHEET (single source of truth)
 * ============================================================================
 *
 *  Everything that defines the brushed-metal "Steel" look lives here (or is
 *  re-exported from here). To convert ANY page to the Steel theme you should
 *  ONLY need to import from this one file.
 *
 *  Steel comes in 4 colours (orange · pink · arctic · emerald) — the active
 *  colour is read from the theme context, so the hooks below always return the
 *  correctly-recolored art automatically.
 *
 *  ── HOW TO CONVERT A NEW PAGE TO STEEL ──────────────────────────────────────
 *
 *  1) Detect the theme:           const isSteel = useIsSteel();
 *  2) Header:                      {isSteel ? <View style={STEEL_HEADER_WRAP}><TbvHeader/></View> : <IndustrialBanner .../>}
 *  3) Buttons:                     {isSteel ? <TbvButton label="SAVE" onPress={…}/> : <…existing…/>}
 *  4) Panels/cards:                const panel = useSteelPanelFrame(); … <TbvFrame {...(isSteel ? panel : nonSteel)}>…</TbvFrame>
 *  5) List rows:                   style={[styles.row, isSteel && STEEL_ROW, isLast && isSteel && STEEL_ROW_LAST]}
 *                                  value style={[styles.value, isSteel && STEEL_VALUE]}
 *  6) Report-a-bug badge:          already theme-aware via <ReportBugBadge/>.
 * ============================================================================
 */
import { StyleSheet, ViewStyle, TextStyle } from "react-native";
import { useSkin } from "../themeContext";
import { SILVER_SRC_BY_COLOR, SILVER_CAP, SILVER_FRAME_SCALE, SILVER_PAD } from "./silver";

/** True when the Steel metal family is the active appearance. */
export function useIsSteel(): boolean {
  const { metalStyle } = useSkin();
  return metalStyle === "steel";
}

/** The active Steel colour (orange | pink | arctic | emerald). */
export function useSteelColor() {
  const { industrialVariant } = useSkin();
  return industrialVariant;
}

/**
 * Panel frame props for the active Steel colour — spread straight onto
 * <TbvFrame> to render any panel/card with the brushed silver frame.
 *   const panel = useSteelPanelFrame();
 *   <TbvFrame {...panel}>…</TbvFrame>
 */
export function useSteelPanelFrame() {
  const color = useSteelColor();
  return {
    source: SILVER_SRC_BY_COLOR[color],
    capInsets: SILVER_CAP,
    frameScale: SILVER_FRAME_SCALE,
    padX: SILVER_PAD.padX,
    padTop: SILVER_PAD.padTop,
    padBottom: SILVER_PAD.padBottom,
  };
}

/* ─────────────────────── List row styling ─────────────────────── */
/** Strips the dark recessed-slot background/borders, adds a hairline divider. */
export const STEEL_ROW: ViewStyle = {
  backgroundColor: "transparent",
  borderWidth: 0,
  borderRadius: 0,
  marginVertical: 0,
  paddingHorizontal: 4,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: "rgba(255,255,255,0.13)",
};
/** Apply to the LAST row in a panel to drop its separator. */
export const STEEL_ROW_LAST: ViewStyle = { borderBottomWidth: 0 };
/** Strips the dark "chip" background behind a row's value. */
export const STEEL_VALUE: TextStyle = {
  backgroundColor: "transparent",
  borderWidth: 0,
  paddingHorizontal: 0,
};

/* ─────────────────── Header & badge layout ────────────────────── */
/** Wrapper padding so <TbvHeader> sits inside the screen gutters. */
export const STEEL_HEADER_WRAP: ViewStyle = {
  paddingHorizontal: 16,
  paddingTop: 8,
  paddingBottom: 4,
};
/** Render scale for the Report-a-bug badge so it sits lighter on the page. */
export const STEEL_BADGE_SCALE = 0.65;

/* ───────────── Components that make up the Steel theme ─────────── */
export { TbvHeader } from "../components/TbvHeader";
export { TbvButton } from "../components/TbvButton";
export { SilverPanel, SilverHeader, SilverRow, SilverDivider } from "../components/SilverPanel";
