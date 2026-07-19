import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { IndustrialBanner } from "../src/components/IndustrialBanner";
import { SkinPlate } from "../src/components/SkinPlate";
import { DateField } from "../src/DateField";
import { themedStyles } from "../src/themeContext";
import { theme } from "../src/theme";
import { api } from "../src/api";

type Match = {
  profile_key: string;
  brand: string;
  model: string;
  official_name: string;
  is_bundle?: boolean;
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
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [dealerName, setDealerName] = useState("");
  const [dealers, setDealers] = useState<any[]>([]);
  const [showDealerModal, setShowDealerModal] = useState(false);
  const [newDealerName, setNewDealerName] = useState("");
  const [dateIso, setDateIso] = useState("");
  const [price, setPrice] = useState("");
  const [isBundle, setIsBundle] = useState(false);

  const [looking, setLooking] = useState(false);
  const [branch, setBranch] = useState<"none" | "one" | "multiple" | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [expanded, setExpanded] = useState(false);

  const [selected, setSelected] = useState<Match | null>(null);
  const [profileFields, setProfileFields] = useState<Record<string, FieldOpt[]>>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  // Which imported fields are checked.
  const [imp, setImp] = useState({
    name: true, brand: true, category: true, tags: true, msrp: true, consumable: true,
  });

  const [saving, setSaving] = useState(false);
  const debounce = useRef<any>(null);

  // Load the user's dealers for the dealer picker.
  useEffect(() => {
    api.listDealers().then((d: any[]) => setDealers(d || [])).catch(() => {});
  }, []);

  // Debounced lookup as the model # is typed.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const m = model.trim();
    setSelected(null);
    setProfileFields({});
    setExpanded(false);
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
      } catch {
        setBranch("none");
        setMatches([]);
      } finally {
        setLooking(false);
      }
    }, 450);
    return () => debounce.current && clearTimeout(debounce.current);
  }, [model]);

  // When a catalog match includes a dealer, try to match it to the user's own
  // dealers; walk them through picking an existing one or creating it.
  const reconcileDealer = useCallback((catalogDealer: string) => {
    const dn = (catalogDealer || "").trim();
    if (!dn) return;
    const exact = dealers.find((d) => (d.name || "").trim().toLowerCase() === dn.toLowerCase());
    if (exact) {
      setDealerId(exact.id);
      setDealerName(exact.name);
      return;
    }
    Alert.alert(
      "Dealer from community",
      `This product is commonly bought from "${dn}", which isn't in your dealer list. Do you have this dealer saved under a different name?`,
      [
        { text: "Yes — pick mine", onPress: () => setShowDealerModal(true) },
        {
          text: `Create "${dn}"`,
          onPress: async () => {
            try {
              const created = await api.createDealer({ name: dn });
              setDealers((prev) => [...prev, created]);
              setDealerId(created.id);
              setDealerName(created.name);
            } catch (e: any) {
              Alert.alert("Couldn't create dealer", String(e?.message || e));
            }
          },
        },
        { text: "Skip", style: "cancel" },
      ],
    );
  }, [dealers]);

  const selectMatch = useCallback(async (m: Match) => {
    setSelected(m);
    setExpanded(true);
    if (m.is_bundle) setIsBundle(true); // auto-flag bundles
    setLoadingProfile(true);
    try {
      const p = await api.communityProfile(m.profile_key);
      setProfileFields(p.fields || {});
      const nm = (p.fields?.name?.[0]?.value) || m.official_name || "";
      if (nm) setName(nm);
      const catalogDealer = p.fields?.dealer?.[0]?.value || "";
      if (catalogDealer) reconcileDealer(catalogDealer);
    } catch {
      setProfileFields({});
    } finally {
      setLoadingProfile(false);
    }
  }, [reconcileDealer]);

  const top = (f: string): string => profileFields[f]?.[0]?.value || "";
  const tagVals = (profileFields.tag || []).map((t) => t.value);

  const canSave = name.trim().length > 0 && !saving;

  const createDealerFromInput = useCallback(async () => {
    const nm = newDealerName.trim();
    if (!nm) return;
    try {
      const created = await api.createDealer({ name: nm });
      setDealers((prev) => [...prev, created]);
      setDealerId(created.id);
      setDealerName(created.name);
      setNewDealerName("");
      setShowDealerModal(false);
    } catch (e: any) {
      Alert.alert("Couldn't create dealer", String(e?.message || e));
    }
  }, [newDealerName]);

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
        dealer_id: dealerId,
        dealer_name: dealerName,
        purchase_date: dateIso || "",
        cost: price ? Number(price) || 0 : 0,
        is_bundle: isBundle,
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
  }, [name, model, dealerId, dealerName, dateIso, price, isBundle, selected, imp, profileFields]);

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
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        contentContainerStyle={{ padding: 14, paddingBottom: 160 }}
      >
        <TouchableOpacity style={styles.browseLink} onPress={() => router.push("/community" as any)} testID="qa-browse">
          <Ionicons name="library-outline" size={16} color={theme.colors.accent} />
          <Text style={styles.browseLinkText}>Browse the community catalog</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.accent} />
        </TouchableOpacity>

        <SkinPlate frame="window" style={styles.panel} padX={14} padTop={6} padBottom={16}>
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

          {/* Match indicator — shows right below the model # field */}
          {model.trim().length >= 2 && !looking && branch === "none" && (
            <View style={styles.noMatch} testID="qa-nomatch">
              <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
              <Text style={styles.noMatchText}>
                NO MATCH FOUND — add it below and you{"'"}ll help build the catalog.
              </Text>
            </View>
          )}

          {model.trim().length >= 2 && !looking && (branch === "one" || branch === "multiple") && (
            <>
              <TouchableOpacity
                style={styles.matchFound}
                testID="qa-match-toggle"
                onPress={() => {
                  const next = !expanded;
                  setExpanded(next);
                  if (next && branch === "one" && !selected && matches[0]) selectMatch(matches[0]);
                }}
              >
                <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
                <Text style={styles.matchFoundText}>
                  MATCH FOUND{branch === "multiple" ? ` (${matches.length})` : ""}
                </Text>
                <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={theme.colors.accent} />
              </TouchableOpacity>

              {expanded && !selected && (
                <View style={{ marginTop: 8 }}>
                  {branch === "multiple" && <Text style={styles.hint}>Pick the one that matches yours:</Text>}
                  {matches.map((m) => (
                    <TouchableOpacity key={m.profile_key} style={styles.matchCard} onPress={() => selectMatch(m)} testID={`qa-match-${m.brand}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.matchBrand}>{m.brand || "Unknown brand"}{m.is_bundle ? "  ·  SET" : ""}</Text>
                        <Text style={styles.matchName} numberOfLines={1}>{m.official_name || m.model}</Text>
                      </View>
                      <Text style={styles.matchCount}>{m.contributor_count} users</Text>
                      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {expanded && selected && (
                <View style={styles.importBox}>
                  <View style={styles.importHead}>
                    <Ionicons name="people" size={16} color={theme.colors.accent} />
                    <Text style={styles.importTitle}>
                      {selected.brand ? `${selected.brand} · ` : ""}Match ({selected.contributor_count} users){selected.is_bundle ? " · SET" : ""}
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
            </>
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

          {/* Dealer — picker (not a text field): select existing or add new */}
          <Text style={styles.label}>DEALER (optional)</Text>
          <TouchableOpacity style={styles.inputRow} onPress={() => setShowDealerModal(true)} testID="qa-dealer">
            <Ionicons name="business-outline" size={18} color={theme.colors.textSecondary} />
            <Text style={[styles.input, !dealerName && { color: theme.colors.textMuted }]} numberOfLines={1}>
              {dealerName || "Select dealer"}
            </Text>
            {dealerName ? (
              <TouchableOpacity onPress={() => { setDealerId(null); setDealerName(""); }} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
            )}
          </TouchableOpacity>

          {/* Bundle / Set flag */}
          <TouchableOpacity style={styles.bundleRow} onPress={() => setIsBundle((b) => !b)} testID="qa-bundle">
            <Ionicons name={isBundle ? "checkbox" : "square-outline"} size={22} color={isBundle ? theme.colors.accent : theme.colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bundleLabel}>This is a Set / Bundle</Text>
              <Text style={styles.bundleSub}>Save as a set of items instead of a single tool</Text>
            </View>
          </TouchableOpacity>

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
        </SkinPlate>

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
      </KeyboardAwareScrollView>

      {/* Dealer picker */}
      <Modal visible={showDealerModal} transparent animationType="slide" onRequestClose={() => setShowDealerModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>SELECT DEALER</Text>
              <TouchableOpacity onPress={() => setShowDealerModal(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.addDealerRow}>
              <Ionicons name="add-circle" size={20} color={theme.colors.accent} />
              <TextInput
                testID="qa-new-dealer-input"
                value={newDealerName}
                onChangeText={setNewDealerName}
                placeholder="Add new dealer…"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.addDealerInput}
              />
              {newDealerName.trim().length > 0 && (
                <TouchableOpacity testID="qa-add-dealer" onPress={createDealerFromInput} style={styles.addDealerBtn}>
                  <Text style={styles.addDealerBtnText}>ADD</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={{ maxHeight: 340 }}>
              {dealers.length === 0 ? (
                <Text style={styles.dealerEmpty}>No dealers yet — add one above.</Text>
              ) : (
                dealers.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={styles.dealerRow}
                    testID={`qa-dealer-opt-${d.id}`}
                    onPress={() => { setDealerId(d.id); setDealerName(d.name); setShowDealerModal(false); }}
                  >
                    <Ionicons name="business" size={16} color={theme.colors.textSecondary} />
                    <Text style={styles.dealerRowText} numberOfLines={1}>{d.name}</Text>
                    {dealerId === d.id && <Ionicons name="checkmark-circle" size={18} color={theme.colors.accent} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  panel: { marginTop: 12 },
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
  noMatch: {
    flexDirection: "row", gap: 8, alignItems: "center",
    backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 12, marginTop: 10,
  },
  noMatchText: { flex: 1, color: c.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  matchFound: {
    flexDirection: "row", gap: 8, alignItems: "center",
    backgroundColor: c.success + "1A", borderWidth: 1, borderColor: c.success + "66",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginTop: 10,
  },
  matchFoundText: { flex: 1, color: c.success, fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  bundleRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 12, marginTop: 16,
  },
  bundleLabel: { color: c.textPrimary, fontSize: 13.5, fontWeight: "800" },
  bundleSub: { color: c.textMuted, fontSize: 11, marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  modalTitle: { color: c.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 0.8 },
  addDealerRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
  },
  addDealerInput: { flex: 1, color: c.textPrimary, fontSize: 14, padding: 0 },
  addDealerBtn: { backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addDealerBtnText: { color: c.bg, fontSize: 12, fontWeight: "900" },
  dealerRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSubtle,
  },
  dealerRowText: { flex: 1, color: c.textPrimary, fontSize: 14 },
  dealerEmpty: { color: c.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 20 },
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
