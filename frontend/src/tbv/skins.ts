/**
 * Toolbox Vault — approved image-skin asset map + design tokens.
 *
 * SINGLE SOURCE OF TRUTH for the industrial look. These are the EXACT skins
 * used by the LOCKED login screen, so every migrated screen shares the same
 * visual language. Do NOT swap these for code-drawn primitives, Material, or
 * generic SaaS styling.
 */
import { ImageSourcePropType } from "react-native";

/**
 * The industrial skin now ships in TWO colour variants that share IDENTICAL
 * geometry — only the glow/accent hue differs:
 *  - ORANGE (original) → assets under `tbv-v2/trimmed/`
 *  - PINK   (recolored) → assets under `tbv-v2/trimmed-pink/` (Pillow hue-shift)
 *
 * `SKIN` is a Proxy that returns whichever variant is active. The active
 * variant is set by the ThemeProvider via `setIndustrialVariant()` whenever the
 * user switches between "Industrial" and "Industrial Pink". Because every
 * component reads `SKIN.<key>` inline during render, flipping the variant +
 * re-rendering swaps all the frame/nameplate/button art automatically — no
 * per-screen changes needed.
 */
export const SKIN_ORANGE: Record<string, ImageSourcePropType> = {
  bg:           require("../../assets/tbv-v2/trimmed/Backgrounds/tbv_background_industrial_dark.png"),
  panel:        require("../../assets/tbv-v2/trimmed/Panels/tbv_login_panel_dark.png"),
  modalPanel:   require("../../assets/tbv-v2/trimmed/Panels/tbv_modal_panel_dark.png"),
  card:         require("../../assets/tbv-v2/trimmed/Frames/tbv_card_frame.png"),
  panelFrame:   require("../../assets/tbv-v2/trimmed/Frames/tbv_panel_frame.png"),
  statFrame:    require("../../assets/tbv-v2/trimmed/Frames/tbv_stat_frame.png"),
  window:       require("../../assets/tbv-v2/trimmed/Frames/tbv_window_frame.png"),
  plate:        require("../../assets/tbv-v2/trimmed/Frames/tbv_plate_frame.png"),
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
  tabActive:    require("../../assets/tbv-v2/trimmed/Tabs/tbv_tab_active_orange.png"),
  tabInactive:  require("../../assets/tbv-v2/trimmed/Tabs/tbv_tab_inactive_dark.png"),
  input:        require("../../assets/tbv-v2/trimmed/Inputs/tbv_input_dark_slim.png"),
  btnPrimary:   require("../../assets/tbv-v2/trimmed/Buttons/tbv_btn_primary_orange.png"),
  btnSecondary: require("../../assets/tbv-v2/trimmed/Buttons/tbv_btn_secondary_dark.png"),
  masterLogo:   require("../../assets/tbv-v2/trimmed/Branding/tbv_master_logo_dark_v2.png"),
  nameplate:    require("../../assets/tbv-v2/trimmed/Branding/tbv_master_nameplate.png"),
};

