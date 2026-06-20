/**
 * HEADER — centralized constraints for the brushed-metal "TOOLBOX VAULT"
 * nameplate header.
 *
 * SINGLE SOURCE OF TRUTH for the Header art. The header carries the baked-in
 * "TOOLBOX VAULT" lettering + decorative detailing, so unlike the stretchable
 * Silver panel it is rendered at its NATURAL aspect ratio (never 9-sliced) — the
 * lettering and chamfered corners therefore stay perfectly crisp at any width.
 *
 * The trimmed, transparent-background art (assets/header/header_panel.png) is
 * 1490×321. We expose its exact aspect ratio so the <TbvHeader> component can
 * fill any container width with zero distortion, and a small version label is
 * painted into the bottom-right corner (inside the metal border) in the same
 * warm orange as the "VAULT" lettering.
 */
import { ImageSourcePropType } from "react-native";
import { IndustrialVariant } from "./skins";

export const HEADER_SRC: ImageSourcePropType = require("../../assets/header/header_panel.png");

/** Header art per colour variant (Pillow recolors of the orange base). */
export const HEADER_SRC_BY_COLOR: Record<IndustrialVariant, ImageSourcePropType> = {
  orange: require("../../assets/header/header_panel.png"),
  pink: require("../../assets/header/header_panel-pink.png"),
  arctic: require("../../assets/header/header_panel-arctic.png"),
  emerald: require("../../assets/header/header_panel-emerald.png"),
};

/** Intrinsic trimmed art size (px) → exact aspect ratio, no stretch ever. */
export const HEADER_W = 1490;
export const HEADER_H = 321;
export const HEADER_ASPECT = HEADER_W / HEADER_H;

/** Warm orange sampled from the "VAULT" lettering — used for the version label. */
export const HEADER_VAULT_ORANGE = "#EC6905";

/** Version-label colour per variant, matching the recolored "VAULT" glow. */
export const HEADER_VAULT_COLOR_BY_COLOR: Record<IndustrialVariant, string> = {
  orange: "#EC6905",
  pink: "#EC052F",
  arctic: "#05BAEC",
  emerald: "#05EC84",
};

/**
 * Where the small version label sits, as a fraction of the header box, so it
 * always lands in the dark panel just inside the bottom-right metal rail.
 */
export const HEADER_VERSION_POS = {
  rightPct: 0.06,
  bottomPct: 0.21,
};
