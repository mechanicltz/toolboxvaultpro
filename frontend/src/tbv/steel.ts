/**
 * ============================================================================
 *  STEEL THEME — CENTRALIZED DATA SHEET (single source of truth)
 * ============================================================================
 *
 *  Everything that defines the brushed-metal "Steel" look lives here (or is
 *  re-exported from here). To convert ANY page to the Steel theme you should
 *  ONLY need to import from this one file — never re-derive paddings, frame
 *  art, separator colours, row styles or component wiring on a per-page basis.
 *
 *  ── HOW TO CONVERT A NEW PAGE TO STEEL ──────────────────────────────────────
 *
 *  1) Detect the theme:
 *        const isSteel = useIsSteel();
 *
 *  2) Header (top nameplate):
 *        {isSteel
 *          ? <View style={STEEL_HEADER_WRAP}><TbvHeader /></View>
 *          : <IndustrialBanner title="…" />}
 *
 *  3) Primary action buttons:
 *        {isSteel ? <TbvButton label="SAVE" onPress={…} /> : <…existing…/>}
 *
 *  4) Panels / cards (wrap content in a brushed-silver frame):
 *        <TbvFrame {...(isSteel ? STEEL_PANEL_FRAME : nonSteelFrame)}>…</TbvFrame>
 *     …or simply use the <SilverPanel> component re-exported below.
 *
 *  5) List rows (remove the dark "recessed slot", keep a hairline separator):
 *        <View style={[styles.row, isSteel && STEEL_ROW, isLast && isSteel && STEEL_ROW_LAST]}>
 *        <Text style={[styles.value, isSteel && STEEL_VALUE]}>…</Text>
 *
 *  6) Report-a-bug badge — already theme-aware via <ReportBugBadge/> (uses
 *     STEEL_BADGE_SCALE + the steel artwork automatically).
 *
 *  Tweaking any value below updates EVERY Steel page at once.
 * ============================================================================
 */
import { StyleSheet, ViewStyle, TextStyle } from "react-native";
import { useSkin } from "../themeContext";
import { SILVER_SRC, SILVER_CAP, SILVER_FRAME_SCALE, SILVER_PAD } from "./silver";

/** True when the Steel theme is the active appearance. */
export function useIsSteel(): boolean {
  const { industrialVariant } = useSkin();
  return industrialVariant === "steel";
}

/* ─────────────────────────── Colours ─────────────────────────── */
export const STEEL_COLORS = {
  /** Warm orange sampled from the "VAULT" lettering (accents / version label). */
  vaultOrange: "#EC6905",
  /** Brushed-silver hue used for the theme swatch. */
  silver: "#C7CDD3",
  /** Hairline separator between list rows on the dark silver panel. */
  rowSeparator: "rgba(255,255,255,0.13)",
};

/* ───────────────── Panel frame (brushed silver) ───────────────── */
/**
 * Spread straight onto <TbvFrame> to render any panel/card with the brushed
 * silver frame at the locked-in thin-rail look.
 *   <TbvFrame {...STEEL_PANEL_FRAME}>…</TbvFrame>
 */
export const STEEL_PANEL_FRAME = {
  source: SILVER_SRC,
  capInsets: SILVER_CAP,
  frameScale: SILVER_FRAME_SCALE,
  padX: SILVER_PAD.padX,
  padTop: SILVER_PAD.padTop,
  padBottom: SILVER_PAD.padBottom,
} as const;

/* ─────────────────────── List row styling ─────────────────────── */
/** Strips the dark recessed-slot background/borders, adds a hairline divider. */
export const STEEL_ROW: ViewStyle = {
  backgroundColor: "transparent",
  borderWidth: 0,
  borderRadius: 0,
  marginVertical: 0,
  paddingHorizontal: 4,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: STEEL_COLORS.rowSeparator,
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
/** Wrapper padding so <TbvHeader> sits inside the screen gutters and never
 *  runs off the right edge. */
export const STEEL_HEADER_WRAP: ViewStyle = {
  paddingHorizontal: 16,
  paddingTop: 8,
  paddingBottom: 4,
};
/** Render scale for the Report-a-bug badge so it sits lighter on the page. */
export const STEEL_BADGE_SCALE = 0.65;

/* ───────────── Components that make up the Steel theme ─────────── */
/** Re-exported for one-stop importing when converting a page. */
export { TbvHeader } from "../components/TbvHeader";
export { TbvButton } from "../components/TbvButton";
export { SilverPanel, SilverHeader, SilverRow, SilverDivider } from "../components/SilverPanel";
