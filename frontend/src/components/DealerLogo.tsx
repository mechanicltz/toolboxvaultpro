import React from "react";
import { View, Image, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import { resolveDealerLogo } from "../dealerLogos";

/**
 * Dealer logo — renders inside a FIXED, uniform square slot so every row lines
 * up: all icons occupy the exact same box and every dealer name therefore
 * starts at the same x. The artwork is centered and `contain`-fit (never
 * stretched, never cropped). No backing chip, no border.
 *
 * Because the slot is a constant size (not derived from each image's aspect
 * ratio) the layout is identical for stock logos, custom uploads, and freshly
 * added dealers — nothing reflows when the list changes.
 *
 * `size`   = slot WIDTH  (and default height)
 * `height` = slot HEIGHT (optional; defaults to `size` → a square slot)
 *
 * When the dealer has no real logo, a neutral placeholder icon is drawn — never
 * the app icon.
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
  const w = size;
  const h = height ?? size;
  const source = resolveDealerLogo(logo);

  return (
    <View
      style={[{ width: w, height: h, alignItems: "center", justifyContent: "center" }, style]}
      pointerEvents="none"
    >
      {source ? (
        <Image
          source={source}
          style={{ width: "100%", height: "100%" }}
          resizeMode="contain"
        />
      ) : (
        <Ionicons
          name="business"
          size={Math.round(Math.min(w, h) * 0.62)}
          color={theme.colors.textMuted}
        />
      )}
    </View>
  );
}

export default DealerLogo;
