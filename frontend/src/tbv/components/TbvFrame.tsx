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
 * content height with crisp corners. iOS honours capInsets natively; web /
 * Android gracefully fall back to a plain stretch (device target is iOS).
 *
 * Height is CONTENT-DRIVEN: the absolute-fill Image fills whatever height the
 * padded children resolve to — no fixed height / no overflow.
 */
import React from "react";
import {
  View,
  Image,
  StyleSheet,
  StyleProp,
  ViewStyle,
  ImageSourcePropType,
} from "react-native";

export interface TbvFrameProps {
  /** A trimmed frame PNG (e.g. SKIN.card, SKIN.panel). */
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
  return (
    <View style={[styles.wrap, style]} testID={testID}>
      <Image
        source={source}
        resizeMode="stretch"
        capInsets={capInsets}
        style={StyleSheet.absoluteFill}
        fadeDuration={0}
      />
      <View
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
