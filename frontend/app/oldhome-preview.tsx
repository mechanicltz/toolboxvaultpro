// TEMPORARY PREVIEW — renders the original PRE-SKIN dashboard (git commit
// a154fdf4, ~05-07) with mock data so it can be screenshotted without login.
// Safe to delete; not linked anywhere in the app.
import { ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../src/theme";

const MOCK_DEALERS = [
  { id: "1", name: "Matco", personal_balance: 3215, credit_balance: 0 },
  { id: "2", name: "Cornwell Tools", personal_balance: 0, credit_balance: 0 },
  { id: "3", name: "Harbor Freight", personal_balance: 0, credit_balance: 0 },
  { id: "4", name: "Mac Tools", personal_balance: 0, credit_balance: 0 },
  { id: "5", name: "Matco Tools", personal_balance: 0, credit_balance: 0 },
  { id: "6", name: "Snap-on Tools", personal_balance: 0, credit_balance: 0 },
];
const totalOwed = 3215;

export default function OldHomePreview() {
  const ROWS: { node: ReactNode; key: string }[] = [
    {
      key: "owed",
      node: (
        <View style={styles.owedCluster}>
          <SummaryRow icon="wallet" label="DEALER ACCOUNTS" value={`$${totalOwed.toFixed(2)}`} onPress={() => {}} />
          {MOCK_DEALERS.map((d, i) => (
            <View key={d.id} style={[styles.owedDivider, i === MOCK_DEALERS.length - 1 && { borderBottomWidth: 0 }]}>
              <DealerBalanceRow dealer={d} />
            </View>
          ))}
        </View>
      ),
    },
    { key: "total_items", node: <SummaryRow icon="cube" label="TOTAL ITEMS" value="2" onPress={() => {}} /> },
    { key: "invested", node: <SummaryRow icon="cash" label="NET WORTH" value="$3010.00" valueColor={theme.colors.success} /> },
    { key: "checked_out", node: <SummaryRow icon="swap-horizontal" label="CHECKED OUT" value="0" onPress={() => {}} /> },
    { key: "open_claims", node: <SummaryRow icon="document-text" label="OPEN CLAIMS" value="2" valueColor={theme.colors.danger} onPress={() => {}} /> },
    { key: "maintenance", node: <SummaryRow icon="settings" label="MAINTENANCE DUE" value="0" sub="DUE 30D" onPress={() => {}} /> },
    { key: "selling", node: <SummaryRow icon="pricetag" label="SELLING" value="0" onPress={() => {}} /> },
    { key: "wishlist", node: <SummaryRow icon="heart" label="WISH LIST" value="2" onPress={() => {}} /> },
    { key: "lost", node: <SummaryRow icon="warning" label="LOST / STOLEN" value="0" onPress={() => {}} /> },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>TOOLBOX VAULT</Text>
          <Text style={styles.subtitle}>SUMMARY</Text>
          <Text style={styles.versionLine}>v2.1.1</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <TouchableOpacity style={styles.routeBanner} activeOpacity={0.85}>
          <View style={styles.routeIconWrap}>
            <Ionicons name="map" size={22} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.routeBannerLabel}>NEXT DEALER ROUTE</Text>
            <Text style={styles.routeBannerText}>Matco · Thursday 06/04/2026</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.accent} />
        </TouchableOpacity>

        <View style={styles.list}>
          {ROWS.map((r) => (
            <View key={r.key}>{r.node}</View>
          ))}
        </View>

        <TouchableOpacity style={styles.feedbackRow} activeOpacity={0.85}>
          <Ionicons name="chatbubble-ellipses" size={18} color={theme.colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.feedbackTitle}>REPORT A BUG · REQUEST A FEATURE</Text>
            <Text style={styles.feedbackSub}>Have an idea or hit a snag? Let us know.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>

        <Text style={styles.tip}>Pull to refresh · Customize this list under MORE → DISPLAY</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({
  icon, label, value, sub, onPress, valueColor,
}: { icon: any; label: string; value: string; sub?: string; onPress?: () => void; valueColor?: string }) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.row} onPress={onPress} activeOpacity={0.65}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={theme.colors.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <View style={[styles.rowValuePill, valueColor ? { borderColor: valueColor } : null]}>
        <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>{value}</Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} style={{ marginLeft: 8 }} /> : null}
    </Wrapper>
  );
}

function DealerBalanceRow({ dealer }: { dealer: any }) {
  const total = (Number(dealer.credit_balance) || 0) + (Number(dealer.personal_balance) || 0);
  return (
    <View style={styles.dealerRow}>
      <Text style={styles.dealerName} numberOfLines={1}>{dealer.name}</Text>
      <TouchableOpacity style={styles.dealerBalancePill} activeOpacity={0.8}>
        <Text style={[styles.dealerBalancePillText, total === 0 && { color: theme.colors.textMuted }]}>${total.toFixed(2)}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.dealerAdjustPill} activeOpacity={0.85}>
        <Text style={styles.dealerAdjustText}>Adjust</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 8,
  },
  title: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 2.5, flexShrink: 1 },
  subtitle: { color: theme.colors.accent, fontSize: 8, fontWeight: "700", letterSpacing: 1.5, marginTop: 3 },
  versionLine: { color: theme.colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginTop: 4 },
  routeBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: `${theme.colors.accent}15`, borderWidth: 1, borderColor: theme.colors.accent,
    borderLeftWidth: 5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
  },
  routeIconWrap: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.bg,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.accent,
  },
  routeBannerLabel: { color: theme.colors.accent, fontSize: 7, fontWeight: "900", letterSpacing: 1.4 },
  routeBannerText: { color: theme.colors.textPrimary, fontSize: 11, fontWeight: "800", marginTop: 2 },
  list: { gap: 8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: theme.colors.bgSecondary, borderRadius: 10,
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.bg,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border,
  },
  rowLabel: { color: theme.colors.textPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  rowSub: { color: theme.colors.textMuted, fontSize: 8, fontWeight: "600", marginTop: 3, letterSpacing: 0.3 },
  rowValuePill: {
    paddingHorizontal: 10, paddingVertical: 4, backgroundColor: theme.colors.bg, borderRadius: 999,
    borderWidth: 1, borderColor: theme.colors.border, minWidth: 76, alignItems: "center", marginLeft: 8,
  },
  rowValue: { color: theme.colors.textPrimary, fontSize: 10, fontWeight: "900" },
  owedCluster: { backgroundColor: theme.colors.bgSecondary, borderRadius: 10, overflow: "hidden" },
  owedDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  dealerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  dealerName: { flex: 1, color: theme.colors.textPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  dealerBalancePill: {
    paddingHorizontal: 10, paddingVertical: 4, backgroundColor: theme.colors.bg, borderRadius: 999,
    borderWidth: 1, borderColor: theme.colors.border, minWidth: 76, alignItems: "center",
  },
  dealerBalancePillText: { color: theme.colors.textPrimary, fontSize: 10, fontWeight: "900" },
  dealerAdjustPill: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: theme.colors.accent, borderRadius: 999 },
  dealerAdjustText: { color: "#000", fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  feedbackRow: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12,
    marginTop: 16, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.bgSecondary,
  },
  feedbackTitle: { color: theme.colors.textPrimary, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  feedbackSub: { color: theme.colors.textMuted, fontSize: 9, fontWeight: "600", marginTop: 3 },
  tip: { color: theme.colors.textMuted, fontSize: 8, textAlign: "center", fontStyle: "italic", marginTop: 14 },
});
