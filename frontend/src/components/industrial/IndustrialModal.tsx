/**
 * IndustrialModal — fullscreen overlay with a card / panel inside.
 */
import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useTBV } from "./TBVThemeContext";
import { IndustrialCard } from "./IndustrialCard";

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  width?: number | "auto";
}

export function IndustrialModal({ visible, onClose, children, closeOnBackdrop = true, width = "auto" }: Props) {
  const { palette } = useTBV();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: palette.overlay }]}
        onPress={closeOnBackdrop ? onClose : undefined}
      >
        <Pressable onPress={() => undefined} style={{ width: width === "auto" ? "100%" : width, maxWidth: 480 }}>
          <View style={styles.inner}>
            <IndustrialCard elevation="elevated" padding={20}>{children}</IndustrialCard>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  inner: { width: "100%" },
});
