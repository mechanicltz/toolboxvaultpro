// =====================================================================
// OrnateFramePanel  —  recolorable vector recreation of reference #3
// (aged-parchment panel with a fine double border + corner & center
//  flourishes). Pure react-native-svg so it stays razor-sharp at any
//  size and can be painted ANY colour from a single `tint` value, which
//  makes it drop-in usable as a per-theme container.
// =====================================================================
import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Rect,
  G,
  Polygon,
  Line,
} from "react-native-svg";

// ---------- colour helpers ----------
const clamp = (n: number) => Math.max(0, Math.min(255, n));
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
function rgbToHex(r: number, g: number, b: number) {
  const s = (n: number) => clamp(Math.round(n)).toString(16).padStart(2, "0");
  return `#${s(r)}${s(g)}${s(b)}`;
}
/** Blend `hex` toward `target` by `amt` (0..1). */
export function mix(hex: string, target: string, amt: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex(
    a.r + (b.r - a.r) * amt,
    a.g + (b.g - a.g) * amt,
    a.b + (b.b - a.b) * amt
  );
}

/** Readable text/accent palette derived from a single tint — for content
 *  placed inside the (light) parchment frame. */
export function makeTone(tint: string) {
  return {
    accent: mix(tint, "#000000", 0.12),
    title: mix(tint, "#000000", 0.58),
    label: mix(tint, "#000000", 0.46),
    value: mix(tint, "#000000", 0.64),
    divider: mix(tint, "#000000", 0.22),
    pillBorder: mix(tint, "#000000", 0.32),
    pillBg: mix(tint, "#FFFFFF", 0.55),
  };
}

const diamond = (cx: number, cy: number, s: number) =>
  `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`;

type Props = {
  tint: string;
  width: number;
  height: number;
  padding?: number;
  children?: React.ReactNode;
};

export default function OrnateFramePanel({
  tint,
  width: W,
  height: H,
  padding = 28,
  children,
}: Props) {
  const border = mix(tint, "#000000", 0.08);
  const borderHi = mix(tint, "#FFFFFF", 0.45);
  const paperTop = mix(tint, "#FFFFFF", 0.91);
  const paperBot = mix(tint, "#FFFFFF", 0.79);
  const vig = mix(tint, "#000000", 0.4);

  const OM = 6; // outer border margin
  const IM = 13; // inner border margin
  const cd = 6.5; // corner diamond half-size

  const corners: [number, number][] = [
    [IM, IM],
    [W - IM, IM],
    [W - IM, H - IM],
    [IM, H - IM],
  ];
  const centers: [number, number][] = [
    [W / 2, OM],
    [W / 2, H - OM],
  ];

  return (
    <View style={{ width: W, height: H }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="paper" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={paperTop} />
            <Stop offset="100%" stopColor={paperBot} />
          </LinearGradient>
          <RadialGradient id="vig" cx="50%" cy="50%" rx="72%" ry="66%">
            <Stop offset="55%" stopColor={vig} stopOpacity="0" />
            <Stop offset="100%" stopColor={vig} stopOpacity="0.26" />
          </RadialGradient>
        </Defs>

        {/* parchment background + aged-edge vignette */}
        <Rect x={3} y={3} width={W - 6} height={H - 6} rx={12} fill="url(#paper)" />
        <Rect x={3} y={3} width={W - 6} height={H - 6} rx={12} fill="url(#vig)" />

        {/* outer + inner border lines */}
        <Rect
          x={OM}
          y={OM}
          width={W - OM * 2}
          height={H - OM * 2}
          rx={9}
          fill="none"
          stroke={border}
          strokeWidth={2.4}
        />
        <Rect
          x={IM}
          y={IM}
          width={W - IM * 2}
          height={H - IM * 2}
          rx={5}
          fill="none"
          stroke={border}
          strokeWidth={1}
          opacity={0.7}
        />

        {/* corner flourishes */}
        {corners.map(([x, y], i) => (
          <G key={`corner-${i}`}>
            <Polygon points={diamond(x, y, cd)} fill={border} />
            <Polygon points={diamond(x, y, cd - 3)} fill={borderHi} />
          </G>
        ))}

        {/* top & bottom centre flourishes */}
        {centers.map(([x, y], i) => (
          <G key={`center-${i}`}>
            <Line x1={x - 26} y1={y} x2={x - 9} y2={y} stroke={border} strokeWidth={1.4} />
            <Line x1={x + 9} y1={y} x2={x + 26} y2={y} stroke={border} strokeWidth={1.4} />
            <Polygon points={diamond(x, y, 5)} fill={border} />
            <Polygon points={diamond(x, y, 2.4)} fill={borderHi} />
          </G>
        ))}
      </Svg>

      <View
        style={{
          position: "absolute",
          left: padding,
          right: padding,
          top: padding,
          bottom: padding,
        }}
      >
        {children}
      </View>
    </View>
  );
}
