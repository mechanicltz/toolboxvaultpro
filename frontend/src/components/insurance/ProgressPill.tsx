import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";

/**
 * Glossy pill progress bar with the "%" rendered ON the bar (centered).
 * Uses a fixed green fill (intentionally NOT the app theme color, which is
 * already used heavily elsewhere) on a dark track.
 */
const FILL_COLOR = "#22C55E"; // green — distinct from the orange/pink theme accent

export function ProgressPill({ percent, label }: { percent: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 600, useNativeDriver: false }).start();
  }, [pct, anim]);

  const fillWidth = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: fillWidth, backgroundColor: FILL_COLOR }]}>
          <View style={styles.gloss} />
        </Animated.View>
        {/* Label + percent sit on the bar itself, centered. */}
        <View style={styles.labelLayer} pointerEvents="none">
          <Text style={styles.label}>{label ? `${label}  ` : ""}{pct}%</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 2 },
  track: {
    height: 22,
    borderRadius: 11,
    backgroundColor: "#1a1a1d",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    justifyContent: "center",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 11,
    overflow: "hidden",
  },
  gloss: {
    position: "absolute",
    top: 2,
    left: 3,
    right: 3,
    height: 6,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.30)",
  },
  labelLayer: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  label: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

export default ProgressPill;
