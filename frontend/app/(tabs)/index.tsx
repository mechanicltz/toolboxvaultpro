import { useState, useCallback } from "react";
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

export default function HomeScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<any>({});
  const [agg, setAgg] = useState<any>({});
  const [tools, setTools] = useState<any[]>([]);
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [dealers, setDealers] = useState<any[]>([]);
  const [mnt, setMnt] = useState<any>({ overdue: 0, due_soon: 0, total: 0 });
  const [claims, setClaims] = useState<any>({ totals: { open: 0 } });
  const [refreshing, setRefreshing] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<{ dealer: any; account: "credit" | "personal" } | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, a, t, w, d, m, c] = await Promise.all([
        api.getStats().catch(() => ({})),
        api.aggregate({}).catch(() => ({})),
        api.listTools({}).catch(() => []),
        api.listWishlist().catch(() => []),
        api.listDealers().catch(() => []),
        api.upcomingMaintenance(30).catch(() => ({ overdue: 0, due_soon: 0, total: 0 })),
        api.warrantyClaimsSummary().catch(() => ({ totals: { open: 0 } })),
      ]);
      setStats(s);
      setAgg(a);
      setTools(t);
      setWishlist(w);
      setDealers(d);
      setMnt(m);
      setClaims(c);
    } catch {
      /* ignore */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const totalItems = tools.length;
  const checkedOut = tools.filter((x) => x.is_checked_out).length;
  const broken = tools.filter((x) => x.needs_repair).length;
  const lost = tools.filter((x) => x?.lost_status?.is_lost).length;
  const totalInvested = tools.reduce((sum, x) => sum + (Number(x.cost) || 0), 0);
  const wishlistCount = wishlist.filter((w) => !w.is_purchased).length;
  const wishlistTotal = wishlist
    .filter((w) => !w.is_purchased)
    .reduce((sum, x) => sum + (Number(x.price) || 0), 0);

  const dealersWithBalance = dealers
    .map((d) => ({
      ...d,
      total: (Number(d.credit_balance) || 0) + (Number(d.personal_balance) || 0),
    }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total);

  const totalOwed = dealers.reduce(
    (sum, d) => sum + (Number(d.credit_balance) || 0) + (Number(d.personal_balance) || 0),
    0
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>TOOLBOX</Text>
          <Text style={styles.subtitle}>SUMMARY  ·  {(() => {
            const d = new Date();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            return `${mm}/${dd}/${d.getFullYear()}`;
          })()}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
      >
        {/* Hero stats grid */}
        <View style={styles.gridRow}>
          <StatCard
            icon="cube"
            label="TOTAL ITEMS"
            value={String(totalItems)}
            color={theme.colors.accent}
            onPress={() => router.push("/inventory")}
          />
          <StatCard
            icon="cash"
            label="INVESTED"
            value={`$${totalInvested.toFixed(0)}`}
            color={theme.colors.success}
          />
        </View>

        <View style={styles.gridRow}>
          <StatCard
            icon="swap-horizontal"
            label="CHECKED OUT"
            value={String(checkedOut)}
            color={theme.colors.accentSecondary}
            onPress={() => router.push("/inventory?filter=out")}
          />
          <StatCard
            icon="build"
            label="BROKEN"
            value={String(broken)}
            color={theme.colors.danger}
            onPress={() => router.push("/claims")}
          />
        </View>

        <View style={styles.gridRow}>
          <StatCard
            icon="heart"
            label="WISH LIST"
            value={`${wishlistCount}  ·  $${wishlistTotal.toFixed(0)}`}
            color={theme.colors.accent}
            onPress={() => router.push("/wishlist")}
          />
          <StatCard
            icon="warning"
            label="LOST/STOLEN"
            value={String(lost)}
            color={theme.colors.danger}
            onPress={() => router.push("/inventory?filter=lost")}
          />
        </View>

        <View style={styles.gridRow}>
          <StatCard
            icon="settings"
            label="MAINTENANCE"
            value={String(mnt.overdue + mnt.due_soon)}
            color={mnt.overdue > 0 ? theme.colors.danger : theme.colors.accent}
            sub={mnt.overdue > 0 ? `${mnt.overdue} OVERDUE` : "DUE 30D"}
            onPress={() => router.push("/maintenance")}
          />
          <StatCard
            icon="document-text"
            label="OPEN CLAIMS"
            value={String(claims?.totals?.open || 0)}
            color={theme.colors.accent}
            onPress={() => router.push("/claims")}
          />
        </View>

        {/* Money owed to dealers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>OWED TO DEALERS</Text>
            <Text style={styles.sectionTotal}>${totalOwed.toFixed(2)}</Text>
          </View>
          {dealersWithBalance.length === 0 ? (
            <Text style={styles.empty}>No outstanding balances. 🎉</Text>
          ) : (
            dealersWithBalance.map((d) => (
              <View key={d.id} style={styles.dealerCard}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => router.push(`/dealer/${d.id}`)}
                >
                  <Text style={styles.dealerName}>{d.name}</Text>
                  <View style={styles.balLine}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.balLabel}>CREDIT</Text>
                      <Text
                        style={[
                          styles.balVal,
                          d.credit_balance > 0
                            ? { color: theme.colors.danger }
                            : { color: theme.colors.success },
                        ]}
                      >
                        ${(Number(d.credit_balance) || 0).toFixed(2)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.balLabel}>PERSONAL</Text>
                      <Text
                        style={[
                          styles.balVal,
                          d.personal_balance > 0
                            ? { color: theme.colors.danger }
                            : { color: theme.colors.success },
                        ]}
                      >
                        ${(Number(d.personal_balance) || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {d.credit_balance > 0 && (
                    <TouchableOpacity
                      testID={`pay-credit-${d.id}`}
                      style={styles.payBtn}
                      onPress={() => setPaymentTarget({ dealer: d, account: "credit" })}
                    >
                      <Text style={styles.payBtnText}>PAY CREDIT</Text>
                    </TouchableOpacity>
                  )}
                  {d.personal_balance > 0 && (
                    <TouchableOpacity
                      testID={`pay-personal-${d.id}`}
                      style={styles.payBtn}
                      onPress={() => setPaymentTarget({ dealer: d, account: "personal" })}
                    >
                      <Text style={styles.payBtnText}>PAY PERSONAL</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        <Text style={styles.tip}>
          Pull to refresh · Tap any card to drill in
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

function StatCard({
  icon,
  label,
  value,
  color,
  sub,
  onPress,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
  sub?: string;
  onPress?: () => void;
}) {
  const Comp: any = onPress ? TouchableOpacity : View;
  return (
    <Comp style={[styles.statCard, { borderLeftColor: color }]} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={[styles.statLabel, { color }]}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </Comp>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { color: theme.colors.textPrimary, fontSize: 22, fontWeight: "900", letterSpacing: 4 },
  subtitle: { color: theme.colors.accent, fontSize: 10, fontWeight: "700", letterSpacing: 2, marginTop: 4 },
  gridRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.bgSecondary,
    borderRadius: theme.radii.md,
    padding: 14,
    borderLeftWidth: 3,
    minHeight: 80,
  },
  statLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  statValue: { color: theme.colors.textPrimary, fontSize: 22, fontWeight: "900", marginTop: 6 },
  statSub: { color: theme.colors.textMuted, fontSize: 10, fontWeight: "700", marginTop: 3 },
  section: { marginTop: 14 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionLabel: { color: theme.colors.textPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  sectionTotal: { color: theme.colors.danger, fontSize: 16, fontWeight: "900" },
  empty: { color: theme.colors.textMuted, fontSize: 12, fontStyle: "italic", paddingVertical: 16 },
  dealerCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 12,
    borderRadius: theme.radii.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accent,
    marginBottom: 8,
  },
  dealerName: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  balLine: { flexDirection: "row", marginTop: 8, gap: 16 },
  balLabel: { color: theme.colors.textMuted, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  balVal: { fontSize: 14, fontWeight: "900", marginTop: 2 },
  payBtn: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 4,
    marginTop: 10,
  },
  payBtnText: { color: "#000", fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  tip: {
    color: theme.colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 18,
  },
});
