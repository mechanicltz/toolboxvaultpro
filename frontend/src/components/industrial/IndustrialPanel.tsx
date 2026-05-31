/**
 * IndustrialPanel — a bolted steel frame container.
 *
 * Renders the `panel_large_dark` image as a stretchable background and lays
 * the children inside generous padding so they fall within the painted
 * frame border (not under the painted bolts).
 *
 * If the asset hasn't been generated yet, falls back to a code-rendered
 * card with the same visual intent so the app keeps working.
 */
import React from "react";
import { Image, ImageBackground, ImageSourcePropType, StyleSheet, View, ViewStyle } from "react-native";
import { useIndustrialTheme } from "./IndustrialThemeContext";
import { getAsset } from "./assets";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Inner padding override (px). Defaults to 32×36 to clear the painted bolts. */
  padding?: { horizontal?: number; vertical?: number };
  testID?: string;
}

export function IndustrialPanel({ children, style, padding, testID }: Props) {
  const { palette } = useIndustrialTheme();
  const src = getAsset("panel_large_dark");
  // Bigger default padding so children stay INSIDE the painted steel border
  // and clear the painted bolts at the corners + side midpoints.
  const padH = padding?.horizontal ?? 38;
  const padV = padding?.vertical ?? 48;

  const inner = (
    <View style={[styles.inner, { paddingHorizontal: padH, paddingVertical: padV }]} testID={testID}>
      {children}
    </View>
  );

  if (src) {
    return (
      <View style={[styles.outer, style]}>
        <ImageBackground source={src} resizeMode="stretch" style={styles.bg} imageStyle={styles.bgImg}>
          {inner}
        </ImageBackground>
      </View>
    );
  }

  // Fallback: coded steel card with orange border + 6 bolt sprites
  return (
    <View style={[styles.outer, style]}>
      <View style={[styles.fallbackBg, { backgroundColor: palette.steel }]} />
      <View style={[styles.fallbackBorder, { borderColor: palette.accent }]} pointerEvents="none" />
      <Bolt position={{ top: -7, left: -7 }} />
      <Bolt position={{ top: -7, right: -7 }} />
      <Bolt position={{ bottom: -7, left: -7 }} />
      <Bolt position={{ bottom: -7, right: -7 }} />
      <Bolt position={{ top: "50%", left: -7, marginTop: -7 }} />
      <Bolt position={{ top: "50%", right: -7, marginTop: -7 }} />
      {inner}
    </View>
  );
}

function Bolt({ position }: { position: any }) {
  return (
    <View
      style={[
        styles.bolt,
        position,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  outer: {
    position: "relative",
  },
  bg: { width: "100%" },
  bgImg: {},
  inner: {
    width: "100%",
  },
  fallbackBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    opacity: 0.85,
  },
  fallbackBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderRadius: 8,
  },
  bolt: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#0e0e0e",
    borderWidth: 1.5,
    borderColor: "#4a4a4a",
    zIndex: 10,
  },
});