export const SKIN_PINK: Record<string, ImageSourcePropType> = {
  bg:           require("../../assets/tbv-v2/trimmed-pink/Backgrounds/tbv_background_industrial_dark.png"),
  panel:        require("../../assets/tbv-v2/trimmed-pink/Panels/tbv_login_panel_dark.png"),
  modalPanel:   require("../../assets/tbv-v2/trimmed-pink/Panels/tbv_modal_panel_dark.png"),
  card:         require("../../assets/tbv-v2/trimmed-pink/Frames/tbv_card_frame.png"),
  panelFrame:   require("../../assets/tbv-v2/trimmed-pink/Frames/tbv_panel_frame.png"),
  statFrame:    require("../../assets/tbv-v2/trimmed-pink/Frames/tbv_stat_frame.png"),
  window:       require("../../assets/tbv-v2/trimmed-pink/Frames/tbv_window_frame.png"),
  plate:        require("../../assets/tbv-v2/trimmed-pink/Frames/tbv_plate_frame.png"),
  cardRaw:      require("../../assets/tbv-v2/trimmed-pink/Cards/tbv_card_dark.png"),
  cardStat:     require("../../assets/tbv-v2/trimmed-pink/Cards/tbv_card_stat_dark.png"),
  cardDealer:   require("../../assets/tbv-v2/trimmed-pink/Cards/tbv_card_dealer_dark.png"),
  cardWarranty: require("../../assets/tbv-v2/trimmed-pink/Cards/tbv_card_warranty_dark.png"),
  cardInventory:require("../../assets/tbv-v2/trimmed-pink/Cards/tbv_card_inventory_dark.png"),
  headerPanel:  require("../../assets/tbv-v2/trimmed-pink/Headers/tbv_header_panel_dark.png"),
  searchBar:    require("../../assets/tbv-v2/trimmed-pink/Search/tbv_search_bar_dark.png"),
  divider:      require("../../assets/tbv-v2/trimmed-pink/Accents/tbv_section_divider_dark.png"),
  accentBar:    require("../../assets/tbv-v2/trimmed-pink/Accents/tbv_accent_bar_orange.png"),
  fab:          require("../../assets/tbv-v2/trimmed-pink/Buttons/tbv_floating_action_button_orange.png"),
  tabActive:    require("../../assets/tbv-v2/trimmed-pink/Tabs/tbv_tab_active_orange.png"),
  tabInactive:  require("../../assets/tbv-v2/trimmed-pink/Tabs/tbv_tab_inactive_dark.png"),
  input:        require("../../assets/tbv-v2/trimmed-pink/Inputs/tbv_input_dark_slim.png"),
  btnPrimary:   require("../../assets/tbv-v2/trimmed-pink/Buttons/tbv_btn_primary_orange.png"),
  btnSecondary: require("../../assets/tbv-v2/trimmed-pink/Buttons/tbv_btn_secondary_dark.png"),
  masterLogo:   require("../../assets/tbv-v2/trimmed-pink/Branding/tbv_master_logo_dark_v2.png"),
  nameplate:    require("../../assets/tbv-v2/trimmed-pink/Branding/tbv_master_nameplate.png"),
};

export const SKIN_ARCTIC: Record<string, ImageSourcePropType> = {
  bg:           require("../../assets/tbv-v2/trimmed-arctic/Backgrounds/tbv_background_industrial_dark.png"),
  panel:        require("../../assets/tbv-v2/trimmed-arctic/Panels/tbv_login_panel_dark.png"),
  modalPanel:   require("../../assets/tbv-v2/trimmed-arctic/Panels/tbv_modal_panel_dark.png"),
  card:         require("../../assets/tbv-v2/trimmed-arctic/Frames/tbv_card_frame.png"),
  panelFrame:   require("../../assets/tbv-v2/trimmed-arctic/Frames/tbv_panel_frame.png"),
  statFrame:    require("../../assets/tbv-v2/trimmed-arctic/Frames/tbv_stat_frame.png"),
  window:       require("../../assets/tbv-v2/trimmed-arctic/Frames/tbv_window_frame.png"),
  plate:        require("../../assets/tbv-v2/trimmed-arctic/Frames/tbv_plate_frame.png"),
  cardRaw:      require("../../assets/tbv-v2/trimmed-arctic/Cards/tbv_card_dark.png"),
  cardStat:     require("../../assets/tbv-v2/trimmed-arctic/Cards/tbv_card_stat_dark.png"),
  cardDealer:   require("../../assets/tbv-v2/trimmed-arctic/Cards/tbv_card_dealer_dark.png"),
  cardWarranty: require("../../assets/tbv-v2/trimmed-arctic/Cards/tbv_card_warranty_dark.png"),
  cardInventory:require("../../assets/tbv-v2/trimmed-arctic/Cards/tbv_card_inventory_dark.png"),
  headerPanel:  require("../../assets/tbv-v2/trimmed-arctic/Headers/tbv_header_panel_dark.png"),
  searchBar:    require("../../assets/tbv-v2/trimmed-arctic/Search/tbv_search_bar_dark.png"),
  divider:      require("../../assets/tbv-v2/trimmed-arctic/Accents/tbv_section_divider_dark.png"),
  accentBar:    require("../../assets/tbv-v2/trimmed-arctic/Accents/tbv_accent_bar_orange.png"),
  fab:          require("../../assets/tbv-v2/trimmed-arctic/Buttons/tbv_floating_action_button_orange.png"),
  tabActive:    require("../../assets/tbv-v2/trimmed-arctic/Tabs/tbv_tab_active_orange.png"),
  tabInactive:  require("../../assets/tbv-v2/trimmed-arctic/Tabs/tbv_tab_inactive_dark.png"),
  input:        require("../../assets/tbv-v2/trimmed-arctic/Inputs/tbv_input_dark_slim.png"),
  btnPrimary:   require("../../assets/tbv-v2/trimmed-arctic/Buttons/tbv_btn_primary_orange.png"),
  btnSecondary: require("../../assets/tbv-v2/trimmed-arctic/Buttons/tbv_btn_secondary_dark.png"),
  masterLogo:   require("../../assets/tbv-v2/trimmed-arctic/Branding/tbv_master_logo_dark_v2.png"),
  nameplate:    require("../../assets/tbv-v2/trimmed-arctic/Branding/tbv_master_nameplate.png"),
};

