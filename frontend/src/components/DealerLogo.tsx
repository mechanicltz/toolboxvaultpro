import React from "react";
import { View, Image, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { resolveDealerLogo } from "../dealerLogos";

/**
 * Renders a dealer's logo inside a consistent, neatly-aligned chip so a column
 * of dealers all line up. Brand logos sit on a light chip for visibility on the
 * app's dark theme. Falls back to the app icon when no logo is set.
 */
export function DealerLogo({
  logo,
  size = 44,
  style,
}: {
  logo?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderRadius: Math.round(size * 0.22) },
        style,
      ]}
    >
      <Image
        source={resolveDealerLogo(logo)}
        style={{ width: size * 0.8, height: size * 0.8 }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    overflow: "hidden",
  },
});

export default DealerLogo;
