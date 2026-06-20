import { compressToDataUri } from "../../src/lib/imageCompress";
import { AppImage } from "../../src/components/AppImage";
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
  ImageBackground,
} from "react-native";
import { AppSwitch } from "../../src/components/AppSwitch";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useAppResume } from "../../src/appLifecycle";
import * as ImagePicker from "expo-image-picker";
import { theme } from "../../src/theme";
import { loadPrefs } from "../../src/prefs";
import {
  scheduleBorrowReminder,
  cancelBorrowReminder,
  composeBorrowSmsBody,
} from "../../src/borrowReminders";
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
import { buildLocationTree, flattenLocationTree } from "../../src/locationTree";
import { ReceiptsSection } from "../../src/sections/ReceiptsSection";
import { MaintenanceSection } from "../../src/sections/MaintenanceSection";
import { WarrantySection } from "../../src/sections/WarrantySection";
import PinchZoomImageViewer from "../../src/components/PinchZoomImageViewer";
import { themedStyles, useSkin } from "../../src/themeContext";
import { qsStyles, styles, newStyles, pickerStyles } from "../../src/screens/tool/toolDetailStyles";
import { BevelCard } from "../../src/components/BevelCard";
import { ShadowBox, ShadowBoxSubCard, ShadowBoxMini } from "../../src/components/ShadowBox";
import { ContactIconImage } from "../../src/components/ContactIcons";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { PillButton } from "../../src/components/PillButton";
import { SKIN, CAP, TBV } from "../../src/tbv/skins";
import { useIsSteel, useSteelPanelFrame } from "../../src/tbv/steel";
import TbvFrame from "../../src/tbv/components/TbvFrame";

import {
  pickContactNativeIOS,
  loadAllDeviceContactsAndroid,
  isAndroidPickerNeeded,
  isDeviceContactsAvailable,
  type PickedContact,
} from "../../src/deviceContacts";

