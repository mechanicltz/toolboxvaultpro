/**
 * TBVSteelHeader — reusable "machined steel" native-text header.
 *
 * Recreates the MATERIAL FEELING of the Toolbox Vault logo (not the logo
 * itself) by stacking multiple native <Text> layers — no images / SVG / PNG.
 *
 * Per-word layer stack (back → front):
 *   1. Deep drop shadow      (#000 @60%, Y+4, blur ~10)
 *   2. Orange glow           (accent words only — rgba(255,106,0,.4), blur ~16)
 *   3. Main metallic fill     (vertical gradient #F8F8F8 → #D2D2D2 → #8E8E8E
 *                              via MaskedView; flat steel on web)
 *   4. Top-edge highlight    (#FFFFFF @20%, Y-1)
 *   5. Inner-shadow sim       (#5A5A5A @15%, Y+0.75)
 *
 * Font: Teko Bold (condensed, heavy) → falls back to Rajdhani/Bebas if absent.
 */
import React from "react";
import { View, Text, StyleSheet, Platform, StyleProp, ViewStyle, TextStyle } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

const FONT = "Anton_400Regular";

// Brushed-steel vertical gradient (top sheen → mid → lower steel).
const STEEL = ["#F8F8F8", "#D2D2D2", "#8E8E8E"];
const STEEL_LOC = [0, 0.5, 1];
const STEEL_FLAT = "#D2D2D2"; // web fallback

export interface SteelSegment {
  text: string;
  /** Highlighted word — gets the orange glow (e.g. "VAULT"). */
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
    letterSpacing: 0.5,
    lineHeight: size * 1.0,
    includeFontPadding: false,
  };
  const useGradient = Platform.OS !== "web";

  return (
    <View>
      {/* Layer 1 — deep drop shadow */}
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[
          base,
          styles.abs,
          {
            top: 4,
            color: "rgba(0,0,0,0.6)",
            textShadowColor: "rgba(0,0,0,0.6)",
            textShadowOffset: { width: 0, height: 4 },
            textShadowRadius: 10,
          },
        ]}
      >
        {text}
      </Text>

      {/* Layer 2 — orange glow (accent words only) */}
      {accent && (
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            base,
            styles.abs,
            {
              top: 0,
              color: "rgba(255,106,0,0.40)",
              textShadowColor: "rgba(255,106,0,0.65)",
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 16,
            },
          ]}
        >
          {text}
        </Text>
      )}

      {/* Layer 3 — main metallic fill */}
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

      {/* Layer 4 — top-edge highlight */}
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[base, styles.abs, { top: -1, color: "rgba(255,255,255,0.20)" }]}
      >
        {text}
      </Text>

      {/* Layer 5 — inner shadow simulation */}
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[base, styles.abs, { top: 0.75, color: "rgba(90,90,90,0.15)" }]}
      >
        {text}
      </Text>
    </View>
  );
}

export function TBVSteelHeader({
  segments = [{ text: "TOOLBOX" }, { text: "VAULT", accent: true }],
  size = 50,
  style,
}: Props) {
  return (
    <View style={[styles.row, style]}>
      {segments.map((seg, i) => (
        <React.Fragment key={`${seg.text}-${i}`}>
          {i > 0 && <View style={{ width: size * 0.18 }} />}
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