export const SKIN_EMERALD: Record<string, ImageSourcePropType> = {
  bg:           require("../../assets/tbv-v2/trimmed-emerald/Backgrounds/tbv_background_industrial_dark.png"),
  panel:        require("../../assets/tbv-v2/trimmed-emerald/Panels/tbv_login_panel_dark.png"),
  modalPanel:   require("../../assets/tbv-v2/trimmed-emerald/Panels/tbv_modal_panel_dark.png"),
  card:         require("../../assets/tbv-v2/trimmed-emerald/Frames/tbv_card_frame.png"),
  panelFrame:   require("../../assets/tbv-v2/trimmed-emerald/Frames/tbv_panel_frame.png"),
  statFrame:    require("../../assets/tbv-v2/trimmed-emerald/Frames/tbv_stat_frame.png"),
  window:       require("../../assets/tbv-v2/trimmed-emerald/Frames/tbv_window_frame.png"),
  plate:        require("../../assets/tbv-v2/trimmed-emerald/Frames/tbv_plate_frame.png"),
  cardRaw:      require("../../assets/tbv-v2/trimmed-emerald/Cards/tbv_card_dark.png"),
  cardStat:     require("../../assets/tbv-v2/trimmed-emerald/Cards/tbv_card_stat_dark.png"),
  cardDealer:   require("../../assets/tbv-v2/trimmed-emerald/Cards/tbv_card_dealer_dark.png"),
  cardWarranty: require("../../assets/tbv-v2/trimmed-emerald/Cards/tbv_card_warranty_dark.png"),
  cardInventory:require("../../assets/tbv-v2/trimmed-emerald/Cards/tbv_card_inventory_dark.png"),
  headerPanel:  require("../../assets/tbv-v2/trimmed-emerald/Headers/tbv_header_panel_dark.png"),
  searchBar:    require("../../assets/tbv-v2/trimmed-emerald/Search/tbv_search_bar_dark.png"),
  divider:      require("../../assets/tbv-v2/trimmed-emerald/Accents/tbv_section_divider_dark.png"),
  accentBar:    require("../../assets/tbv-v2/trimmed-emerald/Accents/tbv_accent_bar_orange.png"),
  fab:          require("../../assets/tbv-v2/trimmed-emerald/Buttons/tbv_floating_action_button_orange.png"),
  tabActive:    require("../../assets/tbv-v2/trimmed-emerald/Tabs/tbv_tab_active_orange.png"),
  tabInactive:  require("../../assets/tbv-v2/trimmed-emerald/Tabs/tbv_tab_inactive_dark.png"),
  input:        require("../../assets/tbv-v2/trimmed-emerald/Inputs/tbv_input_dark_slim.png"),
  btnPrimary:   require("../../assets/tbv-v2/trimmed-emerald/Buttons/tbv_btn_primary_orange.png"),
  btnSecondary: require("../../assets/tbv-v2/trimmed-emerald/Buttons/tbv_btn_secondary_dark.png"),
  masterLogo:   require("../../assets/tbv-v2/trimmed-emerald/Branding/tbv_master_logo_dark_v2.png"),
  nameplate:    require("../../assets/tbv-v2/trimmed-emerald/Branding/tbv_master_nameplate.png"),
};

