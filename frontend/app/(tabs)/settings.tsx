import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";

type Mode = "location" | "tag" | null;

export default function SettingsScreen() {
  const [locations, setLocations] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const [l, t] = await Promise.all([api.listLocations(), api.listTags()]);
    setLocations(l);
    setTags(t);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const add = async () => {
    if (!name.trim()) return;
    if (mode === "location") await api.createLocation({ name: name.trim() });
    if (mode === "tag") await api.createTag({ name: name.trim() });
    setName("");
    setMode(null);
    load();
  };

  const remove = (kind: "location" | "tag", id: string, n: string) => {
    Alert.alert(`Delete ${kind}?`, `Remove "${n}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (kind === "location") await api.deleteLocation(id);
          if (kind === "tag") await api.deleteTag(id);
          load();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>SETTINGS</Text>
        <Text style={styles.subtitle}>Locations & Tags</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>LOCATIONS ({locations.length})</Text>
          <TouchableOpacity
            testID="add-location-btn"
            style={styles.addBtn}
            onPress={() => setMode("location")}
          >
            <Ionicons name="add" size={18} color={theme.colors.accent} />
            <Text style={styles.addBtnText}>ADD</Text>
          </TouchableOpacity>
        </View>
        {locations.length === 0 ? (
          <Text style={styles.empty}>No locations. Add one (Garage, Toolbox, Shed...).</Text>
        ) : (
          locations.map((l) => (
            <View key={l.id} style={styles.row}>
              <Ionicons name="location" size={18} color={theme.colors.accent} />
              <Text style={styles.rowText}>{l.name}</Text>
              <TouchableOpacity
                testID={`del-location-${l.id}`}
                onPress={() => remove("location", l.id, l.name)}
                hitSlop={10}
              >
                <Ionicons name="close" size={20} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={[styles.sectionHeader, { marginTop: 32 }]}>
          <Text style={styles.sectionLabel}>TAGS ({tags.length})</Text>
          <TouchableOpacity
            testID="add-tag-btn"
            style={styles.addBtn}
            onPress={() => setMode("tag")}
          >
            <Ionicons name="add" size={18} color={theme.colors.accent} />
            <Text style={styles.addBtnText}>ADD</Text>
          </TouchableOpacity>
        </View>
        {tags.length === 0 ? (
          <Text style={styles.empty}>No tags. Add one (Power, Hand, Cordless...).</Text>
        ) : (
          <View style={styles.tagWrap}>
            {tags.map((t) => (
              <TouchableOpacity
                key={t.id}
                testID={`del-tag-${t.id}`}
                style={styles.tagChip}
                onLongPress={() => remove("tag", t.id, t.name)}
                onPress={() => remove("tag", t.id, t.name)}
              >
                <Text style={styles.tagChipText}>{t.name}</Text>
                <Ionicons name="close" size={14} color={theme.colors.accent} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.tip}>
          Tap a tag to delete. Long-press for confirmation.
        </Text>
      </ScrollView>

      <Modal visible={mode !== null} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              NEW {mode === "location" ? "LOCATION" : "TAG"}
            </Text>
            <TextInput
              testID="settings-name-input"
              placeholder={mode === "location" ? "e.g. Garage Workbench" : "e.g. Power Tool"}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={name}
              onChangeText={setName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => {
                  setMode(null);
                  setName("");
                }}
              >
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="settings-save-btn" style={styles.btn} onPress={add}>
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
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { color: theme.colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: 2 },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
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
  },
  addBtnText: {
    color: theme.colors.accent,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 6,
    gap: 12,
    borderRadius: 4,
  },
  rowText: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: "600", flex: 1 },
  empty: { color: theme.colors.textMuted, fontStyle: "italic" },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(255,179,0,0.15)",
    borderRadius: 4,
  },
  tagChipText: {
    color: theme.colors.accent,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  tip: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 12,
    fontStyle: "italic",
  },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
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
  btnGhostText: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    letterSpacing: 2,
    fontSize: 14,
  },
});
