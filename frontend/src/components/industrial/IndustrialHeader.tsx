/**
 * IndustrialHeader — top app bar with optional wordmark + back/back-actions.
 * Pure code; no decorative artwork.
 */
import React from "react";
import { Image, ImageSourcePropType, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTBV } from "./TBVThemeContext";
import { TBVText } from "./TBVText";

interface Props {
  title?: string;
  wordmark?: ImageSourcePropType | null;
  onBack?: () => void;
  rightAction?: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; testID?: string };
}

export function IndustrialHeader({ title, wordmark, onBack, rightAction }: Props) {
  const { palette, spacing } = useTBV();
  return (
    <View
      style={[
        styles.bar,
        {
          paddingHorizontal: spacing.lg,
          backgroundColor: palette.surface,
          borderBottomColor: palette.border,
        },
      ]}
    >
      <View style={styles.side}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={palette.accent} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.center}>
        {wordmark ? (
          <Image source={wordmark} style={{ height: 28, width: 140 }} resizeMode="contain" />
        ) : title ? (
          <TBVText variant="h3">{title}</TBVText>
        ) : null}
      </View>
      <View style={[styles.side, { alignItems: "flex-end" }]}>
        {rightAction ? (
          <Pressable onPress={rightAction.onPress} hitSlop={10} testID={rightAction.testID}>
            <Ionicons name={rightAction.icon} size={22} color={palette.accent} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  side: { width: 60, flexDirection: "row", alignItems: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
