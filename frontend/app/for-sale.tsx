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
import { printReportHtml } from "../src/printHtml";
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

  // Reports
  const [showReportPicker, setShowReportPicker] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

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

  const generatePdf = async (mode: "bulk" | "perItem") => {
    setReportBusy(true);

    // Build HTML synchronously first, before any async work,
    // so popup-blockers / sandboxed previews still allow the print window.
    const html = buildHtml(filtered, mode, tab, { count: totals.count, value: totals.value });
    const filename = `${tab === "sold" ? "sold-items" : "for-sale"}-${mode}-${Date.now()}.pdf`;

    try {
      await printReportHtml(html, filename);
      setShowReportPicker(false);
    } catch (e: any) {
      Alert.alert("Error generating report", String(e?.message || e));
    } finally {
      setReportBusy(false);
    }
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
        <TouchableOpacity onPress={() => setShowReportPicker(true)} testID="report-btn">
          <Ionicons name="document-text" size={22} color={theme.colors.accent} />
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

      {/* Report picker modal */}
      <Modal visible={showReportPicker} transparent animationType="fade" onRequestClose={() => setShowReportPicker(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 460 }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="document-text" size={20} color={theme.colors.accent} />
              <Text style={styles.modalTitle}>{tab === "listed" ? "FOR-SALE REPORT" : "SOLD ITEMS REPORT"}</Text>
              <TouchableOpacity onPress={() => setShowReportPicker(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13, marginBottom: 16, lineHeight: 19 }}>
              {`How would you like to print ${filtered.length} ${tab === "sold" ? "sold item(s)" : "item(s) for sale"}?`}
            </Text>
            <TouchableOpacity
              testID="report-bulk"
              disabled={reportBusy}
              onPress={() => generatePdf("bulk")}
              style={[styles.reportOpt, { borderColor: theme.colors.accent }]}
            >
              <Ionicons name="grid" size={26} color={theme.colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.reportOptTitle}>BULK SHEET</Text>
                <Text style={styles.reportOptSub}>All items on the same paper, compact grid</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              testID="report-per-item"
              disabled={reportBusy}
              onPress={() => generatePdf("perItem")}
              style={[styles.reportOpt, { borderColor: "#27AE60" }]}
            >
              <Ionicons name="document" size={26} color="#27AE60" />
              <View style={{ flex: 1 }}>
                <Text style={styles.reportOptTitle}>ONE PAGE PER ITEM</Text>
                <Text style={styles.reportOptSub}>Large photo + full details, one item per sheet</Text>
              </View>
            </TouchableOpacity>
            {reportBusy && (
              <View style={{ alignItems: "center", marginTop: 12 }}>
                <ActivityIndicator color={theme.colors.accent} />
                <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 4 }}>Building PDF...</Text>
              </View>
            )}
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

// =================== PDF HTML BUILDERS ===================
function escapeHtml(s: any): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function imgSrc(t: any): string {
  const photo = (t.photos || [])[0];
  if (!photo) return "";
  // Photos may be a full data URI string OR an object with {data, mime_type}
  if (typeof photo === "string") return photo;
  if (photo.data) return `data:${photo.mime_type || "image/jpeg"};base64,${photo.data}`;
  return "";
}

