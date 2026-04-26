import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "./theme";

/**
 * Aurora Glass background.
 * - Deep navy base + 2 colored blobs (purple + cyan) that bleed through
 *   slightly to give the screen depth. Position is fixed (behind content).
 */
export function AuroraBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      {/* Base */}
      <LinearGradient
        colors={["#0B0F1A", "#0F1530", "#1B1450", "#0B0F1A"]}
        locations={[0, 0.35, 0.7, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Purple aurora blob — top right */}
      <View style={styles.blobTopRight}>
        <LinearGradient
          colors={["rgba(167, 139, 250, 0.85)", "rgba(167, 139, 250, 0)"]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>
      {/* Cyan aurora blob — bottom left */}
      <View style={styles.blobBottomLeft}>
        <LinearGradient
          colors={["rgba(34, 211, 238, 0.65)", "rgba(34, 211, 238, 0)"]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
        />
      </View>
      {/* Pink/magenta accent blob — center */}
      <View style={styles.blobCenter}>
        <LinearGradient
          colors={["rgba(251, 113, 133, 0.35)", "rgba(251, 113, 133, 0)"]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </View>
      <View style={{ flex: 1, zIndex: 1 }}>{children}</View>
    </View>
  );
}

/**
 * Frosted glass card surface — translucent panel with hairline border.
 */
export function GlassCard({
  children,
  style,
  intensity = 1,
}: {
  children: React.ReactNode;
  style?: any;
  intensity?: number;
}) {
  return (
    <View style={[styles.card, { opacity: 1 }, style]}>
      <LinearGradient
        colors={[
          `rgba(255, 255, 255, ${0.06 * intensity})`,
          `rgba(255, 255, 255, ${0.02 * intensity})`,
        ]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={{ position: "relative" }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    overflow: "hidden",
  },
  blobTopRight: {
    position: "absolute",
    top: -160,
    right: -120,
    width: 380,
    height: 380,
    borderRadius: 999,
    opacity: 1,
    ...Platform.select({ web: { filter: "blur(80px)" as any }, default: {} }),
  },
  blobBottomLeft: {
    position: "absolute",
    bottom: -180,
    left: -120,
    width: 360,
    height: 360,
    borderRadius: 999,
    ...Platform.select({ web: { filter: "blur(80px)" as any }, default: {} }),
  },
  blobCenter: {
    position: "absolute",
    top: "30%",
    left: "20%",
    width: 280,
    height: 280,
    borderRadius: 999,
    ...Platform.select({ web: { filter: "blur(70px)" as any }, default: {} }),
  },
  card: {
    backgroundColor: theme.colors.glass,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: theme.radii.md,
    overflow: "hidden",
    ...Platform.select({
      web: {
        backdropFilter: "blur(20px)" as any,
        WebkitBackdropFilter: "blur(20px)" as any,
      },
      default: {},
    }),
  },
});
