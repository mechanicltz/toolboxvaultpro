import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ResponsiveContainer } from "../../src/ResponsiveContainer";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { themedStyles } from "../../src/themeContext";
import { theme } from "../../src/theme";
import { api } from "../../src/api";

type Item = {
  profile_key: string;
  brand: string;
  model: string;
  official_name: string;
  category: string;
  contributor_count: number;
};

type FieldOpt = { value: string; count: number };

const FIELD_LABELS: Record<string, string> = {
  name: "Names", brand: "Brand", category: "Category",
  tag: "Tags", msrp: "MSRP", consumable: "Consumable",
};

export default function CommunityCatalogScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const debounce = useRef<any>(null);

  // Detail modal
  const [sel, setSel] = useState<Item | null>(null);
  const [selFields, setSelFields] = useState<Record<string, FieldOpt[]>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(async (query: string, category: string) => {
    setLoading(true);
    try {
      const r = await api.communityBrowse(query, category);
      setItems(r.items || []);
      setTotal(r.total || 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.communityCategories().then((r) => setCats(r.categories || [])).catch(() => {});
    load("", "");
  }, [load]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(q.trim(), activeCat), 350);
    return () => debounce.current && clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, activeCat]);

  const openDetail = useCallback(async (it: Item) => {
    setSel(it);
    setLoadingDetail(true);
    setSelFields({});
    try {
      const p = await api.communityProfile(it.profile_key);
      setSelFields(p.fields || {});
    } catch {
      setSelFields({});
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const useInQuickAdd = useCallback(() => {
    if (!sel) return;
    const m = sel.model;
    setSel(null);
    router.push(`/quick-add?model=${encodeURIComponent(m)}` as any);
  }, [sel, router]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <IndustrialBanner
        title="COMMUNITY CATALOG"
        subtitle="Tools shared by the community"
        onBack={() => router.back()}
        backIcon="chevron-back"
      />
      <ResponsiveContainer>
        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
          <TextInput
            testID="cc-search"
            value={q}
            onChangeText={setQ}
            placeholder="Search brand, model or name"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
          />
          {q ? (
            <TouchableOpacity onPress={() => setQ("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Category chips */}
        {cats.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
            <Chip label="All" active={activeCat === ""} onPress={() => setActiveCat("")} />
            {cats.map((c) => (
              <Chip key={c} label={c} active={activeCat === c} onPress={() => setActiveCat(activeCat === c ? "" : c)} />
            ))}
          </ScrollView>
        )}

        {loading ? (
          <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={40} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>
              {q || activeCat ? "No matching products." : "The catalog is still filling up. Add tools with model numbers to help build it."}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.count}>{total} product{total === 1 ? "" : "s"}</Text>
            {items.map((it) => (
              <TouchableOpacity key={it.profile_key} style={styles.row} onPress={() => openDetail(it)} testID={`cc-row-${it.model}`}>
                <View style={styles.rowIcon}>
                  <Ionicons name="construct" size={18} color={theme.colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowBrand}>{it.brand || "Unknown"} · {it.model}</Text>
                  <Text style={styles.rowName} numberOfLines={1}>{it.official_name || "—"}</Text>
                  {!!it.category && <Text style={styles.rowCat}>{it.category}</Text>}
                </View>
                <View style={styles.usersPill}>
                  <Ionicons name="people" size={12} color={theme.colors.textSecondary} />
                  <Text style={styles.usersText}>{it.contributor_count}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </ResponsiveContainer>

      {/* Detail modal */}
      <Modal visible={!!sel} transparent animationType="slide" onRequestClose={() => setSel(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalBrand}>{sel?.brand} · {sel?.model}</Text>
                <Text style={styles.modalName}>{sel?.official_name}</Text>
              </View>
              <TouchableOpacity onPress={() => setSel(null)} hitSlop={10}>
                <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {loadingDetail ? (
              <ActivityIndicator color={theme.colors.accent} style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {Object.keys(selFields).length === 0 ? (
                  <Text style={styles.rowCat}>No community details yet.</Text>
                ) : (
                  Object.entries(selFields).map(([field, opts]) => (
                    <View key={field} style={styles.detailBlock}>
                      <Text style={styles.detailLabel}>{FIELD_LABELS[field] || field.toUpperCase()}</Text>
                      {opts.map((o, i) => (
                        <View key={o.value + i} style={styles.detailValRow}>
                          <Text style={styles.detailVal} numberOfLines={1}>
                            {field === "msrp" ? `$${o.value}` : o.value}
                          </Text>
                          <Text style={styles.detailCount}>{o.count} {o.count === 1 ? "user" : "users"}</Text>
                        </View>
                      ))}
                    </View>
                  ))
                )}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.useBtn} onPress={useInQuickAdd} testID="cc-use">
              <Ionicons name="flash" size={16} color={theme.colors.bg} />
              <Text style={styles.useBtnText}>ADD THIS TO MY INVENTORY</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useChipStyles;
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const useChipStyles = themedStyles((c) => ({
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  chipActive: { backgroundColor: c.accent, borderColor: c.accent },
  chipText: { color: c.textSecondary, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: c.bg },
}));

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 12, paddingVertical: 11, marginTop: 12,
  },
  searchInput: { flex: 1, color: c.textPrimary, fontSize: 14, padding: 0 },
  chips: { marginTop: 12, flexGrow: 0 },
  count: { color: c.textMuted, fontSize: 11, fontWeight: "700", marginTop: 14, marginBottom: 6, letterSpacing: 0.5 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    padding: 12, marginBottom: 8,
  },
  rowIcon: { width: 38, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: c.accent + "1F" },
  rowBrand: { color: c.accent, fontSize: 12.5, fontWeight: "800" },
  rowName: { color: c.textPrimary, fontSize: 13.5, marginTop: 1 },
  rowCat: { color: c.textMuted, fontSize: 11, marginTop: 2 },
  usersPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.surfaceAlt, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  usersText: { color: c.textSecondary, fontSize: 12, fontWeight: "700" },
  empty: { alignItems: "center", gap: 12, marginTop: 60, paddingHorizontal: 30 },
  emptyText: { color: c.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
  modalHead: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 8 },
  modalBrand: { color: c.accent, fontSize: 13, fontWeight: "800" },
  modalName: { color: c.textPrimary, fontSize: 16, fontWeight: "800", marginTop: 2 },
  detailBlock: { marginTop: 12 },
  detailLabel: { color: c.textMuted, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.8, marginBottom: 4 },
  detailValRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5, gap: 10 },
  detailVal: { flex: 1, color: c.textPrimary, fontSize: 13.5, fontWeight: "600" },
  detailCount: { color: c.textMuted, fontSize: 11 },
  useBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, marginTop: 18,
  },
  useBtnText: { color: c.bg, fontSize: 13, fontWeight: "900", letterSpacing: 0.6 },
}));
