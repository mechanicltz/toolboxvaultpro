/**
 * TbvFrame — the universal industrial container for the whole app.
 *
 * Renders one of the REAL trimmed metal frame PNGs (from assets/tbv-v2/trimmed,
 * the exact set the LOCKED login screen uses) behind padded content, so every
 * card / widget / section looks like it came off the SAME machine as login.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * TRUE CROSS-PLATFORM 9-SLICE (iOS + Android + Web)
 * ──────────────────────────────────────────────────────────────────────────
 * The frame art has ornate corner bolts + top/bottom rails that SMEAR if the
 * whole PNG is stretched. We keep them crisp on EVERY platform by drawing the
 * frame as nine independently-clipped tiles instead of relying on the iOS-only
 * `capInsets` prop (which Android & web silently ignore, leaving stretched
 * corners):
 *
 *     ┌────────┬──────────────┬────────┐
 *     │  TL    │   TOP edge   │   TR   │   ← corners fixed, top edge stretches X
 *     ├────────┼──────────────┼────────┤
 *     │  LEFT  │    CENTER    │ RIGHT  │   ← side edges stretch Y, center both
 *     ├────────┼──────────────┼────────┤
 *     │  BL    │ BOTTOM edge  │   BR   │   ← corners fixed, bottom edge X
 *     └────────┴──────────────┴────────┘
 *
 * Each tile is a `View` with `overflow:'hidden'` containing the FULL frame
 * image, scaled + offset so only that tile's source region shows through. The
 * four corner tiles never stretch (scale = 1 on both axes), so their bolts stay
 * razor-sharp regardless of how tall/wide the frame grows. This is plain
 * Image + flex + absolute positioning — identical output on iOS, Android, web.
 *
 * EXPLICIT SIZE: we MEASURE the inner content height (onLayout) and the wrap
 * width (onLayout) so the nine tiles can be positioned with exact numeric
 * geometry. Until both are known we paint nothing (one-frame settle, same as
 * the previous implementation).
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

export interface TbvFrameProps {
  /** A trimmed frame PNG (e.g. SKIN.window, SKIN.plate). */
  source: ImageSourcePropType;
  /**
   * 9-slice cap insets in SOURCE-IMAGE pixels (use CAP.window / CAP.plate).
   * Optional `w`/`h` carry the frame's intrinsic logical size so the slice
   * geometry works on every platform without relying on the iOS/native-only
   * `Image.resolveAssetSource` (which is absent on react-native-web).
   */
  capInsets?: { top: number; left: number; bottom: number; right: number; w?: number; h?: number };
  /**
   * Optional uniform scale (0–1) for how THICK the frame rails render, without
   * cropping any of the corner art. The full corner/rail source region is still
   * drawn (so nothing is clipped) but shrunk to `inset * frameScale` points — a
   * crisp down-scale that makes the metal border thinner while keeping the
   * chamfered corners razor-sharp. Defaults to 1 (rails render at source size,
   * unchanged behaviour for every existing skin).
   */
  frameScale?: number;
  /** Inner content padding to clear the frame rails. */
  padX?: number;
  padTop?: number;
  padBottom?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  testID?: string;
  /** Optional accent stripe painted down the left edge (over the frame rail). */
  leftStripe?: string;
}

