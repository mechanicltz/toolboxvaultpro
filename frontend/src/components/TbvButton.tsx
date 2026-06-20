/**
 * TbvButton — the black brushed-metal action button.
 *
 * Measures its own width and renders the button art at EXACTLY that width and
 * the matching height for the art's natural aspect ratio, so the chamfered metal
 * corners and centre detailing never stretch, smear or look "off". The label is
 * centred on top of the metal plate.
 *
 *   <TbvButton label="ADD ITEM" onPress={...} />
 *   <TbvButton label="NEW CLAIM" onPress={...} style={{ flex: 1 }} />
 */
import React, { useState } from "react";
import {
  Pressable,
  Text,
  View,
  Image,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from "react-native";
import { BUTTON_SRC_BY_COLOR, BUTTON_ASPECT, BUTTON_LABEL } from "../tbv/button";
import { useSkin } from "../themeContext";

export function TbvButton({
  label,
  onPress,
  disabled,
  style,
  labelStyle,
  testID,
}: {
  label?: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const [w, setW] = useState(0);
  const h = w > 0 ? w / BUTTON_ASPECT : 0;
  const { industrialVariant } = useSkin();
  const src = BUTTON_SRC_BY_COLOR[industrialVariant] ?? BUTTON_SRC_BY_COLOR.orange;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      onLayout={(e) => {
        const nw = e.nativeEvent.layout.width;
        if (Math.abs(nw - w) > 0.5) setW(nw);
      }}
      style={({ pressed }) => [
        { width: "100%", opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {w > 0 ? (
        <View style={{ width: w, height: h, alignItems: "center", justifyContent: "center" }}>
          <Image
            source={src}
            style={[StyleSheet.absoluteFill, { width: w, height: h }]}
            resizeMode="stretch"
            fadeDuration={0}
          />
          <Text style={[BUTTON_LABEL, labelStyle]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default TbvButton;
