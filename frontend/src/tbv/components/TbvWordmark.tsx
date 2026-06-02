/**
 * TbvWordmark — native-text "TOOLBOX VAULT" styled to resemble the metallic
 * logo PNG: heavy condensed Bebas Neue, tight spacing, steel TOOLBOX + orange
 * VAULT, with a stacked 3D bevel (dark drop-shadow layer + light top-edge
 * highlight) for an embossed, machined look. 100% native text (no image).
 *
 * Renders identically on web + iOS + Android (no MaskedView dependency).
 */
import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from "react-native";

const FONT = "BebasNeue_400Regular";

const STEEL = "#DCDEE1";   // TOOLBOX — brushed steel
const ORANGE = "#FF6A00";  // VAULT — brand accent

function BevelWord({ text, color, size }: { text: string; color: string; size: number }) {
  const base: TextStyle = {
    fontFamily: FONT,
    fontSize: size,
    letterSpacing: size * 0.03,
    lineHeight: size * 1.02,
    includeFontPadding: false,
  };
  return (
    <View>
      {/* dark drop-shadow / depth layer */}
      <Text allowFontScaling={false} numberOfLines={1}
        style={[base, styles.shadow, { color: "rgba(0,0,0,0.6)" }]}>{text}</Text>
      {/* light top-edge highlight (emboss) */}
      <Text allowFontScaling={false} numberOfLines={1}
        style={[base, styles.highlight, { color: "rgba(255,255,255,0.28)" }]}>{text}</Text>
      {/* main face */}
      <Text allowFontScaling={false} numberOfLines={1} style={[base, { color }]}>{text}</Text>
    </View>
  );
}

interface Props {
  /** Font size for the wordmark. Default 46. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function TbvWordmark({ size = 46, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <BevelWord text="TOOLBOX" color={STEEL} size={size} />
      <View style={{ width: size * 0.2 }} />
      <BevelWord text="VAULT" color={ORANGE} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  shadow: { position: "absolute", left: 1.5, top: 2.5 },
  highlight: { position: "absolute", left: -1, top: -1 },
});

export default TbvWordmark;
