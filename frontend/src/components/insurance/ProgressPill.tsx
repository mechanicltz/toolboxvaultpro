import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, LayoutChangeEvent } from "react-native";
import { useColors } from "../../themeContext";

/**
 * Glossy pill progress bar with a "%" bubble pointer that rides above the
 * fill. Pure RN (no image). Theme-colored fill on a dark track.
 */
export function ProgressPill({ percent }: { percent: number }) {
  const c = useColors();
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const anim = useRef(new Animated.Value(0)).current;
  const [trackW, setTrackW] = React.useState(0);

  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 600, useNativeDriver: false }).start();
  }, [pct, anim]);

  const fillWidth = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  // Bubble x position: ride the END of the fill, clamped so it stays on-track.
  const BUBBLE_W = 44;
  const bubbleLeft = anim.interpolate({
    inputRange: [0, 100],
    outputRange: [0, Math.max(0, trackW - BUBBLE_W)],
    extrapolate: "clamp",
  });

  const onTrackLayout = (e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width);

  return (
    <View style={styles.wrap}>
      {/* Bubble pointer */}
      <View style={styles.bubbleRow}>
        <Animated.View style={[styles.bubble, { left: bubbleLeft, backgroundColor: c.accent }]}>
          <Text style={styles.bubbleText}>{pct}%</Text>
          <View style={[styles.bubbleTip, { borderTopColor: c.accent }]} />
        </Animated.View>
      </View>

      {/* Track */}
      <View style={styles.track} onLayout={onTrackLayout}>
        <View style={styles.trackInner} />
        <Animated.View style={[styles.fill, { width: fillWidth, backgroundColor: c.accent }]}>
          <View style={styles.gloss} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  bubbleRow: { height: 26, justifyContent: "flex-end" },
  bubble: {
    position: "absolute",
    width: 44,
    paddingVertical: 2,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  bubbleText: { color: "#000", fontSize: 11, fontWeight: "900" },
  bubbleTip: {
    position: "absolute",
    bottom: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  track: {
    height: 16,
    borderRadius: 8,
    backgroundColor: "#1a1a1d",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    justifyContent: "center",
  },
  trackInner: { ...StyleSheet.absoluteFillObject },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 8,
    overflow: "hidden",
  },
  gloss: {
    position: "absolute",
    top: 1,
    left: 2,
    right: 2,
    height: 5,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
});

export default ProgressPill;
