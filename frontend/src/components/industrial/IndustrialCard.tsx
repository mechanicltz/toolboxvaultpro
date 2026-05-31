/**
 * IndustrialCard — PURE CODE card (per Part 6 rules: no image-based cards).
 * Card spec from Part 5C / user clarifications:
 *   Dark:  #171A1F bg, #2A2E35 border, 14px radius
 *   Light: #FFFFFF bg, #B7BCC3 border, 14px radius
 */
import React from "react";
import { Pressable, View, ViewStyle } from "react-native";
import { useTBV } from "./TBVThemeContext";

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  /** Visual weight: flat (no shadow), raised (sm shadow), elevated (md shadow) */
  elevation?: "flat" | "raised" | "elevated";
  padding?: number;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
}

export function IndustrialCard({
  children, onPress, elevation = "flat", padding = 16, style, testID,
}: Props) {
  const { palette, radius, shadow } = useTBV();
  const cardStyle: ViewStyle = {
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding,
  };
  const shadowStyle = elevation === "raised" ? shadow.sm : elevation === "elevated" ? shadow.md : undefined;
  const inner = <View style={[cardStyle, shadowStyle, style as any]} testID={testID}>{children}</View>;
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}
