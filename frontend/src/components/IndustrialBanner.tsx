// =============================================================================
// IndustrialBanner.tsx
// -----------------------------------------------------------------------------
// A reusable, industrial / tool-themed page banner used at the top of every
// main screen. Built entirely from SVG + LinearGradient + native Text — no
// image asset needed, scales crisply on any device, and the title is a prop
// so each page can drop it in with a single line:
//
//   <IndustrialBanner title="DEALERS" subtitle="Companies & Sales Agents" />
//
// Visual elements:
//   • Orange-to-darker-orange gradient background (uses theme.accent)
//   • Two metal bolts in the top corners
//   • Two faint gear silhouettes on the left and right sides
//   • Beveled white title with deep shadow (embossed industrial look)
//   • Optional rightSlot for action buttons (e.g. ADD DEALER)
// =============================================================================

import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Svg, { Circle, Path, G, Defs, RadialGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../theme";

type Props = {
  /** Big bold title (will be uppercased automatically). */
  title: string;
  /** Optional small subtitle line under the title. */
  subtitle?: string;
  /** Optional element rendered on the right (e.g. an ADD button). */
  rightSlot?: React.ReactNode;
  /** Optional element rendered on the left (e.g. a back arrow). */
  leftSlot?: React.ReactNode;
};

// ----- Small SVG primitives ---------------------------------------------------

/** A single metal bolt (hex head with a slot screw). */
function Bolt({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <RadialGradient id="boltGrad" cx="40%" cy="35%" r="65%">
          <Stop offset="0%" stopColor="#E5E7EB" stopOpacity="1" />
          <Stop offset="60%" stopColor="#9CA3AF" stopOpacity="1" />
          <Stop offset="100%" stopColor="#374151" stopOpacity="1" />
        </RadialGradient>
      </Defs>
      {/* hex head */}
      <Path
        d="M16 2 L28 9 L28 23 L16 30 L4 23 L4 9 Z"
        fill="url(#boltGrad)"
        stroke="#1F2937"
        strokeWidth="1.2"
      />
      {/* inner circle */}
      <Circle cx="16" cy="16" r="6.5" fill="#4B5563" stroke="#1F2937" strokeWidth="0.8" />
      {/* slot */}
      <Path d="M11 16 L21 16" stroke="#0F172A" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

/** A simple gear silhouette — used as a faint background decoration. */
function Gear({ size = 90, color = "#000", opacity = 0.08 }: { size?: number; color?: string; opacity?: number }) {
  // 12-tooth gear path
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G opacity={opacity}>
        <Path
          fill={color}
          d="M50 4 L56 4 L57 14 C61 15 65 17 68 19 L75 13 L80 17 L76 25 C79 28 81 31 83 35 L93 35 L94 41 L84 44 C84 47 84 50 84 53 L93 56 L92 62 L82 62 C81 66 79 70 76 73 L80 80 L75 84 L68 78 C65 81 61 83 57 84 L56 94 L50 94 L49 84 C45 83 41 81 38 78 L31 84 L26 80 L30 73 C27 70 25 66 24 62 L14 62 L13 56 L23 53 C23 50 23 47 23 44 L14 41 L15 35 L25 35 C27 31 29 28 32 25 L28 17 L33 13 L40 19 C43 17 47 15 49 14 L50 4 Z"
        />
        {/* center hole */}
        <Circle cx="50" cy="49" r="13" fill="transparent" stroke={color} strokeWidth="6" />
      </G>
    </Svg>
  );
}

// ----- Main banner ------------------------------------------------------------

export function IndustrialBanner({ title, subtitle, rightSlot, leftSlot }: Props) {
  return (
    <View style={styles.wrap}>
      {/* gradient fill */}
      <LinearGradient
        colors={["#F97316", "#EA580C", "#9A3412"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* faint diagonal "brushed metal" highlight (top edge) */}
      <View style={styles.topShine} pointerEvents="none" />
      {/* deeper bottom shadow groove */}
      <View style={styles.bottomGroove} pointerEvents="none" />

      {/* decorative gears (very subtle) */}
      <View style={[styles.gearLeft, { opacity: 1 }]} pointerEvents="none">
        <Gear size={120} color="#000" opacity={0.09} />
      </View>
      <View style={styles.gearRight} pointerEvents="none">
        <Gear size={140} color="#000" opacity={0.08} />
      </View>

      {/* corner bolts */}
      <View style={[styles.boltCorner, styles.boltTL]} pointerEvents="none">
        <Bolt size={20} />
      </View>
      <View style={[styles.boltCorner, styles.boltTR]} pointerEvents="none">
        <Bolt size={20} />
      </View>
      <View style={[styles.boltCorner, styles.boltBL]} pointerEvents="none">
        <Bolt size={18} />
      </View>
      <View style={[styles.boltCorner, styles.boltBR]} pointerEvents="none">
        <Bolt size={18} />
      </View>

      {/* content row */}
      <View style={styles.contentRow}>
        {leftSlot ? <View style={styles.leftSlot}>{leftSlot}</View> : null}
        <View style={styles.titleCol}>
          <Text
            style={styles.title}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            allowFontScaling={false}
          >
            {(title || "").toUpperCase()}
          </Text>
          {!!subtitle && (
            <Text
              style={styles.subtitle}
              numberOfLines={1}
              ellipsizeMode="tail"
              allowFontScaling={false}
            >
              {subtitle}
            </Text>
          )}
        </View>
        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>
    </View>
  );
}

// ----- styles -----------------------------------------------------------------

const BANNER_HEIGHT = 78;

const styles = StyleSheet.create({
  wrap: {
    height: BANNER_HEIGHT,
    overflow: "hidden",
    borderBottomWidth: 2,
    borderBottomColor: "#1F2937",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 6 },
    }),
  },
  topShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  bottomGroove: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 6,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  gearLeft: {
    position: "absolute",
    left: -40,
    top: -25,
  },
  gearRight: {
    position: "absolute",
    right: -50,
    bottom: -45,
  },
  boltCorner: {
    position: "absolute",
  },
  boltTL: { top: 6, left: 8 },
  boltTR: { top: 6, right: 8 },
  boltBL: { bottom: 6, left: 10 },
  boltBR: { bottom: 6, right: 10 },
  contentRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 44, // leave room for corner bolts
    gap: 8,
  },
  leftSlot: {
    justifyContent: "center",
    flexShrink: 0,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  rightSlot: {
    justifyContent: "center",
    alignItems: "flex-end",
    flexShrink: 0,
    maxWidth: "45%",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 3,
    // Beveled / embossed industrial feel
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  subtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1.5,
  },
});

export default IndustrialBanner;
