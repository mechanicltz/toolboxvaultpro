/**
 * IndustrialPanel — industrial bolted frame container.
 * Uses tbv_panel_frame asset selectively (Login, Splash, Empty States).
 * For operational screens prefer IndustrialCard instead.
 */
import React from "react";
import { ImageBackground, StyleSheet, View, ViewStyle } from "react-native";
import { useTBV } from "./TBVThemeContext";
import { usePanelFrame } from "./tbvAssets";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** If true, renders the textured panel-frame background. */
  framed?: boolean;
  padding?: { horizontal?: number; vertical?: number };
  testID?: string;
}

export function IndustrialPanel({ children, style, framed = true, padding, testID }: Props) {
  const { palette, radius } = useTBV();
  const src = usePanelFrame();
  // Generous default padding so content sits inside the painted frame border.
  const padH = padding?.horizontal ?? (framed ? 30 : 16);
  const padV = padding?.vertical ?? (framed ? 36 : 16);
  const inner = (
    <View style={[{ paddingHorizontal: padH, paddingVertical: padV }, styles.inner]} testID={testID}>
      {children}
    </View>
  );
  if (framed && src) {
    return (
      <View style={[styles.outer, style as any]}>
        <ImageBackground source={src} resizeMode="stretch" style={styles.bg}>
          {inner}
        </ImageBackground>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.outer,
        {
          backgroundColor: palette.card,
          borderColor: palette.border,
          borderWidth: 1,
          borderRadius: radius.lg,
        },
        style as any,
      ]}
    >
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { overflow: "hidden" },
  bg: { width: "100%" },
  inner: { width: "100%" },
});
