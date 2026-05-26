import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  TextInput,
  Platform,
  Linking,
  KeyboardAvoidingView,
  ActivityIndicator,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useAppResume } from "../../src/appLifecycle";
import * as ImagePicker from "expo-image-picker";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { printReportHtml } from "../../src/printHtml";
import { confirm } from "../../src/confirm";
import { compressForPdf, compressManyForPdf } from "../../src/pdfImage";
import { formatDateUS } from "../../src/dateUtil";
import { DateField } from "../../src/DateField";
import {
  LostStatusBanner,
  ReportLostButton,
} from "../../src/sections/LostStatusSection";
import { DocumentsSection } from "../../src/sections/DocumentsSection";
import { LocationPicker } from "../../src/Pickers";
import { ReceiptsSection } from "../../src/sections/ReceiptsSection";
import { MaintenanceSection } from "../../src/sections/MaintenanceSection";
import { WarrantySection } from "../../src/sections/WarrantySection";
import PinchZoomImageViewer from "../../src/components/PinchZoomImageViewer";
import { themedStyles } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";

import {
  pickContactNativeIOS,
  loadAllDeviceContactsAndroid,
  isAndroidPickerNeeded,
  isDeviceContactsAvailable,
  type PickedContact,
} from "../../src/deviceContacts";

