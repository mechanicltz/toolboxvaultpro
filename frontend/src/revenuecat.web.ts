// Web stub for RevenueCat. The SDK is iOS/Android only.
// We surface enough of the same API so the paywall UI can render and the
// rest of the app behaves identically on web (only "purchase"/"restore"
// are blocked with a friendly message).

export type PurchaseResult = {
  success: boolean;
  entitlement?: string;
  error?: string;
  stub?: boolean;
};

export type PaywallOffering = {
  monthly?: { identifier: string; priceString: string; productId: string; _rawPackage?: any };
  annual?:  { identifier: string; priceString: string; productId: string; _rawPackage?: any };
};

export function isRevenueCatReady(): boolean {
  return false;
}

export function isStubMode(): boolean {
  return true;
}

export async function initRevenueCat(_userId?: string): Promise<void> {
  // no-op on web
  return;
}

export async function identifyRevenueCatUser(_userId: string): Promise<void> {
  return;
}

export async function getOffering(): Promise<PaywallOffering> {
  return {
    monthly: { identifier: "$rc_monthly", priceString: "$7.99",  productId: "pro_monthly" },
    annual:  { identifier: "$rc_annual",  priceString: "$79.99", productId: "pro_yearly"  },
  };
}

export async function purchasePackage(_pkg: any): Promise<PurchaseResult> {
  return {
    success: false,
    stub: true,
    error:
      "Purchases aren't available on web. Use the iOS or Android app, or redeem a Promo Code.",
  };
}

export async function restorePurchases(): Promise<PurchaseResult> {
  return {
    success: false,
    stub: true,
    error: "Restore isn't available on web.",
  };
}

export async function getCurrentCustomerInfo(): Promise<any | null> {
  return null;
}

export function buildSyncPayload(_customerInfo: any): any | null {
  return null;
}
