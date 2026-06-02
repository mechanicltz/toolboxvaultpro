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
  // ---- Dedicated content-card frames (designer-built, already trimmed) ----
  // Phone-density 9-slice frames (@1x/@2x/@3x at 400pt logical width) so the
  // capInsets corner bolts render proportionally + crisp on device.
  card:         require("../../assets/tbv-v2/trimmed/Frames/tbv_card_frame.png"),
  panelFrame:   require("../../assets/tbv-v2/trimmed/Frames/tbv_panel_frame.png"),
  statFrame:    require("../../assets/tbv-v2/trimmed/Frames/tbv_stat_frame.png"),
  cardRaw:      require("../../assets/tbv-v2/trimmed/Cards/tbv_card_dark.png"),
  cardStat:     require("../../assets/tbv-v2/trimmed/Cards/tbv_card_stat_dark.png"),
  cardDealer:   require("../../assets/tbv-v2/trimmed/Cards/tbv_card_dealer_dark.png"),
  cardWarranty: require("../../assets/tbv-v2/trimmed/Cards/tbv_card_warranty_dark.png"),
  cardInventory:require("../../assets/tbv-v2/trimmed/Cards/tbv_card_inventory_dark.png"),
  headerPanel:  require("../../assets/tbv-v2/trimmed/Headers/tbv_header_panel_dark.png"),
  searchBar:    require("../../assets/tbv-v2/trimmed/Search/tbv_search_bar_dark.png"),
  divider:      require("../../assets/tbv-v2/trimmed/Accents/tbv_section_divider_dark.png"),
  accentBar:    require("../../assets/tbv-v2/trimmed/Accents/tbv_accent_bar_orange.png"),
  fab:          require("../../assets/tbv-v2/trimmed/Buttons/tbv_floating_action_button_orange.png"),
  // ---- Controls / branding (locked login set) ----
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

/**
 * 9-slice cap insets (in SOURCE-IMAGE pixels) per frame. These freeze the
 * ornate corner bolts + top/bottom rails and stretch ONLY the flat center +
 * edge bands, so a frame can wrap ANY content height without the corners
 * smearing. iOS honours capInsets natively; web/Android fall back to a plain
 * stretch (acceptable — the device target is iOS). Tuned to each asset's art.
 */
export const CAP = {
  // tbv_card_frame.png — 400x164 logical. Freeze corner brackets + rails.
  card:      { top: 38, left: 60, bottom: 42, right: 60 },
  // tbv_panel_frame.png — 400x514 logical (tall form panel).
  panel:     { top: 64, left: 56, bottom: 86, right: 56 },
  // tbv_stat_frame.png — 400x209 logical.
  cardStat:  { top: 40, left: 56, bottom: 44, right: 56 },
  // tbv_modal_panel_dark.png — 1118x607 (legacy raw, plain stretch).
  modalPanel:{ top: 90, left: 110, bottom: 96, right: 110 },
};

/** Core palette pulled straight from the approved login screen. */
export const TBV = {
  ink: "#0A0A0A",
  steel: "#E8E8E8",
  steelDim: "#D8D8D8",
  orange: "#FF6A00",
  orangeDeep: "#E55F00",
  text: "#F2F2F2",
  textMuted: "#C8C8C8",
  placeholder: "#7C7C7C",
};

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
