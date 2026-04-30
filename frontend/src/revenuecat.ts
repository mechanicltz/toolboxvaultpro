/**
 * RevenueCat integration shim for the Toolbox Tracker app.
 *
 * Why this file exists:
 * - `react-native-purchases` is a native module. It does NOT work in the
 *   web preview / Expo Go and is only valid on iOS/Android.
 * - We lazy-import the SDK behind Platform.OS guards so the rest of the
 *   app keeps running on web (where we fall back to the existing mocked
 *   subscription endpoints for development).
 *
 * Public API
 * ----------
 *   isRevenueCatAvailable()     → true on iOS/Android, false on web.
 *   configurePurchases(jwtId)   → init the SDK with the user's app id.
 *   logOutPurchases()           → clear identity on logout.
 *   getCustomerInfo()           → snapshot of the user's entitlements.
 *   isPremiumActive()           → fast boolean check for the "premium" entitlement.
 *   addCustomerInfoListener(cb) → subscribe to live entitlement changes.
 *   presentPaywall()            → show RevenueCat-managed Paywall (UI SDK).
 *   presentPaywallIfNeeded()    → only if user lacks the entitlement.
 *   presentCustomerCenter()     → manage / cancel existing subscription.
 *
 * NOTE: We use the v10 SDK API surface (Purchases.configure({ apiKey, appUserID }),
 * and react-native-purchases-ui RevenueCatUI.presentPaywall(...)).
 */

import { Platform } from "react-native";
import Constants from "expo-constants";

type CustomerInfo = any;
type Purchases = any;
type RevenueCatUI = any;
type Offerings = any;

const isNative = Platform.OS === "ios" || Platform.OS === "android";

/**
 * Public RevenueCat SDK key. Pulled from the public Expo env so it lives in
 * the JS bundle (this is fine — it's a *public* SDK key, not a secret).
 *
 * EXPO_PUBLIC_REVENUECAT_API_KEY supports either:
 *  - A single test_ key (works for both iOS and Android during sandbox dev)
 *  - "ios=appl_xxx;android=goog_yyy" for production-style platform keys
 */
function getApiKey(): string | null {
  const raw =
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ||
    (Constants.expoConfig?.extra as any)?.revenuecatApiKey ||
    "";
  if (!raw) return null;
  // Allow "ios=...;android=..." overrides
  if (raw.includes("=")) {
    const parts = Object.fromEntries(
      raw.split(/[;,]+/).map((p) => {
        const [k, v] = p.split("=");
        return [k.trim().toLowerCase(), (v || "").trim()];
      }),
    ) as Record<string, string>;
    if (Platform.OS === "ios" && parts.ios) return parts.ios;
    if (Platform.OS === "android" && parts.android) return parts.android;
    return null;
  }
  return raw.trim();
}

let _purchases: Purchases | null = null;
let _ui: RevenueCatUI | null = null;
let _configured = false;
let _configuringForUser: string | null = null;

const ENTITLEMENT_PREMIUM = "premium";
export const PREMIUM_ENTITLEMENT_ID = ENTITLEMENT_PREMIUM;

export function isRevenueCatAvailable(): boolean {
  return isNative && !!getApiKey();
}

async function loadSDK(): Promise<{ Purchases: Purchases; RevenueCatUI: RevenueCatUI } | null> {
  if (!isNative) return null;
  try {
    if (!_purchases) {
      const mod = await import("react-native-purchases");
      _purchases = (mod as any).default || mod;
    }
    if (!_ui) {
      try {
        const uiMod = await import("react-native-purchases-ui");
        _ui = (uiMod as any).default || uiMod;
      } catch (e) {
        // UI SDK is optional — pawalls degrade to manual product picker.
        console.warn("[RevenueCat] UI SDK not available:", e);
      }
    }
    return { Purchases: _purchases, RevenueCatUI: _ui };
  } catch (e) {
    console.warn("[RevenueCat] SDK import failed:", e);
    return null;
  }
}

/**
 * Configure the SDK with a stable user ID. Safe to call multiple times —
 * idempotent on subsequent calls for the same user.
 */
export async function configurePurchases(appUserId: string): Promise<void> {
  if (!isNative) return;
  if (!appUserId) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(
      "[RevenueCat] EXPO_PUBLIC_REVENUECAT_API_KEY is not set — skipping configure",
    );
    return;
  }
  if (_configured && _configuringForUser === appUserId) return;

  const sdk = await loadSDK();
  if (!sdk?.Purchases) return;

  try {
    if (!_configured) {
      // First-time configure
      sdk.Purchases.configure({ apiKey, appUserID: appUserId });
      _configured = true;
      _configuringForUser = appUserId;
      console.log("[RevenueCat] Configured for", appUserId);
    } else if (_configuringForUser !== appUserId) {
      // Switched account — log in to the new identity
      await sdk.Purchases.logIn(appUserId);
      _configuringForUser = appUserId;
      console.log("[RevenueCat] Switched identity to", appUserId);
    }
  } catch (e) {
    console.warn("[RevenueCat] configure failed:", e);
  }
}