const VARIANT_MAPS: Record<string, Record<string, ImageSourcePropType>> = {
  orange: SKIN_ORANGE,
  pink: SKIN_PINK,
  arctic: SKIN_ARCTIC,
  emerald: SKIN_EMERALD,
  // Steel reuses the orange art for any screen not yet migrated to the
  // dedicated Steel (silver-metal) components — migrated screens swap in the
  // Steel header / button / panel directly, page by page.
  steel: SKIN_ORANGE,
};

export type IndustrialVariant = "orange" | "pink" | "arctic" | "emerald" | "steel";
let _variant: IndustrialVariant = "orange";
/** Set by the ThemeProvider when the user picks an industrial colour theme. */
export function setIndustrialVariant(v: IndustrialVariant) {
  _variant = v;
}
export function getIndustrialVariant(): IndustrialVariant {
  return _variant;
}

/** Live, variant-aware skin map. `SKIN.window` returns the active variant art. */
export const SKIN: Record<string, ImageSourcePropType> = new Proxy(
  {} as Record<string, ImageSourcePropType>,
  {
    get(_, key: string) {
      return (VARIANT_MAPS[_variant] ?? SKIN_ORANGE)[key];
    },
    has(_, key: string) {
      return key in SKIN_ORANGE;
    },
    ownKeys() {
      return Reflect.ownKeys(SKIN_ORANGE);
    },
    getOwnPropertyDescriptor(_, key: string) {
      return {
        enumerable: true,
        configurable: true,
        value: (VARIANT_MAPS[_variant] ?? SKIN_ORANGE)[key],
      };
    },
  },
);

/** Flat list of every skin module (ALL variants) — used to preload/decode. */
export const SKIN_LIST = [
  ...Object.values(SKIN_ORANGE),
  ...Object.values(SKIN_PINK),
  ...Object.values(SKIN_ARCTIC),
  ...Object.values(SKIN_EMERALD),
];

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
  card:      { top: 38, left: 60, bottom: 42, right: 60, w: 400, h: 164 },
  // tbv_panel_frame.png — 400x514 logical (tall form panel).
  panel:     { top: 64, left: 56, bottom: 86, right: 56, w: 400, h: 514 },
  // tbv_stat_frame.png — 400x209 logical.
  cardStat:  { top: 40, left: 56, bottom: 44, right: 56, w: 400, h: 209 },
  // tbv_modal_panel_dark.png — 1118x607 (legacy raw, plain stretch).
  modalPanel:{ top: 90, left: 110, bottom: 96, right: 110, w: 1118, h: 607 },
  // tbv_window_frame.png — 400x273 logical (NEW thinner border).
  window:    { top: 32, left: 38, bottom: 34, right: 38, w: 400, h: 273 },
  // tbv_plate_frame.png — 400x85 logical (NEW thinner border, wide).
  plate:     { top: 12, left: 46, bottom: 12, right: 46, w: 400, h: 85 },
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

/** Accent hex per industrial colour variant — used by the locked login/forgot
 * screens and TbvHeader, which tint native UI to match the active skin. */
export const VARIANT_ACCENT: Record<IndustrialVariant, string> = {
  orange: TBV.orange,
  pink: "#FF1A6B",
  arctic: "#1FC3E8",
  emerald: "#16C871",
  // Steel keeps the warm orange edge glow as its accent.
  steel: TBV.orange,
};
