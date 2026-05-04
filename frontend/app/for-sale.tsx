import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { formatDateUS } from "../src/dateUtil";
import { DateField } from "../src/DateField";
import { ResponsiveContainer } from "../src/ResponsiveContainer";
import { useResponsive } from "../src/responsive";

type Tool = any;

export default function ForSaleScreen() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const numColumns = isTablet ? 2 : 1;

  const [tab, setTab] = useState<"listed" | "sold">("listed");
  const [items, setItems] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterTagId, setFilterTagId] = useState<string>("");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("");
  const [filterDealerId, setFilterDealerId] = useState<string>("");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [tags, setTags] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [dealers, setDealers] = useState<any[]>([]);

  const loadFiltersData = useCallback(async () => {
    try {
      const [t, c, d] = await Promise.all([
        api.listTags(), api.listCategories(), api.listDealers(),
      ]);
      setTags(t || []);
      setCategories(c || []);
      setDealers(d || []);
    } catch (e) {
      // soft fail
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const params: any = {};
      if (tab === "listed") {
        params.for_sale = true;
      } else {
        params.is_sold = true;
      }
      const all: Tool[] = await api.listTools(params);
      setItems(all || []);
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    load();
    loadFiltersData();
  }, [load, loadFiltersData]);

  // Apply local search + filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((t) => {
      if (q) {
        const hay = [
          t.name, t.description, t.brand, t.model, t.serial_number,
          (t.tag_names || []).join(" "), t.location_name, t.category_name,
          t.dealer_name, t.sold_to,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterTagId && !((t.tag_ids || []).includes(filterTagId))) return false;
      if (filterCategoryId && t.category_id !== filterCategoryId) return false;
      if (filterDealerId && t.dealer_id !== filterDealerId) return false;
      const dt = tab === "sold" ? (t.sold_at || "") : (t.sale_listed_at || "");
      if (filterFrom && dt && dt < filterFrom) return false;
      if (filterTo && dt && dt > filterTo) return false;
      return true;
    });
  }, [items, search, filterTagId, filterCategoryId, filterDealerId, filterFrom, filterTo, tab]);

  const totals = useMemo(() => {
    const count = filtered.length;
    const value = filtered.reduce((sum, t) => {
      const v = tab === "sold" ? (t.sold_price || 0) : (t.sale_price || 0);
      return sum + v;
    }, 0);
    return { count, value };
  }, [filtered, tab]);

  const clearFilters = () => {
    setFilterTagId("");
    setFilterCategoryId("");
    setFilterDealerId("");
    setFilterFrom("");
    setFilterTo("");
  };

  const renderCard = ({ item }: { item: Tool }) => {
    const photoRaw = (item.photos || [])[0];
    // Photos may be stored as a full data URI string OR as {data, mime_type}.
    const photoUri =
      typeof photoRaw === "string"
        ? photoRaw
        : photoRaw && photoRaw.data
        ? `data:${photoRaw.mime_type || "image/jpeg"};base64,${photoRaw.data}`
        : "";
    const isSold = tab === "sold";
    const price = isSold ? (item.sold_price || 0) : (item.sale_price || 0);
    return (
      <TouchableOpacity
        testID={`fs-card-${item.id}`}
        style={[styles.card, { flex: numColumns > 1 ? 1 : undefined }]}
        onPress={() => router.push(`/tool/${item.id}`)}
      >
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.cardImg} resizeMode="cover" />
        ) : (
          <View style={[styles.cardImg, { alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="cube" size={40} color={theme.colors.textMuted} />
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          {!!item.brand && <Text style={styles.cardSub} numberOfLines={1}>{item.brand}{item.model ? `  ·  ${item.model}` : ""}</Text>}
          <View style={styles.priceRow}>
            <Text style={[styles.cardPrice, isSold && { color: "#27AE60" }]}>
              ${price.toFixed(2)}
            </Text>
            {isSold ? (
              <View style={styles.soldPill}>
                <Ionicons name="checkmark-circle" size={11} color="#fff" />
                <Text style={styles.soldPillText}>SOLD</Text>
              </View>
            ) : (
              <View style={styles.listedPill}>
                <Ionicons name="pricetag" size={11} color="#000" />
                <Text style={styles.listedPillText}>FOR SALE</Text>
              </View>
            )}
          </View>
          {isSold && !!item.sold_to && (
            <Text style={styles.cardMeta} numberOfLines={1}>To: {item.sold_to}</Text>
          )}
          {!!item.dealer_name && (
            <Text style={styles.cardMeta} numberOfLines={1}>Dealer: {item.dealer_name}</Text>
          )}
          <Text style={styles.cardMeta}>
            {isSold
              ? (item.sold_at ? `Sold ${formatDateUS(item.sold_at)}` : "")
              : (item.sale_listed_at ? `Listed ${formatDateUS(item.sale_listed_at)}` : "")}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const filterCount = (filterTagId ? 1 : 0) + (filterCategoryId ? 1 : 0) + (filterDealerId ? 1 : 0) + (filterFrom ? 1 : 0) + (filterTo ? 1 : 0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>INVENTORY FOR SALE</Text>
        <TouchableOpacity
          onPress={() => router.push("/tool/edit")}
          testID="add-item-btn"
          style={styles.reportsBtn}
        >
          <Ionicons name="add" size={14} color={theme.colors.accent} />
          <Text style={styles.reportsBtnText}>ADD ITEM</Text>
        </TouchableOpacity>
      </View>

      <ResponsiveContainer>
        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            testID="tab-listed"
            style={[styles.tabBtn, tab === "listed" && styles.tabBtnActive]}
            onPress={() => setTab("listed")}
          >
            <Ionicons name="pricetag" size={14} color={tab === "listed" ? "#000" : theme.colors.textSecondary} />
            <Text style={[styles.tabText, tab === "listed" && styles.tabTextActive]}>LISTED</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="tab-sold"
            style={[styles.tabBtn, tab === "sold" && styles.tabBtnActiveSold]}
            onPress={() => setTab("sold")}
          >
            <Ionicons name="checkmark-circle" size={14} color={tab === "sold" ? "#fff" : theme.colors.textSecondary} />
            <Text style={[styles.tabText, tab === "sold" && { color: "#fff" }]}>SOLD</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={theme.colors.textMuted} />
          <TextInput
            testID="fs-search"
            value={search}
            onChangeText={setSearch}
            placeholder={tab === "listed" ? "Search items for sale..." : "Search sold items..."}
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
          />
          <TouchableOpacity testID="filters-btn" onPress={() => setShowFilters(true)} hitSlop={6} style={styles.filterBtn}>
            <Ionicons name="filter" size={16} color={filterCount > 0 ? "#000" : theme.colors.textPrimary} />
            <Text style={[styles.filterBtnText, filterCount > 0 && { color: "#000" }]}>
              {filterCount > 0 ? `FILTERS · ${filterCount}` : "FILTERS"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Summary */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{tab === "listed" ? "LISTED" : "SOLD"}</Text>
            <Text style={styles.statValue}>{totals.count}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: tab === "sold" ? "rgba(39,174,96,0.10)" : "rgba(255,179,0,0.10)" }]}>
            <Text style={styles.statLabel}>{tab === "listed" ? "ASKING TOTAL" : "SOLD TOTAL"}</Text>
            <Text style={[styles.statValue, { color: tab === "sold" ? "#27AE60" : theme.colors.accent }]}>
              ${totals.value.toFixed(2)}
            </Text>
          </View>
        </View>
      </ResponsiveContainer>

      {/* List */}
      {loading ? (
        <View style={{ padding: 40, alignItems: "center" }}>
          <ActivityIndicator color={theme.colors.accent} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <ResponsiveContainer>
          <View style={styles.empty}>
            <Ionicons name={tab === "listed" ? "pricetag-outline" : "archive-outline"} size={50} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {tab === "listed" ? "No items listed for sale" : "No sold items yet"}
            </Text>
            <Text style={styles.emptyMsg}>
              {tab === "listed"
                ? "Open any tool, edit it, and toggle FOR SALE to list it here."
                : "Items you mark as sold will appear here."}
            </Text>
          </View>
        </ResponsiveContainer>
      ) : (
        <FlatList
          key={`fs-list-${numColumns}`}
          data={filtered}
          keyExtractor={(t) => t.id}
          renderItem={renderCard}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? { gap: 12, paddingHorizontal: 16 } : undefined}
          contentContainerStyle={{ paddingHorizontal: numColumns > 1 ? 0 : 16, paddingBottom: 30, gap: 12 }}
          onRefresh={() => { setRefreshing(true); load(); }}
          refreshing={refreshing}
        />
      )}

      {/* Filters modal */}
      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="filter" size={20} color={theme.colors.accent} />
              <Text style={styles.modalTitle}>FILTERS</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 460 }}>
              <Text style={styles.fLabel}>TAG</Text>
              <ChipSelect items={[{ id: "", name: "All" }, ...tags]} value={filterTagId} onChange={setFilterTagId} testIDPrefix="filter-tag" />
              <Text style={styles.fLabel}>CATEGORY</Text>
              <ChipSelect items={[{ id: "", name: "All" }, ...categories]} value={filterCategoryId} onChange={setFilterCategoryId} testIDPrefix="filter-cat" />
              <Text style={styles.fLabel}>DEALER</Text>
              <ChipSelect items={[{ id: "", name: "All" }, ...dealers]} value={filterDealerId} onChange={setFilterDealerId} testIDPrefix="filter-dealer" />
              <Text style={styles.fLabel}>{tab === "sold" ? "SOLD DATE RANGE" : "LISTED DATE RANGE"}</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fSub}>FROM</Text>
                  <DateField testID="fs-from" value={filterFrom} onChange={setFilterFrom} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fSub}>TO</Text>
                  <DateField testID="fs-to" value={filterTo} onChange={setFilterTo} />
                </View>
              </View>
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity onPress={clearFilters} style={[styles.modalBtn, { flex: 1, backgroundColor: theme.colors.bgSecondary }]}>
                <Text style={[styles.modalBtnText, { color: theme.colors.textPrimary }]}>CLEAR</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowFilters(false)} style={[styles.modalBtn, { flex: 1, backgroundColor: theme.colors.accent }]}>
                <Text style={[styles.modalBtnText, { color: "#000" }]}>APPLY</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ChipSelect({ items, value, onChange, testIDPrefix }: { items: any[]; value: string; onChange: (v: string) => void; testIDPrefix: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
      {items.map((it) => {
        const sel = (value || "") === (it.id || "");
        return (
          <TouchableOpacity
            key={it.id || "all"}
            testID={`${testIDPrefix}-${it.id || "all"}`}
            onPress={() => onChange(it.id)}
            style={[styles.chip, sel && styles.chipActive]}
          >
            <Text style={[styles.chipText, sel && styles.chipTextActive]}>{it.name}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  title: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  reportsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15,15,15,0.9)",
    borderWidth: 1,
    borderColor: theme.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 5,
  },
  reportsBtnText: {
    color: theme.colors.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 10,
    borderRadius: 8,
  },
  tabBtnActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  tabBtnActiveSold: { backgroundColor: "#27AE60", borderColor: "#27AE60" },
  tabText: { color: theme.colors.textSecondary, fontWeight: "900", fontSize: 10, letterSpacing: 1.5 },
  tabTextActive: { color: "#000" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 4,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 11,
    paddingVertical: 10,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.bg,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterBtnText: { color: theme.colors.textPrimary, fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginTop: 12, marginBottom: 4 },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 10,
  },
  statLabel: { color: theme.colors.textMuted, fontSize: 8, fontWeight: "800", letterSpacing: 1.5 },
  statValue: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: "900", marginTop: 2 },
  card: {
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    overflow: "hidden",
    flexDirection: "row",
  },
  cardImg: { width: 120, height: 120, backgroundColor: theme.colors.bg },
  cardBody: { flex: 1, padding: 10 },
  cardName: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 11 },
  cardSub: { color: theme.colors.textSecondary, fontSize: 9, marginTop: 2 },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  cardPrice: { color: theme.colors.accent, fontSize: 16, fontWeight: "900" },
  cardMeta: { color: theme.colors.textMuted, fontSize: 8, marginTop: 2 },
  listedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  listedPillText: { color: "#000", fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  soldPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#27AE60",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  soldPillText: { color: "#fff", fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  empty: { alignItems: "center", padding: 40, gap: 10 },
  emptyTitle: { color: theme.colors.textPrimary, fontSize: 12, fontWeight: "800" },
  emptyMsg: { color: theme.colors.textMuted, fontSize: 10, textAlign: "center", lineHeight: 15 },
  // Modal helpers
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: {
    width: "100%", maxWidth: 520, backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 18,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  modalTitle: { flex: 1, color: theme.colors.textPrimary, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  modalBtn: { paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  modalBtnText: { fontWeight: "900", fontSize: 10, letterSpacing: 1.5 },
  fLabel: { color: theme.colors.textSecondary, fontSize: 9, fontWeight: "800", letterSpacing: 1.5, marginTop: 12, marginBottom: 4 },
  fSub: { color: theme.colors.textMuted, fontSize: 8, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: theme.colors.bg,
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 999,
  },
  chipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipText: { color: theme.colors.textSecondary, fontSize: 10, fontWeight: "700" },
  chipTextActive: { color: "#000", fontWeight: "900" },
  // Report option cards
  reportOpt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: theme.colors.bg,
    borderWidth: 2,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  reportOptTitle: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 11, letterSpacing: 1.5 },
  reportOptSub: { color: theme.colors.textMuted, fontSize: 9, marginTop: 2 },
});
