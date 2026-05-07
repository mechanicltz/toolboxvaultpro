/**
 * Single source of truth for the displayed app version.
 *
 * We read directly from app.json (bundled at compile time by Metro) so the
 * value is identical on web/iOS/Android dev and EAS production builds. This
 * avoids the inconsistency in `Constants.expoConfig` between platforms in
 * Expo SDK 54.
 */
import { Platform } from "react-native";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require("../app.json");

const expoCfg: any = appJson?.expo || {};

export const APP_VERSION: string = String(expoCfg.version || "0.0.0");

export const APP_BUILD: string = (() => {
  if (Platform.OS === "ios") {
    return String(expoCfg?.ios?.buildNumber ?? "");
  }
  if (Platform.OS === "android") {
    const vc = expoCfg?.android?.versionCode;
    return vc != null ? String(vc) : "";
  }
  // On web (preview) we don't have a buildNumber concept, fall back to iOS.
  return String(expoCfg?.ios?.buildNumber ?? "");
})();

/** "v1.0.11" — short form for compact UI placement. */
export const APP_VERSION_LABEL: string = `v${APP_VERSION}`;

/** "v1.0.11 (11)" — long form including the build number. */
export const APP_VERSION_LABEL_FULL: string = APP_BUILD
  ? `v${APP_VERSION} (${APP_BUILD})`
  : `v${APP_VERSION}`;
