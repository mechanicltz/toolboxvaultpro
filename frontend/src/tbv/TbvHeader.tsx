/**
 * TbvHeader — reusable industrial page header.
 *
 * Renders the page/section title as NATIVE TEXT (never image text) styled to
 * mimic the TOOLBOX VAULT wordmark: heavy block font (Bebas), uppercase,
 * brushed-steel colour, embossed drop shadow. Optional back chevron + right
 * action so the same component works as a title block OR a top app bar.
 *
 * This is the shared header system for the whole app — every migrated screen
 * should use it for a consistent industrial header.
 */
import React from "react";
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TBV, getIndustrialVariant, VARIANT_ACCENT } from "./skins";

export interface TbvHeaderProps {
  /** Main title text (rendered UPPERCASE in steel). */
  title: string;
  /** Optional trailing word rendered in orange, wordmark-style (e.g. "VAULT"). */
  accent?: string;
  /** Title font size. Defaults to 30. */
  size?: number;
  /** Show a back chevron on the left and call this on press. */
  onBack?: () => void;
  /** Optional right-side action button. */
  right?: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; testID?: string };
  style?: StyleProp<ViewStyle>;
}

export function TbvHeader({ title, accent, size = 30, onBack, right, style }: TbvHeaderProps) {
  // Accent follows the active industrial colour variant (orange ↔ pink).
  const accentColor = VARIANT_ACCENT[getIndustrialVariant()];
  return (
    <View style={[styles.row, style]}>
      <View style={styles.side}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} style={styles.iconBtn} testID="tbv-back">
            <Ionicons name="chevron-back" size={26} color={accentColor} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.center}>
        {/* Embossed steel base shadow + steel face = brushed-metal wordmark feel */}
        <View>
          <Text
            numberOfLines={1}
            allowFontScaling={false}
            style={[styles.shadow, { fontSize: size }]}
          >
            {title.toUpperCase()}{accent ? ` ${accent.toUpperCase()}` : ""}
          </Text>
          <Text
            numberOfLines={1}
            allowFontScaling={false}
            style={[styles.face, { fontSize: size }]}
          >
            {title.toUpperCase()}
            {accent ? <Text style={{ color: accentColor }}>{` ${accent.toUpperCase()}`}</Text> : null}
          </Text>
        </View>
      </View>

      <View style={[styles.side, { alignItems: "flex-end" }]}>
        {right ? (
          <Pressable onPress={right.onPress} hitSlop={12} style={styles.iconBtn} testID={right.testID}>
            <Ionicons name={right.icon} size={22} color={accentColor} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const BASE = {
  fontFamily: "BebasNeue_400Regular" as const,
  letterSpacing: 2.5,
  textAlign: "center" as const,
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", width: "100%" },
  side: { width: 44, flexDirection: "row", alignItems: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  iconBtn: { padding: 4 },
  // Dark base sits 2px below the face to read as a pressed/embossed steel plate.
  shadow: {
    ...BASE,
    position: "absolute",
    left: 0,
    right: 0,
    top: 2,
    color: "rgba(0,0,0,0.85)",
  },
  face: {
    ...BASE,
    color: TBV.steel,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});
