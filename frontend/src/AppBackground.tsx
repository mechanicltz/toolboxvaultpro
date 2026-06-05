import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { SKIN } from "./tbv/skins";
import { useColors } from "./themeContext";

/**
 * AppBackground — the single, global page backdrop.
 *
 * For every NON-light theme (Industrial Orange, Industrial Pink, Plain Dark)
 * it paints the SAME industrial photo used on the login screen, so all screens
 * share one cohesive backdrop. Each screen's root container is transparent
 * (palette `canvas === "transparent"`) in those themes, so this image shows
 * through everywhere.
 *
 * In LIGHT theme the palette `canvas` is a solid colour (not "transparent"),
 * so this component renders nothing and the light pages keep their clean
 * solid background — exactly as before.
 *
 * The photo is variant-aware via the SKIN proxy (orange ↔ pink), matching the
 * login screen automatically.
 */
export function AppBackground() {
  const c = useColors();
  if (c.canvas !== "transparent") return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={SKIN.bg}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        fadeDuration={0}
      />
    </View>
  );
}

export default AppBackground;
