import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, TextInput, Modal, ScrollView,
  ActivityIndicator, Alert, StyleSheet, Platform, KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { theme } from "../../theme";
import { themedStyles } from "../../themeContext";
import { api } from "../../api";
import { AppImage } from "../../components/AppImage";
import { PillButton } from "../../components/PillButton";
import { compressToDataUri } from "../../lib/imageCompress";

const money = (n: any) => `$${(Number(n) || 0).toFixed(2)}`;

type InsideForm = { id: string | null; name: string; model: string; cost: string; photo: string };
const EMPTY_FORM: InsideForm = { id: null, name: "", model: "", cost: "", photo: "" };

/**
 * BundleTab — the "Bundle" tab content on the item-detail screen.
 * Handles BOTH:
 *  - when the item IS a bundle (is_bundle): manage inside items + expansion items
 *  - when the item is an expansion add-on (expansion_of): show the parent set
 */
export function BundleTab({
  bundle,
  onChanged,
  boxStyle,
  editing = false,
}: {
  bundle: any;
  onChanged: () => void;          // reload the parent tool
  boxStyle: any;
  editing?: boolean;              // edit/delete controls only show in edit mode
}) {
  const isBundle = !!bundle?.is_bundle;
  const insideItems: any[] = bundle?.inside_items || [];

  // ---------- expansion items ----------
  const [expItems, setExpItems] = useState<any[]>([]);
  const [expLoading, setExpLoading] = useState(false);
  const loadExpansion = useCallback(async () => {
    if (!isBundle) return;
    setExpLoading(true);
    try {
      const list = await api.listExpansionItems(bundle.id, { forceFresh: true } as any);
      setExpItems(Array.isArray(list) ? list : []);
    } catch { setExpItems([]); }
    finally { setExpLoading(false); }
  }, [bundle?.id, isBundle]);

  useEffect(() => { loadExpansion(); }, [loadExpansion]);

  // ---------- inside-item add/edit modal ----------
  const [form, setForm] = useState<InsideForm>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (it: any) => {
    setForm({ id: it.id, name: it.name || "", model: it.model || "", cost: it.cost != null ? String(it.cost) : "", photo: it.photo || "" });
    setShowForm(true);
  };

  const pickInsidePhoto = async (src: "camera" | "library") => {
    try {
      const perm = src === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert("Permission needed", `Please grant ${src === "camera" ? "camera" : "photo library"} access.`); return; }
      const opts: any = { quality: 0.6, base64: true };
      const res = src === "camera"
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync({ ...opts, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (res.canceled || !res.assets?.[0]) return;
      const data = await compressToDataUri(res.assets[0].uri);
      setForm((f) => ({ ...f, photo: data }));
    } catch (e: any) { Alert.alert("Error", e.message || "Could not pick photo"); }
  };

  const promptInsidePhoto = () => {
    Alert.alert("Item photo", "Choose source", [
      { text: "Take Photo", onPress: () => pickInsidePhoto("camera") },
      { text: "Choose from Library", onPress: () => pickInsidePhoto("library") },
      ...(form.photo ? [{ text: "Remove photo", style: "destructive" as const, onPress: () => setForm((f) => ({ ...f, photo: "" })) }] : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const saveInside = async () => {
    if (!form.name.trim()) { Alert.alert("Name required", "Give this item a name."); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), model: form.model.trim(), cost: parseFloat(form.cost || "0") || 0, photo: form.photo };
      if (form.id) await api.updateInsideItem(bundle.id, form.id, payload);
      else await api.addInsideItem(bundle.id, payload);
      setShowForm(false);
      onChanged();
    } catch (e: any) { Alert.alert("Error", String(e?.message || e)); }
    finally { setSaving(false); }
  };

  const deleteInside = (it: any) => {
    Alert.alert("Remove item", `Remove "${it.name || "this item"}" from the set?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try { await api.deleteInsideItem(bundle.id, it.id); onChanged(); }
        catch (e: any) { Alert.alert("Error", String(e?.message || e)); }
      } },
    ]);
  };

  // ---------- expansion picker ----------
  const [showPicker, setShowPicker] = useState(false);
  const [pickerItems, setPickerItems] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [search, setSearch] = useState("");

  const openPicker = async () => {
    setShowPicker(true);
    setPickerLoading(true);
    try {
      const list = await api.listTools({}, { forceFresh: true } as any);
      const linkedIds = new Set(expItems.map((e) => e.id));
      const filtered = (Array.isArray(list) ? list : []).filter(
        (t) => !t.is_bundle && t.id !== bundle.id && !t.expansion_of && !linkedIds.has(t.id),
      );
      setPickerItems(filtered);
    } catch { setPickerItems([]); }
    finally { setPickerLoading(false); }
  };

  const link = async (toolId: string) => {
    try {
      await api.linkExpansionItem(bundle.id, toolId);
      setShowPicker(false); setSearch("");
      loadExpansion();
    } catch (e: any) { Alert.alert("Error", String(e?.message || e)); }
  };

  const unlink = (it: any) => {
    Alert.alert("Remove add-on", `Remove "${it.name}" from this set's expansion items? The item stays in your inventory.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try { await api.unlinkExpansionItem(bundle.id, it.id); loadExpansion(); }
        catch (e: any) { Alert.alert("Error", String(e?.message || e)); }
      } },
    ]);
  };

  // ---------- absorb-from-inventory picker (moves a standalone tool INTO the set) ----------
  const [showAbsorb, setShowAbsorb] = useState(false);
  const [absorbItems, setAbsorbItems] = useState<any[]>([]);
  const [absorbLoading, setAbsorbLoading] = useState(false);
  const [absorbSearch, setAbsorbSearch] = useState("");
  const [absorbBusy, setAbsorbBusy] = useState(false);

  const openAbsorbPicker = async () => {
    setShowAbsorb(true);
    setAbsorbLoading(true);
    try {
      const list = await api.listTools({}, { forceFresh: true } as any);
      const filtered = (Array.isArray(list) ? list : []).filter(
        (t) => !t.is_bundle && t.id !== bundle.id,
      );
      setAbsorbItems(filtered);
    } catch { setAbsorbItems([]); }
    finally { setAbsorbLoading(false); }
  };

  const absorb = (t: any) => {
    Alert.alert(
      "Move into set?",
      `"${t.name || "This item"}" will be moved into this set and removed from your standalone inventory. Its photo, model and price are kept. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Move In",
          style: "destructive",
          onPress: async () => {
            setAbsorbBusy(true);
            try {
              await api.absorbToolIntoBundle(bundle.id, t.id);
              setShowAbsorb(false);
              setAbsorbSearch("");
              onChanged();
            } catch (e: any) { Alert.alert("Error", String(e?.message || e)); }
            finally { setAbsorbBusy(false); }
          },
        },
      ],
    );
  };

  // ---------- expansion-only view (item IS an add-on) ----------
  if (!isBundle) {
    if (!bundle?.expansion_of) {
      return (
        <View style={{ gap: 12 }}>
          <View style={boxStyle}>
            <View style={{ alignItems: "center", paddingVertical: 16, gap: 8 }}>
              <Ionicons name="cube-outline" size={36} color={theme.colors.textMuted} />
              <Text style={s.muted}>This item isn’t part of a set.</Text>
            </View>
          </View>
        </View>
      );
    }
    return <ExpansionParent expansionOf={bundle.expansion_of} boxStyle={boxStyle} />;
  }

  const expTotal = expItems.reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
  const setPrice = Number(bundle.cost) || 0;

  return (
    <View style={{ gap: 12 }}>
      {/* INSIDE ITEMS */}
      <View style={boxStyle}>
        <View style={s.headerRow}>
          <Text style={[s.sectionLabel, { flexShrink: 1 }]} numberOfLines={1}>ITEMS IN THIS SET{insideItems.length ? ` (${insideItems.length})` : ""}</Text>
          {editing && (
            <View style={s.headerBtns}>
              <PillButton testID="absorb-inventory-btn" label="FROM INVENTORY" icon="albums" variant="active" compact onPress={openAbsorbPicker} />
              <PillButton testID="add-inside-item-btn" label="NEW" icon="add-circle" variant="active" compact onPress={openAdd} />
            </View>
          )}
        </View>
        {insideItems.length === 0 ? (
          <Text style={s.empty}>No items yet. Add the individual pieces that come in this set (e.g. each socket).</Text>
        ) : (
          insideItems.map((it: any) => (
            <View key={it.id} style={s.row} testID={`inside-item-${it.id}`}>
              {it.photo ? <AppImage source={{ uri: it.photo }} style={s.thumb} /> : (
                <View style={[s.thumb, s.thumbEmpty]}><Ionicons name="ellipse-outline" size={16} color={theme.colors.accent} /></View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowName} numberOfLines={1}>{it.name || "Unnamed"}</Text>
                <Text style={s.rowSub} numberOfLines={1}>
                  {it.model ? `#${it.model}` : "No model #"}{it.cost ? `  ·  ${money(it.cost)}` : ""}
                </Text>
              </View>
              {editing && (
                <>
                  <TouchableOpacity testID={`inside-edit-${it.id}`} onPress={() => openEdit(it)} hitSlop={8} style={s.iconBtn}>
                    <Ionicons name="pencil" size={16} color={theme.colors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity testID={`inside-del-${it.id}`} onPress={() => deleteInside(it)} hitSlop={8} style={s.iconBtn}>
                    <Ionicons name="trash" size={16} color={theme.colors.danger} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          ))
        )}
      </View>

      {/* EXPANSION ITEMS */}
      <View style={boxStyle}>
        <View style={s.headerRow}>
          <Text style={s.sectionLabel}>EXPANSION ITEMS{expItems.length ? ` (${expItems.length})` : ""}</Text>
          {editing && <PillButton testID="add-expansion-btn" label="ADD" icon="add-circle" variant="active" compact onPress={openPicker} />}
        </View>
        <Text style={[s.empty, { marginBottom: expItems.length ? 6 : 0 }]}>
          Add-ons you bought later for this set. They stay in your inventory and show here too.
        </Text>
        {expLoading ? <ActivityIndicator color={theme.colors.accent} style={{ marginVertical: 10 }} /> : (
          expItems.map((it: any) => (
            <View key={it.id} style={s.row} testID={`expansion-item-${it.id}`}>
              {it.photos?.[0] ? <AppImage source={{ uri: it.photos[0] }} style={s.thumb} /> : (
                <View style={[s.thumb, s.thumbEmpty]}><Ionicons name="add-circle-outline" size={16} color={theme.colors.accent} /></View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowName} numberOfLines={1}>{it.name || "Unnamed"}</Text>
                <Text style={s.rowSub} numberOfLines={1}>{it.cost ? money(it.cost) : "No price"}</Text>
              </View>
              {editing && (
                <TouchableOpacity testID={`expansion-unlink-${it.id}`} onPress={() => unlink(it)} hitSlop={8} style={s.iconBtn}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          ))
        )}

        {/* TOTALS */}
        <View style={s.totalsWrap}>
          <View style={s.totalRow}><Text style={s.totalLabel}>Set price</Text><Text style={s.totalVal}>{money(setPrice)}</Text></View>
          <View style={s.totalRow}><Text style={s.totalLabel}>Expansion items</Text><Text style={s.totalVal}>{money(expTotal)}</Text></View>
          <View style={[s.totalRow, s.totalRowGrand]}><Text style={s.totalLabelGrand}>COMBINED TOTAL</Text><Text style={s.totalValGrand}>{money(setPrice + expTotal)}</Text></View>
        </View>
      </View>

      {/* ADD / EDIT INSIDE ITEM MODAL */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={s.modalBg}>
            <View style={s.modalCard}>
            <Text style={s.modalTitle}>{form.id ? "EDIT ITEM" : "ADD ITEM TO SET"}</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
              <TouchableOpacity style={s.photoPick} onPress={promptInsidePhoto} testID="inside-photo-pick" activeOpacity={0.8}>
                {form.photo ? <AppImage source={{ uri: form.photo }} style={s.photoPickImg} /> : (
                  <View style={s.photoPickEmpty}><Ionicons name="camera" size={22} color={theme.colors.accent} /><Text style={s.photoPickText}>ADD PHOTO (optional)</Text></View>
                )}
              </TouchableOpacity>

              <Text style={s.fieldLabel}>NAME</Text>
              <TextInput testID="inside-name" style={s.input} value={form.name} onChangeText={(t) => setForm((f) => ({ ...f, name: t }))} placeholder="e.g. 10mm socket" placeholderTextColor={theme.colors.textMuted} />

              <Text style={s.fieldLabel}>MODEL # (optional)</Text>
              <TextInput testID="inside-model" style={s.input} value={form.model} onChangeText={(t) => setForm((f) => ({ ...f, model: t }))} placeholder="e.g. RED444" placeholderTextColor={theme.colors.textMuted} autoCapitalize="characters" />

              <Text style={s.fieldLabel}>PRICE (optional)</Text>
              <TextInput testID="inside-cost" style={s.input} value={form.cost} onChangeText={(t) => setForm((f) => ({ ...f, cost: t.replace(/[^0-9.]/g, "") }))} placeholder="0.00" placeholderTextColor={theme.colors.textMuted} keyboardType="decimal-pad" />
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={s.btnGhost} onPress={() => setShowForm(false)}><Text style={s.btnGhostText}>CANCEL</Text></TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={saveInside} disabled={saving} testID="inside-save">
                {saving ? <ActivityIndicator color="#000" /> : <Text style={s.btnPrimaryText}>{form.id ? "SAVE" : "ADD"}</Text>}
              </TouchableOpacity>
            </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* EXPANSION PICKER MODAL */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={s.modalBg}>
          <View style={[s.modalCard, { maxHeight: "85%" }]}>
            <Text style={s.modalTitle}>ADD EXPANSION ITEMS</Text>
            <View style={s.searchWrap}>
              <Ionicons name="search" size={16} color={theme.colors.textMuted} />
              <TextInput testID="expansion-search" style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search your inventory" placeholderTextColor={theme.colors.textMuted} />
            </View>
            {pickerLoading ? <ActivityIndicator color={theme.colors.accent} style={{ marginVertical: 20 }} /> : (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 440 }}>
                {pickerItems.filter((t) => {
                  const q = search.trim().toLowerCase();
                  if (!q) return true;
                  return (t.name || "").toLowerCase().includes(q) || (t.model_numbers || []).join(" ").toLowerCase().includes(q);
                }).map((t) => (
                  <TouchableOpacity key={t.id} style={s.row} testID={`picker-item-${t.id}`} onPress={() => link(t.id)} activeOpacity={0.7}>
                    {t.photos?.[0] ? <AppImage source={{ uri: t.photos[0] }} style={s.thumb} /> : (
                      <View style={[s.thumb, s.thumbEmpty]}><Ionicons name="construct" size={16} color={theme.colors.accent} /></View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.rowName} numberOfLines={1}>{t.name}</Text>
                      <Text style={s.rowSub} numberOfLines={1}>{t.cost ? money(t.cost) : "No price"}</Text>
                    </View>
                    <Ionicons name="add-circle" size={20} color={theme.colors.accent} />
                  </TouchableOpacity>
                ))}
                {pickerItems.length === 0 && <Text style={s.empty}>No eligible items. Add items to your inventory first, or items are already linked to a set.</Text>}
              </ScrollView>
            )}
            <TouchableOpacity style={[s.btnGhost, { marginTop: 12 }]} onPress={() => { setShowPicker(false); setSearch(""); }}><Text style={s.btnGhostText}>CLOSE</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ABSORB-FROM-INVENTORY PICKER MODAL */}
      <Modal visible={showAbsorb} transparent animationType="slide" onRequestClose={() => setShowAbsorb(false)}>
        <View style={s.modalBg}>
          <View style={[s.modalCard, { maxHeight: "85%" }]}>
            <Text style={s.modalTitle}>ADD ITEMS FROM INVENTORY</Text>
            <Text style={[s.empty, { marginBottom: 10 }]}>
              Pick a standalone inventory item to move into this set. It keeps its
              photo, model & price and is removed from your inventory.
            </Text>
            <View style={s.searchWrap}>
              <Ionicons name="search" size={16} color={theme.colors.textMuted} />
              <TextInput testID="absorb-search" style={s.searchInput} value={absorbSearch} onChangeText={setAbsorbSearch} placeholder="Search your inventory" placeholderTextColor={theme.colors.textMuted} />
            </View>
            {absorbLoading ? <ActivityIndicator color={theme.colors.accent} style={{ marginVertical: 20 }} /> : (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 440 }}>
                {absorbItems.filter((t) => {
                  const q = absorbSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (t.name || "").toLowerCase().includes(q) || (t.model_numbers || []).join(" ").toLowerCase().includes(q);
                }).map((t) => (
                  <TouchableOpacity key={t.id} style={s.row} testID={`absorb-item-${t.id}`} onPress={() => !absorbBusy && absorb(t)} activeOpacity={0.7} disabled={absorbBusy}>
                    {t.photos?.[0] ? <AppImage source={{ uri: t.photos[0] }} style={s.thumb} /> : (
                      <View style={[s.thumb, s.thumbEmpty]}><Ionicons name="construct" size={16} color={theme.colors.accent} /></View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.rowName} numberOfLines={1}>{t.name}</Text>
                      <Text style={s.rowSub} numberOfLines={1}>{t.cost ? money(t.cost) : "No price"}</Text>
                    </View>
                    <Ionicons name="enter" size={20} color={theme.colors.accent} />
                  </TouchableOpacity>
                ))}
                {absorbItems.length === 0 && <Text style={s.empty}>No eligible inventory items to move in. Add items to your inventory first.</Text>}
              </ScrollView>
            )}
            <TouchableOpacity style={[s.btnGhost, { marginTop: 12 }]} onPress={() => { setShowAbsorb(false); setAbsorbSearch(""); }}><Text style={s.btnGhostText}>CLOSE</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Small card shown on an EXPANSION item: which set it belongs to.
function ExpansionParent({ expansionOf, boxStyle }: { expansionOf: string; boxStyle: any }) {
  const router = useRouter();
  const [parent, setParent] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    api.getTool(expansionOf).then((p) => { if (alive) setParent(p); }).catch(() => {});
    return () => { alive = false; };
  }, [expansionOf]);
  return (
    <View style={{ gap: 12 }}>
      <View style={boxStyle}>
        <View style={s.headerRow}><Text style={s.sectionLabel}>ADD-ON TO A SET</Text></View>
        <Text style={[s.muted, { textAlign: "left", marginBottom: 10 }]}>This item is an addon to a set:</Text>
        <TouchableOpacity
          testID="expansion-parent-link"
          style={[s.row, { borderBottomWidth: 0 }]}
          activeOpacity={0.7}
          onPress={() => router.push(`/tool/${expansionOf}` as any)}
        >
          <View style={[s.thumb, s.thumbEmpty]}><Ionicons name="cube" size={16} color={theme.colors.accent} /></View>
          <Text style={[s.rowName, { color: theme.colors.accent, flex: 1 }]} numberOfLines={1}>
            {parent ? parent.name : "View set"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.accent} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = themedStyles((c) => ({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 },
  headerBtns: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" },
  sectionLabel: { color: c.textPrimary, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  empty: { color: c.textMuted, fontSize: 12, lineHeight: 18 },
  muted: { color: c.textSecondary, fontSize: 12, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  rowName: { color: c.textPrimary, fontSize: 13, fontWeight: "700" },
  rowSub: { color: c.textMuted, fontSize: 11, marginTop: 2 },
  thumb: { width: 38, height: 38, borderRadius: 6 },
  thumbEmpty: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  iconBtn: { padding: 6 },
  totalsWrap: { marginTop: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, gap: 6 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { color: c.textMuted, fontSize: 12 },
  totalVal: { color: c.textPrimary, fontSize: 12, fontWeight: "700" },
  totalRowGrand: { marginTop: 4, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 },
  totalLabelGrand: { color: c.textPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  totalValGrand: { color: c.accent, fontSize: 15, fontWeight: "900" },
  // modal
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: c.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: Platform.OS === "ios" ? 32 : 18 },
  modalTitle: { color: c.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 1.5, marginBottom: 14 },
  fieldLabel: { color: c.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: c.textPrimary, fontSize: 14 },
  photoPick: { alignSelf: "center", marginBottom: 4 },
  photoPickImg: { width: 90, height: 90, borderRadius: 10 },
  photoPickEmpty: { width: 110, height: 90, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center", gap: 4 },
  photoPickText: { color: c.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, marginBottom: 10 },
  searchInput: { flex: 1, color: c.textPrimary, fontSize: 14, paddingVertical: 10 },
  btnGhost: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: c.border },
  btnGhostText: { color: c.textPrimary, fontWeight: "800", fontSize: 13, letterSpacing: 1 },
  btnPrimary: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 8, backgroundColor: c.accent },
  btnPrimaryText: { color: "#000", fontWeight: "900", fontSize: 13, letterSpacing: 1 },
}));

export default BundleTab;
