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
  }, []);

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
        <Text style={styles.title}>DEALERS</Text>
        <Text style={styles.subtitle}>Companies & Sales Agents</Text>
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
                if (isLocked) {
                  upgrade.show({
                    title: "Dealer Locked",
                    message:
                      "This dealer is beyond the Free plan limit (1 dealer). Upgrade to access all your dealers.",
                  });
                  return;
                }
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

      <TouchableOpacity
        testID="add-dealer-fab"
        style={styles.fab}
        onPress={() => {
          setShowAdd(true);
        }}
      >
        <Ionicons name="add" size={28} color="#000" />
      </TouchableOpacity>

      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalBg}>
          <ScrollView style={styles.modalCard} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>NEW DEALER</Text>
            {([
              { k: "name", placeholder: "Dealer name (e.g. Matco)*", focus: true },
              { k: "phone", placeholder: "Phone" },
              { k: "website", placeholder: "Website" },
              { k: "address", placeholder: "Address" },
              { k: "notes", placeholder: "Notes", multiline: true },
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
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  title: { color: theme.colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: 2 },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 11,
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
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
    gap: 12,
  },
  rowLocked: { opacity: 0.45 },
  rowGrid: {
    flex: 1,
    borderBottomWidth: 0,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  avatarText: {
    color: theme.colors.accent,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 1,
  },
  rowTitle: { color: theme.colors.textPrimary, fontWeight: "700", fontSize: 16 },
  rowSub: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  rowMeta: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 4,
  },
  rowDeleteBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
    marginRight: 4,
  },
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 40 },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 16,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
  fab: {
    position: "absolute",
    bottom: 30,
    right: 24,
    width: 56,
    height: 56,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  fabLocked: { backgroundColor: theme.colors.warning },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 24,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
    maxHeight: "85%",
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 16,
  },
  input: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 4,
    marginBottom: 12,
    fontSize: 15,
  },
  btn: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  btnText: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  btnGhostText: { color: theme.colors.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 14 },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 4,
  },
  fieldHint: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontStyle: "italic",
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
    borderRadius: 4,
  },
  chipOn: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  chipText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  chipTextOn: { color: "#000" },
});
