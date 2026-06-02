/**
 * TbvStatCard — dashboard metric tile on the dedicated `statCard` skin
 * (real dark art + real light art via registry). Big value + label, optional
 * icon and trailing unit/caption.
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TbvPanel } from "./TbvPanel";
import { useTbvTheme } from "../useTbvTheme";
import { TBV_FONT } from "../useTbvFonts";

interface Props {
  label: string;
  value: string | number;
  icon?: keyof typeof Ionicons.glyphMap;
  caption?: string;
  /** Override the value colour (defaults to accent orange). */
  valueColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function TbvStatCard({ label, value, icon, caption, valueColor, onPress, style }: Props) {
  const { t } = useTbvTheme();
  const Container: any = onPress ? TouchableOpacity : View;
  return (
    <Container onPress={onPress} activeOpacity={0.85} style={style}>
      <TbvPanel skin="statCard" pad={16}>
        <View style={styles.topRow}>
          <Text style={[styles.label, { color: t.textMuted }]} numberOfLines={1}>
            {label.toUpperCase()}
          </Text>
          {icon ? <Ionicons name={icon} size={18} color={t.orange} /> : null}
        </View>
        <Text style={[styles.value, { color: valueColor ?? t.orange }]} numberOfLines={1}>
          {value}
        </Text>
        {caption ? (
          <Text style={[styles.caption, { color: t.textMuted }]} numberOfLines={1}>{caption}</Text>
        ) : null}
      </TbvPanel>
    </Container>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontFamily: TBV_FONT.head, fontSize: 13, letterSpacing: 1.4, flex: 1 },
  value: { fontFamily: TBV_FONT.label, fontSize: 32, marginTop: 4 },
  caption: { fontFamily: TBV_FONT.small, fontSize: 11, marginTop: 2 },
});

export default TbvStatCard;
