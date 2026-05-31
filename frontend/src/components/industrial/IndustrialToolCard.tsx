/**
 * IndustrialToolCard — inventory list card.
 * Per Part 6 Rule #1: inventory info > artwork.
 * Card-based, photo-centric, fast. No decoration.
 */
import React from "react";
import { Image, ImageSourcePropType, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { IndustrialCard } from "./IndustrialCard";
import { TBVText } from "./TBVText";
import { useTBV } from "./TBVThemeContext";

interface Props {
  name: string;
  brand?: string;
  model?: string;
  category?: string;
  thumb?: ImageSourcePropType;
  onPress?: () => void;
  rightBadge?: { label: string; tone?: "accent" | "success" | "danger" | "warning" };
  testID?: string;
}

export function IndustrialToolCard({
  name, brand, model, category, thumb, onPress, rightBadge, testID,
}: Props) {
  const { palette, spacing } = useTBV();
  const badgeColor =
    rightBadge?.tone === "success" ? palette.success :
    rightBadge?.tone === "danger" ? palette.danger :
    rightBadge?.tone === "warning" ? palette.warning : palette.accent;
  return (
    <IndustrialCard onPress={onPress} padding={spacing.md} testID={testID}>
      <View style={styles.row}>
        <View style={[styles.thumb, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {thumb ? (
            <Image source={thumb} style={{ width: 56, height: 56, borderRadius: 8 }} resizeMode="cover" />
          ) : (
            <Ionicons name="construct-outline" size={28} color={palette.accent} />
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <TBVText variant="bodyBold" numberOfLines={1}>{name}</TBVText>
          {(brand || model) ? (
            <TBVText variant="bodySmall" muted numberOfLines={1}>
              {[brand, model].filter(Boolean).join(" · ")}
            </TBVText>
          ) : null}
          {category ? (
            <TBVText variant="labelSmall" color={palette.textMuted}>{category.toUpperCase()}</TBVText>
          ) : null}
        </View>
        {rightBadge ? (
          <View style={[styles.badge, { backgroundColor: badgeColor + "22", borderColor: badgeColor }]}>
            <TBVText variant="labelSmall" color={badgeColor}>{rightBadge.label.toUpperCase()}</TBVText>
          </View>
        ) : null}
      </View>
    </IndustrialCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: {
    width: 56, height: 56, borderRadius: 10,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  badge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1,
  },
});
