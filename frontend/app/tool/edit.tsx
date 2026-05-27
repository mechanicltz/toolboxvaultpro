import { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, Switch, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { theme } from "../../src/theme";
import { AccordionRow } from "../../src/components/AccordionRow";
import { api } from "../../src/api";
import { TagInput, CategoryPicker, LocationPicker } from "../../src/Pickers";
// (locationTree helpers no longer needed here — LocationPicker handles tree flattening internally)
import { buildLocationTree, flattenLocationTree } from "../../src/locationTree";
import { DateField } from "../../src/DateField";
import { useAuth } from "../../src/AuthContext";

import { themedStyles } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";
import { MaintenanceSection } from "../../src/sections/MaintenanceSection";
import { formatDateUS } from "../../src/dateUtil";

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
  // Brand typeahead — list of all brands the user has previously saved.
  // Loaded once on mount; the BRAND TextInput filters this list as the
  // user types and lets them tap an existing brand to autofill (per
  // user 2026-05-27 — same UX pattern as Tags).
  const [brandList, setBrandList] = useState<string[]>([]);
  const [brandFocused, setBrandFocused] = useState(false);
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  // NEW multi-value fields — users can stack any number of model #s and
  // serial #s per tool. The legacy `model` / `serial` / `setSerials` /
  // `isSet` state above is still maintained for backward compat with the
  // receipt-scan modal and older import paths.
  const [modelNumbers, setModelNumbers] = useState<string[]>([""]);
  const [serialNumbers, setSerialNumbers] = useState<string[]>([""]);

  // Accordion state: tracks which Description-Card row is currently open.
  // User asked (2026-05-26) for each field to be a collapsed row, with
  // Model #(s) auto-expanded on a fresh tool (since model # is the first
  // thing they fill in, and the upcoming AI model lookup will autofill
  // the rest of the form from it).
  const [openKey, setOpenKey] = useState<string | null>("modelNumbers");
  const toggle = (k: string) =>
    setOpenKey((cur) => (cur === k ? null : k));
  const [isSet, setIsSet] = useState(false);
  const [setSerials, setSetSerials] = useState<string[]>([""]);
  const [cost, setCost] = useState("");
  // Manufacturer's Suggested Retail Price. Optional — purely informational
  // and feeds report totals when the user toggles MSRP columns on.
  const [msrpPrice, setMsrpPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [purchaseDate, setPurchaseDate] = useState(isEdit ? "" : new Date().toISOString().substring(0, 10));
  const [condition, setCondition] = useState("Good");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState("");
  const [category, setCategory] = useState<{ id: string; name: string } | null>(null);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [receipts, setReceipts] = useState<string[]>([]);
  const [documents, setDocuments] = useState<{ name: string; data: string; mime_type?: string }[]>([]);
  const [isConsumable, setIsConsumable] = useState(false);
  const [consumableInfo, setConsumableInfo] = useState({ store_name: "", website: "", sku: "", notes: "" });

  // Maintenance — list of schedules loaded from the saved tool. New tools
  // start empty (the accordion shows a "save first" message). On edit,
  // we initialize from `tool.maintenance` and refresh after add/delete.
  const [maintSchedules, setMaintSchedules] = useState<any[]>([]);
  const maintCount = maintSchedules.length;

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
    repair_cost: "", // dollar amount user paid for repair (string for input)
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

  // AI Receipt Scanner state
  const [scanning, setScanning] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanItemPickerOpen, setScanItemPickerOpen] = useState(false);
  const [scanImage, setScanImage] = useState<string>(""); // base64 (no prefix) of the receipt
  const [scanImageUri, setScanImageUri] = useState<string>(""); // data: uri used for preview
  const [scanResult, setScanResult] = useState<any | null>(null);
  // Items extracted from receipt (multi-item support)
  const [scanItems, setScanItems] = useState<any[]>([]);
  const [scanItemIdx, setScanItemIdx] = useState<number>(-1);
  const [importedItemIdxs, setImportedItemIdxs] = useState<number[]>([]);
  // Editable per-field values (toggle + free-text override)
  const [scanFields, setScanFields] = useState<Record<string, string>>({});
  const [scanApply, setScanApply] = useState<Record<string, boolean>>({});
  const [scanShowRaw, setScanShowRaw] = useState(false);
  // After APPLY: if not in edit mode, cost>0 and dealer matched, remember to prompt to charge the dealer
  const [pendingDealerCharge, setPendingDealerCharge] = useState<{ dealerId: string; amount: number; note: string } | null>(null);
  // Dealer-not-found resolution
  const [dealerNotFoundOpen, setDealerNotFoundOpen] = useState(false);
  const [dealerNotFoundName, setDealerNotFoundName] = useState("");
  const [dealerNotFoundCallback, setDealerNotFoundCallback] = useState<((d: any | null) => void) | null>(null);

  useEffect(() => {
    (async () => {
      const [loc, deal, brnds] = await Promise.all([
        api.listLocations(),
        api.listDealers(),
        api.listBrands().catch(() => [] as any[]),
      ]);
      setLocations(loc);
      setDealers(deal);
      setBrandList(
        (Array.isArray(brnds) ? brnds : [])
          .map((b: any) => String(b?.name || "").trim())
          .filter(Boolean)
      );
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
        // New multi-value model #s — fall back through legacy fields.
        const loadedModels: string[] = (Array.isArray(t.model_numbers) && t.model_numbers.length)
          ? t.model_numbers
          : (Array.isArray(t.set_serials) && t.set_serials.length
              ? t.set_serials
              : [t.serial_number, t.model].filter((s: any) => !!s));
        setModelNumbers(loadedModels.length ? loadedModels : [""]);
        const loadedSerials: string[] = (Array.isArray(t.serial_numbers) && t.serial_numbers.length)
          ? t.serial_numbers
          : [];
        setSerialNumbers(loadedSerials.length ? loadedSerials : [""]);
        setCost(t.cost ? String(t.cost) : ""); setPurchaseDate(t.purchase_date || "");
        setMsrpPrice(t.msrp_price ? String(t.msrp_price) : "");
        setQuantity(t.quantity != null ? String(t.quantity) : "1");
        setCondition(t.condition || "Good"); setLocationId(t.location_id);
        setLocationName(t.location_name || "");
        setCategory(t.category_id ? { id: t.category_id, name: t.category_name } : null);
        setTags((t.tag_ids || []).map((tid: string, i: number) => ({ id: tid, name: t.tag_names?.[i] || "" })));
        setPhotos(t.photos || []); setDocuments(t.documents || []); setReceipts(t.receipts || []);
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
            repair_cost: t.repair_info.repair_cost ? String(t.repair_info.repair_cost) : "",
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
        setMaintSchedules(Array.isArray(t.maintenance) ? t.maintenance : []);
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

  // ---- AI RECEIPT SCANNER ----
  // Compress/resize an image URI to max-width 1600 @ JPEG q=0.6 to keep payload small.
  const compressImage = async (uri: string): Promise<{ base64: string; uri: string }> => {
    try {
      const out = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      return { base64: out.base64 || "", uri: out.uri || uri };
    } catch {
      return { base64: "", uri };
    }
  };

  const runReceiptScan = async (src: "camera" | "library") => {
    try {
      const perm =
        src === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", `Please grant ${src === "camera" ? "camera" : "photo library"} access.`);
        return;
      }
      const opts: any = { quality: 0.8, allowsEditing: false, base64: false };
      const res =
        src === "camera"
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync({
              ...opts,
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
            });
      if (res.canceled || !res.assets?.[0]?.uri) return;

      setScanning(true);
      const { base64 } = await compressImage(res.assets[0].uri);
      if (!base64) {
        setScanning(false);
        Alert.alert("Error", "Could not process image.");
        return;
      }
      const dataUri = `data:image/jpeg;base64,${base64}`;
      setScanImage(base64);
      setScanImageUri(dataUri);

      try {
        const r = await api.post<any>(`/ai/receipt-scan`, { image_base64: base64 });
        setScanResult(r || {});
        const items = Array.isArray(r?.items) ? r.items : [];
        setScanItems(items);
        setImportedItemIdxs([]);
        if (items.length === 0) {
          // No items detected — open confirmation modal with empty fields so user can manually fill
          openConfirmationForItem(-1, r);
        } else if (items.length === 1) {
          openConfirmationForItem(0, r, items[0]);
        } else {
          // Multiple items — show picker first
          setScanItemPickerOpen(true);
        }
      } catch (e: any) {
        Alert.alert(
          "Scan failed",
          e?.message || e?.detail || "Unable to read receipt. Please try a clearer photo or enter details manually.",
        );
      } finally {
        setScanning(false);
      }
    } catch (e: any) {
      setScanning(false);
      Alert.alert("Error", e.message || "Could not start receipt scan.");
    }
  };

  const openConfirmationForItem = (idx: number, receipt?: any, item?: any) => {
    const r = receipt || scanResult || {};
    const it = item || (idx >= 0 ? (scanItems[idx] || {}) : {});
    setScanItemIdx(idx);
    // Pre-fill editable text values from the item + receipt
    const fields: Record<string, string> = {
      name: String(it.name || "").trim(),
      brand: String(it.brand || "").trim(),
      model: String(it.model || "").trim(),
      serial_number: String(it.serial_number || "").trim(),
      cost: it.cost != null && Number(it.cost) > 0 ? String(Number(it.cost).toFixed(2)) : "",
      quantity: it.quantity != null ? String(Math.max(1, parseInt(String(it.quantity), 10) || 1)) : "1",
      purchase_date: String(r.purchase_date || "").trim(),
      dealer: String(r.dealer || "").trim(),
      sold_by: String(r.sold_by || "").trim(),
      description: String(it.description || "").trim(),
    };
    setScanFields(fields);
    // Default toggles ON for any non-empty value
    setScanApply({
      name: !!fields.name,
      brand: !!fields.brand,
      model: !!fields.model,
      serial_number: !!fields.serial_number,
      cost: !!fields.cost && Number(fields.cost) > 0,
      quantity: !!fields.quantity && parseInt(fields.quantity, 10) > 1,
      purchase_date: !!fields.purchase_date,
      dealer: !!fields.dealer,
      sold_by: !!fields.sold_by,
      description: !!fields.description,
    });
    setScanItemPickerOpen(false);
    setScanShowRaw(false);
    setScanModalOpen(true);
  };

  const chooseReceiptSource = () => {
    Alert.alert(
      "Scan Receipt",
      "Choose how to provide the receipt photo. Our AI will read it and auto-fill the fields. Multi-item receipts let you pick one item per tool entry.",
      [
        { text: "Take Photo", onPress: () => runReceiptScan("camera") },
        { text: "Choose from Library", onPress: () => runReceiptScan("library") },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  // EDIT-MODE: just attach a receipt photo to the existing tool — no OCR,
  // no multi-item picker, no overwriting of any current fields.
  const pickReceiptPhotoOnly = async (src: "camera" | "library") => {
    try {
      const perm =
        src === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          `Please grant ${src === "camera" ? "camera" : "photo library"} access.`,
        );
        return;
      }
      const opts: any = { quality: 0.8, allowsEditing: false, base64: false };
      const res =
        src === "camera"
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync({
              ...opts,
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
            });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const { uri } = await compressImage(res.assets[0].uri);
      const dataUri =
        uri && uri.startsWith("data:")
          ? uri
          : (await (async () => {
              // Fall back: re-encode as base64 for portability across devices
              const { base64 } = await compressImage(res.assets[0].uri);
              return base64 ? `data:image/jpeg;base64,${base64}` : uri;
            })());
      if (!dataUri) {
        Alert.alert("Error", "Could not process image.");
        return;
      }
      setReceipts((arr) => [...arr, dataUri]);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not attach photo.");
    }
  };

  // Entry point used by the small button in the RECEIPTS section.
  // - On a NEW tool: full OCR scanner flow (camera/library + auto-fill fields).
  // - On an EXISTING tool (edit mode): default to "just attach the photo",
  //   but offer an optional "Scan & auto-fill" path for power users.
  const onTapReceiptButton = () => {
    if (!isEdit) {
      // New tool — keep the existing OCR-first flow
      chooseReceiptSource();
      return;
    }
    Alert.alert(
      "Add receipt to this item",
      "Just attach the photo, or also use AI to auto-fill any missing fields on this item?",
      [
        {
          text: "Take Photo (no scan)",
          onPress: () => pickReceiptPhotoOnly("camera"),
        },
        {
          text: "Choose from Library (no scan)",
          onPress: () => pickReceiptPhotoOnly("library"),
        },
        {
          text: "Scan & auto-fill",
          onPress: chooseReceiptSource,
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  // Find dealer by case-insensitive name match
  const findDealerByName = (name: string): any | null => {
    const n = (name || "").trim().toLowerCase();
    if (!n) return null;
    return dealers.find((d) => String(d.name || "").trim().toLowerCase() === n) || null;
  };

  // Add a new dealer by name (used by the not-found prompt)
  const addDealerInline = async (name: string): Promise<any | null> => {
    try {
      const created = await api.createDealer({ name: name.trim(), phone: "", website: "", notes: "" });
      const updated = await api.listDealers();
      setDealers(updated);
      return updated.find((d: any) => d.id === created.id) || created;
    } catch (e: any) {
      Alert.alert("Could not add dealer", e?.message || e?.detail || "Try adding it manually from the Dealers screen.");
      return null;
    }
  };

  const applyScanResult = async () => {
    const f = scanFields;
    if (scanApply.name && f.name) setName(f.name);
    if (scanApply.brand && f.brand) setBrand(f.brand);
    if (scanApply.model && f.model) {
      setModel(f.model);
      // Also append to modelNumbers stacked input — that's where the
      // multi-value MODEL # block reads from.
      setModelNumbers((arr) => {
        const compact = arr.filter((s) => s.trim());
        return compact.includes(f.model) ? (compact.length ? compact : [""]) : [...compact, f.model];
      });
    }
    if (scanApply.serial_number && f.serial_number) {
      setSerial(f.serial_number);
      // The scanner labels Part # / Item # / SKU as "Model #" → append
      // to modelNumbers (NOT serial_numbers) since these are model identifiers.
      setModelNumbers((arr) => {
        const compact = arr.filter((s) => s.trim());
        return compact.includes(f.serial_number)
          ? (compact.length ? compact : [""])
          : [...compact, f.serial_number];
      });
    }
    if (scanApply.cost && f.cost) {
      const n = parseFloat(f.cost) || 0;
      setCost(n > 0 ? String(n.toFixed(2)) : "");
    }
    if (scanApply.quantity && f.quantity) {
      const n = parseInt(f.quantity, 10);
      if (n > 0) setQuantity(String(n));
    }
    if (scanApply.purchase_date && f.purchase_date) setPurchaseDate(f.purchase_date);
    if (scanApply.description && f.description) setDescription(f.description);

    // Save the receipt image to receipts[] (only if not already in there from a previous item)
    if (scanImageUri && !receipts.includes(scanImageUri)) {
      setReceipts((arr) => [...arr, scanImageUri]);
    }

    // Mark this item as imported
    if (scanItemIdx >= 0 && !importedItemIdxs.includes(scanItemIdx)) {
      setImportedItemIdxs((arr) => [...arr, scanItemIdx]);
    }

    setScanModalOpen(false);

    // Dealer flow — only if user toggled ON dealer
    let resolvedDealer: any = null;
    if (scanApply.dealer && f.dealer) {
      resolvedDealer = findDealerByName(f.dealer);
      if (resolvedDealer) {
        setDealerId(resolvedDealer.id);
        setDealerName(resolvedDealer.name);
        afterDealerResolved(resolvedDealer);
      } else {
        // Not found → prompt user
        promptDealerNotFound(f.dealer, (chosen: any | null) => {
          if (chosen) {
            setDealerId(chosen.id);
            setDealerName(chosen.name);
          }
          afterDealerResolved(chosen);
        });
      }
    } else {
      afterDealerResolved(null);
    }
  };

  // After dealer resolution, try to match the salesperson (sold_by) to an
  // existing agent on that dealer; if not found, offer to add them. Then show
  // the dealer-charge prompt if applicable.
  const afterDealerResolved = async (matchedDealer: any | null) => {
    const f = scanFields;
    // Try to match the salesperson (sold_by) to an agent on the dealer
    if (matchedDealer && scanApply.sold_by && f.sold_by) {
      const wantedName = f.sold_by.trim();
      const agents = matchedDealer.agents || [];
      const wantedLow = wantedName.toLowerCase();
      const matchedAgent = agents.find(
        (a: any) => String(a.name || "").trim().toLowerCase() === wantedLow,
      );
      if (matchedAgent) {
        setPurchasedAgentId(matchedAgent.id);
        setPurchasedAgentName(matchedAgent.name);
      } else {
        // Offer to add a new agent on the dealer
        await new Promise<void>((resolve) => {
          Alert.alert(
            "Sales rep not found",
            `"${wantedName}" isn't listed as an agent under ${matchedDealer.name}. Add them?`,
            [
              {
                text: "Skip",
                style: "cancel",
                onPress: () => resolve(),
              },
              {
                text: `Add "${wantedName}"`,
                onPress: async () => {
                  try {
                    await api.addAgent(matchedDealer.id, {
                      name: wantedName,
                      phone: "",
                      email: "",
                    });
                    // Reload dealers to pick up the new agent id
                    const fresh = await api.listDealers();
                    setDealers(fresh);
                    const refreshed = fresh.find((d: any) => d.id === matchedDealer.id);
                    const newAgent = (refreshed?.agents || []).find(
                      (a: any) => String(a.name || "").trim().toLowerCase() === wantedLow,
                    );
                    if (newAgent) {
                      setPurchasedAgentId(newAgent.id);
                      setPurchasedAgentName(newAgent.name);
                    }
                  } catch (err: any) {
                    console.warn("Add agent failed:", err);
                  } finally {
                    resolve();
                  }
                },
              },
            ],
          );
        });
      }
    } else if (scanApply.sold_by && f.sold_by && !matchedDealer) {
      // No dealer to attach to — just store the name as agent text so it shows on the form
      setPurchasedAgentName(f.sold_by.trim());
    }

    const chargeAmount = scanApply.cost ? parseFloat(f.cost) || 0 : parseFloat(cost) || 0;
    if (!isEdit && matchedDealer && chargeAmount > 0) {
      setTimeout(() => {
        Alert.alert(
          "Charge to dealer account?",
          `Add a $${chargeAmount.toFixed(2)} charge to ${matchedDealer.name}'s balance for this purchase?`,
          [
            { text: "No", style: "cancel" },
            {
              text: `Yes, charge $${chargeAmount.toFixed(2)}`,
              onPress: () =>
                setPendingDealerCharge({
                  dealerId: matchedDealer.id,
                  amount: chargeAmount,
                  note: `Auto: ${f.name || "Receipt scan"}`,
                }),
            },
          ],
        );
      }, 300);
    }
  };

  // Show "Dealer not found" prompt — Add as new / Choose existing / Skip
  const promptDealerNotFound = (
    name: string,
    callback: (chosen: any | null) => void,
  ) => {
    setDealerNotFoundName(name);
    setDealerNotFoundCallback(() => callback);
    setDealerNotFoundOpen(true);
  };

  const handleDealerNotFoundAction = async (action: "add" | "choose" | "skip") => {
    const cb = dealerNotFoundCallback;
    const name = dealerNotFoundName;
    setDealerNotFoundOpen(false);
    setDealerNotFoundCallback(null);
    if (action === "add") {
      const fresh = await addDealerInline(name);
      cb && cb(fresh);
    } else if (action === "choose") {
      // Open the existing dealer picker; the resolution happens through pickDealer
      setShowDealerPicker(true);
      // Stash callback to fire when pickDealer finishes — see pickDealer override below
      pendingDealerPickRef.current = cb;
    } else {
      cb && cb(null);
    }
  };
  // Ref to bridge the dealer picker callback for the not-found flow
  const pendingDealerPickRef = useRef<((d: any | null) => void) | null>(null);


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
    // Fire receipt-scan callback if it was awaiting our choice
    if (pendingDealerPickRef.current) {
      const cb = pendingDealerPickRef.current;
      pendingDealerPickRef.current = null;
      cb(d);
    }
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
    const cleanedModelNums = modelNumbers.map((s) => s.trim()).filter((s) => s.length > 0);
    const cleanedSerialNums = serialNumbers.map((s) => s.trim()).filter((s) => s.length > 0);
    const payload: any = {
      name: name.trim(), description, brand, model,
      serial_number: isSet ? "" : serial,
      is_set: isSet,
      set_serials: isSet ? cleanedSerials : [],
      // New multi-value fields (backend will keep legacy mirrors in sync)
      model_numbers: cleanedModelNums,
      serial_numbers: cleanedSerialNums,
      cost: parseFloat(cost) || 0,
      msrp_price: parseFloat(msrpPrice) || 0,
      purchase_date: purchaseDate, condition,
      quantity: Math.max(1, parseInt(quantity, 10) || 1),
      location_id: locationId, location_name: locationName,
      category_id: category?.id || null, category_name: category?.name || "",
      tag_ids: tags.map((t) => t.id), tag_names: tags.map((t) => t.name),
      photos, documents, receipts,
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
        repair_cost: parseFloat(repairInfo.repair_cost || "0") || 0,
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
  // Reset all form fields back to defaults — used by "Add another from this receipt"
  const resetFormForNextItem = () => {
    setName(""); setDescription(""); setBrand(""); setModel(""); setSerial("");
    setIsSet(false); setSetSerials([""]);
    setModelNumbers([""]); setSerialNumbers([""]);
    setCost(""); setMsrpPrice(""); setQuantity("1");
    setCondition("Good");
    setLocationId(null); setLocationName("");
    setCategory(null);
    setTags([]);
    setPhotos([]);
    setDocuments([]);
    setIsConsumable(false);
    setConsumableInfo({ store_name: "", website: "", sku: "", notes: "" });
    setNeedsRepair(false);
    setRepairInfo({
      company_notified: "", notified_at: "", expected_completion: "",
      repair_status: "Not Reported", contact: "", notes: "", broken_photo: "",
      repair_cost: "",
    });
    setHasWarranty(false);
    setWarranty({ provider: "", contact: "", terms: "", length_months: "", coverage_type: "months", start_date: "", expiry_date: "" });
    // Keep dealer/dealerName intact — same receipt = same dealer
    setPendingDealerCharge(null);
    // Keep receipts[] — they should carry to the next item if user wants
    // (we attach the receipt photo to each item via applyScanResult -> setReceipts)
    setReceipts([]);
  };

    try {
      if (isEdit && id) await api.updateTool(id, payload);
      else await api.createTool(payload);
      // After successful save (on new tools), apply any queued dealer charge.
      if (!isEdit && pendingDealerCharge && pendingDealerCharge.amount > 0 && pendingDealerCharge.dealerId) {
        try {
          await api.addDealerTransaction(pendingDealerCharge.dealerId, {
            account: "credit",
            type: "charge",
            amount: pendingDealerCharge.amount,
            note: pendingDealerCharge.note || "",
          });
        } catch (chargeErr: any) {
          // Non-fatal: surface a warning but don't block the save
          console.warn("Dealer charge failed:", chargeErr);
        }
      }
      // OPTION B: Multi-item — if there are remaining unimported items from
      // the current receipt scan, ask the user if they want to add another.
      const remaining = !isEdit
        ? scanItems.filter((_, i) => !importedItemIdxs.includes(i)).length
        : 0;
      if (remaining > 0) {
        Alert.alert(
          "Add another item from this receipt?",
          `${remaining} item${remaining === 1 ? "" : "s"} on this receipt have not been added yet.`,
          [
            {
              text: "No, I'm done",
              style: "cancel",
              onPress: () => {
                // Clear scan state so we don't ask again, then go back
                setScanItems([]);
                setImportedItemIdxs([]);
                setScanResult(null);
                router.back();
              },
            },
            {
              text: `Pick next item (${remaining})`,
              onPress: () => {
                resetFormForNextItem();
                // Re-open the item picker for remaining items
                setScanItemPickerOpen(true);
              },
            },
          ],
        );
        return;
      }
      router.back();
    } catch (e: any) {
      // When the backend returns 402 (free-tier limit reached), the global
      // 402 handler already pushed the user to /paywall — don't pile a raw
      // JSON alert on top of that.
      if (e?.paymentRequired || e?.status === 402) {
        // no-op; paywall is already opening
      } else {
        Alert.alert("Error", e?.detail || e?.message || "Could not save tool");
      }
    }
    finally { setSaving(false); }
  }, [name, description, brand, model, serial, isSet, setSerials, modelNumbers, serialNumbers, cost, msrpPrice, quantity, purchaseDate, condition, locationId, locationName, category, tags, photos, documents, receipts, isConsumable, consumableInfo, needsRepair, repairInfo, hasWarranty, warranty, dealerId, dealerName, purchasedAgentId, purchasedAgentName, pendingDealerCharge, scanItems, importedItemIdxs, isEdit, id, router]);

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
          {/* AI Receipt Scanner banner — prominent at top of form */}
          {!isEdit && (
            <TouchableOpacity
              testID="scan-receipt-btn"
              style={styles.scanBanner}
              onPress={chooseReceiptSource}
              disabled={scanning}
              activeOpacity={0.85}
            >
              {scanning ? (
                <>
                  <ActivityIndicator color="#000" />
                  <Text style={styles.scanBannerText}>READING RECEIPT…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="scan" size={22} color="#000" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scanBannerText}>SCAN RECEIPT</Text>
                    <Text style={styles.scanBannerSub}>AI auto-fills fields from a photo</Text>
                  </View>
                  <Ionicons name="sparkles" size={18} color="#000" />
                </>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.detailsBox}>
          <AccordionRow
            label="NAME"
            icon="pricetag"
            summary={(name || "Tap to set") as any}
            required
            open={openKey === "name"}
            onToggle={() => toggle("name")}
            testID="acc-name"
          >
          <Text style={styles.label}>NAME *</Text>
          <TextInput testID="name-input" placeholder="Cordless Drill" placeholderTextColor={theme.colors.textMuted}
            value={name} onChangeText={setName} style={styles.input} />
          </AccordionRow>
          <AccordionRow
            label="PRICING & QTY"
            icon="cash"
            summary={((cost ? `$${cost}` : "—") + (msrpPrice ? ` · MSRP $${msrpPrice}` : "") + (quantity && quantity !== "1" ? ` · Qty ${quantity}` : "")) as any}
            open={openKey === "pricing"}
            onToggle={() => toggle("pricing")}
            testID="acc-pricing"
          >
          {/* COST + MSRP + QTY row. MSRP is optional and only affects
              report totals; cost is the actual purchase price the user paid. */}
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>COST ($)</Text>
              <TextInput testID="cost-input" placeholder="0.00" placeholderTextColor={theme.colors.textMuted}
                value={cost} onChangeText={setCost} style={styles.input} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>MSRP ($)</Text>
              <TextInput
                testID="msrp-input"
                placeholder="optional"
                placeholderTextColor={theme.colors.textMuted}
                value={msrpPrice}
                onChangeText={(v) => {
                  const clean = v.replace(/[^0-9.]/g, "").replace(/(\..*?)\..*/g, "$1");
                  setMsrpPrice(clean);
                }}
                style={styles.input}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ width: 70 }}>
              <Text style={styles.label}>QTY</Text>
              <TextInput testID="quantity-input" placeholder="1" placeholderTextColor={theme.colors.textMuted}
                value={quantity} onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ""))}
                style={styles.input} keyboardType="number-pad" />
            </View>
          </View>
          </AccordionRow>
          <AccordionRow
            label="LOCATION"
            icon="location"
            summary={(locationName || "—") as any}
            open={openKey === "location"}
            onToggle={() => toggle("location")}
            testID="acc-location"
          >
          <Text style={styles.label}>LOCATION</Text>
          <LocationPicker
            locationId={locationId}
            locationName={locationName}
            onChange={(id, path) => {
              setLocationId(id);
              setLocationName(path);
            }}
          />
          </AccordionRow>
          <AccordionRow
            label="MODEL NUMBER(S)"
            icon="barcode"
            summary={(modelNumbers.filter(Boolean).join(", ") || "Tap to add model #") as any}
            required
            open={openKey === "modelNumbers"}
            onToggle={() => toggle("modelNumbers")}
            testID="acc-modelNumbers"
          >
          {/* MODEL NUMBERS — header row matches the Photos/Documents/Receipts
              pattern: "MODEL NUMBERS (n)" label on left + small orange OUTLINE
              ADD button on right. Each row is a slim input + delete icon. */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={styles.label}>MODEL NUMBERS ({modelNumbers.filter(Boolean).length})</Text>
            <TouchableOpacity
              testID="add-model-number"
              onPress={() => setModelNumbers([...modelNumbers, ""])}
              style={styles.smallScanBtn}
            >
              <Ionicons name="add-circle" size={12} color={theme.colors.accent} />
              <Text style={styles.smallScanBtnText}>ADD</Text>
            </TouchableOpacity>
          </View>
          {modelNumbers.map((s, idx) => (
            <View
              key={`mn-${idx}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}
            >
              <TextInput
                testID={`model-number-input-${idx}`}
                placeholder={idx === 0 ? "e.g. DCD777" : `Model # ${idx + 1}`}
                placeholderTextColor={theme.colors.textMuted}
                value={s}
                onChangeText={(v) => {
                  const next = [...modelNumbers];
                  next[idx] = v;
                  setModelNumbers(next);
                }}
                style={[styles.compactInput, { flex: 1 }]}
              />
              {modelNumbers.length > 1 && (
                <TouchableOpacity
                  testID={`model-number-remove-${idx}`}
                  onPress={() => {
                    const next = modelNumbers.filter((_, i) => i !== idx);
                    setModelNumbers(next.length ? next : [""]);
                  }}
                  hitSlop={8}
                  style={styles.removeIconBtn}
                >
                  <Ionicons name="close" size={14} color={theme.colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          </AccordionRow>
          <AccordionRow
            label="SERIAL NUMBER(S)"
            icon="key"
            summary={(serialNumbers.filter(Boolean).join(", ") || "—") as any}
            open={openKey === "serialNumbers"}
            onToggle={() => toggle("serialNumbers")}
            testID="acc-serialNumbers"
          >
          {/* SERIAL NUMBERS — same compact pattern as Model #s. */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={styles.label}>SERIAL NUMBERS ({serialNumbers.filter(Boolean).length})</Text>
            <TouchableOpacity
              testID="add-serial-number"
              onPress={() => setSerialNumbers([...serialNumbers, ""])}
              style={styles.smallScanBtn}
            >
              <Ionicons name="add-circle" size={12} color={theme.colors.accent} />
              <Text style={styles.smallScanBtnText}>ADD</Text>
            </TouchableOpacity>
          </View>
          {serialNumbers.map((s, idx) => (
            <View
              key={`sn-${idx}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}
            >
              <TextInput
                testID={`serial-number-input-${idx}`}
                placeholder={idx === 0 ? "e.g. SN-ABC-1234" : `Serial # ${idx + 1}`}
                placeholderTextColor={theme.colors.textMuted}
                value={s}
                onChangeText={(v) => {
                  const next = [...serialNumbers];
                  next[idx] = v;
                  setSerialNumbers(next);
                }}
                style={[styles.compactInput, { flex: 1 }]}
              />
              {serialNumbers.length > 1 && (
                <TouchableOpacity
                  testID={`serial-number-remove-${idx}`}
                  onPress={() => {
                    const next = serialNumbers.filter((_, i) => i !== idx);
                    setSerialNumbers(next.length ? next : [""]);
                  }}
                  hitSlop={8}
                  style={styles.removeIconBtn}
                >
                  <Ionicons name="close" size={14} color={theme.colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          </AccordionRow>
          <AccordionRow
            label="DEALER & AGENT"
            icon="people"
            summary={((dealerName || "—") + (purchasedAgentName ? ` · ${purchasedAgentName}` : "")) as any}
            open={openKey === "dealer"}
            onToggle={() => toggle("dealer")}
            testID="acc-dealer"
          >
          {/* Dealer */}
          <Text style={styles.label}>DEALER</Text>
          <BevelCard testID="pick-dealer-btn" style={styles.pickerRow} onPress={() => setShowDealerPicker(true)}>
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
          </BevelCard>
          {dealer && (dealer.agents || []).length > 0 && (
            <>
              <Text style={[styles.label, { fontSize: 7 }]}>PURCHASED FROM AGENT (snapshot)</Text>
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
          </AccordionRow>
          <AccordionRow
            label="BRAND"
            icon="ribbon"
            summary={(brand || "—") as any}
            open={openKey === "brand"}
            onToggle={() => toggle("brand")}
            lastRow
            testID="acc-brand"
          >
          {/* BRAND — typeahead. Filters the user's saved brands as they type
              and lets them tap any matching chip to autofill (per user
              2026-05-27). New brands typed here are saved to the brands
              collection on tool-save and become future suggestions. */}
          <View>
            <Text style={styles.label}>BRAND</Text>
            <TextInput
              testID="brand-input"
              placeholder="DeWalt"
              placeholderTextColor={theme.colors.textMuted}
              value={brand}
              onChangeText={setBrand}
              onFocus={() => setBrandFocused(true)}
              onBlur={() => setTimeout(() => setBrandFocused(false), 150)}
              style={styles.input}
            />
            {(() => {
              const q = brand.trim().toLowerCase();
              const matches = brandList
                .filter((b) => {
                  if (!brandFocused) return false;
                  const lower = b.toLowerCase();
                  if (q && lower === q) return false; // hide exact-match (already typed)
                  return q ? lower.includes(q) : true;
                })
                .slice(0, 8);
              if (matches.length === 0) return null;
              return (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {matches.map((b) => (
                    <TouchableOpacity
                      key={b}
                      testID={`brand-suggest-${b}`}
                      onPress={() => {
                        setBrand(b);
                        setBrandFocused(false);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        borderWidth: 1,
                        borderColor: theme.colors.accent,
                        backgroundColor: theme.colors.accent + "15",
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 4,
                      }}
                    >
                      <Ionicons name="pricetag" size={11} color={theme.colors.accent} />
                      <Text
                        style={{
                          color: theme.colors.accent,
                          fontSize: 11,
                          fontWeight: "700",
                        }}
                      >
                        {b}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}
          </View>
          </AccordionRow>
          </View>

          <View style={styles.detailsBox}>
          <AccordionRow
            label="PHOTOS"
            icon="camera"
            summary={(`${photos.length} photo${photos.length === 1 ? "" : "s"}`) as any}
            open={openKey === "photos"}
            onToggle={() => toggle("photos")}
            testID="acc-photos"
          >
          {/* Photos — matches Receipts layout per user 2026-05-27:
              header row (title + outline ADD button) + thumbs OR helper text. */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.label}>PHOTOS ({photos.length})</Text>
            <TouchableOpacity
              testID="add-photo-btn"
              onPress={() => pickPhoto(false)}
              style={styles.smallScanBtn}
            >
              <Ionicons name="add-circle" size={12} color={theme.colors.accent} />
              <Text style={styles.smallScanBtnText}>ADD PHOTO</Text>
            </TouchableOpacity>
          </View>
          {photos.length > 0 ? (
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
                <Ionicons name="camera" size={22} color={theme.colors.accent} />
                <Text style={styles.photoAddText}>CAMERA</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="add-photo-gallery-btn" style={styles.photoAdd} onPress={() => pickPhoto(false)}>
                <Ionicons name="images" size={22} color={theme.colors.accent} />
                <Text style={styles.photoAddText}>GALLERY</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <Text style={styles.helper}>
              Attach product photos, condition shots, or reference images.
            </Text>
          )}
          </AccordionRow>
          <AccordionRow
            label="DOCUMENTS"
            icon="attach"
            summary={(`${documents.length} document${documents.length === 1 ? "" : "s"}`) as any}
            open={openKey === "documents"}
            onToggle={() => toggle("documents")}
            testID="acc-documents"
          >
          {/* Documents — matches Receipts layout per user 2026-05-27:
              header row (title + outline ADD button) + list OR helper text. */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.label}>DOCUMENTS ({documents.length})</Text>
            <TouchableOpacity
              testID="add-doc-btn"
              onPress={pickDocument}
              style={styles.smallScanBtn}
            >
              <Ionicons name="add-circle" size={12} color={theme.colors.accent} />
              <Text style={styles.smallScanBtnText}>ADD DOCUMENT</Text>
            </TouchableOpacity>
          </View>
          {documents.length > 0 ? (
            <>
              {documents.map((d, i) => (
                <BevelCard key={i} style={styles.docRow}>
                  <Ionicons name="document" size={20} color={theme.colors.accent} />
                  <Text style={styles.docName} numberOfLines={1}>{d.name}</Text>
                  <TouchableOpacity onPress={() => setDocuments((arr) => arr.filter((_, idx) => idx !== i))}>
                    <Ionicons name="close" size={20} color={theme.colors.danger} />
                  </TouchableOpacity>
                </BevelCard>
              ))}
            </>
          ) : (
            <Text style={styles.helper}>
              Attach manuals, warranty papers, or any PDF/file for this tool.
            </Text>
          )}
          </AccordionRow>
          <AccordionRow
            label="RECEIPTS"
            icon="receipt"
            summary={(`${receipts.length} receipt${receipts.length === 1 ? "" : "s"}`) as any}
            open={openKey === "receipts"}
            onToggle={() => toggle("receipts")}
            lastRow
            testID="acc-receipts"
          >
          {/* Receipts */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.label}>RECEIPTS ({receipts.length})</Text>
            <TouchableOpacity
              testID="add-receipt-btn"
              onPress={onTapReceiptButton}
              disabled={scanning}
              style={styles.smallScanBtn}
            >
              {scanning ? (
                <ActivityIndicator color={theme.colors.accent} size="small" />
              ) : (
                <>
                  <Ionicons
                    name={isEdit ? "add-circle" : "scan"}
                    size={12}
                    color={theme.colors.accent}
                  />
                  <Text style={styles.smallScanBtnText}>
                    {isEdit ? "ADD RECEIPT" : "SCAN RECEIPT"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          {receipts.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {receipts.map((r, i) => (
                <View key={i} style={styles.photoWrap}>
                  <Image source={{ uri: r }} style={styles.photo} />
                  <TouchableOpacity
                    testID={`remove-receipt-${i}`}
                    style={styles.photoRemove}
                    onPress={() => setReceipts((arr) => arr.filter((_, idx) => idx !== i))}
                  >
                    <Ionicons name="close" size={16} color={theme.colors.textPrimary} />
                  </TouchableOpacity>
                  <View style={styles.receiptBadge}>
                    <Ionicons name="receipt" size={10} color="#000" />
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.helper}>
              Attach receipt photos for insurance, warranty claims, and PDF reports.
            </Text>
          )}
          </AccordionRow>
          </View>

          <View style={styles.detailsBox}>
          <AccordionRow
            label="WARRANTY"
            icon="shield-checkmark"
            summary={(hasWarranty ? String(warranty.warranty_end || "Active") : "No") as any}
            open={openKey === "warranty"}
            onToggle={() => toggle("warranty")}
            testID="acc-warranty"
          >
          {/* Warranty — compact form per user 2026-05-27: same slim input
              + tight label spacing as the Model/Serial number rows. */}
          <View style={styles.toggleRowCompact}>
            <Ionicons name="shield-checkmark" size={14} color={theme.colors.accent} />
            <Text style={styles.toggleTextCompact}>HAS WARRANTY</Text>
            <Switch testID="toggle-warranty" value={hasWarranty} onValueChange={setHasWarranty}
              trackColor={{ true: theme.colors.accent, false: theme.colors.border }} thumbColor="#fff" />
          </View>
          {hasWarranty && (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.labelSm}>PROVIDER</Text>
              <TextInput testID="war-provider" placeholder="Manufacturer name" placeholderTextColor={theme.colors.textMuted}
                value={warranty.provider} style={styles.compactInput}
                onChangeText={(v) => onWarrantyChange("provider", v)} />
              <Text style={styles.labelSm}>CONTACT (phone / email)</Text>
              <TextInput testID="war-contact" placeholder="800-555-1234" placeholderTextColor={theme.colors.textMuted}
                value={warranty.contact} style={styles.compactInput}
                onChangeText={(v) => onWarrantyChange("contact", v)} />
              <Text style={styles.labelSm}>START DATE</Text>
              <DateField
                testID="war-start"
                value={warranty.start_date}
                onChange={(v) => onWarrantyChange("start_date", v)}
              />

              <Text style={styles.labelSm}>WARRANTY LENGTH</Text>
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
                    <BevelCard
                      key={opt.lbl}
                      testID={`war-len-${opt.lbl.replace(/\s/g, "-")}`}
                      style={[
                        styles.warrChipSm,
                        on && styles.warrChipOn,
                        opt.t !== "months" &&
                          !on && {
                            borderColor: theme.colors.accent,
                            borderWidth: 1.5,
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
                      <Text style={[styles.warrChipTextSm, on && styles.warrChipTextOn]}>
                        {opt.lbl}
                      </Text>
                    </BevelCard>
                  );
                })}
              </View>

              {warranty.coverage_type === "months" ? (
                <>
                  <Text style={styles.labelSm}>EXPIRE DATE (auto)</Text>
                  <DateField
                    testID="war-expiry"
                    value={warranty.expiry_date}
                    onChange={(v) => onWarrantyChange("expiry_date", v)}
                  />
                </>
              ) : (
                <View style={styles.warrInfo}>
                  <Ionicons name="information-circle" size={12} color={theme.colors.accent} />
                  <Text style={styles.warrInfoText}>
                    {warranty.coverage_type === "lifetime"
                      ? "Lifetime warranty — no expiry date."
                      : "Limited warranty — see terms below for coverage details."}
                  </Text>
                </View>
              )}
              <Text style={styles.labelSm}>TERMS / NOTES</Text>
              <TextInput testID="war-terms" placeholder="Coverage details..." placeholderTextColor={theme.colors.textMuted}
                value={warranty.terms} style={[styles.compactInput, { height: 60, textAlignVertical: "top" }]} multiline
                onChangeText={(v) => onWarrantyChange("terms", v)} />
            </View>
          )}
          </AccordionRow>
          <AccordionRow
            label="MAINTENANCE"
            icon="construct"
            summary={(isEdit ? `${(maintCount || 0)} schedule${maintCount === 1 ? "" : "s"}` : "Save tool first") as any}
            open={openKey === "maintenance"}
            onToggle={() => toggle("maintenance")}
            testID="acc-maintenance"
          >
          {isEdit && id ? (
            <MaintenanceSection
              tool={{ id, maintenance: maintSchedules } as any}
              onChange={async () => {
                try {
                  const fresh = await api.getTool(id);
                  setMaintSchedules(Array.isArray(fresh?.maintenance) ? fresh.maintenance : []);
                } catch {}
              }}
            />
          ) : (
            <View style={{ paddingVertical: 8 }}>
              <Text style={styles.helper}>
                Save this tool first, then re-open Edit to schedule
                calibration / service / inspection reminders.
              </Text>
            </View>
          )}
          </AccordionRow>
          <AccordionRow
            label="CONSUMABLE"
            icon="flask"
            summary={(isConsumable ? "Yes" : "No") as any}
            open={openKey === "consumable"}
            onToggle={() => toggle("consumable")}
            lastRow
            testID="acc-consumable"
          >
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
          </AccordionRow>
          </View>

          <View style={styles.detailsBox}>
          <AccordionRow
            label="CATEGORY"
            icon="folder"
            summary={(category?.name || "—") as any}
            open={openKey === "category"}
            onToggle={() => toggle("category")}
            testID="acc-category"
          >
          <Text style={styles.label}>CATEGORY</Text>
          <CategoryPicker selected={category} onChange={setCategory} />
          </AccordionRow>
          <AccordionRow
            label="TAGS"
            icon="pricetags"
            summary={(tags?.length ? tags.map((t) => t.name).join(", ") : "—") as any}
            open={openKey === "tags"}
            onToggle={() => toggle("tags")}
            testID="acc-tags"
          >
          <Text style={styles.label}>TAGS</Text>
          <TagInput selected={tags} onChange={setTags} />
          </AccordionRow>
          <AccordionRow
            label="PURCHASE DATE"
            icon="calendar"
            summary={(purchaseDate ? formatDateUS(purchaseDate) : "—") as any}
            open={openKey === "purchase"}
            onToggle={() => toggle("purchase")}
            lastRow
            testID="acc-purchase"
          >
          <Text style={styles.label}>PURCHASED</Text>
          <DateField
            testID="purchase-input"
            value={purchaseDate}
            onChange={setPurchaseDate}
            placeholder="MM/DD/YYYY"
          />
          </AccordionRow>
          </View>

          <View style={styles.detailsBox}>
          <AccordionRow
            label="DESCRIPTION"
            icon="document-text"
            summary={(description || "—") as any}
            open={openKey === "description"}
            onToggle={() => toggle("description")}
            lastRow
            testID="acc-description"
          >
          <Text style={styles.label}>DESCRIPTION</Text>
          <TextInput testID="desc-input" placeholder="Detailed notes..." placeholderTextColor={theme.colors.textMuted}
            value={description} onChangeText={setDescription}
            style={[styles.input, { height: 90, textAlignVertical: "top" }]} multiline />
          </AccordionRow>
          </View>
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
                  <Text style={{ color: theme.colors.danger, fontSize: 9, flex: 1 }}>
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

      {/* AI Receipt Scan — Item Picker (multi-item receipts) */}
      <Modal
        visible={scanItemPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setScanItemPickerOpen(false)}
      >
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: "92%" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Ionicons name="list" size={18} color={theme.colors.accent} />
              <Text style={styles.modalTitle}>PICK AN ITEM</Text>
            </View>
            <Text style={[styles.helper, { marginBottom: 12 }]}>
              {scanItems.length} item{scanItems.length === 1 ? "" : "s"} found on this receipt. Tap one to add to your inventory. After saving, we'll ask if you want to add another.
            </Text>
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {scanItems.map((it: any, i: number) => {
                const imported = importedItemIdxs.includes(i);
                return (
                  <TouchableOpacity
                    key={i}
                    testID={`scan-item-${i}`}
                    style={[styles.scanItemRow, imported && { opacity: 0.5 }]}
                    onPress={() => openConfirmationForItem(i)}
                    disabled={imported}
                  >
                    <View style={styles.scanItemNum}>
                      <Text style={styles.scanItemNumText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.scanItemName} numberOfLines={2}>
                        {(it.name || "(unnamed)") + (imported ? "  ✓ ADDED" : "")}
                      </Text>
                      <Text style={styles.scanItemSub} numberOfLines={1}>
                        {[
                          it.brand,
                          it.model,
                          it.serial_number ? `# ${it.serial_number}` : "",
                          it.cost ? `$${Number(it.cost).toFixed(2)}` : "",
                          it.quantity && Number(it.quantity) > 1 ? `× ${it.quantity}` : "",
                        ].filter(Boolean).join(" · ") || "—"}
                      </Text>
                    </View>
                    {!imported && <Ionicons name="chevron-forward" size={18} color={theme.colors.accent} />}
                  </TouchableOpacity>
                );
              })}
              {!!scanResult?.raw_text && (
                <TouchableOpacity
                  testID="picker-show-raw"
                  style={[styles.btnGhost, { marginTop: 10 }]}
                  onPress={() => setScanShowRaw((v) => !v)}
                >
                  <Text style={styles.btnGhostText}>
                    {scanShowRaw ? "HIDE RAW OCR" : "SHOW RAW OCR (copy from here)"}
                  </Text>
                </TouchableOpacity>
              )}
              {scanShowRaw && !!scanResult?.raw_text && (
                <View style={styles.rawBox}>
                  <Text selectable style={styles.rawText}>{scanResult.raw_text}</Text>
                </View>
              )}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                testID="picker-cancel-btn"
                style={[styles.btnGhost, { flex: 1, marginTop: 0 }]}
                onPress={() => setScanItemPickerOpen(false)}
              >
                <Text style={styles.btnGhostText}>CLOSE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="picker-blank-btn"
                style={[styles.btnPrimary, { flex: 1 }]}
                onPress={() => openConfirmationForItem(-1)}
              >
                <Text style={styles.btnPrimaryText}>BLANK ENTRY</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* AI Receipt Scan — Confirmation Modal (per-field toggle + editable input) */}
      <Modal
        visible={scanModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setScanModalOpen(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={styles.modalBg}>
            <View style={[styles.modalCard, { maxHeight: "94%" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Ionicons name="sparkles" size={18} color={theme.colors.accent} />
                <Text style={styles.modalTitle}>
                  REVIEW & EDIT
                  {scanItems.length > 1 && scanItemIdx >= 0 ? `  (Item ${scanItemIdx + 1} of ${scanItems.length})` : ""}
                </Text>
              </View>
              <Text style={[styles.helper, { marginBottom: 8 }]}>
                Toggle each field to control what's filled in. Edit any value below — the AI guess is just a starting point. Receipt labels like "Part #", "Item #", "SKU" usually map to Model #.
              </Text>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 540 }}>
                {!!scanImageUri && (
                  <Image source={{ uri: scanImageUri }} style={styles.scanPreview} resizeMode="contain" />
                )}
                {[
                  { key: "name", label: "NAME", placeholder: "Cordless drill", keyboard: "default" },
                  { key: "brand", label: "BRAND", placeholder: "DeWalt", keyboard: "default" },
                  // "MODEL" (brand-product-model) field intentionally
                  // omitted — see edit-screen comment near the BRAND
                  // input. Receipts that previously suggested a model
                  // code should write it into the MODEL # / Part #
                  // field instead.
                  { key: "serial_number", label: "MODEL #  /  PART #  /  SKU", placeholder: "e.g. 56789-A", keyboard: "default" },
                  { key: "cost", label: "COST ($)", placeholder: "0.00", keyboard: "decimal-pad" },
                  { key: "quantity", label: "QUANTITY", placeholder: "1", keyboard: "number-pad" },
                  { key: "purchase_date", label: "PURCHASE DATE (YYYY-MM-DD)", placeholder: "2025-06-15", keyboard: "default" },
                  { key: "dealer", label: "DEALER (we'll match or offer to add)", placeholder: "Snap-on", keyboard: "default" },
                  { key: "sold_by", label: "SOLD BY  /  SALES REP (will match an agent on the dealer)", placeholder: "Wade Miller", keyboard: "default" },
                  { key: "description", label: "DESCRIPTION", placeholder: "Optional notes", keyboard: "default" },
                ].map((f) => (
                  <View key={f.key} style={styles.scanEditRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                      <Text style={[styles.scanRowLabel, { flex: 1 }]}>{f.label}</Text>
                      <Switch
                        testID={`scan-toggle-${f.key}`}
                        value={!!scanApply[f.key]}
                        onValueChange={(v) => setScanApply((s) => ({ ...s, [f.key]: v }))}
                        trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                        thumbColor="#fff"
                      />
                    </View>
                    <TextInput
                      testID={`scan-input-${f.key}`}
                      value={scanFields[f.key] || ""}
                      onChangeText={(v) => setScanFields((s) => ({ ...s, [f.key]: v }))}
                      placeholder={f.placeholder}
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType={f.keyboard as any}
                      style={[
                        styles.input,
                        !scanApply[f.key] && { opacity: 0.45 },
                      ]}
                      multiline={f.key === "description"}
                      autoCapitalize={f.key === "dealer" || f.key === "brand" || f.key === "name" ? "words" : "none"}
                    />
                  </View>
                ))}

                {!!scanResult?.raw_text && (
                  <>
                    <TouchableOpacity
                      testID="scan-show-raw"
                      style={[styles.btnGhost, { marginTop: 10 }]}
                      onPress={() => setScanShowRaw((v) => !v)}
                    >
                      <Text style={styles.btnGhostText}>
                        {scanShowRaw ? "HIDE RAW OCR" : "SHOW RAW OCR (tap & hold to copy)"}
                      </Text>
                    </TouchableOpacity>
                    {scanShowRaw && (
                      <View style={styles.rawBox}>
                        <Text selectable style={styles.rawText}>{scanResult.raw_text}</Text>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  testID="scan-back-btn"
                  style={[styles.btnGhost, { flex: 1, marginTop: 0 }]}
                  onPress={() => {
                    setScanModalOpen(false);
                    if (scanItems.length > 1) setScanItemPickerOpen(true);
                  }}
                >
                  <Text style={styles.btnGhostText}>{scanItems.length > 1 ? "BACK" : "CANCEL"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="scan-apply-btn"
                  style={[styles.btnPrimary, { flex: 1 }]}
                  onPress={applyScanResult}
                >
                  <Text style={styles.btnPrimaryText}>APPLY</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Dealer not found — Add as new / Choose existing / Skip */}
      <Modal
        visible={dealerNotFoundOpen}
        transparent
        animationType="fade"
        onRequestClose={() => handleDealerNotFoundAction("skip")}
      >
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: "60%" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Ionicons name="alert-circle" size={18} color={theme.colors.accent} />
              <Text style={styles.modalTitle}>DEALER NOT FOUND</Text>
            </View>
            <Text style={[styles.helper, { marginBottom: 16 }]}>
              The receipt mentions a dealer that isn't in your list yet:
            </Text>
            <View style={[styles.dealerInfoBox, { marginBottom: 12 }]}>
              <Ionicons name="storefront" size={14} color={theme.colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.dealerInfoLabel}>DETECTED ON RECEIPT</Text>
                <Text style={styles.dealerInfoVal}>{dealerNotFoundName || "(unknown)"}</Text>
              </View>
            </View>
            <Text style={[styles.helper, { marginBottom: 12 }]}>
              What would you like to do?
            </Text>
            <TouchableOpacity
              testID="dealer-nf-add"
              style={[styles.btnPrimary, { marginTop: 0, marginBottom: 8 }]}
              onPress={() => handleDealerNotFoundAction("add")}
            >
              <Text style={styles.btnPrimaryText}>+ ADD &quot;{dealerNotFoundName}&quot; AS NEW DEALER</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="dealer-nf-choose"
              style={[styles.btnGhost, { marginTop: 0, marginBottom: 8 }]}
              onPress={() => handleDealerNotFoundAction("choose")}
            >
              <Text style={styles.btnGhostText}>CHOOSE FROM EXISTING DEALERS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="dealer-nf-skip"
              style={[styles.btnGhost, { marginTop: 0 }]}
              onPress={() => handleDealerNotFoundAction("skip")}
            >
              <Text style={styles.btnGhostText}>SKIP (NO DEALER)</Text>
            </TouchableOpacity>
          </View>
        </View>
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

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  topBarBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { color: c.textPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  saveText: { color: c.accent, fontWeight: "900", letterSpacing: 2, fontSize: 10 },
  label: {
    color: c.textMuted, fontSize: 8, fontWeight: "800",
    letterSpacing: 2, marginTop: 16, marginBottom: 6,
  },
  input: {
    backgroundColor: c.bgSecondary, borderWidth: 1, borderColor: c.border,
    color: c.textPrimary, paddingHorizontal: 14, paddingVertical: 12,
    minHeight: 48, borderRadius: 4, fontSize: 11,
  
    ...(theme.elevation.input as object),
  },
  // Compact input — slim variant for stacked rows (model/serial numbers).
  // Same look as `input` but tighter padding + smaller min-height so a
  // list of inputs stays visually professional and not bloated.
  // Compact label/toggle/chip variants — used inside the WARRANTY
  // accordion (per user 2026-05-27: match the smaller Model/Serial #
  // formatting). Tighter spacing, smaller font sizes.
  labelSm: {
    color: c.textMuted, fontSize: 8, fontWeight: "900", letterSpacing: 1.5,
    marginTop: 8, marginBottom: 4,
  },
  toggleRowCompact: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 4, marginBottom: 4,
  },
  toggleTextCompact: {
    color: c.textPrimary, fontSize: 10, fontWeight: "800",
    letterSpacing: 1.2, flex: 1,
  },
  warrChipSm: {
    paddingHorizontal: 9, paddingVertical: 5, marginRight: 5, marginBottom: 5,
    borderRadius: 3, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  warrChipTextSm: {
    color: c.textPrimary, fontSize: 9, fontWeight: "800", letterSpacing: 1,
  },
  compactInput: {
    backgroundColor: c.bgSecondary, borderWidth: 1, borderColor: c.border,
    color: c.textPrimary, paddingHorizontal: 10, paddingVertical: 7,
    minHeight: 34, borderRadius: 4, fontSize: 11,
  },
  // Small inline delete icon button used in stacked input rows.
  removeIconBtn: {
    width: 28, height: 28, alignItems: "center", justifyContent: "center",
    borderRadius: 4, backgroundColor: "rgba(220,38,38,0.08)",
  },
  row2: { flexDirection: "row", gap: 10 },
  helper: { color: c.textMuted, fontStyle: "italic", fontSize: 10 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: c.border, borderRadius: 4 },
  chipActive: { backgroundColor: "transparent", borderColor: c.accent, borderWidth: 2 },
  chipText: { color: c.textSecondary, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  chipTextActive: { color: c.accent },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomColor: c.borderSubtle,
    borderBottomWidth: 1,
    backgroundColor: c.bgSecondary,
  },
  locRowActive: { backgroundColor: c.accent },
  locText: { color: c.textPrimary, fontSize: 10, fontWeight: "600" },
  pickerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: c.bgSecondary, borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 4,
  
    ...(theme.elevation.md as object),
  },
  pickerText: { color: c.textPrimary, flex: 1, fontWeight: "600", fontSize: 10 },
  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 14, marginTop: 16,
    borderTopWidth: 1, borderTopColor: c.border,
  },
  toggleText: { color: c.textPrimary, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, flex: 1 },
  subSection: {
    marginTop: 4, paddingLeft: 12,
    borderLeftWidth: 2, borderLeftColor: c.accent,
  },
  // Single Description Card container that wraps each accordion GROUP on
  // the Tool Edit screen — visually identical to the detailsBox on
  // tool/[id].tsx. Multiple detailsBox cards stack with a top margin to
  // create visible section breaks between groups (NAME/PRICE/LOCATION,
  // PHOTOS/DOCUMENTS/RECEIPTS, WARRANTY/MAINTENANCE/CONSUMABLE, etc.).
  detailsBox: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 2,
    marginTop: 16,
    ...(theme.elevation.md as object),
  },
  photoWrap: { marginRight: 8, position: "relative" },
  photo: { width: 100, height: 100, borderRadius: 4, borderWidth: 1, borderColor: c.border },
  photoRemove: {
    position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.7)",
    width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12,
  },
  photoAdd: {
    width: 100, height: 100, borderWidth: 2, borderStyle: "dashed", borderColor: c.border,
    alignItems: "center", justifyContent: "center", marginRight: 8, borderRadius: 4, gap: 4,
  },
  photoAddText: { color: c.accent, fontSize: 7, fontWeight: "800", letterSpacing: 1 },
  docRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: c.bgSecondary, borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6, borderRadius: 4,
  
    ...(theme.elevation.md as object),
  },
  docName: { color: c.textPrimary, flex: 1, fontSize: 10 },
  docAdd: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderStyle: "dashed", borderColor: c.border,
    paddingVertical: 14, borderRadius: 4,
  },
  docAddText: { color: c.accent, fontWeight: "800", letterSpacing: 1.5, fontSize: 9 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: c.bgSecondary, padding: 20,
    borderTopWidth: 2, borderTopColor: c.accent,
  },
  modalTitle: { color: c.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 2, marginBottom: 12 },
  dealerOpt: {
    paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1,
    borderColor: c.border, marginBottom: 6, borderRadius: 4,
  },
  dealerOptName: { color: c.textPrimary, fontWeight: "700" },
  dealerOptSub: { color: c.textSecondary, fontSize: 9, marginTop: 2 },
  btnGhost: {
    borderWidth: 1, borderColor: c.border, height: 48, marginTop: 8,
    alignItems: "center", justifyContent: "center", borderRadius: 4,
  },
  btnGhostText: { color: c.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 10 },
  btnPrimary: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    backgroundColor: c.accent,
  },
  btnPrimaryText: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 10 },
  newInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: c.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radii.sm,
  },
  newInlineBtnText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 9,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    backgroundColor: c.bg,
    borderTopWidth: 1,
    borderTopColor: c.border,
    ...(theme.elevation.lg as object),
  },
  bottomSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    backgroundColor: c.accent,
    borderRadius: theme.radii.sm,
    ...(theme.elevation.accent as object),
  },
  bottomSaveText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 2.5,
    fontSize: 11,
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
    borderColor: c.border,
    borderRadius: theme.radii.pill,
    backgroundColor: c.bgSecondary,
    minWidth: 56,
    alignItems: "center",
  
    ...(theme.elevation.md as object),
  },
  warrChipOn: {
    backgroundColor: "transparent",
    borderColor: c.accent,
    borderWidth: 2,
  },
  warrChipText: {
    color: c.textSecondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  warrChipTextOn: {
    color: c.accent,
    fontWeight: "900",
  },
  warrInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(249, 115, 22,0.08)",
    borderLeftWidth: 3,
    borderLeftColor: c.accent,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 4,
    marginTop: 4,
  },
  warrInfoText: {
    color: c.textSecondary,
    fontSize: 9,
    flex: 1,
    lineHeight: 12,
  },
  dealerInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.bgSecondary,
    borderLeftWidth: 3,
    borderLeftColor: c.accent,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 4,
    marginVertical: 8,
  },
  dealerInfoLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  dealerInfoVal: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
  },
  dealerInfoSub: {
    color: c.accent,
    fontSize: 8,
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
    backgroundColor: c.bgSecondary,
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
    borderColor: c.accent,
    borderRadius: 6,
    marginTop: 6,
  },
  addPhotoText: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  scanBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
    ...(theme.elevation.accent as object),
  },
  scanBannerText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 12,
  },
  scanBannerSub: {
    color: "#000",
    opacity: 0.7,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 2,
  },
  smallScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: c.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  smallScanBtnText: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 8,
    letterSpacing: 1.5,
  },
  receiptBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: c.accent,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  scanPreview: {
    width: "100%",
    height: 200,
    backgroundColor: "#000",
    borderRadius: 6,
    marginBottom: 12,
  },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  scanEditRow: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  scanRowLabel: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  scanRowValue: {
    color: c.textPrimary,
    fontSize: 11,
    fontWeight: "600",
  },
  scanItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    marginBottom: 6,
  },
  scanItemNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  scanItemNumText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 11,
  },
  scanItemName: {
    color: c.textPrimary,
    fontSize: 11,
    fontWeight: "800",
  },
  scanItemSub: {
    color: c.textSecondary,
    fontSize: 9,
    marginTop: 3,
  },
  rawBox: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    padding: 10,
    borderRadius: 4,
    marginTop: 6,
    maxHeight: 200,
  },
  rawText: {
    color: c.textSecondary,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
}));
