/**
 * IndustrialCard — a smaller bolted dashboard tile.
 * Used for stat tiles, inventory rows, etc.
 */
import React from "react";
import { ImageBackground, StyleSheet, View, ViewStyle } from "react-native";
import { useIndustrialTheme } from "./IndustrialThemeContext";
import { getAsset } from "./assets";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  padding?: number;
  testID?: string;
}

export function IndustrialCard({ children, style, padding = 14, testID }: Props) {
  const { palette } = useIndustrialTheme();
  const src = getAsset("dashboard_tile");

  const inner = (
    <View style={{ padding }} testID={testID}>
      {children}
    </View>
  );

  if (src) {
    return (
      <View style={[styles.outer, style]}>
        <ImageBackground source={src} resizeMode="stretch" style={styles.bg}>
          {inner}
        </ImageBackground>
      </View>
    );
  }

  return (
    <View style={[styles.outer, style]}>
      <View style={[styles.fallback, { backgroundColor: palette.panel, borderColor: palette.accent }]} />
      {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h], i)=>(
        <View key={i} style={[styles.bolt, { [v]: -5, [h]: -5 } as any]} />
      ))}
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { position: "relative" },
  bg: { width: "100%" },
  fallback: { ...StyleSheet.absoluteFillObject, borderWidth: 1.2, borderRadius: 6 },
  bolt: {
    position: "absolute",
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: "#0e0e0e", borderWidth: 1, borderColor: "#4a4a4a", zIndex: 10,
  },
});
