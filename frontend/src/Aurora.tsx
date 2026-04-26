import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "./theme";

/** Original Industrial Dark background. */
export function AuroraBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#000000", "#0F0F0F", "#0A0A0A"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Subtle yellow vignette glow top-right */}
      <View style={styles.glowTopRight}>
        <LinearGradient
          colors={["rgba(255, 179, 0, 0.10)", "rgba(255, 179, 0, 0)"]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>
      <View style={{ flex: 1, zIndex: 1 }}>{children}</View>
    </View>
  );
}

export function GlassCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[cardStyles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A", overflow: "hidden" },
  glowTopRight: {
    position: "absolute",
    top: -200,
    right: -150,
    width: 380,
    height: 380,
    borderRadius: 999,
    ...Platform.select({ web: { filter: "blur(80px)" as any }, default: {} }),
  },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    overflow: "hidden",
  },
});
