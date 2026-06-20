/**
 * TbvListPanel — a FILL-PARENT industrial container (sibling to TbvFrame).
 *
 * TbvFrame measures its CHILD height and grows to fit — perfect for cards whose
 * size is driven by content. But a virtualized <FlatList/> needs a BOUNDED,
 * flex-filling parent to scroll inside. TbvListPanel solves that: it stretches
 * to fill the space its `style` (e.g. { flex: 1 }) gives it, measures its OWN
 * laid-out box, and paints the same crisp 9-slice metal frame as a background.
 * Children render on top with padding to clear the rails — so an entire
 * scrolling list lives inside ONE metal panel instead of one frame per row.
 *
 * Cross-platform 9-slice identical to TbvFrame (iOS + Android + web).
 */
import React, { useState } from "react";
import {
  View,
  Image,
  StyleSheet,
  StyleProp,
  ViewStyle,
  ImageSourcePropType,
} from "react-native";

export interface TbvListPanelProps {
  source: ImageSourcePropType;
  capInsets?: { top: number; left: number; bottom: number; right: number; w?: number; h?: number };
  frameScale?: number;
  padX?: number;
  padTop?: number;
  padBottom?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  testID?: string;
}

function resolveSize(source: ImageSourcePropType): { width: number; height: number } | null {
  const fn = (Image as any).resolveAssetSource;
  if (typeof fn === "function") {
    try {
      const r = fn(source);
      if (r && r.width && r.height) return { width: r.width, height: r.height };
    } catch {
      /* fall through */
    }
  }
  return null;
}

/** One clipped tile: maps a source sub-rect → a destination rect, no smear. */
function Slice({
  source, SW, SH, x, y, dw, dh, sx, sy, sw, sh,
}: {
  source: ImageSourcePropType;
  SW: number; SH: number; x: number; y: number; dw: number; dh: number;
  sx: number; sy: number; sw: number; sh: number;
}) {
  if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return null;
  const scaleX = dw / sw;
  const scaleY = dh / sh;
  return (
    <View style={{ position: "absolute", left: x, top: y, width: dw, height: dh, overflow: "hidden" }}>
      <Image
        source={source}
        fadeDuration={0}
        resizeMode="stretch"
        style={{
          position: "absolute",
          width: SW * scaleX,
          height: SH * scaleY,
          left: -sx * scaleX,
          top: -sy * scaleY,
        }}
      />
    </View>
  );
}

export function TbvListPanel({
  source,
  capInsets,
  frameScale = 1,
  padX = 16,
  padTop = 14,
  padBottom = 8,
  style,
  children,
  testID,
}: TbvListPanelProps) {
  // Measure our OWN laid-out box (driven by `style`, e.g. flex:1).
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);

  const resolved = resolveSize(source);
  const SW = capInsets?.w || resolved?.width || 0;
  const SH = capInsets?.h || resolved?.height || 0;

  const cl = capInsets?.left ?? 0;
  const cr = capInsets?.right ?? 0;
  const ct = capInsets?.top ?? 0;
  const cb = capInsets?.bottom ?? 0;

  // Rendered rail thickness (points). frameScale<1 shrinks the full corner art
  // crisply so the metal border looks thinner without clipping — matches TbvFrame.
  const s = frameScale > 0 ? frameScale : 1;
  const rl = cl * s;
  const rr = cr * s;
  const rt = ct * s;
  const rb = cb * s;

  const canSlice =
    !!capInsets && SW > 0 && SH > 0 && w > 0 && h > 0 && cl + cr < SW && ct + cb < SH && rl + rr < w && rt + rb < h;

  const midW = w - rl - rr;
  const midH = h - rt - rb;
  const sMidW = SW - cl - cr;
  const sMidH = SH - ct - cb;

  return (
    <View
      style={[{ overflow: "hidden" }, style]}
      testID={testID}
      onLayout={(e) => {
        const nw = e.nativeEvent.layout.width;
        const nh = e.nativeEvent.layout.height;
        if (Math.abs(nw - w) > 0.5) setW(nw);
        if (Math.abs(nh - h) > 0.5) setH(nh);
      }}
    >
      {canSlice ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Slice source={source} SW={SW} SH={SH} x={0} y={0} dw={rl} dh={rt} sx={0} sy={0} sw={cl} sh={ct} />
          <Slice source={source} SW={SW} SH={SH} x={rl} y={0} dw={midW} dh={rt} sx={cl} sy={0} sw={sMidW} sh={ct} />
          <Slice source={source} SW={SW} SH={SH} x={w - rr} y={0} dw={rr} dh={rt} sx={SW - cr} sy={0} sw={cr} sh={ct} />
          <Slice source={source} SW={SW} SH={SH} x={0} y={rt} dw={rl} dh={midH} sx={0} sy={ct} sw={cl} sh={sMidH} />
          <Slice source={source} SW={SW} SH={SH} x={rl} y={rt} dw={midW} dh={midH} sx={cl} sy={ct} sw={sMidW} sh={sMidH} />
          <Slice source={source} SW={SW} SH={SH} x={w - rr} y={rt} dw={rr} dh={midH} sx={SW - cr} sy={ct} sw={cr} sh={sMidH} />
          <Slice source={source} SW={SW} SH={SH} x={0} y={h - rb} dw={rl} dh={rb} sx={0} sy={SH - cb} sw={cl} sh={cb} />
          <Slice source={source} SW={SW} SH={SH} x={rl} y={h - rb} dw={midW} dh={rb} sx={cl} sy={SH - cb} sw={sMidW} sh={cb} />
          <Slice source={source} SW={SW} SH={SH} x={w - rr} y={h - rb} dw={rr} dh={rb} sx={SW - cr} sy={SH - cb} sw={cr} sh={cb} />
        </View>
      ) : (
        <Image
          source={source}
          resizeMode="stretch"
          capInsets={capInsets}
          fadeDuration={0}
          style={StyleSheet.absoluteFill}
        />
      )}

      <View style={{ flex: 1, paddingHorizontal: padX, paddingTop: padTop, paddingBottom: padBottom }}>
        {children}
      </View>
    </View>
  );
}

export default TbvListPanel;
