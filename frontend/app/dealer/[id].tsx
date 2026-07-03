import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { AppImage } from "../../src/components/AppImage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useAppResume } from "../../src/appLifecycle";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { usePrefs } from "../../src/prefs";
import { confirm } from "../../src/confirm";
import { formatDateUS } from "../../src/dateUtil";
import { formatPhone, formatPhonesInText, openPhone, openSms, openEmail } from "../../src/contactLinks";
import { BalanceSection } from "../../src/sections/BalanceSection";
import { ROUTE_FREQUENCIES, DAY_NAMES, routeLabel, nextRouteText } from "../../src/route";
import { DateField } from "../../src/DateField";
import { useAuth } from "../../src/AuthContext";
import { themedStyles, useSkin } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";
import { ShadowBox, ShadowBoxSubCard } from "../../src/components/ShadowBox";
import { SKIN, CAP } from "../../src/tbv/skins";
import { useIsSteel, useSteelPanelFrame } from "../../src/tbv/steel";
import { TbvFrame } from "../../src/tbv/components/TbvFrame";
import TbvListPanel from "../../src/tbv/components/TbvListPanel";
import { EmailLink } from "../../src/components/EmailLink";
import { shareOrSaveAgent } from "../../src/utils/agentShare";
import { ContactIconButton, ContactIconImage } from "../../src/components/ContactIcons";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { KebabMenu } from "../../src/components/KebabMenu";
import { PillButton } from "../../src/components/PillButton";
import { DealerLogo } from "../../src/components/DealerLogo";
import { STOCK_LOGO_OPTIONS, isDefaultLogo, DEALER_LOGO_SLOT } from "../../src/dealerLogos";

import {
  isDeviceContactsAvailable,
  loadAllDeviceContactsAndroid,
  pickContactNativeIOS,
  PickedContact,
} from "../../src/deviceContacts";

// Single skinned panel that holds the active tab's content. Defined at module
// scope (NOT inside the screen component) so its identity is stable across
// renders — otherwise the steel panel image remounts on every tab tap and the
// screen visibly flickers/reloads. Only the children change between tabs.
function DealerContentPanel({
  isIndustrial,
  winSrc,
  winCap,
  steelScale,
  plainStyle,
  children,
}: {
  isIndustrial: boolean;
  winSrc: any;
  winCap: any;
  steelScale: any;
  plainStyle: any;
  children: React.ReactNode;
}) {
  return isIndustrial ? (
    <TbvListPanel
      source={winSrc}
      capInsets={winCap}
      frameScale={steelScale}
      padX={16}
      padTop={16}
      padBottom={12}
      style={{ flex: 1 }}
    >
      {children}
    </TbvListPanel>
  ) : (
    <View style={plainStyle}>{children}</View>
  );
}

