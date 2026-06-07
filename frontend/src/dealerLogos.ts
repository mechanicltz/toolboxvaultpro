import { ImageSourcePropType } from "react-native";

/**
 * Dealer logos (#17) — CENTRALIZED.
 *
 * A dealer's `logo` field is a string that can be:
 *   - "stock:<key>"  -> one of the bundled stock logos below
 *   - "data:image/...;base64,..." or a long raw base64 string -> a custom upload
 *   - ""/"default"/unknown -> NO image; the <DealerLogo> component draws a
 *     neutral placeholder icon (NOT the old app icon).
 *
 * Stock art lives in /assets/dealer-logos — every PNG has been trimmed tight to
 * its artwork (no transparent padding) so it sits flush inside the logo slot.
 */

/**
 * One source of truth for logo slot sizing across the whole app. Change a
 * number here and every dealer logo (lists, dashboard, detail, pickers) updates
 * uniformly. Each value is a SQUARE slot edge in px — the logo is centered and
 * contained inside it so all rows align and all icons read the same size.
 */
export const DEALER_LOGO_SLOT = {
  compact: 46, // dashboard "Dealer Accounts" rows + balance rows
  list: 54, // Dealers tab list rows
  hero: 150, // Dealer detail header
  picker: 56, // add / edit modal preview
} as const;

export const STOCK_DEALER_LOGOS: Record<string, ImageSourcePropType> = {
  "snap-on": require("../assets/dealer-logos/snap-on.png"),
  matco: require("../assets/dealer-logos/matco.png"),
  "mac-tools": require("../assets/dealer-logos/mac-tools.png"),
  cornwell: require("../assets/dealer-logos/cornwell.png"),
  "harbor-freight": require("../assets/dealer-logos/harbor-freight.png"),
  amazon: require("../assets/dealer-logos/amazon.png"),
};

export type StockLogoOption = {
  key: string;
  label: string;
  value: string; // the value stored on the dealer ("stock:<key>")
  source: ImageSourcePropType;
};

export const STOCK_LOGO_OPTIONS: StockLogoOption[] = [
  { key: "snap-on", label: "Snap-on", value: "stock:snap-on", source: STOCK_DEALER_LOGOS["snap-on"] },
  { key: "matco", label: "Matco", value: "stock:matco", source: STOCK_DEALER_LOGOS["matco"] },
  { key: "mac-tools", label: "Mac Tools", value: "stock:mac-tools", source: STOCK_DEALER_LOGOS["mac-tools"] },
  { key: "cornwell", label: "Cornwell", value: "stock:cornwell", source: STOCK_DEALER_LOGOS["cornwell"] },
  { key: "harbor-freight", label: "Harbor Freight", value: "stock:harbor-freight", source: STOCK_DEALER_LOGOS["harbor-freight"] },
  { key: "amazon", label: "Amazon", value: "stock:amazon", source: STOCK_DEALER_LOGOS["amazon"] },
];

/** True when the dealer has no real logo set (uses the placeholder icon). */
export function isDefaultLogo(logo?: string | null): boolean {
  const v = String(logo || "").trim();
  return !v || v.toLowerCase() === "default";
}

/**
 * Resolve a dealer.logo string to an Image source, or `null` when there is no
 * real logo (default / empty / unknown). When `null`, <DealerLogo> renders a
 * neutral placeholder instead of any image.
 */
export function resolveDealerLogo(logo?: string | null): ImageSourcePropType | null {
  const v = String(logo || "").trim();
  if (isDefaultLogo(v)) return null;
  if (v.startsWith("stock:")) {
    return STOCK_DEALER_LOGOS[v.slice(6)] || null;
  }
  if (v.startsWith("data:")) return { uri: v };
  // Raw base64 (no data-uri prefix) — assume PNG.
  if (v.length > 100) return { uri: `data:image/png;base64,${v}` };
  return null;
}
