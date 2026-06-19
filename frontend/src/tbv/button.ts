/**
 * BUTTON — centralized constraints for the black brushed-metal action button.
 *
 * SINGLE SOURCE OF TRUTH for the Button skin. Import the <TbvButton> component
 * anywhere and the frame art, aspect ratio and label style are ALL applied from
 * here — so every metal button across every screen looks identical with zero
 * per-screen tweaking.
 *
 * The trimmed, transparent-background art (assets/button/button_panel.png,
 * 1490×339) is rendered at its EXACT natural aspect ratio so the chamfered metal
 * corners and centre detailing never stretch, smear or look "off" — it simply
 * scales down to whatever width the button is given.
 */
import { ImageSourcePropType } from "react-native";

export const BUTTON_SRC: ImageSourcePropType = require("../../assets/button/button_panel.png");

/** Intrinsic trimmed art size (px) → exact aspect ratio, no stretch ever. */
export const BUTTON_W = 1490;
export const BUTTON_H = 339;
export const BUTTON_ASPECT = BUTTON_W / BUTTON_H;

/** Label style — bold, uppercase, white to read on the dark brushed centre. */
export const BUTTON_LABEL = {
  fontSize: 14,
  fontWeight: "800" as const,
  letterSpacing: 0.8,
  color: "#FFFFFF",
};
