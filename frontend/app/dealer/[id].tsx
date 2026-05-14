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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
import { themedStyles } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";

import {
  isDeviceContactsAvailable,
  loadAllDeviceContactsAndroid,
  pickContactNativeIOS,
  PickedContact,
} from "../../src/deviceContacts";

export default function DealerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const [dealer, setDealer] = useState<any>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [agentForm, setAgentForm] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});

  // Device contacts picker for agents
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<PickedContact[]>([]);
  const [pickerFilter, setPickerFilter] = useState("");
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
      const [d, t] = await Promise.all([api.getDealer(id), api.listTools({ dealer_id: id })]);
      setDealer(d);
      setTools(t);
    } catch {
      router.back();
    }
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!dealer) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: theme.colors.textPrimary, padding: 20 }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const cur = (dealer.agents || []).find((a: any) => a.id === dealer.current_agent_id);
  const allAgents = (dealer.agents || []).slice().sort((a: any, b: any) => {
    if (a.id === dealer.current_agent_id) return -1;
    if (b.id === dealer.current_agent_id) return 1;
    return 0;
  });
  const total = tools.reduce((s, t) => {
    const cost = Number(t.cost) || 0;
    const qty = Math.max(1, Number(t.quantity) || 1);
    return s + cost * qty;
  }, 0);
  const cats = new Set(tools.map((t) => t.category_name).filter(Boolean));
  const tags = new Set(tools.flatMap((t) => t.tag_names || []));

  const saveDealer = async () => {
    await api.updateDealer(id!, editForm);
    setEditing(false);
    setEditForm({});
    load();
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <TouchableOpacity
            testID="edit-dealer-btn"
            onPress={() => {
              setEditForm({
                name: dealer.name,
                phone: dealer.phone || "",
                website: dealer.website || "",
                address: dealer.address || "",
                notes: dealer.notes || "",
                route_frequency: dealer.route_frequency || "N/A",
                route_day_of_week: dealer.route_day_of_week || "",
                route_anchor_date: dealer.route_anchor_date || "",
              });
              setEditing(true);
            }}
            hitSlop={10}
          >
            <Ionicons name="create-outline" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity testID="delete-dealer-btn" onPress={removeDealer} hitSlop={10}>
            <Ionicons name="trash-outline" size={24} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.heroBox}>
          <Text style={styles.dealerName}>{dealer.name}</Text>
        </View>

        {/* Route info banner */}
        <BevelCard style={styles.routeRow}>
          <Ionicons name="map" size={18} color={theme.colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.routeRowLabel}>ROUTE  ·  {routeLabel(dealer)}</Text>
            {!!nextRouteText(dealer) && (
              <Text style={styles.routeRowNext}>Next: {nextRouteText(dealer)}</Text>
            )}
            {!nextRouteText(dealer) && (
              <Text style={styles.routeRowEmpty}>No route configured — tap edit to add</Text>
            )}
          </View>
        </BevelCard>

        {/* AGENTS — placed at top per user preference */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabelStrong}>AGENTS ({(dealer.agents || []).length})</Text>
          <TouchableOpacity
            testID="add-agent-btn"
            style={styles.addBtn}
            onPress={() => {
              setAgentForm({ name: "", phone: "", email: "", notes: "" });
            }}
          >
            <Ionicons
              name="add"
              size={16}
              color={theme.colors.accent}
            />
            <Text style={styles.addBtnText}>
              ADD
            </Text>
          </TouchableOpacity>
        </View>
        {allAgents.length === 0 && (
          <Text style={styles.empty}>No agents yet. Add one to get started.</Text>
        )}
        {allAgents.map((a: any) => {
          const isCurrent = a.id === dealer.current_agent_id;
          return (
            <BevelCard
              key={a.id}
              style={[styles.agentCard, isCurrent && styles.agentCardActive]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {isCurrent && (
                  <View style={styles.currentBadge}>
                    <Ionicons name="star" size={10} color="#000" />
                    <Text style={styles.currentBadgeText}>CURRENT</Text>
                  </View>
                )}
                <Text style={styles.agentName}>{a.name}</Text>
              </View>
              {!!a.phone && (
                <View style={styles.agentContactRow}>
                  <TouchableOpacity
                    testID={`agent-call-${a.id}`}
                    style={styles.agentContactBtn}
                    onPress={() => openPhone(a.phone)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="call" size={13} color={theme.colors.accent} />
                    <Text style={styles.agentContactText} numberOfLines={1}>{formatPhone(a.phone)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`agent-text-${a.id}`}
                    style={[styles.agentContactBtn, styles.agentContactBtnSmall]}
                    onPress={() => openSms(a.phone)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chatbubble-ellipses" size={13} color={theme.colors.accent} />
                    <Text style={styles.agentContactText}>TEXT</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!!a.email && (
                <TouchableOpacity
                  testID={`agent-email-${a.id}`}
                  style={styles.agentContactBtn}
                  onPress={() => openEmail(a.email)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="mail" size={13} color={theme.colors.accent} />
                  <Text style={styles.agentContactText} numberOfLines={1}>{a.email}</Text>
                </TouchableOpacity>
              )}
              {!!a.notes && <Text style={styles.agentMeta}>{a.notes}</Text>}
              {a.ended_at && !isCurrent && (
                <Text style={styles.agentMeta}>Ended: {formatDateUS(a.ended_at)}</Text>
              )}
              <View style={styles.agentActions}>
                <TouchableOpacity
                  testID={`edit-agent-${a.id}`}
                  style={styles.agentActionBtn}
                  onPress={() => setAgentForm({
                    id: a.id,
                    name: a.name || "",
                    phone: a.phone || "",
                    email: a.email || "",
                    notes: a.notes || "",
                  })}
                >
                  <Ionicons name="create-outline" size={16} color={theme.colors.accent} />
                  <Text style={styles.agentActionText}>EDIT</Text>
                </TouchableOpacity>
                {!isCurrent && (
                  <TouchableOpacity
                    testID={`set-current-${a.id}`}
                    style={styles.agentActionBtn}
                    onPress={() => setCurrent(a.id)}
                  >
                    <Ionicons name="star-outline" size={16} color={theme.colors.accent} />
                    <Text style={styles.agentActionText}>SET CURRENT</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  testID={`remove-agent-${a.id}`}
                  style={[styles.agentActionBtn, { borderColor: theme.colors.danger }]}
                  onPress={() => removeAgent(a.id, a.name)}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                  <Text style={[styles.agentActionText, { color: theme.colors.danger }]}>REMOVE</Text>
                </TouchableOpacity>
              </View>
            </BevelCard>
          );
        })}

        {/* TOOLS PURCHASED — collapsed into a button that opens the full list */}
        <View style={styles.toolsHeader}>
          <Text style={styles.sectionLabelStrong}>
            TOOLS PURCHASED FROM {dealer.name.toUpperCase()}
          </Text>
          <View style={styles.totalPill}>
            <Text style={styles.totalPillLabel}>TOTAL SPENT</Text>
            <Text style={styles.totalPillValue}>${total.toFixed(2)}</Text>
          </View>
        </View>
        <BevelCard
          testID="view-dealer-tools-btn"
          style={styles.viewToolsBtn}
          onPress={() =>
            router.push(`/dealer/${id}/tools?name=${encodeURIComponent(dealer.name)}`)
          }
          activeOpacity={0.85}
        >
          <View style={styles.viewToolsIcon}>
            <Ionicons name="construct" size={20} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.viewToolsTitle}>
              {tools.length === 0
                ? "No tools assigned yet"
                : tools.length === 1
                ? "View 1 purchased tool"
                : `View ${tools.length} purchased tools`}
            </Text>
            <Text style={styles.viewToolsSub}>
              {tools.length === 0
                ? "Assign a dealer to a tool to see it here"
                : `Tap to browse the full list  ·  Total $${total.toFixed(2)}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
        </BevelCard>

        <Text style={styles.sectionLabel}>CONTACT</Text>
        {!!dealer.phone && (
          <View style={styles.dealerContactPhoneRow}>
            <BevelCard
              testID="dealer-call-btn"
              style={styles.dealerContactBtn}
              onPress={() => openPhone(dealer.phone)}
              activeOpacity={0.7}
            >
              <Ionicons name="call" size={16} color={theme.colors.accent} />
              <Text style={styles.dealerContactBtnText} numberOfLines={1}>
                {formatPhone(dealer.phone)}
              </Text>
            </BevelCard>
            <BevelCard
              testID="dealer-text-btn"
              style={[styles.dealerContactBtn, styles.dealerContactBtnSmall]}
              onPress={() => openSms(dealer.phone)}
              activeOpacity={0.7}
            >
              <Ionicons name="chatbubble-ellipses" size={16} color={theme.colors.accent} />
              <Text style={styles.dealerContactBtnText}>TEXT</Text>
            </BevelCard>
          </View>
        )}
        <ContactRow icon="globe" label={dealer.website} onPress={() => callOrEmail(dealer.website)} />
        <ContactRow icon="location" label={dealer.address} />
        {!!dealer.notes && (
          <View style={[styles.contactRow, { alignItems: "flex-start" }]}>
            <Ionicons name="document-text-outline" size={18} color={theme.colors.accent} />
            <Text style={[styles.contactText, { flex: 1 }]}>{dealer.notes}</Text>
          </View>
        )}

        {/* Payment Accounts — moved to bottom */}
        <BalanceSection dealer={dealer} onChange={load} />
      </ScrollView>

      {/* Edit dealer modal */}
      <Modal visible={editing} transparent animationType="slide">
        <View style={styles.modalBg}>
          <ScrollView style={styles.modalCard} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>EDIT DEALER</Text>
            {(["name", "phone", "website", "address", "notes"] as const).map((k) => (
              <TextInput
                key={k}
                testID={`edit-dealer-${k}`}
                placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, k === "notes" && { height: 80 }]}
                value={editForm[k] || ""}
                onChangeText={(v) => setEditForm({ ...editForm, [k]: v })}
                multiline={k === "notes"}
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

      {/* Add / edit agent modal */}
      <Modal visible={!!agentForm} transparent animationType="slide" onRequestClose={() => setAgentForm(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBg}
        >
          <ScrollView style={styles.modalCard} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{agentForm?.id ? "EDIT AGENT" : "NEW AGENT"}</Text>
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
            {(["name", "phone", "email", "notes"] as const).map((k) => (
              <TextInput
                key={k}
                testID={`agent-${k}`}
                placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, k === "notes" && { height: 80 }]}
                value={agentForm?.[k] || ""}
                onChangeText={(v) => setAgentForm({ ...agentForm, [k]: v })}
                multiline={k === "notes"}
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

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  heroBox: { alignItems: "center", paddingVertical: 16 },
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
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  editChipText: {
    color: c.textSecondary,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  editChipTextOn: { color: "#000" },
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
  dealerName: { color: c.textPrimary, fontSize: 18, fontWeight: "900", letterSpacing: 1, marginTop: 12 },
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
    backgroundColor: c.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    alignItems: "center",
    marginTop: 12,
  },
  totalPillLabel: {
    color: "#000",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  totalPillValue: {
    color: "#000",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
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
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexWrap: "wrap",
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
  agentCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bgSecondary,
    borderRadius: 4,
  
    ...(theme.elevation.md as object),
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
    backgroundColor: c.accent,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 2,
  },
  currentBadgeText: { color: "#000", fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  agentName: { color: c.textPrimary, fontWeight: "700", fontSize: 12, marginTop: 6 },
  agentMeta: { color: c.textSecondary, fontSize: 9, marginTop: 2 },
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
}));
