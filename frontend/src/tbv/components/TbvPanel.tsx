/**
 * TbvPanel — the base stretchable industrial container every card/section is
 * built from. Renders a registry skin behind padded content.
 *
 * NOTE on stretching: today this uses resizeMode="stretch" (the approach the
 * locked login screen uses) which is perfect for fixed/moderate heights. A
 * TRUE 9-slice variant will be added when we build TbvAccordion (1–400 rows),
 * where heavy vertical stretch would otherwise distort the frame.
 */
import React from "react";
import { View, StyleSheet, ImageBackground, StyleProp, ViewStyle } from "react-native";
import { useTbvTheme } from "../useTbvTheme";
import { SkinName } from "../registry";

interface Props {
  skin?: SkinName;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Override the registry's default content padding. */
  pad?: number;
  minHeight?: number;
}

export function TbvPanel({ skin = "dashboardWidget", children, style, pad, minHeight }: Props) {
  const { skin: getSkin, padOf } = useTbvTheme();
  const src = getSkin(skin);
  const padding = pad ?? padOf(skin);
  return (
    <View style={[styles.wrap, minHeight ? { minHeight } : null, style]}>
      <ImageBackground
        source={src}
        resizeMode="stretch"
        style={StyleSheet.absoluteFill}
        imageStyle={styles.img}
      />
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", borderRadius: 8, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
});

export default TbvPanel;
