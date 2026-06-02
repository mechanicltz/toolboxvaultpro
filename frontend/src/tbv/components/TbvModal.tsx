/**
 * TbvModal — industrial modal / popup. Dimmed backdrop (tap to dismiss) with a
 * centered panel on the `modalPanel` skin. Native-text title in the TOOLBOX
 * VAULT treatment, optional close (X), body, and footer action slot.
 * Light + Dark aware.
 */
import React from "react";
import {
  Modal, View, Text, StyleSheet, Pressable, ImageBackground, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTbvTheme } from "../useTbvTheme";
import { TBV_FONT } from "../useTbvFonts";

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  /** Footer slot, e.g. <TbvButton .../>. */
  actions?: React.ReactNode;
  /** Dismiss when tapping the dimmed backdrop. Default true. */
  dismissOnBackdrop?: boolean;
}

export function TbvModal({
  visible, onClose, title, children, actions, dismissOnBackdrop = true,
}: Props) {
  const { t, skin, padOf } = useTbvTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.6)" }]}
        onPress={dismissOnBackdrop ? onClose : undefined}
      >
        <Pressable style={styles.cardWrap} onPress={() => {}}>
          <ImageBackground
            source={skin("modalPanel")}
            resizeMode="stretch"
            style={styles.card}
            imageStyle={styles.cardImg}
          >
            <View style={{ padding: padOf("modalPanel") }}>
              <View style={styles.header}>
                {title ? (
                  <Text style={[styles.title, { color: t.headSteel }]} numberOfLines={1}>
                    {title.toUpperCase()}
                  </Text>
                ) : <View />}
                <Pressable onPress={onClose} hitSlop={12}>
                  <Ionicons name="close" size={24} color={t.orange} />
                </Pressable>
              </View>
              <View style={[styles.divider, { backgroundColor: t.divider }]} />
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {children}
              </ScrollView>
              {actions ? <View style={styles.actions}>{actions}</View> : null}
            </View>
          </ImageBackground>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  cardWrap: { width: "100%", maxWidth: 460 },
  card: { width: "100%", borderRadius: 10, overflow: "hidden" },
  cardImg: { width: "100%", height: "100%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: TBV_FONT.head, fontSize: 20, letterSpacing: 1.4, flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 10, marginBottom: 12 },
  actions: { marginTop: 16, gap: 10 },
});

export default TbvModal;
