import React from "react";
import { View, Image, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { resolveDealerLogo } from "../dealerLogos";

/**
 * Renders a dealer's logo at a fixed slot so a column of dealers stays aligned.
 * No backing chip/border — the brand logos are transparent PNGs that read well
 * directly on the dark theme.
 *
 * `size` = slot WIDTH. `height` (optional) = slot HEIGHT; defaults to `size`.
 * Because the stock logos are WIDE, passing a height SMALLER than the width lets
 * a logo look large (wide) inside list rows WITHOUT making the row taller.
 */
export function DealerLogo({
  logo,
  size = 48,
  height,
  style,
}: {
  logo?: string | null;
  size?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const h = height ?? size;
  return (
    <View
      style={[styles.box, { width: size, height: h }, style]}
      pointerEvents="none"
    >
      <Image
        source={resolveDealerLogo(logo)}
        style={{ width: size, height: h }}
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
