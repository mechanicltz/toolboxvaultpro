/**
 * TbvButton — image-skin button (primary orange / secondary steel).
 * Defined at module scope; never nest inside a screen component (see
 * TBV_LOGIN_BUILD_NOTES.md — prevents the keystroke flicker bug).
 */
import React from "react";
import {
  Text, StyleSheet, Pressable, ImageBackground, View, ActivityIndicator,
  StyleProp, ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTbvTheme } from "../useTbvTheme";
import { TBV_FONT } from "../useTbvFonts";

interface Props {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary";
  icon?: keyof typeof Ionicons.glyphMap;
  busy?: boolean;
  disabled?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function TbvButton({
  label, onPress, variant = "primary", icon, busy, disabled, height = 52, style,
}: Props) {
  const { skin, t } = useTbvTheme();
  const src = skin(variant === "primary" ? "btnPrimary" : "btnSecondary");
  const ink = variant === "primary" ? t.ink : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={[{ opacity: disabled ? 0.5 : 1 }, style]}
    >
      <ImageBackground source={src} resizeMode="stretch" style={[styles.btn, { height }]} imageStyle={styles.img}>
        {busy ? (
          <ActivityIndicator color={ink} />
        ) : (
          <View style={styles.row}>
            {icon ? <Ionicons name={icon} size={18} color={ink} /> : null}
            <Text style={[styles.label, { color: ink }]} numberOfLines={1}>
              {label.toUpperCase()}
            </Text>
          </View>
        )}
      </ImageBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: "100%", alignItems: "center", justifyContent: "center" },
  img: { width: "100%", height: "100%" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontFamily: TBV_FONT.head, fontSize: 18, letterSpacing: 1.5 },
});

export default TbvButton;