export default function DealerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const isSteel = useIsSteel();
  const steelPanel = useSteelPanelFrame();
  const plateSrc = isSteel ? steelPanel.source : SKIN.plate;
  const plateCap = isSteel ? steelPanel.capInsets : CAP.plate;
  const steelScale = isSteel ? steelPanel.frameScale : undefined;
  const winSrc = isSteel ? steelPanel.source : SKIN.window;
  const winCap = isSteel ? steelPanel.capInsets : CAP.window;
  const [dealer, setDealer] = useState<any>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [activeTab, setActiveTab] = useState<"company" | "agents" | "accounts" | "wishlist">("company");
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [wishForm, setWishForm] = useState<any>(null);
  const [savingWish, setSavingWish] = useState(false);
  const [agentForm, setAgentForm] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [routeEditOpen, setRouteEditOpen] = useState(false);
  const [routeForm, setRouteForm] = useState<any>({});

  // Device contacts picker for agents
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<PickedContact[]>([]);
  const [pickerFilter, setPickerFilter] = useState("");
  // Tracks which row of the new consolidated details box is currently
  // expanded. Values: "accounts" | `agent:<id>` | null.
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuAgent, setMenuAgent] = useState<any>(null);
  const canImportContacts = isDeviceContactsAvailable();

  const filteredDeviceContacts = useMemo(() => {
    const q = pickerFilter.trim().toLowerCase();
    if (!q) return deviceContacts;
    return deviceContacts.filter((c) =>
      (c.name + " " + (c.phone || "") + " " + (c.email || ""))
        .toLowerCase()
        .includes(q),
    );
  }, [deviceContacts, pickerFilter]);

  const openContactPicker = async () => {
    if (Platform.OS === "ios") {
      // iOS — open the native iOS contact picker sheet (works in Expo Go).
      const c = await pickContactNativeIOS();
      if (c) {
        setAgentForm({
          ...(agentForm || {}),
          name: c.name,
          phone: c.phone || agentForm?.phone || "",
          email: c.email || agentForm?.email || "",
        });
      }
      return;
    }
    // Android — use the in-app contact picker modal.
    setShowContactPicker(true);
    if (deviceContacts.length > 0) return;
    setPickerLoading(true);
    try {
      const list = await loadAllDeviceContactsAndroid();
      setDeviceContacts(list);
    } finally {
      setPickerLoading(false);
    }
  };

  const pickContactForAgent = (c: PickedContact) => {
    setAgentForm({
      ...(agentForm || {}),
      name: c.name,
      phone: c.phone || agentForm?.phone || "",
      email: c.email || agentForm?.email || "",
    });
    setShowContactPicker(false);
    setPickerFilter("");
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [d, t, w] = await Promise.all([
        api.getDealer(id),
        api.listTools({ dealer_id: id }),
        api.listWishlist({ dealer_id: id }),
      ]);
      setDealer(d);
      setTools(t);
      setWishlist(w || []);
    } catch {
      router.back();
    }
  }, [id, router]);

  const saveWish = async () => {
    const name = (wishForm?.name || "").trim();
    if (!name) {
      Alert.alert("Name required", "Please enter a name for the wishlist item.");
      return;
    }
    setSavingWish(true);
    try {
      await api.createWishlist({
        name,
        model_number: (wishForm.model_number || "").trim(),
        price: wishForm.price ? parseFloat(wishForm.price) || null : null,
        url: (wishForm.url || "").trim(),
        priority: wishForm.priority || "normal",
        notes: (wishForm.notes || "").trim(),
        dealer_id: id,
        dealer_name: dealer?.name || "",
        photos: wishForm.photos || [],
      });
      setWishForm(null);
      await load();
    } catch {
      Alert.alert("Error", "Could not save the wishlist item. Please try again.");
    } finally {
      setSavingWish(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


  if (!dealer) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: theme.colors.textPrimary, padding: 20 }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const cur = (dealer.agents || []).find((a: any) => a.id === dealer.current_agent_id);
  const allAgents = (dealer.agents || []).slice().sort((a: any, b: any) => {
    // Current agent always pinned to the top; everyone else alphabetical by first name.
    if (a.id === dealer.current_agent_id) return -1;
    if (b.id === dealer.current_agent_id) return 1;
    const fa = String(a.name || "").trim().split(/\s+/)[0].toLowerCase();
    const fb = String(b.name || "").trim().split(/\s+/)[0].toLowerCase();
    return fa.localeCompare(fb);
  });
  const total = tools.reduce((s, t) => {
    const cost = Number(t.cost) || 0;
    const qty = Math.max(1, Number(t.quantity) || 1);
    return s + cost * qty;
  }, 0);
  const cats = new Set(tools.map((t) => t.category_name).filter(Boolean));
  const tags = new Set(tools.flatMap((t) => t.tag_names || []));

  const pickDealerLogo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          Alert.alert(
            "Photo access needed",
            "Allow photo access in Settings to upload a dealer logo.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          Alert.alert("Photo access needed", "Photo access is required to upload a logo.");
        }
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const out = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: 256, height: 256 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.PNG, base64: true },
      );
      if (out.base64) {
        setEditForm((f: any) => ({ ...f, logo: `data:image/png;base64,${out.base64}` }));
      }
    } catch (e: any) {
      Alert.alert("Could not load image", String(e?.message || e));
    }
  };

  // Photo picker for the dealer wishlist add form. Stored as a data: URI so it
  // matches the main Wishlist / Tool photo format.
  const pickWishPhotoFrom = async (camera: boolean) => {
    try {
      const perm = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          Alert.alert(
            "Photo access needed",
            "Allow photo access in Settings to add a photo.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          Alert.alert("Photo access needed", "Photo access is required to add a photo.");
        }
        return;
      }
      const opts: any = { quality: 0.6, allowsEditing: false };
      const res = camera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync({ ...opts, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const out = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: 800 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (out.base64) {
        setWishForm((f: any) => ({ ...f, photos: [`data:image/jpeg;base64,${out.base64}`] }));
      }
    } catch (e: any) {
      Alert.alert("Could not load image", String(e?.message || e));
    }
  };

  const chooseWishPhoto = () => {
    Alert.alert(
      "Add a photo",
      "Where do you want the photo from?",
      [
        { text: "Take Photo", onPress: () => pickWishPhotoFrom(true) },
        { text: "Choose from Library", onPress: () => pickWishPhotoFrom(false) },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  };
  const saveDealer = async () => {
    setSavingEdit(true);
    try {
      await api.updateDealer(id!, editForm);
      setEditing(false);
      setEditForm({});
      load();
    } finally {
      setSavingEdit(false);
    }
  };

  // Quick route editor — tapping the ROUTE readout in the hero opens this
  // without going through the full Edit Dealer form.
  const openRouteEditor = () => {
    setRouteForm({
      route_frequency: dealer.route_frequency || "N/A",
      route_day_of_week: dealer.route_day_of_week || "",
      route_anchor_date: dealer.route_anchor_date || "",
    });
    setRouteEditOpen(true);
  };
  const saveRoute = async () => {
    setSavingEdit(true);
    try {
      await api.updateDealer(id!, routeForm);
      setRouteEditOpen(false);
      load();
    } finally {
      setSavingEdit(false);
    }
  };

  const addAgent = async () => {
    if (!agentForm?.name?.trim()) return;
    if (agentForm.id) {
      // Editing existing
      const { id: agentId, ...rest } = agentForm;
      await api.updateAgent(id!, agentId, rest);
    } else {
      await api.addAgent(id!, agentForm);
    }
    setAgentForm(null);
    load();
  };

  const atAgentLimit = false;

  // 3-dots menu helpers (Edit / Add agent / Delete live in the menu).
  const openEditDealer = () => {
    setEditForm({
      name: dealer.name,
      logo: dealer.logo || "",
      phone: dealer.phone || "",
      website: dealer.website || "",
      address: dealer.address || "",
      notes: dealer.notes || "",
      warranty_contact: dealer.warranty_contact || "",
      tech_support_contact: dealer.tech_support_contact || "",
      customer_support_contact: dealer.customer_support_contact || "",
      route_frequency: dealer.route_frequency || "N/A",
      route_day_of_week: dealer.route_day_of_week || "",
      route_anchor_date: dealer.route_anchor_date || "",
    });
    setEditing(true);
  };
  const openAddAgent = () =>
    setAgentForm({ name: "", phone: "", email: "", location: "", notes: "" });

  const setCurrent = async (agentId: string) => {
    const ok = await confirm("Change current agent?", "Past agents are kept in history.", "Set as current");
    if (!ok) return;
    await api.setCurrentAgent(id!, agentId);
    load();
  };

  const removeAgent = async (agentId: string, name: string) => {
    const ok = await confirm(`Remove ${name}?`, "This removes the agent from this dealer.", "Remove", true);
    if (!ok) return;
    await api.removeAgent(id!, agentId);
    load();
  };

  const removeDealer = async () => {
    const ok = await confirm("Delete dealer?", "Tools keep their dealer name as text.", "Delete", true);
    if (!ok) return;
    await api.deleteDealer(id!);
    router.back();
  };

  const callOrEmail = (val: string) => {
    if (!val) return;
    if (val.includes("@")) Linking.openURL(`mailto:${val}`);
    else if (val.startsWith("http")) Linking.openURL(val);
    else Linking.openURL(`tel:${val.replace(/[^0-9+]/g, "")}`);
  };

  // Industrial themes wrap the panel cards in a metal TbvFrame; plain
  // Light/Dark keep the flat ShadowBox. `thin` uses the slim plate frame
  // (for single-row banners); otherwise the taller window frame. Padding is
  // sized to clear the metal rails on iOS (window rails ~32-38pt).
  const CardShell = ({
    children,
    testID,
    plainStyle,
  }: {
    children: React.ReactNode;
    testID?: string;
    plainStyle?: any;
    thin?: boolean;
  }) => (
    // The dealer detail content now lives inside ONE shared skinned panel
    // (ContentPanel below), so per-tab shells render as plain containers — no
    // nested steel frames.
    <View style={plainStyle} testID={testID}>
      {children}
    </View>
  );

  // Expanded agent business-card body. In a metal skin the floating ShadowBox
  // looks wrong sitting inside the frame, so render a flat plate (no shadow);
  // plain Light/Dark themes keep the floating sub-card.
  const AgentSubShell = ({ children }: { children: React.ReactNode }) =>
    isIndustrial ? (
      <View style={[styles.agentCard, styles.agentCardSkin]}>{children}</View>
    ) : (
      <ShadowBoxSubCard style={styles.agentCard}>{children}</ShadowBoxSubCard>
    );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title={dealer.name}
        subtitle="Dealer Details"
        onBack={() => router.back()}
        rightSlot={
          <TouchableOpacity
            testID="dealer-menu-btn"
            onPress={() => setShowMenu(true)}
            hitSlop={10}
            style={styles.menuDotsBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-vertical" size={22} color={theme.colors.accent} />
          </TouchableOpacity>
        }
      />

        <View style={styles.heroRow}>
          <DealerLogo logo={dealer.logo} size={DEALER_LOGO_SLOT.hero} />
          <View style={styles.heroRight}>
            <TouchableOpacity
              activeOpacity={0.7}
              testID="dealer-purchased"
              onPress={() => router.push(`/dealer/${id}/tools?name=${encodeURIComponent(dealer.name)}`)}
            >
              <Text style={styles.heroLabel}>TOTAL PURCHASED</Text>
              <Text style={styles.heroValue} numberOfLines={1}>
                ${total.toFixed(2)} · {tools.length} item{tools.length === 1 ? "" : "s"}
              </Text>
            </TouchableOpacity>
            <View style={styles.heroSep} />
            <TouchableOpacity activeOpacity={0.7} testID="dealer-route-edit" onPress={openRouteEditor}>
              <View style={styles.heroRouteLabelRow}>
                <Text style={styles.heroLabel}>ROUTE · {routeLabel(dealer)}</Text>
                <Ionicons name="create-outline" size={12} color={theme.colors.accent} style={{ marginLeft: 5 }} />
              </View>
              {!!nextRouteText(dealer) ? (
                <Text style={styles.heroNext} numberOfLines={1}>Next: {nextRouteText(dealer)}</Text>
              ) : (
                <Text style={styles.heroNextEmpty} numberOfLines={1}>Tap to set route</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* TAB BAR */}
        <View style={styles.tabBar}>
          {(["company", "agents", "accounts", "wishlist"] as const).map((k) => (
            <TouchableOpacity
              key={k}
              testID={`dealer-tab-${k}`}
              style={[styles.tab, activeTab === k && styles.tabOn]}
              onPress={() => setActiveTab(k)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === k && styles.tabTextOn]} numberOfLines={1}>
                {k === "company"
                  ? "COMPANY"
                  : k === "agents"
                  ? `AGENTS (${allAgents.length})`
                  : k === "accounts"
                  ? "ACCOUNTS"
                  : `WISHLIST (${wishlist.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* CONTENT PANEL — fixed height, content scrolls inside; same panel
            across all 3 tabs, only the inner content changes. */}
        <View style={styles.contentPanelOuter}>
        <DealerContentPanel
          isIndustrial={isIndustrial}
          winSrc={winSrc}
          winCap={winCap}
          steelScale={steelScale}
          plainStyle={styles.contentPanelPlain}
        >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {activeTab === "company" && (
        <View>
        {/* COMPANY DETAILS */}
        <CardShell plainStyle={styles.companyCard}>
          {!!dealer.phone && (
            <View style={styles.dealerContactPhoneRow}>
              <Text style={styles.dealerContactPhoneText} numberOfLines={1}>
                {formatPhone(dealer.phone)}
              </Text>
              <ContactIconButton
                type="call"
                size={36}
                testID="dealer-call-btn"
                onPress={() => openPhone(dealer.phone)}
              />
              <ContactIconButton
                type="text"
                size={36}
                testID="dealer-text-btn"
                onPress={() => openSms(dealer.phone)}
              />
            </View>
          )}
          <ContactRow icon="globe" label={dealer.website} onPress={() => callOrEmail(dealer.website)} />
          <CopyableRow
            icon="location"
            label={dealer.address}
            onCopy={async () => {
              if (!dealer.address) return;
              await Clipboard.setStringAsync(dealer.address);
              Alert.alert("Copied", "Address copied to clipboard.");
            }}
          />

          {/* Department contact channels */}
          <DepartmentRow
            icon="shield-checkmark"
            label="Warranty Dept"
            value={dealer.warranty_contact}
            onPress={() => callOrEmail(dealer.warranty_contact)}
          />
          <DepartmentRow
            icon="construct"
            label="Tech Support"
            value={dealer.tech_support_contact}
            onPress={() => callOrEmail(dealer.tech_support_contact)}
          />
          <DepartmentRow
            icon="headset"
            label="Customer Support"
            value={dealer.customer_support_contact}
            onPress={() => callOrEmail(dealer.customer_support_contact)}
          />

          {!!dealer.notes && (
            <View style={[styles.contactRow, { alignItems: "flex-start", borderBottomWidth: 0 }]}>
              <Ionicons name="document-text-outline" size={18} color={theme.colors.accent} />
              <Text style={[styles.contactText, { flex: 1 }]}>{dealer.notes}</Text>
            </View>
          )}
        </CardShell>

        {/* AGENTS — column-labelled list. Current agent pinned to the top
            (★ + orange); everyone else alphabetical by first name. Each agent
            is an expandable row that opens a sub-card business card. */}
        </View>
        )}

        {activeTab === "agents" && (
        <CardShell plainStyle={styles.detailsBox} testID="dealer-agents-box">
          <View style={styles.agentColHeader}>
            <Text style={styles.agentColName}>NAME</Text>
            <Text style={styles.agentColLoc}>ROUTE LOCATION</Text>
          </View>
            {allAgents.length === 0 && (
              <View style={[styles.detailsRow, styles.detailsRowLast]}>
                <Text style={[styles.detailsValue, { color: theme.colors.textMuted, textAlign: "left", flex: 1, fontWeight: "500" }]}>
                  No agents yet — tap ADD to create one.
                </Text>
              </View>
            )}

            {/* AGENT rows — each is expandable */}
            {allAgents.map((a: any, idx: number) => {
              const isCurrent = a.id === dealer.current_agent_id;
              const isOpen = expandedRow === `agent:${a.id}`;
              const isLast = idx === allAgents.length - 1;
              return (
                <View key={a.id}>
                  {idx === 1 && !!dealer.current_agent_id && (
                    <View style={styles.agentSeparator}>
                      <View style={styles.agentSeparatorLine} />
                      <Text style={styles.agentSeparatorText}>OTHER AGENTS</Text>
                      <View style={styles.agentSeparatorLine} />
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.detailsRow, isLast && !isOpen && styles.detailsRowLast]}
                    activeOpacity={0.6}
                    testID={`agent-row-${a.id}`}
                    onPress={() => setExpandedRow(isOpen ? null : `agent:${a.id}`)}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        flexShrink: 1,
                        // Indent agent rows so they read as children of the
                        // bold-white "AGENTS" header above.
                        paddingLeft: 14,
                      }}
                    >
                      {isCurrent && (
                        <Ionicons
                          name="star"
                          size={14}
                          color={theme.colors.accent}
                        />
                      )}
                      <Text
                        style={[
                          styles.agentRowName,
                          isCurrent
                            ? { color: theme.colors.accent, fontWeight: "900" }
                            : { color: theme.colors.textPrimary, fontWeight: "500" },
                        ]}
                        numberOfLines={1}
                      >
                        {a.name}
                      </Text>
                    </View>
                    <View style={styles.detailsValueWrap}>
                      {!!a.location && (
                        <Text
                          style={[
                            styles.detailsValue,
                            isCurrent && { color: theme.colors.accent, fontWeight: "800" },
                          ]}
                          numberOfLines={1}
                        >
                          {a.location}
                        </Text>
                      )}
                      <Ionicons
                        name={isOpen ? "chevron-down" : "chevron-forward"}
                        size={14}
                        color={theme.colors.textMuted}
                      />
                    </View>
                  </TouchableOpacity>
                  {isOpen && (
                    <AgentSubShell>
                      {/* Business-card header — agent name + 3-dots menu
                          (call / text / email / edit / share / delete). */}
                      <View style={styles.bizNameRow}>
                        <Text style={[styles.bizName, { flex: 1 }]} numberOfLines={1}>{a.name}</Text>
                        <TouchableOpacity
                          testID={`agent-menu-${a.id}`}
                          onPress={() => setMenuAgent(a)}
                          hitSlop={8}
                          style={styles.menuDotsBtn}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="ellipsis-vertical" size={20} color={theme.colors.accent} />
                        </TouchableOpacity>
                      </View>
                      {isCurrent && <Text style={styles.bizBadge}>CURRENT AGENT</Text>}

                      {/* Phone — plain text (call/text actions live in the footer) */}
                      {!!a.phone && (
                        <View style={styles.bizRow}>
                          <Ionicons name="call" size={14} color={theme.colors.textMuted} style={styles.bizRowIcon} />
                          <Text style={styles.bizValue} numberOfLines={1}>{formatPhone(a.phone)}</Text>
                        </View>
                      )}

                      {/* Email — 3D mail icon + blue mailto link */}
                      {!!a.email && (
                        <View style={styles.bizRow}>
                          <ContactIconImage type="mail" size={18} style={styles.bizRowIcon} />
                          <EmailLink
                            email={a.email}
                            style={styles.bizValue}
                            numberOfLines={1}
                            testID={`agent-email-${a.id}`}
                          />
                        </View>
                      )}

                      {/* Address / location */}
                      {!!a.location && (
                        <View style={styles.bizRow}>
                          <Ionicons name="location" size={14} color={theme.colors.textMuted} style={styles.bizRowIcon} />
                          <Text style={styles.bizValue} numberOfLines={2}>{a.location}</Text>
                        </View>
                      )}

                      {/* Notes */}
                      {!!a.notes && (
                        <View style={styles.bizRow}>
                          <Ionicons name="document-text-outline" size={14} color={theme.colors.textMuted} style={styles.bizRowIcon} />
                          <Text style={[styles.bizValue, { color: theme.colors.textMuted, fontWeight: "500" }]}>{a.notes}</Text>
                        </View>
                      )}
                      {a.ended_at && !isCurrent && (
                        <Text style={styles.agentMeta}>Ended: {formatDateUS(a.ended_at)}</Text>
                      )}

                      {!isCurrent && (
                        <View style={styles.agentFooter}>
                          <TouchableOpacity
                            testID={`set-current-${a.id}`}
                            style={styles.agentActionBtn}
                            onPress={() => setCurrent(a.id)}
                          >
                            <Ionicons name="star-outline" size={16} color={theme.colors.accent} />
                            <Text style={styles.agentActionText}>SET CURRENT</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </AgentSubShell>
                  )}
                </View>
              );
            })}
        </CardShell>
        )}

        {activeTab === "accounts" && (
        <CardShell plainStyle={styles.detailsBox} testID="dealer-accounts-box">
          <BalanceSection dealer={dealer} onChange={load} flat />
        </CardShell>
        )}

        {activeTab === "wishlist" && (
        <CardShell plainStyle={styles.detailsBox} testID="dealer-wishlist-box">
          <TouchableOpacity
            testID="dealer-wish-add"
            style={styles.wishAddBtn}
            onPress={() => setWishForm({ name: "", model_number: "", price: "", url: "", priority: "normal", notes: "" })}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle" size={16} color={theme.colors.accent} />
            <Text style={styles.wishAddText}>ADD WISHLIST ITEM</Text>
          </TouchableOpacity>

          {wishlist.length === 0 ? (
            <View style={styles.wishEmpty}>
              <Ionicons name="heart-outline" size={40} color={theme.colors.textMuted} />
              <Text style={styles.wishEmptyText}>
                No wishlist items for {dealer.name} yet. Tap “Add Wishlist Item” to save one — it’ll appear here and in your main Wishlist.
              </Text>
            </View>
          ) : (
            wishlist.map((w, idx) => (
              <TouchableOpacity
                key={w.id}
                testID={`dealer-wish-${w.id}`}
                activeOpacity={0.7}
                onPress={() => router.push("/wishlist")}
                style={[styles.wishRow, idx === wishlist.length - 1 && styles.wishRowLast]}
              >
                {!!(w.photos && w.photos[0]) && (
                  <AppImage source={{ uri: w.photos[0] }} style={styles.wishThumb} resizeMode="cover" />
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.wishRowTop}>
                    <Text style={styles.wishName} numberOfLines={2}>{w.name}</Text>
                    {!!w.price && <Text style={styles.wishPrice}>${Number(w.price).toFixed(2)}</Text>}
                  </View>
                  {!!w.model_number && (
                    <Text style={styles.wishMeta} numberOfLines={1}>Model: {w.model_number}</Text>
                  )}
                  <View style={styles.wishTagRow}>
                    <Text style={styles.wishPriority}>{String(w.priority || "normal").toUpperCase()}</Text>
                    {w.purchased && <Text style={styles.wishPurchased}>PURCHASED</Text>}
                  </View>
                  {!!w.notes && <Text style={styles.wishNotes} numberOfLines={2}>{w.notes}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </CardShell>
        )}
        </ScrollView>
        </DealerContentPanel>
        </View>

      {/* Edit dealer modal */}
      <Modal visible={editing} transparent animationType="slide">
        <View style={styles.modalBg}>
          <ScrollView style={styles.modalCard} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>EDIT DEALER</Text>
              <TouchableOpacity testID="edit-dealer-close" hitSlop={10} onPress={() => setEditing(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Dealer logo picker (#17) */}
            <Text style={styles.editFieldLabel}>DEALER LOGO</Text>
            <View style={styles.logoPickerRow}>
              <DealerLogo logo={editForm.logo} size={DEALER_LOGO_SLOT.picker} />
              <View style={{ flex: 1, gap: 8 }}>
                <TouchableOpacity
                  testID="logo-upload-btn"
                  style={styles.logoActionBtn}
                  onPress={pickDealerLogo}
                >
                  <Ionicons name="cloud-upload-outline" size={15} color={theme.colors.accent} />
                  <Text style={styles.logoActionText}>UPLOAD LOGO</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="logo-default-btn"
                  style={styles.logoActionBtn}
                  onPress={() => setEditForm((f: any) => ({ ...f, logo: "default" }))}
                  disabled={isDefaultLogo(editForm.logo)}
                >
                  <Ionicons name="refresh-outline" size={15} color={theme.colors.textSecondary} />
                  <Text style={[styles.logoActionText, { color: theme.colors.textSecondary }]}>
                    USE DEFAULT (APP ICON)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.logoStockHint}>OR PICK A STOCK LOGO</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingVertical: 6, paddingBottom: 12 }}
            >
              {STOCK_LOGO_OPTIONS.map((opt) => {
                const sel = editForm.logo === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    testID={`logo-stock-${opt.key}`}
                    onPress={() => setEditForm((f: any) => ({ ...f, logo: opt.value }))}
                    style={[styles.stockLogoChip, sel && styles.stockLogoChipOn]}
                  >
                    <Image source={opt.source} style={{ width: 44, height: 44 }} resizeMode="contain" />
                    <Text style={styles.stockLogoLabel} numberOfLines={1}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {([
              { k: "name", placeholder: "Dealer name", multiline: false },
              { k: "phone", placeholder: "Main phone", multiline: false },
              { k: "website", placeholder: "Website", multiline: false },
              { k: "address", placeholder: "Address", multiline: false },
              { k: "warranty_contact", placeholder: "Warranty Dept (phone, email, or URL)", multiline: false },
              { k: "tech_support_contact", placeholder: "Tech Support Dept (phone, email, or URL)", multiline: false },
              { k: "customer_support_contact", placeholder: "Customer Support (phone, email, or URL)", multiline: false },
              { k: "notes", placeholder: "Notes", multiline: true },
            ] as const).map((f) => (
              <TextInput
                key={f.k}
                testID={`edit-dealer-${f.k}`}
                placeholder={f.placeholder}
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, f.multiline && { height: 80 }]}
                value={editForm[f.k] || ""}
                onChangeText={(v) => setEditForm({ ...editForm, [f.k]: v })}
                multiline={f.multiline}
                keyboardType={f.k === "phone" ? "phone-pad" : "default"}
              />
            ))}

            <Text style={styles.editFieldLabel}>ROUTE FREQUENCY</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: "row", gap: 8, paddingVertical: 4, marginBottom: 8 }}
            >
              {ROUTE_FREQUENCIES.map((f) => {
                const sel = (editForm.route_frequency || "N/A") === f;
                return (
                  <TouchableOpacity
                    key={f}
                    testID={`edit-route-freq-${f}`}
                    onPress={() =>
                      setEditForm({
                        ...editForm,
                        route_frequency: f,
                        ...(f === "N/A"
                          ? { route_day_of_week: "", route_anchor_date: "" }
                          : {}),
                        ...(f === "Monthly" ? { route_day_of_week: "" } : {}),
                      })
                    }
                    style={[styles.editChip, sel && styles.editChipOn]}
                  >
                    <Text style={[styles.editChipText, sel && styles.editChipTextOn]}>{f.toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {(editForm.route_frequency === "Weekly" ||
              editForm.route_frequency === "Bi-weekly") && (
              <>
                <Text style={styles.editFieldLabel}>DAY OF WEEK</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ flexDirection: "row", gap: 8, paddingVertical: 4, marginBottom: 8 }}
                >
                  {DAY_NAMES.map((d) => {
                    const sel = editForm.route_day_of_week === d;
                    return (
                      <TouchableOpacity
                        key={d}
                        testID={`edit-route-day-${d}`}
                        onPress={() => setEditForm({ ...editForm, route_day_of_week: d })}
                        style={[styles.editChip, sel && styles.editChipOn]}
                      >
                        <Text style={[styles.editChipText, sel && styles.editChipTextOn]}>{d.slice(0, 3).toUpperCase()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {(editForm.route_frequency === "Bi-weekly" || editForm.route_frequency === "Monthly") && (
              <>
                <Text style={styles.editFieldLabel}>
                  {editForm.route_frequency === "Monthly"
                    ? "NEXT VISIT DATE (sets day of month)"
                    : "NEXT VISIT DATE (sets which week)"}
                </Text>
                <DateField
                  value={editForm.route_anchor_date}
                  onChange={(v) => setEditForm({ ...editForm, route_anchor_date: v || "" })}
                  placeholder="Pick next visit date"
                  testID="edit-route-anchor-date"
                />
                <Text style={[styles.editFieldHint, { marginTop: -2, marginBottom: 10 }] as any}>
                  {editForm.route_frequency === "Monthly"
                    ? "The day-of-month from this date will repeat every month."
                    : "This date anchors the 2-week cycle — future visits fall every 14 days."}
                </Text>
              </>
            )}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setEditing(false)}>
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="save-dealer-btn" style={styles.btn} onPress={saveDealer}>
                <Text style={styles.btnText}>SAVE</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Quick ROUTE editor — opened by tapping the ROUTE readout in the hero */}
      <Modal visible={routeEditOpen} transparent animationType="slide" onRequestClose={() => setRouteEditOpen(false)}>
        <View style={styles.modalBg}>
          <ScrollView style={styles.modalCard} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>EDIT ROUTE</Text>
              <TouchableOpacity testID="route-modal-close" hitSlop={10} onPress={() => setRouteEditOpen(false)}>
                <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.editFieldLabel}>ROUTE FREQUENCY</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: "row", gap: 8, paddingVertical: 4, marginBottom: 8 }}
            >
              {ROUTE_FREQUENCIES.map((f) => {
                const sel = (routeForm.route_frequency || "N/A") === f;
                return (
                  <TouchableOpacity
                    key={f}
                    testID={`route-freq-${f}`}
                    onPress={() =>
                      setRouteForm({
                        ...routeForm,
                        route_frequency: f,
                        ...(f === "N/A" ? { route_day_of_week: "", route_anchor_date: "" } : {}),
                        ...(f === "Monthly" ? { route_day_of_week: "" } : {}),
                      })
                    }
                    style={[styles.editChip, sel && styles.editChipOn]}
                  >
                    <Text style={[styles.editChipText, sel && styles.editChipTextOn]}>{f.toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {(routeForm.route_frequency === "Weekly" || routeForm.route_frequency === "Bi-weekly") && (
              <>
                <Text style={styles.editFieldLabel}>DAY OF WEEK</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ flexDirection: "row", gap: 8, paddingVertical: 4, marginBottom: 8 }}
                >
                  {DAY_NAMES.map((d) => {
                    const sel = routeForm.route_day_of_week === d;
                    return (
                      <TouchableOpacity
                        key={d}
                        testID={`route-day-${d}`}
                        onPress={() => setRouteForm({ ...routeForm, route_day_of_week: d })}
                        style={[styles.editChip, sel && styles.editChipOn]}
                      >
                        <Text style={[styles.editChipText, sel && styles.editChipTextOn]}>{d.slice(0, 3).toUpperCase()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {(routeForm.route_frequency === "Bi-weekly" || routeForm.route_frequency === "Monthly") && (
              <>
                <Text style={styles.editFieldLabel}>
                  {routeForm.route_frequency === "Monthly"
                    ? "NEXT VISIT DATE (sets day of month)"
                    : "NEXT VISIT DATE (sets which week)"}
                </Text>
                <DateField
                  value={routeForm.route_anchor_date}
                  onChange={(v) => setRouteForm({ ...routeForm, route_anchor_date: v || "" })}
                  placeholder="Pick next visit date"
                  testID="route-anchor-date"
                />
              </>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setRouteEditOpen(false)}>
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="save-route-btn" style={styles.btn} onPress={saveRoute} disabled={savingEdit}>
                <Text style={styles.btnText}>SAVE</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>


      {/* Add / edit agent modal */}
      <Modal visible={!!agentForm} transparent animationType="slide" onRequestClose={() => setAgentForm(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBg}
        >
          <ScrollView style={styles.modalCard} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>{agentForm?.id ? "EDIT AGENT" : "NEW AGENT"}</Text>
              <TouchableOpacity testID="agent-modal-close" hitSlop={10} onPress={() => setAgentForm(null)}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            {canImportContacts && !agentForm?.id && (
              <TouchableOpacity
                testID="import-agent-contact-btn"
                style={styles.importBtn}
                onPress={openContactPicker}
                activeOpacity={0.7}
              >
                <Ionicons name="people" size={18} color={theme.colors.accent} />
                <Text style={styles.importBtnText}>IMPORT FROM CONTACTS</Text>
              </TouchableOpacity>
            )}
            {([
              { k: "name", placeholder: "Name", multiline: false },
              { k: "phone", placeholder: "Phone", multiline: false },
              { k: "email", placeholder: "Email", multiline: false },
              { k: "location", placeholder: "Location / Territory (e.g. North Houston)", multiline: false },
              { k: "notes", placeholder: "Notes", multiline: true },
            ] as const).map((f) => (
              <TextInput
                key={f.k}
                testID={`agent-${f.k}`}
                placeholder={f.placeholder}
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, f.multiline && { height: 80 }]}
                value={agentForm?.[f.k] || ""}
                onChangeText={(v) => setAgentForm({ ...agentForm, [f.k]: v })}
                multiline={f.multiline}
              />
            ))}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setAgentForm(null)}>
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="save-agent-btn" style={styles.btn} onPress={addAgent}>
                <Text style={styles.btnText}>{agentForm?.id ? "SAVE" : "ADD"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Device contacts picker */}
      <Modal visible={showContactPicker} animationType="slide" transparent onRequestClose={() => setShowContactPicker(false)}>
        <View style={styles.pickerBg}>
          <SafeAreaView style={styles.pickerCard} edges={["top", "bottom"]}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={() => { setShowContactPicker(false); setPickerFilter(""); }} hitSlop={10}>
                <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.pickerTitle}>PICK A CONTACT</Text>
              <View style={{ width: 26 }} />
            </View>
            <TextInput
              testID="agent-contact-picker-search"
              placeholder="Search..."
              placeholderTextColor={theme.colors.textMuted}
              value={pickerFilter}
              onChangeText={setPickerFilter}
              style={styles.pickerSearch}
            />
            {pickerLoading ? (
              <View style={styles.pickerEmpty}>
                <Text style={styles.pickerEmptyText}>Loading contacts…</Text>
              </View>
            ) : filteredDeviceContacts.length === 0 ? (
              <View style={styles.pickerEmpty}>
                <Ionicons name="people-outline" size={40} color={theme.colors.textMuted} />
                <Text style={styles.pickerEmptyText}>
                  {deviceContacts.length === 0
                    ? "No device contacts available (or permission denied)."
                    : "No matches for your search."}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredDeviceContacts}
                keyExtractor={(c, i) => `${c.name}-${i}`}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    testID={`pick-agent-device-contact-${item.name}`}
                    style={styles.pickerRow}
                    onPress={() => pickContactForAgent(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.pickerAvatar}>
                      <Text style={styles.pickerAvatarText}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerName}>{item.name}</Text>
                      {!!(item.phone || item.email) && (
                        <Text style={styles.pickerSub} numberOfLines={1}>
                          {[item.phone, item.email].filter(Boolean).join("  ·  ")}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                )}
              />
            )}
          </SafeAreaView>
        </View>
      </Modal>

      <KebabMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        items={[
          { label: "Edit dealer", icon: "create-outline", onPress: openEditDealer, testID: "menu-edit-dealer" },
          { label: "Add agent", icon: "person-add-outline", onPress: openAddAgent, testID: "menu-add-agent" },
          { label: "Delete dealer", icon: "trash-outline", onPress: removeDealer, color: theme.colors.danger, dividerAbove: true, testID: "menu-delete-dealer" },
        ]}
      />

      <KebabMenu
        visible={!!menuAgent}
        onClose={() => setMenuAgent(null)}
        items={menuAgent ? [
          ...(menuAgent.phone ? [
            { label: "Call", icon: "call-outline" as const, onPress: () => openPhone(menuAgent.phone), testID: "agent-menu-call" },
            { label: "Text", icon: "chatbubble-outline" as const, onPress: () => openSms(menuAgent.phone), testID: "agent-menu-text" },
          ] : []),
          ...(menuAgent.email ? [
            { label: "Email", icon: "mail-outline" as const, onPress: () => Linking.openURL(`mailto:${menuAgent.email}`), testID: "agent-menu-email" },
          ] : []),
          { label: "Edit agent", icon: "create-outline" as const, onPress: () => setAgentForm({ id: menuAgent.id, name: menuAgent.name || "", phone: menuAgent.phone || "", email: menuAgent.email || "", location: menuAgent.location || "", notes: menuAgent.notes || "" }), testID: "agent-menu-edit" },
          { label: "Share agent", icon: "share-social-outline" as const, onPress: () => shareOrSaveAgent({ name: menuAgent.name, phone: menuAgent.phone, email: menuAgent.email, location: menuAgent.location, notes: menuAgent.notes }, dealer?.name), testID: "agent-menu-share" },
          { label: "Delete agent", icon: "trash-outline" as const, color: theme.colors.danger, dividerAbove: true, onPress: () => removeAgent(menuAgent.id, menuAgent.name), testID: "agent-menu-delete" },
        ] : []}
      />

      {/* Add wishlist item modal (auto-assigns this dealer) */}
      <Modal visible={!!wishForm} transparent animationType="slide" onRequestClose={() => setWishForm(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBg}
        >
          <ScrollView style={styles.modalCard} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>NEW WISHLIST ITEM</Text>
              <TouchableOpacity testID="wish-modal-close" hitSlop={10} onPress={() => setWishForm(null)}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.wishModalDealer}>Dealer: {dealer.name}</Text>
            <TouchableOpacity
              testID="wish-photo-btn"
              style={styles.wishPhotoBtn}
              onPress={chooseWishPhoto}
              activeOpacity={0.8}
            >
              {wishForm?.photos && wishForm.photos[0] ? (
                <AppImage source={{ uri: wishForm.photos[0] }} style={styles.wishPhotoPreview} resizeMode="cover" />
              ) : (
                <View style={styles.wishPhotoPlaceholder}>
                  <Ionicons name="camera" size={22} color={theme.colors.accent} />
                  <Text style={styles.wishPhotoText}>ADD PHOTO</Text>
                </View>
              )}
            </TouchableOpacity>
            {!!(wishForm?.photos && wishForm.photos[0]) && (
              <TouchableOpacity
                testID="wish-photo-remove"
                onPress={() => setWishForm({ ...wishForm, photos: [] })}
                style={styles.wishPhotoRemove}
              >
                <Ionicons name="trash-outline" size={13} color={theme.colors.danger} />
                <Text style={styles.wishPhotoRemoveText}>REMOVE PHOTO</Text>
              </TouchableOpacity>
            )}
            {([
              { k: "name", placeholder: "Name", multiline: false, kb: "default" },
              { k: "model_number", placeholder: "Model #", multiline: false, kb: "default" },
              { k: "price", placeholder: "Cost ($)", multiline: false, kb: "decimal-pad" },
              { k: "url", placeholder: "Website (optional)", multiline: false, kb: "url" },
            ] as const).map((f) => (
              <TextInput
                key={f.k}
                testID={`wish-${f.k}`}
                placeholder={f.placeholder}
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={wishForm?.[f.k] || ""}
                onChangeText={(v) => setWishForm({ ...wishForm, [f.k]: v })}
                keyboardType={f.kb as any}
                autoCapitalize={f.k === "url" ? "none" : "sentences"}
              />
            ))}
            <View style={styles.wishPrioRow}>
              {(["low", "normal", "high"] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  testID={`wish-prio-${p}`}
                  style={[styles.wishPrioBtn, (wishForm?.priority || "normal") === p && styles.wishPrioBtnOn]}
                  onPress={() => setWishForm({ ...wishForm, priority: p })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.wishPrioText, (wishForm?.priority || "normal") === p && styles.wishPrioTextOn]}>
                    {p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              testID="wish-notes"
              placeholder="Notes"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { height: 80 }]}
              value={wishForm?.notes || ""}
              onChangeText={(v) => setWishForm({ ...wishForm, notes: v })}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setWishForm(null)} disabled={savingWish}>
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="save-wish-btn" style={styles.btn} onPress={saveWish} disabled={savingWish}>
                <Text style={styles.btnText}>{savingWish ? "SAVING…" : "ADD"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellValue}>{value}</Text>
      <Text style={styles.cellLabel}>{label}</Text>
    </View>
  );
}

function DepartmentRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: any;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  if (!value) return null;
  const isLinky = /@/.test(value) || /^https?:/i.test(value) || /\d/.test(value);
  return (
    <TouchableOpacity
      style={styles.contactRow}
      onPress={onPress}
      disabled={!onPress || !isLinky}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={18} color={theme.colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={styles.deptRowLabel}>{label.toUpperCase()}</Text>
        <Text style={styles.deptRowValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
      {isLinky && onPress && (
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

function ContactRow({
  icon,
  label,
  onPress,
}: {
  icon: any;
  label?: string;
  onPress?: () => void;
}) {
  if (!label) return null;
  return (
    <TouchableOpacity
      style={styles.contactRow}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={18} color={theme.colors.accent} />
      <Text style={styles.contactText}>{label}</Text>
    </TouchableOpacity>
  );
}

function CopyableRow({
  icon,
  label,
  onCopy,
}: {
  icon: any;
  label?: string;
  onCopy: () => void;
}) {
  if (!label) return null;
  return (
    <TouchableOpacity
      style={styles.contactRow}
      onPress={onCopy}
      activeOpacity={0.7}
      accessibilityLabel="Tap to copy"
    >
      <Ionicons name={icon} size={18} color={theme.colors.accent} />
      <Text style={[styles.contactText, { flex: 1 }]}>{label}</Text>
      <View style={styles.copyChip}>
        <Ionicons name="copy-outline" size={13} color={theme.colors.accent} />
        <Text style={styles.copyChipText}>COPY</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  detailActionsRowDealer: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  menuDotsBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  bizNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  heroBox: { alignItems: "center", paddingTop: 6, paddingBottom: 4 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  heroRight: { flex: 1, alignItems: "flex-start" },
  heroLabel: { color: c.textMuted, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  heroValue: { color: c.textPrimary, fontSize: 13, fontWeight: "900", marginTop: 2 },
  heroSep: { height: 1, alignSelf: "stretch", backgroundColor: c.borderSubtle, marginVertical: 8 },
  heroRoute: { color: c.accent, fontSize: 11, fontWeight: "900", marginTop: 2, letterSpacing: 0.5 },
  heroNext: { color: c.textSecondary, fontSize: 9, fontWeight: "700", marginTop: 2 },
  heroNextEmpty: { color: c.textMuted, fontSize: 9, fontStyle: "italic", marginTop: 2 },
  heroRouteLabelRow: { flexDirection: "row", alignItems: "center" },
  tabBar: { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.bgSecondary, overflow: "hidden" },
  tab: { flex: 1, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: c.accent },
  tabText: { color: c.textSecondary, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  tabTextOn: { color: "#000" },
  contentPanelOuter: { flex: 1, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 14 },
  contentPanelPlain: {
    flex: 1,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    padding: 6,
    ...(theme.elevation.md as object),
  },
  agentColHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border, paddingLeft: 14 },
  agentColName: { color: c.textMuted, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  agentColLoc: { color: c.textMuted, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  agentSeparator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  agentSeparatorLine: { flex: 1, height: 1, backgroundColor: c.border },
  agentSeparatorText: { color: c.textMuted, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderLeftWidth: 4,
    borderLeftColor: c.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 4,
  
    ...(theme.elevation.md as object),
  },
  cardSkinFrame: { marginHorizontal: 16, marginTop: 4, marginBottom: 12 },
  cardSkinWrap: { marginHorizontal: 16, marginTop: 4, marginBottom: 12 },
  routeRowInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  routeRowLabel: {
    color: c.textPrimary,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  routeRowNext: {
    color: c.accent,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
  },
  routeRowEmpty: {
    color: c.textMuted,
    fontSize: 8,
    fontStyle: "italic",
    marginTop: 3,
  },
  editFieldLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 6,
    marginBottom: 6,
  },
  editFieldHint: {
    color: c.textMuted,
    fontSize: 8,
    fontStyle: "italic",
    marginBottom: 8,
  },
  editChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bg,
    borderRadius: 4,
  },
  editChipOn: {
    backgroundColor: "transparent",
    borderColor: c.accent,
    borderWidth: 2,
  },
  editChipText: {
    color: c.textSecondary,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  editChipTextOn: { color: c.accent },
  logoPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 10,
  },
  logoActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    backgroundColor: c.bg,
  },
  logoActionText: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  logoStockHint: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  stockLogoChip: {
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    backgroundColor: c.surface,
    gap: 4,
  },
  stockLogoChipOn: {
    borderColor: c.accent,
    borderWidth: 2,
    backgroundColor: c.bg,
  },
  stockLogoLabel: {
    color: c.textSecondary,
    fontSize: 7,
    fontWeight: "700",
    textAlign: "center",
  },
  bigAvatar: {
    width: 80,
    height: 80,
    backgroundColor: c.surface,
    borderWidth: 2,
    borderColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  bigAvatarText: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 19,
    letterSpacing: 2,
  },
  dealerName: { color: c.textPrimary, fontSize: 18, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    marginVertical: 16,
  },
  cell: {
    flexBasis: "20%",
    alignItems: "center",
    paddingVertical: 8,
  },
  cellValue: { color: c.textPrimary, fontWeight: "900", fontSize: 14 },
  cellLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 2,
  },
  sectionLabel: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionLabelStrong: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
    flexShrink: 1,
  },
  viewToolsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  
    ...(theme.elevation.md as object),
  },
  viewToolsIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: c.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
  },
  viewToolsTitle: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 11,
  },
  viewToolsSub: {
    color: c.textSecondary,
    fontSize: 9,
    marginTop: 3,
  },
  toolsHeader: {    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 20,
  },
  totalPill: {
    backgroundColor: "rgba(249, 115, 22, 0.10)",
    borderWidth: 1,
    borderColor: c.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  totalPillLabel: {
    color: c.accent,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1,
  },
  totalPillValue: {
    color: c.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingRight: 20,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: c.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    marginTop: 12,
  },
  addBtnText: {
    color: c.accent,
    fontWeight: "800",
    fontSize: 8,
    letterSpacing: 1,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomColor: c.borderSubtle,
    borderBottomWidth: 1,
  },
  contactText: { color: c.textPrimary, fontSize: 10 },
  dealerContactPhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexWrap: "wrap",
  },
  dealerContactPhoneText: {
    color: c.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginRight: 2,
  },
  dealerContactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: c.surface,
  
    ...(theme.elevation.md as object),
  },
  dealerContactBtnSmall: {
    paddingHorizontal: 12,
  },
  dealerContactBtnText: {
    color: c.textPrimary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  agentContactRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
    flexWrap: "wrap",
  },
  agentContactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: c.surface,
    marginTop: 4,
  
    ...(theme.elevation.md as object),
  },
  agentContactBtnSmall: {
    paddingHorizontal: 8,
  },
  agentContactText: {
    color: c.textPrimary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  agentCard: { paddingTop: 10, paddingBottom: 10, paddingHorizontal: 12 },
  agentCardSkin: {
    marginTop: 4,
    marginBottom: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.accent + "44",
    backgroundColor: "transparent",
  },
  agentTopActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginBottom: 8,
  },
  agentIconBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: c.bg,
  },
  agentCardActive: {
    borderColor: c.accent,
    borderLeftWidth: 4,
    backgroundColor: "rgba(249, 115, 22,0.06)",
  },
  agentActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap",
  },
  agentActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: c.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  agentActionText: {
    color: c.accent,
    fontWeight: "800",
    fontSize: 8,
    letterSpacing: 1,
  },
  currentAgent: {
    marginHorizontal: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: "rgba(249, 115, 22,0.08)",
    borderRadius: 4,
  },
  currentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: c.accent,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  currentBadgeText: { color: c.accent, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  agentName: { color: c.textPrimary, fontWeight: "700", fontSize: 12, marginTop: 6 },
  agentMeta: { color: c.textSecondary, fontSize: 9, marginTop: 2 },
  // ---- Business-card layout (agent ShadowBoxSubCard) ----
  bizName: {
    color: c.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  bizBadge: {
    color: c.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 2,
    marginBottom: 4,
  },
  bizHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bizShareBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bg,
  },
  agentFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  agentActionsLeft: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    flexShrink: 1,
  },
  bizFabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: "auto",
  },
  bizFab: {
    width: 42,
    height: 42,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  bizRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
  },
  bizRowIcon: { width: 16, textAlign: "center" },
  bizValue: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  bizPhoneActions: {
    flexDirection: "row",
    gap: 6,
  },
  bizIconBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bg,
  },
  agentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomColor: c.borderSubtle,
    borderBottomWidth: 1,
  },
  toolRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: c.bgSecondary,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    ...(theme.elevation.md as object),
  },
  toolName: { color: c.textPrimary, fontWeight: "700", fontSize: 10 },
  toolMeta: { color: c.textSecondary, fontSize: 9, marginTop: 2 },
  empty: { color: c.textMuted, fontStyle: "italic", padding: 20 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: c.bgSecondary,
    padding: 24,
    borderTopWidth: 2,
    borderTopColor: c.accent,
    maxHeight: "85%",
  },
  modalTitle: { color: c.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 2, marginBottom: 16 },
  input: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    color: c.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    borderRadius: 4,
    marginBottom: 10,
    fontSize: 11,
  },
  btn: {
    flex: 1,
    backgroundColor: c.accent,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  btnText: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 10 },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: c.border,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  btnGhostText: { color: c.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 10 },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: c.accent,
    borderRadius: 6,
    marginBottom: 12,
  },
  importBtnText: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  pickerBg: { flex: 1, backgroundColor: c.bg },
  pickerCard: { flex: 1, backgroundColor: c.bg },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  pickerTitle: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  pickerSearch: {
    backgroundColor: c.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    color: c.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 11,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  pickerAvatar: {
    width: 36,
    height: 36,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  pickerAvatarText: { color: c.accent, fontWeight: "900", fontSize: 10 },
  pickerName: { color: c.textPrimary, fontWeight: "700", fontSize: 11 },
  pickerSub: { color: c.textSecondary, fontSize: 9, marginTop: 2 },
  pickerEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 10,
  },
  pickerEmptyText: {
    color: c.textSecondary,
    textAlign: "center",
  },
  // Company Details card (groups contact rows + nested tools-purchased button)

  // ---------- DETAILS BOX (warranty-card style, mirrors tool detail) ----------
  detailsBox: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  // ---- Dealer Wishlist tab ----
  wishAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: 8,
    marginTop: 6,
    marginBottom: 12,
  },
  wishAddText: { color: c.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  wishEmpty: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 16 },
  wishEmptyText: { color: c.textSecondary, fontSize: 11, textAlign: "center", marginTop: 10, lineHeight: 16 },
  wishRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  wishRowLast: { borderBottomWidth: 0 },
  wishThumb: {
    width: 44, height: 44, borderRadius: 6,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1, borderColor: c.border,
  },
  wishRowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  wishName: { flex: 1, color: c.textPrimary, fontSize: 12, fontWeight: "800" },
  wishPrice: { color: c.accent, fontSize: 12, fontWeight: "900" },
  wishMeta: { color: c.textMuted, fontSize: 9, fontWeight: "700", marginTop: 3 },
  wishTagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  wishPriority: { color: c.textSecondary, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  wishPurchased: { color: c.accent, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  wishNotes: { color: c.textMuted, fontSize: 9, fontStyle: "italic", marginTop: 5 },
  wishModalDealer: { color: c.accent, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, marginBottom: 12 },
  wishPhotoBtn: { alignSelf: "flex-start", marginBottom: 6 },
  wishPhotoPreview: {
    width: 96, height: 96, borderRadius: 8,
    backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border,
  },
  wishPhotoPlaceholder: {
    width: 96, height: 96, borderRadius: 8,
    alignItems: "center", justifyContent: "center", gap: 4,
    borderWidth: 1, borderColor: c.accent, borderStyle: "dashed", backgroundColor: c.bg,
  },
  wishPhotoText: { color: c.accent, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  wishPhotoRemove: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 12 },
  wishPhotoRemoveText: { color: c.danger, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  wishPrioRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  wishPrioBtn: {
    flex: 1, paddingVertical: 10, alignItems: "center",
    borderWidth: 1, borderColor: c.border, borderRadius: 8, backgroundColor: c.bg,
  },
  wishPrioBtnOn: { borderColor: c.accent, backgroundColor: c.accent },
  wishPrioText: { color: c.textSecondary, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  wishPrioTextOn: { color: "#000" },
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
  // AGENTS sub-header inside the details box
  detailsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  detailsHeaderLabel: {
    // AGENTS header — user wants this bold WHITE (not muted) so it reads
    // as the parent of the agent rows below.
    color: c.textPrimary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  detailsHeaderAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: c.accent,
    borderRadius: 6,
  },
  detailsHeaderAddText: {
    color: c.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  agentRowName: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },

  companyCard: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  companyDivider: {
    height: 1,
    backgroundColor: c.border,
    marginVertical: 12,
    marginHorizontal: 4,
  },
  // Per-department contact row label/value (warranty / tech / customer support)
  deptRowLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  deptRowValue: {
    color: c.textPrimary,
    fontSize: 11,
    fontWeight: "600",
  },
  // Agent territory / location pill shown on the agent card
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    maxWidth: 200,
  },
  locationPillText: {
    color: c.accent,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  copyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: "rgba(249, 115, 22, 0.10)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  copyChipText: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
}));
