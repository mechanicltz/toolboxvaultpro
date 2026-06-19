/**
 * BUTTON — centralized constraints for the black brushed-metal action button.
 *
 * SINGLE SOURCE OF TRUTH for the Button skin. Import the <TbvButton> component
 * anywhere and the frame art, 9-slice geometry, content padding and label style
 * are ALL applied from here — so every metal button across every screen looks
 * identical with zero per-screen tweaking.
 *
 * The trimmed, transparent-background art (assets/button/button_panel.png,
 * 1490×339) renders through the app's universal 9-slice engine (TbvFrame): the
 * chamfered metal corners + rails are FROZEN and only the flat dark center
 * stretches, so a single asset fits ANY button width/height without the corners
 * ever bloating or smearing. The rails are thinned to the same locked-in look
 * as the Silver panel via BUTTON_FRAME_SCALE.
 */
import { ImageSourcePropType } from "react-native";

export const BUTTON_SRC: ImageSourcePropType = require("../../assets/button/button_panel.png");

/**
 * 9-slice cap insets in SOURCE-IMAGE pixels (art is 1490×339). These freeze the
 * metal border + chamfered corners and let ONLY the flat dark center stretch.
 * Measured directly from the trimmed art (straight rail ≈ 53/43/49 px) with a
 * small safety margin to fully capture the corner chamfers.
 */
export const BUTTON_CAP = {
  top: 58,
  left: 64,
  bottom: 52,
  right: 64,
  w: 1490,
  h: 339,
};

/** Same locked-in thin-rail look as the Silver panel. Lower = thinner frame. */
export const BUTTON_FRAME_SCALE = 0.3;

/** Inner content padding (points) so the label always clears the metal rails. */
export const BUTTON_PAD = {
  padX: 18,
  padTop: 12,
  padBottom: 12,
};

/** Label style — bold, uppercase, white to read on the dark brushed center. */
export const BUTTON_LABEL = {
  fontSize: 14,
  fontWeight: "800" as const,
  letterSpacing: 0.8,
  color: "#FFFFFF",
};
