import { useCallback, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { usePrefs } from "../../src/prefs";
import { confirm } from "../../src/confirm";

export default function DealerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { prefs } = usePrefs();
  const [dealer, setDealer] = useState<any>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [agentForm, setAgentForm] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});

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
  const total = tools.reduce((s, t) => s + (t.cost || 0), 0);
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
    await api.addAgent(id!, agentForm);
    setAgentForm(null);
    load();
  };

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

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.heroBox}>
          <View style={styles.bigAvatar}>
            <Text style={styles.bigAvatarText}>
              {dealer.name.substring(0, 2).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.dealerName}>{dealer.name}</Text>
        </View>

        <View style={styles.summaryGrid}>
          <Cell label="Tools" value={String(tools.length)} />
          {prefs.show_prices && <Cell label="Spent" value={`$${total.toFixed(0)}`} />}
          <Cell label="Categories" value={String(cats.size)} />
          <Cell label="Tags" value={String(tags.size)} />
          <Cell label="Agents" value={String((dealer.agents || []).length)} />
        </View>

        <Text style={styles.sectionLabel}>CONTACT</Text>
        <ContactRow icon="call" label={dealer.phone} onPress={() => callOrEmail(dealer.phone)} />
        <ContactRow icon="globe" label={dealer.website} onPress={() => callOrEmail(dealer.website)} />
        <ContactRow icon="location" label={dealer.address} />
        {!!dealer.notes && (
          <View style={[styles.contactRow, { alignItems: "flex-start" }]}>
            <Ionicons name="document-text-outline" size={18} color={theme.colors.accent} />
            <Text style={[styles.contactText, { flex: 1 }]}>{dealer.notes}</Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>AGENTS ({(dealer.agents || []).length})</Text>
          <TouchableOpacity
            testID="add-agent-btn"
            style={styles.addBtn}
            onPress={() => setAgentForm({ name: "", phone: "", email: "", notes: "" })}
          >
            <Ionicons name="add" size={16} color={theme.colors.accent} />
            <Text style={styles.addBtnText}>ADD</Text>
          </TouchableOpacity>
        </View>
        {allAgents.length === 0 && (
          <Text style={styles.empty}>No agents yet. Add one to get started.</Text>
        )}
        {allAgents.map((a: any) => {
          const isCurrent = a.id === dealer.current_agent_id;
          return (
            <View
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
                <TouchableOpacity onPress={() => callOrEmail(a.phone)}>
                  <Text style={styles.agentMeta}>📞 {a.phone}</Text>
                </TouchableOpacity>
              )}
              {!!a.email && (
                <TouchableOpacity onPress={() => callOrEmail(a.email)}>
                  <Text style={styles.agentMeta}>✉️ {a.email}</Text>
                </TouchableOpacity>
              )}
              {!!a.notes && <Text style={styles.agentMeta}>{a.notes}</Text>}
              {a.ended_at && !isCurrent && (
                <Text style={styles.agentMeta}>Ended: {a.ended_at.substring(0, 10)}</Text>
              )}
              <View style={styles.agentActions}>
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
            </View>
          );
        })}

        <Text style={styles.sectionLabel}>TOOLS PURCHASED FROM {dealer.name.toUpperCase()}</Text>
        {tools.length === 0 ? (
          <Text style={styles.empty}>No tools assigned yet.</Text>
        ) : (
          tools.map((t) => (
            <TouchableOpacity
              key={t.id}
              testID={`dealer-tool-${t.id}`}
              style={styles.toolRow}
              onPress={() => router.push(`/tool/${t.id}`)}
            >
              <View>
                <Text style={styles.toolName}>{t.name}</Text>
                <Text style={styles.toolMeta}>
                  {t.purchased_from_agent_name
                    ? `Bought from ${t.purchased_from_agent_name}`
                    : "No agent recorded"}
                  {prefs.show_prices && t.cost ? `  ·  $${t.cost.toFixed(2)}` : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ))
        )}
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

      {/* Add agent modal */}
      <Modal visible={!!agentForm} transparent animationType="slide">
        <View style={styles.modalBg}>
          <ScrollView style={styles.modalCard} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>NEW AGENT</Text>
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
                <Text style={styles.btnText}>ADD</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  heroBox: { alignItems: "center", paddingVertical: 16 },
  bigAvatar: {
    width: 80,
    height: 80,
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  bigAvatarText: {
    color: theme.colors.accent,
    fontWeight: "900",
    fontSize: 26,
    letterSpacing: 2,
  },
  dealerName: { color: theme.colors.textPrimary, fontSize: 24, fontWeight: "900", letterSpacing: 1, marginTop: 12 },
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
  cellValue: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 18 },
  cellLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 2,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
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
    borderColor: theme.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    marginTop: 12,
  },
  addBtnText: {
    color: theme.colors.accent,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 1,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
  },
  contactText: { color: theme.colors.textPrimary, fontSize: 14 },
  agentCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgSecondary,
    borderRadius: 4,
  },
  agentCardActive: {
    borderColor: theme.colors.accent,
    borderLeftWidth: 4,
    backgroundColor: "rgba(255,179,0,0.06)",
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
    borderColor: theme.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  agentActionText: {
    color: theme.colors.accent,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 1,
  },
  currentAgent: {
    marginHorizontal: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(255,179,0,0.08)",
    borderRadius: 4,
  },
  currentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.accent,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 2,
  },
  currentBadgeText: { color: "#000", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  agentName: { color: theme.colors.textPrimary, fontWeight: "700", fontSize: 16, marginTop: 6 },
  agentMeta: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  agentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
  },
  toolRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
  },
  toolName: { color: theme.colors.textPrimary, fontWeight: "700", fontSize: 14 },
  toolMeta: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  empty: { color: theme.colors.textMuted, fontStyle: "italic", padding: 20 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 24,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
    maxHeight: "85%",
  },
  modalTitle: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: "900", letterSpacing: 2, marginBottom: 16 },
  input: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    borderRadius: 4,
    marginBottom: 10,
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
});
