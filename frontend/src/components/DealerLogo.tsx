import React from "react";
import { View, Image, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { resolveDealerLogo } from "../dealerLogos";

/**
 * Renders a dealer's logo at a fixed slot size so a column of dealers stays
 * aligned. No backing chip / border — the brand logos are transparent PNGs that
 * read well directly on the app's dark theme, and the logo fills the slot
 * (resizeMode "contain") so it looks as large as possible. Falls back to the
 * app icon when no logo is set.
 */
export function DealerLogo({
  logo,
  size = 48,
  style,
}: {
  logo?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.box, { width: size, height: size }, style]}
      pointerEvents="none"
    >
      <Image
        source={resolveDealerLogo(logo)}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
  },
});

export default DealerLogo;
