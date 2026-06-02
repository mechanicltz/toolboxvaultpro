/**
 * TbvSkinRegistry — SINGLE SOURCE OF TRUTH for every Toolbox Vault UI asset.
 *
 * RULES
 *  - No screen may `require()` an asset directly. Screens use reusable
 *    components; components resolve their art through this registry.
 *  - Each logical skin has a dark + light source so theme switching is free.
 *  - `substitute: true` marks a stand-in we are using until the FINAL asset
 *    (section_box / accordion_container / inventory_tile / inventory_detail_panel
 *    / dashboard_master_panel) is delivered. Swapping later = change ONLY the
 *    require() path here; every screen updates automatically.
 */
import { ImageSourcePropType } from "react-native";

export type StretchMode = "stretch" | "cover";

export interface SkinEntry {
  dark: ImageSourcePropType;
  light: ImageSourcePropType;
  stretch: StretchMode;
  /** Default content padding (px) to keep content off the decorative frame. */
  pad?: number;
  purpose: string;
  /** True = stand-in art until the real asset arrives. */
  substitute?: boolean;
}

export const SKINS = {
  background: {
    dark: require("../../assets/tbv-master/Backgrounds/tbv_background_dark.png"),
    light: require("../../assets/tbv-master/Backgrounds/tbv_background_light.png"),
    stretch: "cover",
    purpose: "Full-screen page background",
  },
  headerPanel: {
    dark: require("../../assets/tbv-master/UI/ActionCards/tbv_header_panel_darkv2.png"),
    light: require("../../assets/tbv-master/UI/ActionCards/tbv_action_box_light.png"),
    stretch: "stretch",
    pad: 14,
    purpose: "Optional panel behind native screen titles",
    substitute: true, // no dedicated light header panel yet
  },
  statCard: {
    dark: require("../../assets/tbv-master/UI/Dashboard/tbv_stat_card_dark.png"),
    light: require("../../assets/tbv-master/UI/Dashboard/tbv_stat_card_light.png"),
    stretch: "stretch",
    pad: 16,
    purpose: "Dashboard metric tile",
  },
  dashboardWidget: {
    dark: require("../../assets/tbv-master/UI/Dashboard/tbv_dashboard_widget_dark.png"),
    light: require("../../assets/tbv-master/UI/Dashboard/tbv_dashboard_widget_light.png"),
    stretch: "stretch",
    pad: 16,
    purpose: "Dashboard content module",
  },
  actionBox: {
    dark: require("../../assets/tbv-master/UI/ActionCards/tbv_action_box_dark.png"),
    light: require("../../assets/tbv-master/UI/ActionCards/tbv_action_box_light.png"),
    stretch: "stretch",
    pad: 14,
    purpose: "Interactive action card (Report Bug, Quick Actions, etc.)",
  },
  sectionBox: {
    // SUBSTITUTE until tbv_section_box_dark/light arrive.
    dark: require("../../assets/tbv-master/UI/Dashboard/tbv_dashboard_widget_dark.png"),
    light: require("../../assets/tbv-master/UI/Dashboard/tbv_dashboard_widget_light.png"),
    stretch: "stretch",
    pad: 14,
    purpose: "Grouped content section (Dealer Accounts, Settings groups)",
    substitute: true,
  },
  accordionContainer: {
    // SUBSTITUTE until tbv_accordion_container_dark/light arrive.
    dark: require("../../assets/tbv-master/UI/Cards/tbv_card_dark.png"),
    light: require("../../assets/tbv-master/UI/Dashboard/tbv_dashboard_widget_light.png"),
    stretch: "stretch",
    pad: 12,
    purpose: "Expandable accordion body (1–400 rows)",
    substitute: true,
  },
  inventoryTile: {
    // SUBSTITUTE until tbv_inventory_tile_dark/light arrive.
    dark: require("../../assets/tbv-master/UI/Cards/tbv_card_inventory_dark.png"),
    light: require("../../assets/tbv-master/UI/Dashboard/tbv_dashboard_widget_light_v2.png"),
    stretch: "stretch",
    pad: 12,
    purpose: "Inventory item card",
    substitute: true,
  },
  modalPanel: {
    dark: require("../../assets/tbv-v2/trimmed/Panels/tbv_modal_panel_dark.png"),
    light: require("../../assets/tbv-master/UI/ActionCards/tbv_action_box_light.png"),
    stretch: "stretch",
    pad: 18,
    purpose: "Modal / popup container",
    substitute: true,
  },
  btnPrimary: {
    dark: require("../../assets/tbv-master/UI/Buttons/tbv_btn_primary_orange.png"),
    light: require("../../assets/tbv-master/UI/Buttons/tbv_btn_primary_orange.png"),
    stretch: "stretch",
    purpose: "Primary CTA button (orange)",
  },
  btnSecondary: {
    dark: require("../../assets/tbv-master/UI/Buttons/tbv_btn_secondary_dark.png"),
    light: require("../../assets/tbv-master/UI/Buttons/tbv_btn_secondary_dark.png"),
    stretch: "stretch",
    purpose: "Secondary button",
    substitute: true, // no light secondary button yet
  },
  fab: {
    dark: require("../../assets/tbv-master/UI/Buttons/tbv_floating_action_button_orange.png"),
    light: require("../../assets/tbv-master/UI/Buttons/tbv_floating_action_button_orange.png"),
    stretch: "stretch",
    purpose: "Floating action button (Reports)",
  },
} satisfies Record<string, SkinEntry>;

export type SkinName = keyof typeof SKINS;
