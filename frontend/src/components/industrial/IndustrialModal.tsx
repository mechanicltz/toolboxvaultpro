/**
 * IndustrialModal — full-screen overlay panel wrapped in IndustrialPanel.
 * Provides the bolted-frame container for any modal/popup content.
 */
import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { IndustrialPanel } from "./IndustrialPanel";
import { useIndustrialTheme } from "./IndustrialThemeContext";

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
}

export function IndustrialModal({ visible, onClose, children, closeOnBackdrop = true }: Props) {
  const { mode } = useIndustrialTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[
          styles.backdrop,
          { backgroundColor: mode === "light" ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.78)" },
        ]}
        onPress={closeOnBackdrop ? onClose : undefined}
      >
        <Pressable onPress={() => undefined}>
          <View style={styles.inner}>
            <IndustrialPanel>{children}</IndustrialPanel>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  inner: { width: "100%", maxWidth: 480 },
});
