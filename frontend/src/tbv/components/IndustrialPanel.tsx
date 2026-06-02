/**
 * IndustrialPanel — section container skinned to match the Toolbox Vault theme.
 *
 * variant="panel"  → uses the actual LOGIN PANEL FRAME asset (metal rim, corner
 *                    bolts, orange edge glow) scaled to fit, so dashboard panels
 *                    match the login screen ("same machine"). Content is inset
 *                    to sit inside the visible metal frame.
 * variant="nested" → lighter worn-gunmetal texture sub-card (legacy/sub use).
 */
import React from "react";
import { View, Image, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const FRAME = require("../../../assets/tbv-v2/trimmed/Panels/tbv_login_panel_dark.png");
const METAL = require("../../../assets/tbv-v2/trimmed/Textures/tbv_worn_gunmetal_dark.png");

interface Props {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: "panel" | "nested";
  testID?: string;
}

export function IndustrialPanel({ children, style, variant = "panel", testID }: Props) {
  if (variant === "nested") {
    return (
      <View testID={testID} style={[styles.wrapNested, style]}>
        <Image source={METAL} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={["rgba(10,11,13,0.55)", "rgba(10,11,13,0.82)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.innerNested}>{children}</View>
      </View>
    );
  }

  // Primary panel — login frame asset (matches login screen).
  return (
    <View testID={testID} style={[styles.wrapFrame, style]}>
      <Image source={FRAME} resizeMode="stretch" style={StyleSheet.absoluteFill} />
      <View style={styles.innerFrame}>{children}</View>
    </View>
  );
}

const BEVEL = {
  borderTopColor: "rgba(255,255,255,0.14)",
  borderLeftColor: "rgba(255,255,255,0.07)",
  borderRightColor: "rgba(0,0,0,0.55)",
  borderBottomColor: "rgba(0,0,0,0.6)",
} as const;

const styles = StyleSheet.create({
  // Frame panel — content inset to clear the metal rim (sides/top/bottom).
  wrapFrame: { borderRadius: 10, overflow: "hidden" },
  innerFrame: { paddingHorizontal: 26, paddingTop: 26, paddingBottom: 30 },

  // Nested texture sub-card
  wrapNested: { borderRadius: 8, overflow: "hidden", borderWidth: 1, ...BEVEL },
  innerNested: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
});

export default IndustrialPanel;
