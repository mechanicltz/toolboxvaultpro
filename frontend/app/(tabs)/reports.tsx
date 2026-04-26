import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Switch,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { formatDateUS, formatDateTimeUS } from "../../src/dateUtil";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { buildLocationTree, flattenLocationTree } from "../../src/locationTree";
import { DateField } from "../../src/DateField";

const PRESET_KEY = "@reports_presets_v1";

const escapeHtml = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Column definitions - id, label, accessor, isNumeric (sums), isPhoto
type ColDef = {
  id: string;
  label: string;
  get: (t: any) => string;
  numeric?: boolean;
  rawNum?: (t: any) => number;
  photo?: boolean;
};
const COLUMNS: ColDef[] = [
  { id: "name", label: "Name", get: (t) => t.name },
  { id: "photo", label: "Photo", get: () => "", photo: true },
  { id: "category", label: "Category", get: (t) => t.category_name || "" },
  { id: "brand", label: "Brand", get: (t) => t.brand || "" },
  { id: "model", label: "Model", get: (t) => t.model || "" },
  { id: "serial", label: "Serial #", get: (t) => t.serial_number || "" },
  { id: "location", label: "Location", get: (t) => t.location_name || "" },
  { id: "tags", label: "Tags", get: (t) => (t.tag_names || []).join(", ") },
  { id: "condition", label: "Condition", get: (t) => t.condition || "" },
  { id: "purchase_date", label: "Purchased", get: (t) => formatDateUS(t.purchase_date) || "" },
  {
    id: "cost",
    label: "Cost",
    get: (t) => `$${(t.cost || 0).toFixed(2)}`,
    numeric: true,
    rawNum: (t) => t.cost || 0,
  },
  { id: "dealer", label: "Dealer", get: (t) => t.dealer_name || "" },
  { id: "agent", label: "Agent", get: (t) => t.purchased_from_agent_name || "" },
  {
    id: "status",
    label: "Status",
    get: (t) => (t.is_checked_out ? `Out: ${t.current_checkout?.borrower_name || ""}` : "Available"),
  },
  {
    id: "warranty",
    label: "Warranty",
    get: (t) =>
      t.warranty?.has_warranty
        ? `${t.warranty.provider || "Yes"}${t.warranty.expiry_date ? ` (until ${formatDateUS(t.warranty.expiry_date)})` : ""}`
        : "—",
  },
  {
    id: "consumable",
    label: "Consumable",
    get: (t) => (t.is_consumable ? "Yes" : "No"),
  },
  {
    id: "repair_status",
    label: "Repair Status",
    get: (t) =>
      t.needs_repair
        ? `${t.repair_info?.repair_status || "Reported"}${t.repair_info?.company_notified ? ` @ ${t.repair_info.company_notified}` : ""}`
        : "—",
  },
  {
    id: "repair_dates",
    label: "Repair Dates",
    get: (t) =>
      t.needs_repair
        ? `Notified ${t.repair_info?.notified_at || "—"} · Back ${t.repair_info?.expected_completion || "—"}`
        : "—",
  },
  { id: "description", label: "Description", get: (t) => t.description || "" },
];

const DEFAULT_COLS = ["name", "category", "location", "tags", "cost", "dealer", "status"];

