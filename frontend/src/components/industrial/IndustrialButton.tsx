/**
 * IndustrialButton — orange powder-coated steel button with bolts.
 *
 * Uses the `button_primary_orange` texture as background and native <Text>
 * for the label so text always renders crisp at any size.
 */
import React from "react";
import {
  ActivityIndicator,
  ImageBackground,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIndustrialTheme } from "./IndustrialThemeContext";
import { INDUSTRIAL_FONTS } from "./theme";
import { getAsset } from "./assets";

interface Props {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "primary" | "secondary";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  labelStyle?: TextStyle;
  testID?: string;
}

export function IndustrialButton({
  label,
  onPress,
  icon,
  variant = "primary",
  loading,
  disabled,
  style,
  labelStyle,
  testID,
}: Props) {
  const { palette } = useIndustrialTheme();
  const isPrimary = variant === "primary";
  const src = isPrimary ? getAsset("button_primary_orange") : null;

  const labelColor = isPrimary ? "#000" : palette.text;

  const labelEl = loading ? (
    <ActivityIndicator color={labelColor} />
  ) : (
    <View style={styles.row}>
      {icon ? <Ionicons name={icon} size={18} color={labelColor} /> : null}
      <Text
        style={[
          styles.label,
          { color: labelColor, fontFamily: INDUSTRIAL_FONTS.label },
          labelStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[styles.wrap, disabled && { opacity: 0.5 }, style]}
      testID={testID}
    >
      {src && isPrimary ? (
        <ImageBackground source={src} resizeMode="stretch" style={styles.btnImg}>
          {labelEl}
        </ImageBackground>
      ) : (
        <View style={[styles.btnFallback, isPrimary ? { backgroundColor: palette.accent } : { backgroundColor: palette.steel, borderColor: palette.accent, borderWidth: 1.5 }]}>
          {labelEl}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    borderRadius: 4,
  },
  btnImg: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  btnFallback: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: 4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: {
    fontSize: 17,
    letterSpacing: 2.4,
    fontWeight: "800",
  },
});
