import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, Pattern, Rect, Path, Line } from "react-native-svg";
import { theme } from "./theme";

/**
 * Cyber HUD background — deep cyan/black, faint grid lines + a scanline overlay
 * + corner brackets at the edges. Fixed behind all content.
 */
export function AuroraBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      {/* Base dark */}
      <LinearGradient
        colors={["#000814", "#001428", "#000A1A", "#000814"]}
        locations={[0, 0.4, 0.7, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Faint grid */}
      <View style={[StyleSheet.absoluteFillObject, { opacity: 0.18 }]} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <Pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <Path d="M 40 0 L 0 0 0 40" fill="none" stroke="#00F0FF" strokeWidth="0.5" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#grid)" />
        </Svg>
      </View>

      {/* Cyan glow top-right */}
      <View style={styles.glowTopRight}>
        <LinearGradient
          colors={["rgba(0, 240, 255, 0.30)", "rgba(0, 240, 255, 0)"]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>

      {/* Magenta glow bottom-left */}
      <View style={styles.glowBottomLeft}>
        <LinearGradient
          colors={["rgba(255, 0, 200, 0.20)", "rgba(255, 0, 200, 0)"]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
        />
      </View>

      {/* Scanline overlay (web only — avoids RN perf cost) */}
      {Platform.OS === "web" && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundImage:
                "repeating-linear-gradient(180deg, rgba(0, 240, 255, 0.04) 0px, rgba(0, 240, 255, 0.04) 1px, transparent 1px, transparent 3px)",
            } as any,
          ]}
        />
      )}

      {/* Corner brackets */}
      <View pointerEvents="none" style={[styles.bracket, styles.bracketTL]}>
        <Svg width="40" height="40">
          <Line x1="0" y1="0" x2="20" y2="0" stroke="#00F0FF" strokeWidth="2" />
          <Line x1="0" y1="0" x2="0" y2="20" stroke="#00F0FF" strokeWidth="2" />
        </Svg>
      </View>
      <View pointerEvents="none" style={[styles.bracket, styles.bracketTR]}>
        <Svg width="40" height="40">
          <Line x1="40" y1="0" x2="20" y2="0" stroke="#00F0FF" strokeWidth="2" />
          <Line x1="40" y1="0" x2="40" y2="20" stroke="#00F0FF" strokeWidth="2" />
        </Svg>
      </View>
      <View pointerEvents="none" style={[styles.bracket, styles.bracketBL]}>
        <Svg width="40" height="40">
          <Line x1="0" y1="40" x2="20" y2="40" stroke="#00F0FF" strokeWidth="2" />
          <Line x1="0" y1="40" x2="0" y2="20" stroke="#00F0FF" strokeWidth="2" />
        </Svg>
      </View>
      <View pointerEvents="none" style={[styles.bracket, styles.bracketBR]}>
        <Svg width="40" height="40">
          <Line x1="40" y1="40" x2="20" y2="40" stroke="#00F0FF" strokeWidth="2" />
          <Line x1="40" y1="40" x2="40" y2="20" stroke="#00F0FF" strokeWidth="2" />
        </Svg>
      </View>

      <View style={{ flex: 1, zIndex: 1 }}>{children}</View>
    </View>
  );
}

/** Glass surface for cards. Used minimally — most surfaces use theme colors directly. */
export function GlassCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View style={[cardStyles.card, style]}>
      <View style={{ position: "relative" }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000814", overflow: "hidden" },
  glowTopRight: {
    position: "absolute",
    top: -200,
    right: -150,
    width: 420,
    height: 420,
    borderRadius: 999,
    ...Platform.select({ web: { filter: "blur(90px)" as any }, default: {} }),
  },
  glowBottomLeft: {
    position: "absolute",
    bottom: -180,
    left: -120,
    width: 360,
    height: 360,
    borderRadius: 999,
    ...Platform.select({ web: { filter: "blur(80px)" as any }, default: {} }),
  },
  bracket: { position: "absolute", width: 40, height: 40, opacity: 0.7 },
  bracketTL: { top: 0, left: 0 },
  bracketTR: { top: 0, right: 0 },
  bracketBL: { bottom: 70, left: 0 },
  bracketBR: { bottom: 70, right: 0 },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: 2,
    overflow: "hidden",
  },
});
