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
import { View, Text, StyleSheet, Image, useWindowDimensions } from "react-native";
import { SKIN } from "../tbv/skins";
import { useColors } from "../themeContext";
import { APP_VERSION_LABEL } from "../version";

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
  const c = useColors();
  // Match the LOGIN page nameplate size exactly: width = min(94% of the
  // screen width, 400), height derived from the master nameplate ratio.
  const { width } = useWindowDimensions();
  const nameplateW = Math.min(width * 0.94, 400);
  const nameplateH = nameplateW / 3.746;
  return (
    <View style={styles.wrap}>
      {/* The constant brand nameplate — same size + look as the login page.
          The app version is stamped just under the "VAULT" word (right side of
          the plate), so it appears on every screen as part of the header. */}
      <View style={{ width: nameplateW, alignSelf: "center", marginBottom: 6 }}>
        <Image
          source={SKIN.nameplate}
          style={{ width: nameplateW, height: nameplateH }}
          resizeMode="contain"
          fadeDuration={0}
        />
        <Text
          style={[styles.version, { marginRight: nameplateW * 0.16, marginTop: -nameplateH * 0.245 }]}
          allowFontScaling={false}
        >
          {APP_VERSION_LABEL}
        </Text>
      </View>

      {/* Label row: back (left) · PAGE NAME (center) · action (right). */}
      <View style={styles.labelRow}>
        {leftSlot ? <View style={styles.leftSlot}>{leftSlot}</View> : null}
        <View style={styles.titleCol}>
          <Text style={styles.title} numberOfLines={1} allowFontScaling={false}>
            {(title || "").toUpperCase()}
          </Text>
          {!!subtitle && (
            <Text
              style={[styles.subtitle, { color: c.textSecondary }]}
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
    backgroundColor: "transparent",
    paddingTop: 8,
    paddingBottom: 8,
  },
  nameplate: {
    alignSelf: "center",
    marginBottom: 6,
  },
  version: {
    alignSelf: "flex-end",
    color: ACCENT,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
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
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2.5,
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
