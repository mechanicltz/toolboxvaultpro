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
import * as Clipboard from "expo-clipboard";
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
import { themedStyles } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";
import { ShadowBox, ShadowBoxSubCard } from "../../src/components/ShadowBox";
import { EmailLink } from "../../src/components/EmailLink";
import { shareOrSaveAgent } from "../../src/utils/agentShare";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { PillButton } from "../../src/components/PillButton";

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
  // Tracks which row of the new consolidated details box is currently
  // expanded. Values: "accounts" | `agent:<id>` | null.
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
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
      <IndustrialBanner
        title={dealer.name}
        subtitle="Dealer Details"
        leftSlot={
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color="#F97316" />
          </TouchableOpacity>
        }
      />
      <View style={styles.detailActionsRowDealer}>
        <PillButton
          testID="edit-dealer-btn"
          label="EDIT"
          icon="create-outline"
          variant="active"
          onPress={() => {
            setEditForm({
              name: dealer.name,
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
          }}
        />
        <PillButton
          testID="delete-dealer-btn"
          label="DELETE"
          icon="trash-outline"
          variant="danger"
          onPress={removeDealer}
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.heroBox}>
          <Text style={styles.dealerName}>{dealer.name}</Text>
        </View>

        {/* Route info banner */}
        <ShadowBox style={styles.routeRow}>
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
        </ShadowBox>


        {/* TOOLS PURCHASED + COMPANY DETAILS — grouped together so contact info reads first, tools follow */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabelStrong}>COMPANY DETAILS</Text>
        </View>
        <ShadowBox style={styles.companyCard}>
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
        </ShadowBox>

        {/* DETAILS / ACCOUNTS / AGENTS — warranty-card-style consolidated
            box (matches the tool-detail screen's design). Tools-purchased
            and accounts rows tap to navigate / expand inline; each agent
            is its own expandable row that reveals their contact card. */}
        <ShadowBox style={styles.detailsBox} testID="dealer-details-box">
            {/* TOOLS PURCHASED row */}
            <TouchableOpacity
              style={styles.detailsRow}
              activeOpacity={0.6}
              testID="details-row-tools"
              onPress={() =>
                router.push(`/dealer/${id}/tools?name=${encodeURIComponent(dealer.name)}`)
              }
            >
              <Text style={styles.detailsLabel}>TOOLS PURCHASED</Text>
              <View style={styles.detailsValueWrap}>
                <Text style={styles.detailsValue} numberOfLines={1}>
                  ${total.toFixed(2)} · {tools.length} item{tools.length === 1 ? "" : "s"}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={theme.colors.textMuted}
                />
              </View>
            </TouchableOpacity>

            {/* ACCOUNTS row — expandable */}
            {(() => {
              const credit = Number(dealer?.credit_balance || 0);
              const personal = Number(dealer?.personal_balance || 0);
              const sum = credit + personal;
              const isOpen = expandedRow === "accounts";
              return (
                <View>
                  <TouchableOpacity
                    style={styles.detailsRow}
                    activeOpacity={0.6}
                    testID="details-row-accounts"
                    onPress={() => setExpandedRow(isOpen ? null : "accounts")}
                  >
                    <Text style={styles.detailsLabel}>ACCOUNTS</Text>
                    <View style={styles.detailsValueWrap}>
                      <Text style={styles.detailsValue} numberOfLines={1}>
                        ${sum.toFixed(2)}
                      </Text>
                      <Ionicons
                        name={isOpen ? "chevron-down" : "chevron-forward"}
                        size={14}
                        color={theme.colors.textMuted}
                      />
                    </View>
                  </TouchableOpacity>
                  {isOpen && (
                    <View style={styles.detailsExpanded}>
                      <BalanceSection dealer={dealer} onChange={load} />
                    </View>
                  )}
                </View>
              );
            })()}

            {/* AGENTS header — non-interactive divider row */}
            <View style={styles.detailsHeaderRow}>
              <Text style={styles.detailsHeaderLabel}>
                AGENTS ({allAgents.length})
              </Text>
              <PillButton
                testID="add-agent-btn"
                label="ADD"
                icon="add"
                variant="active"
                onPress={() => {
                  setAgentForm({ name: "", phone: "", email: "", location: "", notes: "" });
                }}
              />
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
                    <ShadowBoxSubCard style={styles.agentCard}>
                      {/* Business-card header — agent name */}
                      <View style={styles.bizHeader}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.bizName} numberOfLines={1}>{a.name}</Text>
                          {isCurrent && <Text style={styles.bizBadge}>CURRENT AGENT</Text>}
                        </View>
                        <TouchableOpacity
                          testID={`agent-share-${a.id}`}
                          style={styles.bizShareBtn}
                          onPress={() =>
                            shareOrSaveAgent(
                              {
                                name: a.name,
                                phone: a.phone,
                                email: a.email,
                                location: a.location,
                                notes: a.notes,
                              },
                              dealer?.name,
                            )
                          }
                          hitSlop={8}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="share-outline" size={18} color={theme.colors.accent} />
                        </TouchableOpacity>
                      </View>

                      {/* Phone — number shown as plain text with small call/text icon buttons */}
                      {!!a.phone && (
                        <View style={styles.bizRow}>
                          <Ionicons name="call" size={14} color={theme.colors.textMuted} style={styles.bizRowIcon} />
                          <Text style={styles.bizValue} numberOfLines={1}>{formatPhone(a.phone)}</Text>
                          <View style={styles.bizPhoneActions}>
                            <TouchableOpacity
                              testID={`agent-call-${a.id}`}
                              style={styles.bizIconBtn}
                              onPress={() => openPhone(a.phone)}
                              activeOpacity={0.7}
                              hitSlop={8}
                            >
                              <Ionicons name="call" size={14} color={theme.colors.accent} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              testID={`agent-text-${a.id}`}
                              style={styles.bizIconBtn}
                              onPress={() => openSms(a.phone)}
                              activeOpacity={0.7}
                              hitSlop={8}
                            >
                              <Ionicons name="chatbubble-ellipses" size={14} color={theme.colors.accent} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {/* Email — blue mailto link */}
                      {!!a.email && (
                        <View style={styles.bizRow}>
                          <Ionicons name="mail" size={14} color={theme.colors.textMuted} style={styles.bizRowIcon} />
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

                      <View style={styles.agentActions}>
                        {/* Per user (2026-05-26): EDIT button removed — the
                            agent row can be edited via the dealer-level edit
                            modal pencil in the header. Keeping SET CURRENT
                            and REMOVE here since they're agent-specific. */}
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
                    </ShadowBoxSubCard>
                  )}
                </View>
              );
            })}
          </ShadowBox>
        </ScrollView>

      {/* Edit dealer modal */}
      <Modal visible={editing} transparent animationType="slide">
        <View style={styles.modalBg}>
          <ScrollView style={styles.modalCard} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>EDIT DEALER</Text>
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
  agentCard: { paddingTop: 10, paddingBottom: 10, paddingHorizontal: 12 },
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
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    padding: 12,
    marginTop: 4,
    marginBottom: 8,
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
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    ...(theme.elevation.md as object),
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
