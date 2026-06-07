import { ImageSourcePropType } from "react-native";

/**
 * Dealer logos (#17).
 *
 * A dealer's `logo` field is a string that can be:
 *   - "stock:<key>"  -> one of the bundled stock logos below
 *   - "data:image/...;base64,..." or a long raw base64 string -> a custom upload
 *   - ""/"default"/unknown -> falls back to the app icon
 *
 * Stock art lives in /assets/dealer-logos (256x256 transparent PNGs).
 */
export const STOCK_DEALER_LOGOS: Record<string, ImageSourcePropType> = {
  "snap-on": require("../assets/dealer-logos/snap-on.png"),
  matco: require("../assets/dealer-logos/matco.png"),
  "mac-tools": require("../assets/dealer-logos/mac-tools.png"),
  cornwell: require("../assets/dealer-logos/cornwell.png"),
  "harbor-freight": require("../assets/dealer-logos/harbor-freight.png"),
  amazon: require("../assets/dealer-logos/amazon.png"),
};

/** Fallback logo (the app icon) used when a dealer has no logo set. */
export const DEFAULT_DEALER_LOGO: ImageSourcePropType = require("../assets/images/icon-transparent.png");

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

/** Resolve a dealer.logo string to an Image source. */
export function resolveDealerLogo(logo?: string | null): ImageSourcePropType {
  const v = String(logo || "").trim();
  if (!v || v.toLowerCase() === "default") return DEFAULT_DEALER_LOGO;
  if (v.startsWith("stock:")) {
    return STOCK_DEALER_LOGOS[v.slice(6)] || DEFAULT_DEALER_LOGO;
  }
  if (v.startsWith("data:")) return { uri: v };
  // Raw base64 (no data-uri prefix) — assume PNG.
  if (v.length > 100) return { uri: `data:image/png;base64,${v}` };
  return DEFAULT_DEALER_LOGO;
}

/** True when the dealer is using the app-icon fallback (no real logo set). */
export function isDefaultLogo(logo?: string | null): boolean {
  const v = String(logo || "").trim();
  return !v || v.toLowerCase() === "default";
}
