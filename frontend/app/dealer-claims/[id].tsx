import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";

type Tab = "open" | "completed";

export default function DealerClaimsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [dealer, setDealer] = useState<any>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("open");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [d, allTools] = await Promise.all([
        api.getDealer(id),
        api.listTools({ dealer_id: id }),
      ]);
      setDealer(d);
      // Only keep broken tools
      setTools((allTools || []).filter((t: any) => t.needs_repair));
    } catch {
      /* ignore */
    }
  }, [id]);

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

  const isRepaired = (t: any) =>
    (t.repair_info?.repair_status || "").toLowerCase() === "repaired";

  const open = tools.filter((t) => !isRepaired(t));
  const completed = tools.filter((t) => isRepaired(t));
  const visible = tab === "open" ? open : completed;

  const notify = async (t: any, mode: "email" | "sms") => {
    try {
      const agent = dealer?.agents?.find((a: any) => a.id === dealer?.current_agent_id);
      const phone = (agent?.phone || dealer?.phone || "").replace(/[^\d+]/g, "");
      const email = (agent?.email || "").trim();
      const subject = encodeURIComponent(`Repair request: ${t.name}`);
      const body = encodeURIComponent(
        [
          `Hello${agent?.name ? ` ${agent.name}` : ""},`,
          ``,
          `I have a tool that needs repair / warranty service:`,
          ``,
          `Tool: ${t.name}`,
          t.purchase_date ? `Purchased: ${t.purchase_date}` : "",
          dealer?.name ? `Dealer: ${dealer.name}` : "",
          t.repair_info?.notes ? `Issue: ${t.repair_info.notes}` : "",
          ``,
          `Please advise next steps. Thank you.`,
        ].filter(Boolean).join("\n")
      );
      let url = "";
      if (mode === "email") {
        if (!email) { Alert.alert("No email", "Set an email on the agent or dealer first."); return; }
        url = `mailto:${email}?subject=${subject}&body=${body}`;
      } else {
        if (!phone) { Alert.alert("No phone", "Set a phone on the agent or dealer first."); return; }
        url = `sms:${phone}?body=${body}`;
      }
      if (Platform.OS === "web") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).window.location.href = url;
      } else {
        await Linking.openURL(url);
      }
      // Auto mark Reported
      const cur = t.repair_info?.repair_status || "Not Reported";
      if (cur === "Not Reported") {
        await api.updateTool(t.id, {
          repair_info: {
            ...(t.repair_info || {}),
            company_notified: dealer?.name || "",
            contact: agent?.name || "",
            notified_at: new Date().toISOString().substring(0, 10),
            repair_status: "Reported",
          },
        });
        load();
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  if (!dealer) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.empty}>
          <Text style={{ color: theme.colors.textMuted }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{dealer.name}</Text>
          <Text style={styles.subtitle}>CLAIMS / REPAIRS</Text>
        </View>
        <TouchableOpacity
          testID="open-dealer-detail"
          onPress={() => router.push(`/dealer/${dealer.id}`)}
          hitSlop={10}
          style={styles.dealerBtn}
        >
          <Ionicons name="briefcase" size={16} color={theme.colors.accent} />
          <Text style={styles.dealerBtnText}>DEALER</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          testID="tab-open"
          style={[styles.tabChip, tab === "open" && styles.tabChipOn]}
          onPress={() => setTab("open")}
        >
          <Text style={[styles.tabText, tab === "open" && styles.tabTextOn]}>
            OPEN ({open.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="tab-completed"
          style={[styles.tabChip, tab === "completed" && styles.tabChipOn]}
          onPress={() => setTab("completed")}
        >
          <Text style={[styles.tabText, tab === "completed" && styles.tabTextOn]}>
            COMPLETED ({completed.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
      >
        {visible.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name={tab === "open" ? "checkmark-circle" : "archive"}
              size={48}
              color={tab === "open" ? theme.colors.success : theme.colors.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {tab === "open" ? "No open repairs" : "No completed repairs"}
            </Text>
            <Text style={styles.emptyText}>
              {tab === "open"
                ? `Nothing broken at ${dealer.name} right now.`
                : "When tools are marked Repaired, they show up here."}
            </Text>
          </View>
        ) : (
          visible.map((t) => {
            const status = (t.repair_info?.repair_status || "Not Reported").toUpperCase();
            const statusColor =
              status === "NOT REPORTED"
                ? theme.colors.textMuted
                : status === "REPORTED"
                ? theme.colors.accent
                : status === "REPAIRED"
                ? theme.colors.success
                : theme.colors.accentSecondary;
            const photo = t.repair_info?.broken_photo || t.photos?.[0];
            return (
              <View key={t.id} style={styles.card}>
                <TouchableOpacity
                  testID={`open-claim-${t.id}`}
                  style={styles.cardHead}
                  onPress={() => router.push(`/tool/${t.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.thumb}>
                    {photo ? (
                      <Image source={{ uri: photo }} style={styles.thumbImg} />
                    ) : (
                      <Ionicons name="build" size={24} color={theme.colors.danger} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {t.name}
                    </Text>
                    {!!t.repair_info?.contact && (
                      <Text style={styles.itemMeta}>Contact: {t.repair_info.contact}</Text>
                    )}
                    {!!t.repair_info?.notified_at && (
                      <Text style={styles.itemMeta}>Notified: {t.repair_info.notified_at}</Text>
                    )}
                    {!!t.repair_info?.expected_completion && (
                      <Text style={styles.itemMeta}>
                        Expected back: {t.repair_info.expected_completion}
                      </Text>
                    )}
                    <View style={[styles.statusPill, { borderColor: statusColor }]}>
                      <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
                {!!t.repair_info?.notes && (
                  <Text style={styles.notes}>{t.repair_info.notes}</Text>
                )}
                {tab === "open" && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      testID={`email-${t.id}`}
                      style={styles.actionBtn}
                      onPress={() => notify(t, "email")}
                    >
                      <Ionicons name="mail" size={14} color="#fff" />
                      <Text style={styles.actionText}>EMAIL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`text-${t.id}`}
                      style={styles.actionBtn}
                      onPress={() => notify(t, "sms")}
                    >
                      <Ionicons name="chatbubble" size={14} color="#fff" />
                      <Text style={styles.actionText}>TEXT</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`detail-${t.id}`}
                      style={[styles.actionBtn, { backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border }]}
                      onPress={() => router.push(`/tool/${t.id}`)}
                    >
                      <Ionicons name="open" size={14} color={theme.colors.accent} />
                      <Text style={[styles.actionText, { color: theme.colors.accent }]}>OPEN</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 8,
  },
  backBtn: { padding: 8 },
  title: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: "900", letterSpacing: 1 },
  subtitle: { color: theme.colors.accent, fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 },
  dealerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
  },
  dealerBtnText: { color: theme.colors.accent, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tabChip: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
  },
  tabChipOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  tabText: { color: theme.colors.textSecondary, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  tabTextOn: { color: "#000" },
  emptyState: { alignItems: "center", padding: 40, gap: 12 },
  emptyTitle: { color: theme.colors.textPrimary, fontWeight: "900", letterSpacing: 1.5, fontSize: 14 },
  emptyText: { color: theme.colors.textMuted, fontSize: 12, textAlign: "center", lineHeight: 18 },
  card: {
    backgroundColor: theme.colors.bgSecondary,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.danger,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: {
    width: 56,
    height: 56,
    backgroundColor: theme.colors.bg,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  itemName: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 15, letterSpacing: 0.3 },
  itemMeta: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 3,
    marginTop: 5,
  },
  statusText: { fontWeight: "900", fontSize: 10, letterSpacing: 0.5 },
  notes: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.border,
  },
  actionRow: { flexDirection: "row", gap: 6, marginTop: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    backgroundColor: theme.colors.danger,
    borderRadius: 4,
  },
  actionText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 1 },
});
