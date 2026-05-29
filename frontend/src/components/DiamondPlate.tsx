// =============================================================================
// DiamondPlate.tsx
// -----------------------------------------------------------------------------
// Industrial diamond / tread plate background. Real diamond plate has long,
// narrow embossed "eye" dashes (rugby-ball shapes) arranged in a herringbone
// hatch — every row tilts the opposite direction of the row above it.
//
//   Row 1:  \\\\\\\\\\\\\\\\
//   Row 2:  ////////////////
//   Row 3:  \\\\\\\\\\\\\\\\
//   Row 4:  ////////////////
//
// Drawn entirely in SVG so it scales crisply at any size with zero image
// assets. Sits absolutely behind everything and never intercepts touches.
//
//   Usage:
//     <View style={{ flex: 1 }}>
//       <DiamondPlate />
//       {/* …screen content goes on top… */}
//     </View>
// =============================================================================

import React, { useMemo } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Path,
  Rect,
  G,
} from "react-native-svg";

type Props = {
  /** Base colour (defaults to a polished silver-grey). */
  baseColor?: string;
  /** Optional opacity override on the dashes. Default 1.0. */
  intensity?: number;
};

const DASH_W = 9;      // dash thickness
const DASH_H = 32;     // dash length
const DASH_TILT = 32;  // degrees off vertical
const ROW_GAP_X = 38;  // horizontal spacing between dashes in a row
const ROW_GAP_Y = 26;  // vertical spacing between rows (alternates tilt)

// Build the "lens / rugby ball" outline path (sharp tips, rounded belly)
function dashPath(cx: number, cy: number, w: number, h: number): string {
  // Construct a 4-control-point Bezier lens shape symmetric about cy
  const halfW = w / 2;
  const halfH = h / 2;
  const topX = cx;
  const topY = cy - halfH;
  const botX = cx;
  const botY = cy + halfH;
  const leftX = cx - halfW;
  const leftY = cy;
  const rightX = cx + halfW;
  const rightY = cy;
  // M top → curve down-right via right belly → curve down-left to bottom
  // → curve up-left via left belly → close
  return `M ${topX} ${topY}
          C ${topX + halfW * 0.55} ${topY + halfH * 0.25}, ${rightX} ${rightY - halfH * 0.5}, ${rightX} ${rightY}
          C ${rightX} ${rightY + halfH * 0.5}, ${botX + halfW * 0.55} ${botY - halfH * 0.25}, ${botX} ${botY}
          C ${botX - halfW * 0.55} ${botY - halfH * 0.25}, ${leftX} ${leftY + halfH * 0.5}, ${leftX} ${leftY}
          C ${leftX} ${leftY - halfH * 0.5}, ${topX - halfW * 0.55} ${topY + halfH * 0.25}, ${topX} ${topY} Z`;
}

export function DiamondPlate({
  baseColor = "#A8AAAD",
  intensity = 1,
}: Props) {
  const { width, height } = useWindowDimensions();
  const W = Math.ceil(width) + ROW_GAP_X;
  const H = Math.ceil(height) + ROW_GAP_Y * 4;

  // Pre-compute dash positions so we render a fixed array of paths.
  // For each row we emit a tilt direction (alternates) and a horizontal offset
  // so neighbouring rows interlock.
  const rows = useMemo(() => {
    const out: { tilt: number; offsetX: number; y: number }[] = [];
    let row = 0;
    for (let y = ROW_GAP_Y / 2; y < H; y += ROW_GAP_Y) {
      const tilt = row % 2 === 0 ? -DASH_TILT : DASH_TILT;
      const offsetX = row % 2 === 0 ? 0 : ROW_GAP_X / 2;
      out.push({ tilt, offsetX, y });
      row++;
    }
    return out;
  }, [H]);

  const dashesInRow = Math.ceil(W / ROW_GAP_X) + 1;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          {/* Base "polished steel" gradient — light center, slightly darker edges */}
          <LinearGradient id="plateBase" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#BFC1C4" stopOpacity="1" />
            <Stop offset="50%" stopColor={baseColor} stopOpacity="1" />
            <Stop offset="100%" stopColor="#7C7E81" stopOpacity="1" />
          </LinearGradient>

          {/* Each embossed dash uses a gradient that goes
              white-ish at the top → mid grey → dark grey at the bottom
              to fake 3-D lighting. */}
          <LinearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={intensity} />
            <Stop offset="40%" stopColor="#D5D6D8" stopOpacity={intensity} />
            <Stop offset="100%" stopColor="#3F4143" stopOpacity={intensity} />
          </LinearGradient>
        </Defs>

        {/* Base plate */}
        <Rect x="0" y="0" width={W} height={H} fill="url(#plateBase)" />

        {/* Brushed-metal vertical streaks — many thin semi-opaque lines
            give the surface a metallic-brushed feel without a real image. */}
        {Array.from({ length: 90 }).map((_, i) => {
          const x = (i * (W / 90)) + (i % 3 === 0 ? 0.5 : 0);
          const op = 0.04 + (i % 5) * 0.015;
          return (
            <Path
              key={`brush-${i}`}
              d={`M ${x} 0 L ${x} ${H}`}
              stroke="#FFFFFF"
              strokeWidth={i % 7 === 0 ? 0.9 : 0.4}
              strokeOpacity={op}
            />
          );
        })}
        {Array.from({ length: 60 }).map((_, i) => {
          const x = (i * (W / 60)) + 1.7;
          const op = 0.05 + (i % 4) * 0.02;
          return (
            <Path
              key={`brushd-${i}`}
              d={`M ${x} 0 L ${x} ${H}`}
              stroke="#000000"
              strokeWidth={i % 9 === 0 ? 0.9 : 0.35}
              strokeOpacity={op}
            />
          );
        })}

        {/* Dashes — render every row */}
        {rows.map((r, ri) =>
          Array.from({ length: dashesInRow }).map((_, ci) => {
            const cx = r.offsetX + ci * ROW_GAP_X + ROW_GAP_X / 2;
            const cy = r.y;
            return (
              <G
                key={`dash-${ri}-${ci}`}
                transform={`rotate(${r.tilt} ${cx} ${cy})`}
              >
                {/* drop shadow under the dash for depth */}
                <Path
                  d={dashPath(cx, cy + 1.4, DASH_W, DASH_H)}
                  fill="#000000"
                  opacity={0.45}
                />
                {/* the dash itself */}
                <Path
                  d={dashPath(cx, cy, DASH_W, DASH_H)}
                  fill="url(#dashGrad)"
                />
                {/* polished top highlight */}
                <Path
                  d={`M ${cx - DASH_W * 0.32} ${cy - DASH_H * 0.30}
                      Q ${cx} ${cy - DASH_H * 0.45} ${cx + DASH_W * 0.18} ${cy - DASH_H * 0.20}`}
                  stroke="#FFFFFF"
                  strokeOpacity={0.75}
                  strokeWidth={1.1}
                  fill="none"
                  strokeLinecap="round"
                />
              </G>
            );
          })
        )}

        {/* Subtle dark vignette so the plate feels grounded */}
        <Rect
          x="0"
          y="0"
          width={W}
          height={H}
          fill="#000000"
          opacity="0.08"
        />
      </Svg>
    </View>
  );
}

export default DiamondPlate;
