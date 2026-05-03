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
import * as FileSystem from "expo-file-system/legacy";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { TagInput, CategoryPicker } from "../../src/Pickers";
import { buildLocationTree, flattenLocationTree } from "../../src/locationTree";
import { DateField } from "../../src/DateField";
import { useAuth } from "../../src/AuthContext";

export default function ToolEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const isEdit = !!id;
  const { user } = useAuth();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [isSet, setIsSet] = useState(false);
  const [setSerials, setSetSerials] = useState<string[]>([""]);
  const [cost, setCost] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [purchaseDate, setPurchaseDate] = useState(isEdit ? "" : new Date().toISOString().substring(0, 10));
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
    repair_status: "Not Reported",
    contact: "",
    notes: "",
    broken_photo: "",
  });

  // Warranty
  const [hasWarranty, setHasWarranty] = useState(false);
  const [warranty, setWarranty] = useState({
    provider: "", contact: "", terms: "", length_months: "",
    coverage_type: "months",
    start_date: "", expiry_date: "",
  });

  // Dealer
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [dealerName, setDealerName] = useState("");
  const [purchasedAgentId, setPurchasedAgentId] = useState<string | null>(null);
  const [purchasedAgentName, setPurchasedAgentName] = useState("");
  const [showDealerPicker, setShowDealerPicker] = useState(false);

  // Inline dealer creation
  const [showNewDealer, setShowNewDealer] = useState(false);
  const [newDealer, setNewDealer] = useState({
    name: "",
    phone: "",
    website: "",
    agent_name: "",
    agent_phone: "",
    agent_email: "",
  });
  const [savingDealer, setSavingDealer] = useState(false);
  const [newDealerErr, setNewDealerErr] = useState("");
  const [newDealerLimitHit, setNewDealerLimitHit] = useState(false);

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
        setIsSet(!!t.is_set);
        setSetSerials(
          Array.isArray(t.set_serials) && t.set_serials.length
            ? t.set_serials
            : [""]
        );
        setCost(t.cost ? String(t.cost) : ""); setPurchaseDate(t.purchase_date || "");
        setQuantity(t.quantity != null ? String(t.quantity) : "1");
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
            repair_status: t.repair_info.repair_status || "Not Reported",
            contact: t.repair_info.contact || "",
            notes: t.repair_info.notes || "",
            broken_photo: t.repair_info.broken_photo || "",
          });
        }
        if (t.warranty?.has_warranty) {
          setHasWarranty(true);
          setWarranty({
            provider: t.warranty.provider || "",
            contact: t.warranty.contact || "",
            terms: t.warranty.terms || "",
            length_months: t.warranty.length_months ? String(t.warranty.length_months) : "",
            coverage_type: t.warranty.coverage_type || "months",
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

  const saveNewDealer = async () => {
    setNewDealerErr("");
    setNewDealerLimitHit(false);
    const name = newDealer.name.trim();
    if (!name) {
      setNewDealerErr("Please enter a dealer name.");
      return;
    }
    setSavingDealer(true);
    try {
      const created = await api.createDealer({
        name,
        phone: newDealer.phone.trim(),
        website: newDealer.website.trim(),
        notes: "",
      });
      // Add an agent if provided
      if (newDealer.agent_name.trim()) {
        try {
          await api.addAgent(created.id, {
            name: newDealer.agent_name.trim(),
            phone: newDealer.agent_phone.trim(),
            email: newDealer.agent_email.trim(),
            notes: "",
          });
        } catch (agentErr: any) {
          console.warn("Add agent failed:", agentErr);
        }
      }
      const updatedDealers = await api.listDealers();
      setDealers(updatedDealers);
      const fresh = updatedDealers.find((d: any) => d.id === created.id);
      if (fresh) pickDealer(fresh);
      setShowNewDealer(false);
      setShowDealerPicker(false);
      setNewDealer({
        name: "",
        phone: "",
        website: "",
        agent_name: "",
        agent_phone: "",
        agent_email: "",
      });
    } catch (e: any) {
      const msg =
        typeof e?.detail === "string"
          ? e.detail
          : typeof e?.message === "string"
            ? e.message
            : "Could not save dealer. Please try again.";
      setNewDealerErr(msg);
    } finally {
      setSavingDealer(false);
    }
  };

  const goToSubscriptionFromDealer = () => {
    setShowNewDealer(false);
    setShowDealerPicker(false);
    setNewDealerLimitHit(false);
  };

  const save = useCallback(async () => {
    if (!name.trim()) { Alert.alert("Required", "Please enter a tool name."); return; }
    setSaving(true);
    const cleanedSerials = setSerials.map((s) => s.trim()).filter((s) => s.length > 0);
    const payload: any = {
      name: name.trim(), description, brand, model,
      serial_number: isSet ? "" : serial,
      is_set: isSet,
      set_serials: isSet ? cleanedSerials : [],
      cost: parseFloat(cost) || 0, purchase_date: purchaseDate, condition,
      quantity: Math.max(1, parseInt(quantity, 10) || 1),
      location_id: locationId, location_name: locationName,
      category_id: category?.id || null, category_name: category?.name || "",
      tag_ids: tags.map((t) => t.id), tag_names: tags.map((t) => t.name),
      photos, documents,
      is_consumable: isConsumable,
      consumable_info: isConsumable ? consumableInfo : null,
      needs_repair: needsRepair,
      repair_info: needsRepair ? {
        company_notified: dealerName || "",
        notified_at: repairInfo.notified_at,
        expected_completion: repairInfo.expected_completion,
        repair_status: repairInfo.repair_status || "Not Reported",
        contact: purchasedAgentName || "",
        notes: repairInfo.notes,
        broken_photo: repairInfo.broken_photo || "",
      } : null,
      warranty: hasWarranty ? {
        has_warranty: true,
        provider: warranty.provider, contact: warranty.contact, terms: warranty.terms,
        coverage_type: warranty.coverage_type || "months",
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
  }, [name, description, brand, model, serial, isSet, setSerials, cost, quantity, purchaseDate, condition, locationId, locationName, category, tags, photos, documents, isConsumable, consumableInfo, needsRepair, repairInfo, hasWarranty, warranty, dealerId, dealerName, purchasedAgentId, purchasedAgentName, isEdit, id, router]);

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
          <TouchableOpacity
            testID="cancel-btn"
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/");
              }
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.topBarBtn}
          >
            <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>{isEdit ? "EDIT TOOL" : "NEW TOOL"}</Text>
          <TouchableOpacity
            testID="save-tool-btn"
            onPress={save}
            disabled={saving}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.topBarBtn}
          >
            {saving ? <ActivityIndicator color={theme.colors.accent} /> : <Text style={styles.saveText}>SAVE</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
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

          {/* IS-A-SET toggle */}
          <View style={styles.toggleRow}>
            <Ionicons name="cube" size={20} color={theme.colors.accent} />
            <Text style={styles.toggleText}>THIS IS A SET (multiple serial numbers)</Text>
            <Switch
              testID="toggle-is-set"
              value={isSet}
              onValueChange={(v) => {
                setIsSet(v);
                if (v && setSerials.length === 0) setSetSerials([""]);
              }}
              trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
              thumbColor="#fff"
            />
          </View>

          {!isSet ? (
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
              <View style={{ width: 90 }}>
                <Text style={styles.label}>QTY</Text>
                <TextInput testID="quantity-input" placeholder="1" placeholderTextColor={theme.colors.textMuted}
                  value={quantity} onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ""))}
                  style={styles.input} keyboardType="number-pad" />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>COST ($)</Text>
                  <TextInput testID="cost-input" placeholder="0.00" placeholderTextColor={theme.colors.textMuted}
                    value={cost} onChangeText={setCost} style={styles.input} keyboardType="decimal-pad" />
                </View>
                <View style={{ width: 90 }}>
                  <Text style={styles.label}>QTY</Text>
                  <TextInput testID="quantity-input" placeholder="1" placeholderTextColor={theme.colors.textMuted}
                    value={quantity} onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ""))}
                    style={styles.input} keyboardType="number-pad" />
                </View>
              </View>
              <View style={styles.subSection}>
                <Text style={[styles.label, { marginTop: 0 }]}>SERIAL NUMBERS (one per item in the set)</Text>
                {setSerials.map((s, idx) => (
                  <View
                    key={idx}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}
                  >
                    <Text style={{ color: theme.colors.textMuted, width: 28, fontWeight: "700" }}>
                      {idx + 1}.
                    </Text>
                    <TextInput
                      testID={`set-serial-input-${idx}`}
                      placeholder={`Serial # for item ${idx + 1}`}
                      placeholderTextColor={theme.colors.textMuted}
                      value={s}
                      onChangeText={(v) => {
                        const next = [...setSerials];
                        next[idx] = v;
                        setSetSerials(next);
                      }}
                      style={[styles.input, { flex: 1 }]}
                    />
                    {setSerials.length > 1 && (
                      <TouchableOpacity
                        testID={`set-serial-remove-${idx}`}
                        onPress={() => {
                          const next = setSerials.filter((_, i) => i !== idx);
                          setSetSerials(next.length ? next : [""]);
                        }}
                        hitSlop={8}
                        style={{
                          padding: 6,
                          borderRadius: 6,
                          backgroundColor: "rgba(220,38,38,0.08)",
                        }}
                      >
                        <Ionicons name="close" size={18} color={theme.colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity
                  testID="add-set-serial"
                  onPress={() => setSetSerials([...setSerials, ""])}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: theme.colors.accent,
                    borderRadius: 6,
                    paddingVertical: 10,
                    marginTop: 4,
                  }}
                >
                  <Ionicons name="add" size={18} color={theme.colors.accent} />
                  <Text style={{ color: theme.colors.accent, fontWeight: "800", letterSpacing: 1 }}>
                    ADD SERIAL NUMBER
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>PURCHASED</Text>
              <DateField
                testID="purchase-input"
                value={purchaseDate}
                onChange={setPurchaseDate}
                placeholder="MM/DD/YYYY"
              />
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
            <TouchableOpacity
              testID="go-to-locations"
              onPress={() => router.push("/locations")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingVertical: 10,
              }}
            >
              <Ionicons name="add-circle" size={16} color={theme.colors.accent} />
              <Text style={[styles.helper, { color: theme.colors.accent, textDecorationLine: "underline" }]}>
                No locations yet — tap here to add one
              </Text>
            </TouchableOpacity>
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
                {["Not Reported", "Reported", "In Repair", "Awaiting Parts", "Repaired"].map((s) => (
                  <TouchableOpacity key={s} testID={`rep-status-${s}`}
                    style={[styles.chip, repairInfo.repair_status === s && styles.chipActive]}
                    onPress={() => setRepairInfo({ ...repairInfo, repair_status: s })}>
                    <Text style={[styles.chipText, repairInfo.repair_status === s && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.dealerInfoBox}>
                <Ionicons name="briefcase" size={14} color={theme.colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dealerInfoLabel}>REPAIR COMPANY (auto)</Text>
                  <Text style={styles.dealerInfoVal}>
                    {dealerName || "— select a Dealer above to auto-fill —"}
                  </Text>
                  {!!purchasedAgentName && (
                    <Text style={styles.dealerInfoSub}>Contact: {purchasedAgentName}</Text>
                  )}
                </View>
              </View>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>NOTIFIED ON</Text>
                  <DateField
                    testID="rep-notified"
                    value={repairInfo.notified_at}
                    onChange={(v) => setRepairInfo({ ...repairInfo, notified_at: v })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>EXPECTED BACK</Text>
                  <DateField
                    testID="rep-expected"
                    value={repairInfo.expected_completion}
                    onChange={(v) => setRepairInfo({ ...repairInfo, expected_completion: v })}
                  />
                </View>
              </View>
              <Text style={styles.label}>NOTES</Text>
              <TextInput testID="rep-notes" placeholder="What's wrong? RMA #..." placeholderTextColor={theme.colors.textMuted}
                value={repairInfo.notes} style={[styles.input, { height: 70, textAlignVertical: "top" }]} multiline
                onChangeText={(v) => setRepairInfo({ ...repairInfo, notes: v })} />

              <Text style={styles.label}>BROKEN-ITEM PHOTO (optional)</Text>
              <Text style={styles.helper}>
                A photo of the damage. Only shows on the broken-item view & email card.
              </Text>
              {repairInfo.broken_photo ? (
                <View style={styles.brokenPhotoBox}>
                  <Image source={{ uri: repairInfo.broken_photo }} style={styles.brokenPhoto} />
                  <TouchableOpacity
                    testID="remove-broken-photo"
                    style={styles.brokenRemove}
                    onPress={() => setRepairInfo({ ...repairInfo, broken_photo: "" })}
                  >
                    <Ionicons name="close-circle" size={26} color={theme.colors.danger} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  testID="add-broken-photo"
                  style={styles.addPhotoBtn}
                  onPress={async () => {
                    const res = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ImagePicker.MediaTypeOptions.Images,
                      base64: true,
                      quality: 0.6,
                    });
                    if (!res.canceled && res.assets[0]?.base64) {
                      setRepairInfo({
                        ...repairInfo,
                        broken_photo: `data:${res.assets[0].mimeType || "image/jpeg"};base64,${res.assets[0].base64}`,
                      });
                    }
                  }}
                >
                  <Ionicons name="camera" size={18} color={theme.colors.accent} />
                  <Text style={styles.addPhotoText}>ADD BROKEN-ITEM PHOTO</Text>
                </TouchableOpacity>
              )}

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
                  <DateField
                    testID="war-start"
                    value={warranty.start_date}
                    onChange={(v) => onWarrantyChange("start_date", v)}
                  />
                </View>
              </View>

              <Text style={styles.label}>WARRANTY LENGTH</Text>
              <View style={styles.warrChipWrap}>
                {[
                  { lbl: "1 MO", t: "months", m: "1" },
                  { lbl: "2 MO", t: "months", m: "2" },
                  { lbl: "3 MO", t: "months", m: "3" },
                  { lbl: "4 MO", t: "months", m: "4" },
                  { lbl: "5 MO", t: "months", m: "5" },
                  { lbl: "6 MO", t: "months", m: "6" },
                  { lbl: "7 MO", t: "months", m: "7" },
                  { lbl: "8 MO", t: "months", m: "8" },
                  { lbl: "9 MO", t: "months", m: "9" },
                  { lbl: "10 MO", t: "months", m: "10" },
                  { lbl: "11 MO", t: "months", m: "11" },
                  { lbl: "1 YR", t: "months", m: "12" },
                  { lbl: "2 YR", t: "months", m: "24" },
                  { lbl: "3 YR", t: "months", m: "36" },
                  { lbl: "4 YR", t: "months", m: "48" },
                  { lbl: "5 YR", t: "months", m: "60" },
                  { lbl: "LIMITED", t: "limited", m: "0" },
                  { lbl: "LIFETIME", t: "lifetime", m: "0" },
                ].map((opt) => {
                  const on =
                    warranty.coverage_type === opt.t &&
                    (opt.t !== "months" || warranty.length_months === opt.m);
                  return (
                    <TouchableOpacity
                      key={opt.lbl}
                      testID={`war-len-${opt.lbl.replace(/\s/g, "-")}`}
                      style={[
                        styles.warrChip,
                        on && styles.warrChipOn,
                        opt.t !== "months" && {
                          borderColor: theme.colors.accent,
                          borderWidth: on ? 0 : 1.5,
                        },
                      ]}
                      onPress={() => {
                        const next: any = {
                          ...warranty,
                          coverage_type: opt.t,
                          length_months: opt.m,
                        };
                        if (opt.t !== "months") {
                          next.expiry_date = "";
                        } else if (next.start_date) {
                          next.expiry_date = computeExpiry(next.start_date, opt.m);
                        }
                        setWarranty(next);
                      }}
                    >
                      <Text style={[styles.warrChipText, on && styles.warrChipTextOn]}>
                        {opt.lbl}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {warranty.coverage_type === "months" ? (
                <>
                  <Text style={styles.label}>EXPIRE DATE (auto)</Text>
                  <DateField
                    testID="war-expiry"
                    value={warranty.expiry_date}
                    onChange={(v) => onWarrantyChange("expiry_date", v)}
                  />
                </>
              ) : (
                <View style={styles.warrInfo}>
                  <Ionicons name="information-circle" size={14} color={theme.colors.accent} />
                  <Text style={styles.warrInfoText}>
                    {warranty.coverage_type === "lifetime"
                      ? "Lifetime warranty — no expiry date."
                      : "Limited warranty — see terms below for coverage details."}
                  </Text>
                </View>
              )}
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
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={styles.modalTitle}>SELECT DEALER</Text>
              <TouchableOpacity
                testID="open-new-dealer-btn"
                style={styles.newInlineBtn}
                onPress={() => setShowNewDealer(true)}
              >
                <Ionicons name="add" size={16} color="#000" />
                <Text style={styles.newInlineBtnText}>NEW</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {dealers.length === 0 ? (
                <Text style={{ color: theme.colors.textMuted, padding: 16 }}>
                  No dealers yet. Tap NEW above to add one.
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

      {/* Inline new dealer modal */}
      <Modal visible={showNewDealer} transparent animationType="slide" onRequestClose={() => setShowNewDealer(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={styles.modalBg}>
            <View style={[styles.modalCard, { maxHeight: "92%" }]}>
              <Text style={styles.modalTitle}>NEW DEALER</Text>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
                <Text style={styles.label}>NAME *</Text>
                <TextInput
                  testID="new-dealer-name"
                  placeholder="e.g. Snap-on Tools"
                  placeholderTextColor={theme.colors.textMuted}
                  value={newDealer.name}
                  onChangeText={(v) => setNewDealer({ ...newDealer, name: v })}
                  style={styles.input}
                />
                <Text style={styles.label}>PHONE</Text>
                <TextInput
                  testID="new-dealer-phone"
                  placeholder="800-555-1234"
                  placeholderTextColor={theme.colors.textMuted}
                  value={newDealer.phone}
                  onChangeText={(v) => setNewDealer({ ...newDealer, phone: v })}
                  style={styles.input}
                  keyboardType="phone-pad"
                />
                <Text style={styles.label}>WEBSITE</Text>
                <TextInput
                  testID="new-dealer-website"
                  placeholder="https://..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={newDealer.website}
                  onChangeText={(v) => setNewDealer({ ...newDealer, website: v })}
                  style={styles.input}
                  autoCapitalize="none"
                />
                <View style={[styles.subSection, { marginTop: 16 }]}>
                  <Text style={[styles.label, { marginTop: 0 }]}>AGENT NAME (optional)</Text>
                  <TextInput
                    testID="new-dealer-agent-name"
                    placeholder="Sales rep / contact person"
                    placeholderTextColor={theme.colors.textMuted}
                    value={newDealer.agent_name}
                    onChangeText={(v) => setNewDealer({ ...newDealer, agent_name: v })}
                    style={styles.input}
                  />
                  <Text style={styles.label}>AGENT PHONE</Text>
                  <TextInput
                    testID="new-dealer-agent-phone"
                    placeholder="800-555-1234"
                    placeholderTextColor={theme.colors.textMuted}
                    value={newDealer.agent_phone}
                    onChangeText={(v) => setNewDealer({ ...newDealer, agent_phone: v })}
                    style={styles.input}
                    keyboardType="phone-pad"
                  />
                  <Text style={styles.label}>AGENT EMAIL</Text>
                  <TextInput
                    testID="new-dealer-agent-email"
                    placeholder="agent@example.com"
                    placeholderTextColor={theme.colors.textMuted}
                    value={newDealer.agent_email}
                    onChangeText={(v) => setNewDealer({ ...newDealer, agent_email: v })}
                    style={styles.input}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </ScrollView>
              {!!newDealerErr ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    padding: 10,
                    marginTop: 8,
                    borderRadius: 6,
                    backgroundColor: "rgba(239,68,68,0.12)",
                    borderWidth: 1,
                    borderColor: "rgba(239,68,68,0.4)",
                  }}
                >
                  <Ionicons name="alert-circle" size={14} color={theme.colors.danger} />
                  <Text style={{ color: theme.colors.danger, fontSize: 12, flex: 1 }}>
                    {newDealerErr}
                  </Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.btnGhost, { flex: 1, marginTop: 0 }]}
                  onPress={() => {
                    setNewDealerErr("");
                    setNewDealerLimitHit(false);
                    setShowNewDealer(false);
                  }}
                  disabled={savingDealer}
                >
                  <Text style={styles.btnGhostText}>{newDealerLimitHit ? "CLOSE" : "CANCEL"}</Text>
                </TouchableOpacity>
                {!newDealerLimitHit && (
                  <TouchableOpacity
                    testID="save-new-dealer-btn"
                    style={styles.btnPrimary}
                    onPress={saveNewDealer}
                    disabled={savingDealer}
                  >
                    {savingDealer ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <Text style={styles.btnPrimaryText}>SAVE DEALER</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Sticky bottom Save Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          testID="save-tool-bottom-btn"
          style={styles.bottomSaveBtn}
          onPress={save}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Ionicons
                name={isEdit ? "save" : "checkmark-circle"}
                size={20}
                color="#000"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.bottomSaveText}>
                {isEdit ? "SAVE CHANGES" : "CREATE TOOL"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  topBarBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
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
  btnPrimary: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
  },
  btnPrimaryText: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  newInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radii.sm,
  },
  newInlineBtnText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 12,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    backgroundColor: theme.colors.bg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    ...(theme.elevation.lg as object),
  },
  bottomSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.sm,
    ...(theme.elevation.accent as object),
  },
  bottomSaveText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 2.5,
    fontSize: 15,
  },
  warrChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
    marginBottom: 6,
  },
  warrChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.bgSecondary,
    minWidth: 56,
    alignItems: "center",
  },
  warrChipOn: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  warrChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  warrChipTextOn: {
    color: "#000",
    fontWeight: "900",
  },
  warrInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,179,0,0.08)",
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 4,
    marginTop: 4,
  },
  warrInfoText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  dealerInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.bgSecondary,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 4,
    marginVertical: 8,
  },
  dealerInfoLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  dealerInfoVal: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
  },
  dealerInfoSub: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  brokenPhotoBox: {
    marginTop: 6,
    position: "relative",
  },
  brokenPhoto: {
    width: "100%",
    height: 200,
    borderRadius: 6,
    backgroundColor: theme.colors.bgSecondary,
  },
  brokenRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 13,
  },
  addPhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.accent,
    borderRadius: 6,
    marginTop: 6,
  },
  addPhotoText: {
    color: theme.colors.accent,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1.5,
  },
});
