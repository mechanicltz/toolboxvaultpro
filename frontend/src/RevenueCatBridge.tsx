import { useEffect } from "react";
import { useAuth } from "./AuthContext";
import { api } from "./api";
import {
  isRevenueCatAvailable,
  configurePurchases,
  logOutPurchases,
  addCustomerInfoListener,
  PREMIUM_ENTITLEMENT_ID,
} from "./revenuecat";

/**
 * Lifecycle bridge between the app's auth state and the RevenueCat SDK.
 *
 * Mount this once near the root, INSIDE <AuthProvider>. It will:
 *  - configure RevenueCat with the JWT user id (so iOS/Android purchases
 *    follow the user across devices)
 *  - listen for live entitlement updates from the SDK and POST them to
 *    /api/subscription/sync-revenuecat so the backend stays the source
 *    of truth
 *  - log out from RevenueCat when the app's session ends
 *
 * On web preview / Expo Go this is a complete no-op — the legacy mocked
 * /api/subscription/subscribe path remains available for development.
 */
export function RevenueCatBridge() {
  const { user, refresh } = useAuth();

  useEffect(() => {
    if (!isRevenueCatAvailable()) return;

    let unsub: (() => void) | null = null;
    let cancelled = false;

    const start = async () => {
      if (!user?.id) {
        await logOutPurchases();
        return;
      }
      await configurePurchases(user.id);

      unsub = await addCustomerInfoListener(async (info: any) => {
        try {
          const ent = info?.entitlements?.active?.[PREMIUM_ENTITLEMENT_ID];
          await api.syncRevenueCat({
            is_active: !!ent,
            product_identifier: ent?.productIdentifier ?? null,
            expires_at: ent?.expirationDate ?? null,
            will_renew: ent?.willRenew ?? null,
            period_type: ent?.periodType ?? null,
            store: ent?.store ?? null,
            original_app_user_id: info?.originalAppUserId ?? null,
            revenuecat_app_user_id: info?.appUserId ?? null,
          });
          // Pull the freshly-updated user record so the UI reflects the
          // new tier instantly.
          await refresh();
        } catch (e) {
          console.warn("[RevenueCatBridge] sync failed:", e);
        }
      });
    };

    start();

    return () => {
      cancelled = true;
      try {
        unsub?.();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return null;
}
