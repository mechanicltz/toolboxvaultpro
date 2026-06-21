import React from "react";
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../themeContext";

export type KebabItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Optional tint for the row (e.g. danger red for Delete). */
  color?: string;
  /** Renders a thin divider ABOVE this row (e.g. before Delete). */
  dividerAbove?: boolean;
  testID?: string;
};

/**
 * A small contextual "3-dots" popover menu that drops from the top-right,
 * matching the item-detail menu. Render it once per screen and toggle `visible`.
 * `topOffset` lets each screen line the card up just under its banner.
 */
export function KebabMenu({
  visible,
  onClose,
  items,
  topOffset = 150,
}: {
  visible: boolean;
  onClose: () => void;
  items: KebabItem[];
  topOffset?: number;
}) {
  const c = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { paddingTop: topOffset }]} onPress={onClose}>
        <View
          style={[styles.card, { backgroundColor: c.bgSecondary, borderColor: c.border }]}
        >
          {items.map((it, idx) => (
            <React.Fragment key={it.testID || it.label}>
              {it.dividerAbove && idx > 0 && (
                <View style={[styles.divider, { backgroundColor: c.border }]} />
              )}
              <TouchableOpacity
                testID={it.testID}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => {
                  onClose();
                  // Defer so the menu dismissal doesn't clash with opening
                  // another modal / navigation on iOS.
                  setTimeout(it.onPress, 280);
                }}
              >
                <Ionicons name={it.icon} size={18} color={it.color || c.textPrimary} />
                <Text style={[styles.rowText, { color: it.color || c.textPrimary }]}>
                  {it.label}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingRight: 12,
    alignItems: "flex-end",
  },
  card: {
    minWidth: 232,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowText: { fontSize: 15, fontWeight: "600" },
  divider: { height: 1, marginVertical: 4, marginHorizontal: 8 },
});

export default KebabMenu;
