import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { useAuth } from "../src/AuthContext";
import {
  TIER_PRICES,
  TIER_LABELS,
  yearlySavings,
  yearlyMonthlyEquivalent,
  lifetimeSavingsAfterYears,
  isPremium,
  fmtMoney,
  type Tier,
} from "../src/subscription";

type TierCardProps = {
  tier: Tier;
  current: boolean;
  onSelect: () => void;
};

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

function TierCard({ tier, current, onSelect }: TierCardProps) {
  const price = TIER_PRICES[tier];
  const label = TIER_LABELS[tier];
  const isPaid = tier !== "free";
  const isYearly = tier === "yearly";
  const isLifetime = tier === "lifetime";
  const isMonthly = tier === "monthly";

  let badge: { text: string; color: string } | null = null;
  if (isYearly) badge = { text: "BEST VALUE", color: theme.colors.success };
  if (isLifetime) badge = { text: "MOST POPULAR", color: theme.colors.accent };

  let subtitle = "";
  let savings = "";
  if (tier === "free") {
    subtitle = "Try out the basics";
  } else if (isMonthly) {
    subtitle = "Billed monthly";
  } else if (isYearly) {
    subtitle = "Billed once per year";
    savings = "Save hundreds and never pay again!";
  } else if (isLifetime) {
    subtitle = "One-time payment";
    savings = "Save hundreds and never pay again!";
  }

  let priceUnit = "";
  if (isMonthly) priceUnit = "/mo";
  else if (isYearly) priceUnit = "/yr";
  else if (isLifetime) priceUnit = " once";

  const perks =
    tier === "free"
      ? ["Up to 10 inventory items", "1 dealer", "1 authorized agent", "All other features"]
      : [
          "UNLIMITED inventory items",
          "UNLIMITED dealers",
          "UNLIMITED authorized agents",
          "All advanced features",
          isLifetime ? "Pay once — own it forever" : null,
          isYearly ? "Save 17% vs monthly" : null,
        ].filter(Boolean) as string[];

  return (
    <View
      style={[
        styles.card,
        isYearly && styles.cardHighlight,
        isLifetime && styles.cardLifetime,
        current && styles.cardCurrent,
      ]}
    >
      {badge && (
        <View style={[styles.badge, { backgroundColor: badge.color }]}>
          <Text style={styles.badgeText}>{badge.text}</Text>
        </View>
      )}
          {current && (
            <View style={[styles.badge, styles.badgeCurrent]}>
              <Text style={styles.badgeTextCurrent}>CURRENT</Text>
            </View>
          )}

      <View style={styles.cardHeader}>
        <Ionicons
          name={
            tier === "free"
              ? "leaf"
              : tier === "monthly"
                ? "flash"
                : tier === "yearly"
                  ? "ribbon"
                  : "diamond"
          }
          size={26}
          color={
            tier === "free"
              ? theme.colors.textMuted
              : isLifetime
                ? "#FFD54F"
                : theme.colors.accent
          }
        />
        <Text style={styles.cardTitle}>{label}</Text>
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.priceMain}>{isPaid ? fmtMoney(price) : "FREE"}</Text>
        {!!priceUnit && <Text style={styles.priceUnit}>{priceUnit}</Text>}
      </View>
      <Text style={styles.cardSub}>{subtitle}</Text>
      {!!savings && (
        <View style={styles.savingsBox}>
          <Ionicons name="cash" size={13} color={theme.colors.success} />
          <Text style={styles.savingsText}>{savings}</Text>
        </View>
      )}

      <View style={{ height: 1, backgroundColor: theme.colors.borderSubtle, marginVertical: 14 }} />

      <View style={{ gap: 8 }}>
        {perks.map((p) => (
          <View key={p} style={styles.perk}>
            <Ionicons name="checkmark-circle" size={16} color={theme.colors.accent} />
            <Text style={styles.perkText}>{p}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        onPress={onSelect}
        disabled={current}
        style={[
          styles.cta,
          isLifetime && styles.ctaLifetime,
          current && styles.ctaDisabled,
        ]}
      >
        <Text style={[styles.ctaText, current && styles.ctaTextDisabled]}>
          {current ? "ACTIVE" : tier === "free" ? "DOWNGRADE TO FREE" : "CHOOSE PLAN"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ tier: Tier; mode: "subscribe" | "downgrade" } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getSubscription();
      setData(res);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const currentTier = (user?.subscription?.tier || "free") as Tier;
  const sub = user?.subscription;

  const handleSelect = (tier: Tier) => {
    if (tier === currentTier) return;
    if (tier === "free") {
      setConfirm({ tier, mode: "downgrade" });
    } else {
      setConfirm({ tier, mode: "subscribe" });
    }
  };

  const doSubscribe = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api.subscribe(confirm.tier);
      await refresh();
      await load();
      setConfirm(null);
    } catch (e: any) {
      console.warn(e);
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      await api.cancelSubscription();
      await refresh();
      await load();
      setCancelOpen(false);
    } catch (e: any) {
      console.warn(e);
    } finally {
      setBusy(false);
    }
  };

  const doReactivate = async () => {
    setBusy(true);
    try {
      await api.reactivateSubscription();
      await refresh();
      await load();
    } catch (e: any) {
      console.warn(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>SUBSCRIPTION</Text>
          <Text style={styles.subtitle}>Choose your plan</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16 }}>
          {/* Current Status Card */}
          <View style={styles.statusCard}>
            <View style={styles.statusHead}>
              <View style={styles.statusIcon}>
                <Ionicons
                  name={isPremium(currentTier) ? "shield-checkmark" : "leaf"}
                  size={20}
                  color={isPremium(currentTier) ? theme.colors.accent : theme.colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusLabel}>CURRENT PLAN</Text>
                <Text style={styles.statusTier}>{TIER_LABELS[currentTier]}</Text>
              </View>
            </View>
            {sub?.expires_at && currentTier !== "lifetime" && (
              <Text style={styles.statusMeta}>
                {sub.status === "cancelled" ? "Active until" : "Renews on"}: {fmtDate(sub.expires_at)}
              </Text>
            )}
            {data?.counts && !isPremium(currentTier) && (
              <View style={styles.usageBox}>
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Inventory</Text>
                  <Text style={styles.usageVal}>
                    {data.counts.tools} / {data.free_limits.tools}
                  </Text>
                </View>
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Dealers</Text>
                  <Text style={styles.usageVal}>
                    {data.counts.dealers} / {data.free_limits.dealers}
                  </Text>
                </View>
              </View>
            )}
            {sub?.status === "cancelled" && currentTier !== "free" && currentTier !== "lifetime" && (
              <TouchableOpacity onPress={doReactivate} style={styles.reactivateBtn} disabled={busy}>
                <Ionicons name="refresh" size={14} color={theme.colors.accent} />
                <Text style={styles.reactivateText}>Reactivate auto-renew</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Pricing comparison hero banner */}
          {!isPremium(currentTier) && (
            <View style={styles.heroBanner}>
              <Ionicons name="rocket" size={18} color={theme.colors.accent} />
              <Text style={styles.heroText}>
                Yearly is just <Text style={{ fontWeight: "900" }}>${(TIER_PRICES.yearly / 12).toFixed(2)}</Text>
                /mo when paid yearly!
              </Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>CHOOSE YOUR PLAN</Text>

          <TierCard
            tier="free"
            current={currentTier === "free"}
            onSelect={() => handleSelect("free")}
          />
          <TierCard
            tier="monthly"
            current={currentTier === "monthly"}
            onSelect={() => handleSelect("monthly")}
          />
          <TierCard
            tier="yearly"
            current={currentTier === "yearly"}
            onSelect={() => handleSelect("yearly")}
          />
          <TierCard
            tier="lifetime"
            current={currentTier === "lifetime"}
            onSelect={() => handleSelect("lifetime")}
          />

          {/* Cancel button if on a paid plan */}
          {isPremium(currentTier) && currentTier !== "lifetime" && sub?.status !== "cancelled" && (
            <TouchableOpacity onPress={() => setCancelOpen(true)} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>Cancel subscription</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.disclaimer}>
            All prices in USD. Subscriptions auto-renew at the end of each billing period — cancel
            anytime before then to avoid renewal. Lifetime is a one-time payment.
            {"\n\n"}
            <Text style={{ fontWeight: "800" }}>* DEMO MODE:</Text> No real payments are processed.
            You can change tiers freely for testing.
          </Text>
        </ScrollView>
      )}

      {/* Confirm subscribe modal */}
      <Modal transparent animationType="fade" visible={!!confirm} onRequestClose={() => setConfirm(null)}>
        <Pressable style={styles.overlay} onPress={() => !busy && setConfirm(null)}>
          <Pressable style={styles.confirmModal} onPress={(e) => e.stopPropagation()}>
            <Ionicons
              name={confirm?.mode === "downgrade" ? "warning" : "checkmark-circle"}
              size={36}
              color={confirm?.mode === "downgrade" ? theme.colors.warning : theme.colors.success}
              style={{ alignSelf: "center", marginBottom: 8 }}
            />
            <Text style={styles.confirmTitle}>
              {confirm?.mode === "downgrade" ? "Downgrade to Free?" : `Confirm ${TIER_LABELS[confirm?.tier as Tier]}`}
            </Text>
            <Text style={styles.confirmMsg}>
              {confirm?.mode === "downgrade"
                ? "Items beyond the free limits (10 tools, 1 dealer, 1 agent) will be locked but stay visible. Re-subscribe anytime to unlock."
                : `You will be charged ${fmtMoney(TIER_PRICES[confirm?.tier as Tier] || 0)}${
                    confirm?.tier === "monthly" ? "/month" : confirm?.tier === "yearly" ? "/year" : " once"
                  }.\n\nDEMO MODE — no real payment will be processed.`}
            </Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity onPress={() => setConfirm(null)} style={styles.btnSecondary} disabled={busy}>
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={doSubscribe} style={styles.btnPrimary} disabled={busy}>
                {busy ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.btnPrimaryText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Cancel subscription modal */}
      <Modal transparent animationType="fade" visible={cancelOpen} onRequestClose={() => setCancelOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => !busy && setCancelOpen(false)}>
          <Pressable style={styles.confirmModal} onPress={(e) => e.stopPropagation()}>
            <Ionicons name="alert-circle" size={36} color={theme.colors.warning} style={{ alignSelf: "center", marginBottom: 8 }} />
            <Text style={styles.confirmTitle}>Cancel Subscription?</Text>
            <Text style={styles.confirmMsg}>
              Your subscription stays active until {fmtDate(sub?.expires_at)}. After that, your account will downgrade to Free and items beyond the free limits will be locked.
            </Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity onPress={() => setCancelOpen(false)} style={styles.btnSecondary} disabled={busy}>
                <Text style={styles.btnSecondaryText}>Keep Plan</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={doCancel} style={[styles.btnPrimary, { backgroundColor: theme.colors.danger }]} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.btnPrimaryText, { color: "#fff" }]}>Cancel Plan</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: theme.colors.textPrimary, fontSize: 24, fontWeight: "900", letterSpacing: 2 },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: 2,
    textTransform: "uppercase",
  },
  statusCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 8,
    marginBottom: 14,
  },
  statusHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.colors.bgSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  statusLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  statusTier: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 2,
  },
  statusMeta: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 8 },
  usageBox: { marginTop: 12, gap: 6 },
  usageRow: { flexDirection: "row", justifyContent: "space-between" },
  usageLabel: { color: theme.colors.textSecondary, fontSize: 13 },
  usageVal: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: "700" },
  reactivateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  reactivateText: { color: theme.colors.accent, fontWeight: "700", fontSize: 13 },
  heroBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,179,0,0.08)",
    borderColor: theme.colors.glassBorder,
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  heroText: { color: theme.colors.textSecondary, fontSize: 13, flex: 1 },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 18,
    paddingTop: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 20,
    position: "relative",
  },
  cardHighlight: {
    borderColor: theme.colors.success,
    borderWidth: 2,
  },
  cardLifetime: {
    borderColor: theme.colors.accent,
    borderWidth: 2,
    backgroundColor: "rgba(255,179,0,0.04)",
  },
  cardCurrent: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(255,179,0,0.06)",
  },
  badge: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  badgeCurrent: {
    backgroundColor: "rgba(255,179,0,0.15)",
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  badgeText: { color: "#000", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  badgeTextCurrent: { color: theme.colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 12 },
  priceMain: { color: theme.colors.textPrimary, fontSize: 32, fontWeight: "900" },
  priceUnit: { color: theme.colors.textMuted, fontSize: 14, fontWeight: "700", paddingBottom: 6 },
  cardSub: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
  savingsBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16,185,129,0.12)",
    borderColor: theme.colors.success,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  savingsText: { color: theme.colors.success, fontSize: 12, fontWeight: "800" },
  perk: { flexDirection: "row", alignItems: "center", gap: 8 },
  perkText: { color: theme.colors.textSecondary, fontSize: 13 },
  cta: {
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
  },
  ctaLifetime: { backgroundColor: "#FFD54F" },
  ctaDisabled: { backgroundColor: theme.colors.borderSubtle },
  ctaText: { color: "#000", fontWeight: "900", fontSize: 13, letterSpacing: 1.5 },
  ctaTextDisabled: { color: theme.colors.textMuted },
  cancelLink: { paddingVertical: 14, alignItems: "center", marginTop: 8 },
  cancelLinkText: {
    color: theme.colors.danger,
    fontWeight: "700",
    fontSize: 13,
    textDecorationLine: "underline",
  },
  disclaimer: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 4,
    marginTop: 16,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  confirmModal: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 22,
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  confirmTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "900",
    fontSize: 16,
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: 8,
  },
  confirmMsg: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginBottom: 16,
  },
  confirmRow: { flexDirection: "row", gap: 10 },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.bgSecondary,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  btnSecondaryText: { color: theme.colors.textPrimary, fontWeight: "700", fontSize: 13 },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#000", fontWeight: "900", fontSize: 13, letterSpacing: 1 },
});
