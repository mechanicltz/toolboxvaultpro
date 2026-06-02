/**
 * TBVSteelHeader — reusable "machined steel nameplate" native-text header for
 * ALL authenticated screens (Dashboard, Inventory, Contacts, Claims, Settings,
 * Reports). 100% native text — never an image / SVG / PNG.
 *
 * Goal: the letters should read as forged steel BOLTED onto equipment, not as
 * styled mobile text. The "metal" is an illusion built from layered native
 * <Text>, back → front, per word:
 *
 *   1. Grounding cast shadow   — lifts the letters off the surface (#000)
 *   2. Orange reflected light  — warm industrial lighting bouncing off steel
 *                                (a glow, NOT orange letters)
 *   3. Top-edge highlight      — bright bevel where light hits the top edge
 *   4. Metallic gradient face  — #F5F5F5 → #D0D0D0 → #8C8C8C (curved steel)
 *   5. Inner-shadow recess     — subtle darkening low in each letter (engraved)
 *
 * Font: Anton (heaviest available; Teko maxes at Bold which reads thin). Tight
 * letter spacing + condensed mass = manufactured, not elegant.
 */
import React from "react";
import { View, Text, StyleSheet, Platform, StyleProp, ViewStyle, TextStyle } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

const FONT = "Anton_400Regular";

// High-contrast brushed-steel gradient (top sheen → mid → lower steel).
const STEEL = ["#F5F5F5", "#D0D0D0", "#8C8C8C"];
const STEEL_LOC = [0, 0.55, 1];
const STEEL_FLAT = "#CFCFCF"; // web fallback (MaskedView is native-only)

export interface SteelSegment {
  text: string;
  /** Highlighted word — receives the orange reflected-light glow (e.g. VAULT). */
  accent?: boolean;
}

interface Props {
  segments?: SteelSegment[];
  size?: number;
  style?: StyleProp<ViewStyle>;
}

function SteelWord({ text, accent, size }: { text: string; accent?: boolean; size: number }) {
  const base: TextStyle = {
    fontFamily: FONT,
    fontSize: size,
    letterSpacing: -size * 0.02, // tight, packed
    lineHeight: size * 1.0,
    includeFontPadding: false,
  };
  const useGradient = Platform.OS !== "web";

  return (
    <View>
      {/* 1 — grounding cast shadow (depth / lift) */}
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[
          base,
          styles.abs,
          {
            top: 2.5,
            color: "rgba(0,0,0,0.9)",
            textShadowColor: "rgba(0,0,0,0.85)",
            textShadowOffset: { width: 0, height: 3 },
            textShadowRadius: 5,
          },
        ]}
      >
        {text}
      </Text>

      {/* 2 — orange reflected industrial light (glow, not orange text) */}
      {accent && (
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            base,
            styles.abs,
            {
              top: 3,
              color: "rgba(35,18,4,0.92)",
              textShadowColor: "rgba(255,106,0,0.6)",
              textShadowOffset: { width: 0, height: 4 },
              textShadowRadius: 16,
            },
          ]}
        >
          {text}
        </Text>
      )}

      {/* 3 — bright top-edge highlight (bevel) — sits behind face, peeks at top */}
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[base, styles.abs, { top: -1.5, color: "rgba(255,255,255,0.55)" }]}
      >
        {text}
      </Text>

      {/* 4 — metallic gradient face */}
      {useGradient ? (
        <MaskedView
          maskElement={
            <Text allowFontScaling={false} numberOfLines={1} style={[base, { color: "#000" }]}>
              {text}
            </Text>
          }
        >
          <LinearGradient colors={STEEL} locations={STEEL_LOC} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
            <Text allowFontScaling={false} numberOfLines={1} style={[base, { opacity: 0 }]}>
              {text}
            </Text>
          </LinearGradient>
        </MaskedView>
      ) : (
        <Text allowFontScaling={false} numberOfLines={1} style={[base, { color: STEEL_FLAT }]}>
          {text}
        </Text>
      )}

      {/* 5 — inner-shadow recess (engraved depth low in the letters) */}
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[base, styles.abs, { top: 1.75, color: "rgba(0,0,0,0.22)" }]}
      >
        {text}
      </Text>
    </View>
  );
}

export function TBVSteelHeader({
  segments = [{ text: "TOOLBOX" }, { text: "VAULT", accent: true }],
  size = 29,
  style,
}: Props) {
  const label = segments.map((s) => s.text).join(" ");
  return (
    <View
      style={[styles.row, style]}
      accessibilityRole="header"
      accessibilityLabel={label}
    >
      {segments.map((seg, i) => (
        <React.Fragment key={`${seg.text}-${i}`}>
          {i > 0 && <View style={{ width: size * 0.16 }} />}
          <SteelWord text={seg.text} accent={seg.accent} size={size} />
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  abs: { position: "absolute", left: 0 },
});

export default TBVSteelHeader;
