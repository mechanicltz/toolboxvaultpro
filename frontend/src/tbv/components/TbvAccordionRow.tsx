/**
 * TbvAccordionRow — a single reusable row inside a TbvAccordion (or any list).
 *
 * Designed to be stamped out 1–400 times with stable height. Renders a label
 * (+ optional leading icon) on the left and a value / custom right-slot /
 * chevron on the right, with a hairline divider unless `last`.
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTbvTheme } from "../useTbvTheme";
import { TBV_FONT } from "../useTbvFonts";

interface Props {
  label: string;
  value?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  right?: React.ReactNode;
  showChevron?: boolean;
  last?: boolean;
}

export function TbvAccordionRow({
  label, value, icon, onPress, right, showChevron, last,
}: Props) {
  const { t } = useTbvTheme();
  const Container: any = onPress ? TouchableOpacity : View;
  return (
    <Container
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, !last && { borderBottomColor: t.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}
    >
      <View style={styles.left}>
        {icon ? (
          <Ionicons name={icon} size={18} color={t.orange} style={{ marginRight: 10 }} />
        ) : null}
        <Text style={[styles.label, { color: t.text }]} numberOfLines={1}>{label}</Text>
      </View>
      <View style={styles.right}>
        {value ? (
          <Text style={[styles.value, { color: t.textMuted }]} numberOfLines={1}>{value}</Text>
        ) : null}
        {right}
        {showChevron ? (
          <Ionicons name="chevron-forward" size={18} color={t.textMuted} style={{ marginLeft: 6 }} />
        ) : null}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: 10,
  },
  left: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 8 },
  right: { flexDirection: "row", alignItems: "center" },
  label: { fontFamily: TBV_FONT.body, fontSize: 15, flexShrink: 1 },
  value: { fontFamily: TBV_FONT.bodyMed, fontSize: 14 },
});

export default TbvAccordionRow;
