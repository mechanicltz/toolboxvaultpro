/**
 * SILVER — centralized constraints for the brushed-silver industrial panel.
 *
 * SINGLE SOURCE OF TRUTH for the Silver skin. Import the SilverPanel component
 * (src/components/SilverPanel.tsx) anywhere and the frame art, 9-slice geometry,
 * content padding, text sizes, icon sizes and row spacing are ALL applied from
 * here — so every Silver panel across every screen looks identical with zero
 * per-screen tweaking.
 *
 * The trimmed, transparent-background art (assets/silver/silver_panel.png, 360×576)
 * renders through the app's universal 9-slice engine (TbvFrame): the chamfered
 * metal corners + rails are FROZEN and only the flat brushed-metal center
 * stretches, so a single asset fits ANY width/height (phone or tablet) without
 * the corners ever bloating or smearing.
 */
import { ImageSourcePropType } from "react-native";

export const SILVER_SRC: ImageSourcePropType = require("../../assets/silver/silver_panel.png");

/**
 * 9-slice cap insets in SOURCE-IMAGE pixels. These freeze the metal border +
 * chamfered corners and let ONLY the flat brushed-metal center stretch.
 * Measured directly from the trimmed art (360×576): inner frame thickness is
 * ~33/35/27/28 (T/B/L/R); a small safety margin fully captures the chamfers.
 */
export const SILVER_CAP = {
  top: 42,
  left: 36,
  bottom: 44,
  right: 36,
  w: 360,
  h: 576,
};

/**
 * How THICK the metal rails render, as a fraction of the captured corner art.
 * The full corner is always drawn (never clipped) but shrunk to this fraction,
 * so the border looks thinner while the chamfered corners stay crisp. Lower =
 * thinner frame.
 */
export const SILVER_FRAME_SCALE = 0.6;

/**
 * Content padding (points) so inner content always clears the metal rails — a
 * touch larger than the (thinned) inner border so nothing kisses the frame edge.
 */
export const SILVER_PAD = {
  padX: 30,
  padTop: 34,
  padBottom: 36,
};

/**
 * Content style tokens — title / label / value text, icon sizes and row rhythm.
 * Tuned to the dark brushed-metal interior with the panel's warm edge glow as
 * the accent so content reads cleanly on the Silver surface everywhere.
 */
export const SILVER = {
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