function buildHtml(items: any[], mode: "bulk" | "perItem", tab: "listed" | "sold", totals: { count: number; value: number }) {
  const isSold = tab === "sold";
  const titleWord = isSold ? "SOLD ITEMS" : "ITEMS FOR SALE";
  const accent = isSold ? "#27AE60" : "#FFB300";
  const today = new Date().toLocaleDateString("en-US");

  const headerHtml = `
    <div class="cover">
      <h1>${titleWord}</h1>
      <div class="cover-meta">
        <div><span class="lbl">Items</span> <span class="val">${totals.count}</span></div>
        <div><span class="lbl">${isSold ? "Sold Total" : "Asking Total"}</span> <span class="val accent">$${totals.value.toFixed(2)}</span></div>
        <div><span class="lbl">Generated</span> <span class="val">${today}</span></div>
      </div>
    </div>
  `;

  const itemsBody =
    mode === "bulk"
      ? `<div class="grid">${items.map((t) => bulkCard(t, isSold)).join("")}</div>`
      : items.map((t) => perItemPage(t, isSold)).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: Letter; margin: 0.5in; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #222; margin: 0; }
    h1 { font-size: 32px; letter-spacing: 4px; color: #111; margin: 0 0 8px; }
    .cover { padding: 20px 0 24px; border-bottom: 4px solid ${accent}; margin-bottom: 18px; }
    .cover-meta { display: flex; gap: 32px; margin-top: 14px; flex-wrap: wrap; }
    .cover-meta .lbl { font-size: 10px; letter-spacing: 1.5px; color: #666; font-weight: 800; text-transform: uppercase; display: block; }
    .cover-meta .val { font-size: 18px; font-weight: 800; color: #111; }
    .cover-meta .val.accent { color: ${accent}; }

    /* BULK GRID */
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .card { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; page-break-inside: avoid; background: #fff; }
    .card .img { width: 100%; height: 140px; background: #f4f4f4; display: flex; align-items: center; justify-content: center; }
    .card .img img { width: 100%; height: 100%; object-fit: cover; }
    .card .img .no { color: #999; font-size: 12px; }
    .card .body { padding: 10px 12px; }
    .card .name { font-size: 13px; font-weight: 800; color: #111; margin: 0 0 2px; }
    .card .sub { font-size: 11px; color: #555; margin: 0 0 4px; }
    .card .price { font-size: 18px; font-weight: 900; color: ${accent}; margin: 4px 0 6px; }
    .card .meta { font-size: 10px; color: #777; margin: 1px 0; }
    .card .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 800; letter-spacing: 1.5px; background: ${accent}; color: #000; margin-top: 4px; }
    .card.sold .pill { background: ${accent}; color: #fff; }

    /* PER-ITEM PAGE — sized to fit a single Letter page */
    @page { size: Letter; margin: 0.4in; }
    .item-page {
      page-break-after: always;
      page-break-inside: avoid;
      height: 10.2in;
      max-height: 10.2in;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      padding: 0;
    }
    .item-page:last-child { page-break-after: auto; }
    .item-page-head {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; margin-bottom: 8px;
    }
    .item-page-head .left { flex: 1; min-width: 0; }
    .item-photo {
      width: 100%;
      flex: 1 1 auto;
      max-height: 4.6in;
      background: #f4f4f4;
      border: 1px solid #ddd;
      border-radius: 8px;
      overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 12px;
    }
    .item-photo img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .item-photo .no { color: #999; font-size: 12px; }
    .big-name { font-size: 22px; font-weight: 900; color: #111; margin: 0; line-height: 1.15; }
    .big-price { font-size: 30px; font-weight: 900; color: ${accent}; margin: 0; white-space: nowrap; }
    .desc { font-size: 11px; color: #444; margin: 0 0 8px; line-height: 15px; max-height: 1.1in; overflow: hidden; }
    .specs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; margin-top: 4px; }
    .spec .lbl { font-size: 8px; letter-spacing: 1.2px; color: #666; font-weight: 800; text-transform: uppercase; display: block; }
    .spec .val { font-size: 12px; color: #111; font-weight: 700; line-height: 1.2; }
    .ribbon { display: inline-block; background: ${accent}; color: ${isSold ? "#fff" : "#000"}; padding: 3px 10px; font-size: 9px; letter-spacing: 1.5px; font-weight: 900; border-radius: 3px; margin-bottom: 4px; }
  </style></head><body>
    ${headerHtml}
    ${itemsBody}
  </body></html>`;
}

function bulkCard(t: any, isSold: boolean): string {
  const src = imgSrc(t);
  const price = isSold ? (t.sold_price || 0) : (t.sale_price || 0);
  const dt = isSold ? t.sold_at : t.sale_listed_at;
  return `
    <div class="card${isSold ? " sold" : ""}">
      <div class="img">${src ? `<img src="${src}" />` : `<div class="no">No photo</div>`}</div>
      <div class="body">
        <div class="name">${escapeHtml(t.name)}</div>
        <div class="sub">${escapeHtml((t.brand || "") + (t.model ? "  ·  " + t.model : ""))}</div>
        <div class="price">$${price.toFixed(2)}</div>
        ${isSold && t.sold_to ? `<div class="meta">Sold to: ${escapeHtml(t.sold_to)}</div>` : ""}
        ${t.dealer_name ? `<div class="meta">Dealer: ${escapeHtml(t.dealer_name)}</div>` : ""}
        ${dt ? `<div class="meta">${isSold ? "Sold" : "Listed"}: ${formatDateUS(dt)}</div>` : ""}
        <span class="pill">${isSold ? "SOLD" : "FOR SALE"}</span>
      </div>
    </div>
  `;
}

function perItemPage(t: any, isSold: boolean): string {
  const src = imgSrc(t);
  const price = isSold ? (t.sold_price || 0) : (t.sale_price || 0);
  const specs = [
    ["Brand", t.brand],
    ["Model", t.model],
    ["Serial #", t.serial_number],
    ["Condition", t.condition],
    ["Original Cost", t.cost ? `$${(t.cost || 0).toFixed(2)}` : ""],
    ["Purchased", formatDateUS(t.purchase_date)],
    ["Dealer", t.dealer_name],
    ["Location", t.location_name],
    ...(isSold
      ? [
          ["Sold To", t.sold_to],
          ["Sold On", formatDateUS(t.sold_at)],
        ]
      : [["Listed", formatDateUS(t.sale_listed_at)]]),
  ];
  const desc = t.description || "";
  const noteField = isSold ? t.sold_notes : t.sale_notes;
  return `
    <div class="item-page">
      <div class="item-page-head">
        <div class="left">
          <span class="ribbon">${isSold ? "SOLD" : "FOR SALE"}</span>
          <div class="big-name">${escapeHtml(t.name)}</div>
        </div>
        <div class="big-price">$${price.toFixed(2)}</div>
      </div>
      <div class="item-photo">${src ? `<img src="${src}" />` : `<div class="no">No photo</div>`}</div>
      ${desc ? `<div class="desc">${escapeHtml(desc)}</div>` : ""}
      ${noteField ? `<div class="desc"><em>${escapeHtml(noteField)}</em></div>` : ""}
      <div class="specs">
        ${specs
          .filter(([_, v]) => !!v)
          .map(([l, v]) => `<div class="spec"><span class="lbl">${l}</span><span class="val">${escapeHtml(v)}</span></div>`)
          .join("")}
      </div>
    </div>
  `;
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
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
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
  tabText: { color: theme.colors.textSecondary, fontWeight: "900", fontSize: 12, letterSpacing: 1.5 },
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
    fontSize: 14,
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
  filterBtnText: { color: theme.colors.textPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginTop: 12, marginBottom: 4 },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 10,
  },
  statLabel: { color: theme.colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  statValue: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: "900", marginTop: 2 },
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
  cardName: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 14 },
  cardSub: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 2 },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  cardPrice: { color: theme.colors.accent, fontSize: 20, fontWeight: "900" },
  cardMeta: { color: theme.colors.textMuted, fontSize: 10, marginTop: 2 },
  listedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  listedPillText: { color: "#000", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  soldPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#27AE60",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  soldPillText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  empty: { alignItems: "center", padding: 40, gap: 10 },
  emptyTitle: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: "800" },
  emptyMsg: { color: theme.colors.textMuted, fontSize: 12, textAlign: "center", lineHeight: 18 },
  // Modal helpers
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: {
    width: "100%", maxWidth: 520, backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 18,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  modalTitle: { flex: 1, color: theme.colors.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 1.5 },
  modalBtn: { paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  modalBtnText: { fontWeight: "900", fontSize: 12, letterSpacing: 1.5 },
  fLabel: { color: theme.colors.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginTop: 12, marginBottom: 4 },
  fSub: { color: theme.colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: theme.colors.bg,
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 999,
  },
  chipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: "700" },
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
  reportOptTitle: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 13, letterSpacing: 1.5 },
  reportOptSub: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
});
