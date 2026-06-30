import { useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { usePrefs } from "../../src/prefs";
import { confirm } from "../../src/confirm";
import { ROUTE_FREQUENCIES, DAY_NAMES, routeLabel, nextRouteText } from "../../src/route";
import { DateField } from "../../src/DateField";
import { getCached, setCached } from "../../src/cache";
import { useAuth } from "../../src/AuthContext";
import { useResponsive } from "../../src/responsive";
import { rescheduleDealerNotifications } from "../../src/notifications";
import { formatPhone, openPhone, openSms } from "../../src/contactLinks";
import { ContactIconButton } from "../../src/components/ContactIcons";
import { useAppResume } from "../../src/appLifecycle";

import { themedStyles, useSkin } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";
import { ShadowBox } from "../../src/components/ShadowBox";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { AddFab } from "../../src/components/AddFab";
import { DealerLogo } from "../../src/components/DealerLogo";
import { STOCK_LOGO_OPTIONS, isDefaultLogo, DEALER_LOGO_SLOT } from "../../src/dealerLogos";
import { SKIN, CAP } from "../../src/tbv/skins";
import { TbvFrame } from "../../src/tbv/components/TbvFrame";
import { TbvListPanel } from "../../src/tbv/components/TbvListPanel";
import { useIsSteel, useSteelPanelFrame } from "../../src/tbv/steel";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

export default function DealersScreen() {
  const router = useRouter();
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const { gridCols } = useResponsive();
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const isSteel = useIsSteel();
  const steelPanel = useSteelPanelFrame();
  const plateSrc = isSteel ? steelPanel.source : SKIN.plate;
  const plateCap = isSteel ? steelPanel.capInsets : CAP.plate;
  const winSrc = isSteel ? steelPanel.source : SKIN.window;
  const winCap = isSteel ? steelPanel.capInsets : CAP.window;
  const steelScale = isSteel ? steelPanel.frameScale : undefined;
  const [dealers, setDealers] = useState<any[]>(() => getCached("dealers", []));
  const [tools, setTools] = useState<any[]>(() => getCached("tools", []));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<any>({ name: "", logo: "default", phone: "", website: "", address: "", notes: "", warranty_contact: "", tech_support_contact: "", customer_support_contact: "", route_frequency: "N/A", route_day_of_week: "", route_anchor_date: "" });

  const lockedDealerIds = useMemo(() => new Set<string>(), []);

  const atDealerLimit = false;

  const load = useCallback(async (opts?: { forceFresh?: boolean }) => {
    const ff = opts?.forceFresh ? { forceFresh: true } : undefined;
    const [d, t] = await Promise.all([
      api.listDealers(ff),
      api.listTools(undefined, ff),
    ]);
    setDealers(setCached("dealers", d));
    setTools(setCached("tools", t));
    // Re-sync local route notifications whenever the dealer list changes
    // (covers create/edit/delete + remote changes from another device).
    if (prefs.dealer_notifications_enabled) {
      rescheduleDealerNotifications(d, {
        enabled: true,
        hour: prefs.dealer_notification_hour,
        minute: prefs.dealer_notification_minute,
        notifyDayBefore: prefs.dealer_notify_day_before,
      }).catch(() => {});
    }
  }, [
    prefs.dealer_notifications_enabled,
    prefs.dealer_notification_hour,
    prefs.dealer_notification_minute,
    prefs.dealer_notify_day_before,
  ]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Refetch on iOS background→foreground so a suspended fetch doesn't hang
  // the dealers list. abortAllInFlight() runs in _layout.tsx just before.
  useAppResume(useCallback(() => { load(); }, [load]));

  const create = async () => {
    if (!form.name?.trim()) return;
    const payload = { ...form, name: form.name.trim() };
    const d = await api.createDealer(payload);
    setForm({ name: "", logo: "default", phone: "", website: "", address: "", notes: "", warranty_contact: "", tech_support_contact: "", customer_support_contact: "", route_frequency: "N/A", route_day_of_week: "", route_anchor_date: "" });
    setShowAdd(false);
    router.push(`/dealer/${d.id}`);
  };

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
        setForm((f: any) => ({ ...f, logo: `data:image/png;base64,${out.base64}` }));
      }
    } catch (e: any) {
      Alert.alert("Could not load image", String(e?.message || e));
    }
  };

  const summaryFor = (id: string) => {
    const ts = tools.filter((x) => x.dealer_id === id);
    const total = ts.reduce((s, t) => s + (t.cost || 0), 0);
    return { count: ts.length, total };
  };

  const remove = async (dealerId: string, name: string) => {
    if (!(await confirm(`Delete ${name}?`, "Tools keep the dealer name as text. This cannot be undone.", "Delete", true))) return;
    await api.deleteDealer(dealerId);
    load();
  };

  const dealerContent = (item: any) => {
    const s = summaryFor(item.id);
    const cur =
      (item.agents || []).find((a: any) => a.id === item.current_agent_id) || null;
    const isLocked = lockedDealerIds.has(item.id);
    const cardContent = (
      <>
        <DealerLogo logo={item.logo} size={DEALER_LOGO_SLOT.list} style={{ marginRight: 0 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{item.name}</Text>
          <Text style={[styles.rowSub, isIndustrial && styles.skinTextBright]}>
            {cur ? `Agent: ${cur.name}` : "No current agent"}
          </Text>
          <Text style={[styles.rowMeta, isIndustrial && styles.skinTextBright]}>
            {s.count} TOOL{s.count === 1 ? "" : "S"}
            {prefs.show_prices ? `  ·  $${s.total.toFixed(2)}` : ""}
            {`  ·  ${routeLabel(item)}`}
          </Text>
          {(() => {
            const agentPhone = cur?.phone || "";
            if (!agentPhone) return null;
            return (
              <View style={styles.rowContactBtns}>
                <Text style={styles.rowContactPhone} numberOfLines={1}>
                  {formatPhone(agentPhone)}
                </Text>
                <ContactIconButton
                  type="call"
                  size={26}
                  testID={`dealer-row-call-${item.id}`}
                  onPress={() => openPhone(agentPhone)}
                />
                <ContactIconButton
                  type="text"
                  size={26}
                  testID={`dealer-row-text-${item.id}`}
                  onPress={() => openSms(agentPhone)}
                />
              </View>
            );
          })()}
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      </>
    );
    return { cardContent, isLocked };
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title="DEALERS"
        subtitle="Companies & Sales Agents"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
        backIcon="chevron-back"
      />

      {isIndustrial && gridCols === 1 ? (
        // Skinned single-column: ALL dealers in ONE fixed-height metal panel.
        // The panel is capped to the screen; the rows scroll INSIDE it (matches
        // the Inventory screen) instead of the panel stretching past the screen.
        dealers.length === 0 ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            <View style={styles.empty}>
              <Ionicons name="briefcase-outline" size={48} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>NO DEALERS</Text>
              <Text style={styles.emptyText}>
                Add tool dealers (Matco, Snap-on, etc) and track agents you buy from.
              </Text>
            </View>
          </ScrollView>
        ) : (
          <TbvListPanel
            source={winSrc}
            capInsets={winCap}
            frameScale={steelScale}
            style={styles.skinListPanel}
            padX={isSteel ? 18 : 22}
            padTop={isSteel ? 6 : 8}
            padBottom={isSteel ? 6 : 8}
          >
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              {dealers.map((item, idx) => {
                const { cardContent, isLocked } = dealerContent(item);
                const isLast = idx === dealers.length - 1;
                return (
                  <TouchableOpacity
                    key={item.id}
                    testID={`dealer-card-${item.id}`}
                    style={[styles.dealerSingleRow, isLast && { borderBottomWidth: 0 }]}
                    onPress={() => router.push(`/dealer/${item.id}`)}
                    activeOpacity={isLocked ? 1 : 0.8}
                    disabled={isLocked}
                  >
                    {cardContent}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TbvListPanel>
        )
      ) : (
      <FlatList
        data={dealers}
        keyExtractor={(i) => i.id}
        key={`dealers-grid-${gridCols}`}
        numColumns={gridCols}
        columnWrapperStyle={gridCols > 1 ? { gap: 12, paddingHorizontal: 16, paddingTop: 8 } : undefined}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>NO DEALERS</Text>
            <Text style={styles.emptyText}>
              Add tool dealers (Matco, Snap-on, etc) and track agents you buy from.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const { cardContent, isLocked } = dealerContent(item);

          if (isIndustrial) {
            return (
              <TouchableOpacity
                testID={`dealer-card-${item.id}`}
                style={[
                  styles.rowSkinWrap,
                  gridCols > 1 && styles.rowSkinGridWrap,
                ]}
                onPress={() => router.push(`/dealer/${item.id}`)}
                activeOpacity={isLocked ? 1 : 0.8}
                disabled={isLocked}
              >
                <TbvFrame
                  source={plateSrc}
                  capInsets={plateCap}
                  frameScale={steelScale}
                  style={styles.rowSkinFrame}
                  padX={20}
                  padTop={14}
                  padBottom={14}
                >
                  <View
                    style={[
                      styles.rowSkinInner,
                      gridCols > 1 && styles.rowSkinInnerGrid,
                    ]}
                  >
                    {cardContent}
                  </View>
                </TbvFrame>
              </TouchableOpacity>
            );
          }

          return (
            <ShadowBox
              flat
              testID={`dealer-card-${item.id}`}
              style={[
                styles.row,
                gridCols > 1 && styles.rowGrid,
                isLocked && styles.rowLocked,
              ]}
              onPress={() => {
                router.push(`/dealer/${item.id}`);
              }}
              activeOpacity={isLocked ? 1 : 0.7}
            >
              {cardContent}
            </ShadowBox>
          );
        }}
      />
      )}

      {/* Add Dealer is now in the header (top-right) — bottom FAB removed. */}

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBg}
        >
          <ScrollView style={styles.modalCard} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>NEW DEALER</Text>
              <TouchableOpacity testID="add-dealer-close" hitSlop={10} onPress={() => { setShowAdd(false); setForm({ name: "", logo: "default", phone: "", website: "", address: "", notes: "", warranty_contact: "", tech_support_contact: "", customer_support_contact: "", route_frequency: "N/A", route_day_of_week: "", route_anchor_date: "" }); }}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Dealer logo — chosen at creation time (defaults to the app octagon) */}
            <Text style={styles.logoFieldLabel}>DEALER LOGO</Text>
            <View style={styles.logoPickerRow}>
              <DealerLogo logo={form.logo} size={DEALER_LOGO_SLOT.picker} />
              <View style={{ flex: 1, gap: 8 }}>
                <TouchableOpacity
                  testID="add-logo-upload-btn"
                  style={styles.logoActionBtn}
                  onPress={pickDealerLogo}
                >
                  <Ionicons name="cloud-upload-outline" size={15} color={theme.colors.accent} />
                  <Text style={styles.logoActionText}>UPLOAD LOGO</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="add-logo-default-btn"
                  style={styles.logoActionBtn}
                  onPress={() => setForm((f: any) => ({ ...f, logo: "default" }))}
                  disabled={isDefaultLogo(form.logo)}
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
                const sel = form.logo === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    testID={`add-logo-stock-${opt.key}`}
                    onPress={() => setForm((f: any) => ({ ...f, logo: opt.value }))}
                    style={[styles.stockLogoChip, sel && styles.stockLogoChipOn]}
                  >
                    <Image source={opt.source} style={{ width: 48, height: 30 }} resizeMode="contain" />
                    <Text style={styles.stockLogoLabel} numberOfLines={1}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {([
              { k: "name", placeholder: "Dealer name (e.g. Matco)*", focus: true, multiline: false },
              { k: "phone", placeholder: "Main phone", focus: false, multiline: false },
              { k: "website", placeholder: "Website", focus: false, multiline: false },
              { k: "address", placeholder: "Address", focus: false, multiline: false },
              { k: "warranty_contact", placeholder: "Warranty Dept (phone / email / URL)", focus: false, multiline: false },
              { k: "tech_support_contact", placeholder: "Tech Support Dept (phone / email / URL)", focus: false, multiline: false },
              { k: "customer_support_contact", placeholder: "Customer Support (phone / email / URL)", focus: false, multiline: false },
              { k: "notes", placeholder: "Notes", focus: false, multiline: true },
            ] as const).map((f) => (
              <TextInput
                key={f.k}
                testID={`dealer-${f.k}-input`}
                placeholder={f.placeholder}
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, f.multiline && { height: 90, paddingTop: 12 }]}
                value={form[f.k] || ""}
                onChangeText={(v) => setForm({ ...form, [f.k]: v })}
                multiline={f.multiline}
                autoFocus={f.focus}
              />
            ))}

            {/* Route frequency */}
            <Text style={styles.fieldLabel}>ROUTE FREQUENCY</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: "row", gap: 8, paddingVertical: 4, marginBottom: 8 }}
            >
              {ROUTE_FREQUENCIES.map((f) => {
                const sel = (form.route_frequency || "N/A") === f;
                return (
                  <TouchableOpacity
                    key={f}
                    testID={`route-freq-${f}`}
                    onPress={() =>
                      setForm({
                        ...form,
                        route_frequency: f,
                        // Reset day/anchor when N/A or Monthly
                        ...(f === "N/A" ? { route_day_of_week: "", route_anchor_date: "" } : {}),
                        ...(f === "Monthly" ? { route_day_of_week: "" } : {}),
                      })
                    }
                    style={[styles.chip, sel && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, sel && styles.chipTextOn]}>{f.toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Day of week — only for Weekly / Bi-weekly */}
            {(form.route_frequency === "Weekly" || form.route_frequency === "Bi-weekly") && (
              <>
                <Text style={styles.fieldLabel}>DAY OF WEEK</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ flexDirection: "row", gap: 8, paddingVertical: 4, marginBottom: 8 }}
                >
                  {DAY_NAMES.map((d) => {
                    const sel = form.route_day_of_week === d;
                    return (
                      <TouchableOpacity
                        key={d}
                        testID={`route-day-${d}`}
                        onPress={() => setForm({ ...form, route_day_of_week: d })}
                        style={[styles.chip, sel && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, sel && styles.chipTextOn]}>{d.slice(0, 3).toUpperCase()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* Anchor date — for Bi-weekly (even-week alignment) and Monthly (day of month) */}
            {(form.route_frequency === "Bi-weekly" || form.route_frequency === "Monthly") && (
              <>
                <Text style={styles.fieldLabel}>
                  {form.route_frequency === "Monthly"
                    ? "NEXT VISIT DATE (sets day of month)"
                    : "NEXT VISIT DATE (sets which week)"}
                </Text>
                <DateField
                  value={form.route_anchor_date}
                  onChange={(v) => setForm({ ...form, route_anchor_date: v || "" })}
                  placeholder="Pick next visit date"
                  testID="route-anchor-date"
                />
                <Text style={[styles.fieldHint, { marginTop: -4, marginBottom: 10 }]}>
                  {form.route_frequency === "Monthly"
                    ? "The day-of-month from this date will repeat every month."
                    : "This date anchors the 2-week cycle — future visits fall every 14 days."}
                </Text>
              </>
            )}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => {
                  setShowAdd(false);
                  setForm({ name: "", logo: "default", phone: "", website: "", address: "", notes: "", warranty_contact: "", tech_support_contact: "", customer_support_contact: "", route_frequency: "N/A", route_day_of_week: "", route_anchor_date: "" });
                }}
              >
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="dealer-create-btn" style={styles.btn} onPress={create}>
                <Text style={styles.btnText}>CREATE</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <AddFab testID="add-dealer-fab" onPress={() => setShowAdd(true)} />
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  skinListPanel: { flex: 1, marginHorizontal: 16, marginTop: 8, marginBottom: 12 },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15,15,15,0.9)",
    borderWidth: 1,
    borderColor: c.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  headerAddBtnText: {
    color: c.accent,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: { color: c.textPrimary, fontSize: 21, fontWeight: "900", letterSpacing: 2 },
  subtitle: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    backgroundColor: c.bgSecondary,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    ...(theme.elevation.md as object),
  },
  rowLocked: { opacity: 0.45 },
  rowSkinWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
  },
  rowSkinFrame: { width: "100%" },
  // Tablet 2-column skinned cards: `flex:1` gives each cell equal WIDTH.
  rowSkinGridWrap: {
    flex: 1,
    marginHorizontal: 0,
    marginTop: 8,
  },
  // TbvFrame self-sizes to its content height, so equal HEIGHT can't come from
  // flex — instead we floor the card content at a fixed minHeight (tall enough
  // for the agent phone quick-action variant). Cards without that row pad to
  // match, so the 2-column grid lines up uniformly.
  rowSkinInnerGrid: {
    minHeight: 88,
  },
  rowSkinInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowGrid: {
    flex: 1,
    marginHorizontal: 0,
    marginTop: 0,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    borderRadius: theme.radii.md,
    marginBottom: 12,
    ...(theme.elevation.md as object),
  },
  avatar: {
    width: 48,
    height: 48,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  avatarText: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 1,
  },
  rowTitle: { color: c.textPrimary, fontWeight: "700", fontSize: 12 },
  skinTextBright: { color: "#FFFFFF" },
  dealerSingleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  rowSub: { color: c.textSecondary, fontSize: 9, marginTop: 2 },
  rowMeta: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 4,
  },
  rowContactBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap",
  },
  rowContactPhone: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginRight: 2,
  },
  rowContactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: c.surface,
  },
  rowContactBtnSmall: {
    paddingHorizontal: 8,
  },
  rowContactBtnText: {
    color: c.textPrimary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  rowDeleteBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 4,
    marginRight: 4,
  },
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 40 },
  emptyTitle: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 16,
  },
  emptyText: {
    color: c.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
  fab: {
    position: "absolute",
    bottom: 30,
    right: 24,
    width: 56,
    height: 56,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  fabLocked: { backgroundColor: c.warning },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: c.bgSecondary,
    padding: 24,
    borderTopWidth: 2,
    borderTopColor: c.accent,
    maxHeight: "85%",
  },
  modalTitle: {
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 16,
  },
  input: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    color: c.textPrimary,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 4,
    marginBottom: 12,
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
  fieldLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 4,
  },
  fieldHint: {
    color: c.textMuted,
    fontSize: 8,
    fontStyle: "italic",
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bg,
    borderRadius: 4,
  },
  chipOn: {
    backgroundColor: "transparent",
    borderColor: c.accent,
    borderWidth: 2,
  },
  chipText: {
    color: c.textSecondary,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  chipTextOn: { color: c.accent },
  logoFieldLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 2,
  },
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
}));
