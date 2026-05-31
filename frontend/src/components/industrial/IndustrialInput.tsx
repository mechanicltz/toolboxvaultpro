/**
 * IndustrialInput — chamfered control-panel input field.
 *
 * Renders a coded chamfered card with an orange L-bracket corner accent
 * and an inset native TextInput.
 */
import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIndustrialTheme } from "./IndustrialThemeContext";
import { INDUSTRIAL_FONTS } from "./theme";

interface Props extends TextInputProps {
  label?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightAccessory?: React.ReactNode;
  containerStyle?: ViewStyle;
  testID?: string;
}

export function IndustrialInput({
  label,
  leftIcon,
  rightAccessory,
  containerStyle,
  style,
  testID,
  ...rest
}: Props) {
  const { palette, mode } = useIndustrialTheme();
  const insetBg = mode === "light" ? "#F8F8F8" : "rgba(0,0,0,0.55)";
  const placeholderColor =
    mode === "light" ? "rgba(0,0,0,0.32)" : "rgba(242,242,242,0.32)";
  return (
    <View style={[styles.field, containerStyle]}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: palette.textMuted, fontFamily: INDUSTRIAL_FONTS.label }]}>{label}</Text>
          <View style={[styles.labelDash, { backgroundColor: palette.accent }]} />
        </View>
      ) : null}
      <View style={[styles.box, { backgroundColor: insetBg, borderColor: palette.border }]}>
        <View style={[styles.cornerTL, { borderColor: palette.accent }]} pointerEvents="none" />
        <View style={styles.inputRow}>
          {leftIcon ? <Ionicons name={leftIcon} size={18} color={palette.accent} style={styles.icon} /> : null}
          <TextInput
            placeholderTextColor={placeholderColor}
            style={[styles.input, { color: palette.text }, style]}
            testID={testID}
            {...rest}
          />
          {rightAccessory}
        </View>
      </View>
    </View>
  );
}

/** Convenience eye toggle that pairs with secureTextEntry. */
export function PasswordEyeToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const { palette } = useIndustrialTheme();
  return (
    <TouchableOpacity onPress={onToggle} style={styles.eye} activeOpacity={0.6} testID="password-eye">
      <Ionicons name={visible ? "eye-off" : "eye"} size={18} color={palette.accent} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  field: { gap: 5 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontSize: 13, letterSpacing: 2, fontWeight: "700" },
  labelDash: { flex: 1, height: 1, opacity: 0.5 },
  box: {
    position: "relative",
    borderWidth: 1,
    borderRadius: 3,
    overflow: "hidden",
  },
  cornerTL: {
    position: "absolute",
    top: 0, left: 0,
    width: 22, height: 22,
    borderTopWidth: 2, borderLeftWidth: 2,
    borderTopLeftRadius: 3,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  icon: { width: 22, textAlign: "center" },
  input: { flex: 1, fontSize: 15, fontWeight: "600", paddingVertical: 0 },
  eye: {
    width: 34, height: 34,
    alignItems: "center", justifyContent: "center",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(255,106,0,0.4)",
  },
});
