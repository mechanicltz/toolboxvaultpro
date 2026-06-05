import React from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import { SKIN, TBV } from "./tbv/skins";
import { useColors } from "./themeContext";

/**
 * AppBackground — the single, global page backdrop.
 *
 * Renders the SAME industrial photo, the SAME way, as the skinned Home screen:
 * a full-bleed `ImageBackground` with `resizeMode="cover"` plus the matching
 * dark veil. Because it lives at the OUTERMOST level (full screen, not inside
 * the responsive content column) the photo is scaled/contained identically on
 * every page — no zoomed-in crop.
 *
 * Shows for every NON-light theme (Industrial Orange/Pink, Plain Dark), where
 * the palette `canvas === "transparent"` and each screen's root is see-through.
 * In LIGHT theme `canvas` is a solid colour, so this renders nothing and the
 * light pages keep their clean background.
 *
 * The photo is variant-aware via the SKIN proxy (orange ↔ pink).
 */
export function AppBackground() {
  const c = useColors();
  if (c.canvas !== "transparent") return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <ImageBackground
        source={SKIN.bg}
        style={styles.bg}
        resizeMode="cover"
        fadeDuration={0}
      >
        {/* Same dark veil the skinned Home uses so the textured plate reads
            but on-screen content stays legible. */}
        <View style={styles.veil} />
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: TBV.ink },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,10,10,0.60)" },
});

export default AppBackground;
