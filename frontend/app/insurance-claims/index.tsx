import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { themedStyles, useColors } from "../../src/themeContext";
import { SkinPlate } from "../../src/components/SkinPlate";
import { insuranceApi, ClaimSummary } from "../../src/insuranceApi";

const money = (n: number) =>
  "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_TINT: Record<string, "muted" | "accent" | "success" | "danger" | "warning"> = {
  Draft: "muted", Submitted: "accent", "Under Review": "accent",
  "More Information Needed": "warning", Approved: "success", "Partially Approved": "warning",
  Denied: "danger", Paid: "success", Closed: "muted", Reopened: "accent",
};

export default function InsuranceClaimsDashboard() {
  const router = useRouter();
  const c = useColors();
  const [summary, setSummary] = useState<ClaimSummary | null>(null);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [archived, setArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([
        insuranceApi.summary(),
        insuranceApi.list({ q, status: statusFilter, archived }),
      ]);
      setSummary(s);
      setClaims(list);
    } catch (e) {
      // soft fail — keep prior data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [q, statusFilter, archived]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tint = (key: string) => {
    const t = STATUS_TINT[key] || "muted";
    return t === "muted" ? c.textSecondary : t === "accent" ? c.accent
      : t === "success" ? c.success : t === "danger" ? c.danger : c.warning;
  };

  const cards = summary ? [
    { label: "Total Claims", value: String(summary.total_claims), color: c.textPrimary },
    { label: "Open Claims", value: String(summary.open_claims), color: c.accent },
    { label: "Closed Claims", value: String(summary.closed_claims), color: c.textMuted },
    { label: "Total Claimed", value: money(summary.total_claimed_value), color: c.textPrimary },
    { label: "Total Approved", value: money(summary.total_approved_value), color: c.success },
    { label: "Total Paid", value: money(summary.total_paid_value), color: c.success },
  ] : [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="ic-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Insurance Claims</Text>
        <TouchableOpacity testID="ic-new" onPress={() => router.push("/insurance-claims/new" as any)} style={styles.iconBtn}>
          <Ionicons name="add" size={26} color={c.accent} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.accent} />}
        >
          {/* Summary — single skinned panel, one stat per row */}
          {cards.length > 0 && (
            <SkinPlate style={{ marginBottom: 14 }} frame="window" padX={18} padTop={8} padBottom={8} testID="ic-summary-panel">
              {cards.map((card, i) => (
                <View key={card.label} style={[styles.statRow, i === cards.length - 1 && { borderBottomWidth: 0 }]} testID={`ic-stat-${card.label}`}>
                  <Text style={styles.statRowLabel}>{card.label.toUpperCase()}</Text>
                  <Text style={[styles.statRowValue, { color: card.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{card.value}</Text>
                </View>
              ))}
            </SkinPlate>
          )}

          {/* Search */}
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={c.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              testID="ic-search"
              value={q}
              onChangeText={setQ}
              onSubmitEditing={load}
              placeholder="Search by title, #, company, agent…"
              placeholderTextColor={c.textMuted}
              style={styles.searchInput}
              returnKeyType="search"
            />
            {q ? (
              <TouchableOpacity onPress={() => { setQ(""); setTimeout(load, 0); }}>
                <Ionicons name="close-circle" size={18} color={c.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={{ gap: 8 }}>
            {["", "Draft", "Submitted", "Under Review", "Approved", "Paid", "Denied", "Closed"].map((s) => (
              <TouchableOpacity
                key={s || "all"}
                testID={`ic-filter-${s || "all"}`}
                onPress={() => { setStatusFilter(s); setTimeout(load, 0); }}
                style={[styles.chip, statusFilter === s && { backgroundColor: c.accent, borderColor: c.accent }]}
              >
                <Text style={[styles.chipText, statusFilter === s && { color: c.textOnAccent }]}>{s || "All"}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              testID="ic-filter-archived"
              onPress={() => { setArchived((a) => !a); setTimeout(load, 0); }}
              style={[styles.chip, archived && { backgroundColor: c.textMuted, borderColor: c.textMuted }]}
            >
              <Text style={[styles.chipText, archived && { color: c.textOnAccent }]}>Archived</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Claims list */}
          {loading ? (
            <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
          ) : claims.length === 0 ? (
            <SkinPlate style={{ marginTop: 12 }} padX={20} padTop={28} padBottom={28} frame="window">
              <View style={{ alignItems: "center" }}>
                <Ionicons name="shield-checkmark-outline" size={40} color={c.textMuted} />
                <Text style={styles.emptyTitle}>No claims yet</Text>
                <Text style={styles.emptySub}>Document a loss and generate a professional insurance report.</Text>
                <TouchableOpacity testID="ic-empty-new" onPress={() => router.push("/insurance-claims/new" as any)} style={styles.primaryBtn}>
                  <Ionicons name="add" size={18} color={c.textOnAccent} />
                  <Text style={styles.primaryBtnText}>Create New Claim</Text>
                </TouchableOpacity>
              </View>
            </SkinPlate>
          ) : (
            <SkinPlate style={{ marginTop: 12 }} frame="window" padX={16} padTop={8} padBottom={8} testID="ic-claims-list">
              {claims.map((claim, i) => (
                <TouchableOpacity
                  key={claim.id}
                  testID={`ic-claim-${claim.id}`}
                  onPress={() => router.push(`/insurance-claims/${claim.id}` as any)}
                  activeOpacity={0.7}
                  style={[styles.claimRow, i === claims.length - 1 && styles.claimRowLast]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.claimTitle} numberOfLines={1}>{claim.title}</Text>
                    <Text style={styles.claimMeta} numberOfLines={1}>
                      {claim.claim_type}{claim.claim_number ? ` · #${claim.claim_number}` : ""}
                      {(claim.insurance?.company) ? ` · ${claim.insurance.company}` : ""}
                    </Text>
                    <Text style={styles.claimMeta} numberOfLines={1}>
                      {claim._item_count || 0} item(s) · {money(claim._total_claimed || 0)} claimed
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
                    <View style={[styles.badge, { backgroundColor: tint(claim.status) + "22", borderColor: tint(claim.status) }]}>
                      <Text style={[styles.badgeText, { color: tint(claim.status) }]}>{claim.status}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={c.textMuted} style={{ marginTop: 6 }} />
                  </View>
                </TouchableOpacity>
              ))}
            </SkinPlate>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.borderSubtle,
  },
  iconBtn: { padding: 8, minWidth: 40, alignItems: "center" },
  headerTitle: { color: c.textPrimary, fontSize: 18, fontWeight: "800", letterSpacing: 0.3 },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 0 },
  statRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.borderSubtle,
  },
  statRowLabel: { fontSize: 11, fontWeight: "800", color: c.textSecondary, letterSpacing: 0.4 },
  statRowValue: { fontSize: 16, fontWeight: "900", color: c.textPrimary, marginLeft: 12 },
  searchRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12,
    height: 44, marginTop: 4, marginBottom: 10,
  },
  searchInput: { flex: 1, color: c.textPrimary, fontSize: 15 },
  chipsRow: { marginBottom: 6 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1,
    borderColor: c.border, backgroundColor: c.surface,
  },
  chipText: { color: c.textSecondary, fontSize: 12, fontWeight: "700" },
  claimRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle,
  },
  claimRowLast: { borderBottomWidth: 0 },
  claimTitle: { color: c.textPrimary, fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
  claimMeta: { color: c.textMuted, fontSize: 11, fontWeight: "600", marginTop: 2 },
  badge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0.3 },
  emptyTitle: { color: c.textPrimary, fontSize: 18, fontWeight: "800", marginTop: 12 },
  emptySub: { color: c.textMuted, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 18 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.accent,
    paddingHorizontal: 18, paddingVertical: 11, borderRadius: 24, marginTop: 16,
  },
  primaryBtnText: { color: c.textOnAccent, fontWeight: "800", fontSize: 14 },
}));
