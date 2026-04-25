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

export default function InventoryScreen() {
  const router = useRouter();
  const [tools, setTools] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "available" | "out">("all");
  const [stats, setStats] = useState<any>({});

  const load = useCallback(async () => {
    try {
      const params: any = { search: search || undefined };
      if (filter === "available") params.checked_out = false;
      if (filter === "out") params.checked_out = true;
      const [t, s] = await Promise.all([api.listTools(params), api.getStats()]);
      setTools(t);
      setStats(s);
    } catch (e) {
      console.error(e);
    }
  }, [search, filter]);

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
        <View style={styles.statsRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{stats.total_tools ?? 0}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, { color: theme.colors.success }]}>
              {stats.available ?? 0}
            </Text>
            <Text style={styles.statLabel}>In</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, { color: theme.colors.accentSecondary }]}>
              {stats.checked_out ?? 0}
            </Text>
            <Text style={styles.statLabel}>Out</Text>
          </View>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            testID="search-input"
            placeholder="Search tools, tags, location..."
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {[
          { k: "all", label: "ALL" },
          { k: "available", label: "AVAILABLE" },
          { k: "out", label: "CHECKED OUT" },
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
            testID={`tool-row-${item.id}`}
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
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {item.location_name || "No location"}
                {item.brand ? `  ·  ${item.brand}` : ""}
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
  },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
  },
  statBlock: { alignItems: "center", paddingHorizontal: 8 },
  statValue: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 18 },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
  },
  statDivider: { width: 1, height: 24, backgroundColor: theme.colors.border },
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
  filterRow: { paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
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
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
});
