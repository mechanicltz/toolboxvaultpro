import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";

type Mode = "dealers" | "all-open";

export default function ClaimsScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("dealers");
  const [dealers, setDealers] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ totals: {}, dealers: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const [d, t, s] = await Promise.all([
        api.listDealers(),
        api.listTools({ needs_repair: true }),
        api.warrantyClaimsSummary().catch(() => ({ totals: {}, dealers: [] })),
      ]);
      setDealers(d || []);
      setTools(t || []);
      setSummary(s || { totals: {}, dealers: [] });
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

  // Group broken tools by dealer; "unassigned" if no dealer
  const repairedSet = new Set(
    tools
      .filter((t) => (t.repair_info?.repair_status || "").toLowerCase() === "repaired")
      .map((t) => t.id)
  );
  const openTools = tools.filter((t) => !repairedSet.has(t.id));
  const completedTools = tools.filter((t) => repairedSet.has(t.id));

  const groupByDealer = (arr: any[]) => {
    const map: Record<string, any[]> = {};
    arr.forEach((t) => {
      const k = t.dealer_id || "_unassigned";
      if (!map[k]) map[k] = [];
      map[k].push(t);
    });
    return map;
  };
  const openByDealer = groupByDealer(openTools);
  const completedByDealer = groupByDealer(completedTools);

  // Filter dealers by search
  const filteredDealers = search
    ? dealers.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
    : dealers;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>CLAIMS</Text>
        <Text style={styles.subtitle}>BROKEN ITEMS BY DEALER</Text>
      </View>

      <View style={styles.modeRow}>
        <TouchableOpacity
          testID="mode-dealers"
          style={[styles.modeChip, mode === "dealers" && styles.modeChipOn]}
          onPress={() => setMode("dealers")}
        >
          <Ionicons
            name="briefcase"
            size={14}
            color={mode === "dealers" ? "#000" : theme.colors.textSecondary}
          />
          <Text style={[styles.modeText, mode === "dealers" && styles.modeTextOn]}>
            BY DEALER
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="mode-all-open"
          style={[styles.modeChip, mode === "all-open" && styles.modeChipOn]}
          onPress={() => setMode("all-open")}
        >
          <Ionicons
            name="list"
            size={14}
            color={mode === "all-open" ? "#000" : theme.colors.textSecondary}
          />
          <Text style={[styles.modeText, mode === "all-open" && styles.modeTextOn]}>
            ALL OPEN ({openTools.length})
          </Text>
        </TouchableOpacity>
      </View>

      {mode === "dealers" && (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={theme.colors.textMuted} />
          <TextInput
            placeholder="Search dealers..."
            placeholderTextColor={theme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
      >
        {mode === "dealers" ? (
          <>
            {filteredDealers.length === 0 ? (
              <Text style={styles.empty}>No dealers yet.</Text>
            ) : (
              filteredDealers.map((d) => {
                const liveOpened = (openByDealer[d.id] || []).length;
                const summaryEntry = (summary?.dealers || []).find((x: any) => x.dealer_id === d.id);
                const opened = Math.max(liveOpened, summaryEntry?.open || 0);
                const done = summaryEntry?.completed || 0;
                return (
                  <TouchableOpacity
                    key={d.id}
                    testID={`claim-dealer-${d.id}`}
                    style={styles.dealerRow}
                    onPress={() =>
                      router.push(`/dealer-claims/${d.id}`)
                    }
                  >
                    <View style={styles.dealerThumb}>
                      <Ionicons name="briefcase" size={20} color={theme.colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dealerName}>{d.name}</Text>
                      <Text style={styles.dealerSub}>
                        {d.agents?.length || 0} agent{d.agents?.length === 1 ? "" : "s"}
                        {d.phone ? `  ·  ${d.phone}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <View style={styles.countRow}>
                        <View style={[styles.countPill, { backgroundColor: opened > 0 ? theme.colors.danger : theme.colors.bg }]}>
                          <Text style={[styles.countText, { color: opened > 0 ? "#fff" : theme.colors.textMuted }]}>
                            {opened} OPEN
                          </Text>
                        </View>
                      </View>
                      <View style={styles.countRow}>
                        <View style={[styles.countPill, { backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border }]}>
                          <Text style={[styles.countText, { color: theme.colors.success }]}>
                            {done} DONE
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                );
              })
            )}
            {(openByDealer["_unassigned"] || []).length > 0 && (
              <View style={[styles.dealerRow, { borderColor: theme.colors.danger, borderWidth: 1 }]}>
                <View style={styles.dealerThumb}>
                  <Ionicons name="alert-circle" size={20} color={theme.colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dealerName}>NO DEALER ASSIGNED</Text>
                  <Text style={styles.dealerSub}>
                    {(openByDealer["_unassigned"] || []).length} broken item{(openByDealer["_unassigned"] || []).length === 1 ? "" : "s"} need a dealer
                  </Text>
                </View>
              </View>
            )}
          </>
        ) : (
          // All open repairs grouped by dealer
          <>
            {openTools.length === 0 ? (
              <View style={{ alignItems: "center", padding: 40 }}>
                <Ionicons name="checkmark-circle" size={48} color={theme.colors.success} />
                <Text style={[styles.empty, { textAlign: "center", marginTop: 12 }]}>
                  Nothing broken right now. 🎉
                </Text>
              </View>
            ) : (
              dealers
                .map((d) => ({ d, items: openByDealer[d.id] || [] }))
                .concat(
                  (openByDealer["_unassigned"] || []).length > 0
                    ? [{ d: { id: "_unassigned", name: "NO DEALER" } as any, items: openByDealer["_unassigned"] || [] }]
                    : []
                )
                .filter((g) => g.items.length > 0)
                .map((group) => (
                  <View key={group.d.id} style={{ marginBottom: 16 }}>
                    <View style={styles.groupHeader}>
                      <Ionicons name="briefcase" size={14} color={theme.colors.accent} />
                      <Text style={styles.groupTitle}>{group.d.name}</Text>
                      <View style={styles.groupCount}>
                        <Text style={styles.groupCountText}>{group.items.length}</Text>
                      </View>
                    </View>
                    {group.items.map((t: any) => {
                      const status = (t.repair_info?.repair_status || "Not Reported").toUpperCase();
                      const statusColor =
                        status === "NOT REPORTED"
                          ? theme.colors.textMuted
                          : status === "REPORTED"
                          ? theme.colors.accent
                          : status === "REPAIRED"
                          ? theme.colors.success
                          : theme.colors.accentSecondary;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          testID={`open-tool-${t.id}`}
                          style={styles.itemRow}
                          onPress={() => router.push(`/tool/${t.id}`)}
                        >
                          <View style={styles.itemThumb}>
                            {t.photos?.[0] ? (
                              <Image source={{ uri: t.photos[0] }} style={styles.itemImg} />
                            ) : (
                              <Ionicons name="build" size={18} color={theme.colors.danger} />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemName} numberOfLines={1}>
                              {t.name}
                            </Text>
                            <View style={[styles.statusPill, { borderColor: statusColor }]}>
                              <Text style={[styles.statusText, { color: statusColor }]}>
                                {status}
                              </Text>
                            </View>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { color: theme.colors.textPrimary, fontSize: 22, fontWeight: "900", letterSpacing: 4 },
  subtitle: { color: theme.colors.accent, fontSize: 10, fontWeight: "700", letterSpacing: 2, marginTop: 4 },
  modeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.pill,
  },
  modeChipOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  modeText: {
    color: theme.colors.textSecondary,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 1.2,
  },
  modeTextOn: { color: "#000" },
  searchBox: {
    marginHorizontal: 16,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    gap: 8,
  },
  searchInput: { flex: 1, color: theme.colors.textPrimary, fontSize: 13 },
  empty: { color: theme.colors.textMuted, fontStyle: "italic", paddingVertical: 16 },
  dealerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.bgSecondary,
    padding: 12,
    borderRadius: 4,
    marginBottom: 8,
  },
  dealerThumb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  dealerName: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 14, letterSpacing: 0.5 },
  dealerSub: { color: theme.colors.textMuted, fontSize: 11, marginTop: 3 },
  countRow: { marginVertical: 2 },
  countPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  countText: { fontWeight: "900", fontSize: 9, letterSpacing: 0.5 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  groupTitle: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 12, letterSpacing: 1.5 },
  groupCount: {
    backgroundColor: theme.colors.danger,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: "auto",
  },
  groupCountText: { color: "#fff", fontWeight: "900", fontSize: 10 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.bgSecondary,
    padding: 10,
    borderRadius: 4,
    marginBottom: 6,
  },
  itemThumb: {
    width: 38,
    height: 38,
    backgroundColor: theme.colors.bg,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  itemImg: { width: "100%", height: "100%" },
  itemName: { color: theme.colors.textPrimary, fontWeight: "800", fontSize: 13 },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 3,
    marginTop: 4,
  },
  statusText: { fontWeight: "900", fontSize: 9, letterSpacing: 0.5 },
});