const buildPdfHtml = (
  title: string,
  subtitle: string,
  tools: any[],
  selectedIds: string[],
) => {
  const cols = COLUMNS.filter((c) => selectedIds.includes(c.id));
  const totalValue = tools.reduce((s, t) => s + (t.cost || 0), 0);
  const checkedOutCount = tools.filter((t) => t.is_checked_out).length;
  const photoCol = cols.find((c) => c.photo);

  const headerCells = cols
    .map(
      (c) =>
        `<th style="padding:8px;font-size:10px;letter-spacing:1px;text-align:${c.numeric ? "right" : "left"}">${escapeHtml(c.label.toUpperCase())}</th>`
    )
    .join("");

  const rows = tools
    .map((t, i) => {
      const cells = cols
        .map((c) => {
          if (c.photo) {
            const url = t.photos?.[0];
            return `<td style="padding:6px;width:60px">${url ? `<img src="${url}" style="width:50px;height:50px;object-fit:cover;border:1px solid #ccc"/>` : "—"}</td>`;
          }
          const val = c.get(t);
          return `<td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;text-align:${c.numeric ? "right" : "left"};vertical-align:top">${escapeHtml(val) || "—"}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  // Totals row
  const totalCells = cols
    .map((c, idx) => {
      if (c.id === "cost") {
        return `<td style="padding:8px;text-align:right;font-weight:900;border-top:2px solid #111">$${totalValue.toFixed(2)}</td>`;
      }
      if (idx === 0) {
        return `<td style="padding:8px;font-weight:900;border-top:2px solid #111">TOTAL · ${tools.length} ITEM${tools.length === 1 ? "" : "S"}</td>`;
      }
      return `<td style="padding:8px;border-top:2px solid #111"></td>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Helvetica,Arial;margin:24px;color:#111}
    .header{border-bottom:3px solid #FFB300;padding-bottom:12px;margin-bottom:16px}
    h1{margin:0;font-size:22px;letter-spacing:2px;text-transform:uppercase}
    .sub{color:#666;font-size:12px;margin-top:4px}
    .summary{display:flex;gap:16px;margin:16px 0}
    .stat{flex:1;border:1px solid #ddd;padding:10px}
    .stat .v{font-size:18px;font-weight:900}
    .stat .l{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th{background:#111;color:#FFB300}
    .footer{margin-top:20px;font-size:10px;color:#999;text-align:center}
    @media print { @page { size: ${cols.length > 8 ? "landscape" : "portrait"}; margin: 12mm; } }
  </style></head><body>
    <div class="header">
      <h1>${escapeHtml(title)}</h1>
      <div class="sub">${escapeHtml(subtitle)} · Generated ${formatDateTimeUS(new Date().toISOString())}</div>
    </div>
    <div class="summary">
      <div class="stat"><div class="v">${tools.length}</div><div class="l">Items</div></div>
      <div class="stat"><div class="v">${checkedOutCount}</div><div class="l">Checked Out</div></div>
      <div class="stat"><div class="v">$${totalValue.toFixed(2)}</div><div class="l">Total Value</div></div>
    </div>
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${cols.length}" style="text-align:center;color:#999;padding:20px">No items</td></tr>`}</tbody>
      ${tools.length > 0 ? `<tfoot><tr>${totalCells}</tr></tfoot>` : ""}
    </table>
    <div class="footer">Toolbox Tracker · ${tools.length} item(s)</div>
  </body></html>`;
};

const buildCsv = (tools: any[], selectedIds: string[]) => {
  const cols = COLUMNS.filter((c) => selectedIds.includes(c.id) && !c.photo);
  const escape = (v: any) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = cols.map((c) => escape(c.label)).join(",");
  const rows = tools.map((t) =>
    cols
      .map((c) => {
        if (c.numeric && c.rawNum) return c.rawNum(t).toFixed(2);
        return escape(c.get(t));
      })
      .join(",")
  );
  // Totals row
  const totalsRow = cols
    .map((c, idx) => {
      if (c.id === "cost") {
        const total = tools.reduce((s, t) => s + (t.cost || 0), 0);
        return total.toFixed(2);
      }
      if (idx === 0) return escape(`TOTAL (${tools.length} items)`);
      return "";
    })
    .join(",");
  return [header, ...rows, totalsRow].join("\n");
};

export default function ReportsScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [selected, setSelected] = useState<string[]>(DEFAULT_COLS);

  // Filters
  const [allTags, setAllTags] = useState<any[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [allLocations, setAllLocations] = useState<any[]>([]);
  const [allDealers, setAllDealers] = useState<any[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [dealerFilter, setDealerFilter] = useState<string[]>([]);
  // Date range filters (ISO YYYY-MM-DD strings; "" = unset)
  const [purchaseFrom, setPurchaseFrom] = useState("");
  const [purchaseTo, setPurchaseTo] = useState("");
  const [warrantyFrom, setWarrantyFrom] = useState("");
  const [warrantyTo, setWarrantyTo] = useState("");

  // Presets
  const [presets, setPresets] = useState<any[]>([]);
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [presetName, setPresetName] = useState("");

  const loadPresets = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PRESET_KEY);
      setPresets(raw ? JSON.parse(raw) : []);
    } catch {
      setPresets([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      api.getStats().then(setStats).catch(() => {});
      api.listTags().then(setAllTags).catch(() => {});
      api.listCategories().then(setAllCategories).catch(() => {});
      api.listLocations().then(setAllLocations).catch(() => {});
      api.listDealers().then(setAllDealers).catch(() => {});
      loadPresets();
    }, [loadPresets])
  );

  // Build set of effective location IDs (selected + all descendants)
  const effectiveLocationIds = useCallback((): Set<string> => {
    if (locationFilter.length === 0) return new Set();
    const tree = buildLocationTree(allLocations);
    const flat = flattenLocationTree(tree);
    const byId: Record<string, any> = {};
    flat.forEach((n) => (byId[n.id] = n));
    const out = new Set<string>();
    const collect = (id: string) => {
      if (out.has(id)) return;
      out.add(id);
      const node = byId[id];
      if (node) node.children.forEach((c: any) => collect(c.id));
    };
    locationFilter.forEach(collect);
    return out;
  }, [locationFilter, allLocations]);

  // Apply filters to a tools array (client-side)
  const applyFilters = useCallback(
    (tools: any[]): any[] => {
      const locIds = effectiveLocationIds();
      return tools.filter((t) => {
        if (categoryFilter.length > 0) {
          if (!t.category_id || !categoryFilter.includes(t.category_id)) return false;
        }
        if (tagFilter.length > 0) {
          const ids: string[] = t.tag_ids || [];
          if (!ids.some((id) => tagFilter.includes(id))) return false;
        }
        if (locIds.size > 0) {
          if (!t.location_id || !locIds.has(t.location_id)) return false;
        }
        if (dealerFilter.length > 0) {
          if (!t.dealer_id || !dealerFilter.includes(t.dealer_id)) return false;
        }
        // Purchase date range
        if (purchaseFrom || purchaseTo) {
          const pd = (t.purchase_date || "").substring(0, 10);
          if (!pd) return false;
          if (purchaseFrom && pd < purchaseFrom) return false;
          if (purchaseTo && pd > purchaseTo) return false;
        }
        // Warranty expiry date range
        if (warrantyFrom || warrantyTo) {
          const wd = (t.warranty?.expiry_date || "").substring(0, 10);
          if (!wd) return false;
          if (warrantyFrom && wd < warrantyFrom) return false;
          if (warrantyTo && wd > warrantyTo) return false;
        }
        return true;
      });
    },
    [
      tagFilter,
      categoryFilter,
      effectiveLocationIds,
      dealerFilter,
      purchaseFrom,
      purchaseTo,
      warrantyFrom,
      warrantyTo,
    ]
  );

  const filterCount =
    tagFilter.length +
    categoryFilter.length +
    locationFilter.length +
    dealerFilter.length +
    (purchaseFrom || purchaseTo ? 1 : 0) +
    (warrantyFrom || warrantyTo ? 1 : 0);

  const clearFilters = () => {
    setTagFilter([]);
    setCategoryFilter([]);
    setLocationFilter([]);
    setDealerFilter([]);
    setPurchaseFrom("");
    setPurchaseTo("");
    setWarrantyFrom("");
    setWarrantyTo("");
  };

  // Build a "filtered by ..." subtitle suffix
  const filterSubtitle = (): string => {
    const parts: string[] = [];
    if (categoryFilter.length > 0) {
      const names = allCategories
        .filter((c) => categoryFilter.includes(c.id))
        .map((c) => c.name);
      parts.push(`Categories: ${names.join(", ")}`);
    }
    if (tagFilter.length > 0) {
      const names = allTags
        .filter((t) => tagFilter.includes(t.id))
        .map((t) => t.name);
      parts.push(`Tags: ${names.join(", ")}`);
    }
    if (locationFilter.length > 0) {
      const tree = buildLocationTree(allLocations);
      const flat = flattenLocationTree(tree);
      const names = flat
        .filter((n) => locationFilter.includes(n.id))
        .map((n) => n.name);
      parts.push(`Locations: ${names.join(", ")}`);
    }
    if (dealerFilter.length > 0) {
      const names = allDealers
        .filter((d) => dealerFilter.includes(d.id))
        .map((d) => d.name);
      parts.push(`Dealers: ${names.join(", ")}`);
    }
    if (purchaseFrom || purchaseTo) {
      parts.push(`Purchased ${purchaseFrom || "—"} to ${purchaseTo || "—"}`);
    }
    if (warrantyFrom || warrantyTo) {
      parts.push(`Warranty expires ${warrantyFrom || "—"} to ${warrantyTo || "—"}`);
    }
    return parts.length > 0 ? `  ·  Filtered by ${parts.join(" · ")}` : "";
  };

  // Presets — save, load, delete
  const persistPresets = async (next: any[]) => {
    setPresets(next);
    try {
      await AsyncStorage.setItem(PRESET_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const captureSnapshot = () => ({
    format,
    selected,
    tagFilter,
    categoryFilter,
    locationFilter,
    dealerFilter,
    purchaseFrom,
    purchaseTo,
    warrantyFrom,
    warrantyTo,
  });

  const applyPreset = (p: any) => {
    if (!p) return;
    setFormat(p.format ?? "pdf");
    setSelected(p.selected ?? DEFAULT_COLS);
    setTagFilter(p.tagFilter ?? []);
    setCategoryFilter(p.categoryFilter ?? []);
    setLocationFilter(p.locationFilter ?? []);
    setDealerFilter(p.dealerFilter ?? []);
    setPurchaseFrom(p.purchaseFrom ?? "");
    setPurchaseTo(p.purchaseTo ?? "");
    setWarrantyFrom(p.warrantyFrom ?? "");
    setWarrantyTo(p.warrantyTo ?? "");
    setShowPresetsModal(false);
  };

  const savePreset = async () => {
    const name = presetName.trim();
    if (!name) {
      Alert.alert("Required", "Please enter a name for this preset.");
      return;
    }
    const snap = captureSnapshot();
    const existingIdx = presets.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
    let next: any[];
    if (existingIdx >= 0) {
      next = [...presets];
      next[existingIdx] = { ...snap, name, updated_at: new Date().toISOString() };
    } else {
      next = [
        ...presets,
        { ...snap, name, created_at: new Date().toISOString() },
      ];
    }
    await persistPresets(next);
    setShowSavePresetModal(false);
    setPresetName("");
  };

  const deletePreset = async (name: string) => {
    const next = presets.filter((p) => p.name !== name);
    await persistPresets(next);
  };

  const toggleCol = (id: string) => {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  };

  const generate = async (kind: "all" | "out" | "in" | "broken") => {
    if (busy) return;

    let titleBase = "FULL INVENTORY";
    let subtitle = "All tracked tools and equipment";
    let filter: any = {};
    if (kind === "out") {
      titleBase = "CHECKED OUT";
      subtitle = "Tools currently borrowed";
      filter = { checked_out: true };
    } else if (kind === "in") {
      titleBase = "AVAILABLE TOOLS";
      subtitle = "Tools currently in inventory";
      filter = { checked_out: false };
    } else if (kind === "broken") {
      titleBase = "BROKEN / IN REPAIR";
      subtitle = "Tools flagged for repair";
      filter = { needs_repair: true };
    }
    const fmtSuffix = format === "pdf" ? "REPORT" : "EXPORT";
    const title = `${titleBase} ${fmtSuffix}`;

    if (selected.length === 0) {
      Alert.alert("Pick at least one column", "Toggle some columns on first.");
      return;
    }

    // PDF on web: open popup synchronously to avoid blockers
    let printWin: Window | null = null;
    if (format === "pdf" && Platform.OS === "web") {
      printWin = window.open("", "_blank");
      if (!printWin) {
        Alert.alert("Popup blocked", "Allow popups for this site to open the report.");
        return;
      }
      printWin.document.write(
        "<!doctype html><title>Loading...</title><body style='font-family:Helvetica;padding:40px;color:#666'>Generating report...</body>"
      );
    }

    setBusy(true);
    try {
      let tools = await api.listTools(filter);
      // Apply user-selected tag/category/location filters client-side
      tools = applyFilters(tools);
      // Append filter context to subtitle
      const fSub = filterSubtitle();
      const finalSubtitle = `${subtitle}${fSub}`;

      if (format === "pdf") {
        const html = buildPdfHtml(title, finalSubtitle, tools, selected);
        if (Platform.OS === "web") {
          if (!printWin) return;
          const fullHtml = html.replace(
            "</body>",
            "<script>setTimeout(function(){window.print();},700);</script></body>"
          );
          printWin.document.open();
          printWin.document.write(fullHtml);
          printWin.document.close();
          printWin.document.title = title;
        } else {
          const { uri } = await Print.printToFileAsync({ html });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, {
              mimeType: "application/pdf",
              dialogTitle: title,
            });
          }
        }
      } else {
        // CSV
        const csv = buildCsv(tools, selected);
        const filename = `${titleBase.toLowerCase().replace(/\s+/g, "_")}.csv`;
        if (Platform.OS === "web") {
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
          const path = `${FileSystem.cacheDirectory}${filename}`;
          await FileSystem.writeAsStringAsync(path, csv);
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(path, {
              mimeType: "text/csv",
              dialogTitle: title,
              UTI: "public.comma-separated-values-text",
            });
          }
        }
      }
    } catch (e: any) {
      if (printWin) printWin.close();
      Alert.alert("Error", e.message || "Could not generate report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>REPORTS</Text>
        <Text style={styles.subtitle}>Customize columns · PDF or Excel CSV</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {/* Presets bar */}
        <View style={styles.presetBar}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
            <Ionicons name="bookmark" size={14} color={theme.colors.accent} />
            <Text style={styles.presetBarLabel}>PRESETS</Text>
            <Text style={styles.presetBarCount}>({presets.length})</Text>
          </View>
          <TouchableOpacity
            testID="open-presets-btn"
            style={styles.presetActionBtn}
            onPress={() => setShowPresetsModal(true)}
            disabled={presets.length === 0}
          >
            <Ionicons
              name="folder-open"
              size={14}
              color={presets.length > 0 ? theme.colors.accent : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.presetActionText,
                presets.length === 0 && { color: theme.colors.textMuted },
              ]}
            >
              LOAD
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="save-preset-btn"
            style={styles.presetActionBtn}
            onPress={() => setShowSavePresetModal(true)}
          >
            <Ionicons name="save" size={14} color={theme.colors.accent} />
            <Text style={styles.presetActionText}>SAVE</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.total_tools ?? 0}</Text>
            <Text style={styles.statLabel}>Total Tools</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: theme.colors.success }]}>
              {stats.available ?? 0}
            </Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: theme.colors.accentSecondary }]}>
              {stats.checked_out ?? 0}
            </Text>
            <Text style={styles.statLabel}>Checked Out</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: theme.colors.accent }]}>
              ${(stats.total_value ?? 0).toFixed(0)}
            </Text>
            <Text style={styles.statLabel}>Total Value</Text>
          </View>
          {(stats.needs_repair ?? 0) > 0 && (
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: theme.colors.danger }]}>
                {stats.needs_repair}
              </Text>
              <Text style={styles.statLabel}>In Repair</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>FORMAT</Text>
        <View style={styles.segment}>
          <TouchableOpacity
            testID="format-pdf"
            style={[styles.segBtn, format === "pdf" && styles.segBtnActive]}
            onPress={() => setFormat("pdf")}
          >
            <Ionicons
              name="document-text"
              size={18}
              color={format === "pdf" ? "#000" : theme.colors.textSecondary}
            />
            <Text style={[styles.segText, format === "pdf" && styles.segTextActive]}>
              PDF
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="format-csv"
            style={[styles.segBtn, format === "csv" && styles.segBtnActive]}
            onPress={() => setFormat("csv")}
          >
            <Ionicons
              name="grid"
              size={18}
              color={format === "csv" ? "#000" : theme.colors.textSecondary}
            />
            <Text style={[styles.segText, format === "csv" && styles.segTextActive]}>
              EXCEL (CSV)
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.colsHeader}>
          <Text style={styles.sectionLabel}>
            FILTERS{filterCount > 0 ? ` (${filterCount})` : ""}
          </Text>
          {filterCount > 0 && (
            <TouchableOpacity
              testID="clear-filters-btn"
              style={styles.miniBtn}
              onPress={clearFilters}
            >
              <Text style={[styles.miniBtnText, { color: theme.colors.danger }]}>CLEAR</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Categories filter */}
        {allCategories.length > 0 && (
          <View style={styles.filterBlock}>
            <Text style={styles.filterTitle}>
              <Ionicons name="folder" size={12} color={theme.colors.accent} /> CATEGORIES
            </Text>
            <View style={styles.chipWrap}>
              {allCategories.map((c) => {
                const on = categoryFilter.includes(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    testID={`filter-cat-${c.id}`}
                    style={[styles.filterChip, on && styles.filterChipOn]}
                    onPress={() =>
                      setCategoryFilter((cur) =>
                        on ? cur.filter((x) => x !== c.id) : [...cur, c.id]
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        on && styles.filterChipTextOn,
                      ]}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Tags filter */}
        {allTags.length > 0 && (
          <View style={styles.filterBlock}>
            <Text style={styles.filterTitle}>
              <Ionicons name="pricetag" size={12} color={theme.colors.accent} /> TAGS
            </Text>
            <View style={styles.chipWrap}>
              {allTags.map((t) => {
                const on = tagFilter.includes(t.id);
                return (
                  <TouchableOpacity
                    key={t.id}
                    testID={`filter-tag-${t.id}`}
                    style={[styles.filterChip, on && styles.filterChipOn]}
                    onPress={() =>
                      setTagFilter((cur) =>
                        on ? cur.filter((x) => x !== t.id) : [...cur, t.id]
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        on && styles.filterChipTextOn,
                      ]}
                    >
                      #{t.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Locations filter (nested with descendants auto-included) */}
        {allLocations.length > 0 && (
          <View style={styles.filterBlock}>
            <Text style={styles.filterTitle}>
              <Ionicons name="location" size={12} color={theme.colors.accent} /> LOCATIONS
              <Text style={{ color: theme.colors.textMuted, fontSize: 9 }}>  ·  selecting a parent includes all sublocations</Text>
            </Text>
            <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 4, overflow: "hidden" }}>
              {flattenLocationTree(buildLocationTree(allLocations)).map((n) => {
                const on = locationFilter.includes(n.id);
                return (
                  <TouchableOpacity
                    key={n.id}
                    testID={`filter-loc-${n.id}`}
                    style={[
                      styles.locFilterRow,
                      { paddingLeft: 12 + n.depth * 16 },
                      on && { backgroundColor: theme.colors.accent },
                    ]}
                    onPress={() =>
                      setLocationFilter((cur) =>
                        on ? cur.filter((x) => x !== n.id) : [...cur, n.id]
                      )
                    }
                  >
                    <Ionicons
                      name={on ? "checkbox" : "square-outline"}
                      size={14}
                      color={on ? "#000" : theme.colors.textMuted}
                    />
                    <Ionicons
                      name={n.children.length > 0 ? "folder" : "location"}
                      size={12}
                      color={on ? "#000" : theme.colors.accent}
                    />
                    <Text
                      style={[
                        styles.locFilterText,
                        on && { color: "#000", fontWeight: "800" },
                      ]}
                      numberOfLines={1}
                    >
                      {n.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Dealers filter */}
        {allDealers.length > 0 && (
          <View style={styles.filterBlock}>
            <Text style={styles.filterTitle}>
              <Ionicons name="briefcase" size={12} color={theme.colors.accent} /> DEALERS
            </Text>
            <View style={styles.chipWrap}>
              {allDealers.map((d) => {
                const on = dealerFilter.includes(d.id);
                return (
                  <TouchableOpacity
                    key={d.id}
                    testID={`filter-dealer-${d.id}`}
                    style={[styles.filterChip, on && styles.filterChipOn]}
                    onPress={() =>
                      setDealerFilter((cur) =>
                        on ? cur.filter((x) => x !== d.id) : [...cur, d.id]
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        on && styles.filterChipTextOn,
                      ]}
                    >
                      {d.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Purchase date range filter */}
        <View style={styles.filterBlock}>
          <Text style={styles.filterTitle}>
            <Ionicons name="calendar" size={12} color={theme.colors.accent} /> PURCHASE DATE RANGE
          </Text>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateLabel}>FROM</Text>
              <DateField
                testID="filter-purchase-from"
                value={purchaseFrom}
                onChange={setPurchaseFrom}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateLabel}>TO</Text>
              <DateField
                testID="filter-purchase-to"
                value={purchaseTo}
                onChange={setPurchaseTo}
              />
            </View>
          </View>
        </View>

        {/* Warranty expiry date range filter */}
        <View style={styles.filterBlock}>
          <Text style={styles.filterTitle}>
            <Ionicons name="shield-checkmark" size={12} color={theme.colors.accent} /> WARRANTY EXPIRY RANGE
          </Text>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateLabel}>FROM</Text>
              <DateField
                testID="filter-warranty-from"
                value={warrantyFrom}
                onChange={setWarrantyFrom}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateLabel}>TO</Text>
              <DateField
                testID="filter-warranty-to"
                value={warrantyTo}
                onChange={setWarrantyTo}
              />
            </View>
          </View>
        </View>

        <View style={styles.colsHeader}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              testID="cols-all"
              style={styles.miniBtn}
              onPress={() => setSelected(COLUMNS.map((c) => c.id))}
            >
              <Text style={styles.miniBtnText}>ALL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="cols-default"
              style={styles.miniBtn}
              onPress={() => setSelected(DEFAULT_COLS)}
            >
              <Text style={styles.miniBtnText}>DEFAULT</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="cols-none"
              style={styles.miniBtn}
              onPress={() => setSelected([])}
            >
              <Text style={styles.miniBtnText}>NONE</Text>
            </TouchableOpacity>
          </View>
        </View>

        {COLUMNS.map((c) => {
          const on = selected.includes(c.id);
          // CSV format hides photo option
          if (format === "csv" && c.photo) return null;
          return (
            <View key={c.id} style={styles.colRow}>
              <Ionicons
                name={c.photo ? "image" : c.numeric ? "calculator" : "list"}
                size={16}
                color={on ? theme.colors.accent : theme.colors.textMuted}
              />
              <Text style={[styles.colLabel, on && { color: theme.colors.textPrimary }]}>
                {c.label}
                {c.numeric ? "  ·  totals" : ""}
              </Text>
              <Switch
                testID={`col-${c.id}`}
                value={on}
                onValueChange={() => toggleCol(c.id)}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor="#fff"
              />
            </View>
          );
        })}

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>EXPORT</Text>

        {filterCount > 0 && (
          <View style={styles.filterActiveBanner}>
            <Ionicons name="funnel" size={14} color={theme.colors.accent} />
            <Text style={styles.filterActiveText}>
              {filterCount} FILTER{filterCount === 1 ? "" : "S"} APPLIED — REPORTS WILL ONLY INCLUDE MATCHING TOOLS
            </Text>
          </View>
        )}

        <TouchableOpacity
          testID="report-full-btn"
          style={styles.reportCard}
          onPress={() => generate("all")}
          disabled={busy}
        >
          <View style={styles.reportIcon}>
            <Ionicons name="document-text" size={24} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportTitle}>FULL INVENTORY</Text>
            <Text style={styles.reportDesc}>
              Every tool with the columns you selected
            </Text>
          </View>
          <Ionicons name="download-outline" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="report-out-btn"
          style={styles.reportCard}
          onPress={() => generate("out")}
          disabled={busy}
        >
          <View style={styles.reportIcon}>
            <Ionicons name="alert-circle" size={24} color={theme.colors.accentSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportTitle}>CHECKED OUT</Text>
            <Text style={styles.reportDesc}>Borrowed tools and by whom</Text>
          </View>
          <Ionicons name="download-outline" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="report-in-btn"
          style={styles.reportCard}
          onPress={() => generate("in")}
          disabled={busy}
        >
          <View style={styles.reportIcon}>
            <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportTitle}>AVAILABLE</Text>
            <Text style={styles.reportDesc}>Tools currently in inventory</Text>
          </View>
          <Ionicons name="download-outline" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="report-broken-btn"
          style={styles.reportCard}
          onPress={() => generate("broken")}
          disabled={busy}
        >
          <View style={[styles.reportIcon, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
            <Ionicons name="build" size={24} color={theme.colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportTitle}>BROKEN / IN REPAIR</Text>
            <Text style={styles.reportDesc}>Tools flagged for repair tracking</Text>
          </View>
          <Ionicons name="download-outline" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="report-insurance-btn"
          style={[styles.reportCard, { borderColor: theme.colors.accent }]}
          onPress={() => router.push("/insurance-report")}
          disabled={busy}
        >
          <View style={[styles.reportIcon, { backgroundColor: "rgba(255,179,0,0.15)" }]}>
            <Ionicons name="shield" size={24} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportTitle}>INSURANCE REPORT</Text>
            <Text style={styles.reportDesc}>
              Full inventory PDF with your policyholder info & total value
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.accent} />
        </TouchableOpacity>

        {busy && (
          <Text style={{ color: theme.colors.accent, textAlign: "center", marginTop: 16 }}>
            Generating...
          </Text>
        )}

        <Text style={styles.tip}>
          TIP: Numeric columns (Cost) get a TOTAL row at the bottom. Photos are
          PDF-only. To export filtered/search results, search on Inventory then
          export from a tool's detail page.
        </Text>
      </ScrollView>

      {/* Save preset modal */}
      <Modal
        visible={showSavePresetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSavePresetModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>SAVE AS PRESET</Text>
            <Text style={styles.modalHint}>
              Saves current format, columns, and all filters under a name you can reload later.
            </Text>
            <TextInput
              testID="preset-name-input"
              placeholder="e.g. Tax 2025 - Power Tools"
              placeholderTextColor={theme.colors.textMuted}
              value={presetName}
              onChangeText={setPresetName}
              style={styles.input}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => {
                  setShowSavePresetModal(false);
                  setPresetName("");
                }}
              >
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-save-preset"
                style={styles.btnPrimary}
                onPress={savePreset}
              >
                <Text style={styles.btnPrimaryText}>SAVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Load presets modal */}
      <Modal
        visible={showPresetsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPresetsModal(false)}
      >
        <View style={[styles.modalBg, { justifyContent: "flex-end" }]}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>LOAD PRESET</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {presets.length === 0 ? (
                <Text style={{ color: theme.colors.textMuted, padding: 16, textAlign: "center" }}>
                  No saved presets yet.
                </Text>
              ) : (
                presets.map((p) => {
                  const fcount =
                    (p.tagFilter?.length || 0) +
                    (p.categoryFilter?.length || 0) +
                    (p.locationFilter?.length || 0) +
                    (p.dealerFilter?.length || 0) +
                    (p.purchaseFrom || p.purchaseTo ? 1 : 0) +
                    (p.warrantyFrom || p.warrantyTo ? 1 : 0);
                  return (
                    <View key={p.name} style={styles.presetItem}>
                      <TouchableOpacity
                        testID={`load-preset-${p.name}`}
                        style={{ flex: 1 }}
                        onPress={() => applyPreset(p)}
                      >
                        <Text style={styles.presetItemName}>{p.name}</Text>
                        <Text style={styles.presetItemMeta}>
                          {(p.format || "pdf").toUpperCase()} · {p.selected?.length || 0} cols · {fcount} filter{fcount === 1 ? "" : "s"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`delete-preset-${p.name}`}
                        onPress={() => deletePreset(p.name)}
                        hitSlop={10}
                        style={{ padding: 8 }}
                      >
                        <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.btnGhost}
              onPress={() => setShowPresetsModal(false)}
            >
              <Text style={styles.btnGhostText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { color: theme.colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: 2 },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    borderRadius: 4,
  },
  statValue: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 24 },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 4,
    textTransform: "uppercase",
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 10,
  },
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 16,
  },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  segBtnActive: { backgroundColor: theme.colors.accent },
  segText: {
    color: theme.colors.textSecondary,
    fontWeight: "800",
    letterSpacing: 1,
    fontSize: 12,
  },
  segTextActive: { color: "#000" },
  colsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  miniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
  },
  miniBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  colRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
  },
  colLabel: { color: theme.colors.textSecondary, fontSize: 14, flex: 1 },
  filterBlock: {
    marginBottom: 14,
  },
  filterTitle: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.bgSecondary,
  },
  filterChipOn: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  filterChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  filterChipTextOn: { color: "#000", fontWeight: "900" },
  locFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingRight: 12,
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
    backgroundColor: theme.colors.bgSecondary,
  },
  locFilterText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  filterActiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,179,0,0.10)",
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 4,
  },
  filterActiveText: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    flex: 1,
  },
  // Presets bar + items
  presetBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
    borderRadius: 4,
  },
  presetBarLabel: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  presetBarCount: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  presetActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
  },
  presetActionText: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  presetItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  presetItemName: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  presetItemMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  // Date row
  dateRow: { flexDirection: "row", gap: 10 },
  dateLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  // Modals
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 22,
    borderRadius: theme.radii.md,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
  },
  modalSheet: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 22,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
    borderTopLeftRadius: theme.radii.md,
    borderTopRightRadius: theme.radii.md,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 10,
  },
  modalHint: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 16,
  },
  input: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 4,
    fontSize: 15,
  },
  btnPrimary: {
    flex: 1,
    height: 44,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.sm,
  },
  btnPrimaryText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 14,
  },
  btnGhost: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.sm,
  },
  btnGhostText: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    letterSpacing: 2,
    fontSize: 14,
  },
  reportCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 8,
    borderRadius: 4,
    gap: 12,
  },
  reportIcon: {
    width: 44,
    height: 44,
    backgroundColor: theme.colors.surface,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  reportTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 2,
  },
  reportDesc: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  tip: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 20,
    textAlign: "center",
    lineHeight: 16,
  },
});
