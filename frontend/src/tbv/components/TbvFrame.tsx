/**
 * TbvFrame — the universal industrial container for the whole app.
 *
 * Renders one of the REAL trimmed metal frame PNGs (from assets/tbv-v2/trimmed,
 * the exact set the LOCKED login screen uses) behind padded content, so every
 * card / widget / section looks like it came off the SAME machine as login.
 *
 * 9-SLICE (capInsets): the frame art has ornate corner bolts + top/bottom rails
 * that smear if the whole PNG is stretched. capInsets freezes those corner +
 * edge regions and stretches ONLY the flat center, so the frame wraps ANY
 * content height with crisp corners.
 *
 * EXPLICIT HEIGHT (critical iOS fix): the skin Image stretches to fill the
 * frame only when its parent has a DEFINITE height. A content-driven (auto)
 * height leaves the image unable to stretch on iOS — the frame art collapses to
 * its natural aspect and the lower content spills OUTSIDE the metal (see
 * app/login.tsx PANEL HEIGHT notes). Fix: MEASURE the inner content with
 * onLayout, then drive the frame's explicit height from it. The Image is given
 * the same explicit numeric height so it covers edge-to-edge identically.
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
  /** A trimmed frame PNG (e.g. SKIN.card, SKIN.panelFrame). */
  source: ImageSourcePropType;
  /** 9-slice cap insets in source pixels (use CAP.card / CAP.panel etc.). */
  capInsets?: { top: number; left: number; bottom: number; right: number };
  /** Inner content padding to clear the frame rails. */
  padX?: number;
  padTop?: number;
  padBottom?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  testID?: string;
}

export function TbvFrame({
  source,
  capInsets,
  padX = 18,
  padTop = 18,
  padBottom = 18,
  style,
  children,
  testID,
}: TbvFrameProps) {
  // Measured height of the padded inner content (incl. padding). Drives the
  // frame's explicit height so the metal art always wraps the content exactly.
  const [h, setH] = useState(0);

  return (
    <View
      style={[styles.wrap, h ? { height: h } : null, style]}
      testID={testID}
    >
      <Image
        source={source}
        resizeMode="stretch"
        capInsets={capInsets}
        fadeDuration={0}
        style={[
          StyleSheet.absoluteFill,
          h ? { width: "100%", height: h } : null,
        ]}
      />
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", overflow: "hidden" },
});

export default TbvFrame;
