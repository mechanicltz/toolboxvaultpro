import { useState, useCallback, ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { PaymentModal } from "../../src/sections/PaymentModal";
import { nextRouteDate, DAY_NAMES } from "../../src/route";
import { formatDateUS } from "../../src/dateUtil";
import { getCached, setCached } from "../../src/cache";
import { usePrefs } from "../../src/prefs";

export default function HomeScreen() {
  const router = useRouter();
  const { prefs } = usePrefs();
  const [stats, setStats] = useState<any>(() => getCached("home_stats", {}));
  const [agg, setAgg] = useState<any>(() => getCached("home_agg", {}));
  const [tools, setTools] = useState<any[]>(() => getCached("tools", []));
  const [wishlist, setWishlist] = useState<any[]>(() => getCached("wishlist", []));
  const [dealers, setDealers] = useState<any[]>(() => getCached("dealers", []));
  const [mnt, setMnt] = useState<any>(() =>
    getCached("home_mnt", { overdue: 0, due_soon: 0, total: 0 }),
  );
  const [claims, setClaims] = useState<any>(() =>
    getCached("claims_summary", { totals: { open: 0 } }),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<{
    dealer: any;
    account: "credit" | "personal";
  } | null>(null);

  void stats;

  const load = useCallback(async () => {
    try {
      const [s, a, t, w, d, m, c] = await Promise.all([
        api.getStats().catch(() => ({})),
        api.aggregate({}).catch(() => ({})),
        api.listTools({}).catch(() => []),
        api.listWishlist().catch(() => []),
        api.listDealers().catch(() => []),
        api
          .upcomingMaintenance(30)
          .catch(() => ({ overdue: 0, due_soon: 0, total: 0 })),
        api
          .warrantyClaimsSummary()
          .catch(() => ({ totals: { open: 0 } })),
      ]);
      setStats(setCached("home_stats", s));
      setAgg(setCached("home_agg", a));
      setTools(setCached("tools", t));
      setWishlist(setCached("wishlist", w));
      setDealers(setCached("dealers", d));
      setMnt(setCached("home_mnt", m));
      setClaims(setCached("claims_summary", c));
    } catch {
      /* ignore */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ---------- Derived metrics ----------
  const totalItems = tools.length;
  const checkedOut = tools.filter((x) => x.is_checked_out).length;
  const forSaleCount = tools.filter((x) => x.for_sale && !x.is_sold).length;
  const lost = tools.filter((x) => x?.lost_status?.is_lost).length;
  const aggTotal = Number(agg?.total_value);
  const totalInvested = Number.isFinite(aggTotal)
    ? aggTotal
    : tools.reduce(
        (sum, x) =>
          sum + (Number(x.cost) || 0) * Math.max(1, Number(x.quantity) || 1),
        0,
      );
  const wishlistCount = wishlist.filter((w) => !w.is_purchased).length;
  const wishlistTotal = wishlist
    .filter((w) => !w.is_purchased)
    .reduce((sum, x) => sum + (Number(x.price) || 0), 0);

  const dealersWithBalance = dealers
    .map((d) => ({
      ...d,
      total:
        (Number(d.credit_balance) || 0) + (Number(d.personal_balance) || 0),
    }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total);

  const totalOwed = dealers.reduce(
    (sum, d) =>
      sum + (Number(d.credit_balance) || 0) + (Number(d.personal_balance) || 0),
    0,
  );

  // ---------- Next-route banner ----------
  const upcomingRoutes = dealers
    .map((d) => ({ dealer: d, when: nextRouteDate(d) }))
    .filter((x): x is { dealer: any; when: Date } => !!x.when);
  let nextRouteBanner: { dateStr: string; dealers: string[] } | null = null;
  if (upcomingRoutes.length) {
    upcomingRoutes.sort((a, b) => a.when.getTime() - b.when.getTime());
    const earliest = upcomingRoutes[0].when.getTime();
    const sameDay = upcomingRoutes.filter(
      (x) => x.when.getTime() === earliest,
    );
    const dt = upcomingRoutes[0].when;
    const dateStr = `${DAY_NAMES[dt.getDay()]} ${formatDateUS(
      dt.toISOString().slice(0, 10),
    )}`;
    nextRouteBanner = {
      dateStr,
      dealers: sameDay.map((x) => x.dealer.name),
    };
  }

  const visible = prefs.home_rows;
  const order = prefs.home_row_order;

  // Lookup of how to render each row. We render in the user's chosen order
  // and skip any rows the user has hidden.
  const ROW_RENDERERS: Record<string, () => ReactNode> = {
    total_items: () => (
      <SummaryRow
        icon="cube"
        label="TOTAL ITEMS"
        value={String(totalItems)}
        onPress={() => router.push("/inventory")}
      />
    ),
    invested: () => (
      <SummaryRow
        icon="cash"
        label="INVESTED"
        value={`$${totalInvested.toFixed(2)}`}
      />
    ),
    checked_out: () => (
      <SummaryRow
        icon="swap-horizontal"
        label="CHECKED OUT"
        value={String(checkedOut)}
        onPress={() => router.push("/inventory?filter=out")}
      />
    ),
    selling: () => (
      <SummaryRow
        icon="pricetag"
        label="SELLING"
        value={String(forSaleCount)}
        onPress={() => router.push("/for-sale")}
      />
    ),
    wishlist: () => (
      <SummaryRow
        icon="heart"
        label="WISH LIST"
        value={`${wishlistCount} · $${wishlistTotal.toFixed(2)}`}
        onPress={() => router.push("/wishlist")}
      />
    ),
    lost: () => (
      <SummaryRow
        icon="warning"
        label="LOST / STOLEN"
        value={String(lost)}
        onPress={() => router.push("/inventory?filter=lost")}
      />
    ),
    maintenance: () => (
      <SummaryRow
        icon="settings"
        label="MAINTENANCE DUE"
        value={String(mnt.overdue + mnt.due_soon)}
        sub={mnt.overdue > 0 ? `${mnt.overdue} OVERDUE` : "DUE 30D"}
        onPress={() => router.push("/maintenance")}
      />
    ),
    open_claims: () => (
      <SummaryRow
        icon="document-text"
        label="OPEN CLAIMS"
        value={String(claims?.totals?.open || 0)}
        onPress={() => router.push("/claims")}
      />
    ),
    owed_to_dealers: () => (
      <View style={styles.owedCluster}>
        <SummaryRow
          icon="wallet"
          label="OWED TO DEALERS"
          value={`$${totalOwed.toFixed(2)}`}
          onPress={() => router.push("/dealers")}
        />
        {dealersWithBalance.length === 0 ? (
          <Text style={styles.emptyInline}>No outstanding balances. 🎉</Text>
        ) : (
          dealersWithBalance.map((d, i) => (
            <View
              key={d.id}
              style={[
                styles.owedDivider,
                i === dealersWithBalance.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <DealerBalanceRow
                dealer={d}
                onOpenDealer={() => router.push(`/dealer/${d.id}`)}
                onPayCredit={() =>
                  setPaymentTarget({ dealer: d, account: "credit" })
                }
                onPayPersonal={() =>
                  setPaymentTarget({ dealer: d, account: "personal" })
                }
              />
            </View>
          ))
        )}
      </View>
    ),
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>TOOLBOX VAULT</Text>
          <Text style={styles.subtitle}>SUMMARY</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
          />
        }
      >
        {/* Next dealer route — kept prominent and highlighted */}
        {nextRouteBanner && (
          <TouchableOpacity
            testID="next-route-banner"
            style={styles.routeBanner}
            onPress={() => router.push("/dealers")}
            activeOpacity={0.85}
          >
            <View style={styles.routeIconWrap}>
              <Ionicons name="map" size={22} color="#000" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeBannerLabel}>NEXT DEALER ROUTE</Text>
              <Text style={styles.routeBannerText}>
                {nextRouteBanner.dealers.join(" & ")} · {nextRouteBanner.dateStr}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.accent} />
          </TouchableOpacity>
        )}

        {/* The customizable scrollable list */}
        <View style={styles.list}>
          {order.map((k) =>
            visible[k] ? (
              <View key={k}>{ROW_RENDERERS[k]?.()}</View>
            ) : null,
          )}
        </View>

        {/* Feedback link at the bottom of the first page */}
        <TouchableOpacity
          testID="feedback-banner"
          style={styles.feedbackRow}
          onPress={() => router.push("/feedback")}
          activeOpacity={0.85}
        >
          <Ionicons
            name="chatbubble-ellipses"
            size={18}
            color={theme.colors.accent}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.feedbackTitle}>
              REPORT A BUG · REQUEST A FEATURE
            </Text>
            <Text style={styles.feedbackSub}>
              Have an idea or hit a snag? Let us know.
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={theme.colors.textMuted}
          />
        </TouchableOpacity>

        <Text style={styles.tip}>
          Pull to refresh · Customize this list under MORE → DISPLAY
        </Text>
      </ScrollView>

      {paymentTarget && (
        <PaymentModal
          visible={!!paymentTarget}
          dealer={paymentTarget.dealer}
          account={paymentTarget.account}
          onClose={() => setPaymentTarget(null)}
          onSaved={() => {
            setPaymentTarget(null);
            load();
          }}
        />
      )}
    </SafeAreaView>
  );
}

/* ---------------- Reusable row components ---------------- */

function SummaryRow({
  icon,
  label,
  value,
  sub,
  onPress,
  rightSlot,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  onPress?: () => void;
  rightSlot?: ReactNode;
}) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.row} onPress={onPress} activeOpacity={0.65}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={theme.colors.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
      {rightSlot ? rightSlot : (onPress ? (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={theme.colors.textMuted}
          style={{ marginLeft: 8 }}
        />
      ) : null)}
    </Wrapper>
  );
}

function DealerBalanceRow({
  dealer,
  onOpenDealer,
  onPayCredit,
  onPayPersonal,
}: {
  dealer: any;
  onOpenDealer: () => void;
  onPayCredit: () => void;
  onPayPersonal: () => void;
}) {
  const credit = Number(dealer.credit_balance) || 0;
  const personal = Number(dealer.personal_balance) || 0;
  const total = credit + personal;
  return (
    <View style={styles.dealerRow}>
      <TouchableOpacity
        style={styles.dealerHeader}
        onPress={onOpenDealer}
        activeOpacity={0.7}
      >
        <View style={styles.dealerIcon}>
          <Ionicons name="business" size={18} color={theme.colors.accent} />
        </View>
        <Text style={styles.dealerName} numberOfLines={1}>
          {dealer.name} Accounts
        </Text>
        <Text style={styles.dealerTotal}>${total.toFixed(2)}</Text>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={theme.colors.textMuted}
          style={{ marginLeft: 4 }}
        />
      </TouchableOpacity>
      <View style={styles.dealerActionsRow}>
        <TouchableOpacity
          testID={`pay-credit-${dealer.id}`}
          style={[styles.dealerPill, credit <= 0 && { opacity: 0.5 }]}
          onPress={onPayCredit}
          disabled={credit <= 0}
          activeOpacity={0.8}
        >
          <Ionicons name="card" size={12} color={theme.colors.textPrimary} />
          <Text style={styles.dealerPillLabel} numberOfLines={1}>
            CREDIT PYMT
          </Text>
          <Text style={styles.dealerPillVal} numberOfLines={1}>
            ${credit.toFixed(2)}
          </Text>
          <View style={styles.dealerPillCta}>
            <Text style={styles.dealerPillCtaText}>PAY</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          testID={`pay-personal-${dealer.id}`}
          style={[styles.dealerPill, personal <= 0 && { opacity: 0.5 }]}
          onPress={onPayPersonal}
          disabled={personal <= 0}
          activeOpacity={0.8}
        >
          <Ionicons name="person" size={12} color={theme.colors.textPrimary} />
          <Text style={styles.dealerPillLabel} numberOfLines={1}>
            TRUCK PYMT
          </Text>
          <Text style={styles.dealerPillVal} numberOfLines={1}>
            ${personal.toFixed(2)}
          </Text>
          <View style={styles.dealerPillCta}>
            <Text style={styles.dealerPillCtaText}>PAY</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 8,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2.5,
    flexShrink: 1,
  },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 3,
  },

  /* Highlighted next-route banner */
  routeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: `${theme.colors.accent}15`,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderLeftWidth: 5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  routeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  routeBannerLabel: {
    color: theme.colors.accent,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  routeBannerText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },

  /* Main list — claim-screen style: separate cards w/ rounded corners + small gap */
  list: {
    gap: 8,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.colors.bgSecondary,
    borderRadius: 10,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rowLabel: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  rowSub: {
    color: theme.colors.textMuted,
    fontSize: 8,
    fontWeight: "600",
    marginTop: 3,
    letterSpacing: 0.3,
  },
  rowValue: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 8,
  },

  /* Dealer rows (two-line) — nested inside the OWED TO DEALERS card */
  emptyInline: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontStyle: "italic",
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlign: "center",
  },
  owedCluster: {
    backgroundColor: theme.colors.bgSecondary,
    borderRadius: 10,
    overflow: "hidden",
  },
  owedDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  dealerRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dealerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dealerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dealerName: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  dealerTotal: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "900",
  },
  dealerActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    marginLeft: 46,
  },
  dealerPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    backgroundColor: theme.colors.bg,
  },
  dealerPillLabel: {
    color: theme.colors.textPrimary,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  dealerPillVal: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 9,
    fontWeight: "900",
    textAlign: "right",
  },
  dealerPillCta: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginLeft: 4,
  },
  dealerPillCtaText: {
    color: "#000",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  /* Feedback */
  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgSecondary,
  },
  feedbackTitle: {
    color: theme.colors.textPrimary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  feedbackSub: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: "600",
    marginTop: 3,
  },
  tip: {
    color: theme.colors.textMuted,
    fontSize: 8,
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 14,
  },
});
