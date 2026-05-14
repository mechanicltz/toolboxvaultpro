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

import { themedStyles } from "../../src/themeContext";

export default function DealersScreen() {
  const router = useRouter();
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const { gridCols } = useResponsive();
  const [dealers, setDealers] = useState<any[]>(() => getCached("dealers", []));
  const [tools, setTools] = useState<any[]>(() => getCached("tools", []));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<any>({ name: "", phone: "", website: "", address: "", notes: "", route_frequency: "N/A", route_day_of_week: "", route_anchor_date: "" });

  const lockedDealerIds = useMemo(() => new Set<string>(), []);

  const atDealerLimit = false;

  const load = useCallback(async () => {
    const [d, t] = await Promise.all([api.listDealers(), api.listTools()]);
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

  const create = async () => {
    if (!form.name?.trim()) return;
    const payload = { ...form, name: form.name.trim() };
    const d = await api.createDealer(payload);
    setForm({ name: "", phone: "", website: "", address: "", notes: "", route_frequency: "N/A", route_day_of_week: "", route_anchor_date: "" });
    setShowAdd(false);
    router.push(`/dealer/${d.id}`);
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>DEALERS</Text>
          <Text style={styles.subtitle}>Companies & Sales Agents</Text>
        </View>
        <TouchableOpacity
          testID="add-dealer-header-btn"
          style={styles.headerAddBtn}
          onPress={() => setShowAdd(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color="#000" />
          <Text style={styles.headerAddBtnText}>ADD DEALER</Text>
        </TouchableOpacity>
      </View>

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
          const s = summaryFor(item.id);
          const cur =
            (item.agents || []).find((a: any) => a.id === item.current_agent_id) || null;
          const isLocked = lockedDealerIds.has(item.id);
          return (
            <TouchableOpacity
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
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.name.substring(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSub}>
                  {cur ? `Agent: ${cur.name}` : "No current agent"}
                </Text>
                <Text style={styles.rowMeta}>
                  {s.count} TOOL{s.count === 1 ? "" : "S"}
                  {prefs.show_prices ? `  ·  $${s.total.toFixed(2)}` : ""}
                  {`  ·  ${routeLabel(item)}`}
                </Text>
                {!!item.phone && (
                  <View style={styles.rowContactBtns}>
                    <TouchableOpacity
                      testID={`dealer-row-call-${item.id}`}
                      style={styles.rowContactBtn}
                      onPress={(e) => {
                        (e as any)?.stopPropagation?.();
                        openPhone(item.phone);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="call" size={12} color={theme.colors.accent} />
                      <Text style={styles.rowContactBtnText} numberOfLines={1}>
                        {formatPhone(item.phone)}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`dealer-row-text-${item.id}`}
                      style={[styles.rowContactBtn, styles.rowContactBtnSmall]}
                      onPress={(e) => {
                        (e as any)?.stopPropagation?.();
                        openSms(item.phone);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chatbubble-ellipses" size={12} color={theme.colors.accent} />
                      <Text style={styles.rowContactBtnText}>TEXT</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <TouchableOpacity
                testID={`delete-dealer-row-${item.id}`}
                onPress={(e) => {
                  // prevent row navigation
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (e as any)?.stopPropagation?.();
                  remove(item.id, item.name);
                }}
                hitSlop={10}
                style={styles.rowDeleteBtn}
              >
                <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
              </TouchableOpacity>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          );
        }}
      />

      {/* Add Dealer is now in the header (top-right) — bottom FAB removed. */}

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBg}
        >
          <ScrollView style={styles.modalCard} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>NEW DEALER</Text>
            {([
              { k: "name", placeholder: "Dealer name (e.g. Matco)*", focus: true, multiline: false },
              { k: "phone", placeholder: "Phone", focus: false, multiline: false },
              { k: "website", placeholder: "Website", focus: false, multiline: false },
              { k: "address", placeholder: "Address", focus: false, multiline: false },
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
                  setForm({ name: "", phone: "", website: "", address: "", notes: "", route_frequency: "N/A", route_day_of_week: "", route_anchor_date: "" });
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
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomColor: c.borderSubtle,
    borderBottomWidth: 1,
    gap: 12,
  },
  rowLocked: { opacity: 0.45 },
  rowGrid: {
    flex: 1,
    borderBottomWidth: 0,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    borderRadius: theme.radii.md,
    backgroundColor: c.surface,
    marginBottom: 12,
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
    gap: 6,
    marginTop: 6,
    flexWrap: "wrap",
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
  
    ...(theme.elevation.md as object),
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
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  chipText: {
    color: c.textSecondary,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  chipTextOn: { color: "#000" },
}));
