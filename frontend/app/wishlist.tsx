import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Linking,
  Platform,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { confirm } from "../src/confirm";

import { themedStyles } from "../src/themeContext";

const PRIORITIES = [
  { key: "low", label: "LOW", color: theme.colors.textMuted },
  { key: "normal", label: "NORMAL", color: theme.colors.accent },
  { key: "high", label: "HIGH", color: theme.colors.danger },
];

export default function WishlistScreen() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [showPurchased, setShowPurchased] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [dealers, setDealers] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const [list, dl] = await Promise.all([
        api.listWishlist(),
        api.listDealers(),
      ]);
      setItems(list);
      setDealers(dl);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const visible = items.filter((i) => !!i.purchased === showPurchased);
  const totalPlanned = items.filter((i) => !i.purchased).reduce((s, i) => s + (i.price || 0), 0);
  const totalSpent = items.filter((i) => i.purchased).reduce((s, i) => s + (i.price || 0), 0);
  const openCount = items.filter((i) => !i.purchased).length;
  const doneCount = items.length - openCount;

  const openLink = async (url?: string) => {
    if (!url) return;
    let normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) normalized = "https://" + normalized;
    try {
      if (Platform.OS === "web") {
        window.open(normalized, "_blank", "noopener");
      } else {
        await Linking.openURL(normalized);
      }
    } catch (e: any) {
      Alert.alert("Could not open link", e.message || String(e));
    }
  };

  const save = async () => {
    if (!editing?.name?.trim()) {
      Alert.alert("Name required", "Give your wish a name.");
      return;
    }
    const payload: any = {
      name: editing.name.trim(),
      url: (editing.url || "").trim(),
      description: editing.description || "",
      price: editing.price ? parseFloat(editing.price) || null : null,
      dealer_id: editing.dealer_id || null,
      priority: editing.priority || "normal",
      notes: editing.notes || "",
    };
    try {
      if (editing.id) {
        await api.updateWishlist(editing.id, payload);
      } else {
        await api.createWishlist(payload);
      }
      setEditing(null);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not save");
    }
  };

  const remove = async (item: any) => {
    if (!(await confirm("Delete wish?", item.name, "Delete", true))) return;
    await api.deleteWishlist(item.id);
    load();
  };

  const togglePurchased = async (item: any) => {
    await api.updateWishlist(item.id, { purchased: !item.purchased });
    load();
  };

  const convert = async (item: any) => {
    if (!(await confirm("Convert to tool?", `Add "${item.name}" to your inventory and mark as purchased.`, "Convert"))) return;
    try {
      const tool = await api.convertWishlist(item.id);
      load();
      router.push(`/tool/${tool.id}`);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not convert");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity testID="wishlist-back" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.title}>WISH LIST</Text>
          <Text style={styles.subtitle}>Tools you want · saved links</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <Stat label="Open" value={String(openCount)} />
        <Stat label="Planned" value={`$${totalPlanned.toFixed(0)}`} color={theme.colors.accent} />
        <Stat label="Bought" value={String(doneCount)} color={theme.colors.success} />
        <Stat label="Spent" value={`$${totalSpent.toFixed(0)}`} color={theme.colors.success} />
      </View>

      <View style={styles.toggleRow}>
        {[
          { k: false, label: "OPEN" },
          { k: true, label: "PURCHASED" },
        ].map((t) => (
          <TouchableOpacity
            key={String(t.k)}
            testID={`wish-tab-${t.k ? "done" : "open"}`}
            style={[styles.tabBtn, showPurchased === t.k && styles.tabBtnActive]}
            onPress={() => setShowPurchased(t.k)}
          >
            <Text style={[styles.tabText, showPurchased === t.k && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="heart-outline" size={64} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>{showPurchased ? "NOTHING PURCHASED YET" : "WISH LIST IS EMPTY"}</Text>
              <Text style={styles.emptyText}>Tap + to save links of tools you want to buy.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const meta = PRIORITIES.find((p) => p.key === (item.priority || "normal")) || PRIORITIES[1];
          return (
            <View style={styles.card} testID={`wish-card-${item.id}`}>
              <View style={styles.cardHead}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.name}
                </Text>
                <View style={[styles.priorityPill, { borderColor: meta.color }]}>
                  <Text style={[styles.priorityText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              {!!item.description && <Text style={styles.itemDesc}>{item.description}</Text>}
              <View style={styles.metaRow}>
                {!!item.price && (
                  <Text style={styles.priceText}>${item.price.toFixed(2)}</Text>
                )}
                {!!item.dealer_name && (
                  <Text style={styles.dealerText}>{item.dealer_name}</Text>
                )}
              </View>
              {!!item.notes && <Text style={styles.notesText}>{item.notes}</Text>}
              <View style={styles.actions}>
                {!!item.url && (
                  <TouchableOpacity
                    testID={`wish-open-${item.id}`}
                    style={styles.linkBtn}
                    onPress={() => openLink(item.url)}
                  >
                    <Ionicons name="open-outline" size={16} color={theme.colors.accentSecondary} />
                    <Text style={styles.linkText} numberOfLines={1}>OPEN LINK</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  testID={`wish-edit-${item.id}`}
                  style={styles.iconBtn}
                  onPress={() => setEditing({ ...item, price: item.price ? String(item.price) : "" })}
                >
                  <Ionicons name="create-outline" size={18} color={theme.colors.textPrimary} />
                </TouchableOpacity>
                {!item.purchased ? (
                  <>
                    <TouchableOpacity
                      testID={`wish-convert-${item.id}`}
                      style={[styles.iconBtn, { borderColor: theme.colors.accent }]}
                      onPress={() => convert(item)}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={theme.colors.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`wish-bought-${item.id}`}
                      style={[styles.iconBtn, { borderColor: theme.colors.success }]}
                      onPress={() => togglePurchased(item)}
                    >
                      <Ionicons name="checkmark" size={18} color={theme.colors.success} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    testID={`wish-restore-${item.id}`}
                    style={[styles.iconBtn, { borderColor: theme.colors.warning }]}
                    onPress={() => togglePurchased(item)}
                  >
                    <Ionicons name="arrow-undo" size={18} color={theme.colors.warning} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  testID={`wish-delete-${item.id}`}
                  style={[styles.iconBtn, { borderColor: theme.colors.danger }]}
                  onPress={() => remove(item)}
                >
                  <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                </TouchableOpacity>
              </View>
              {item.purchased && item.converted_tool_id && (
                <TouchableOpacity
                  testID={`wish-tool-link-${item.id}`}
                  onPress={() => router.push(`/tool/${item.converted_tool_id}`)}
                  style={styles.toolLink}
                >
                  <Ionicons name="construct" size={14} color={theme.colors.accent} />
                  <Text style={styles.toolLinkText}>VIEW TOOL ›</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      <TouchableOpacity
        testID="add-wish-fab"
        style={styles.fab}
        onPress={() => setEditing({ name: "", url: "", description: "", price: "", priority: "normal", notes: "", dealer_id: null })}
      >
        <Ionicons name="add" size={32} color="#000" />
      </TouchableOpacity>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBg}
        >
          <ScrollView style={styles.modalCard} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{editing?.id ? "EDIT WISH" : "NEW WISH"}</Text>

            <Text style={styles.label}>NAME *</Text>
            <TextInput
              testID="wish-name"
              placeholder="Snap-On 1/2 Impact"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={editing?.name || ""}
              onChangeText={(v) => setEditing({ ...editing, name: v })}
              autoFocus
            />

            <Text style={styles.label}>WEBSITE LINK</Text>
            <TextInput
              testID="wish-url"
              placeholder="https://..."
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={editing?.url || ""}
              onChangeText={(v) => setEditing({ ...editing, url: v })}
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text style={styles.label}>DESCRIPTION</Text>
            <TextInput
              testID="wish-desc"
              placeholder="Why you want it / specs"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { height: 70, textAlignVertical: "top" }]}
              value={editing?.description || ""}
              onChangeText={(v) => setEditing({ ...editing, description: v })}
              multiline
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>PRICE</Text>
                <TextInput
                  testID="wish-price"
                  placeholder="$0.00"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.input}
                  value={editing?.price || ""}
                  onChangeText={(v) => setEditing({ ...editing, price: v })}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>PRIORITY</Text>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {PRIORITIES.map((p) => (
                    <TouchableOpacity
                      key={p.key}
                      testID={`wish-prio-${p.key}`}
                      style={[
                        styles.prioChip,
                        editing?.priority === p.key && { backgroundColor: p.color, borderColor: p.color },
                      ]}
                      onPress={() => setEditing({ ...editing, priority: p.key })}
                    >
                      <Text
                        style={[
                          styles.prioChipText,
                          editing?.priority === p.key && { color: "#000" },
                        ]}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={styles.label}>DEALER</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <TouchableOpacity
                style={[styles.dealerChip, !editing?.dealer_id && styles.dealerChipActive]}
                onPress={() => setEditing({ ...editing, dealer_id: null })}
              >
                <Text style={[styles.dealerChipText, !editing?.dealer_id && styles.dealerChipTextActive]}>NONE</Text>
              </TouchableOpacity>
              {dealers.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.dealerChip,
                    editing?.dealer_id === d.id && styles.dealerChipActive,
                  ]}
                  onPress={() => setEditing({ ...editing, dealer_id: d.id })}
                >
                  <Text
                    style={[
                      styles.dealerChipText,
                      editing?.dealer_id === d.id && styles.dealerChipTextActive,
                    ]}
                  >
                    {d.name?.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>NOTES</Text>
            <TextInput
              testID="wish-notes"
              placeholder="Any notes"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { height: 70, textAlignVertical: "top" }]}
              value={editing?.notes || ""}
              onChangeText={(v) => setEditing({ ...editing, notes: v })}
              multiline
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setEditing(null)}>
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="wish-save-btn" style={styles.btn} onPress={save}>
                <Text style={styles.btnText}>{editing?.id ? "SAVE" : "ADD"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, borderBottomColor: c.border, borderBottomWidth: 1 },
  title: { color: c.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 2 },
  subtitle: { color: c.accent, fontSize: 7, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 },
  statRow: { flexDirection: "row", padding: 16, gap: 8 },
  statBox: {
    flex: 1,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: theme.radii.md,
    ...(theme.elevation.md as object),
  },
  statValue: { color: c.textPrimary, fontSize: 14, fontWeight: "900" },
  statLabel: { color: c.textMuted, fontSize: 7, fontWeight: "800", letterSpacing: 1, marginTop: 4 },
  toggleRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  tabBtn: {
    flex: 1, paddingVertical: 8, borderWidth: 1, borderColor: c.border,
    borderRadius: theme.radii.md, alignItems: "center", backgroundColor: c.bgSecondary,
  },
  tabBtnActive: { backgroundColor: c.accent, borderColor: c.accent },
  tabText: { color: c.textSecondary, fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  tabTextActive: { color: "#000" },
  empty: { alignItems: "center", marginTop: 60, paddingHorizontal: 40 },
  emptyTitle: { color: c.textPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 2, marginTop: 16 },
  emptyText: { color: c.textSecondary, fontSize: 10, textAlign: "center", marginTop: 8 },
  card: {
    backgroundColor: c.bgSecondary,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    ...(theme.elevation.md as object),
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  itemName: { flex: 1, color: c.textPrimary, fontSize: 12, fontWeight: "700" },
  priorityPill: { paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderRadius: 3 },
  priorityText: { fontSize: 7, fontWeight: "800", letterSpacing: 1 },
  itemDesc: { color: c.textSecondary, fontSize: 10, marginTop: 6 },
  metaRow: { flexDirection: "row", gap: 14, marginTop: 8 },
  priceText: { color: c.accent, fontSize: 10, fontWeight: "800" },
  dealerText: { color: c.textMuted, fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },
  notesText: { color: c.textMuted, fontSize: 8, fontStyle: "italic", marginTop: 6 },
  actions: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 10 },
  linkBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1,
    borderColor: c.accentSecondary, borderRadius: theme.radii.sm,
  },
  linkText: { color: c.accentSecondary, fontWeight: "800", fontSize: 8, letterSpacing: 1 },
  iconBtn: {
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: c.border, borderRadius: theme.radii.sm,
  },
  toolLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  toolLinkText: { color: c.accent, fontSize: 7, fontWeight: "800", letterSpacing: 1 },
  fab: {
    position: "absolute",
    bottom: 24, right: 24,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: c.accent,
    alignItems: "center", justifyContent: "center",
    ...(theme.elevation.accent as object),
  },
  modalBg: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: c.bgSecondary,
    padding: 20,
    borderTopWidth: 2,
    borderTopColor: c.accent,
    maxHeight: "90%",
  },
  modalTitle: { color: c.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 2, marginBottom: 12 },
  label: { color: c.textMuted, fontSize: 7, fontWeight: "800", letterSpacing: 1.5, marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1, borderColor: c.border,
    color: c.textPrimary, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: theme.radii.sm, fontSize: 10,
  },
  prioChip: {
    flex: 1, paddingHorizontal: 6, paddingVertical: 10,
    borderWidth: 1, borderColor: c.border,
    borderRadius: theme.radii.sm, alignItems: "center",
  },
  prioChipText: { color: c.textSecondary, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  dealerChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: c.border,
    borderRadius: theme.radii.sm,
  },
  dealerChipActive: { backgroundColor: c.accent, borderColor: c.accent },
  dealerChipText: { color: c.textSecondary, fontSize: 7, fontWeight: "800", letterSpacing: 1 },
  dealerChipTextActive: { color: "#000" },
  btn: {
    flex: 1, height: 48, alignItems: "center", justifyContent: "center",
    backgroundColor: c.accent, borderRadius: theme.radii.md,
    ...(theme.elevation.accent as object),
  },
  btnText: { color: "#000", fontWeight: "800", letterSpacing: 2, fontSize: 10 },
  btnGhost: {
    flex: 1, height: 48, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: c.border, borderRadius: theme.radii.md,
  },
  btnGhostText: { color: c.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 10 },
}));
