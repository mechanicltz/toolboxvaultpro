import { useCallback } from "react";
import { View, Text, TouchableOpacity, Modal, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import { themedStyles } from "../themeContext";
import { api } from "../api";

/**
 * Prefilled / demo data removal choice modal.
 *
 * Lets the user either keep their taxonomy (dealers, locations, tags &
 * categories) or wipe everything. Self-contained: calls the backend and
 * surfaces a success/error alert, then notifies the parent via onRemoved so it
 * can refresh its "demo present" state.
 */
export function RemovePrefilledModal({
  visible,
  onClose,
  onRemoved,
}: {
  visible: boolean;
  onClose: () => void;
  onRemoved?: () => void;
}) {
  const runClearDemo = useCallback(
    async (mode: "everything" | "keep_taxonomy") => {
      onClose();
      try {
        await api.demoClear(mode);
        onRemoved?.();
        Alert.alert(
          "Prefilled Data Removed",
          mode === "everything"
            ? "All sample data — including dealers, locations, tags & categories — has been deleted."
            : "Sample tools, claims and other demo records were removed. Your dealers, locations, tags & categories were kept.",
        );
      } catch {
        Alert.alert("Couldn't Remove", "Something went wrong. Please try again.");
      }
    },
    [onClose, onRemoved],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard} testID="prefilled-choice">
          <View style={styles.modalHeader}>
            <Ionicons name="sparkles" size={20} color={theme.colors.accent} />
            <Text style={styles.modalTitle}>REMOVE PRELOADED DATA</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalBody}>
            Choose how much of the sample data to remove. This can&apos;t be undone.
          </Text>
          <TouchableOpacity
            testID="prefilled-keep"
            style={styles.optBtn}
            activeOpacity={0.85}
            onPress={() => runClearDemo("keep_taxonomy")}
          >
            <Ionicons name="albums-outline" size={18} color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.optTitle}>Keep My Setup</Text>
              <Text style={styles.optSub}>
                Remove demo tools, claims & contacts — keep dealers, locations, tags & categories
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            testID="prefilled-everything"
            style={styles.optBtn}
            activeOpacity={0.85}
            onPress={() => runClearDemo("everything")}
          >
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.optTitle, { color: theme.colors.danger }]}>Remove Everything</Text>
              <Text style={styles.optSub}>
                Wipe all sample data including dealers, locations, tags & categories — start blank
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.85} onPress={onClose}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles((c) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: c.bgSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 20,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  modalTitle: { flex: 1, color: c.textPrimary, fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  modalBody: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
  optBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.canvas,
  },
  optTitle: { color: c.textPrimary, fontSize: 14, fontWeight: "800" },
  optSub: { color: c.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  cancelBtn: { marginTop: 12, paddingVertical: 12, alignItems: "center" },
  cancelText: { color: c.textSecondary, fontWeight: "800", letterSpacing: 1 },
}));
