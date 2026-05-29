// =============================================================================
// PillButton.tsx
// -----------------------------------------------------------------------------
// Reusable "pill button" — the canonical action chip used across the app.
//
//   Visual: fully-rounded ends, icon + uppercase label, themed border.
//
//   Variants:
//     • "default" — grey outline, secondary text (inactive look)
//     • "active"  — orange outline + orange text/icon (selected look)
//     • "danger"  — red outline + red text/icon (delete actions)
//
//   Usage:
//     <PillButton label="EDIT" icon="create-outline" onPress={...} />
//     <PillButton label="DELETE" icon="trash-outline" variant="danger" onPress={...} />
//     <PillButton label="BY DEALER" icon="briefcase" variant="active" onPress={...} />
// =============================================================================

import React from "react";
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

type IconName = keyof typeof Ionicons.glyphMap;

type Variant = "default" | "active" | "danger";

type Props = {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  variant?: Variant;
  /** Optional testID forwarded to the TouchableOpacity. */
  testID?: string;
  /** Optional style override (e.g., margin tweaks). */
  style?: ViewStyle;
  /** Disable interaction & dim the button. */
  disabled?: boolean;
};

function colorsFor(variant: Variant) {
  switch (variant) {
    case "active":
      return {
        border: theme.colors.accent,
        text: theme.colors.accent,
        icon: theme.colors.accent,
        borderWidth: 2,
      };
    case "danger":
      return {
        border: theme.colors.danger,
        text: theme.colors.danger,
        icon: theme.colors.danger,
        borderWidth: 2,
      };
    case "default":
    default:
      return {
        border: theme.colors.border,
        text: theme.colors.textSecondary,
        icon: theme.colors.textSecondary,
        borderWidth: 1,
      };
  }
}

export function PillButton({
  label,
  icon,
  onPress,
  variant = "default",
  testID,
  style,
  disabled,
}: Props) {
  const c = colorsFor(variant);
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[
        styles.base,
        {
          borderColor: c.border,
          borderWidth: c.borderWidth,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={c.icon} /> : null}
      <Text style={[styles.label, { color: c.text }]}>
        {(label || "").toUpperCase()}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: theme.radii.pill,
    backgroundColor: "transparent",
  },
  label: {
    fontWeight: "800",
    fontSize: 8,
    letterSpacing: 1.2,
  },
});

export default PillButton;
