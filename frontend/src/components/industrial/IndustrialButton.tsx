/**
 * IndustrialButton — PURE CODE button (per Part 6 rules: no image-based buttons).
 * Variants: primary (orange) / secondary (steel) / ghost (transparent w/ border).
 */
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTBV } from "./TBVThemeContext";
import { TBVText } from "./TBVText";

interface Props {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
}

export function IndustrialButton({
  label, onPress, icon, iconRight, variant = "primary", size = "md",
  loading, disabled, style, testID,
}: Props) {
  const { palette, radius, shadow } = useTBV();

  const heights = { sm: 38, md: 48, lg: 56 } as const;
  const padding = { sm: 14, md: 18, lg: 22 } as const;
  const tvar = ({ sm: "buttonSm", md: "button", lg: "buttonLg" } as const)[size];

  let bg = palette.accent;
  let fg = palette.textInverse;
  let borderColor = "transparent";
  let borderWidth = 0;
  if (variant === "secondary") {
    bg = palette.card;
    fg = palette.text;
    borderColor = palette.border;
    borderWidth = 1.5;
  } else if (variant === "ghost") {
    bg = "transparent";
    fg = palette.accent;
    borderColor = palette.accent;
    borderWidth = 1.5;
  } else if (variant === "danger") {
    bg = palette.danger;
    fg = "#fff";
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      testID={testID}
      style={({ pressed }) => [
        {
          height: heights[size],
          paddingHorizontal: padding[size],
          backgroundColor: bg,
          borderRadius: radius.md,
          borderColor, borderWidth,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        variant === "primary" && shadow.glow,
        styles.btn,
        style as any,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <TBVText variant={tvar} color={fg}>{label}</TBVText>
          {iconRight ? <Ionicons name={iconRight} size={18} color={fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
