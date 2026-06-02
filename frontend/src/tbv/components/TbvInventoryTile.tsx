/**
 * TbvInventoryTile — dense inventory item card on the `inventoryTile` skin
 * (dedicated dark art; light substitute until light asset arrives).
 * Thumbnail (image or icon placeholder) + name + meta on the left; value and
 * optional status badge on the right. Built for information density.
 */
import React from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ImageSourcePropType,
  StyleProp, ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TbvPanel } from "./TbvPanel";
import { useTbvTheme } from "../useTbvTheme";
import { TBV_FONT } from "../useTbvFonts";

interface Props {
  name: string;
  meta?: string;
  value?: string;
  thumbnail?: ImageSourcePropType;
  status?: string;
  statusColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function TbvInventoryTile({
  name, meta, value, thumbnail, status, statusColor, onPress, style,
}: Props) {
  const { t } = useTbvTheme();
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} disabled={!onPress} style={style}>
      <TbvPanel skin="inventoryTile" pad={12}>
        <View style={styles.row}>
          <View style={[styles.thumb, { borderColor: t.cardBorderSoft }]}>
            {thumbnail ? (
              <Image source={thumbnail} style={styles.thumbImg} resizeMode="cover" />
            ) : (
              <Ionicons name="construct" size={22} color={t.textMuted} />
            )}
          </View>
          <View style={styles.info}>
            <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>{name}</Text>
            {meta ? (
              <Text style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>{meta}</Text>
            ) : null}
          </View>
          <View style={styles.rightCol}>
            {value ? (
              <Text style={[styles.value, { color: t.orange }]} numberOfLines={1}>{value}</Text>
            ) : null}
            {status ? (
              <View style={[styles.badge, { borderColor: statusColor ?? t.cardBorder }]}>
                <Text style={[styles.badgeTxt, { color: statusColor ?? t.orange }]} numberOfLines={1}>
                  {status.toUpperCase()}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </TbvPanel>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  thumb: {
    width: 46, height: 46, borderRadius: 6, borderWidth: 1,
    alignItems: "center", justifyContent: "center", marginRight: 12, overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  info: { flex: 1, paddingRight: 8 },
  name: { fontFamily: TBV_FONT.body, fontSize: 15 },
  meta: { fontFamily: TBV_FONT.bodyMed, fontSize: 12, marginTop: 2 },
  rightCol: { alignItems: "flex-end" },
  value: { fontFamily: TBV_FONT.label, fontSize: 16 },
  badge: {
    marginTop: 4, paddingHorizontal: 7, paddingVertical: 1,
    borderRadius: 4, borderWidth: 1,
  },
  badgeTxt: { fontFamily: TBV_FONT.small, fontSize: 9, letterSpacing: 0.5 },
});

export default TbvInventoryTile;
