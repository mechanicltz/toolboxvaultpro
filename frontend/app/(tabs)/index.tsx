import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  RefreshControl,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { usePrefs } from "../../src/prefs";
import { SummaryHeader } from "../../src/SummaryHeader";

type Filter = "all" | "available" | "out" | "consumables";

export default function InventoryScreen() {
  const router = useRouter();
  const { prefs } = usePrefs();
  const [tools, setTools] = useState<any[]>([]);
  const [agg, setAgg] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [warningCount, setWarningCount] = useState(0);
  const [openClaims, setOpenClaims] = useState(0);

  const load = useCallback(async () => {
    const params: any = { search: search || undefined };
    if (filter === "available") params.checked_out = false;
    if (filter === "out") params.checked_out = true;
    if (filter === "consumables") params.is_consumable = true;
    try {
      const [t, a, w, cs] = await Promise.all([
        api.listTools(params),
        api.aggregate(params),
        prefs.warranty_alerts ? api.warrantyAlerts(60) : Promise.resolve({ expiring: [], expired: [] }),
        api.warrantyClaimsSummary().catch(() => ({ totals: { open: 0 } })),
      ]);
      setTools(t);
      setAgg(a);
      setWarningCount((w.expiring?.length || 0) + (w.expired?.length || 0));
      setOpenClaims(cs?.totals?.open || 0);
    } catch (e) {
      console.error(e);
    }
  }, [search, filter, prefs.warranty_alerts]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search, filter, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>TOOLBOX</Text>
          <Text style={styles.subtitle}>Inventory Tracker</Text>
        </View>
      </View>

      {prefs.warranty_alerts && warningCount > 0 && (
        <TouchableOpacity
          testID="warranty-banner"
          style={styles.warrantyBanner}
          onPress={() => router.push("/warranty")}
        >
          <Ionicons name="shield-checkmark" size={18} color={theme.colors.warning} />
          <Text style={styles.warrantyText}>
            {warningCount} warranty alert{warningCount > 1 ? "s" : ""} — tap to view
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.warning} />
        </TouchableOpacity>
      )}

      {openClaims > 0 && (
        <TouchableOpacity
          testID="claims-banner"
          style={styles.claimsBanner}
          onPress={() => router.push("/warranty-claims")}
        >
          <Ionicons name="construct" size={18} color={theme.colors.danger} />
          <Text style={styles.claimsBannerText}>
            {openClaims} open warranty claim{openClaims > 1 ? "s" : ""} — tap to view
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.danger} />
        </TouchableOpacity>
      )}

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            testID="search-input"
            placeholder="Search name, brand, dealer, agent, tag..."
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity testID="clear-search-btn" onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <TouchableOpacity
            key="claims-link"
            testID="filter-claims"
            onPress={() => router.push("/warranty-claims")}
            style={[styles.chip, styles.chipClaims]}
          >
            <Text style={[styles.chipText, styles.chipClaimsText]}>
              🛡️ WARRANTY CLAIMS
            </Text>
          </TouchableOpacity>
          {[
            { k: "all", label: "ALL" },
            { k: "available", label: "AVAILABLE" },
            { k: "out", label: "CHECKED OUT" },
            { k: "consumables", label: "CONSUMABLES" },
          ].map((f) => (
            <TouchableOpacity
              key={f.k}
              testID={`filter-${f.k}`}
              onPress={() => setFilter(f.k as any)}
              style={[styles.chip, filter === f.k && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === f.k && styles.chipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {prefs.show_details_summary && agg && (
        <SummaryHeader agg={agg} showPrices={prefs.show_prices} />
      )}

      <FlatList
        data={tools}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="construct-outline" size={64} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>NO TOOLS YET</Text>
            <Text style={styles.emptyText}>
              Tap the yellow button to add your first tool.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`tool-card-${item.id}`}
            style={styles.row}
            onPress={() => router.push(`/tool/${item.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.thumb}>
              {item.photos?.[0] ? (
                <Image source={{ uri: item.photos[0] }} style={styles.thumbImg} />
              ) : (
                <Ionicons name="construct" size={28} color={theme.colors.accent} />
              )}
              {item.is_consumable && (
                <View style={styles.consumableBadge}>
                  <Ionicons name="repeat" size={10} color="#000" />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {item.location_name || "No location"}
                {item.dealer_name ? `  ·  ${item.dealer_name}` : ""}
                {prefs.show_prices && item.cost ? `  ·  $${Number(item.cost).toFixed(0)}` : ""}
              </Text>
              {item.tag_names?.length > 0 && (
                <View style={styles.tagRow}>
                  {item.tag_names.slice(0, 3).map((t: string) => (
                    <View key={t} style={styles.tag}>
                      <Text style={styles.tagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            <View style={styles.rowRight}>
              {item.needs_repair ? (
                <>
                  <Ionicons name="build" size={16} color={theme.colors.danger} />
                  <Text style={[styles.statusText, { color: theme.colors.danger }]}>REPAIR</Text>
                </>
              ) : (
                <>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: item.is_checked_out
                          ? theme.colors.accentSecondary
                          : theme.colors.success,
                      },
                    ]}
                  />
                  <Text style={styles.statusText}>
                    {item.is_checked_out ? "OUT" : "IN"}
                  </Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        testID="add-tool-fab"
        style={styles.fab}
        onPress={() => router.push("/tool/edit")}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={32} color="#000" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  title: { color: theme.colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: 2 },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  warrantyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: 1,
    borderColor: theme.colors.warning,
    borderRadius: 4,
  },
  warrantyText: {
    color: theme.colors.warning,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  claimsBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: 4,
  },
  claimsBannerText: {
    color: theme.colors.danger,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  searchRow: { paddingHorizontal: 20, marginBottom: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bgSecondary,
    borderColor: theme.colors.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 4,
    gap: 8,
  },
  searchInput: { flex: 1, color: theme.colors.textPrimary, fontSize: 15 },
  filterWrap: { maxHeight: 48 },
  filterRow: { paddingHorizontal: 20, paddingVertical: 8, gap: 8, alignItems: "center" },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  chipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipClaims: {
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.danger,
  },
  chipClaimsText: { color: theme.colors.textPrimary },
  chipText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  chipTextActive: { color: "#000" },
  row: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
    gap: 12,
  },
  thumb: {
    width: 56,
    height: 56,
    backgroundColor: theme.colors.surface,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  consumableBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: theme.colors.accent,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  rowTitle: { color: theme.colors.textPrimary, fontWeight: "700", fontSize: 16 },
  rowSub: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  tagRow: { flexDirection: "row", marginTop: 6, gap: 4, flexWrap: "wrap" },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(255,179,0,0.15)",
    borderRadius: 2,
  },
  tagText: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  rowRight: { alignItems: "center", gap: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: {
    color: theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  empty: { alignItems: "center", marginTop: 80, paddingHorizontal: 40 },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 16,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    elevation: 8,
  },
});
