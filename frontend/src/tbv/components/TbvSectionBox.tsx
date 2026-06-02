/**
 * TbvSectionBox — a titled, grouped content container (NOT an accordion).
 *
 * Use for stable groups like "Dealer Accounts", "Settings", "Profile".
 * Renders an optional header row (title + icon + right-slot, e.g. an enable/
 * disable toggle) above its children, on the `sectionBox` registry skin.
 * Supports Light + Dark automatically via useTbvTheme.
 */
import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TbvPanel } from "./TbvPanel";
import { useTbvTheme } from "../useTbvTheme";
import { TBV_FONT } from "../useTbvFonts";

interface Props {
  title?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Right-aligned slot in the header (toggle, button, count, etc.). */
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pad?: number;
}

export function TbvSectionBox({ title, icon, right, children, style, pad }: Props) {
  const { t } = useTbvTheme();
  const hasHeader = !!title || !!right;
  return (
    <TbvPanel skin="sectionBox" style={style} pad={pad}>
      {hasHeader && (
        <>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              {icon ? (
                <Ionicons name={icon} size={18} color={t.orange} style={{ marginRight: 8 }} />
              ) : null}
              {title ? (
                <Text style={[styles.title, { color: t.headSteel }]} numberOfLines={1}>
                  {title.toUpperCase()}
                </Text>
              ) : null}
            </View>
            {right ? <View>{right}</View> : null}
          </View>
          <View style={[styles.divider, { backgroundColor: t.divider }]} />
        </>
      )}
      <View>{children}</View>
    </TbvPanel>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: { flexDirection: "row", alignItems: "center", flex: 1 },
  title: { fontFamily: TBV_FONT.head, fontSize: 18, letterSpacing: 1.2 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 10, marginBottom: 12 },
});

export default TbvSectionBox;
