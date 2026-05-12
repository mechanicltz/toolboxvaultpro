// Native (iOS/Android) RevenueCat wrapper.
//
// Important: `react-native-purchases` is a NATIVE module. It works in:
//   - Expo development builds (eas build / Emergent native builds)
//   - Custom dev clients (expo-dev-client)
// It does NOT work in plain Expo Go.
//
// We detect Expo Go at runtime via `expo-constants` and fall through to
// stub behaviour so the rest of the app keeps working.

import Constants from "expo-constants";
import { Platform } from "react-native";

export type PurchaseResult = {
  success: boolean;
  entitlement?: string;
  error?: string;
  stub?: boolean; // true when this came from the stub (Expo Go) path
  customerInfo?: any; // raw RC customerInfo, used to sync the backend
};

export type PaywallOffering = {
  monthly?: {
    identifier: string;
    priceString: string;
    productId: string;
    // The raw RC package object (for native purchase call)
    _rawPackage?: any;
  };
  annual?: {
    identifier: string;
    priceString: string;
    productId: string;
    _rawPackage?: any;
  };
};

// Lazy-loaded SDK module (only resolved on the first call, never on web).
let _Purchases: any = null;
let _ready = false;
let _isExpoGo = false;

function _detectExpoGo(): boolean {
  // Expo Go reports appOwnership === 'expo'
  return Constants?.appOwnership === "expo";
}

function _loadSdk(): any {
  if (_Purchases) return _Purchases;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _Purchases = require("react-native-purchases").default;
    return _Purchases;
  } catch {
    return null;
  }
}

export function isRevenueCatReady(): boolean {
  return _ready && !_isExpoGo;
}

export function isStubMode(): boolean {
  return _isExpoGo || !_Purchases;
}

export async function initRevenueCat(userId?: string): Promise<void> {
  _isExpoGo = _detectExpoGo();
  if (_isExpoGo) {
    console.log("[RC] Expo Go detected — running in STUB mode.");
    _ready = false;
    return;
  }

  const sdk = _loadSdk();
  if (!sdk) {
    console.warn("[RC] react-native-purchases not available — STUB mode.");
    _ready = false;
    return;
  }

  const apiKey =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS
      : process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID;
  if (!apiKey) {
    console.warn("[RC] Missing API key in env. STUB mode.");
    _ready = false;
    return;
  }

  try {
    sdk.setLogLevel("warn");
    await sdk.configure({
      apiKey,
      appUserID: userId || null,
    });
    _ready = true;
    console.log("[RC] SDK configured.");
  } catch (e) {
    console.warn("[RC] configure failed", e);
    _ready = false;
  }
}

export async function identifyRevenueCatUser(userId: string): Promise<void> {
  if (!isRevenueCatReady()) return;
  try {
    await _Purchases.logIn(userId);
  } catch (e) {
    console.warn("[RC] logIn failed", e);
  }
}

export async function getOffering(): Promise<PaywallOffering> {
  // Default fake products so the UI always has something to render.
  const stubOffer: PaywallOffering = {
    monthly: {
      identifier: "$rc_monthly",
      priceString: "$7.99",
      productId: "pro_monthly",
    },
    annual: {
      identifier: "$rc_annual",
      priceString: "$79.99",
      productId: "pro_yearly",
    },
  };
  if (!isRevenueCatReady()) return stubOffer;
  try {
    const offerings = await _Purchases.getOfferings();
    const current = offerings?.current;
    if (!current) return stubOffer;
    const out: PaywallOffering = {};
    if (current.monthly) {
      out.monthly = {
        identifier: current.monthly.identifier,
        priceString: current.monthly.product?.priceString || "$7.99",
        productId: current.monthly.product?.identifier || "pro_monthly",
        _rawPackage: current.monthly,
      };
    }
    if (current.annual) {
      out.annual = {
        identifier: current.annual.identifier,
        priceString: current.annual.product?.priceString || "$79.99",
        productId: current.annual.product?.identifier || "pro_yearly",
        _rawPackage: current.annual,
      };
    }
    return Object.keys(out).length ? out : stubOffer;
  } catch (e) {
    console.warn("[RC] getOfferings failed", e);
    return stubOffer;
  }
}

export async function purchasePackage(
  pkg: { _rawPackage?: any } | undefined,
): Promise<PurchaseResult> {
  if (!isRevenueCatReady() || !pkg?._rawPackage) {
    return {
      success: false,
      stub: true,
      error:
        "Real purchases require a development build. This Expo Go session can't process payments — try a Promo Code instead to unlock PRO for testing.",
    };
  }
  try {
    const res = await _Purchases.purchasePackage(pkg._rawPackage);
    const info = res?.customerInfo || res;
    const proActive = !!info?.entitlements?.active?.pro;
    return {
      success: proActive,
      entitlement: proActive ? "pro" : undefined,
      customerInfo: info,
    };
  } catch (e: any) {
    if (e?.userCancelled) {
      return { success: false, error: "Cancelled" };
    }
    return { success: false, error: e?.message || String(e) };
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isRevenueCatReady()) {
    return {
      success: false,
      stub: true,
      error: "Restore requires a development build with the RevenueCat SDK.",
    };
  }
  try {
    const info = await _Purchases.restorePurchases();
    const proActive = !!info?.entitlements?.active?.pro;
    return {
      success: proActive,
      entitlement: proActive ? "pro" : undefined,
      customerInfo: info,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * Pull the current customer info from RevenueCat. Used on app boot and
 * after returning to foreground so we always know if the user is PRO,
 * even if a purchase happened on another device.
 */
export async function getCurrentCustomerInfo(): Promise<any | null> {
  if (!isRevenueCatReady()) return null;
  try {
    return await _Purchases.getCustomerInfo();
  } catch (e) {
    console.warn("[RC] getCustomerInfo failed", e);
    return null;
  }
}

/**
 * Log out of RevenueCat. Should be called whenever the app user logs out
 * so a future login on the same device doesn't inherit the previous
 * user's entitlements (common in dev/testing where multiple app accounts
 * share one Apple ID — RC SDK will remember the last appUserID
 * otherwise).
 */
export async function logoutRevenueCat(): Promise<void> {
  if (!isRevenueCatReady()) return;
  try {
    await _Purchases.logOut();
  } catch (e) {
    // Ignore — logOut throws if the user is already anonymous.
  }
}

/**
 * Extract a small, JSON-safe payload from a RevenueCat customerInfo
 * object that the backend `/api/subscription/sync` endpoint expects.
 * Returns null if there's no `pro` entitlement to report.
 */
export function buildSyncPayload(customerInfo: any): any | null {
  if (!customerInfo) return null;
  const pro =
    customerInfo?.entitlements?.active?.pro ||
    customerInfo?.entitlements?.all?.pro;
  if (!pro) {
    return { entitlement_active: false };
  }
  return {
    entitlement_active: !!customerInfo?.entitlements?.active?.pro,
    expires_at: pro?.expirationDate || pro?.expires_date || null,
    product_id: pro?.productIdentifier || null,
    store: pro?.store || null,
    will_renew: !!pro?.willRenew,
    period_type: pro?.periodType || null,
    purchased_at: pro?.latestPurchaseDate || pro?.purchase_date || null,
  };
}
