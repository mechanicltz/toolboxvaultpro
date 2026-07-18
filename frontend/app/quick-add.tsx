import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ResponsiveContainer } from "../src/ResponsiveContainer";
import { IndustrialBanner } from "../src/components/IndustrialBanner";
import { DateField } from "../src/DateField";
import { themedStyles } from "../src/themeContext";
import { theme } from "../src/theme";
import { api } from "../src/api";

type Match = {
  profile_key: string;
  brand: string;
  model: string;
  official_name: string;
  contributor_count: number;
};

type FieldOpt = { value: string; count: number };

/**
 * Quick Add — the fast entry point for the Community Product Database.
 * User types a model #, we look it up in the shared catalog, and let them
 * import the crowd-sourced details (name, brand, category, tags, MSRP,
 * consumable) with per-field checkboxes, then add it with their own personal
 * fields (dealer, purchase date, price). Full editor opens after for the rest.
 */
export default function QuickAddScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ model?: string }>();

  const [model, setModel] = useState(typeof params.model === "string" ? params.model : "");
  const [name, setName] = useState("");
  const [dealer, setDealer] = useState("");
  const [dateIso, setDateIso] = useState("");
  const [price, setPrice] = useState("");

  const [looking, setLooking] = useState(false);
  const [branch, setBranch] = useState<"none" | "one" | "multiple" | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);

  const [selected, setSelected] = useState<Match | null>(null);
  const [profileFields, setProfileFields] = useState<Record<string, FieldOpt[]>>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  // Which imported fields are checked.
  const [imp, setImp] = useState({
    name: true, brand: true, category: true, tags: true, msrp: true, consumable: true,
  });

  const [saving, setSaving] = useState(false);
  const debounce = useRef<any>(null);

  // Debounced lookup as the model # is typed.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const m = model.trim();
    setSelected(null);
    setProfileFields({});
    if (m.length < 2) {
      setBranch(null);
      setMatches([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setLooking(true);
      try {
        const r = await api.communityLookup(m);
        setBranch(r.branch);
        setMatches(r.matches || []);
        // Auto-select the single match.
        if (r.branch === "one" && r.matches?.length) selectMatch(r.matches[0]);
      } catch {
        setBranch("none");
        setMatches([]);
      } finally {
        setLooking(false);
      }
    }, 450);
    return () => debounce.current && clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const selectMatch = useCallback(async (m: Match) => {
    setSelected(m);
    setLoadingProfile(true);
    try {
      const p = await api.communityProfile(m.profile_key);
      setProfileFields(p.fields || {});
      // Prefill the name from the catalog's top-ranked name.
      const nm = (p.fields?.name?.[0]?.value) || m.official_name || "";
      if (nm) setName(nm);
    } catch {
      setProfileFields({});
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const top = (f: string): string => profileFields[f]?.[0]?.value || "";
  const tagVals = (profileFields.tag || []).map((t) => t.value);

  const canSave = name.trim().length > 0 && !saving;

  const doSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Give the item a name (or import one from a match).");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(),
        model_numbers: model.trim() ? [model.trim()] : [],
        dealer_name: dealer.trim(),
        purchase_date: dateIso || "",
        cost: price ? Number(price) || 0 : 0,
      };
      if (selected) {
        if (imp.brand) payload.brand = selected.brand || top("brand");
        if (imp.category) payload.category_name = top("category");
        if (imp.tags && tagVals.length) payload.tag_names = tagVals;
        if (imp.msrp && top("msrp")) payload.msrp_price = Number(top("msrp")) || 0;
        if (imp.consumable) payload.is_consumable = top("consumable") === "Yes";
      }
      const created = await api.createTool(payload);
      // Open the full item so they can add anything else (photos, warranty…).
      router.replace(`/tool/${created.id}?startEdit=1` as any);
    } catch (e: any) {
      Alert.alert("Couldn't add item", String(e?.message || e));
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, model, dealer, dateIso, price, selected, imp, profileFields]);

  const Check = ({ k, label, value, count }: { k: keyof typeof imp; label: string; value: string; count?: number }) => {
    if (!value) return null;
    const on = imp[k];
    return (
      <TouchableOpacity
        style={styles.checkRow}
        activeOpacity={0.7}
        onPress={() => setImp((s) => ({ ...s, [k]: !s[k] }))}
        testID={`imp-${k}`}
      >
        <Ionicons
          name={on ? "checkbox" : "square-outline"}
          size={20}
          color={on ? theme.colors.accent : theme.colors.textMuted}
        />
        <Text style={styles.checkLabel}>{label}</Text>
        <Text style={styles.checkValue} numberOfLines={1}>{value}</Text>
        {count != null && count > 0 && <Text style={styles.count}>({count})</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <IndustrialBanner
        title="QUICK ADD"
        subtitle="Find it in the community catalog"
        onBack={() => router.back()}
        backIcon="chevron-back"
      />
      <ResponsiveContainer>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          <TouchableOpacity style={styles.browseLink} onPress={() => router.push("/community" as any)} testID="qa-browse">
            <Ionicons name="library-outline" size={16} color={theme.colors.accent} />
            <Text style={styles.browseLinkText}>Browse the community catalog</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.accent} />
          </TouchableOpacity>

          {/* Model # */}
          <Text style={styles.label}>MODEL / PART #</Text>
          <View style={styles.inputRow}>
            <Ionicons name="barcode-outline" size={18} color={theme.colors.textSecondary} />
            <TextInput
              testID="qa-model"
              value={model}
              onChangeText={setModel}
              placeholder="e.g. 2554-20"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {looking && <ActivityIndicator size="small" color={theme.colors.accent} />}
          </View>

          {/* Lookup result */}
          {branch === "none" && model.trim().length >= 2 && !looking && (
            <View style={styles.infoBox}>
              <Ionicons name="sparkles-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.infoText}>
                No community match yet. Add it below and you{"'"}ll help build the catalog for everyone.
              </Text>
            </View>
          )}

          {branch === "multiple" && !selected && (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.hint}>Multiple products use this number — pick yours:</Text>
              {matches.map((m) => (
                <TouchableOpacity key={m.profile_key} style={styles.matchCard} onPress={() => selectMatch(m)} testID={`qa-match-${m.brand}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchBrand}>{m.brand || "Unknown brand"}</Text>
                    <Text style={styles.matchName} numberOfLines={1}>{m.official_name || m.model}</Text>
                  </View>
                  <Text style={styles.matchCount}>{m.contributor_count} users</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {selected && (
            <View style={styles.importBox}>
              <View style={styles.importHead}>
                <Ionicons name="people" size={16} color={theme.colors.accent} />
                <Text style={styles.importTitle}>
                  {selected.brand ? `${selected.brand} · ` : ""}Community match ({selected.contributor_count} users)
                </Text>
                {branch === "multiple" && (
                  <TouchableOpacity onPress={() => { setSelected(null); setProfileFields({}); }}>
                    <Text style={styles.changeLink}>Change</Text>
                  </TouchableOpacity>
                )}
              </View>
              {loadingProfile ? (
                <ActivityIndicator color={theme.colors.accent} style={{ marginVertical: 12 }} />
              ) : (
                <>
                  <Text style={styles.importHint}>Import which details?</Text>
                  <Check k="name" label="Name" value={top("name")} count={profileFields.name?.[0]?.count} />
                  <Check k="brand" label="Brand" value={selected.brand || top("brand")} />
                  <Check k="category" label="Category" value={top("category")} count={profileFields.category?.[0]?.count} />
                  <Check k="tags" label="Tags" value={tagVals.join(", ")} />
                  <Check k="msrp" label="MSRP" value={top("msrp") ? `$${top("msrp")}` : ""} count={profileFields.msrp?.[0]?.count} />
                  <Check k="consumable" label="Consumable" value={top("consumable")} />
                </>
              )}
            </View>
          )}

          {/* Item name (editable, prefilled from import) */}
          <Text style={styles.label}>ITEM NAME</Text>
          <View style={styles.inputRow}>
            <Ionicons name="construct-outline" size={18} color={theme.colors.textSecondary} />
            <TextInput
              testID="qa-name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Impact Wrench"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />
          </View>

          {/* Personal fields */}
          <Text style={styles.label}>DEALER (optional)</Text>
          <View style={styles.inputRow}>
            <Ionicons name="business-outline" size={18} color={theme.colors.textSecondary} />
            <TextInput
              testID="qa-dealer"
              value={dealer}
              onChangeText={setDealer}
              placeholder="e.g. Snap-on truck"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />
          </View>

          <Text style={styles.label}>PURCHASE DATE (optional)</Text>
          <DateField value={dateIso} onChange={setDateIso} placeholder="MM/DD/YYYY" />

          <Text style={styles.label}>PURCHASE PRICE (optional)</Text>
          <View style={styles.inputRow}>
            <Ionicons name="cash-outline" size={18} color={theme.colors.textSecondary} />
            <TextInput
              testID="qa-price"
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              keyboardType="decimal-pad"
            />
          </View>

          <TouchableOpacity
            testID="qa-save"
            style={[styles.saveBtn, !canSave && { opacity: 0.5 }]}
            disabled={!canSave}
            onPress={doSave}
          >
            {saving ? (
              <ActivityIndicator color={theme.colors.bg} />
            ) : (
              <>
                <Ionicons name="add-circle" size={18} color={theme.colors.bg} />
                <Text style={styles.saveText}>ADD TO MY INVENTORY</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  label: { color: c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginTop: 16, marginBottom: 6 },
  browseLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  browseLinkText: { flex: 1, color: c.accent, fontSize: 13, fontWeight: "700" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  input: { flex: 1, color: c.textPrimary, fontSize: 14, padding: 0 },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: c.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  infoText: { flex: 1, color: c.textSecondary, fontSize: 12.5, lineHeight: 18 },
  hint: { color: c.textSecondary, fontSize: 12.5, marginBottom: 6 },
  matchCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    padding: 12,
    marginBottom: 8,
  },
  matchBrand: { color: c.accent, fontSize: 13, fontWeight: "800" },
  matchName: { color: c.textPrimary, fontSize: 13, marginTop: 2 },
  matchCount: { color: c.textMuted, fontSize: 11 },
  importBox: {
    backgroundColor: c.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.accent + "55",
    padding: 12,
    marginTop: 10,
  },
  importHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  importTitle: { flex: 1, color: c.textPrimary, fontSize: 13, fontWeight: "800" },
  changeLink: { color: c.accent, fontSize: 12, fontWeight: "700" },
  importHint: { color: c.textMuted, fontSize: 11, marginTop: 8, marginBottom: 4 },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  checkLabel: { color: c.textSecondary, fontSize: 12.5, width: 78 },
  checkValue: { flex: 1, color: c.textPrimary, fontSize: 13, fontWeight: "600" },
  count: { color: c.textMuted, fontSize: 11 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.accent,
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 24,
  },
  saveText: { color: c.bg, fontSize: 14, fontWeight: "900", letterSpacing: 0.6 },
}));
