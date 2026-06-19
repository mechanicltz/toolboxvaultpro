/**
 * STEEL — centralized constraints for the "Steel" industrial panel frame.
 *
 * SINGLE SOURCE OF TRUTH for the Steel skin. Import the SteelPanel component
 * (src/components/SteelPanel.tsx) anywhere and the frame art, 9-slice geometry,
 * content padding, text sizes, icon sizes and row spacing are ALL applied from
 * here — so every Steel panel across every screen looks identical with zero
 * per-screen tweaking.
 *
 * The trimmed, transparent-background art ships in TWO orientations that share
 * the same look:
 *   - vertical   → assets/steel/steel_vertical.png   (tall / portrait areas)
 *   - horizontal → assets/steel/steel_horizontal.png (wide / landscape areas)
 *
 * Both render through the app's universal 9-slice engine (TbvFrame), so a single
 * asset stretches to ANY width/height (phone or tablet) while the metal corner
 * brackets + rails stay crisp.
 */
import { ImageSourcePropType } from "react-native";

export type SteelOrientation = "vertical" | "horizontal";

export const STEEL_SRC: Record<SteelOrientation, ImageSourcePropType> = {
  vertical: require("../../assets/steel/steel_vertical.png"),
  horizontal: require("../../assets/steel/steel_horizontal.png"),
};

/**
 * 9-slice cap insets in SOURCE-IMAGE pixels. These freeze the metal border +
 * corner brackets and let ONLY the flat brushed-metal center stretch. Measured
 * directly from the trimmed art (vertical asset is 360×679; horizontal 679×360).
 */
export const STEEL_CAP: Record<
  SteelOrientation,
  { top: number; left: number; bottom: number; right: number; w: number; h: number }
> = {
  vertical: { top: 56, left: 34, bottom: 50, right: 34, w: 360, h: 679 },
  horizontal: { top: 34, left: 56, bottom: 34, right: 50, w: 679, h: 360 },
};

/**
 * Content padding (points) so inner content always clears the metal rails. A
 * touch larger than the inner border so nothing ever kisses the frame edge.
 * Identical on every screen → no manual layout edits when reusing the panel.
 */
export const STEEL_PAD: Record<
  SteelOrientation,
  { padX: number; padTop: number; padBottom: number }
> = {
  vertical: { padX: 42, padTop: 62, padBottom: 58 },
  horizontal: { padX: 66, padTop: 44, padBottom: 44 },
};

/**
 * Content style tokens — title / label / value text, icon sizes and row
 * rhythm. Tuned to the dark brushed-metal interior with the panel's orange glow
 * as the accent so content reads cleanly on the Steel surface everywhere.
 */
export const STEEL = {
  accent: "#FF7A18", // matches the panel's warm edge glow
  text: "#F4F4F4",
  textMuted: "#C2C2C2",
  divider: "rgba(255,255,255,0.13)",

  title: { fontSize: 16, fontWeight: "800" as const, letterSpacing: 1.4, color: "#F4F4F4" },
  label: { fontSize: 13.5, fontWeight: "600" as const, letterSpacing: 0.3, color: "#C9C9C9" },
  value: { fontSize: 14.5, fontWeight: "800" as const, color: "#FFFFFF" },

  headerIconSize: 19,
  rowIconSize: 16,
  rowIconSlot: 24, // fixed icon column width → values align across rows
  rowGap: 10,
  rowPadV: 9,
  dividerMarginV: 8,
};