export async function logOutPurchases(): Promise<void> {
  if (!isNative || !_configured) return;
  const sdk = await loadSDK();
  if (!sdk?.Purchases) return;
  try {
    await sdk.Purchases.logOut();
    _configuringForUser = null;
  } catch (e) {
    console.warn("[RevenueCat] logOut failed:", e);
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isNative) return null;
  const sdk = await loadSDK();
  if (!sdk?.Purchases) return null;
  try {
    const info = await sdk.Purchases.getCustomerInfo();
    return info;
  } catch (e) {
    console.warn("[RevenueCat] getCustomerInfo failed:", e);
    return null;
  }
}

export async function isPremiumActive(): Promise<boolean> {
  const info = await getCustomerInfo();
  if (!info) return false;
  const ent = info?.entitlements?.active?.[ENTITLEMENT_PREMIUM];
  return !!ent;
}

export async function addCustomerInfoListener(
  cb: (info: CustomerInfo) => void,
): Promise<() => void> {
  if (!isNative) return () => {};
  const sdk = await loadSDK();
  if (!sdk?.Purchases) return () => {};
  try {
    sdk.Purchases.addCustomerInfoUpdateListener(cb);
    return () => {
      try {
        sdk.Purchases.removeCustomerInfoUpdateListener(cb);
      } catch {
        /* old SDK versions had no remove fn */
      }
    };
  } catch (e) {
    console.warn("[RevenueCat] addCustomerInfoListener failed:", e);
    return () => {};
  }
}

export async function getOfferings(): Promise<Offerings | null> {
  if (!isNative) return null;
  const sdk = await loadSDK();
  if (!sdk?.Purchases) return null;
  try {
    return await sdk.Purchases.getOfferings();
  } catch (e) {
    console.warn("[RevenueCat] getOfferings failed:", e);
    return null;
  }
}

/**
 * Present the RevenueCat-managed paywall.
 * Returns a string result code from the UI SDK ("PURCHASED", "CANCELLED",
 * "RESTORED", "ERROR", "NOT_PRESENTED").
 */
export async function presentPaywall(): Promise<string> {
  if (!isNative) return "NOT_PRESENTED";
  const sdk = await loadSDK();
  if (!sdk?.RevenueCatUI) {
    console.warn("[RevenueCat] UI SDK unavailable — cannot present paywall");
    return "ERROR";
  }
  try {
    const result = await sdk.RevenueCatUI.presentPaywall();
    return String(result || "NOT_PRESENTED");
  } catch (e) {
    console.warn("[RevenueCat] presentPaywall failed:", e);
    return "ERROR";
  }
}

export async function presentPaywallIfNeeded(): Promise<string> {
  if (!isNative) return "NOT_PRESENTED";
  const sdk = await loadSDK();
  if (!sdk?.RevenueCatUI) return "ERROR";
  try {
    const result = await sdk.RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ENTITLEMENT_PREMIUM,
    });
    return String(result || "NOT_PRESENTED");
  } catch (e) {
    console.warn("[RevenueCat] presentPaywallIfNeeded failed:", e);
    return "ERROR";
  }
}

export async function presentCustomerCenter(): Promise<void> {
  if (!isNative) return;
  const sdk = await loadSDK();
  if (!sdk?.RevenueCatUI) {
    console.warn("[RevenueCat] UI SDK unavailable — customer center skipped");
    return;
  }
  try {
    await sdk.RevenueCatUI.presentCustomerCenter();
  } catch (e) {
    console.warn("[RevenueCat] presentCustomerCenter failed:", e);
  }
}

/**
 * Map an active CustomerInfo entitlement to the backend tier label.
 * "premium" entitlement is granted by the monthly / yearly / lifetime
 * products; we look at the productIdentifier on the entitlement to
 * pick the right tier label for the backend sync call.
 */
export function tierFromCustomerInfo(info: CustomerInfo | null):
  | "free"
  | "monthly"
  | "yearly"
  | "lifetime" {
  if (!info) return "free";
  const ent = info?.entitlements?.active?.[ENTITLEMENT_PREMIUM];
  if (!ent) return "free";
  const pid = String(ent.productIdentifier || "").toLowerCase();
  if (pid.includes("life")) return "lifetime";
  if (pid.includes("year")) return "yearly";
  if (pid.includes("month")) return "monthly";
  // Fallback: if periodType === "NORMAL" and willRenew=false, assume lifetime
  if (ent.willRenew === false && !ent.expirationDate) return "lifetime";
  return "monthly";
}
