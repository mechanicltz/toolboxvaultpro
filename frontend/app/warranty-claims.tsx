import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { confirm } from "../src/confirm";

const STATUS_LIST = [
  { key: "broken", label: "Broken", color: theme.colors.danger, icon: "alert-circle" as const },
  { key: "awaiting_approval", label: "Awaiting Approval", color: theme.colors.warning, icon: "time" as const },
  { key: "waiting_replacement", label: "Waiting on Replacement", color: theme.colors.accentSecondary, icon: "cube" as const },
  { key: "completed", label: "Completed", color: theme.colors.success, icon: "checkmark-circle" as const },
  { key: "rejected", label: "Rejected", color: theme.colors.textMuted, icon: "close-circle" as const },
];

const statusMeta = (k: string) => STATUS_LIST.find((s) => s.key === k) || STATUS_LIST[0];

export default function WarrantyClaimsScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedDealer, setExpandedDealer] = useState<string | null>(null);
  const [showCompletedFor, setShowCompletedFor] = useState<Record<string, boolean>>({});
  const [claimsByDealer, setClaimsByDealer] = useState<Record<string, any[]>>({});
  const [pickerForClaim, setPickerForClaim] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.warrantyClaimsSummary();
      setSummary(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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
    if (expandedDealer) await loadDealerClaims(expandedDealer, !!showCompletedFor[expandedDealer]);
    setRefreshing(false);
  };

  const dealerKey = (d: any) => d.dealer_id || "_none_";

  const loadDealerClaims = async (key: string, includeCompleted: boolean) => {
    try {
      const params: any = { dealer_id: key };
      if (!includeCompleted) params.archived = false;
      const items = await api.listWarrantyClaims(params);
      setClaimsByDealer((cur) => ({ ...cur, [key]: items }));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleDealer = async (key: string) => {
    if (expandedDealer === key) {
      setExpandedDealer(null);
      return;
    }
    setExpandedDealer(key);
    if (!claimsByDealer[key]) {
      await loadDealerClaims(key, !!showCompletedFor[key]);
    }
  };

  const toggleCompleted = async (key: string) => {
    const next = !showCompletedFor[key];
    setShowCompletedFor((cur) => ({ ...cur, [key]: next }));
    await loadDealerClaims(key, next);
  };

  const setStatus = async (claim: any, status: string) => {
    try {
      await api.updateWarrantyClaim(claim.id, { claim_status: status });
      setPickerForClaim(null);
      await Promise.all([
        load(),
        expandedDealer
          ? loadDealerClaims(expandedDealer, !!showCompletedFor[expandedDealer])
          : Promise.resolve(),
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not update claim");
    }
  };

  const removeClaim = async (claim: any) => {
    if (!(await confirm("Delete claim?", "This permanently removes the claim record.", "Delete", true))) return;
    try {
      await api.deleteWarrantyClaim(claim.id);
      const key = claim.dealer_id || "_none_";
      await Promise.all([load(), loadDealerClaims(key, !!showCompletedFor[key])]);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Delete failed");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const totals = summary?.totals || {};
  const dealers = summary?.dealers || [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity testID="claims-back" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.title}>WARRANTY CLAIMS</Text>
          <Text style={styles.subtitle}>By dealer · with status pipeline</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
      >
        <View style={styles.statRow}>
          <Stat label="Total" value={totals.total ?? 0} />
          <Stat label="Open" value={totals.open ?? 0} color={theme.colors.danger} />
          <Stat label="Replacement" value={totals.waiting_replacement ?? 0} color={theme.colors.accentSecondary} />
          <Stat label="Completed" value={totals.completed ?? 0} color={theme.colors.success} />
        </View>

        {dealers.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="construct-outline" size={64} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>NO CLAIMS YET</Text>
            <Text style={styles.emptyText}>
              Mark a tool as broken from its detail screen to open a warranty claim.
            </Text>
          </View>
        ) : (
          dealers.map((d: any) => {
            const key = dealerKey(d);
            const isOpen = expandedDealer === key;
            const claims = claimsByDealer[key] || [];
            const showDone = !!showCompletedFor[key];
            return (
              <View key={key} style={styles.dealerBlock}>
                <TouchableOpacity
                  testID={`dealer-row-${key}`}
                  style={styles.dealerHead}
                  onPress={() => toggleDealer(key)}
                  activeOpacity={0.7}
                >
                  <View style={styles.dealerIcon}>
                    <Ionicons name="briefcase" size={22} color={theme.colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dealerName}>{d.dealer_name}</Text>
                    <View style={styles.countsRow}>
                      <CountPill label="OPEN" value={d.open} color={theme.colors.danger} />
                      <CountPill label="DONE" value={d.completed} color={theme.colors.success} />
                      {d.rejected > 0 && (
                        <CountPill label="REJ" value={d.rejected} color={theme.colors.textMuted} />
                      )}
                    </View>
                  </View>
                  <Ionicons
                    name={isOpen ? "chevron-down" : "chevron-forward"}
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.dealerBody}>
                    <TouchableOpacity
                      testID={`toggle-completed-${key}`}
                      style={styles.completedToggle}
                      onPress={() => toggleCompleted(key)}
                    >
                      <Ionicons
                        name={showDone ? "eye" : "eye-off"}
                        size={16}
                        color={theme.colors.accent}
                      />
                      <Text style={styles.completedToggleText}>
                        {showDone ? "HIDE COMPLETED" : "SHOW COMPLETED"}
                      </Text>
                    </TouchableOpacity>

                    {claims.length === 0 ? (
                      <Text style={styles.muted}>
                        {showDone ? "No completed claims yet." : "No active claims."}
                      </Text>
                    ) : (
                      claims.map((c: any) => {
                        const meta = statusMeta(c.claim_status);
                        return (
                          <View key={c.id} style={styles.claimCard} testID={`claim-${c.id}`}>
                            <TouchableOpacity
                              style={styles.claimHead}
                              onPress={() => router.push(`/tool/${c.tool_id}`)}
                              activeOpacity={0.7}
                            >
                              {c.tool_photo ? (
                                <Image source={{ uri: c.tool_photo }} style={styles.thumb} />
                              ) : (
                                <View style={[styles.thumb, styles.thumbPh]}>
                                  <Ionicons name="construct" size={20} color={theme.colors.accent} />
                                </View>
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={styles.claimTitle} numberOfLines={1}>
                                  {c.tool_name}
                                </Text>
                                {!!c.repair_company && (
                                  <Text style={styles.claimMeta} numberOfLines={1}>
                                    {c.repair_company}
                                  </Text>
                                )}
                                {!!c.notified_at && (
                                  <Text style={styles.claimDate}>
                                    Notified {c.notified_at}
                                    {c.expected_completion ? ` · Back ${c.expected_completion}` : ""}
                                  </Text>
                                )}
                              </View>
                              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                            </TouchableOpacity>
                            <View style={styles.claimFoot}>
                              <TouchableOpacity
                                testID={`claim-status-${c.id}`}
                                style={[styles.statusPill, { borderColor: meta.color }]}
                                onPress={() => setPickerForClaim(c)}
                              >
                                <Ionicons name={meta.icon} size={14} color={meta.color} />
                                <Text style={[styles.statusPillText, { color: meta.color }]}>
                                  {meta.label.toUpperCase()}
                                </Text>
                                <Ionicons name="chevron-down" size={12} color={meta.color} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                testID={`claim-delete-${c.id}`}
                                onPress={() => removeClaim(c)}
                                hitSlop={8}
                                style={{ padding: 6 }}
                              >
                                <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!pickerForClaim} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>SET STATUS</Text>
            <Text style={styles.modalSub} numberOfLines={1}>
              {pickerForClaim?.tool_name}
            </Text>
            {STATUS_LIST.map((s) => {
              const active = pickerForClaim?.claim_status === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  testID={`pick-status-${s.key}`}
                  style={[
                    styles.pickRow,
                    active && { backgroundColor: "rgba(255,179,0,0.1)", borderColor: s.color },
                  ]}
                  onPress={() => pickerForClaim && setStatus(pickerForClaim, s.key)}
                >
                  <Ionicons name={s.icon} size={20} color={s.color} />
                  <Text style={[styles.pickText, { color: "#fff" }]}>{s.label}</Text>
                  {active && <Ionicons name="checkmark" size={20} color={theme.colors.accent} />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.btnGhost}
              onPress={() => setPickerForClaim(null)}
            >
              <Text style={styles.btnGhostText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CountPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.pillValue, { color }]}>{value}</Text>
      <Text style={[styles.pillLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: 2 },
  subtitle: { color: theme.colors.accent, fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 },
  statRow: { flexDirection: "row", padding: 16, gap: 8 },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 4,
  },
  statValue: { color: "#fff", fontSize: 22, fontWeight: "900" },
  statLabel: { color: theme.colors.textMuted, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 4 },
  empty: { alignItems: "center", marginTop: 60, paddingHorizontal: 40 },
  emptyTitle: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 2, marginTop: 16 },
  emptyText: { color: theme.colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: 8 },
  dealerBlock: { borderBottomColor: theme.colors.border, borderBottomWidth: 1 },
  dealerHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  dealerIcon: {
    width: 40, height: 40,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
    borderRadius: 4,
  },
  dealerName: { color: "#fff", fontWeight: "800", fontSize: 15 },
  countsRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  pill: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 3,
  },
  pillValue: { fontWeight: "900", fontSize: 13 },
  pillLabel: { fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  dealerBody: { paddingHorizontal: 20, paddingBottom: 14, gap: 10 },
  completedToggle: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 3,
  },
  completedToggleText: { color: theme.colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  muted: { color: theme.colors.textMuted, fontStyle: "italic", fontSize: 13, paddingVertical: 6 },
  claimCard: {
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: 4,
    padding: 10,
    gap: 8,
  },
  claimHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  thumb: { width: 44, height: 44, borderRadius: 4, borderWidth: 1, borderColor: theme.colors.border },
  thumbPh: { backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" },
  claimTitle: { color: "#fff", fontWeight: "700", fontSize: 14 },
  claimMeta: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 2 },
  claimDate: { color: theme.colors.textMuted, fontSize: 10, marginTop: 2 },
  claimFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderRadius: 3,
  },
  statusPillText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 20,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
  },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: 2 },
  modalSub: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 4, marginBottom: 12 },
  pickRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 4, marginBottom: 6,
  },
  pickText: { flex: 1, fontSize: 14, fontWeight: "600" },
  btnGhost: {
    borderWidth: 1, borderColor: theme.colors.border, height: 48, marginTop: 8,
    alignItems: "center", justifyContent: "center", borderRadius: 4,
  },
  btnGhostText: { color: "#fff", fontWeight: "800", letterSpacing: 2, fontSize: 14 },
});
