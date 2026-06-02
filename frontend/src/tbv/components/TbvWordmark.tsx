/**
 * TbvWordmark — native-text "TOOLBOX VAULT" styled to resemble the metallic
 * logo: heavy condensed Bebas Neue, tight spacing, with a brushed-metal
 * gradient FILL (silver for TOOLBOX, copper-orange for VAULT) via MaskedView,
 * plus a dark drop-shadow layer for 3D depth. 100% native text (no image).
 *
 * NOTE: the metallic gradient renders on iOS/Android (Expo Go). On the web
 * preview MaskedView may fall back to flat, so verify the metallic look on the
 * phone.
 */
import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle, Platform } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

const FONT = "BebasNeue_400Regular";

// Brushed-metal gradients (top highlight → mid → deep → lower sheen).
const SILVER = ["#FFFFFF", "#E4E7EA", "#9AA0A8", "#CED3D9"];
const COPPER = ["#FFD29A", "#FF9A3D", "#FF6A00", "#B84300"];

// Flat fallbacks (web, or if MaskedView ever fails).
const SILVER_FLAT = "#DCDEE1";
const COPPER_FLAT = "#FF6A00";

function GradientWord({ text, colors, flat, size }: { text: string; colors: string[]; flat: string; size: number }) {
  const base: TextStyle = {
    fontFamily: FONT,
    fontSize: size,
    letterSpacing: size * 0.03,
    lineHeight: size * 1.02,
    includeFontPadding: false,
  };
  const useGradient = Platform.OS !== "web";
  return (
    <View>
      {/* dark drop-shadow / depth layer */}
      <Text allowFontScaling={false} numberOfLines={1}
        style={[base, styles.shadow, { color: "rgba(0,0,0,0.6)" }]}>{text}</Text>
      {/* light top-edge highlight (emboss) */}
      <Text allowFontScaling={false} numberOfLines={1}
        style={[base, styles.highlight, { color: "rgba(255,255,255,0.28)" }]}>{text}</Text>
      {useGradient ? (
        <MaskedView
          maskElement={
            <Text allowFontScaling={false} numberOfLines={1} style={[base, { color: "#000" }]}>{text}</Text>
          }
        >
          <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
            <Text allowFontScaling={false} numberOfLines={1} style={[base, { opacity: 0 }]}>{text}</Text>
          </LinearGradient>
        </MaskedView>
      ) : (
        <Text allowFontScaling={false} numberOfLines={1} style={[base, { color: flat }]}>{text}</Text>
      )}
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
      <GradientWord text="TOOLBOX" colors={SILVER} flat={SILVER_FLAT} size={size} />
      <View style={{ width: size * 0.2 }} />
      <GradientWord text="VAULT" colors={COPPER} flat={COPPER_FLAT} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  shadow: { position: "absolute", left: 1.5, top: 2.5 },
  highlight: { position: "absolute", left: -1, top: -1 },
});

export default TbvWordmark;
