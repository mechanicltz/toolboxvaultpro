import { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Image, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { themedStyles } from "../../src/themeContext";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";

export default function BundleEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [setPrice, setSetPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  // Items currently in this set + the pool of selectable items.
  const [items, setItems] = useState<any[]>([]);
  const [allTools, setAllTools] = useState<any[]>([]);
  const [showItemPicker, setShowItemPicker] = useState(false);
  // Ids selected in the "new bundle" flow (before the bundle exists yet).
  const [pendingItemIds, setPendingItemIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const tools = await api.listTools().catch(() => [] as any[]);
      setAllTools(Array.isArray(tools) ? tools : []);
      if (isEdit && id) {
        try {
          const b = await api.getBundle(id);
          setName(b.name || "");
          setPartNumber(b.part_number || "");
          setSetPrice(b.set_price ? String(b.set_price) : "");
          setNotes(b.notes || "");
          setPhotos(b.photos || []);
          setItems(Array.isArray(b.items) ? b.items : []);
        } catch (e: any) {
          Alert.alert("Error", e?.detail || e?.message || "Could not load set");
        }
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const pickPhoto = async (camera: boolean) => {
    try {
      const perm = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert("Permission needed"); return; }
      const opts: any = { quality: 0.5, base64: true, allowsEditing: false };
      const res = camera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync({ ...opts, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!res.canceled && res.assets[0]) {
        const a = res.assets[0];
        const dataUri = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
        setPhotos((p) => [...p, dataUri]);
      }
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  // Items available to add: not already in this set + not in another set.
  const inSetIds = new Set([...items.map((i) => i.id), ...pendingItemIds]);
  const available = allTools.filter(
    (t) => !t.bundle_id || (isEdit && t.bundle_id === id),
  );

  const removeItem = useCallback(async (toolId: string) => {
    if (isEdit && id) {
      try {
        await api.removeItemFromBundle(id, toolId);
        setItems((arr) => arr.filter((i) => i.id !== toolId));
      } catch (e: any) {
        Alert.alert("Error", e?.detail || e?.message || "Could not remove item");
      }
    } else {
      setPendingItemIds((arr) => arr.filter((x) => x !== toolId));
    }
  }, [isEdit, id]);

  const save = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter a name for this set.");
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      part_number: partNumber.trim(),
      set_price: parseFloat(setPrice) || 0,
      notes,
      photos,
    };
    try {
      if (isEdit && id) {
        await api.updateBundle(id, payload);
      } else {
        const created = await api.createBundle(payload);
        // Attach any items the user pre-selected while building the set.
        for (const tid of pendingItemIds) {
          await api.addItemToBundle(created.id, tid).catch(() => {});
        }
      }
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e?.detail || e?.message || "Could not save set");
    } finally { setSaving(false); }
  }, [name, partNumber, setPrice, notes, photos, pendingItemIds, isEdit, id, router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const pendingItems = allTools.filter((t) => pendingItemIds.includes(t.id));
  const shownItems = isEdit ? items : pendingItems;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <IndustrialBanner
          title={isEdit ? "EDIT SET" : "NEW SET"}
          subtitle={name ? String(name) : "Group items into a set / bundle"}
          leftSlot={
            <TouchableOpacity
              testID="bundle-cancel-btn"
              onPress={() => router.canGoBack() ? router.back() : router.replace("/")}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color="#F97316" />
            </TouchableOpacity>
          }
        />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.label}>SET NAME *</Text>
            <TextInput
              testID="bundle-name-input"
              placeholder="e.g. Mechanic's Socket Set"
              placeholderTextColor={theme.colors.textMuted}
              value={name} onChangeText={setName} style={styles.input}
            />

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>PART #</Text>
                <TextInput
                  testID="bundle-part-input"
                  placeholder="e.g. STMT71654"
                  placeholderTextColor={theme.colors.textMuted}
                  value={partNumber} onChangeText={setPartNumber} style={styles.input}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>SET PRICE ($)</Text>
                <TextInput
                  testID="bundle-price-input"
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.textMuted}
                  value={setPrice}
                  onChangeText={(v) => setSetPrice(v.replace(/[^0-9.]/g, "").replace(/(\..*?)\..*/g, "$1"))}
                  style={styles.input} keyboardType="decimal-pad"
                />
              </View>
            </View>

            <Text style={styles.label}>NOTES</Text>
            <TextInput
              testID="bundle-notes-input"
              placeholder="Optional notes about this set"
              placeholderTextColor={theme.colors.textMuted}
              value={notes} onChangeText={setNotes} style={[styles.input, { height: 70 }]}
              multiline
            />
          </View>

          {/* Set photo */}
          <View style={styles.card}>
            <View style={styles.cardHeadRow}>
              <Text style={styles.label}>SET PHOTO ({photos.length})</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity testID="bundle-add-photo-cam" style={styles.smallBtn} onPress={() => pickPhoto(true)}>
                  <Ionicons name="camera" size={14} color={theme.colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity testID="bundle-add-photo-lib" style={styles.smallBtn} onPress={() => pickPhoto(false)}>
                  <Ionicons name="image" size={14} color={theme.colors.accent} />
                </TouchableOpacity>
              </View>
            </View>
            {photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {photos.map((p, i) => (
                  <View key={`bp-${i}`} style={{ marginRight: 8 }}>
                    <Image source={{ uri: p }} style={styles.thumb} />
                    <TouchableOpacity
                      testID={`bundle-photo-remove-${i}`}
                      style={styles.thumbX}
                      onPress={() => setPhotos((arr) => arr.filter((_, idx) => idx !== i))}
                    >
                      <Ionicons name="close" size={12} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.helper}>Add a photo of the whole set (optional).</Text>
            )}
          </View>

          {/* Items in this set */}
          <View style={styles.card}>
            <View style={styles.cardHeadRow}>
              <Text style={styles.label}>ITEMS IN THIS SET ({shownItems.length})</Text>
              <TouchableOpacity testID="bundle-add-items-btn" style={styles.smallBtnWide} onPress={() => setShowItemPicker(true)}>
                <Ionicons name="add-circle" size={14} color={theme.colors.accent} />
                <Text style={styles.smallBtnText}>ADD ITEMS</Text>
              </TouchableOpacity>
            </View>
            {shownItems.length === 0 ? (
              <Text style={styles.helper}>
                No items yet. Tap ADD ITEMS to put existing items in this set, or save and add items later.
              </Text>
            ) : (
              shownItems.map((it) => (
                <View key={it.id} style={styles.itemRow} testID={`bundle-item-${it.id}`}>
                  <Ionicons name="construct" size={16} color={theme.colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
                    <Text style={styles.itemSub}>
                      {(it.model || it.model_numbers?.[0]) ? `${it.model || it.model_numbers[0]} · ` : ""}
                      ${it.cost || 0}
                    </Text>
                  </View>
                  <TouchableOpacity testID={`bundle-item-remove-${it.id}`} hitSlop={8} onPress={() => removeItem(it.id)}>
                    <Ionicons name="close-circle" size={20} color={theme.colors.danger} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          <TouchableOpacity testID="bundle-save-btn" style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#000" /> : (
              <Text style={styles.saveBtnText}>{isEdit ? "SAVE SET" : "CREATE SET"}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Item picker modal */}
      <Modal visible={showItemPicker} transparent animationType="slide" onRequestClose={() => setShowItemPicker(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>ADD EXISTING ITEMS</Text>
            <Text style={[styles.helper, { marginBottom: 8 }]}>
              Only items not already in a set are shown.
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {available.filter((t) => !inSetIds.has(t.id)).length === 0 ? (
                <Text style={{ color: theme.colors.textMuted, padding: 16 }}>
                  No available items. All items are already in a set.
                </Text>
              ) : (
                available.filter((t) => !inSetIds.has(t.id)).map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    testID={`pick-item-${t.id}`}
                    style={styles.itemRow}
                    onPress={async () => {
                      if (isEdit && id) {
                        try {
                          const updated = await api.addItemToBundle(id, t.id);
                          setItems((arr) => [updated, ...arr]);
                          setAllTools((arr) => arr.map((x) => x.id === t.id ? { ...x, bundle_id: id } : x));
                        } catch (e: any) {
                          Alert.alert("Error", e?.detail || e?.message || "Could not add item");
                        }
                      } else {
                        setPendingItemIds((arr) => [...arr, t.id]);
                      }
                    }}
                  >
                    <Ionicons name="add-circle" size={18} color={theme.colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName} numberOfLines={1}>{t.name}</Text>
                      <Text style={styles.itemSub}>${t.cost || 0}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.btnGhost} onPress={() => setShowItemPicker(false)}>
              <Text style={styles.btnGhostText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  card: {
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: c.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: c.surfaceAlt,
    color: c.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 6,
  },
  row2: { flexDirection: "row", gap: 10 },
  helper: { color: c.textMuted, fontSize: 12, marginTop: 8, lineHeight: 17 },
  smallBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderColor: c.accent, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 6,
  },
  smallBtnWide: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderColor: c.accent, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  smallBtnText: { color: c.accent, fontSize: 10, fontWeight: "800" },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  thumbX: {
    position: "absolute", top: -6, right: -6,
    backgroundColor: c.danger, borderRadius: 10, width: 20, height: 20,
    alignItems: "center", justifyContent: "center",
  },
  itemRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  itemName: { color: c.text, fontSize: 13, fontWeight: "700" },
  itemSub: { color: c.textMuted, fontSize: 11, marginTop: 2 },
  saveBtn: {
    backgroundColor: c.accent, borderRadius: 10, paddingVertical: 15,
    alignItems: "center", marginTop: 6,
  },
  saveBtnText: { color: "#000", fontWeight: "900", fontSize: 15, letterSpacing: 0.5 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: c.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: 20, paddingBottom: 34,
  },
  modalTitle: { color: c.text, fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
  btnGhost: { paddingVertical: 12, alignItems: "center", marginTop: 8 },
  btnGhostText: { color: c.accent, fontWeight: "800", fontSize: 13 },
}));
