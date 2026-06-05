// =============================================================================
// IndustrialBanner.tsx
// -----------------------------------------------------------------------------
// The UNIFIED page header used at the top of EVERY screen, in EVERY theme.
//
//   ┌──────────────────────────────────────────────┐
//   │            [ TOOLBOX VAULT nameplate ]         │   ← constant PNG, all themes
//   │  ‹back            PAGE NAME            action › │   ← label row under plate
//   └──────────────────────────────────────────────┘
//
// • The "TOOLBOX VAULT" metal nameplate PNG is shown on top of a dark
//   industrial strip — identical regardless of the app's skin/light/dark
//   theme, so the brand reads the same everywhere.
// • Directly beneath it sits the page name (the `title` prop), e.g. the Home
//   screen passes "SUMMARY". An optional `subtitle` renders as a small line.
// • Any back button is passed via `leftSlot` and is integrated into that same
//   label row (left side); page actions go in `rightSlot` (right side).
//
// Because the strip is always dark, the existing white back-arrow icons that
// pages pass through `leftSlot` stay perfectly legible in light mode too.
//
// Per-page custom name graphics will replace the shared nameplate later — when
// those PNGs arrive, swap `SKIN.nameplate` for a per-page image prop.
// =============================================================================

import React from "react";
import { View, Text, StyleSheet, Image, Platform } from "react-native";
import { SKIN } from "../tbv/skins";

type Props = {
  /** Page name shown under the nameplate (uppercased automatically). */
  title: string;
  /** Optional small line under the page name. */
  subtitle?: string;
  /** Optional element on the right of the label row (e.g. an ADD button). */
  rightSlot?: React.ReactNode;
  /** Optional element on the left of the label row (e.g. a back arrow). */
  leftSlot?: React.ReactNode;
};

const ACCENT = "#F97316";

export function IndustrialBanner({ title, subtitle, rightSlot, leftSlot }: Props) {
  return (
    <View style={styles.wrap}>
      {/* The constant brand nameplate — same in every theme. */}
      <Image
        source={SKIN.nameplate}
        style={styles.nameplate}
        resizeMode="contain"
        fadeDuration={0}
      />

      {/* Label row: back (left) · PAGE NAME (center) · action (right). */}
      <View style={styles.labelRow}>
        {leftSlot ? <View style={styles.leftSlot}>{leftSlot}</View> : null}
        <View style={styles.titleCol}>
          <Text style={styles.title} numberOfLines={1} allowFontScaling={false}>
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

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#0E0E0E",
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(249,115,22,0.30)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 6 },
    }),
  },
  nameplate: {
    height: 44,
    aspectRatio: 3.746, // master nameplate intrinsic ratio
    alignSelf: "center",
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 26,
    paddingHorizontal: 16,
  },
  leftSlot: {
    position: "absolute",
    left: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  rightSlot: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "flex-end",
    maxWidth: "42%",
  },
  titleCol: {
    alignItems: "center",
    maxWidth: "66%",
  },
  title: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 3,
    textAlign: "center",
  },
  subtitle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 2,
    textAlign: "center",
  },
});

export default IndustrialBanner;
