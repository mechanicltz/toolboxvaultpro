// Paywall screen — shown when a free user hits the 15-item limit (auto via
// the 402 interceptor) or when the user opts in from More → Manage Subscription.
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../src/theme";
import { api } from "../src/api";
import {
  getOffering,
  purchasePackage,
  restorePurchases,
  isStubMode,
  buildSyncPayload,
  type PaywallOffering,
} from "../src/revenuecat";
import { PromoRedeemModal } from "../src/PromoRedeemModal";

import { themedStyles } from "../src/themeContext";

const FEATURES = [
  "Unlimited tools — no 15-item cap",
  "Priority support",
  "Support the developer & help the app grow",
];

export default function PaywallScreen() {
  const router = useRouter();
  const [offering, setOffering] = useState<PaywallOffering>({});
  const [loading, setLoading] = useState(true);
  const [busyPkg, setBusyPkg] = useState<"monthly" | "annual" | "restore" | null>(null);
  const [stub, setStub] = useState(false);
  const [sub, setSub] = useState<any>(null);
  const [showRedeem, setShowRedeem] = useState(false);

  const refreshSub = useCallback(async () => {
    try {
      const s = await api.getSubscription();
      setSub(s);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    (async () => {
      setStub(isStubMode());
      setLoading(true);
      const off = await getOffering();
      setOffering(off || {});
      await refreshSub();
      setLoading(false);
    })();
  }, [refreshSub]);

  const isPro = !!(sub?.is_lifetime || sub?.is_active);

  const doPurchase = async (kind: "monthly" | "annual") => {
    const pkg = kind === "monthly" ? offering.monthly : offering.annual;
    if (!pkg) {
      Alert.alert("Not available", "This plan isn't currently offered.");
      return;
    }
    setBusyPkg(kind);
    try {
      const res = await purchasePackage(pkg as any);
      if (res.success) {
        // Tell our backend immediately so the 15-item limit unlocks
        // without waiting for the RC webhook to land. The customerInfo
        // payload comes straight from RC's SDK, which fetched the
        // receipt directly from Apple/Google.
        const payload = buildSyncPayload(res.customerInfo);
        if (payload) {
          try {
            await api.post("/subscription/sync", payload);
          } catch (e) {
            console.warn("[paywall] subscription sync failed", e);
          }
        }
        await refreshSub();
        Alert.alert("Welcome to PRO! ✨", "Your subscription is active.");
        router.back();
      } else if (res.stub) {
        Alert.alert(
          "Dev build needed",
          res.error ||
            "Real purchases require a fresh build. Your UI flow is working — use a Promo Code below to unlock PRO for testing.",
        );
      } else if (res.error && res.error !== "Cancelled") {
        Alert.alert("Couldn't complete purchase", res.error);
      }
    } finally {
      setBusyPkg(null);
    }
  };

  const doRestore = async () => {
    setBusyPkg("restore");
    try {
      const res = await restorePurchases();
      if (res.success) {
        const payload = buildSyncPayload(res.customerInfo);
        if (payload) {
          try {
            await api.post("/subscription/sync", payload);
          } catch (e) {
            console.warn("[paywall] subscription sync failed (restore)", e);
          }
        }
        await refreshSub();
        Alert.alert("Restored ✓", "Your previous purchase has been restored.");
        router.back();
      } else if (res.stub) {
        Alert.alert("Dev build needed", res.error || "Restore requires a fresh build.");
      } else {
        Alert.alert("Nothing to restore", "We couldn't find a previous purchase on this account.");
      }
    } finally {
      setBusyPkg(null);
    }
  };

  const openManageSubscription = () => {
    const url =
      Platform.OS === "ios"
        ? "https://apps.apple.com/account/subscriptions"
        : "https://play.google.com/store/account/subscriptions";
    Linking.openURL(url).catch(() => {});
  };

  const monthlyPrice = offering.monthly?.priceString || "$7.99";
  const annualPrice = offering.annual?.priceString || "$79.99";
  // Naive %-off compute — best effort, fine for a hint label.
  let savePct = "";
  try {
    const m = Number(monthlyPrice.replace(/[^0-9.]/g, ""));
    const a = Number(annualPrice.replace(/[^0-9.]/g, ""));
    if (m && a) {
      const annual12 = m * 12;
      const pct = Math.round((1 - a / annual12) * 100);
      if (pct > 0) savePct = `Save ${pct}%`;
    }
  } catch {
    /* keep blank */
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="paywall-close">
          <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>UPGRADE</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50 }}>
        <View style={styles.heroBox}>
          <View style={styles.heroIcon}>
            <Ionicons name="star" size={28} color="#000" />
          </View>
          <Text style={styles.heroTitle}>TOOLBOX VAULT PRO</Text>
          <Text style={styles.heroSub}>
            {isPro
              ? "You already have PRO — thanks for supporting the app!"
              : "Track unlimited tools. Currently free users are capped at 15."}
          </Text>
        </View>

        {stub && (
          <View style={styles.stubBanner}>
            <Ionicons name="information-circle" size={16} color={theme.colors.accent} />
            <Text style={styles.stubBannerText}>
              Subscriptions can only be purchased in the iOS or Android app. You can use Redeem Promo Code below to unlock PRO features here.
            </Text>
          </View>
        )}

        {/* Features list */}
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        {/* Plan cards */}
        {loading ? (
          <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 24 }} />
        ) : (
          <>
            <TouchableOpacity
              style={[styles.planCard, { marginTop: 18 }]}
              onPress={() => doPurchase("monthly")}
              disabled={!!busyPkg || isPro}
              testID="paywall-monthly"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.planTitle}>MONTHLY</Text>
                <Text style={styles.planPrice}>{monthlyPrice}<Text style={styles.planPeriod}>/month</Text></Text>
                <Text style={styles.planSub}>Cancel anytime</Text>
              </View>
              {busyPkg === "monthly" ? (
                <ActivityIndicator color={theme.colors.accent} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={theme.colors.accent} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.planCard, styles.planCardFeatured]}
              onPress={() => doPurchase("annual")}
              disabled={!!busyPkg || isPro}
              testID="paywall-yearly"
            >
              {savePct ? (
                <View style={styles.savePill}>
                  <Text style={styles.savePillText}>{savePct}</Text>
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={[styles.planTitle, { color: theme.colors.accent }]}>YEARLY</Text>
                <Text style={styles.planPrice}>{annualPrice}<Text style={styles.planPeriod}>/year</Text></Text>
                <Text style={styles.planSub}>Best value · billed annually</Text>
              </View>
              {busyPkg === "annual" ? (
                <ActivityIndicator color={theme.colors.accent} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={theme.colors.accent} />
              )}
            </TouchableOpacity>
          </>
        )}

        {/* Secondary actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={doRestore}
            disabled={busyPkg === "restore"}
            testID="paywall-restore"
          >
            {busyPkg === "restore" ? (
              <ActivityIndicator color={theme.colors.textPrimary} />
            ) : (
              <>
                <Ionicons name="refresh" size={14} color={theme.colors.textPrimary} />
                <Text style={styles.actionBtnText}>RESTORE</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowRedeem(true)}
            testID="paywall-redeem"
          >
            <Ionicons name="gift" size={14} color={theme.colors.textPrimary} />
            <Text style={styles.actionBtnText}>REDEEM CODE</Text>
          </TouchableOpacity>
        </View>

        {isPro && (
          <TouchableOpacity
            style={[styles.actionBtn, { marginTop: 12, alignSelf: "stretch" }]}
            onPress={openManageSubscription}
            testID="paywall-manage"
          >
            <Ionicons name="settings-outline" size={14} color={theme.colors.textPrimary} />
            <Text style={styles.actionBtnText}>MANAGE SUBSCRIPTION</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.terms}>
          Subscriptions auto-renew unless cancelled at least 24 hours before the
          end of the current period. You can cancel any time from your{"\n"}
          {Platform.OS === "ios" ? "Apple ID subscriptions page" : "Google Play subscriptions page"}.
        </Text>

        <View style={styles.legalRow}>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL(
                "https://mechanicltz.github.io/toolboxvault-legal/terms.html",
              )
            }
            testID="paywall-terms-link"
          >
            <Text style={styles.legalLink}>Terms of Use</Text>
          </TouchableOpacity>
          <Text style={styles.legalDot}>•</Text>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL(
                "https://mechanicltz.github.io/toolboxvault-legal/privacy.html",
              )
            }
            testID="paywall-privacy-link"
          >
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <PromoRedeemModal
        visible={showRedeem}
        onClose={() => setShowRedeem(false)}
        onRedeemed={async () => {
          await refreshSub();
          // Allow the success state to be visible briefly, then close paywall.
          setTimeout(() => router.back(), 1400);
        }}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerTitle: {
    color: c.textPrimary,
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 13,
  },
  heroBox: {
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  heroTitle: {
    color: c.textPrimary,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  heroSub: {
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 16,
  },
  stubBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    backgroundColor: "rgba(245,158,11,0.12)",
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: 10,
    marginBottom: 12,
  },
  stubBannerText: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 11,
    fontWeight: "600",
  },
  features: { gap: 8, marginTop: 4 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureText: {
    color: c.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
  
    ...(theme.elevation.md as object),
  },
  planCardFeatured: {
    borderColor: c.accent,
    borderWidth: 2,
    position: "relative",
  },
  savePill: {
    position: "absolute",
    top: -10,
    right: 14,
    backgroundColor: c.accent,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  savePillText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 1,
  },
  planTitle: {
    color: c.textPrimary,
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 11,
    marginBottom: 4,
  },
  planPrice: {
    color: c.textPrimary,
    fontSize: 20,
    fontWeight: "900",
  },
  planPeriod: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  planSub: {
    color: c.textMuted,
    fontSize: 11,
    marginTop: 3,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingVertical: 12,
  
    ...(theme.elevation.md as object),
  },
  actionBtnText: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 10.5,
    letterSpacing: 1.2,
  },
  terms: {
    color: c.textMuted,
    fontSize: 10,
    textAlign: "center",
    marginTop: 22,
    lineHeight: 14,
    paddingHorizontal: 12,
  },
  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    marginBottom: 4,
  },
  legalLink: {
    color: c.accent,
    fontSize: 11,
    fontWeight: "700",
    textDecorationLine: "underline",
    letterSpacing: 0.3,
  },
  legalDot: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
}));
