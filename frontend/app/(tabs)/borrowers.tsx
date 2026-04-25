import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";

export default function BorrowersScreen() {
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");

  const load = useCallback(async () => {
    const [b, t] = await Promise.all([
      api.listBorrowers(),
      api.listTools({ checked_out: true }),
    ]);
    setBorrowers(b);
    setTools(t);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const add = async () => {
    if (!name.trim()) return;
    await api.createBorrower({ name: name.trim(), contact: contact.trim() });
    setName("");
    setContact("");
    setShowAdd(false);
    load();
  };

  const remove = (id: string, n: string) => {
    Alert.alert("Delete person?", `Remove ${n} from your list?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api.deleteBorrower(id);
          load();
        },
      },
    ]);
  };

  const toolsByBorrower = (borrowerName: string) =>
    tools.filter(
      (t) =>
        t.current_checkout?.borrower_name?.toLowerCase() ===
        borrowerName.toLowerCase()
    );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>PEOPLE</Text>
        <Text style={styles.subtitle}>Borrowers & Checkouts</Text>
      </View>

      {tools.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CURRENTLY CHECKED OUT</Text>
          {tools.map((t) => (
            <View key={t.id} style={styles.checkedOutRow}>
              <Ionicons name="alert-circle" size={16} color={theme.colors.accentSecondary} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.checkedOutTool}>{t.name}</Text>
                <Text style={styles.checkedOutBy}>
                  with {t.current_checkout?.borrower_name}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SAVED PEOPLE ({borrowers.length})</Text>
      </View>

      <FlatList
        data={borrowers}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>No saved people. Add some to speed up checkout.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const active = toolsByBorrower(item.name);
          return (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                {!!item.contact && (
                  <Text style={styles.rowSub}>{item.contact}</Text>
                )}
                <Text style={styles.rowMeta}>
                  {active.length > 0
                    ? `Has ${active.length} tool${active.length > 1 ? "s" : ""}`
                    : "No active checkouts"}
                </Text>
              </View>
              <TouchableOpacity
                testID={`delete-borrower-${item.id}`}
                onPress={() => remove(item.id, item.name)}
                hitSlop={10}
              >
                <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <TouchableOpacity
        testID="add-borrower-fab"
        style={styles.fab}
        onPress={() => setShowAdd(true)}
      >
        <Ionicons name="person-add" size={26} color="#000" />
      </TouchableOpacity>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>NEW PERSON</Text>
            <TextInput
              testID="borrower-name-input"
              placeholder="Full name"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={name}
              onChangeText={setName}
            />
            <TextInput
              testID="borrower-contact-input"
              placeholder="Phone / email (optional)"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={contact}
              onChangeText={setContact}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => {
                  setShowAdd(false);
                  setName("");
                  setContact("");
                }}
              >
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="save-borrower-btn"
                style={styles.btn}
                onPress={add}
              >
                <Text style={styles.btnText}>SAVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
  },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  section: { paddingHorizontal: 20, paddingVertical: 8 },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  checkedOutRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bgSecondary,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accentSecondary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  checkedOutTool: { color: theme.colors.textPrimary, fontWeight: "700", fontSize: 14 },
  checkedOutBy: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
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
    fontSize: 18,
  },
  rowTitle: { color: theme.colors.textPrimary, fontWeight: "700", fontSize: 16 },
  rowSub: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  rowMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 2,
    textTransform: "uppercase",
  },
  empty: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 40 },
  emptyText: {
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: 12,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 24,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
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
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  btn: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  btnText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 14,
  },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  btnGhostText: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    letterSpacing: 2,
    fontSize: 14,
  },
});
