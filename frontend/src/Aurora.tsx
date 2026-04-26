import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, Pattern, Rect, Path } from "react-native-svg";
import { theme } from "./theme";

/**
 * Workshop Pro Light background — warm paper base, blueprint grid lines.
 */
export function AuroraBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      {/* Warm paper gradient */}
      <LinearGradient
        colors={["#F7F4EE", "#F1ECDF", "#F7F4EE"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Faint blueprint grid */}
      <View style={[StyleSheet.absoluteFillObject, { opacity: 0.10 }]} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <Pattern id="bp" width="32" height="32" patternUnits="userSpaceOnUse">
              <Path d="M 32 0 L 0 0 0 32" fill="none" stroke="#0F172A" strokeWidth="0.5" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#bp)" />
        </Svg>
      </View>

      {/* Warm yellow corner glow — top right */}
      <View style={styles.cornerTopRight}>
        <LinearGradient
          colors={["rgba(255, 193, 7, 0.16)", "rgba(255, 193, 7, 0)"]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>

      {/* Slate corner glow — bottom left */}
      <View style={styles.cornerBottomLeft}>
        <LinearGradient
          colors={["rgba(15, 23, 42, 0.06)", "rgba(15, 23, 42, 0)"]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
        />
      </View>

      <View style={{ flex: 1, zIndex: 1 }}>{children}</View>
    </View>
  );
}

export function GlassCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View style={[cardStyles.card, style]}>
      <View style={{ position: "relative" }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F4EE", overflow: "hidden" },
  cornerTopRight: {
    position: "absolute",
    top: -150,
    right: -100,
    width: 320,
    height: 320,
    borderRadius: 999,
    ...Platform.select({ web: { filter: "blur(70px)" as any }, default: {} }),
  },
  cornerBottomLeft: {
    position: "absolute",
    bottom: -150,
    left: -100,
    width: 320,
    height: 320,
    borderRadius: 999,
    ...Platform.select({ web: { filter: "blur(70px)" as any }, default: {} }),
  },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)" as any },
      default: {
        shadowColor: "#0F172A",
        shadowOpacity: 0.06,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 3,
        elevation: 1,
      },
    }),
  },
});