export default function ToolDetail() {
  const { id, startClaim } = useLocalSearchParams<{ id: string; startClaim?: string }>();
  const router = useRouter();
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const isSteel = useIsSteel();
  const steelPanel = useSteelPanelFrame();
  const winSrc = isSteel ? steelPanel.source : SKIN.window;
  const winCap = isSteel ? steelPanel.capInsets : CAP.window;
  const steelScale = isSteel ? steelPanel.frameScale : undefined;

  // ── Iron Forge skin adapters ──────────────────────────────────────────
  // In the textured industrial themes these render real metal frames (the
  // same chrome as the dashboard/inventory). In plain Light/Dark they fall
  // back to the exact ShadowBox look the user locked in, so those themes are
  // left untouched.
  const GroupCard = ({ boxKey, children }: { boxKey: string; children: React.ReactNode }) =>
    isIndustrial ? (
      <TbvFrame
        source={winSrc}
        capInsets={winCap} frameScale={steelScale}
        padX={36}
        padTop={30}
        padBottom={32}
        testID={`details-box-${boxKey}`}
      >
        {children}
      </TbvFrame>
    ) : (
      <ShadowBox style={newStyles.detailsBox} testID={`details-box-${boxKey}`}>
        {children}
      </ShadowBox>
    );

  // Bottom ACTION grid tile: skinned steel button in Iron Forge (keeps the
  // semantic icon colour), flat ShadowBoxMini in plain Light/Dark.
  const ActionTile = ({
    testID,
    onPress,
    icon,
    iconColor,
    label,
  }: {
    testID: string;
    onPress: () => void;
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    label: string;
  }) =>
    isIndustrial ? (
      <TouchableOpacity
        testID={testID}
        activeOpacity={0.85}
        onPress={onPress}
        style={newStyles.actionTileSkinWrap}
      >
        <ImageBackground
          source={SKIN.btnPrimary}
          resizeMode="stretch"
          style={newStyles.actionTileSkin}
          imageStyle={newStyles.actionTileSkinImg}
        >
          <Text style={newStyles.actionTileSkinText}>{label}</Text>
        </ImageBackground>
      </TouchableOpacity>
    ) : (
      <ShadowBoxMini testID={testID} style={newStyles.actionTile} onPress={onPress}>
        <Ionicons name={icon} size={20} color={iconColor} />
        <Text style={newStyles.actionTileText}>{label}</Text>
      </ShadowBoxMini>
    );

  // Generic "info card" shell — metal window frame in Iron Forge, the original
  // flat card (claim / checked-out / sale) in plain Light/Dark.
  const CardShell = ({
    plainStyle,
    children,
  }: {
    plainStyle: any;
    children: React.ReactNode;
  }) =>
    isIndustrial ? (
      <TbvFrame source={winSrc} capInsets={winCap} frameScale={steelScale} padX={40} padTop={30} padBottom={32}>
        {children}
      </TbvFrame>
    ) : (
      <View style={plainStyle}>{children}</View>
    );

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
  // Auto-open the repair/claim sheet when arriving from the Claims "New Claim"
  // flow (/tool/[id]?startClaim=1) so it's the SAME process as marking broken.
  const claimAutoOpened = React.useRef(false);
  useEffect(() => {
    if (
      startClaim === "1" &&
      tool &&
      !claimAutoOpened.current &&
      (!tool.dealer_id || dealers.length > 0)
    ) {
      claimAutoOpened.current = true;
      openRepair();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startClaim, tool, dealers]);
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
  // All locations (flattened) for the inline picker inside the Move modal —
  // loaded when the modal opens so the user picks in-place (no 2nd popup).
  const [allLocations, setAllLocations] = useState<any[]>([]);
  useEffect(() => {
    if (showLocationPicker) {
      api.listLocations().then(setAllLocations).catch(() => {});
    }
  }, [showLocationPicker]);
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
    repair_cost: "", // dollars user paid out of pocket; "" → 0
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
          await compressToDataUri(a.uri);
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
      const data = await compressToDataUri(a.uri);
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
      const data = await compressToDataUri(a.uri);
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
        borrower_phone: coPhone || undefined,
        notes: coNotes,
      });
      setShowCheckout(false);
      setCoName("");
      setCoPhone("");
      setCoBorrowerId(null);
      setCoNotes("");
      // Schedule an overdue reminder if the user has opted in. Best-effort —
      // a notification failure must not block the checkout itself.
      try {
        const prefs = await loadPrefs();
        if (prefs.borrow_reminders_enabled) {
          await scheduleBorrowReminder({
            toolId: tool.id,
            toolName: tool.name || "Tool",
            borrowerName: name,
            borrowerPhone: coPhone || "",
            options: {
              enabled: true,
              reminderHours: prefs.borrow_reminder_hours || 24,
            },
          });
        }
      } catch { /* non-fatal */ }
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Checkout failed");
    }
  };

  const doCheckin = async () => {
    try {
      await api.checkinTool(tool.id);
      try {
        // Cancel any pending overdue notifications for this tool. Best-effort.
        await cancelBorrowReminder(tool.id);
      } catch { /* non-fatal */ }
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
      // Only pre-fill notified_at when the user has previously notified
      // the dealer. Previously this defaulted to today even when the
      // claim was just freshly opened (status=Not Reported), which made
      // the detail card show a misleading "Notified <today>" line for a
      // tool the user had only marked as broken. Now: empty by default.
      notified_at: tool.repair_info?.notified_at || "",
      expected_completion: tool.repair_info?.expected_completion || "",
      repair_status: tool.repair_info?.repair_status || "Not Reported",
      contact,
      notes: tool.repair_info?.notes || "",
      broken_photo: tool.repair_info?.broken_photo || "",
      repair_cost: tool.repair_info?.repair_cost
        ? String(tool.repair_info.repair_cost)
        : "",
    });
    setShowRepair(true);
  };

  const saveRepair = async () => {
    try {
      const _rcNum = parseFloat(repairForm.repair_cost || "0") || 0;
      await api.updateTool(tool.id, {
        needs_repair: true,
        repair_info: { ...repairForm, repair_cost: _rcNum },
      });
      setShowRepair(false);
      if (startClaim === "1") {
        router.replace("/claims");
        return;
      }
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
    // Condition field removed app-wide (2026-05-26 per user request).
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

    const _isLost = !!tool.lost_status?.is_lost;
    const statusLabel = _isLost
      ? (tool.lost_status?.type === "stolen" ? "STOLEN" : "LOST")
      : tool.is_sold ? "SOLD"
      : tool.is_checked_out ? "CHECKED OUT" : "AVAILABLE";
    const statusColor = (_isLost || tool.is_checked_out) ? "#dc2626" : "#16a34a";
    const statusBg = (_isLost || tool.is_checked_out) ? "#fee2e2" : "#dcfce7";

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
    if (tool.category_name) specPairs.push({ label: "Category", value: String(tool.category_name) });
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
    if (tool.lost_status?.is_lost)
      return {
        label: tool.lost_status?.type === "stolen" ? "STOLEN" : "LOST",
        color: theme.colors.danger,
      };
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

  const __body = (
    <SafeAreaView style={[styles.container, isIndustrial && styles.containerSkin]} edges={["top"]}>
      <IndustrialBanner
        title={tool.name || "Untitled Tool"}
        subtitle={tool.brand ? String(tool.brand) : "Item Details"}
        onBack={() => router.back()}
      />
      {/* ACTION PILL BUTTONS — sits just below the banner so the title up there
          gets every bit of available width. Mirrors the pattern we use on
          other detail screens (dealer, claim, etc.). */}
      <View style={newStyles.detailActionsRow}>
        <PillButton
          testID="edit-tool-btn"
          label="EDIT"
          icon="create-outline"
          variant="active"
          onPress={() => router.push({ pathname: "/tool/edit", params: { id: tool.id } })}
        />
        <PillButton
          testID="delete-tool-btn"
          label="DELETE"
          icon="trash-outline"
          variant="danger"
          onPress={doDelete}
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={newStyles.page}>

          {/* PHOTO + STATUS/QTY/PRICE — in Iron Forge these live together in
              the dealer "card" container; plain themes keep the photo + framed
              stat box side-by-side. */}
          {isIndustrial ? (
            <TbvFrame source={winSrc} capInsets={winCap} frameScale={steelScale} padX={20} padTop={22} padBottom={24}>
              <View style={newStyles.topUnifiedRow}>
                <TouchableOpacity
                  testID="photo-thumb"
                  style={newStyles.topUnifiedPhoto}
                  activeOpacity={photos.length ? 0.85 : 1}
                  onPress={photos.length ? () => { setPhotoIdx(0); setIsImageViewerVisible(true); } : promptAddPhoto}
                >
                  {photos.length > 0 ? (
                    <AppImage source={{ uri: photos[0] }} style={newStyles.photoImg} />
                  ) : (
                    <View style={newStyles.dealerPhotoEmpty}>
                      <Ionicons name="camera" size={20} color={theme.colors.accent} />
                      <Text style={newStyles.photoEmptyText}>ADD PHOTO</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={newStyles.topUnifiedRows}>
                  <PillRow first label="STATUS" value={statusInfo.label} valueColor={statusInfo.color} />
                  <PillRow
                    label="QUANTITY"
                    value={String(Math.max(1, Number(tool.quantity) || 1))}
                    onPress={() => setShowQtyModal(true)}
                  />
                  <PillRow label="PRICE EACH" value={fmtMoney(tool.cost)} />
                </View>
              </View>
            </TbvFrame>
          ) : (
            <View style={newStyles.photoRow}>
              <TouchableOpacity
                testID="photo-thumb"
                style={newStyles.photoFrame}
                activeOpacity={photos.length ? 0.85 : 1}
                onPress={photos.length ? () => { setPhotoIdx(0); setIsImageViewerVisible(true); } : promptAddPhoto}
              >
                {photos.length > 0 ? (
                  <AppImage source={{ uri: photos[0] }} style={newStyles.photoImg} />
                ) : (
                  <View style={newStyles.photoEmpty}>
                    <Ionicons name="camera" size={22} color={theme.colors.accent} />
                    <Text style={newStyles.photoEmptyText}>ADD PHOTO</Text>
                  </View>
                )}
              </TouchableOpacity>
              <ShadowBox style={newStyles.statShadowBox}>
                <PillRow first label="STATUS" value={statusInfo.label} valueColor={statusInfo.color} />
                <PillRow
                  label="QUANTITY"
                  value={String(Math.max(1, Number(tool.quantity) || 1))}
                  onPress={() => setShowQtyModal(true)}
                />
                <PillRow label="PRICE EACH" value={fmtMoney(tool.cost)} />
              </ShadowBox>
            </View>
          )}

          {/* CLAIM INFORMATION — converted to the "card within a card" style
              (per user 2026-05-27, matching WarrantySection layout): outer
              Description Card with flat header (icon + title + status badge),
              inner inset card holding the claim data rows + action buttons.
              Shown FIRST under the photo when the tool is broken/in-repair. */}
          {tool.needs_repair && (
            <CardShell plainStyle={newStyles.claimBox}>
              {/* Flat header — icon + title + status badge */}
              <View style={newStyles.claimHead}>
                <Ionicons name="build" size={18} color={theme.colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={newStyles.claimTitle}
                    allowFontScaling={false}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    CLAIM INFORMATION
                  </Text>
                  {!!tool.repair_info?.company_notified && (
                    <Text
                      style={newStyles.claimSub}
                      allowFontScaling={false}
                      numberOfLines={1}
                    >
                      AT {String(tool.repair_info.company_notified).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={[newStyles.claimBadge, { borderColor: theme.colors.danger, backgroundColor: theme.colors.danger + "15" }]}>
                  <Text
                    style={[newStyles.claimBadgeText, { color: theme.colors.danger }]}
                    allowFontScaling={false}
                    numberOfLines={1}
                  >
                    {(tool.repair_info?.repair_status || "Repair pending").toUpperCase()}
                  </Text>
                </View>
              </View>
              {/* Inset inner card — plain themes only. In skinned themes the
                  rows + buttons render directly on the metal frame (no sub-card
                  / shadow-box behind them). */}
              {(() => {
                const claimBody = (
                  <>
                {/*
                  Only show "Notified" date when the user has explicitly
                  notified the dealer — i.e. the repair_status is anything
                  other than the default "Not Reported". Previously this
                  block fired any time `notified_at` was set, which was
                  auto-filled to today by the edit flow whenever the user
                  toggled "Needs Repair" — confusing because the item was
                  marked broken but no actual notification had been sent.
                */}
                {!!tool.repair_info?.notified_at &&
                  !!tool.repair_info?.repair_status &&
                  String(tool.repair_info.repair_status).toLowerCase() !== "not reported" && (
                  <View style={newStyles.claimRow}>
                    <Text style={newStyles.claimRowLabel} allowFontScaling={false}>Notified</Text>
                    <Text style={newStyles.claimRowValue} allowFontScaling={false}>{formatDateUS(tool.repair_info.notified_at)}</Text>
                  </View>
                )}
                {!!tool.repair_info?.expected_completion && (
                  <View style={newStyles.claimRow}>
                    <Text style={newStyles.claimRowLabel} allowFontScaling={false}>Expected back</Text>
                    <Text style={newStyles.claimRowValue} allowFontScaling={false}>{formatDateUS(tool.repair_info.expected_completion)}</Text>
                  </View>
                )}
                {!!tool.repair_info?.repair_cost && Number(tool.repair_info.repair_cost) > 0 && (
                  <View style={newStyles.claimRow}>
                    <Text style={newStyles.claimRowLabel} allowFontScaling={false}>Repair cost</Text>
                    <Text style={newStyles.claimRowValue} allowFontScaling={false}>${Number(tool.repair_info.repair_cost).toFixed(2)}</Text>
                  </View>
                )}
                {!!tool.repair_info?.notes && (
                  <View style={newStyles.claimNotes}>
                    <Text style={newStyles.claimRowLabel} allowFontScaling={false}>NOTES</Text>
                    <Text style={newStyles.claimNotesText} allowFontScaling={false}>{tool.repair_info.notes}</Text>
                  </View>
                )}
                {/* Quick-contact + edit/fix action buttons */}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[newStyles.claimActionBtn, { backgroundColor: theme.colors.accent, flex: 1 }]}
                    onPress={() => notifyDealer(tool, "email")}
                    testID="claim-email-dealer"
                    activeOpacity={0.85}
                  >
                    <ContactIconImage type="mail" size={16} />
                    <Text style={[newStyles.claimActionText, { color: "#000" }]}>EMAIL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[newStyles.claimActionBtn, { backgroundColor: theme.colors.accent, flex: 1 }]}
                    onPress={() => notifyDealer(tool, "sms")}
                    testID="claim-text-dealer"
                    activeOpacity={0.85}
                  >
                    <ContactIconImage type="text" size={16} />
                    <Text style={[newStyles.claimActionText, { color: "#000" }]}>TEXT</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <TouchableOpacity
                    style={[newStyles.claimActionBtn, newStyles.claimActionBtnOutline, { flex: 1 }]}
                    onPress={openRepair}
                    testID="claim-edit"
                    activeOpacity={0.85}
                  >
                    <Ionicons name="create-outline" size={11} color={theme.colors.danger} />
                    <Text style={[newStyles.claimActionText, { color: theme.colors.danger }]}>EDIT CLAIM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[newStyles.claimActionBtn, { backgroundColor: theme.colors.success, flex: 1 }]}
                    onPress={markRepaired}
                    testID="claim-mark-fixed"
                    activeOpacity={0.85}
                  >
                    <Ionicons name="checkmark-done" size={11} color="#000" />
                    <Text style={[newStyles.claimActionText, { color: "#000" }]}>MARK FIXED</Text>
                  </TouchableOpacity>
                </View>
                  </>
                );
                return isIndustrial ? (
                  claimBody
                ) : (
                  <View style={newStyles.claimCard}>{claimBody}</View>
                );
              })()}
            </CardShell>
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
                  {/* Quick-action TEXT + CALL buttons. Visible only when we
                      know the borrower's phone (lookup happens at checkout).
                      The TEXT button pre-fills the user's reminder template
                      (see composeBorrowSmsBody). These mirror the action
                      buttons that appear on the overdue notification when
                      the user taps it. */}
                  {(() => {
                    const phone = active.borrower_phone || "";
                    if (!phone) return null;
                    const tel = phone.replace(/[^0-9+]/g, "");
                    const smsBody = composeBorrowSmsBody(
                      tool.name || "tool",
                      active.borrower_name || "there",
                    );
                    return (
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                          marginTop: 10,
                        }}
                      >
                        <TouchableOpacity
                          testID="checkedout-call"
                          style={newStyles.qaBtn}
                          onPress={(e: any) => {
                            e?.stopPropagation?.();
                            Linking.openURL(`tel:${tel}`);
                          }}
                          activeOpacity={0.7}
                        >
                          <ContactIconImage type="call" size={18} />
                          <Text style={newStyles.qaBtnText}>CALL</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          testID="checkedout-text"
                          style={newStyles.qaBtn}
                          onPress={(e: any) => {
                            e?.stopPropagation?.();
                            const sep = Platform.OS === "ios" ? "&" : "?";
                            const url = `sms:${tel}${sep}body=${encodeURIComponent(smsBody)}`;
                            Linking.openURL(url);
                          }}
                          activeOpacity={0.7}
                        >
                          <ContactIconImage type="text" size={18} />
                          <Text style={newStyles.qaBtnText}>TEXT REMINDER</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })()}
                </View>
              </TouchableOpacity>
            );
          })()}

          {/* DESCRIPTION/NOTES + TAGS are now rendered inside the grouped
              details boxes below (Group 5 + Group 4 respectively). */}

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

            // Helper to keep Ionicons name typed inline
            type IconName = React.ComponentProps<typeof Ionicons>["name"];
            type Row =
              | { kind: "value"; label: string; icon?: IconName; value: string; onPress?: () => void }
              | { kind: "models"; label: string; icon?: IconName; values: string[] }
              | { kind: "expandable"; key: "gallery" | "documents" | "receipts" | "maintenance" | "warranty" | "consumable"; label: string; icon?: IconName; value: string }
              | { kind: "description"; icon?: IconName; value: string };

            // Helper renderer for a row label with optional leading icon.
            // Used by ALL row kinds (value/models/expandable/description)
            // so labels stay perfectly aligned across the description card.
            const renderLabel = (label: string, icon?: IconName) => (
              <View style={newStyles.detailsLabelWrap}>
                {icon ? (
                  <Ionicons
                    name={icon}
                    size={13}
                    color={theme.colors.accent}
                  />
                ) : null}
                <Text style={newStyles.detailsLabel}>{label}</Text>
              </View>
            );

            // ---- GROUPED ROWS (per user 2026-05-26) ------------------------
            // The Edit screen orders fields into 5 visual groups. The Detail
            // screen mirrors that exact same ordering so the read-only +
            // edit views feel coherent. Each group renders in its own
            // detailsBox card with a top margin to provide visible
            // section breaks. The Claims/History group is left at the
            // bottom (user explicitly asked to leave the claims section
            // where it currently sits).
            const groupPrimary: Row[] = [];
            const groupAttachments: Row[] = [];
            const groupServices: Row[] = [];
            const groupClassify: Row[] = [];
            const groupDescription: Row[] = [];
            const groupHistory: Row[] = [];

            // Group 1: NAME (page title), PRICE (status pill), LOCATION,
            // MODEL #s, SERIAL #s, DEALER, BRAND. NAME + PRICE are already
            // shown at the top of the screen so we don't repeat them here.
            groupPrimary.push({
              kind: "value",
              label: "LOCATION",
              icon: "location",
              value: tool.location_name || "No location · tap to assign",
              onPress: () => setShowLocationPicker(true),
            });
            groupPrimary.push({
              kind: "models",
              label: modelNums.length > 1 ? "MODEL NUMBERS" : "MODEL #",
              icon: "barcode",
              values: modelNums.length ? modelNums : ["—"],
            });
            groupPrimary.push({
              kind: "models",
              label: serialNums.length > 1 ? "SERIAL NUMBERS" : "SERIAL #",
              icon: "key",
              values: serialNums.length ? serialNums : ["—"],
            });
            groupPrimary.push({
              kind: "value",
              label: "DEALER",
              icon: "business",
              value: tool.dealer_name || "—",
              onPress: tool.dealer_id
                ? () => router.push(`/dealer/${tool.dealer_id}`)
                : undefined,
            });
            groupPrimary.push({
              kind: "value",
              label: "BRAND",
              icon: "ribbon",
              value: tool.brand ? String(tool.brand) : "—",
            });
            if (tool.bundle_id) {
              groupPrimary.push({
                kind: "value",
                label: "SET / BUNDLE",
                icon: "cube",
                value: "Part of a set · tap to view",
                onPress: () => router.push(`/bundle/${tool.bundle_id}`),
              });
            }

            // Group 2: PHOTOS, DOCUMENTS, RECEIPTS
            groupAttachments.push({
              kind: "expandable",
              key: "gallery",
              label: "PHOTOS",
              icon: "images",
              value: `${photos.length} photo${photos.length === 1 ? "" : "s"}`,
            });
            groupAttachments.push({
              kind: "expandable",
              key: "documents",
              label: "DOCUMENTS",
              icon: "document-text",
              value: `${Array.isArray(tool.documents) ? tool.documents.length : 0} document${(Array.isArray(tool.documents) ? tool.documents.length : 0) === 1 ? "" : "s"}`,
            });
            groupAttachments.push({
              kind: "expandable",
              key: "receipts",
              label: "RECEIPTS",
              icon: "receipt",
              value: `${Array.isArray(tool.receipts) ? tool.receipts.length : 0} receipt${(Array.isArray(tool.receipts) ? tool.receipts.length : 0) === 1 ? "" : "s"}`,
            });

            // Group 3: WARRANTY, MAINTENANCE, CONSUMABLE
            groupServices.push({
              kind: "expandable",
              key: "warranty",
              label: "WARRANTY",
              icon: "shield-checkmark",
              value: `${warrantyCount} record${warrantyCount === 1 ? "" : "s"}`,
            });
            groupServices.push({
              kind: "expandable",
              key: "maintenance",
              label: "MAINTENANCE",
              icon: "construct",
              value: `${maintenanceCount} record${maintenanceCount === 1 ? "" : "s"}`,
            });
            groupServices.push({
              kind: "expandable",
              key: "consumable",
              label: "CONSUMABLE",
              icon: "flask",
              value: tool.is_consumable ? "Yes" : "No",
            });

            // Group 4: CATEGORY, TAGS, PURCHASE DATE (+ MSRP if set)
            groupClassify.push({
              kind: "value",
              label: "CATEGORY",
              icon: "folder",
              value: tool.category_name ? String(tool.category_name) : "—",
            });
            const tagSummary = Array.isArray(tool.tag_names) && tool.tag_names.length
              ? tool.tag_names.join(", ")
              : "—";
            groupClassify.push({
              kind: "value",
              label: "TAGS",
              icon: "pricetags",
              value: tagSummary,
            });
            groupClassify.push({
              kind: "value",
              label: "PURCHASED",
              icon: "calendar",
              value: tool.purchase_date ? formatDateUS(tool.purchase_date) : "—",
            });
            if (tool.msrp_price && Number(tool.msrp_price) > 0) {
              groupClassify.push({
                kind: "value",
                label: "MSRP",
                icon: "cash",
                value: `$${Number(tool.msrp_price).toFixed(2)}`,
              });
            }

            // Group 5: DESCRIPTION / NOTES (long-form text, single row)
            if (tool.description && String(tool.description).trim()) {
              groupDescription.push({
                kind: "description",
                icon: "document-text-outline",
                value: String(tool.description),
              });
            }

            // History group — stays at the bottom of the page (CLAIMS
            // section is intentionally left in place per user request).
            const checkoutCount = Array.isArray(tool.checkout_history)
              ? tool.checkout_history.length
              : 0;
            groupHistory.push({
              kind: "value",
              label: "CHECKOUT HISTORY",
              icon: "swap-horizontal",
              value: `${checkoutCount} entr${checkoutCount === 1 ? "y" : "ies"}`,
              onPress: () => router.push(`/checkout-history/${tool.id}`),
            });
            groupHistory.push({
              kind: "value",
              label: "CLAIMS HISTORY",
              icon: "alert-circle",
              value: "View",
              onPress: () => router.push(`/claims-history/${tool.id}`),
            });

            const renderGroup = (rows: Row[], boxKey: string) => (
              <GroupCard key={boxKey} boxKey={boxKey}>
                {rows.map((r, i) => {
                  const isLast = i === rows.length - 1;
                  if (r.kind === "description") {
                    return (
                      <View
                        key={`desc-${i}`}
                        style={[newStyles.detailsRow, isLast && newStyles.detailsRowLast, { flexDirection: "column", alignItems: "stretch", paddingVertical: 12, gap: 6 }]}
                      >
                        {renderLabel("DESCRIPTION / NOTES", r.icon)}
                        <Text style={[newStyles.detailsValue, { textAlign: "left", fontSize: 11, fontWeight: "500", lineHeight: 16 }]}>
                          {r.value}
                        </Text>
                      </View>
                    );
                  }
                  if (r.kind === "models") {
                    return (
                      <View
                        key={`m-${i}`}
                        style={[newStyles.detailsRow, isLast && newStyles.detailsRowLast]}
                      >
                        {renderLabel(r.label, r.icon)}
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
                          {renderLabel(r.label, r.icon)}
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
                              <ShadowBoxSubCard style={newStyles.nestedCard}>
                                <View style={newStyles.attachHeader}>
                                  <Text style={newStyles.attachSectionLabel}>
                                    PHOTOS{photos.length > 0 ? ` (${photos.length})` : ""}
                                  </Text>
                                  <PillButton
                                    testID="add-photo-btn"
                                    label="ADD"
                                    icon="add-circle"
                                    variant="active"
                                    compact
                                    onPress={promptAddPhoto}
                                  />
                                </View>
                                {photos.length === 0 ? (
                                  <Text style={newStyles.attachEmpty}>
                                    No photos yet. Add product shots, condition photos,
                                    or reference images.
                                  </Text>
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
                                        <AppImage source={{ uri: p }} style={newStyles.galleryThumb} />
                                      </TouchableOpacity>
                                    ))}
                                  </ScrollView>
                                )}
                              </ShadowBoxSubCard>
                            )}
                            {r.key === "documents" && (
                              <ShadowBoxSubCard style={newStyles.nestedCard}>
                                <DocumentsSection tool={tool} onChange={load} />
                              </ShadowBoxSubCard>
                            )}
                            {r.key === "receipts" && (
                              <ShadowBoxSubCard style={newStyles.nestedCard}>
                                <ReceiptsSection
                                  receipts={tool.receipts}
                                  onAdd={promptAddReceipt}
                                />
                              </ShadowBoxSubCard>
                            )}
                            {r.key === "maintenance" && (
                              <ShadowBoxSubCard style={newStyles.nestedCard}>
                                <MaintenanceSection tool={tool} onChange={load} />
                              </ShadowBoxSubCard>
                            )}
                            {r.key === "warranty" && (
                              <WarrantySection tool={tool} />
                            )}
                            {r.key === "consumable" && (
                              <ShadowBoxSubCard style={newStyles.nestedCard}>
                                <View style={newStyles.attachHeader}>
                                  <Text style={newStyles.attachSectionLabel}>CONSUMABLE</Text>
                                  <View style={[newStyles.consumableBadge, tool.is_consumable ? newStyles.consumableBadgeYes : newStyles.consumableBadgeNo]}>
                                    <Text style={[newStyles.consumableBadgeText, tool.is_consumable ? { color: theme.colors.success } : { color: theme.colors.textMuted }]}>
                                      {tool.is_consumable ? "YES" : "NO"}
                                    </Text>
                                  </View>
                                </View>
                                {tool.is_consumable ? (
                                  <View style={{ paddingTop: 4, gap: 8 }}>
                                    {!!tool.consumable_info?.store_name && (
                                      <View style={newStyles.consRow}>
                                        <Text style={newStyles.consLabel}>STORE</Text>
                                        <Text style={newStyles.consValue} numberOfLines={1}>{tool.consumable_info.store_name}</Text>
                                      </View>
                                    )}
                                    {!!tool.consumable_info?.website && (
                                      <View style={newStyles.consRow}>
                                        <Text style={newStyles.consLabel}>SITE</Text>
                                        <Text style={newStyles.consValue} numberOfLines={1}>{tool.consumable_info.website}</Text>
                                      </View>
                                    )}
                                    {!!tool.consumable_info?.sku && (
                                      <View style={newStyles.consRow}>
                                        <Text style={newStyles.consLabel}>SKU</Text>
                                        <Text style={newStyles.consValue} numberOfLines={1}>{tool.consumable_info.sku}</Text>
                                      </View>
                                    )}
                                    {!!tool.consumable_info?.notes && (
                                      <Text style={[newStyles.consValue, { textAlign: "left", marginTop: 4 }]}>
                                        {tool.consumable_info.notes}
                                      </Text>
                                    )}
                                  </View>
                                ) : (
                                  <Text style={newStyles.attachEmpty}>
                                    Not marked as consumable. Toggle on the edit screen
                                    to track re-orderable items.
                                  </Text>
                                )}
                              </ShadowBoxSubCard>
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
                      {renderLabel(r.label, r.icon)}
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
              </GroupCard>
            );

            return (
              <>
                {renderGroup(groupPrimary, "primary")}
                {renderGroup(groupAttachments, "attachments")}
                {renderGroup(groupServices, "services")}
                {renderGroup(groupClassify, "classify")}
                {groupDescription.length > 0 && renderGroup(groupDescription, "description")}
                {renderGroup(groupHistory, "history")}
              </>
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
                <ActionTile
                  testID="action-checkin"
                  onPress={doCheckin}
                  icon="log-in-outline"
                  iconColor={theme.colors.accent}
                  label="CHECK IN"
                />
              ) : (
                <ActionTile
                  testID="action-checkout"
                  onPress={() => setShowCheckout(true)}
                  icon="log-out-outline"
                  iconColor={theme.colors.accent}
                  label="CHECK OUT"
                />
              )
            )}

            {/* MARK BROKEN / MARK FIXED (contextual) */}
            {!tool.is_sold && !tool.is_lost && (
              tool.needs_repair ? (
                <ActionTile
                  testID="action-fixed"
                  onPress={markRepaired}
                  icon="checkmark-done"
                  iconColor={theme.colors.success}
                  label="MARK FIXED"
                />
              ) : (
                <ActionTile
                  testID="action-broken"
                  onPress={openRepair}
                  icon="build-outline"
                  iconColor={theme.colors.danger}
                  label="MARK BROKEN"
                />
              )
            )}

            {/* EXPORT PDF */}
            <ActionTile
              testID="action-export"
              onPress={() => setShowExportPicker(true)}
              icon="document-text-outline"
              iconColor={theme.colors.accent}
              label="EXPORT"
            />

            {/* LIST FOR SALE / EDIT LISTING + MARK SOLD (contextual) */}
            {!tool.is_sold && !tool.is_lost && (
              tool.for_sale ? (
                <>
                  <ActionTile
                    testID="action-edit-listing"
                    onPress={() => openSaleModal()}
                    icon="pricetag"
                    iconColor={theme.colors.accent}
                    label="EDIT LISTING"
                  />
                  <ActionTile
                    testID="action-mark-sold"
                    onPress={() => setShowMarkSold(true)}
                    icon="checkmark-circle"
                    iconColor={theme.colors.success}
                    label="MARK SOLD"
                  />
                </>
              ) : (
                <ActionTile
                  testID="action-list-sale"
                  onPress={() => openSaleModal()}
                  icon="pricetag-outline"
                  iconColor={theme.colors.accent}
                  label="LIST FOR SALE"
                />
              )
            )}

            {/* DELETE — moved to top-right header icon. */}
          </View>

          {/* REPORT LOST OR STOLEN — moved below the action grid (under the
              other buttons) per user request, all themes. */}
          <View style={{ marginTop: 16, width: "100%", maxWidth: 420, alignSelf: "center" }}>
            <ReportLostButton tool={tool} onChange={load} />
          </View>

          {/* TAGS row was moved into the grouped details box (Group 4)
              above per the user's 2026-05-26 layout reorder. */}

        </View>
      </ScrollView>

            <Modal visible={showCheckout} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBg}
        >
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
        </KeyboardAvoidingView>
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

              {/* Out-of-pocket repair / replacement cost. Defaults to $0.
                  Flows into the Repair Cost Report + Year End Report totals. */}
              <Text style={styles.repairLabel}>REPAIR / REPLACEMENT COST ($)</Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 9, marginBottom: 4 }}>
                Leave at 0 if covered by warranty. Otherwise enter what you paid.
              </Text>
              <TextInput
                testID="repmod-cost"
                placeholder="0.00"
                placeholderTextColor={theme.colors.textMuted}
                value={repairForm.repair_cost}
                onChangeText={(v) => {
                  const clean = v.replace(/[^0-9.]/g, "").replace(/(\..*?)\..*/g, "$1");
                  setRepairForm({ ...repairForm, repair_cost: clean });
                }}
                style={styles.input}
                keyboardType="decimal-pad"
              />

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
                {"Only shown in this claim — not added to the item's main photos."}
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
              {"Pick which fields appear on the poster. The flyer is letter-size with a big \"FOR SALE\" banner, your asking price, and the photo & specs you choose."}
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
                  <AppSwitch
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
            {/* Inline location list — pick right here, no second popup. */}
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                testID="loc-inline-none"
                style={[styles.locInlineRow, !tool.location_id && styles.locInlineRowActive]}
                onPress={async () => {
                  try {
                    await api.updateTool(tool.id, { location_id: null });
                    setShowLocationPicker(false);
                    load();
                  } catch (e: any) {
                    Alert.alert("Could not move item", String(e?.message || e));
                  }
                }}
              >
                <Ionicons name="ban" size={16} color={!tool.location_id ? theme.colors.accent : theme.colors.textMuted} />
                <Text style={[styles.locInlineText, !tool.location_id && styles.locInlineTextActive]}>
                  No location (unassigned)
                </Text>
                {!tool.location_id && <Ionicons name="checkmark" size={18} color={theme.colors.accent} />}
              </TouchableOpacity>

              {flattenLocationTree(buildLocationTree(allLocations)).map((n) => {
                const active = n.id === tool.location_id;
                return (
                  <TouchableOpacity
                    key={n.id}
                    testID={`loc-inline-${n.id}`}
                    style={[
                      styles.locInlineRow,
                      active && styles.locInlineRowActive,
                      { paddingLeft: 12 + (n.depth || 0) * 18 },
                    ]}
                    onPress={async () => {
                      if (active) {
                        setShowLocationPicker(false);
                        return;
                      }
                      try {
                        await api.updateTool(tool.id, { location_id: n.id });
                        setShowLocationPicker(false);
                        load();
                      } catch (e: any) {
                        Alert.alert("Could not move item", String(e?.message || e));
                      }
                    }}
                  >
                    <Ionicons name="location" size={15} color={active ? theme.colors.accent : theme.colors.textMuted} />
                    <Text style={[styles.locInlineText, active && styles.locInlineTextActive]} numberOfLines={1}>
                      {n.name}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={theme.colors.accent} />}
                  </TouchableOpacity>
                );
              })}

              {allLocations.length === 0 && (
                <Text style={[styles.helper, { marginTop: 8 }]}>
                  No locations yet. Add locations from Vault → Locations.
                </Text>
              )}
            </ScrollView>
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

  if (isIndustrial) {
    return (
      <ImageBackground source={SKIN.bg} style={styles.skinBg} resizeMode="cover" fadeDuration={0}>
        <View style={styles.skinVeil} pointerEvents="none" />
        {__body}
      </ImageBackground>
    );
  }
  return __body;
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
  first,
}: {
  label: string;
  value: string;
  sub?: string;
  onPress?: () => void;
  valueColor?: string;
  first?: boolean;
}) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      style={[newStyles.pillRowFlat, !first && newStyles.pillRowDivider]}
      {...(onPress ? { onPress, activeOpacity: 0.7 } : {})}
    >
      <View style={{ flex: 1 }}>
        <Text style={newStyles.pillRowLabel}>{label}</Text>
        {!!sub && <Text style={newStyles.pillRowSub}>{sub}</Text>}
      </View>
      <Text
        style={[
          newStyles.pillRowValueText,
          valueColor ? { color: valueColor } : null,
        ]}
        numberOfLines={1}
      >
        {value || "—"}
      </Text>
      {!!onPress && (
        <Ionicons
          name="chevron-forward"
          size={14}
          color={theme.colors.textMuted}
          style={{ marginLeft: 6 }}
        />
      )}
    </Wrapper>
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