/** Safe asset-size resolver — uses the platform API when present, else null. */
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
  source,
  SW,
  SH,
  x,
  y,
  dw,
  dh,
  sx,
  sy,
  sw,
  sh,
}: {
  source: ImageSourcePropType;
  SW: number;
  SH: number;
  x: number;
  y: number;
  dw: number;
  dh: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}) {
  if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return null;
  // Scale needed to map the source sub-rect onto the destination rect.
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

export function TbvFrame({
  source,
  capInsets,
  frameScale = 1,
  padX = 18,
  padTop = 18,
  padBottom = 18,
  style,
  children,
  testID,
  leftStripe,
}: TbvFrameProps) {
  // Measured inner-content height (incl. padding) and the wrap's pixel width.
  const [h, setH] = useState(0);
  const [w, setW] = useState(0);

  // Resolve the frame's intrinsic logical pixel size so the slice math knows
  // where the cap regions sit inside the source art. Prefer the explicit
  // w/h carried on the cap object (works on web), fall back to the native
  // asset resolver.
  const resolved = resolveSize(source);
  const SW = capInsets?.w || resolved?.width || 0;
  const SH = capInsets?.h || resolved?.height || 0;

  // Cap insets in source pixels — how much of the ART is the frozen corner/rail.
  const cl = capInsets?.left ?? 0;
  const cr = capInsets?.right ?? 0;
  const ct = capInsets?.top ?? 0;
  const cb = capInsets?.bottom ?? 0;

  // Rendered rail thickness in POINTS. `frameScale` < 1 draws the full corner
  // art shrunk down (crisp), so the metal border looks thinner without clipping.
  const s = frameScale > 0 ? frameScale : 1;
  const rl = cl * s;
  const rr = cr * s;
  const rt = ct * s;
  const rb = cb * s;

  const canSlice =
    !!capInsets && SW > 0 && SH > 0 && w > 0 && h > 0 && cl + cr < SW && ct + cb < SH && rl + rr < w && rt + rb < h;

  // Center band sizes in DESTINATION points (using the rendered rail thickness).
  const midW = w - rl - rr;
  const midH = h - rt - rb;
  // Center band sizes in SOURCE pixels.
  const sMidW = SW - cl - cr;
  const sMidH = SH - ct - cb;

  return (
    <View
      style={[styles.wrap, h ? { height: h } : null, style]}
      testID={testID}
      onLayout={(e) => {
        const nw = e.nativeEvent.layout.width;
        if (Math.abs(nw - w) > 0.5) setW(nw);
      }}
    >
      {canSlice ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Row 1 — top-left corner, top edge, top-right corner */}
          <Slice source={source} SW={SW} SH={SH} x={0} y={0} dw={rl} dh={rt} sx={0} sy={0} sw={cl} sh={ct} />
          <Slice source={source} SW={SW} SH={SH} x={rl} y={0} dw={midW} dh={rt} sx={cl} sy={0} sw={sMidW} sh={ct} />
          <Slice source={source} SW={SW} SH={SH} x={w - rr} y={0} dw={rr} dh={rt} sx={SW - cr} sy={0} sw={cr} sh={ct} />
          {/* Row 2 — left edge, center fill, right edge */}
          <Slice source={source} SW={SW} SH={SH} x={0} y={rt} dw={rl} dh={midH} sx={0} sy={ct} sw={cl} sh={sMidH} />
          <Slice source={source} SW={SW} SH={SH} x={rl} y={rt} dw={midW} dh={midH} sx={cl} sy={ct} sw={sMidW} sh={sMidH} />
          <Slice source={source} SW={SW} SH={SH} x={w - rr} y={rt} dw={rr} dh={midH} sx={SW - cr} sy={ct} sw={cr} sh={sMidH} />
          {/* Row 3 — bottom-left corner, bottom edge, bottom-right corner */}
          <Slice source={source} SW={SW} SH={SH} x={0} y={h - rb} dw={rl} dh={rb} sx={0} sy={SH - cb} sw={cl} sh={cb} />
          <Slice source={source} SW={SW} SH={SH} x={rl} y={h - rb} dw={midW} dh={rb} sx={cl} sy={SH - cb} sw={sMidW} sh={cb} />
          <Slice source={source} SW={SW} SH={SH} x={w - rr} y={h - rb} dw={rr} dh={rb} sx={SW - cr} sy={SH - cb} sw={cr} sh={cb} />
        </View>
      ) : (
        // Fallback: no capInsets / not yet measured → plain stretched frame so
        // there's never a missing background (corners may stretch in this path).
        <Image
          source={source}
          resizeMode="stretch"
          capInsets={capInsets}
          fadeDuration={0}
          style={[StyleSheet.absoluteFill, h ? { width: "100%", height: h } : null]}
        />
      )}

      <View
        onLayout={(e) => {
          const nh = e.nativeEvent.layout.height;
          if (Math.abs(nh - h) > 0.5) setH(nh);
        }}
        style={{
          paddingHorizontal: padX,
          paddingTop: padTop,
          paddingBottom: padBottom,
        }}
      >
        {children}
      </View>

      {leftStripe ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            backgroundColor: leftStripe,
            zIndex: 5,
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", overflow: "hidden" },
});

export default TbvFrame;
