/**
 * TbvButton — the black brushed-metal action button.
 *
 * All frame art, 9-slice geometry, padding and label style come from the central
 * src/tbv/button.ts config, so usage is trivial and 100% consistent across every
 * screen. The chamfered metal corners stay crisp while the dark center stretches
 * to fit the label at any width:
 *
 *   <TbvButton label="ADD ITEM" onPress={...} />
 *   <TbvButton label="NEW CLAIM" onPress={...} style={{ flex: 1 }} />
 */
import React, { ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  StyleProp,
  ViewStyle,
  TextStyle,
} from "react-native";
import TbvFrame from "../tbv/components/TbvFrame";
import {
  BUTTON_SRC,
  BUTTON_CAP,
  BUTTON_FRAME_SCALE,
  BUTTON_PAD,
  BUTTON_LABEL,
} from "../tbv/button";

export function TbvButton({
  label,
  onPress,
  disabled,
  style,
  labelStyle,
  children,
  testID,
}: {
  label?: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  children?: ReactNode;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        { width: "100%", opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <TbvFrame
        source={BUTTON_SRC}
        capInsets={BUTTON_CAP}
        frameScale={BUTTON_FRAME_SCALE}
        padX={BUTTON_PAD.padX}
        padTop={BUTTON_PAD.padTop}
        padBottom={BUTTON_PAD.padBottom}
      >
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          {children ?? (
            <Text style={[BUTTON_LABEL, labelStyle]} numberOfLines={1}>
              {label}
            </Text>
          )}
        </View>
      </TbvFrame>
    </Pressable>
  );
}

export default TbvButton;
