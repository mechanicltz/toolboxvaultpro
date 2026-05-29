// =============================================================================
// DiamondPlate.tsx
// -----------------------------------------------------------------------------
// A full-screen industrial "diamond / tread plate" background, drawn entirely
// in SVG so it scales crisply at any resolution and ships zero image assets.
//
//   Visual: dark gunmetal grey with rows of polished diamond bumps. Adjacent
//   rows are offset half-a-tile, just like real diamond plate steel.
//
//   Usage:
//     <View style={{ flex: 1 }}>
//       <DiamondPlate />
//       {/* …actual screen content goes on top… */}
//     </View>
//
//   The component absolutely fills its parent and is purely decorative — it
//   sits behind everything and never intercepts touches.
// =============================================================================

import React from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import Svg, {
  Defs,
  Pattern,
  Rect,
  Path,
  LinearGradient,
  Stop,
  G,
} from "react-native-svg";

type Props = {
  /** Override the base color (defaults to a dark gunmetal). */
  baseColor?: string;
  /** Optional opacity (0–1) on the diamond highlights. Default 0.9. */
  intensity?: number;
};

const TILE = 36; // pixel size of one diamond cell

export function DiamondPlate({
  baseColor = "#1A1A1C",
  intensity = 0.9,
}: Props) {
  const { width, height } = useWindowDimensions();
  // Use slightly larger than viewport to ensure we cover overscroll bounce.
  const W = Math.ceil(width) + TILE;
  const H = Math.ceil(height) + TILE * 4;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          {/* Background gradient (subtle vignette so the plate doesn't feel flat) */}
          <LinearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={baseColor} stopOpacity="1" />
            <Stop offset="50%" stopColor="#0E0E10" stopOpacity="1" />
            <Stop offset="100%" stopColor={baseColor} stopOpacity="1" />
          </LinearGradient>

          {/* Highlight gradient for each diamond (top-left polished sheen) */}
          <LinearGradient id="diamondGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#5A5A5E" stopOpacity={intensity} />
            <Stop offset="55%" stopColor="#2E2E32" stopOpacity={intensity} />
            <Stop offset="100%" stopColor="#0A0A0C" stopOpacity={intensity} />
          </LinearGradient>

          {/* The tile contains TWO diamonds positioned so adjacent rows
              interlock — typical diamond / tread plate pattern. */}
          <Pattern
            id="plate"
            x="0"
            y="0"
            width={TILE}
            height={TILE}
            patternUnits="userSpaceOnUse"
          >
            {/* Row 1 diamond — slightly thin, oriented down-right */}
            <G>
              <Path
                d={`M ${TILE * 0.18} ${TILE * 0.4}
                    L ${TILE * 0.5} ${TILE * 0.18}
                    L ${TILE * 0.82} ${TILE * 0.4}
                    L ${TILE * 0.5} ${TILE * 0.5}
                    Z`}
                fill="url(#diamondGrad)"
              />
              {/* polished highlight ridge */}
              <Path
                d={`M ${TILE * 0.22} ${TILE * 0.4}
                    L ${TILE * 0.5} ${TILE * 0.22}
                    L ${TILE * 0.78} ${TILE * 0.4}`}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
                fill="none"
              />
            </G>
            {/* Row 2 diamond — same shape, offset half-tile */}
            <G>
              <Path
                d={`M ${TILE * 0.68} ${TILE * 0.9}
                    L ${TILE * 1.0} ${TILE * 0.68}
                    L ${TILE * 1.32} ${TILE * 0.9}
                    L ${TILE * 1.0} ${TILE * 1.0}
                    Z`}
                fill="url(#diamondGrad)"
              />
              <Path
                d={`M ${TILE * 0.72} ${TILE * 0.9}
                    L ${TILE * 1.0} ${TILE * 0.72}
                    L ${TILE * 0.96} ${TILE * 0.9}`}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
                fill="none"
              />
            </G>
          </Pattern>
        </Defs>

        {/* Base gradient fill */}
        <Rect x="0" y="0" width={W} height={H} fill="url(#bgGrad)" />
        {/* Apply tiled diamond pattern on top */}
        <Rect x="0" y="0" width={W} height={H} fill="url(#plate)" />
        {/* Subtle dark grit overlay so the diamonds don't look too clean */}
        <Rect
          x="0"
          y="0"
          width={W}
          height={H}
          fill="#000000"
          opacity="0.18"
        />
      </Svg>
    </View>
  );
}

export default DiamondPlate;