export default function ToolDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tool, setTool] = useState<any>(null);
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [dealers, setDealers] = useState<any[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [coMode, setCoMode] = useState<"saved" | "free">("saved");
  const [coName, setCoName] = useState("");
  /** Phone (or any contact string — email is also fine) typed in the FREE
   *  TEXT mode of the checkout modal. When non-empty AND we're in free-text
   *  mode, doCheckout() persists this person into the borrowers list as a
   *  side-effect so they show up under FROM LIST next time. */
  const [coPhone, setCoPhone] = useState("");
  const [coBorrowerId, setCoBorrowerId] = useState<string | null>(null);
  const [coNotes, setCoNotes] = useState("");
  const [photoIdx, setPhotoIdx] = useState(0);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  // Which pillbox in the Attachments section is currently expanded.
  // All rows start collapsed — user taps to expand any one.
  const [attachOpen, setAttachOpen] = useState<
    "gallery" | "documents" | "receipts" | "maintenance" | "warranty" | null
  >(null);
  // Tap the QUANTITY pillbox in the photo row to open the stepper.
  const [showQtyModal, setShowQtyModal] = useState(false);

  // Repair modal
  const todayStr = () => new Date().toISOString().substring(0, 10);
  const [showRepair, setShowRepair] = useState(false);
  const [showMarkSold, setShowMarkSold] = useState(false);
  const [showSoldDelete, setShowSoldDelete] = useState(false);
  const [showSaleListing, setShowSaleListing] = useState(false);
  const [saleForm, setSaleForm] = useState({ price: "", notes: "" });
  const [saleBusy, setSaleBusy] = useState(false);
  const [markSoldForm, setMarkSoldForm] = useState({
    sold_price: "",
    sold_to: "",
    sold_at: new Date().toISOString().substring(0, 10),
    sold_notes: "",
    sold_quantity: "",
  });
  const [markSoldBusy, setMarkSoldBusy] = useState(false);

  // For-Sale poster builder modal
  const [showPosterBuilder, setShowPosterBuilder] = useState(false);
  // PDF type picker modal (replaces Alert.alert which is broken on RN Web)
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  // Location picker — opened when user taps the LOCATION pill so they can
  // reassign THIS TOOL to a different existing location. (User report #3:
  // previously the pill navigated to /locations which let the user re-parent
  // the location ITSELF, not the tool. Confusing & destructive.)
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  type PosterFieldKey =
    | "photo"
    | "price"
    | "name"
    | "brand"
    | "model"
    | "serial"
    | "condition"
    | "category"
    | "purchase_date"
    | "description"
    | "sale_notes"
    | "contact_name"
    | "contact_phone"
    | "contact_email";
  const [posterFields, setPosterFields] = useState<Record<PosterFieldKey, boolean>>({
    photo: true,
    price: true,
    name: true,
    brand: true,
    model: true,
    serial: false,
    condition: true,
    category: false,
    purchase_date: false,
    description: true,
    sale_notes: true,
    contact_name: true,
    contact_phone: true,
    contact_email: false,
  });

  const openSaleModal = () => {
    setSaleForm({
      price: tool?.sale_price ? String(tool.sale_price) : "",
      notes: tool?.sale_notes || "",
    });
    setShowSaleListing(true);
  };

  const submitSaleListing = async () => {
    setSaleBusy(true);
    try {
      const price = parseFloat(saleForm.price);
      if (isNaN(price) || price < 0) {
        Alert.alert("Invalid price", "Please enter a valid sale price.");
        setSaleBusy(false);
        return;
      }
      await api.updateTool(tool.id, {
        for_sale: true,
        sale_price: price,
        sale_listed_at:
          tool?.sale_listed_at || new Date().toISOString().substring(0, 10),
        sale_notes: saleForm.notes,
      });
      setShowSaleListing(false);
      load();
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setSaleBusy(false);
    }
  };
  const [repairForm, setRepairForm] = useState({
    company_notified: "",
    notified_at: "",
    expected_completion: "",
    repair_status: "Not Reported",
    contact: "",
    notes: "",
    broken_photo: "",
  });

  // Pick the photo of the broken/damaged item for a repair claim.
  // Supports BOTH "camera" (take a new photo right now) and "library"
  // (pick an existing one). Previously this was library-only which
  // was surprising — most repair flows involve the user holding the
  // broken part in their hand, not browsing the camera roll.
  const pickBrokenPhoto = async (src: "camera" | "library" = "library") => {
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
      const opts: any = { quality: 0.6, base64: true };
      const res =
        src === "camera"
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync({
              ...opts,
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
            });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        const data =
          a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
        setRepairForm((f) => ({ ...f, broken_photo: data }));
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not pick photo");
    }
  };

  // Add a photo to this tool from camera or library, then save to backend
  const addToolPhoto = async (src: "camera" | "library") => {
    try {
      const perm =
        src === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", `Please grant ${src === "camera" ? "camera" : "photo library"} access.`);
        return;
      }
      const opts: any = { quality: 0.7, allowsEditing: false, base64: true };
      const res =
        src === "camera"
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync({
              ...opts,
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
            });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const data = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      const next = [...(tool?.photos || []), data];
      await api.updateTool(tool.id, { photos: next });
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not add photo");
    }
  };

  const promptAddPhoto = () => {
    Alert.alert("Add a photo", "Choose source", [
      { text: "Take Photo", onPress: () => addToolPhoto("camera") },
      { text: "Choose from Library", onPress: () => addToolPhoto("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // User report #4: receipts can now be added directly from the detail page
  // (used to require opening the edit screen). Mirrors addToolPhoto.
  const addToolReceipt = async (src: "camera" | "library") => {
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
      const opts: any = { quality: 0.7, allowsEditing: false, base64: true };
      const res =
        src === "camera"
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync({
              ...opts,
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
            });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const data = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      const next = [...(tool?.receipts || []), data];
      await api.updateTool(tool.id, { receipts: next });
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not add receipt");
    }
  };

  const promptAddReceipt = () => {
    Alert.alert("Add a receipt", "Choose source", [
      { text: "Take Photo", onPress: () => addToolReceipt("camera") },
      { text: "Choose from Library", onPress: () => addToolReceipt("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [t, b, d] = await Promise.all([
        api.getTool(id),
        api.listBorrowers(),
        api.listDealers(),
      ]);
      setTool(t);
      setBorrowers(b);
      setDealers(d || []);
    } catch {
      Alert.alert("Error", "Tool not found");
      router.back();
    }
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


  if (!tool) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: theme.colors.textPrimary, padding: 20 }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const doCheckout = async () => {
    const name = coMode === "saved"
      ? borrowers.find((b) => b.id === coBorrowerId)?.name
      : coName.trim();
    if (!name) {
      Alert.alert("Required", "Pick a person or enter a name.");
      return;
    }
    try {
      // If the user typed a NEW person via FREE TEXT, persist them into
      // the borrowers list as a side effect so they show up under FROM
      // LIST on the next checkout — this is what users expect when they
      // enter someone manually or import from device contacts.
      let resolvedId: string | null = coMode === "saved" ? coBorrowerId : null;
      if (coMode === "free") {
        try {
          // Reuse an existing borrower with the same name (case-insensitive)
          // when possible — otherwise we'd keep creating duplicate "John"s
          // every time the user checks something out to him.
          const existing = borrowers.find(
            (b: any) => (b.name || "").trim().toLowerCase() === name.toLowerCase(),
          );
          if (existing) {
            resolvedId = existing.id;
            // If we now have a phone AND the existing borrower has no
            // contact info, backfill it — silently improves the contact
            // list over time.
            if (coPhone.trim() && !(existing.contact || "").trim()) {
              await api
                .updateBorrower(existing.id, { name: existing.name, contact: coPhone.trim() })
                .catch(() => null);
            }
          } else {
            const created: any = await api
              .createBorrower({ name, contact: coPhone.trim() })
              .catch(() => null);
            if (created?.id) resolvedId = created.id;
          }
        } catch {
          /* non-fatal — fall back to anonymous free-text checkout */
        }
      }
      await api.checkoutTool(tool.id, {
        borrower_name: name,
        borrower_id: resolvedId,
        notes: coNotes,
      });
      setShowCheckout(false);
      setCoName("");
      setCoPhone("");
      setCoBorrowerId(null);
      setCoNotes("");
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Checkout failed");
    }
  };

  const doCheckin = async () => {
    try {
      await api.checkinTool(tool.id);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Check in failed");
    }
  };

  const doDelete = async () => {
    if (!(await confirm("Delete tool?", "This cannot be undone.", "Delete", true))) return;
    await api.deleteTool(tool.id);
    router.back();
  };

  const notifyDealer = async (t: any, mode: "email" | "sms") => {
    try {
      const dealers = await api.listDealers();
      const dealer = dealers.find((d: any) => d.id === t.dealer_id);
      if (!dealer) {
        const ok = await confirm(
          "No dealer assigned",
          "This tool has no dealer. Add a dealer to send a repair / warranty request.",
          "Open Dealers"
        );
        if (ok) router.push("/dealers");
        return;
      }
      const agent = dealer?.agents?.find((a: any) => a.id === dealer?.current_agent_id);
      const phone = (agent?.phone || dealer?.phone || "").replace(/[^\d+]/g, "");
      const email = (agent?.email || "").trim();

      // Prompt to add contact info if missing
      if ((mode === "email" && !email) || (mode === "sms" && !phone)) {
        const target = mode === "email" ? "email address" : "phone number";
        const ok = await confirm(
          `No ${target} on file`,
          `${dealer.name} doesn't have a${mode === "email" ? "n " : " "}${target} for the current agent.\n\nWould you like to open the dealer page to add it?`,
          "Open Dealer"
        );
        if (ok) router.push(`/dealer/${dealer.id}`);
        return;
      }

      // Exact template requested. User report #7: if a photo is attached to
      // the claim we ACTUALLY attach it now (used to just mention it in text).
      const greetName = agent?.name || dealer.name;
      const _mnsForEmail: string[] = (Array.isArray(t.model_numbers) && t.model_numbers.length)
        ? t.model_numbers.filter((s: any) => !!s)
        : (t.serial_number ? [String(t.serial_number)] : []);
      const _snsForEmail: string[] = Array.isArray(t.serial_numbers)
        ? t.serial_numbers.filter((s: any) => !!s) : [];
      const lines = [
        `Hello ${greetName}, I have a repair/warranty tool.`,
        `Tool: ${t.name}`,
        `Model Number${_mnsForEmail.length > 1 ? "s" : ""}: ${_mnsForEmail.length ? _mnsForEmail.join(", ") : "N/A"}`,
        `Serial Number${_snsForEmail.length === 1 ? "" : "s"}: ${_snsForEmail.length ? _snsForEmail.join(", ") : "N/A"}`,
        `Purchase date: ${formatDateUS(t.purchase_date) || "N/A"}`,
      ];
      const subject = `Repair / Warranty: ${t.name}`;
      const bodyText = lines.join("\n");
      const photoB64 = t.repair_info?.broken_photo || "";

      // Helper: write the base64 broken-photo to a temp file so it can be
      // passed to MailComposer / Sharing as a file:// URI.
      const photoFileUri = await (async () => {
        if (!photoB64) return null;
        try {
          const FileSystem = await import("expo-file-system");
          // Strip "data:image/jpeg;base64," prefix if present.
          const stripped = photoB64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
          const path = `${FileSystem.cacheDirectory}claim-${t.id}.jpg`;
          await FileSystem.writeAsStringAsync(path, stripped, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return path;
        } catch (_e) {
          return null;
        }
      })();

      if (mode === "email") {
        // Use expo-mail-composer — supports attachments natively on iOS/Android.
        const MailComposer = await import("expo-mail-composer");
        const available = await MailComposer.isAvailableAsync();
        if (available) {
          await MailComposer.composeAsync({
            recipients: [email],
            subject,
            body: bodyText,
            attachments: photoFileUri ? [photoFileUri] : undefined,
          });
        } else {
          // Fallback to mailto: (no attachment possible, but at least drafts).
          const subEnc = encodeURIComponent(subject);
          const bodyEnc = encodeURIComponent(
            bodyText + (photoB64 ? "\n\n(A photo of the broken item is available — open this draft in your Mail app to receive it as an attachment.)" : ""),
          );
          const url = `mailto:${email}?subject=${subEnc}&body=${bodyEnc}`;
          if (Platform.OS === "web") {
            (globalThis as any).window.location.href = url;
          } else {
            await Linking.openURL(url);
          }
        }
      } else {
        // SMS path. iOS/Android SMS URLs can't attach images directly. If we
        // have a photo, route through the share sheet (Sharing.shareAsync)
        // which lets the user pick Messages and pre-fills the photo + text.
        // Without a photo, just open the SMS draft URL as before.
        if (photoFileUri) {
          const Sharing = await import("expo-sharing");
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(photoFileUri, {
              mimeType: "image/jpeg",
              dialogTitle: bodyText, // shown on some platforms
              UTI: "public.jpeg",
            });
          } else {
            const url = `sms:${phone}?body=${encodeURIComponent(bodyText)}`;
            await Linking.openURL(url);
          }
        } else {
          const url = `sms:${phone}?body=${encodeURIComponent(bodyText)}`;
          if (Platform.OS === "web") {
            (globalThis as any).window.location.href = url;
          } else {
            await Linking.openURL(url);
          }
        }
      }

      // Auto-mark as Reported once notified
      const cur = t.repair_info?.repair_status || "Not Reported";
      if (cur === "Not Reported") {
        await api.updateTool(t.id, {
          repair_info: {
            ...(t.repair_info || {}),
            company_notified: dealer?.name || "",
            contact: agent?.name || "",
            notified_at: new Date().toISOString().substring(0, 10),
            repair_status: "Reported",
          },
        });
        load();
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const openRepair = () => {
    // Auto-fill the repair company from the tool's already-assigned dealer.
    // The repair always goes to the dealer the tool was bought from — this
    // shouldn't be a separate choice inside the repair flow.
    const linkedDealer = dealers.find((d: any) => d.id === tool?.dealer_id);
    const linkedAgent = linkedDealer?.agents?.find(
      (a: any) => a.id === linkedDealer?.current_agent_id,
    );
    const dealerName =
      tool?.repair_info?.company_notified || linkedDealer?.name || "";
    const contact =
      tool?.repair_info?.contact ||
      linkedAgent?.name ||
      linkedAgent?.phone ||
      linkedDealer?.phone ||
      "";
    setRepairForm({
      company_notified: dealerName,
      notified_at: tool.repair_info?.notified_at || todayStr(),
      expected_completion: tool.repair_info?.expected_completion || "",
      repair_status: tool.repair_info?.repair_status || "Not Reported",
      contact,
      notes: tool.repair_info?.notes || "",
      broken_photo: tool.repair_info?.broken_photo || "",
    });
    setShowRepair(true);
  };

  const saveRepair = async () => {
    try {
      await api.updateTool(tool.id, {
        needs_repair: true,
        repair_info: { ...repairForm },
      });
      setShowRepair(false);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not save repair info");
    }
  };

  const markRepaired = async () => {
    try {
      await api.updateTool(tool.id, {
        needs_repair: false,
        repair_info: null,
      });
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not update tool");
    }
  };

  const exportPdf = () => {
    // Use an in-app Modal instead of Alert.alert — RN-Web's Alert.alert
    // implementation does not render the buttons array, so on web users
    // saw nothing. The modal works identically on web AND native.
    setShowExportPicker(true);
  };

  const handlePickPoster = () => {
    setShowExportPicker(false);
    setShowPosterBuilder(true);
  };

  const handlePickStandard = async () => {
    setShowExportPicker(false);
    const hasReceipts = Array.isArray(tool.receipts) && tool.receipts.length > 0;
    if (hasReceipts) {
      const yes = await confirm(
        "Include receipts?",
        `This item has ${tool.receipts.length} receipt${tool.receipts.length === 1 ? "" : "s"} attached. Append them to the report (each on its own page)?`,
        "Yes, include",
      );
      await doExportPdf(yes);
    } else {
      await doExportPdf(false);
    }
  };

  // Poster generator — produces a single-page "FOR SALE" flyer using the
  // user's currently-toggled fields.
  const generateForSalePoster = async () => {
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const F = posterFields;
    let profile: any = null;
    if (F.contact_name || F.contact_phone || F.contact_email) {
      try {
        profile = await api.getPersonalProfile();
      } catch {
        profile = null;
      }
    }
    // Compress the hero photo before embedding. Camera photos can be 5+ MB
    // base64-encoded, which causes iOS WKWebView's print pipeline to silently
    // hang. compressForPdf is a no-op for empty strings.
    const heroPhotoRaw = F.photo && photos.length > 0 ? photos[0] : "";
    const heroPhoto = heroPhotoRaw
      ? await compressForPdf(heroPhotoRaw, { maxWidth: 1100, quality: 0.65 })
      : "";
    const askingPrice =
      tool?.sale_price != null ? Number(tool.sale_price).toFixed(2) : "0.00";

    // Each spec row = optional [icon-label, value]. Like a classic missing-
    // person poster, we ALWAYS show toggled-on labels (with blank values when
    // the data is missing) so the layout stays consistent and looks like a
    // proper template — never just "2 lines".
    const specRows: { label: string; value: string }[] = [];
    if (F.brand) specRows.push({ label: "Brand", value: tool.brand || "" });
    // "Model" row intentionally omitted — the for-sale flyer now uses
    // the consolidated Model # / Part # field instead.
    if (F.serial) {
      const _mns: string[] = (Array.isArray(tool.model_numbers) && tool.model_numbers.length)
        ? tool.model_numbers.filter((s: any) => !!s)
        : (tool.serial_number ? [String(tool.serial_number)] : []);
      specRows.push({
        label: _mns.length > 1 ? "Model #s" : "Model #",
        value: _mns.length ? _mns.join(", ") : "",
      });
      const _sns: string[] = Array.isArray(tool.serial_numbers)
        ? tool.serial_numbers.filter((s: any) => !!s) : [];
      if (_sns.length) {
        specRows.push({
          label: _sns.length > 1 ? "Serial #s" : "Serial #",
          value: _sns.join(", "),
        });
      }
    }
    if (F.condition)
      specRows.push({ label: "Condition", value: tool.condition || "" });
    if (F.category)
      specRows.push({ label: "Category", value: tool.category_name || "" });
    if (F.purchase_date)
      specRows.push({
        label: "Purchased",
        value: tool.purchase_date ? formatDateUS(tool.purchase_date) : "",
      });

    // Contact lines — always render the label when toggled, even if the
    // underlying profile field is empty (missing-poster fillable-line look).
    const contactLines: { label: string; value: string; bold?: boolean }[] = [];
    if (F.contact_name)
      contactLines.push({ label: "", value: profile?.name || "", bold: true });
    if (F.contact_phone)
      contactLines.push({ label: "Phone", value: profile?.phone || "" });
    if (F.contact_email)
      contactLines.push({ label: "Email", value: profile?.email || "" });

    // Lay specs out as a 2-column "vital stats" grid (4 td's per row).
    const specPairsHtml: string[] = [];
    for (let i = 0; i < specRows.length; i += 2) {
      const a = specRows[i];
      const b = specRows[i + 1];
      specPairsHtml.push(`
        <tr>
          <td class="lab">${a ? esc(a.label).toUpperCase() : ""}</td>
          <td class="val">${a ? esc(a.value) : ""}</td>
          <td class="lab">${b ? esc(b.label).toUpperCase() : ""}</td>
          <td class="val">${b ? esc(b.value) : ""}</td>
        </tr>`);
    }

    // CLASSIC POSTER design — modeled on the missing-person poster aesthetic.
    // Red banners top + bottom, photo on the LEFT and stats list on the RIGHT,
    // big red ASKING PRICE prompt in the middle, all on a single letter page.
    // 100% xhtml2pdf-safe (table layout, no inline-block / flex / gradients).
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: letter; margin: 0.35in; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    color: #000000;
    font-size: 10.5pt;
  }
  table { border-collapse: collapse; }
  p, div { margin: 0; padding: 0; }

  /* === TOP RED BANNER ("FOR SALE") === */
  table.top-banner { width: 100%; }
  td.top-banner-cell {
    background-color: #FFFFFF;
    color: #DC2626;
    text-align: center;
    font-size: 56pt;
    font-weight: bold;
    letter-spacing: 4pt;
    padding: 10pt 0 12pt 0;
    line-height: 1;
    border-top: 4pt solid #DC2626;
    border-bottom: 4pt solid #DC2626;
  }

  /* === ITEM NAME === */
  table.name-band { width: 100%; }
  td.name-text {
    text-align: center;
    font-size: 16pt;
    font-weight: bold;
    color: #000000;
    text-transform: uppercase;
    letter-spacing: 1pt;
    padding: 8pt 0 6pt 0;
  }

  /* === PHOTO + SPECS (side-by-side row) === */
  table.photo-specs { width: 100%; }
  td.photo-cell {
    width: 48%;
    text-align: left;
    vertical-align: top;
    padding: 0 10pt 0 0;
  }
  img.hero-photo {
    /* Max-only sizing preserves natural aspect ratio (no stretching). */
    max-width: 3.2in;
    max-height: 2.6in;
    border: 2pt solid #000000;
  }
  td.specs-cell {
    width: 52%;
    vertical-align: top;
    padding: 2pt 0 0 8pt;
  }
  table.specs-list { width: 100%; }
  table.specs-list td {
    padding: 2pt 0;
    vertical-align: top;
    font-size: 10.5pt;
  }
  td.spec-lab {
    color: #000000;
    font-weight: bold;
    font-size: 9.5pt;
    letter-spacing: 0.5pt;
    width: 38%;
    text-transform: uppercase;
  }
  td.spec-val {
    color: #000000;
    width: 62%;
    border-bottom: 0.75pt solid #000000;
    padding-bottom: 3pt;
  }

  /* === ASKING PRICE PROMPT (the big red middle callout) === */
  table.price-prompt { width: 100%; margin-top: 8pt; }
  td.price-prompt-cell {
    text-align: center;
    color: #DC2626;
    font-size: 26pt;
    font-weight: bold;
    letter-spacing: 1pt;
    padding: 4pt 0;
    line-height: 1.1;
  }

  /* === DESCRIPTION (optional, small below price) === */
  table.desc-band { width: 100%; margin-top: 2pt; }
  td.desc-text {
    text-align: center;
    color: #1a1a1a;
    font-size: 9.5pt;
    line-height: 1.3;
    padding: 2pt 8pt 2pt 8pt;
  }

  /* === BOTTOM RED BANNER ("CONTACT") === */
  table.bot-banner { width: 100%; margin-top: 8pt; }
  td.bot-banner-cell {
    background-color: #DC2626;
    color: #FFFFFF;
    text-align: center;
    font-size: 12pt;
    font-weight: bold;
    letter-spacing: 3pt;
    padding: 7pt 0;
  }

  /* === CONTACT WHITE BOX (inside red bottom area) === */
  table.contact-box { width: 100%; }
  td.contact-cell {
    background-color: #DC2626;
    padding: 0 12pt 10pt 12pt;
  }
  table.contact-inner {
    width: 100%;
    background-color: #FFFFFF;
    border: 2pt solid #000000;
  }
  td.contact-line-bold {
    text-align: center;
    font-size: 14pt;
    font-weight: bold;
    color: #000000;
    padding: 6pt 8pt 1pt 8pt;
    text-transform: uppercase;
    letter-spacing: 1pt;
  }
  td.contact-line {
    text-align: center;
    font-size: 11pt;
    color: #000000;
    padding: 1pt 8pt;
  }
  td.contact-line-pad-bottom {
    padding-bottom: 6pt;
  }

  /* === FOOTER (inlined into the red contact box) === */
  .footer-inline {
    text-align: center;
    color: #ffcccc;
    font-size: 6.5pt;
    letter-spacing: 2pt;
    padding-top: 6pt;
  }
</style>
</head>
<body>

  <!-- TOP RED BANNER -->
  <table class="top-banner"><tr><td class="top-banner-cell">FOR SALE</td></tr></table>

  ${
    F.name
      ? `<table class="name-band"><tr><td class="name-text">${esc(tool.name) || "(UNNAMED)"}</td></tr></table>`
      : ""
  }

  <!-- PHOTO LEFT, SPECS RIGHT -->
  <table class="photo-specs"><tr>
    <td class="photo-cell">${
      heroPhoto
        ? `<img class="hero-photo" src="${heroPhoto}"/>`
        : `<div style="width: 3.4in; height: 3.4in; border: 2pt solid #000000; background-color: #f0f0f0;">&nbsp;</div>`
    }</td>
    <td class="specs-cell">
      <table class="specs-list">
        ${specRows
          .map(
            (r) => `
              <tr>
                <td class="spec-lab">${esc(r.label).toUpperCase()}:</td>
                <td class="spec-val">${esc(r.value) || "&nbsp;"}</td>
              </tr>`,
          )
          .join("")}
      </table>
    </td>
  </tr></table>

  ${
    F.price
      ? `<table class="price-prompt"><tr><td class="price-prompt-cell">ASKING PRICE: $${askingPrice}</td></tr></table>`
      : ""
  }

  ${
    F.description
      ? `<table class="desc-band"><tr><td class="desc-text"><b>DESCRIPTION:</b> ${
          tool.description ? esc(tool.description) : "&nbsp;"
        }</td></tr></table>`
      : ""
  }

  ${
    F.sale_notes
      ? `<table class="desc-band"><tr><td class="desc-text"><b>NOTES:</b> ${
          tool.sale_notes ? esc(tool.sale_notes) : "&nbsp;"
        }</td></tr></table>`
      : ""
  }

  ${
    contactLines.length
      ? `<table class="bot-banner"><tr><td class="bot-banner-cell">FOR INQUIRIES PLEASE CONTACT</td></tr></table>
         <table class="contact-box"><tr><td class="contact-cell">
           <table class="contact-inner">
             ${contactLines
               .map((c, i) => {
                 const isLast = i === contactLines.length - 1;
                 const padBottom = isLast ? " contact-line-pad-bottom" : "";
                 if (c.bold) {
                   return `<tr><td class="contact-line-bold${padBottom}">${c.value ? esc(c.value) : "&nbsp;"}</td></tr>`;
                 }
                 const labelPart = c.label ? `<b>${c.label}:</b> ` : "";
                 return `<tr><td class="contact-line${padBottom}">${labelPart}${c.value ? esc(c.value) : "&nbsp;"}</td></tr>`;
               })
               .join("")}
           </table>
           <div class="footer-inline">LISTED VIA TOOLBOX VAULT &nbsp;&middot;&nbsp; ${new Date().toLocaleDateString()}</div>
         </td></tr></table>`
      : `<div class="footer-inline" style="color:#888; padding-top: 14pt;">LISTED VIA TOOLBOX VAULT &nbsp;&middot;&nbsp; ${new Date().toLocaleDateString()}</div>`
  }

</body>
</html>`;

    setShowPosterBuilder(false);
    // Wait for the Poster Builder Modal to fully dismiss before invoking
    // expo-print. iOS only allows one presented view controller at a time —
    // calling Print.printToFileAsync mid-dismiss will hang silently. The
    // 400ms wait covers the standard iOS modal dismissal animation (~330ms).
    await new Promise((r) => setTimeout(r, 400));
    setPdfBusy(true);
    try {
      await printReportHtml(html, `${tool.name || "for-sale"}-poster-${Date.now()}`);
    } catch (e: any) {
      console.error("[poster] generation failed:", e);
      Alert.alert("Could not generate poster", e?.message || String(e));
    } finally {
      setPdfBusy(false);
    }
  };

  const doExportPdf = async (includeReceipts: boolean) => {
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const fmtMoney = (v: any) => {
      const n = Number(v);
      return isFinite(n) ? `$${n.toFixed(2)}` : "—";
    };

    // Photos — compress and render up to 4 in a 2-up grid (xhtml2pdf-friendly).
    // Compression is critical to prevent iOS WKWebView print pipeline hangs
    // on large camera-quality photos.
    const rawPhotos = (tool.photos || []).slice(0, 4);
    const photoCells = await compressManyForPdf(rawPhotos, {
      maxWidth: 900,
      quality: 0.6,
    });
    const photosHtml = photoCells.length
      ? `<table class="photos"><tr>${photoCells
          .slice(0, 2)
          .map((p: string) => `<td><img src="${p}"/></td>`)
          .join("")}</tr>${
          photoCells.length > 2
            ? `<tr>${photoCells
                .slice(2, 4)
                .map((p: string) => `<td><img src="${p}"/></td>`)
                .join("")}</tr>`
            : ""
        }</table>`
      : "";

    const history = (tool.checkout_history || [])
      .map(
        (h: any) =>
          `<tr><td>${esc(h.borrower_name)}</td><td>${esc(formatDateUS(h.checked_out_at))}</td><td>${esc(formatDateUS(h.checked_in_at))}</td></tr>`,
      )
      .join("");

    const rawReceipts: string[] = Array.isArray(tool.receipts) ? tool.receipts : [];
    const receipts: string[] = includeReceipts && rawReceipts.length > 0
      ? await compressManyForPdf(rawReceipts, { maxWidth: 1200, quality: 0.6 })
      : [];
    // Header model #s (joined) for the receipt sub-line in PDFs.
    const _pdfHeaderMns: string[] = (Array.isArray(tool.model_numbers) && tool.model_numbers.length)
      ? tool.model_numbers.filter((s: any) => !!s)
      : (tool.serial_number ? [String(tool.serial_number)] : []);
    const _pdfHeaderMnsStr = _pdfHeaderMns.length ? _pdfHeaderMns.join(", ") : "—";
    const receiptPages =
      includeReceipts && receipts.length > 0
        ? receipts
            .map(
              (r: string, i: number) => `
              <pdf:nextpage/>
              <div class="rcpt-header">RECEIPT ${i + 1} OF ${receipts.length}</div>
              <div class="rcpt-sub"><b>${esc(tool.name) || "(unnamed)"}</b> &middot; Model: <b>${esc(_pdfHeaderMnsStr)}</b></div>
              <div class="rcpt-img-wrap"><img class="rcpt-img" src="${r}"/></div>`,
            )
            .join("")
        : "";

    const statusLabel = tool.is_checked_out ? "CHECKED OUT" : "AVAILABLE";
    const statusColor = tool.is_checked_out ? "#dc2626" : "#16a34a";
    const statusBg = tool.is_checked_out ? "#fee2e2" : "#dcfce7";

    // Build spec rows (only show populated fields)
    const specPairs: { label: string; value: string }[] = [];
    if (tool.brand) specPairs.push({ label: "Brand", value: String(tool.brand) });
    // Legacy "Model" pair no longer emitted on receipt-style spec sheets
    // — see consolidation comment in the for-sale flyer renderer above.
    if (_pdfHeaderMns.length) {
      specPairs.push({
        label: _pdfHeaderMns.length > 1 ? "Model #s" : "Model #",
        value: _pdfHeaderMns.join(", "),
      });
    }
    {
      const _pdfSns: string[] = Array.isArray(tool.serial_numbers)
        ? tool.serial_numbers.filter((s: any) => !!s) : [];
      if (_pdfSns.length) {
        specPairs.push({
          label: _pdfSns.length > 1 ? "Serial #s" : "Serial #",
          value: _pdfSns.join(", "),
        });
      }
    }
    if (tool.condition) specPairs.push({ label: "Condition", value: String(tool.condition) });
    if (tool.category_name) specPairs.push({ label: "Category", value: String(tool.category_name) });
    if (tool.location_name) specPairs.push({ label: "Location", value: String(tool.location_name) });
    if (tool.purchase_date) specPairs.push({ label: "Purchased", value: formatDateUS(tool.purchase_date) });
    if (tool.dealer_name) specPairs.push({ label: "Dealer", value: String(tool.dealer_name) });
    if (tool.cost != null) specPairs.push({ label: "Cost", value: fmtMoney(tool.cost) });
    if (tool.msrp_price && Number(tool.msrp_price) > 0)
      specPairs.push({ label: "MSRP", value: fmtMoney(tool.msrp_price) });
    if (tool.quantity != null && Number(tool.quantity) > 1)
      specPairs.push({ label: "Quantity", value: String(tool.quantity) });
    if (tool.tag_names && tool.tag_names.length)
      specPairs.push({ label: "Tags", value: tool.tag_names.join(", ") });

    // Render specs as a 2-column table (xhtml2pdf supports tables well)
    const half = Math.ceil(specPairs.length / 2);
    const leftCol = specPairs.slice(0, half);
    const rightCol = specPairs.slice(half);
    const specRowHtml: string[] = [];
    for (let i = 0; i < half; i++) {
      const l = leftCol[i];
      const r = rightCol[i];
      specRowHtml.push(`
        <tr>
          <td class="lab">${l ? esc(l.label).toUpperCase() : ""}</td>
          <td class="val">${l ? esc(l.value) : ""}</td>
          <td class="lab">${r ? esc(r.label).toUpperCase() : ""}</td>
          <td class="val">${r ? esc(r.value) : ""}</td>
        </tr>`);
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: letter; margin: 0.55in 0.55in 0.55in 0.55in; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 10.5pt; }
  table { border-collapse: collapse; }
  p, div { margin: 0; padding: 0; }

  /* ============ TOP BRAND BAND ============ */
  table.brand-band { width: 100%; margin-bottom: 22pt; }
  table.brand-band td {
    background-color: #111111;
    padding: 10pt 16pt;
    vertical-align: middle;
  }
  td.brand-mark {
    color: #F97316;
    font-size: 11pt;
    font-weight: bold;
    letter-spacing: 4pt;
    text-align: left;
    width: 60%;
  }
  td.brand-meta {
    color: #f5f5f5;
    font-size: 8.5pt;
    letter-spacing: 1.5pt;
    text-align: right;
    width: 40%;
  }

  /* ============ HERO HEADER (tool name + status) ============ */
  table.hero { width: 100%; margin-bottom: 6pt; }
  td.hero-name {
    font-size: 24pt;
    font-weight: bold;
    color: #111111;
    text-transform: uppercase;
    letter-spacing: 1pt;
    padding: 0 0 4pt 0;
    width: 70%;
    vertical-align: middle;
  }
  td.hero-status {
    width: 30%;
    vertical-align: middle;
    text-align: right;
    padding: 0;
  }
  table.status-pill {
    margin-left: auto;
    margin-right: 0;
    border: 2pt solid ${statusColor};
  }
  table.status-pill td {
    background-color: ${statusBg};
    color: ${statusColor};
    font-size: 9pt;
    font-weight: bold;
    letter-spacing: 2pt;
    padding: 6pt 14pt;
    text-align: center;
  }
  .hero-rule {
    border-bottom: 4pt solid #F97316;
    margin-top: 6pt;
    margin-bottom: 18pt;
    height: 1pt;
    line-height: 1pt;
  }

  /* ============ SECTION BAND ============ */
  table.section-band {
    width: 100%;
    margin: 18pt 0 8pt 0;
  }
  table.section-band td {
    background-color: #111111;
    color: #F97316;
    padding: 5pt 12pt;
    font-size: 9pt;
    font-weight: bold;
    letter-spacing: 3pt;
  }

  /* ============ SPEC SHEET (2 col label/value × 2) ============ */
  table.specs {
    width: 100%;
    margin-bottom: 8pt;
  }
  table.specs td {
    padding: 7pt 10pt;
    vertical-align: top;
    border-bottom: 0.75pt solid #e8e8e8;
    font-size: 10pt;
  }
  table.specs td.lab {
    color: #777777;
    font-weight: bold;
    font-size: 8pt;
    letter-spacing: 1pt;
    width: 14%;
    text-transform: uppercase;
  }
  table.specs td.val {
    color: #111111;
    font-weight: bold;
    font-size: 10.5pt;
    width: 36%;
  }
  table.specs td.div {
    width: 0;
    padding: 0;
    border-bottom: 0.75pt solid #e8e8e8;
  }

  /* ============ DESCRIPTION ============ */
  table.desc-box {
    width: 100%;
    margin-bottom: 8pt;
  }
  table.desc-box td.bar {
    width: 4pt;
    background-color: #F97316;
    padding: 0;
  }
  table.desc-box td.body {
    background-color: #fafafa;
    padding: 12pt 16pt;
    font-size: 10.5pt;
    color: #2a2a2a;
    line-height: 1.5;
  }

  /* ============ PHOTOS ============ */
  table.photos { width: 100%; }
  table.photos td {
    width: 50%;
    padding: 6pt;
    text-align: center;
    vertical-align: middle;
  }
  table.photos img {
    /* No width:100% — that stretches the image. Cap with max-* only so
       xhtml2pdf preserves the natural aspect ratio. */
    max-width: 3.2in;
    max-height: 2.4in;
    border: 1.5pt solid #111111;
  }

  /* ============ HISTORY TABLE ============ */
  table.history { width: 100%; }
  table.history th {
    background-color: #111111;
    color: #F97316;
    text-align: left;
    padding: 7pt 10pt;
    font-size: 8.5pt;
    font-weight: bold;
    letter-spacing: 2pt;
  }
  table.history td {
    padding: 6pt 10pt;
    border-bottom: 0.75pt solid #eeeeee;
    font-size: 10pt;
    color: #222222;
  }
  table.history tr.alt td { background-color: #fafafa; }

  /* ============ FOOTER ============ */
  .footer-band {
    margin-top: 22pt;
    border-top: 1pt solid #dddddd;
    padding-top: 8pt;
    text-align: center;
    color: #999999;
    font-size: 8pt;
    letter-spacing: 2pt;
  }

  /* ============ RECEIPT PAGES ============ */
  .rcpt-header {
    font-size: 16pt;
    font-weight: bold;
    color: #111111;
    border-bottom: 3pt solid #F97316;
    padding-bottom: 6pt;
    margin-bottom: 4pt;
    letter-spacing: 1.5pt;
  }
  .rcpt-sub {
    font-size: 9.5pt;
    color: #666666;
    margin-bottom: 14pt;
  }
  .rcpt-img-wrap { text-align: center; }
  .rcpt-img {
    max-width: 100%;
    max-height: 8.5in;
    border: 1pt solid #cccccc;
  }
</style>
</head>
<body>

  <table class="brand-band">
    <tr>
      <td class="brand-mark">TOOLBOX VAULT</td>
      <td class="brand-meta">ITEM REPORT &middot; ${new Date().toLocaleDateString()}</td>
    </tr>
  </table>

  <table class="hero">
    <tr>
      <td class="hero-name">${esc(tool.name) || "(UNNAMED)"}</td>
      <td class="hero-status">
        <table class="status-pill"><tr><td>${statusLabel}</td></tr></table>
      </td>
    </tr>
  </table>
  <div class="hero-rule">&nbsp;</div>

  ${
    specRowHtml.length
      ? `<table class="section-band"><tr><td>SPECIFICATIONS</td></tr></table>
         <table class="specs">${specRowHtml.join("")}</table>`
      : ""
  }

  ${
    tool.description
      ? `<table class="section-band"><tr><td>DESCRIPTION</td></tr></table>
         <table class="desc-box"><tr>
           <td class="bar">&nbsp;</td>
           <td class="body">${esc(tool.description)}</td>
         </tr></table>`
      : ""
  }

  ${
    photosHtml
      ? `<table class="section-band"><tr><td>PHOTOS</td></tr></table>${photosHtml}`
      : ""
  }

  ${
    history
      ? `<table class="section-band"><tr><td>CHECKOUT HISTORY</td></tr></table>
         <table class="history">
           <thead><tr><th>BORROWER</th><th>CHECKED OUT</th><th>CHECKED IN</th></tr></thead>
           <tbody>${history}</tbody>
         </table>`
      : ""
  }

  <div class="footer-band">
    GENERATED BY TOOLBOX VAULT &nbsp;&middot;&nbsp; ${new Date().toLocaleDateString()}
  </div>

  ${receiptPages}

</body>
</html>`;

    try {
      setPdfBusy(true);
      await printReportHtml(html, `${tool.name || "tool"}-${Date.now()}`);
    } catch (e: any) {
      console.error("[standard pdf] generation failed:", e);
      Alert.alert("Could not generate PDF", e?.message || String(e));
    } finally {
      setPdfBusy(false);
    }
  };

  const photos = tool.photos || [];

  // ---- Helpers for the new layout ----------------------------------------
  const fmtMoney = (n: any) => `$${(Number(n) || 0).toFixed(2)}`;
  const statusInfo = (() => {
    if (tool.is_lost) return { label: "LOST", color: theme.colors.danger };
    if (tool.is_sold) return { label: "SOLD", color: theme.colors.success };
    if (tool.for_sale) return { label: `FOR SALE  ${fmtMoney(tool.sale_price)}`, color: theme.colors.accent };
    if (tool.needs_repair) return { label: "BROKEN", color: theme.colors.danger };
    if (tool.is_checked_out) return {
      label: "CHECKED OUT",
      color: theme.colors.accentSecondary,
    };
    return { label: "AVAILABLE", color: theme.colors.success };
  })();

  const maintenanceSummary = (() => {
    // tool.maintenance is the user's configured schedules. tool.maintenance_logs
    // (if present) is the history of completed services. We surface the
    // schedule count + last log so the pill is meaningful even before any
    // actual service entries.
    const schedules = Array.isArray(tool.maintenance) ? tool.maintenance : [];
    const logs = Array.isArray(tool.maintenance_logs) ? tool.maintenance_logs : [];
    if (logs.length) {
      const last = logs[logs.length - 1];
      return last?.scheduled_for
        ? `Last: ${formatDateUS(last.scheduled_for)}`
        : "Service logged";
    }
    if (schedules.length) {
      const s = schedules[0];
      return s?.next_due_date
        ? `Next: ${formatDateUS(s.next_due_date)}`
        : `${schedules.length} schedule${schedules.length === 1 ? "" : "s"}`;
    }
    return "Never serviced";
  })();
  // The pill's numeric count: prefer logs (if any), else schedules count.
  const maintenanceCount = (() => {
    const logs = Array.isArray(tool.maintenance_logs) ? tool.maintenance_logs : [];
    if (logs.length) return logs.length;
    const schedules = Array.isArray(tool.maintenance) ? tool.maintenance : [];
    return schedules.length;
  })();
  const warrantySummary = (() => {
    // The backend Warranty model uses `has_warranty` + `coverage_type` +
    // `expires_at` (see backend/server.py Warranty class). Older code looked
    // for a bare `type` field that doesn't exist — that's why the pill
    // always read 0/None even when warranty info was entered.
    const w = tool.warranty || {};
    const has = !!w.has_warranty;
    const ct = w.coverage_type || w.type; // legacy field name tolerated
    if (!has && !ct && !w.expires_at) return "None";
    if (ct === "lifetime") return "Lifetime";
    if (w.expires_at) return `Until ${formatDateUS(w.expires_at)}`;
    return ct ? String(ct) : "Active";
  })();
  // Numeric count for the warranty pill — 1 when there's any warranty info.
  const warrantyCount = (() => {
    const w = tool.warranty || {};
    return w.has_warranty || w.coverage_type || w.type || w.expires_at ? 1 : 0;
  })();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* HEADER — back arrow, name+serial, 3 action icons. Layout flexes safely. */}
      <View style={newStyles.headerBar}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={newStyles.headerTitleCol}>
          <Text style={newStyles.headerTitle} numberOfLines={2}>
            {tool.name || "Untitled tool"}
          </Text>
        </View>
        {/* Edit + Delete moved to top-right header icons to match the
            dealer detail screen's pattern, freeing up the bottom
            "ACTIONS" section for state-change buttons only (check
            out, mark broken, list for sale, etc.). */}
        <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
          <TouchableOpacity
            testID="edit-tool-btn"
            onPress={() => router.push({ pathname: "/tool/edit", params: { id: tool.id } })}
            hitSlop={10}
          >
            <Ionicons name="create-outline" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity testID="delete-tool-btn" onPress={doDelete} hitSlop={10}>
            <Ionicons name="trash-outline" size={24} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={newStyles.page}>

          {/* PHOTO + 2 PILLBOX FIELDS (Status, Price) on the right, height-matched */}
          <View style={newStyles.photoRow}>
            <TouchableOpacity
              testID="photo-thumb"
              style={newStyles.photoFrame}
              activeOpacity={photos.length ? 0.85 : 1}
              onPress={photos.length ? () => { setPhotoIdx(0); setIsImageViewerVisible(true); } : promptAddPhoto}
            >
              {photos.length > 0 ? (
                <Image source={{ uri: photos[0] }} style={newStyles.photoImg} />
              ) : (
                <View style={newStyles.photoEmpty}>
                  <Ionicons name="camera" size={22} color={theme.colors.accent} />
                  <Text style={newStyles.photoEmptyText}>ADD PHOTO</Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={newStyles.photoRightCol}>
              <PillRow
                label="STATUS"
                value={statusInfo.label}
                valueColor={statusInfo.color}
              />
              <PillRow
                label="QUANTITY"
                value={String(Math.max(1, Number(tool.quantity) || 1))}
                onPress={() => setShowQtyModal(true)}
              />
              <PillRow label="PRICE" value={fmtMoney(tool.cost)} />
            </View>
          </View>

          {/* CLAIM INFORMATION — when this tool is broken/in-repair, show
              the claim card FIRST (right under the photo, before anything
              else). Per user request: this is the most important banner. */}
          {tool.needs_repair && (
            <View style={newStyles.repairCard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <Ionicons name="build" size={18} color={theme.colors.danger} />
                <Text style={newStyles.repairTitle}>CLAIM INFORMATION</Text>
              </View>
              <View style={{ marginLeft: 28 }}>
                <Text style={newStyles.repairLine}>
                  Status: {(tool.repair_info?.repair_status || "Repair pending").toUpperCase()}
                </Text>
                {!!tool.repair_info?.company_notified && (
                  <Text style={newStyles.repairLine}>At: {tool.repair_info.company_notified}</Text>
                )}
                {!!tool.repair_info?.notified_at && (
                  <Text style={newStyles.repairLine}>
                    Notified: {formatDateUS(tool.repair_info.notified_at)}
                  </Text>
                )}
                {!!tool.repair_info?.expected_completion && (
                  <Text style={newStyles.repairLine}>
                    Expected back: {formatDateUS(tool.repair_info.expected_completion)}
                  </Text>
                )}
                {!!tool.repair_info?.notes && (
                  <Text style={[newStyles.repairLine, { fontStyle: "italic", marginTop: 6 }]}>
                    {tool.repair_info.notes}
                  </Text>
                )}
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                {/* Quick-contact actions — wire the dealer's email / phone
                    straight into the OS mailer / SMS app, mirroring the
                    same flow available on the dealer-claims page. Auto-
                    marks the claim as "Reported" the moment the user
                    triggers contact (see notifyDealer in this file). */}
                <TouchableOpacity
                  style={[
                    newStyles.saleBtn,
                    { backgroundColor: theme.colors.accent, flex: 1 },
                  ]}
                  onPress={() => notifyDealer(tool, "email")}
                  testID="claim-email-dealer"
                  activeOpacity={0.85}
                >
                  <Ionicons name="mail" size={14} color="#000" />
                  <Text style={[newStyles.saleBtnText, { color: "#000" }]}>EMAIL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    newStyles.saleBtn,
                    { backgroundColor: theme.colors.accent, flex: 1 },
                  ]}
                  onPress={() => notifyDealer(tool, "sms")}
                  testID="claim-text-dealer"
                  activeOpacity={0.85}
                >
                  <Ionicons name="chatbubble" size={14} color="#000" />
                  <Text style={[newStyles.saleBtnText, { color: "#000" }]}>TEXT</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  style={[newStyles.saleBtn, { backgroundColor: "rgba(0,0,0,0.25)", flex: 1 }]}
                  onPress={openRepair}
                  testID="claim-edit"
                >
                  <Ionicons name="create-outline" size={14} color={theme.colors.danger} />
                  <Text style={[newStyles.saleBtnText, { color: theme.colors.danger }]}>
                    EDIT CLAIM
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[newStyles.saleBtn, { backgroundColor: theme.colors.success, flex: 1 }]}
                  onPress={markRepaired}
                  testID="claim-mark-fixed"
                >
                  <Ionicons name="checkmark-done" size={14} color="#000" />
                  <Text style={[newStyles.saleBtnText, { color: "#000" }]}>
                    MARK FIXED
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* CHECKED OUT — shown in the SAME slot as the claim card
              (immediately under the photo, above the description) and styled
              like the claim card but in soft yellow. Tap to jump to the
              borrower's profile. Reads from `current_checkout` (where the
              active record lives while is_checked_out=true). */}
          {tool.is_checked_out && (() => {
            const active = tool.current_checkout || (Array.isArray(tool.checkout_history)
              ? [...tool.checkout_history].reverse().find((r: any) => !r?.checked_in_at)
              : null);
            if (!active) return null;
            const target = active.borrower_id
              ? `/borrower/${active.borrower_id}`
              : null;
            return (
              <TouchableOpacity
                testID="checked-out-pill"
                style={newStyles.checkedOutCard}
                activeOpacity={target ? 0.85 : 1}
                onPress={target ? () => router.push(target as any) : undefined}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <Ionicons name="person" size={18} color={theme.colors.accent} />
                  <Text style={newStyles.checkedOutTitle}>CHECKED OUT</Text>
                  {!!target && (
                    <View style={{ flex: 1, alignItems: "flex-end" }}>
                      <Ionicons name="chevron-forward" size={14} color={theme.colors.accent} />
                    </View>
                  )}
                </View>
                <View style={{ marginLeft: 28 }}>
                  <Text style={newStyles.checkedOutLine}>
                    By: {active.borrower_name || "Unknown"}
                  </Text>
                  <Text style={newStyles.checkedOutLine}>
                    On: {formatDateUS(active.checked_out_at)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })()}

          {/* DESCRIPTION — first thing below the photo row (or claim card) */}
          {!!tool.description && (
            <View style={newStyles.descBox}>
              <Text style={newStyles.descText}>{tool.description}</Text>
            </View>
          )}

          {/* (CHECKED OUT card was moved to the top of this screen, above
              the description — see block under the photo row.) */}

          {/* DETAILS BOX — groups location, dealer, model number(s), brand,
              purchased, category in one bordered card, styled identically
              to the warranty card. Location and dealer rows are tappable
              (chevron on right). */}
          {(() => {
            // Prefer the new multi-value arrays. Fall back through legacy
            // shape (set_serials when is_set, otherwise the single
            // serial_number string) for tools not yet migrated.
            const modelNums: string[] = Array.isArray(tool.model_numbers) && tool.model_numbers.length
              ? tool.model_numbers.filter((s: string) => !!s)
              : (tool.is_set
                  ? (Array.isArray(tool.set_serials)
                      ? tool.set_serials.filter((s: string) => !!s)
                      : [])
                  : (tool.serial_number ? [String(tool.serial_number)] : []));
            const serialNums: string[] = Array.isArray(tool.serial_numbers)
              ? tool.serial_numbers.filter((s: string) => !!s)
              : [];

            type Row =
              | { kind: "value"; label: string; value: string; onPress?: () => void }
              | { kind: "models"; label: string; values: string[] }
              | { kind: "expandable"; key: "gallery" | "documents" | "receipts" | "maintenance" | "warranty"; label: string; value: string };

            const rows: Row[] = [];
            rows.push({
              kind: "value",
              label: "LOCATION",
              value: tool.location_name || "No location · tap to assign",
              onPress: () => setShowLocationPicker(true),
            });
            rows.push({
              kind: "value",
              label: "DEALER",
              value: tool.dealer_name || "—",
              onPress: tool.dealer_id
                ? () => router.push(`/dealer/${tool.dealer_id}`)
                : undefined,
            });
            // ALWAYS show MODEL NUMBER(S) — per user, an empty row is shown
            // with a "—" placeholder rather than being hidden.
            rows.push({
              kind: "models",
              label: modelNums.length > 1 ? "MODEL NUMBERS" : "MODEL #",
              values: modelNums.length ? modelNums : ["—"],
            });
            // ALWAYS show SERIAL NUMBER(S) row.
            rows.push({
              kind: "models",
              label: serialNums.length > 1 ? "SERIAL NUMBERS" : "SERIAL #",
              values: serialNums.length ? serialNums : ["—"],
            });
            if (tool.brand) {
              rows.push({ kind: "value", label: "BRAND", value: String(tool.brand) });
            }
            if (tool.purchase_date) {
              rows.push({
                kind: "value",
                label: "PURCHASED",
                value: formatDateUS(tool.purchase_date),
              });
            }
            // MSRP — only surface when set (>0). The user enters this on
            // the edit screen and it powers the MSRP column / totals in
            // Insurance / Inventory / Lost-Stolen / Year End reports.
            if (tool.msrp_price && Number(tool.msrp_price) > 0) {
              rows.push({
                kind: "value",
                label: "MSRP",
                value: `$${Number(tool.msrp_price).toFixed(2)}`,
              });
            }
            if (tool.category_name) {
              rows.push({
                kind: "value",
                label: "CATEGORY",
                value: String(tool.category_name),
              });
            }

            // ---- ATTACHMENTS (expandable rows) ----
            rows.push({
              kind: "expandable",
              key: "gallery",
              label: "GALLERY",
              value: `${photos.length} photo${photos.length === 1 ? "" : "s"}`,
            });
            rows.push({
              kind: "expandable",
              key: "documents",
              label: "DOCUMENTS",
              value: `${Array.isArray(tool.documents) ? tool.documents.length : 0} document${(Array.isArray(tool.documents) ? tool.documents.length : 0) === 1 ? "" : "s"}`,
            });
            rows.push({
              kind: "expandable",
              key: "receipts",
              label: "RECEIPTS",
              value: `${Array.isArray(tool.receipts) ? tool.receipts.length : 0} receipt${(Array.isArray(tool.receipts) ? tool.receipts.length : 0) === 1 ? "" : "s"}`,
            });
            // ---- SERVICES (expandable rows) ----
            rows.push({
              kind: "expandable",
              key: "maintenance",
              label: "MAINTENANCE",
              value: `${maintenanceCount} record${maintenanceCount === 1 ? "" : "s"}`,
            });
            rows.push({
              kind: "expandable",
              key: "warranty",
              label: "WARRANTY",
              value: `${warrantyCount} record${warrantyCount === 1 ? "" : "s"}`,
            });
            // ---- HISTORY (tappable rows that navigate) ----
            const checkoutCount = Array.isArray(tool.checkout_history)
              ? tool.checkout_history.length
              : 0;
            rows.push({
              kind: "value",
              label: "CHECKOUT HISTORY",
              value: `${checkoutCount} entr${checkoutCount === 1 ? "y" : "ies"}`,
              onPress: () => router.push(`/checkout-history/${tool.id}`),
            });
            rows.push({
              kind: "value",
              label: "CLAIMS HISTORY",
              value: "View",
              onPress: () => router.push(`/claims-history/${tool.id}`),
            });

            return (
              <View style={newStyles.detailsBox} testID="details-box">
                {rows.map((r, i) => {
                  const isLast = i === rows.length - 1;
                  if (r.kind === "models") {
                    return (
                      <View
                        key={`m-${i}`}
                        style={[newStyles.detailsRow, isLast && newStyles.detailsRowLast]}
                      >
                        <Text style={newStyles.detailsLabel}>{r.label}</Text>
                        <View
                          style={{
                            flex: 1,
                            alignItems: "flex-end",
                            justifyContent: "center",
                            gap: 2,
                          }}
                        >
                          {r.values.map((s, j) => (
                            <Text
                              key={j}
                              style={newStyles.detailsValue}
                              numberOfLines={1}
                            >
                              {s}
                            </Text>
                          ))}
                        </View>
                      </View>
                    );
                  }
                  if (r.kind === "expandable") {
                    const isOpen = attachOpen === r.key;
                    return (
                      <View
                        key={`e-${r.key}`}
                        style={[
                          isLast && !isOpen && newStyles.detailsRowLast,
                        ]}
                      >
                        <TouchableOpacity
                          style={[newStyles.detailsRow, !isOpen && isLast && newStyles.detailsRowLast]}
                          activeOpacity={0.6}
                          onPress={() => setAttachOpen(isOpen ? null : r.key)}
                          testID={`details-row-${r.key}`}
                        >
                          <Text style={newStyles.detailsLabel}>{r.label}</Text>
                          <View style={newStyles.detailsValueWrap}>
                            <Text style={newStyles.detailsValue} numberOfLines={1}>
                              {r.value}
                            </Text>
                            <Ionicons
                              name={isOpen ? "chevron-down" : "chevron-forward"}
                              size={14}
                              color={theme.colors.textMuted}
                            />
                          </View>
                        </TouchableOpacity>
                        {isOpen && (
                          <View style={[newStyles.detailsExpanded, isLast && newStyles.detailsRowLast]}>
                            {r.key === "gallery" && (
                              photos.length === 0 ? (
                                <TouchableOpacity
                                  style={newStyles.galleryEmpty}
                                  onPress={promptAddPhoto}
                                  testID="gallery-add-first"
                                >
                                  <Ionicons name="camera" size={20} color={theme.colors.accent} />
                                  <Text style={newStyles.galleryEmptyText}>ADD PHOTO</Text>
                                </TouchableOpacity>
                              ) : (
                                <ScrollView
                                  horizontal
                                  showsHorizontalScrollIndicator={false}
                                  contentContainerStyle={newStyles.galleryRow}
                                >
                                  {photos.map((p: string, j: number) => (
                                    <TouchableOpacity
                                      key={j}
                                      testID={`gallery-thumb-${j}`}
                                      onPress={() => {
                                        setPhotoIdx(j);
                                        setIsImageViewerVisible(true);
                                      }}
                                      activeOpacity={0.85}
                                    >
                                      <Image source={{ uri: p }} style={newStyles.galleryThumb} />
                                    </TouchableOpacity>
                                  ))}
                                  <TouchableOpacity
                                    testID="gallery-add-more"
                                    style={newStyles.galleryAddTile}
                                    onPress={promptAddPhoto}
                                  >
                                    <Ionicons name="add" size={22} color={theme.colors.accent} />
                                  </TouchableOpacity>
                                </ScrollView>
                              )
                            )}
                            {r.key === "documents" && (
                              <DocumentsSection tool={tool} onChange={load} />
                            )}
                            {r.key === "receipts" && (
                              <ReceiptsSection
                                receipts={tool.receipts}
                                onAdd={promptAddReceipt}
                              />
                            )}
                            {r.key === "maintenance" && (
                              <MaintenanceSection tool={tool} onChange={load} />
                            )}
                            {r.key === "warranty" && (
                              <WarrantySection tool={tool} />
                            )}
                          </View>
                        )}
                      </View>
                    );
                  }
                  const RowWrapper: any = r.onPress ? TouchableOpacity : View;
                  const wrapperProps = r.onPress
                    ? { onPress: r.onPress, activeOpacity: 0.6 }
                    : {};
                  return (
                    <RowWrapper
                      key={`r-${i}`}
                      style={[newStyles.detailsRow, isLast && newStyles.detailsRowLast]}
                      testID={`details-row-${r.label.toLowerCase().replace(/\s+/g, "-")}`}
                      {...wrapperProps}
                    >
                      <Text style={newStyles.detailsLabel}>{r.label}</Text>
                      <View style={newStyles.detailsValueWrap}>
                        <Text style={newStyles.detailsValue} numberOfLines={1}>
                          {r.value}
                        </Text>
                        {r.onPress && (
                          <Ionicons
                            name="chevron-forward"
                            size={14}
                            color={theme.colors.textMuted}
                          />
                        )}
                      </View>
                    </RowWrapper>
                  );
                })}
              </View>
            );
          })()}

          {/* TAGS moved to the very bottom of the page — see below */}

          {/* Quantity stepper is now opened via the QUANTITY pillbox in the
              photo row above — see <showQtyModal> Modal below. */}

          {/* Lost banner — only renders if tool.is_lost */}
          <LostStatusBanner tool={tool} onChange={load} />

          {/* CLAIM INFORMATION card was moved to the top of this screen
              (immediately under the photo, above the description) per user
              request — this block is intentionally not duplicated here. */}

          {/* Sale listing detail (when for sale, shows the listing controls) */}
          {tool.for_sale && !tool.is_sold && (
            <View style={newStyles.saleCard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="pricetag" size={20} color="#000" />
                <View style={{ flex: 1 }}>
                  <Text style={newStyles.saleTitle}>LISTED  {fmtMoney(tool.sale_price)}</Text>
                  {!!tool.sale_notes && (
                    <Text style={newStyles.saleNotes}>{tool.sale_notes}</Text>
                  )}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <TouchableOpacity style={[newStyles.saleBtn, { backgroundColor: "#000" }]} onPress={() => openSaleModal()}>
                  <Ionicons name="create-outline" size={12} color={theme.colors.accent} />
                  <Text style={[newStyles.saleBtnText, { color: theme.colors.accent }]}>EDIT</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[newStyles.saleBtn, { backgroundColor: "#000" }]}
                  onPress={() => setShowPosterBuilder(true)}
                  testID="for-sale-poster-btn"
                >
                  <Ionicons name="megaphone" size={12} color={theme.colors.accent} />
                  <Text style={[newStyles.saleBtnText, { color: theme.colors.accent }]}>POSTER</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[newStyles.saleBtn, { backgroundColor: "rgba(0,0,0,0.15)" }]}
                  onPress={async () => {
                    try {
                      await api.updateTool(tool.id, { for_sale: false, sale_price: 0, sale_notes: "" });
                      load();
                    } catch (e: any) {
                      Alert.alert("Error", String(e?.message || e));
                    }
                  }}
                >
                  <Ionicons name="close-circle" size={12} color="#000" />
                  <Text style={[newStyles.saleBtnText, { color: "#000" }]}>UNLIST</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[newStyles.saleBtn, { backgroundColor: theme.colors.success }]} onPress={() => setShowMarkSold(true)}>
                  <Ionicons name="checkmark-circle" size={12} color="#fff" />
                  <Text style={[newStyles.saleBtnText, { color: "#fff" }]}>SOLD</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Sold summary (when sold, just shows it) */}
          {tool.is_sold && (
            <View style={[newStyles.saleCard, { backgroundColor: theme.colors.success }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="checkmark-done-circle" size={22} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={[newStyles.saleTitle, { color: "#fff" }]}>
                    SOLD {tool.sold_price ? fmtMoney(tool.sold_price) : ""}
                  </Text>
                  <Text style={[newStyles.saleNotes, { color: "#fff" }]}>
                    {tool.sold_at ? formatDateUS(tool.sold_at) : ""}
                    {tool.sold_to ? `  ·  ${tool.sold_to}` : ""}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ATTACHMENTS / SERVICE / HISTORY were moved into the DetailsBox
              card above (gallery, documents, receipts, maintenance, warranty
              now collapse/expand inline; checkout & claims history tap to
              navigate). */}

          {/* REPORT LOST OR STOLEN */}
          <View style={{ marginTop: 16 }}>
            <ReportLostButton tool={tool} onChange={load} />
          </View>

          {/* ===== BOTTOM ACTION CLUSTER (final section on the page) ===== */}
          <View style={newStyles.divider} />
          <Text style={newStyles.sectionTitle}>ACTIONS</Text>

          <View style={newStyles.actionGrid}>
            {/* EDIT + DELETE moved to top-right header icons (matching the
                dealer detail screen). Only state-change actions remain here. */}

            {/* DOCUMENTS — expands the Documents pill in Attachments */}
            {/* (DOCUMENTS bottom action removed — users can reach
                 the Documents pillbox in the Attachments section.) */}

            {/* CHECK OUT / CHECK IN (contextual) */}
            {!tool.is_sold && !tool.is_lost && (
              tool.is_checked_out ? (
                <BevelCard
                  testID="action-checkin"
                  style={newStyles.actionTile}
                  onPress={doCheckin}
                >
                  <Ionicons name="log-in-outline" size={20} color={theme.colors.accent} />
                  <Text style={newStyles.actionTileText}>CHECK IN</Text>
                </BevelCard>
              ) : (
                <BevelCard
                  testID="action-checkout"
                  style={newStyles.actionTile}
                  onPress={() => setShowCheckout(true)}
                >
                  <Ionicons name="log-out-outline" size={20} color={theme.colors.accent} />
                  <Text style={newStyles.actionTileText}>CHECK OUT</Text>
                </BevelCard>
              )
            )}

            {/* MARK BROKEN / MARK FIXED (contextual) */}
            {!tool.is_sold && !tool.is_lost && (
              tool.needs_repair ? (
                <BevelCard
                  testID="action-fixed"
                  style={newStyles.actionTile}
                  onPress={markRepaired}
                >
                  <Ionicons name="checkmark-done" size={20} color={theme.colors.success} />
                  <Text style={newStyles.actionTileText}>MARK FIXED</Text>
                </BevelCard>
              ) : (
                <BevelCard
                  testID="action-broken"
                  style={newStyles.actionTile}
                  onPress={openRepair}
                >
                  <Ionicons name="build-outline" size={20} color={theme.colors.danger} />
                  <Text style={newStyles.actionTileText}>MARK BROKEN</Text>
                </BevelCard>
              )
            )}

            {/* EXPORT PDF */}
            <BevelCard
              testID="action-export"
              style={newStyles.actionTile}
              onPress={() => setShowExportPicker(true)}
            >
              <Ionicons name="document-text-outline" size={20} color={theme.colors.accent} />
              <Text style={newStyles.actionTileText}>EXPORT</Text>
            </BevelCard>

            {/* LIST FOR SALE / EDIT LISTING + MARK SOLD (contextual) */}
            {!tool.is_sold && !tool.is_lost && (
              tool.for_sale ? (
                <>
                  <BevelCard
                    testID="action-edit-listing"
                    style={newStyles.actionTile}
                    onPress={() => openSaleModal()}
                  >
                    <Ionicons name="pricetag" size={20} color={theme.colors.accent} />
                    <Text style={newStyles.actionTileText}>EDIT LISTING</Text>
                  </BevelCard>
                  <BevelCard
                    testID="action-mark-sold"
                    style={newStyles.actionTile}
                    onPress={() => setShowMarkSold(true)}
                  >
                    <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
                    <Text style={newStyles.actionTileText}>MARK SOLD</Text>
                  </BevelCard>
                </>
              ) : (
                <BevelCard
                  testID="action-list-sale"
                  style={newStyles.actionTile}
                  onPress={() => openSaleModal()}
                >
                  <Ionicons name="pricetag-outline" size={20} color={theme.colors.accent} />
                  <Text style={newStyles.actionTileText}>LIST FOR SALE</Text>
                </BevelCard>
              )
            )}

            {/* DELETE — moved to top-right header icon. */}
          </View>

          {/* ===== TAGS — pinned at the very bottom of the page ===== */}
          {(tool.tag_names || []).length > 0 && (
            <View style={{ marginTop: 18 }}>
              <Text style={newStyles.sectionTitle}>TAGS</Text>
              <View style={[newStyles.tagWrap, { marginTop: 8 }]}>
                {tool.tag_names.map((t: string) => (
                  <BevelCard key={t} style={newStyles.tagChip}>
                    <Text style={newStyles.tagChipText}>{t}</Text>
                  </BevelCard>
                ))}
              </View>
            </View>
          )}

        </View>
      </ScrollView>

            <Modal visible={showCheckout} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>CHECK OUT TOOL</Text>

            <View style={styles.segment}>
              <TouchableOpacity
                testID="seg-saved"
                style={[styles.segBtn, coMode === "saved" && styles.segBtnActive]}
                onPress={() => setCoMode("saved")}
              >
                <Text style={[styles.segText, coMode === "saved" && styles.segTextActive]}>
                  FROM LIST
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="seg-free"
                style={[styles.segBtn, coMode === "free" && styles.segBtnActive]}
                onPress={() => setCoMode("free")}
              >
                <Text style={[styles.segText, coMode === "free" && styles.segTextActive]}>
                  FREE TEXT
                </Text>
              </TouchableOpacity>
            </View>

            {coMode === "saved" ? (
              <ScrollView style={{ maxHeight: 200 }}>
                {borrowers.length === 0 ? (
                  <Text style={{ color: theme.colors.textMuted, marginVertical: 12 }}>
                    No saved people. Switch to free text or add people in the People tab.
                  </Text>
                ) : (
                  borrowers.map((b) => (
                    <TouchableOpacity
                      key={b.id}
                      testID={`pick-borrower-${b.id}`}
                      style={[
                        styles.borrowerPick,
                        coBorrowerId === b.id && styles.borrowerPickActive,
                      ]}
                      onPress={() => setCoBorrowerId(b.id)}
                    >
                      <Text style={styles.borrowerName}>{b.name}</Text>
                      {coBorrowerId === b.id && (
                        <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            ) : (
              <TextInput
                testID="checkout-name-input"
                placeholder="Enter person's name"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={coName}
                onChangeText={setCoName}
              />
            )}

            {/* Import from device contacts — quick way to pull a name from
                the phone's address book without switching screens. Hidden
                on web (no contacts API there). On iOS we use the native
                picker sheet; on Android we use the in-app picker the user
                might already have if the borrowers tab is open. */}
            {isDeviceContactsAvailable() && (
              <TouchableOpacity
                testID="checkout-import-contact"
                style={[styles.borrowerPick, { justifyContent: "center", marginTop: 8 }]}
                onPress={async () => {
                  if (Platform.OS === "ios") {
                    const c = await pickContactNativeIOS();
                    if (c?.name) {
                      // Switch to FREE TEXT mode and prefill BOTH name and
                      // phone — the FREE TEXT branch's submit handler
                      // (doCheckout, above) will then persist this person
                      // into the borrowers list so they survive into the
                      // FROM LIST tab on the next checkout. This single
                      // path makes "import a contact" actually save the
                      // contact, which is what users assume happens.
                      setCoMode("free");
                      setCoBorrowerId(null);
                      setCoName(c.name);
                      setCoPhone(c.phone || "");
                    }
                  } else if (isAndroidPickerNeeded()) {
                    const list = await loadAllDeviceContactsAndroid();
                    if (list.length) {
                      // Simple choice — pick the first match a user types.
                      // Fallback flow: just use the first contact's name.
                      // A future improvement would show a searchable list.
                      Alert.alert(
                        "Pick from contacts",
                        "Please go to the People tab → Import from Contacts to pick a specific contact. We'll bring you there now.",
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Open People", onPress: () => router.push("/(tabs)/borrowers" as any) },
                        ],
                      );
                    }
                  }
                }}
              >
                <Ionicons name="person-add-outline" size={16} color={theme.colors.accent} />
                <Text style={[styles.borrowerName, { color: theme.colors.accent, marginLeft: 8 }]}>
                  IMPORT FROM CONTACTS
                </Text>
              </TouchableOpacity>
            )}

            <TextInput
              testID="checkout-notes-input"
              placeholder="Notes (optional)"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { height: 72 }]}
              value={coNotes}
              onChangeText={setCoNotes}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btnGhost, { flex: 1, paddingHorizontal: 28, paddingVertical: 12 }]}
                onPress={() => setShowCheckout(false)}
              >
                <Text style={[styles.btnGhostText, { fontSize: 14, letterSpacing: 1 }]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-checkout-btn"
                style={[styles.btn, { flex: 1, paddingHorizontal: 28, paddingVertical: 12 }]}
                onPress={doCheckout}
              >
                <Text style={[styles.btnText, { fontSize: 14, letterSpacing: 1 }]}>CHECK OUT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Repair Modal — quick mark-broken / edit repair info */}
      <Modal visible={showRepair} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { borderTopColor: theme.colors.danger, maxHeight: "90%" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Ionicons name="build" size={22} color={theme.colors.danger} />
              <Text style={styles.modalTitle}>
                {tool.needs_repair ? "EDIT REPAIR INFO" : "MARK AS BROKEN"}
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.repairLabel}>STATUS</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {["Not Reported", "Reported", "In Repair", "Awaiting Parts", "Sent in for Repairs", "Repaired"].map((s) => (
                  <TouchableOpacity
                    key={s}
                    testID={`repmod-status-${s}`}
                    style={[
                      styles.repChip,
                      repairForm.repair_status === s && styles.repChipActive,
                    ]}
                    onPress={() => setRepairForm({ ...repairForm, repair_status: s })}
                  >
                    <Text style={[
                      styles.repChipText,
                      repairForm.repair_status === s && styles.repChipTextActive,
                    ]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.repairLabel}>REPAIR COMPANY (DEALER)</Text>
              {(() => {
                const linkedDealer = dealers.find(
                  (d: any) => d.id === tool?.dealer_id,
                );
                const displayName =
                  repairForm.company_notified ||
                  linkedDealer?.name ||
                  "";
                if (!displayName) {
                  return (
                    <BevelCard style={styles.dealerLockBox}>
                      <Ionicons
                        name="alert-circle"
                        size={16}
                        color={theme.colors.warning}
                      />
                      <Text style={styles.dealerLockMissing}>
                        No dealer assigned to this tool. Edit the tool to
                        select one.
                      </Text>
                    </BevelCard>
                  );
                }
                return (
                  <BevelCard style={styles.dealerLockBox}>
                    <Ionicons
                      name="briefcase"
                      size={16}
                      color={theme.colors.accent}
                    />
                    <Text style={styles.dealerLockName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    <Ionicons
                      name="lock-closed"
                      size={13}
                      color={theme.colors.textMuted}
                    />
                  </BevelCard>
                );
              })()}

              <Text style={styles.repairLabel}>CONTACT</Text>
              <TextInput
                testID="repmod-contact"
                placeholder="800-555-1234"
                placeholderTextColor={theme.colors.textMuted}
                value={repairForm.contact}
                style={styles.input}
                onChangeText={(v) => setRepairForm({ ...repairForm, contact: v })}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.repairLabel}>NOTIFIED ON</Text>
                  <DateField
                    testID="repmod-notified"
                    value={repairForm.notified_at}
                    onChange={(v) => setRepairForm({ ...repairForm, notified_at: v })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.repairLabel}>EXPECTED BACK</Text>
                  <DateField
                    testID="repmod-expected"
                    value={repairForm.expected_completion}
                    onChange={(v) => setRepairForm({ ...repairForm, expected_completion: v })}
                  />
                </View>
              </View>

              <Text style={styles.repairLabel}>NOTES</Text>
              <TextInput
                testID="repmod-notes"
                placeholder="What's wrong? RMA #..."
                placeholderTextColor={theme.colors.textMuted}
                value={repairForm.notes}
                style={[styles.input, { height: 80, textAlignVertical: "top" }]}
                multiline
                onChangeText={(v) => setRepairForm({ ...repairForm, notes: v })}
              />

              <Text style={styles.repairLabel}>PHOTO OF BROKEN PART</Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 8, marginBottom: 6 }}>
                Only shown in this claim — not added to the item's main photos.
              </Text>
              {repairForm.broken_photo ? (
                <View style={{ position: "relative", marginBottom: 8 }}>
                  <Image
                    source={{ uri: repairForm.broken_photo }}
                    style={{
                      width: "100%",
                      height: 180,
                      borderRadius: 6,
                      backgroundColor: theme.colors.bg,
                    }}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    testID="remove-broken-photo-btn"
                    onPress={() =>
                      setRepairForm({ ...repairForm, broken_photo: "" })
                    }
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      backgroundColor: "rgba(0,0,0,0.7)",
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="trash" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                /* Two-button row so the user can EITHER snap a fresh photo
                   with the camera (most common when something just broke)
                   OR pick an existing one from the library. */
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <TouchableOpacity
                    testID="take-broken-photo-btn"
                    onPress={() => pickBrokenPhoto("camera")}
                    style={{
                      flex: 1,
                      height: 80,
                      borderWidth: 1,
                      borderStyle: "dashed",
                      borderColor: theme.colors.accent,
                      borderRadius: 6,
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 6,
                    }}
                  >
                    <Ionicons name="camera" size={20} color={theme.colors.accent} />
                    <Text
                      style={{
                        color: theme.colors.accent,
                        fontWeight: "900",
                        letterSpacing: 1.3,
                        fontSize: 11,
                      }}
                    >
                      TAKE PHOTO
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="pick-broken-photo-btn"
                    onPress={() => pickBrokenPhoto("library")}
                    style={{
                      flex: 1,
                      height: 80,
                      borderWidth: 1,
                      borderStyle: "dashed",
                      borderColor: theme.colors.accent,
                      borderRadius: 6,
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 6,
                    }}
                  >
                    <Ionicons
                      name="images"
                      size={20}
                      color={theme.colors.accent}
                    />
                    <Text
                      style={{
                        color: theme.colors.accent,
                        fontWeight: "900",
                        letterSpacing: 1.3,
                        fontSize: 11,
                      }}
                    >
                      LIBRARY
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {!tool.needs_repair && tool.is_checked_out && (
                <Text style={{ color: theme.colors.warning, fontSize: 9, marginVertical: 6 }}>
                  Heads up: this tool is currently checked out to{" "}
                  {tool.current_checkout?.borrower_name}. Marking it broken will auto check-in.
                </Text>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btnGhost, { flex: 1, height: 54 }]}
                onPress={() => setShowRepair(false)}
              >
                <Text style={[styles.btnGhostText, { fontSize: 12 }]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-repair-btn"
                style={[styles.btn, { backgroundColor: theme.colors.danger, flex: 1, height: 54 }]}
                onPress={saveRepair}
              >
                <Text style={[styles.btnText, { color: theme.colors.textPrimary, fontSize: 12 }]}>
                  {tool.needs_repair ? "SAVE" : "MARK BROKEN"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PDF Export Type Picker Modal — works on web AND native (replaces Alert.alert) */}
      <Modal
        visible={showExportPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportPicker(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 420 }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="document-text" size={20} color={theme.colors.accent} />
              <Text style={styles.modalTitle}>EXPORT PDF</Text>
              <TouchableOpacity onPress={() => setShowExportPicker(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.helper, { marginBottom: 14 }]}>
              Choose the type of PDF to generate for this item.
            </Text>

            <BevelCard
              testID="pick-pdf-poster"
              style={pickerStyles.choice}
              onPress={handlePickPoster}
              activeOpacity={0.85}
            >
              <View style={pickerStyles.iconCircle}>
                <Ionicons name="megaphone" size={22} color="#000" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={pickerStyles.choiceTitle}>For-Sale Poster</Text>
                <Text style={pickerStyles.choiceSub}>
                  Single-page flyer with FOR SALE banner, asking price, photo and contact info.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </BevelCard>

            <BevelCard
              testID="pick-pdf-standard"
              style={pickerStyles.choice}
              onPress={handlePickStandard}
              activeOpacity={0.85}
            >
              <View style={[pickerStyles.iconCircle, { backgroundColor: "#222" }]}>
                <Ionicons name="document-text" size={20} color={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={pickerStyles.choiceTitle}>Standard Report</Text>
                <Text style={pickerStyles.choiceSub}>
                  Branded item report with specs, photos, history{
                    Array.isArray(tool.receipts) && tool.receipts.length > 0
                      ? ` and ${tool.receipts.length} receipt${tool.receipts.length === 1 ? "" : "s"}`
                      : ""
                  }.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </BevelCard>

            <TouchableOpacity
              testID="pdf-picker-cancel"
              style={[styles.btnGhost, { marginTop: 6 }]}
              onPress={() => setShowExportPicker(false)}
            >
              <Text style={styles.btnGhostText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PDF Generating overlay — NOT a Modal. iOS only allows one presented
          view controller at a time, and `expo-print` internally presents its
          own VC. Wrapping this indicator in a <Modal> caused
          Print.printToFileAsync to hang silently on iOS Expo Go (the Poster
          generation symptom). An inline absolutely-positioned overlay does
          not compete with iOS for the presented-VC slot, so the print job
          and any error Alerts can mount normally on top of it. */}
      {pdfBusy ? (
        <View style={pickerStyles.busyOverlay} pointerEvents="auto">
          <BevelCard style={pickerStyles.busyCard}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text style={pickerStyles.busyText}>Generating PDF…</Text>
            <Text style={pickerStyles.busySub}>This may take a moment for items with photos.</Text>
          </BevelCard>
        </View>
      ) : null}

      {/* For-Sale Poster Builder Modal */}
      <Modal
        visible={showPosterBuilder}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPosterBuilder(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: "92%" }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="megaphone" size={20} color={theme.colors.accent} />
              <Text style={styles.modalTitle}>FOR-SALE POSTER</Text>
              <TouchableOpacity onPress={() => setShowPosterBuilder(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.helper, { marginBottom: 12 }]}>
              Pick which fields appear on the poster. The flyer is letter-size with a
              big "FOR SALE" banner, your asking price, and the photo & specs you choose.
            </Text>
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {([
                { k: "photo", label: "Main photo (large)" },
                { k: "name", label: "Item name" },
                { k: "price", label: "Asking price (large box)" },
                { k: "brand", label: "Brand" },
                // "Model" (brand-product-model) row removed — every tool
                // now uses a single consolidated "Model #" identifier.
                { k: "serial", label: "Model #" },
                { k: "condition", label: "Condition" },
                { k: "category", label: "Category" },
                { k: "purchase_date", label: "Original purchase date" },
                { k: "description", label: "Description" },
                { k: "sale_notes", label: "Seller's notes" },
                { k: "contact_name", label: "Contact: your name" },
                { k: "contact_phone", label: "Contact: phone" },
                { k: "contact_email", label: "Contact: email" },
              ] as { k: PosterFieldKey; label: string }[]).map((f) => (
                <View key={f.k} style={styles.posterRow}>
                  <Text style={styles.posterRowLabel}>{f.label}</Text>
                  <Switch
                    testID={`poster-toggle-${f.k}`}
                    value={!!posterFields[f.k]}
                    onValueChange={(v) =>
                      setPosterFields((s) => ({ ...s, [f.k]: v }))
                    }
                    trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                    thumbColor="#fff"
                  />
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                testID="poster-cancel-btn"
                style={[styles.btnGhost, { flex: 1, marginTop: 0 }]}
                onPress={() => setShowPosterBuilder(false)}
              >
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="poster-generate-btn"
                style={[styles.btnPrimary, { flex: 1 }]}
                onPress={generateForSalePoster}
              >
                <Ionicons name="print" size={14} color="#000" />
                <Text style={styles.btnPrimaryText}>GENERATE POSTER</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Location Picker Modal — assigns this tool to a different existing
          location. Does NOT touch the location tree itself (user report #3). */}
      <Modal
        visible={showLocationPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLocationPicker(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="location" size={20} color={theme.colors.accent} />
              <Text style={styles.modalTitle}>MOVE TO LOCATION</Text>
              <TouchableOpacity
                onPress={() => setShowLocationPicker(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.helper, { marginBottom: 12 }]}>
              Pick a different location for this item. Your location tree is
              not changed.
            </Text>
            <LocationPicker
              locationId={tool.location_id || null}
              locationName={tool.location_name || ""}
              onChange={async (newId, _newPath) => {
                try {
                  await api.updateTool(tool.id, {
                    location_id: newId || null,
                  });
                  setShowLocationPicker(false);
                  load();
                } catch (e: any) {
                  Alert.alert(
                    "Could not move item",
                    String(e?.message || e),
                  );
                }
              }}
            />
            <TouchableOpacity
              testID="location-picker-cancel"
              style={[styles.btnGhost, { marginTop: 14 }]}
              onPress={() => setShowLocationPicker(false)}
            >
              <Text style={styles.btnGhostText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* List For Sale Modal */}
      <Modal visible={showSaleListing} transparent animationType="slide" onRequestClose={() => setShowSaleListing(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="pricetag" size={20} color={theme.colors.accent} />
              <Text style={styles.modalTitle}>
                {tool?.for_sale ? "EDIT SALE LISTING" : "LIST FOR SALE"}
              </Text>
              <TouchableOpacity onPress={() => setShowSaleListing(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.repairLabel}>SALE PRICE ($)</Text>
            <TextInput
              testID="list-sale-price"
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              value={saleForm.price}
              onChangeText={(v) => setSaleForm({ ...saleForm, price: v })}
              style={styles.input}
              keyboardType="decimal-pad"
              autoFocus
            />
            <Text style={styles.repairLabel}>NOTES (optional)</Text>
            <TextInput
              testID="list-sale-notes"
              placeholder="Reason for selling, condition notes, contact info..."
              placeholderTextColor={theme.colors.textMuted}
              value={saleForm.notes}
              onChangeText={(v) => setSaleForm({ ...saleForm, notes: v })}
              style={[styles.input, { height: 80, textAlignVertical: "top" }]}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => setShowSaleListing(false)}
                style={[styles.modalBtn, { flex: 1, backgroundColor: theme.colors.bgSecondary }]}
              >
                <Text style={[styles.modalBtnText, { color: theme.colors.textPrimary }]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-list-sale"
                disabled={saleBusy}
                onPress={submitSaleListing}
                style={[styles.modalBtn, { flex: 1, backgroundColor: theme.colors.accent }]}
              >
                {saleBusy ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: "#000" }]}>
                    {tool?.for_sale ? "UPDATE LISTING" : "LIST IT"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Mark Sold Modal */}
      <Modal visible={showMarkSold} transparent animationType="slide" onRequestClose={() => setShowMarkSold(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="checkmark-done-circle" size={20} color="#27AE60" />
              <Text style={styles.modalTitle}>MARK AS SOLD</Text>
              <TouchableOpacity onPress={() => setShowMarkSold(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>
              <Text style={styles.repairLabel}>SOLD PRICE ($) — per unit</Text>
              <TextInput
                testID="sold-price"
                placeholder="0.00"
                placeholderTextColor={theme.colors.textMuted}
                value={markSoldForm.sold_price}
                onChangeText={(v) => setMarkSoldForm({ ...markSoldForm, sold_price: v })}
                style={styles.input}
                keyboardType="decimal-pad"
              />
              {tool.quantity && tool.quantity > 1 ? (
                <>
                  <Text style={styles.repairLabel}>SOLD QUANTITY (you have {tool.quantity})</Text>
                  <TextInput
                    testID="sold-quantity"
                    placeholder={String(tool.quantity)}
                    placeholderTextColor={theme.colors.textMuted}
                    value={markSoldForm.sold_quantity}
                    onChangeText={(v) =>
                      setMarkSoldForm({ ...markSoldForm, sold_quantity: v.replace(/[^0-9]/g, "") })
                    }
                    style={styles.input}
                    keyboardType="number-pad"
                  />
                  <Text style={[{ color: "#888", fontSize: 8, lineHeight: 10, marginTop: -4, marginBottom: 8 }]}>
                    Leave blank to sell all {tool.quantity}. Enter a smaller number for a partial sale (stock decreases, item stays active).
                  </Text>
                </>
              ) : null}
              <Text style={styles.repairLabel}>SOLD TO (buyer name)</Text>
              <TextInput
                testID="sold-to"
                placeholder="Buyer name / contact"
                placeholderTextColor={theme.colors.textMuted}
                value={markSoldForm.sold_to}
                onChangeText={(v) => setMarkSoldForm({ ...markSoldForm, sold_to: v })}
                style={styles.input}
              />
              <Text style={styles.repairLabel}>SOLD ON</Text>
              <DateField
                testID="sold-on"
                value={markSoldForm.sold_at}
                onChange={(v) => setMarkSoldForm({ ...markSoldForm, sold_at: v })}
              />
              <Text style={styles.repairLabel}>NOTES (optional)</Text>
              <TextInput
                testID="sold-notes"
                placeholder="Any details about the sale..."
                placeholderTextColor={theme.colors.textMuted}
                value={markSoldForm.sold_notes}
                onChangeText={(v) => setMarkSoldForm({ ...markSoldForm, sold_notes: v })}
                style={[styles.input, { height: 70, textAlignVertical: "top" }]}
                multiline
              />
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => setShowMarkSold(false)}
                style={[styles.modalBtn, { flex: 1, backgroundColor: theme.colors.bgSecondary }]}
              >
                <Text style={[styles.modalBtnText, { color: theme.colors.textPrimary }]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-mark-sold"
                disabled={markSoldBusy}
                onPress={async () => {
                  setMarkSoldBusy(true);
                  try {
                    const soldQtyNum = parseInt(markSoldForm.sold_quantity, 10);
                    const fullStock = Math.max(1, tool.quantity || 1);
                    const soldQty =
                      isFinite(soldQtyNum) && soldQtyNum > 0
                        ? Math.min(soldQtyNum, fullStock)
                        : fullStock;
                    const partial = soldQty < fullStock;
                    await api.markToolSold(tool.id, {
                      sold_price: parseFloat(markSoldForm.sold_price) || 0,
                      sold_to: markSoldForm.sold_to,
                      sold_at: markSoldForm.sold_at,
                      sold_notes: markSoldForm.sold_notes,
                      sold_quantity: soldQty,
                    });
                    setShowMarkSold(false);
                    if (partial) {
                      // Stock decremented; tool still active, no archive prompt.
                      Alert.alert(
                        "Partial Sale Recorded",
                        `Stock reduced by ${soldQty}. ${fullStock - soldQty} remaining in inventory.`,
                      );
                      load();
                    } else {
                      setShowSoldDelete(true); // ask delete vs archive
                    }
                  } catch (e: any) {
                    Alert.alert("Error", String(e?.message || e));
                  } finally {
                    setMarkSoldBusy(false);
                  }
                }}
                style={[styles.modalBtn, { flex: 1, backgroundColor: "#27AE60" }]}
              >
                {markSoldBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: "#fff" }]}>MARK SOLD</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* After-sold: delete or archive */}
      <Modal visible={showSoldDelete} transparent animationType="fade" onRequestClose={() => setShowSoldDelete(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 420 }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="checkmark-done-circle" size={22} color="#27AE60" />
              <Text style={styles.modalTitle}>SOLD!</Text>
            </View>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 10, lineHeight: 14, marginBottom: 16 }}>
              The item has been marked sold.  Would you like to keep it in your
              SOLD archive (you can still report on it later) or remove it
              from the system entirely?
            </Text>
            <TouchableOpacity
              testID="sold-archive-btn"
              onPress={() => {
                setShowSoldDelete(false);
                load();
              }}
              style={[styles.modalBtn, { backgroundColor: theme.colors.accent, marginBottom: 8 }]}
            >
              <Text style={[styles.modalBtnText, { color: "#000" }]}>KEEP IN SOLD ARCHIVE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="sold-delete-btn"
              onPress={async () => {
                try {
                  await api.deleteTool(tool.id);
                  setShowSoldDelete(false);
                  router.replace("/for-sale");
                } catch (e: any) {
                  Alert.alert("Error", String(e?.message || e));
                }
              }}
              style={[styles.modalBtn, { backgroundColor: theme.colors.danger }]}
            >
              <Text style={[styles.modalBtnText, { color: "#fff" }]}>DELETE FROM SYSTEM</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== FULL-SCREEN PHOTO VIEWER (pinch-to-zoom, swipe to dismiss) ===== */}
      <PinchZoomImageViewer
        images={(photos || []).map((p: string) => ({ uri: p }))}
        imageIndex={photoIdx}
        visible={isImageViewerVisible}
        onRequestClose={() => setIsImageViewerVisible(false)}
      />

      {/* ===== QUANTITY EDIT MODAL (opened from QUANTITY pillbox in photo row) ===== */}
      <Modal
        visible={showQtyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQtyModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="layers-outline" size={18} color={theme.colors.accent} />
              <Text style={[styles.modalTitle, { fontSize: 13, letterSpacing: 1.6 }]}>
                ADJUST QUANTITY
              </Text>
              <TouchableOpacity
                onPress={() => setShowQtyModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                testID="close-qty-modal-x"
              >
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: 12,
                lineHeight: 18,
                marginBottom: 14,
              }}
            >
              Set how many units of this item you have in stock. Tap the number to
              type a value directly, or use the +/− buttons.
            </Text>

            <View style={{ marginBottom: 16 }}>
              <QuantityStepper tool={tool} onChange={load} />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  {
                    flex: 1,
                    backgroundColor: theme.colors.accent,
                    paddingVertical: 14,
                  },
                ]}
                onPress={() => setShowQtyModal(false)}
                testID="close-qty-modal"
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.modalBtnText,
                    { color: "#000", fontSize: 12, letterSpacing: 1.5 },
                  ]}
                >
                  DONE
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || "—"}</Text>
    </View>
  );
}

// Collapsible pillbox used in the Attachments section. Shows label + a small
// count badge and a chevron; tapping toggles `open`. When open the children
// are rendered inside a body view directly below the header pill.
function AttachmentPill({
  icon,
  label,
  count,
  open,
  onToggle,
  children,
}: {
  icon: any;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={newStyles.attachWrap}>
      <BevelCard
        style={newStyles.attachHeader}
        activeOpacity={0.85}
        onPress={onToggle}
        testID={`attach-${label.toLowerCase()}-toggle`}
      >
        <Ionicons name={icon} size={16} color={theme.colors.accent} />
        <Text style={newStyles.attachHeaderLabel}>{label}</Text>
        <View style={newStyles.attachCountPill}>
          <Text style={newStyles.attachCountText}>{count}</Text>
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.colors.textMuted}
        />
      </BevelCard>
      {open && <View style={newStyles.attachBody}>{children}</View>}
    </View>
  );
}

// Pillbox row used in the redesigned ToolDetail layout.
// Mirrors the look of the Home Screen rows: a grey container with the label on
// the left and a darker rounded "value pill" on the right. Optional `onPress`
// makes the row tappable (with a small chevron). Optional `sub` shows a
// secondary line under the main label.
function PillRow({
  label,
  value,
  sub,
  onPress,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  onPress?: () => void;
  valueColor?: string;
}) {
  return (
    <BevelCard
      style={newStyles.pillRow}
      {...(onPress ? { onPress, activeOpacity: 0.85 } : {})}
    >
      <View style={{ flex: 1 }}>
        <Text style={newStyles.pillRowLabel}>{label}</Text>
        {!!sub && <Text style={newStyles.pillRowSub}>{sub}</Text>}
      </View>
      <View
        style={[
          newStyles.pillRowValue,
          valueColor ? { borderColor: valueColor } : null,
        ]}
      >
        <Text
          style={[
            newStyles.pillRowValueText,
            valueColor ? { color: valueColor } : null,
          ]}
          numberOfLines={1}
        >
          {value || "—"}
        </Text>
      </View>
      {!!onPress && (
        <Ionicons
          name="chevron-forward"
          size={14}
          color={theme.colors.textMuted}
          style={{ marginLeft: 4 }}
        />
      )}
    </BevelCard>
  );
}

function QuantityStepper({
  tool,
  onChange,
}: {
  tool: any;
  onChange: () => void;
}) {
  const current = Math.max(1, Number(tool.quantity) || 1);
  const [value, setValue] = useState<number>(current);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(String(current));
  const [busy, setBusy] = useState(false);

  // Resync when the tool changes (e.g. after onChange triggers a reload).
  useEffect(() => {
    setValue(current);
    if (!editing) setDraft(String(current));
  }, [current, editing]);

  const persist = useCallback(
    async (nextRaw: number) => {
      const next = Math.max(1, Math.floor(nextRaw));
      if (next === current) return;
      setBusy(true);
      setValue(next); // optimistic
      try {
        await api.updateTool(tool.id, { quantity: next });
        onChange();
      } catch (e: any) {
        setValue(current); // rollback
        Alert.alert("Could not update quantity", String(e?.message || e));
      } finally {
        setBusy(false);
      }
    },
    [current, tool.id, onChange],
  );

  const dec = () => persist(value - 1);
  const inc = () => persist(value + 1);

  const commitDraft = () => {
    setEditing(false);
    const n = parseInt(draft, 10);
    if (!isFinite(n) || n < 1) {
      setDraft(String(value));
      return;
    }
    persist(n);
  };

  const ext = (Number(tool.cost) || 0) * value;

  return (
    <BevelCard style={qsStyles.box}>
      <View style={{ flex: 1 }}>
        <Text style={qsStyles.label}>QUANTITY IN STOCK</Text>
        {tool.cost ? (
          <Text style={qsStyles.sub}>
            ${(Number(tool.cost) || 0).toFixed(2)} ea  ·  Total ${ext.toFixed(2)}
          </Text>
        ) : (
          <Text style={qsStyles.sub}>Tap +/− to adjust</Text>
        )}
      </View>
      <View style={qsStyles.row}>
        <TouchableOpacity
          testID="qty-dec"
          style={[qsStyles.btn, value <= 1 && qsStyles.btnDisabled]}
          onPress={dec}
          disabled={value <= 1 || busy}
          activeOpacity={0.7}
        >
          <Ionicons
            name="remove"
            size={22}
            color={value <= 1 ? theme.colors.textMuted : "#000"}
          />
        </TouchableOpacity>

        {editing ? (
          <TextInput
            testID="qty-input"
            value={draft}
            onChangeText={(t) => setDraft(t.replace(/[^0-9]/g, ""))}
            onBlur={commitDraft}
            onSubmitEditing={commitDraft}
            autoFocus
            keyboardType="number-pad"
            style={qsStyles.value}
            selectTextOnFocus
          />
        ) : (
          <TouchableOpacity
            testID="qty-value"
            onPress={() => {
              setDraft(String(value));
              setEditing(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={qsStyles.value}>{busy ? "…" : value}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          testID="qty-inc"
          style={qsStyles.btn}
          onPress={inc}
          disabled={busy}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>
    </BevelCard>
  );
}

const qsStyles = themedStyles((c) => ({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 4,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  
    ...(theme.elevation.md as object),
  },
  label: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  sub: {
    color: c.textSecondary,
    fontSize: 9,
    marginTop: 3,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
  },
  value: {
    minWidth: 48,
    textAlign: "center",
    color: c.textPrimary,
    fontSize: 16,
    fontWeight: "900",
    paddingHorizontal: 6,
    paddingVertical: 0,
  },
}));



const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  bodyContainer: { paddingHorizontal: 16, paddingBottom: 12 },
  infoCard: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: theme.radii.md,
    padding: 18,
    marginBottom: 16,
    overflow: "hidden",
    ...(theme.elevation.md as object),
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  heroBox: { backgroundColor: c.bgSecondary, marginBottom: 16 },
  heroImg: { width: "100%", height: 280, resizeMode: "cover" },
  heroPlaceholder: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surface,
  },
  addPhotoPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: c.bgSecondary,
    marginBottom: 14,
    ...(theme.elevation.md as object),
  },
  addPhotoPillText: {
    color: c.accent,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  posterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  posterRowLabel: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  thumbStrip: { backgroundColor: c.bg },
  thumbSm: {
    width: 56,
    height: 56,
    borderWidth: 1,
    borderColor: c.border,
  },
  thumbActive: { borderColor: c.accent, borderWidth: 2 },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    backgroundColor: c.bgSecondary,
    gap: 8,
    marginBottom: 14,
    ...(theme.elevation.md as object),
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: c.textPrimary, fontWeight: "800", letterSpacing: 1, fontSize: 9 },
  statusSub: { color: c.textSecondary, fontSize: 8, marginTop: 2 },
  repairBanner: {
    padding: 14,
    borderWidth: 1,
    borderColor: c.danger,
    backgroundColor: "rgba(239, 68, 68, 0.18)",
    borderRadius: theme.radii.md,
    marginBottom: 16,
    ...(theme.elevation.md as object),
  },
  repairTitle: {
    color: "#FCA5A5",
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 9,
    marginBottom: 4,
  },
  repairLine: { color: c.textPrimary, fontSize: 10, marginTop: 1 },
  brokenPhoto: {
    width: "100%",
    height: 220,
    borderRadius: 6,
    marginTop: 12,
    backgroundColor: c.bg,
  },
  notifyRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  notifyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    backgroundColor: c.danger,
    borderRadius: 4,
  },
  notifyText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 8,
    letterSpacing: 1.2,
  },
  title: { color: c.textPrimary, fontSize: 19, fontWeight: "900", letterSpacing: 1 },
  description: { color: c.textSecondary, fontSize: 11, marginTop: 8, lineHeight: 16 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 16 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
  
    ...(theme.elevation.md as object),
  },
  detailRowLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.8,
    marginBottom: 2,
  },
  detailRowValue: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "700",
  },
  // Sale / Sold banner
  saleBanner: {
    backgroundColor: c.accent,
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    marginBottom: 6,
  },
  listForSaleCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.accent,
    borderStyle: "dashed",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
    marginBottom: 6,
  
    ...(theme.elevation.md as object),
  },
  listForSaleCtaText: {
    flex: 1,
    color: c.accent,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  saleBannerTitle: {
    color: "#000",
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 2,
  },
  saleBannerPrice: {
    color: "#000",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4,
  },
  saleBannerNotes: {
    color: "rgba(0,0,0,0.7)",
    fontSize: 8,
    marginTop: 4,
    fontStyle: "italic",
  },
  markSoldBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#27AE60",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  markSoldText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 8,
    letterSpacing: 1.5,
  },
  // Generic modal helpers
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 18,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  modalTitle: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  modalBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalBtnText: {
    fontWeight: "900",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: "rgba(249, 115, 22,0.15)",
    borderRadius: 2,
  },
  tagText: { color: c.accent, fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 24, gap: 0 },
  field: {
    width: "50%",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  fieldLabel: {
    color: c.textMuted,
    fontSize: 7,
    letterSpacing: 1.5,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  fieldValue: { color: c.textPrimary, fontSize: 10, fontWeight: "600", marginTop: 4 },
  sectionLabel: {
    color: c.textMuted,
    fontSize: 8,
    letterSpacing: 2,
    fontWeight: "800",
    marginTop: 28,
    marginBottom: 12,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  docName: { color: c.textPrimary, flex: 1, fontSize: 10 },
  histRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  histName: { color: c.textPrimary, fontWeight: "700", fontSize: 10 },
  histDate: { color: c.textSecondary, fontSize: 9, marginTop: 2 },
  histNotes: { color: c.textMuted, fontSize: 9, marginTop: 4, fontStyle: "italic" },
  consumableBox: {
    marginTop: 16, padding: 12, borderWidth: 1,
    borderColor: c.accent, backgroundColor: "rgba(249, 115, 22,0.08)", borderRadius: 4,
  },
  warrantyBox: {
    marginTop: 12, padding: 12, borderWidth: 1,
    borderColor: c.success, backgroundColor: "rgba(34,197,94,0.06)", borderRadius: 4,
  },
  consumableHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  consumableTitle: { color: c.accent, fontWeight: "900", letterSpacing: 1.5, fontSize: 9 },
  consumableLine: { color: c.textPrimary, fontSize: 10, marginTop: 2 },
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 24,
    backgroundColor: "rgba(15, 15, 15, 0.96)",
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  btn: {
    flexDirection: "row",
    backgroundColor: c.accent,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.md,
    gap: 8,
    ...(theme.elevation.accent as object),
  },
  btnSuccess: {
    flexDirection: "row",
    backgroundColor: c.success,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.md,
    gap: 8,
    ...(theme.elevation.md as object),
  },
  btnDanger: {
    flexDirection: "row",
    backgroundColor: c.danger,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.md,
    gap: 6,
    ...(theme.elevation.md as object),
  },
  repairLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 4,
  },
  dealerLockBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  
    ...(theme.elevation.md as object),
  },
  dealerLockName: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "700",
  },
  dealerLockMissing: {
    flex: 1,
    color: c.warning,
    fontSize: 9,
    fontStyle: "italic",
  },
  repChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 4,
  },
  repChipActive: {
    borderColor: c.danger,
    backgroundColor: c.danger,
  },
  repChipText: { color: c.textSecondary, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  repChipTextActive: { color: c.textPrimary },
  btnText: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 10 },
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 14,
    borderRadius: 4,
    overflow: "hidden",
  },
  segBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  segBtnActive: { backgroundColor: "transparent", borderWidth: 2, borderColor: c.accent, borderRadius: 4 },
  segText: { color: c.textSecondary, fontWeight: "800", fontSize: 9, letterSpacing: 1 },
  segTextActive: { color: c.accent },
  borrowerPick: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 6,
    borderRadius: 4,
  },
  borrowerPickActive: { borderColor: c.accent, backgroundColor: "rgba(249, 115, 22,0.1)" },
  borrowerName: { color: c.textPrimary, fontWeight: "600", fontSize: 10 },
  input: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    color: c.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 48,
    borderRadius: 4,
    marginBottom: 10,
    fontSize: 11,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  helper: {
    color: c.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: c.border,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    marginTop: 4,
  },
  btnGhostText: { color: c.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 10 },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.accent,
    height: 48,
    borderRadius: 4,
    paddingHorizontal: 12,
  },
  btnPrimaryText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 11,
    textAlign: "center",
  },
}));

// New styles for the redesigned Tool Detail layout. Kept in a separate
// StyleSheet so the original `styles` object isn't disturbed.
const newStyles = themedStyles((c) => ({
  // ---------- HEADER ----------
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0, // critical: lets the title shrink instead of pushing buttons off-screen
  },
  headerTitle: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 20,
    lineHeight: 24,
  },
  headerSerial: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexShrink: 0,
  },

  // ---------- PAGE WRAPPER ----------
  page: {
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 14,
  },

  // ---------- STATUS PILLBOX ROW ----------
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.bgSecondary,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  
    ...(theme.elevation.md as object),
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  statusLabel: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  statusActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  statusBtn: {
    backgroundColor: c.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusBtnText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  statusBtnGhost: {
    backgroundColor: c.bg,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },

  // ---------- PHOTO + RIGHT-COLUMN PILLBOX FIELDS ----------
  photoRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  photoFrame: {
    width: 110,
    height: 110,
    borderRadius: 12,
    backgroundColor: c.bgSecondary,
    borderColor: c.border,
    borderWidth: 1,
    overflow: "hidden",
  },
  photoImg: { width: "100%", height: "100%" },
  photoEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: c.bgSecondary,
  },
  photoEmptyText: {
    color: c.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  photoRightCol: {
    flex: 1,
    justifyContent: "space-between",
    gap: 6,
  },

  // ---------- PILLBOX ROW (used in PillRow component) ----------
  pillRow: {
    /* Surface (gradient + bevel borders + drop shadow) comes from
       <BevelCard>. We only describe the inner flex layout here so the
       gradient isn't obliterated by a flat bgSecondary fill. */
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 10,
    minHeight: 28,
    marginBottom: 6,
  },
  pillRowLabel: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 9.5,
    letterSpacing: 0.8,
  },
  pillRowSub: {
    color: c.textMuted,
    fontWeight: "600",
    fontSize: 9,
    marginTop: 1,
  },
  pillRowValue: {
    backgroundColor: c.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    maxWidth: "60%",
  },
  pillRowValueText: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.3,
  },

  // ---------- DESCRIPTION ----------
  descBox: {
    backgroundColor: c.bgSecondary,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  
    ...(theme.elevation.md as object),
  },
  descText: {
    color: c.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },

  // ---------- DETAILS BOX (groups location/dealer/brand/model/purchased/category) ----------
  detailsBox: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    padding: 12,
    marginTop: 4,
  
    ...(theme.elevation.md as object),
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
    gap: 8,
  },
  detailsRowLast: {
    borderBottomWidth: 0,
  },
  detailsRowTouchable: {
    // Touchable variant keeps the same row look — only adds a subtle hint via chevron icon.
  },
  detailsLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  detailsValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    maxWidth: "70%",
    justifyContent: "flex-end",
  },
  detailsValue: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
    flexShrink: 1,
  },
  detailsExpanded: {
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },

  // ---------- CHECKED OUT CARD (sits in the same slot as the claim card —
  // immediately under the photo, above the description — styled like the
  // red claim card but with a soft yellow tint per user request) ----------
  checkedOutCard: {
    backgroundColor: "rgba(249, 115, 22, 0.10)",
    borderColor: c.accent,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  checkedOutTitle: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.8,
  },
  checkedOutLine: {
    color: c.textPrimary,
    fontSize: 12,
    marginTop: 4,
  },

  // ---------- (legacy) CHECKED OUT PILL — kept for back-compat in case
  // any other screen still references these style keys ----------
  checkedOutBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  checkedOutHeader: {
    color: "#000",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.3,
  },
  checkedOutSub: {
    color: "rgba(0,0,0,0.7)",
    fontWeight: "700",
    fontSize: 11,
    marginTop: 2,
  },

  // ---------- TAGS ----------
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagChip: {
    backgroundColor: c.bgSecondary,
    borderColor: c.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  
    ...(theme.elevation.md as object),
  },
  tagChipText: {
    color: c.textPrimary,
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  // ---------- FIELD GROUP ----------
  fieldGroup: {
    gap: 6,
  },

  // ---------- LOCATION (wide pill, NO label) ----------
  locationWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.bgSecondary,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 28,
  
    ...(theme.elevation.md as object),
  },
  locationWideText: {
    flex: 1,
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.3,
  },

  // ---------- HISTORY LINK ROWS (navigates to a dedicated page) ----------
  historyLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.bgSecondary,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
    minHeight: 28,
  
    ...(theme.elevation.md as object),
  },
  historyLinkLabel: {
    flex: 1,
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 9.5,
    letterSpacing: 0.8,
  },
  historyCount: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  historyCountText: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 10,
  },

  // ---------- MODEL NUMBERS (under Dealer) ----------
  serialBox: {
    backgroundColor: c.bgSecondary,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  
    ...(theme.elevation.md as object),
  },
  serialBoxLabel: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 9.5,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  serialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  serialIdx: {
    color: c.textMuted,
    fontSize: 9.5,
    fontWeight: "800",
    minWidth: 16,
  },
  serialVal: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.3,
    flex: 1,
  },

  // ---------- SET SERIALS ----------
  setSerialBox: {
    backgroundColor: c.bgSecondary,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  
    ...(theme.elevation.md as object),
  },
  setSerialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  setSerialIdx: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: "700",
    width: 20,
  },
  setSerialVal: {
    color: c.textPrimary,
    fontWeight: "700",
    fontSize: 13,
    flex: 1,
  },
  emptyHint: {
    color: c.textMuted,
    fontStyle: "italic",
    fontSize: 12,
  },

  // ---------- REPAIR / SALE CARDS ----------
  repairCard: {
    backgroundColor: "rgba(231, 76, 60, 0.08)",
    borderColor: c.danger,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  repairTitle: {
    color: c.danger,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.8,
  },
  repairLine: {
    color: c.textPrimary,
    fontSize: 12,
    marginTop: 4,
  },
  saleCard: {
    backgroundColor: c.accent,
    borderRadius: 12,
    padding: 12,
  },
  saleTitle: {
    color: "#000",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.8,
  },
  saleNotes: {
    color: "#000",
    fontSize: 12,
    marginTop: 2,
  },
  saleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 999,
  },
  saleBtnText: {
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.8,
  },

  // ---------- BOTTOM ACTION CLUSTER ----------
  divider: {
    height: 1,
    backgroundColor: c.border,
    marginVertical: 6,
  },
  sectionTitle: {
    color: c.textMuted,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 1.2,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.bgSecondary,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  
    ...(theme.elevation.md as object),
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  actionBtnText: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.8,
  },

  // ---------- BOTTOM ACTION GRID (2-up tiles) ----------
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  actionTile: {
    width: "48.5%",
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: c.bgSecondary,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 6,
  
    ...(theme.elevation.md as object),
  },
  actionTileDanger: {
    borderColor: c.danger,
    backgroundColor: "rgba(220,38,38,0.08)",
  },
  actionTileText: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.8,
    textAlign: "center",
  },

  // ---------- ATTACHMENTS (collapsible pillboxes) ----------
  attachWrap: {
    marginTop: 8,
  },
  attachHeader: {
    /* Surface (gradient + bevel borders + drop shadow) comes from
       <BevelCard>. Strip the flat bgSecondary fill so the gradient
       actually shows through. */
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 28,
  },
  attachHeaderLabel: {
    flex: 1,
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 9.5,
    letterSpacing: 0.8,
  },
  attachCountPill: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  attachCountText: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 10,
  },
  attachBody: {
    marginTop: 8,
    paddingHorizontal: 4,
  },

  // ---------- GALLERY thumbnail strip ----------
  galleryRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  galleryThumb: {
    width: 84,
    height: 84,
    borderRadius: 10,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
  },
  galleryAddTile: {
    width: 84,
    height: 84,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: c.accent,
    backgroundColor: c.bgSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  galleryEmpty: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: c.accent,
  },
  galleryEmptyText: {
    color: c.accent,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1,
  },

  // ---------- CHECKOUT HISTORY ----------
  histRow: {
    backgroundColor: c.bgSecondary,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    gap: 2,
  
    ...(theme.elevation.md as object),
  },
  histName: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 13,
  },
  histDate: {
    color: c.textMuted,
    fontSize: 11,
  },
  histNotes: {
    color: c.textPrimary,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 4,
  },
}));

const pickerStyles = themedStyles((c) => ({
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    marginBottom: 10,
  
    ...(theme.elevation.md as object),
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceTitle: {
    color: c.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  choiceSub: {
    color: c.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  busyCard: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 36,
    alignItems: "center",
    minWidth: 240,
  
    ...(theme.elevation.md as object),
  },
  busyOverlay: {
    // Absolute, in-tree overlay (NOT a Modal). On iOS, only one presented
    // view controller is allowed at a time — a Modal here would block
    // expo-print's internal WKWebView VC from mounting, which is why the
    // poster generation hung silently. Inline overlay sidesteps that.
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 30,
  },
  busyText: {
    color: c.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 14,
  },
  busySub: {
    color: c.textSecondary,
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
  },
}));

