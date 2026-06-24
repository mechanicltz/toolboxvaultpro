import React from "react";
import { View, Text, TouchableOpacity, Modal, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { themedStyles } from "../themeContext";
import { theme } from "../theme";
import { api } from "../api";

/**
 * AddChooser — bottom-sheet shown when the user taps the "+" Add button.
 * Lets them choose between adding a single Item or a Set / Bundle.
 */
export function AddChooser({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  const go = (path: string) => {
    onClose();
    router.push(path as any);
  };

  const addItem = async () => {
    onClose();
    try {
      const created = await api.createTool({ name: "New Item" });
      router.push(`/tool/${created.id}?startEdit=1&startFresh=1` as any);
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    }
  };

  const addBundle = async () => {
    onClose();
    try {
      const created = await api.createTool({ name: "New Set", is_bundle: true });
      router.push(`/tool/${created.id}?startEdit=1&startFresh=1` as any);
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.bg} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>WHAT DO YOU WANT TO ADD?</Text>

          <TouchableOpacity testID="add-choose-item" style={styles.option} onPress={addItem}>
            <View style={[styles.iconWrap, { backgroundColor: theme.colors.accent + "1F" }]}>
              <Ionicons name="construct" size={22} color={theme.colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optTitle}>Add Item</Text>
              <Text style={styles.optSub}>A single tool or piece of inventory</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity testID="add-choose-bundle" style={styles.option} onPress={addBundle}>
            <View style={[styles.iconWrap, { backgroundColor: theme.colors.accent + "1F" }]}>
              <Ionicons name="cube" size={22} color={theme.colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optTitle}>Add Set / Bundle</Text>
              <Text style={styles.optSub}>A set (e.g. socket set) with its own part # & price</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = themedStyles((c) => ({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  title: { color: c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginBottom: 14 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: c.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: c.border,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  optTitle: { color: c.textPrimary, fontSize: 15, fontWeight: "800" },
  optSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  cancel: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  cancelText: { color: c.accent, fontWeight: "800", fontSize: 13 },
}));
