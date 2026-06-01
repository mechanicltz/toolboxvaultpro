/**
 * Toolbox Vault — approved image-skin asset map + design tokens.
 *
 * SINGLE SOURCE OF TRUTH for the industrial look. These are the EXACT skins
 * used by the LOCKED login screen, so every migrated screen shares the same
 * visual language. Do NOT swap these for code-drawn primitives, Material, or
 * generic SaaS styling.
 */
import { ImageSourcePropType } from "react-native";

export const SKIN: Record<string, ImageSourcePropType> = {
  bg:           require("../../assets/tbv-v2/trimmed/Backgrounds/tbv_background_industrial_dark.png"),
  panel:        require("../../assets/tbv-v2/trimmed/Panels/tbv_login_panel_dark.png"),
  modalPanel:   require("../../assets/tbv-v2/trimmed/Panels/tbv_modal_panel_dark.png"),
  card:         require("../../assets/tbv-v2/trimmed/Cards/tbv_card_dark.png"),
  tabActive:    require("../../assets/tbv-v2/trimmed/Tabs/tbv_tab_active_orange.png"),
  tabInactive:  require("../../assets/tbv-v2/trimmed/Tabs/tbv_tab_inactive_dark.png"),
  input:        require("../../assets/tbv-v2/trimmed/Inputs/tbv_input_dark_slim.png"),
  btnPrimary:   require("../../assets/tbv-v2/trimmed/Buttons/tbv_btn_primary_orange.png"),
  btnSecondary: require("../../assets/tbv-v2/trimmed/Buttons/tbv_btn_secondary_dark.png"),
  masterLogo:   require("../../assets/tbv-v2/trimmed/Branding/tbv_master_logo_dark_v2.png"),
  nameplate:    require("../../assets/tbv-v2/trimmed/Branding/tbv_master_nameplate.png"),
};

/** Flat list of every skin module — used to preload/decode them up front. */
export const SKIN_LIST = Object.values(SKIN);

/** Aspect ratios (width / height) of key skins. */
export const AR = { logo: 0.968, card: 2.407, nameplate: 3.746, panel: 0.778 };

/** Core palette pulled straight from the approved login screen. */
export const TBV = {
  ink: "#0A0A0A",
  steel: "#E8E8E8",
  steelDim: "#D8D8D8",
  orange: "#FF8533",
  orangeDeep: "#FF6A1A",
  text: "#F2F2F2",
  textMuted: "#C8C8C8",
  placeholder: "#7C7C7C",
};

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
