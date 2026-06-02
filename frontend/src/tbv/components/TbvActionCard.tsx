/**
 * TbvActionCard — interactive card on the `actionBox` skin. Leading icon badge,
 * title + optional subtitle, optional right slot / chevron. Light + Dark aware.
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TbvPanel } from "./TbvPanel";
import { useTbvTheme } from "../useTbvTheme";
import { TBV_FONT } from "../useTbvFonts";

interface Props {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  right?: React.ReactNode;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function TbvActionCard({
  title, subtitle, icon, onPress, right, showChevron = true, style,
}: Props) {
  const { t } = useTbvTheme();
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} disabled={!onPress} style={style}>
      <TbvPanel skin="actionBox" pad={14}>
        <View style={styles.row}>
          {icon ? (
            <View style={[styles.iconWrap, { borderColor: t.cardBorder }]}>
              <Ionicons name={icon} size={22} color={t.orange} />
            </View>
          ) : null}
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: t.headSteel }]} numberOfLines={1}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.sub, { color: t.textMuted }]} numberOfLines={2}>{subtitle}</Text>
            ) : null}
          </View>
          {right}
          {showChevron && onPress ? (
            <Ionicons name="chevron-forward" size={20} color={t.textMuted} style={{ marginLeft: 6 }} />
          ) : null}
        </View>
      </TbvPanel>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  iconWrap: {
    width: 42, height: 42, borderRadius: 8, borderWidth: 1,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  textWrap: { flex: 1 },
  title: { fontFamily: TBV_FONT.body, fontSize: 16 },
  sub: { fontFamily: TBV_FONT.bodyMed, fontSize: 13, marginTop: 2 },
});

export default TbvActionCard;
