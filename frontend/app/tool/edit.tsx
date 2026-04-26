import { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, Switch, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { TagInput, CategoryPicker } from "../../src/Pickers";
import { buildLocationTree, flattenLocationTree } from "../../src/locationTree";

export default function ToolEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [cost, setCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [condition, setCondition] = useState("Good");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState("");
  const [category, setCategory] = useState<{ id: string; name: string } | null>(null);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [documents, setDocuments] = useState<{ name: string; data: string; mime_type?: string }[]>([]);
  const [isConsumable, setIsConsumable] = useState(false);
  const [consumableInfo, setConsumableInfo] = useState({ store_name: "", website: "", sku: "", notes: "" });

  // Repair / Broken
  const todayStr = () => new Date().toISOString().substring(0, 10);
  const [needsRepair, setNeedsRepair] = useState(false);
  const [repairInfo, setRepairInfo] = useState({
    company_notified: "",
    notified_at: "",
    expected_completion: "",
    repair_status: "Reported",
    contact: "",
    notes: "",
  });

  // Warranty
  const [hasWarranty, setHasWarranty] = useState(false);
  const [warranty, setWarranty] = useState({
    provider: "", contact: "", terms: "", length_months: "",
    start_date: "", expiry_date: "",
  });

  // Dealer
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [dealerName, setDealerName] = useState("");
  const [purchasedAgentId, setPurchasedAgentId] = useState<string | null>(null);
  const [purchasedAgentName, setPurchasedAgentName] = useState("");
  const [showDealerPicker, setShowDealerPicker] = useState(false);

  const [locations, setLocations] = useState<any[]>([]);
  const [dealers, setDealers] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [loc, deal] = await Promise.all([api.listLocations(), api.listDealers()]);
      setLocations(loc);
      setDealers(deal);
      if (isEdit && id) {
        const t = await api.getTool(id);
        setName(t.name); setDescription(t.description || ""); setBrand(t.brand || "");
        setModel(t.model || ""); setSerial(t.serial_number || "");
        setCost(t.cost ? String(t.cost) : ""); setPurchaseDate(t.purchase_date || "");
        setCondition(t.condition || "Good"); setLocationId(t.location_id);
        setLocationName(t.location_name || "");
        setCategory(t.category_id ? { id: t.category_id, name: t.category_name } : null);
        setTags((t.tag_ids || []).map((tid: string, i: number) => ({ id: tid, name: t.tag_names?.[i] || "" })));
        setPhotos(t.photos || []); setDocuments(t.documents || []);
        setIsConsumable(!!t.is_consumable);
        if (t.consumable_info) setConsumableInfo({ ...consumableInfo, ...t.consumable_info });
        setNeedsRepair(!!t.needs_repair);
        if (t.repair_info) {
          setRepairInfo({
            company_notified: t.repair_info.company_notified || "",
            notified_at: t.repair_info.notified_at || "",
            expected_completion: t.repair_info.expected_completion || "",
            repair_status: t.repair_info.repair_status || "Reported",
            contact: t.repair_info.contact || "",
            notes: t.repair_info.notes || "",
          });
        }
        if (t.warranty?.has_warranty) {
          setHasWarranty(true);
          setWarranty({
            provider: t.warranty.provider || "",
            contact: t.warranty.contact || "",
            terms: t.warranty.terms || "",
            length_months: t.warranty.length_months ? String(t.warranty.length_months) : "",
            start_date: t.warranty.start_date || "",
            expiry_date: t.warranty.expiry_date || "",
          });
        }
        if (t.dealer_id) {
          setDealerId(t.dealer_id);
          setDealerName(t.dealer_name || "");
        }
        setPurchasedAgentId(t.purchased_from_agent_id || null);
        setPurchasedAgentName(t.purchased_from_agent_name || "");
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

  const pickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!res.canceled && res.assets[0]) {
        const a = res.assets[0];
        let base64 = "";
        if (Platform.OS === "web" && (a as any).file) {
          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
            reader.onerror = reject;
            reader.readAsDataURL((a as any).file);
          });
        } else {
          base64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
        }
        setDocuments((d) => [...d, { name: a.name, data: base64, mime_type: a.mimeType || "application/octet-stream" }]);
      }
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const computeExpiry = (startDate: string, months: string) => {
    const m = parseInt(months);
    if (!startDate || !m) return "";
    try {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + m);
      return d.toISOString().substring(0, 10);
    } catch { return ""; }
  };

  const onWarrantyChange = (k: keyof typeof warranty, v: string) => {
    const next = { ...warranty, [k]: v };
    if ((k === "start_date" || k === "length_months") && next.start_date && next.length_months) {
      next.expiry_date = computeExpiry(next.start_date, next.length_months);
    }
    setWarranty(next);
  };

  const pickDealer = (d: any | null) => {
    if (!d) {
      setDealerId(null); setDealerName(""); setPurchasedAgentId(null); setPurchasedAgentName("");
    } else {
      setDealerId(d.id); setDealerName(d.name);
      const cur = (d.agents || []).find((a: any) => a.id === d.current_agent_id);
      if (cur && !purchasedAgentId) {
        setPurchasedAgentId(cur.id); setPurchasedAgentName(cur.name);
      }
    }
    setShowDealerPicker(false);
  };

  const save = useCallback(async () => {
    if (!name.trim()) { Alert.alert("Required", "Please enter a tool name."); return; }
    setSaving(true);
    const payload: any = {
      name: name.trim(), description, brand, model, serial_number: serial,
      cost: parseFloat(cost) || 0, purchase_date: purchaseDate, condition,
      location_id: locationId, location_name: locationName,
      category_id: category?.id || null, category_name: category?.name || "",
      tag_ids: tags.map((t) => t.id), tag_names: tags.map((t) => t.name),
      photos, documents,
      is_consumable: isConsumable,
      consumable_info: isConsumable ? consumableInfo : null,
      needs_repair: needsRepair,
      repair_info: needsRepair ? {
        company_notified: repairInfo.company_notified,
        notified_at: repairInfo.notified_at,
        expected_completion: repairInfo.expected_completion,
        repair_status: repairInfo.repair_status,
        contact: repairInfo.contact,
        notes: repairInfo.notes,
      } : null,
      warranty: hasWarranty ? {
        has_warranty: true,
        provider: warranty.provider, contact: warranty.contact, terms: warranty.terms,
        length_months: parseInt(warranty.length_months) || 0,
        start_date: warranty.start_date, expiry_date: warranty.expiry_date,
      } : { has_warranty: false },
      dealer_id: dealerId, dealer_name: dealerName,
      purchased_from_agent_id: purchasedAgentId,
      purchased_from_agent_name: purchasedAgentName,
    };
    try {
      if (isEdit && id) await api.updateTool(id, payload);
      else await api.createTool(payload);
      router.back();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setSaving(false); }
  }, [name, description, brand, model, serial, cost, purchaseDate, condition, locationId, locationName, category, tags, photos, documents, isConsumable, consumableInfo, needsRepair, repairInfo, hasWarranty, warranty, dealerId, dealerName, purchasedAgentId, purchasedAgentName, isEdit, id, router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const dealer = dealers.find((d) => d.id === dealerId);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <TouchableOpacity testID="cancel-btn" onPress={() => router.back()}>
            <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>{isEdit ? "EDIT TOOL" : "NEW TOOL"}</Text>
          <TouchableOpacity testID="save-tool-btn" onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={theme.colors.accent} /> : <Text style={styles.saveText}>SAVE</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>NAME *</Text>
          <TextInput testID="name-input" placeholder="Cordless Drill" placeholderTextColor={theme.colors.textMuted}
            value={name} onChangeText={setName} style={styles.input} />

          <Text style={styles.label}>DESCRIPTION</Text>
          <TextInput testID="desc-input" placeholder="Detailed notes..." placeholderTextColor={theme.colors.textMuted}
            value={description} onChangeText={setDescription}
            style={[styles.input, { height: 90, textAlignVertical: "top" }]} multiline />

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>BRAND</Text>
              <TextInput testID="brand-input" placeholder="DeWalt" placeholderTextColor={theme.colors.textMuted}
                value={brand} onChangeText={setBrand} style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>MODEL</Text>
              <TextInput testID="model-input" placeholder="DCD777" placeholderTextColor={theme.colors.textMuted}
                value={model} onChangeText={setModel} style={styles.input} />
            </View>
          </View>

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>SERIAL #</Text>
              <TextInput testID="serial-input" placeholder="ABC-1234" placeholderTextColor={theme.colors.textMuted}
                value={serial} onChangeText={setSerial} style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>COST ($)</Text>
              <TextInput testID="cost-input" placeholder="0.00" placeholderTextColor={theme.colors.textMuted}
                value={cost} onChangeText={setCost} style={styles.input} keyboardType="decimal-pad" />
            </View>
          </View>

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>PURCHASED</Text>
              <TextInput testID="purchase-input" placeholder="2024-05-15" placeholderTextColor={theme.colors.textMuted}
                value={purchaseDate} onChangeText={setPurchaseDate} style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>CONDITION</Text>
              <TextInput testID="condition-input" placeholder="Good" placeholderTextColor={theme.colors.textMuted}
                value={condition} onChangeText={setCondition} style={styles.input} />
            </View>
          </View>

          <Text style={styles.label}>CATEGORY</Text>
          <CategoryPicker selected={category} onChange={setCategory} />

          <Text style={styles.label}>TAGS</Text>
          <TagInput selected={tags} onChange={setTags} />

          <Text style={styles.label}>LOCATION</Text>
          {locations.length === 0 ? (
            <Text style={styles.helper}>No locations yet. Add some in More → Locations.</Text>
          ) : (
            <View>
              <TouchableOpacity
                testID="loc-clear"
                style={[styles.locRow, !locationId && styles.locRowActive]}
                onPress={() => { setLocationId(null); setLocationName(""); }}
              >
                <Ionicons name="ban" size={14} color={theme.colors.textMuted} />
                <Text style={[styles.locText, { color: theme.colors.textMuted }]}>NONE</Text>
              </TouchableOpacity>
              {flattenLocationTree(buildLocationTree(locations)).map((n) => (
                <TouchableOpacity
                  key={n.id}
                  testID={`pick-loc-${n.id}`}
                  style={[
                    styles.locRow,
                    { paddingLeft: 14 + n.depth * 16 },
                    locationId === n.id && styles.locRowActive,
                  ]}
                  onPress={() => { setLocationId(n.id); setLocationName(n.path); }}
                >
                  <Ionicons
                    name={n.children.length > 0 ? "folder" : "location"}
                    size={14}
                    color={locationId === n.id ? "#000" : theme.colors.accent}
                  />
                  <Text style={[styles.locText, locationId === n.id && { color: "#000" }]}>
                    {n.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Dealer */}
          <Text style={styles.label}>DEALER</Text>
          <TouchableOpacity testID="pick-dealer-btn" style={styles.pickerRow} onPress={() => setShowDealerPicker(true)}>
            <Ionicons name="briefcase" size={18} color={theme.colors.accent} />
            <Text style={[styles.pickerText, !dealerName && { color: theme.colors.textMuted }]}>
              {dealerName || "Select dealer (optional)"}
            </Text>
            {dealerName ? (
              <TouchableOpacity onPress={() => pickDealer(null)} hitSlop={8}>
                <Ionicons name="close" size={18} color={theme.colors.danger} />
              </TouchableOpacity>
            ) : (
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            )}
          </TouchableOpacity>
          {dealer && (dealer.agents || []).length > 0 && (
            <>
              <Text style={[styles.label, { fontSize: 9 }]}>PURCHASED FROM AGENT (snapshot)</Text>
              <View style={styles.chipWrap}>
                {(dealer.agents || []).map((a: any) => (
                  <TouchableOpacity key={a.id} testID={`pick-agent-${a.id}`}
                    style={[styles.chip, purchasedAgentId === a.id && styles.chipActive]}
                    onPress={() => { setPurchasedAgentId(a.id); setPurchasedAgentName(a.name); }}>
                    <Text style={[styles.chipText, purchasedAgentId === a.id && styles.chipTextActive]}>
                      {a.name}{a.id === dealer.current_agent_id ? " ★" : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Consumable */}
          <View style={styles.toggleRow}>
            <Ionicons name="repeat" size={20} color={theme.colors.accent} />
            <Text style={styles.toggleText}>CONSUMABLE ITEM</Text>
            <Switch testID="toggle-consumable" value={isConsumable} onValueChange={setIsConsumable}
              trackColor={{ true: theme.colors.accent, false: theme.colors.border }} thumbColor="#fff" />
          </View>
          {isConsumable && (
            <View style={styles.subSection}>
              <Text style={[styles.label, { marginTop: 0 }]}>STORE / WHERE TO BUY</Text>
              <TextInput testID="cons-store" placeholder="Home Depot, Amazon..." placeholderTextColor={theme.colors.textMuted}
                value={consumableInfo.store_name} style={styles.input}
                onChangeText={(v) => setConsumableInfo({ ...consumableInfo, store_name: v })} />
              <Text style={styles.label}>WEBSITE / LINK</Text>
              <TextInput testID="cons-website" placeholder="https://..." placeholderTextColor={theme.colors.textMuted}
                value={consumableInfo.website} style={styles.input} autoCapitalize="none"
                onChangeText={(v) => setConsumableInfo({ ...consumableInfo, website: v })} />
              <Text style={styles.label}>SKU / PART #</Text>
              <TextInput testID="cons-sku" placeholder="12345" placeholderTextColor={theme.colors.textMuted}
                value={consumableInfo.sku} style={styles.input}
                onChangeText={(v) => setConsumableInfo({ ...consumableInfo, sku: v })} />
              <Text style={styles.label}>NOTES</Text>
              <TextInput testID="cons-notes" placeholder="Replacement instructions..." placeholderTextColor={theme.colors.textMuted}
                value={consumableInfo.notes} style={[styles.input, { height: 70, textAlignVertical: "top" }]}
                multiline onChangeText={(v) => setConsumableInfo({ ...consumableInfo, notes: v })} />
            </View>
          )}

          {/* Broken / Needs Repair */}
          <View style={[styles.toggleRow, needsRepair && { backgroundColor: "rgba(220,38,38,0.08)" }]}>
            <Ionicons name="build" size={20} color={needsRepair ? theme.colors.danger : theme.colors.accent} />
            <Text style={styles.toggleText}>BROKEN / IN REPAIR</Text>
            <Switch testID="toggle-repair" value={needsRepair} onValueChange={(v) => {
              setNeedsRepair(v);
              if (v && !repairInfo.notified_at) {
                setRepairInfo({ ...repairInfo, notified_at: todayStr() });
              }
            }}
              trackColor={{ true: theme.colors.danger, false: theme.colors.border }} thumbColor="#fff" />
          </View>
          {needsRepair && (
            <View style={[styles.subSection, { borderLeftColor: theme.colors.danger }]}>
              <Text style={[styles.label, { marginTop: 0 }]}>STATUS</Text>
              <View style={styles.chipWrap}>
                {["Reported", "In Repair", "Awaiting Parts", "Repaired"].map((s) => (
                  <TouchableOpacity key={s} testID={`rep-status-${s}`}
                    style={[styles.chip, repairInfo.repair_status === s && styles.chipActive]}
                    onPress={() => setRepairInfo({ ...repairInfo, repair_status: s })}>
                    <Text style={[styles.chipText, repairInfo.repair_status === s && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>REPAIR COMPANY</Text>
              <TextInput testID="rep-company" placeholder="ACME Repair Shop" placeholderTextColor={theme.colors.textMuted}
                value={repairInfo.company_notified} style={styles.input}
                onChangeText={(v) => setRepairInfo({ ...repairInfo, company_notified: v })} />
              <Text style={styles.label}>CONTACT (phone / email)</Text>
              <TextInput testID="rep-contact" placeholder="800-555-1234" placeholderTextColor={theme.colors.textMuted}
                value={repairInfo.contact} style={styles.input}
                onChangeText={(v) => setRepairInfo({ ...repairInfo, contact: v })} />
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>NOTIFIED ON</Text>
                  <TextInput testID="rep-notified" placeholder="YYYY-MM-DD" placeholderTextColor={theme.colors.textMuted}
                    value={repairInfo.notified_at} style={styles.input}
                    onChangeText={(v) => setRepairInfo({ ...repairInfo, notified_at: v })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>EXPECTED BACK</Text>
                  <TextInput testID="rep-expected" placeholder="YYYY-MM-DD" placeholderTextColor={theme.colors.textMuted}
                    value={repairInfo.expected_completion} style={styles.input}
                    onChangeText={(v) => setRepairInfo({ ...repairInfo, expected_completion: v })} />
                </View>
              </View>
              <Text style={styles.label}>NOTES</Text>
              <TextInput testID="rep-notes" placeholder="What's wrong? RMA #..." placeholderTextColor={theme.colors.textMuted}
                value={repairInfo.notes} style={[styles.input, { height: 70, textAlignVertical: "top" }]} multiline
                onChangeText={(v) => setRepairInfo({ ...repairInfo, notes: v })} />
              <Text style={[styles.helper, { color: theme.colors.warning, marginTop: 4 }]}>
                Marking as broken will auto check-in this tool if it's currently out.
              </Text>
            </View>
          )}

          {/* Warranty */}
          <View style={styles.toggleRow}>
            <Ionicons name="shield-checkmark" size={20} color={theme.colors.accent} />
            <Text style={styles.toggleText}>HAS WARRANTY</Text>
            <Switch testID="toggle-warranty" value={hasWarranty} onValueChange={setHasWarranty}
              trackColor={{ true: theme.colors.accent, false: theme.colors.border }} thumbColor="#fff" />
          </View>
          {hasWarranty && (
            <View style={styles.subSection}>
              <Text style={[styles.label, { marginTop: 0 }]}>PROVIDER</Text>
              <TextInput testID="war-provider" placeholder="Manufacturer name" placeholderTextColor={theme.colors.textMuted}
                value={warranty.provider} style={styles.input}
                onChangeText={(v) => onWarrantyChange("provider", v)} />
              <Text style={styles.label}>CONTACT (phone / email)</Text>
              <TextInput testID="war-contact" placeholder="800-555-1234" placeholderTextColor={theme.colors.textMuted}
                value={warranty.contact} style={styles.input}
                onChangeText={(v) => onWarrantyChange("contact", v)} />
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>START DATE</Text>
                  <TextInput testID="war-start" placeholder="YYYY-MM-DD" placeholderTextColor={theme.colors.textMuted}
                    value={warranty.start_date} style={styles.input}
                    onChangeText={(v) => onWarrantyChange("start_date", v)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>LENGTH (months)</Text>
                  <TextInput testID="war-length" placeholder="12" placeholderTextColor={theme.colors.textMuted}
                    value={warranty.length_months} style={styles.input} keyboardType="number-pad"
                    onChangeText={(v) => onWarrantyChange("length_months", v)} />
                </View>
              </View>
              <Text style={styles.label}>EXPIRY DATE (auto)</Text>
              <TextInput testID="war-expiry" placeholder="YYYY-MM-DD" placeholderTextColor={theme.colors.textMuted}
                value={warranty.expiry_date} style={styles.input}
                onChangeText={(v) => onWarrantyChange("expiry_date", v)} />
              <Text style={styles.label}>TERMS / NOTES</Text>
              <TextInput testID="war-terms" placeholder="Coverage details..." placeholderTextColor={theme.colors.textMuted}
                value={warranty.terms} style={[styles.input, { height: 70, textAlignVertical: "top" }]} multiline
                onChangeText={(v) => onWarrantyChange("terms", v)} />
            </View>
          )}

          {/* Photos */}
          <Text style={styles.label}>PHOTOS ({photos.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {photos.map((p, i) => (
              <View key={i} style={styles.photoWrap}>
                <Image source={{ uri: p }} style={styles.photo} />
                <TouchableOpacity testID={`remove-photo-${i}`} style={styles.photoRemove}
                  onPress={() => setPhotos((arr) => arr.filter((_, idx) => idx !== i))}>
                  <Ionicons name="close" size={16} color={theme.colors.textPrimary} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity testID="add-photo-camera-btn" style={styles.photoAdd} onPress={() => pickPhoto(true)}>
              <Ionicons name="camera" size={28} color={theme.colors.accent} />
              <Text style={styles.photoAddText}>CAMERA</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="add-photo-gallery-btn" style={styles.photoAdd} onPress={() => pickPhoto(false)}>
              <Ionicons name="images" size={28} color={theme.colors.accent} />
              <Text style={styles.photoAddText}>GALLERY</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Documents */}
          <Text style={styles.label}>DOCUMENTS ({documents.length})</Text>
          {documents.map((d, i) => (
            <View key={i} style={styles.docRow}>
              <Ionicons name="document" size={20} color={theme.colors.accent} />
              <Text style={styles.docName} numberOfLines={1}>{d.name}</Text>
              <TouchableOpacity onPress={() => setDocuments((arr) => arr.filter((_, idx) => idx !== i))}>
                <Ionicons name="close" size={20} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity testID="add-doc-btn" style={styles.docAdd} onPress={pickDocument}>
            <Ionicons name="attach" size={20} color={theme.colors.accent} />
            <Text style={styles.docAddText}>ATTACH DOCUMENT</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Dealer picker modal */}
      <Modal visible={showDealerPicker} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>SELECT DEALER</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {dealers.length === 0 ? (
                <Text style={{ color: theme.colors.textMuted, padding: 16 }}>
                  No dealers yet. Add one in the Dealers tab.
                </Text>
              ) : (
                dealers.map((d) => (
                  <TouchableOpacity key={d.id} testID={`mod-dealer-${d.id}`}
                    style={styles.dealerOpt} onPress={() => pickDealer(d)}>
                    <Text style={styles.dealerOptName}>{d.name}</Text>
                    <Text style={styles.dealerOptSub}>
                      {(d.agents || []).length} agent{(d.agents || []).length === 1 ? "" : "s"}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.btnGhost} onPress={() => setShowDealerPicker(false)}>
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
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  topTitle: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: "900", letterSpacing: 2 },
  saveText: { color: theme.colors.accent, fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  label: {
    color: theme.colors.textMuted, fontSize: 11, fontWeight: "800",
    letterSpacing: 2, marginTop: 16, marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.bgSecondary, borderWidth: 1, borderColor: theme.colors.border,
    color: theme.colors.textPrimary, paddingHorizontal: 14, paddingVertical: 12,
    minHeight: 48, borderRadius: 4, fontSize: 15,
  },
  row2: { flexDirection: "row", gap: 10 },
  helper: { color: theme.colors.textMuted, fontStyle: "italic", fontSize: 13 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 4 },
  chipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  chipTextActive: { color: "#000" },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
    backgroundColor: theme.colors.bgSecondary,
  },
  locRowActive: { backgroundColor: theme.colors.accent },
  locText: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: "600" },
  pickerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.colors.bgSecondary, borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 4,
  },
  pickerText: { color: theme.colors.textPrimary, flex: 1, fontWeight: "600", fontSize: 14 },
  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 14, marginTop: 16,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  toggleText: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: "900", letterSpacing: 1.5, flex: 1 },
  subSection: {
    marginTop: 4, paddingLeft: 12,
    borderLeftWidth: 2, borderLeftColor: theme.colors.accent,
  },
  photoWrap: { marginRight: 8, position: "relative" },
  photo: { width: 100, height: 100, borderRadius: 4, borderWidth: 1, borderColor: theme.colors.border },
  photoRemove: {
    position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.7)",
    width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12,
  },
  photoAdd: {
    width: 100, height: 100, borderWidth: 2, borderStyle: "dashed", borderColor: theme.colors.border,
    alignItems: "center", justifyContent: "center", marginRight: 8, borderRadius: 4, gap: 4,
  },
  photoAddText: { color: theme.colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  docRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: theme.colors.bgSecondary, borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6, borderRadius: 4,
  },
  docName: { color: theme.colors.textPrimary, flex: 1, fontSize: 13 },
  docAdd: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderStyle: "dashed", borderColor: theme.colors.border,
    paddingVertical: 14, borderRadius: 4,
  },
  docAddText: { color: theme.colors.accent, fontWeight: "800", letterSpacing: 1.5, fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary, padding: 20,
    borderTopWidth: 2, borderTopColor: theme.colors.accent,
  },
  modalTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: "900", letterSpacing: 2, marginBottom: 12 },
  dealerOpt: {
    paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1,
    borderColor: theme.colors.border, marginBottom: 6, borderRadius: 4,
  },
  dealerOptName: { color: theme.colors.textPrimary, fontWeight: "700" },
  dealerOptSub: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  btnGhost: {
    borderWidth: 1, borderColor: theme.colors.border, height: 48, marginTop: 8,
    alignItems: "center", justifyContent: "center", borderRadius: 4,
  },
  btnGhostText: { color: theme.colors.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 14 },
});
