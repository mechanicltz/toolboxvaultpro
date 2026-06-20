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
import { View, Text, StyleSheet, Image, TouchableOpacity, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKIN } from "../tbv/skins";
import { useColors, useSkin } from "../themeContext";
import { APP_VERSION } from "../version";
import {
  HEADER_SRC_BY_COLOR,
  HEADER_ASPECT,
  HEADER_VAULT_COLOR_BY_COLOR,
  HEADER_VERSION_POS,
} from "../tbv/header";

type Props = {
  /** Page name shown under the nameplate (uppercased automatically). */
  title: string;
  /** Optional small line under the page name. */
  subtitle?: string;
  /** Optional element on the right of the label row (e.g. an ADD button). */
  rightSlot?: React.ReactNode;
  /** Optional element on the left of the label row (e.g. a back arrow). */
  leftSlot?: React.ReactNode;
  /**
   * Convenience back button — renders a themed (variant-accent) arrow in the
   * left slot. Preferred over passing a hand-built leftSlot back button so the
   * icon recolours with the active skin (orange/crimson/arctic/emerald).
   */
  onBack?: () => void;
  /** Icon for the onBack button (default "arrow-back"). */
  backIcon?: keyof typeof Ionicons.glyphMap;
};

const ACCENT = "#F97316";

export function IndustrialBanner({ title, subtitle, rightSlot, leftSlot, onBack, backIcon }: Props) {
  const c = useColors();
  const { metalStyle, industrialVariant } = useSkin();
  // Steel theme swaps the dark iron nameplate for the brushed-silver "TOOLBOX
  // VAULT" plate (recoloured to the active steel colour), keeping the page
  // title + back row beneath it so every screen reads as Steel.
  const isSteel = metalStyle === "steel";
  const { width } = useWindowDimensions();
  const nameplateW = Math.min(width * 0.94, 400);
  const nameplateH = isSteel ? nameplateW / HEADER_ASPECT : nameplateW / 4.0;
  const nameplateSrc = isSteel ? HEADER_SRC_BY_COLOR[industrialVariant] : SKIN.nameplate;
  return (
    <View style={styles.wrap}>
      {/* The brand nameplate (silver for Steel, dark iron otherwise). The app
          version sits inside the small plate on the artwork. */}
      <View style={{ width: nameplateW, height: nameplateH, alignSelf: "center", marginBottom: 6 }}>
        <Image
          source={nameplateSrc}
          style={{ width: nameplateW, height: nameplateH }}
          resizeMode="contain"
          fadeDuration={0}
        />
        {isSteel ? (
          <Text
            pointerEvents="none"
            allowFontScaling={false}
            style={[
              styles.version,
              {
                position: "absolute",
                right: nameplateW * HEADER_VERSION_POS.rightPct,
                bottom: nameplateH * HEADER_VERSION_POS.bottomPct,
                color: HEADER_VAULT_COLOR_BY_COLOR[industrialVariant],
                fontSize: Math.round(nameplateH * 0.13),
              },
            ]}
          >
            {APP_VERSION}
          </Text>
        ) : (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: nameplateH * 0.735,
              height: nameplateH * 0.19,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={[styles.version, { color: c.accent, fontSize: Math.round(nameplateH * 0.13) }]}
              allowFontScaling={false}
            >
              {APP_VERSION}
            </Text>
          </View>
        )}
      </View>

      {/* Label row: back (left) · PAGE NAME (center) · action (right). */}
      <View style={styles.labelRow}>
        {leftSlot ? (
          <View style={styles.leftSlot}>{leftSlot}</View>
        ) : onBack ? (
          <View style={styles.leftSlot}>
            <TouchableOpacity onPress={onBack} hitSlop={10} testID="back-btn">
              <Ionicons name={backIcon ?? "arrow-back"} size={22} color={c.accent} />
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: c.accent }]} numberOfLines={1} allowFontScaling={false}>
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
    textAlign: "center",
    color: ACCENT,
    fontWeight: "800",
    letterSpacing: 1,
    includeFontPadding: false,
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
