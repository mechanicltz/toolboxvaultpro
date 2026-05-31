/**
 * IndustrialInput — PURE CODE input with optional industrial accent corner.
 * The orange L-bracket corner is used only on Login / Splash (heavy industrial).
 * For operational screens, pass `subtle` to drop the corner.
 */
import React from "react";
import {
  StyleSheet,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTBV } from "./TBVThemeContext";
import { TBVText } from "./TBVText";

interface Props extends TextInputProps {
  label?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightAccessory?: React.ReactNode;
  containerStyle?: ViewStyle;
  /** Drop the orange L-bracket corner accent (use on operational screens). */
  subtle?: boolean;
  errorText?: string;
  testID?: string;
}

export function IndustrialInput({
  label, leftIcon, rightAccessory, containerStyle, subtle, errorText, style, testID, ...rest
}: Props) {
  const { palette, radius, resolvedMode } = useTBV();
  const placeholderColor = resolvedMode === "light" ? "rgba(0,0,0,0.32)" : "rgba(242,242,242,0.32)";
  return (
    <View style={[styles.field, containerStyle]}>
      {label ? (
        <View style={styles.labelRow}>
          <TBVText variant="label" color={palette.textMuted}>{label}</TBVText>
          <View style={[styles.labelDash, { backgroundColor: palette.accent }]} />
        </View>
      ) : null}
      <View style={[
        styles.box,
        {
          backgroundColor: resolvedMode === "light" ? "#F8F8F8" : "rgba(255,255,255,0.04)",
          borderColor: errorText ? palette.danger : palette.border,
          borderRadius: radius.sm,
        },
      ]}>
        {!subtle && (
          <View style={[styles.cornerTL, { borderColor: palette.accent }]} pointerEvents="none" />
        )}
        <View style={styles.inputRow}>
          {leftIcon ? <Ionicons name={leftIcon} size={18} color={palette.accent} style={styles.icon} /> : null}
          <TextInput
            placeholderTextColor={placeholderColor}
            style={[styles.input, { color: palette.text }, style as any]}
            testID={testID}
            {...rest}
          />
          {rightAccessory}
        </View>
      </View>
      {errorText ? (
        <TBVText variant="caption" color={palette.danger}>{errorText}</TBVText>
      ) : null}
    </View>
  );
}

export function PasswordEyeToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const { palette } = useTBV();
  return (
    <TouchableOpacity onPress={onToggle} style={[styles.eye, { borderColor: palette.accent }]} activeOpacity={0.6} testID="password-eye">
      <Ionicons name={visible ? "eye-off" : "eye"} size={18} color={palette.accent} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  field: { gap: 5 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  labelDash: { flex: 1, height: 1, opacity: 0.5 },
  box: { position: "relative", borderWidth: 1, overflow: "hidden" },
  cornerTL: {
    position: "absolute", top: 0, left: 0, width: 20, height: 20,
    borderTopWidth: 2, borderLeftWidth: 2,
  },
  inputRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 48, gap: 8 },
  icon: { width: 22, textAlign: "center" },
  input: { flex: 1, fontSize: 15, fontWeight: "500", paddingVertical: 0 },
  eye: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 4, borderWidth: 1 },
});
