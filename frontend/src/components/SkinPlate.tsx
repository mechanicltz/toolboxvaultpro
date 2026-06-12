/**
 * SkinPlate — a list/row card that automatically skins itself.
 *
 *   • Industrial themes (Iron Forge / Crimson / Arctic / Emerald): renders the
 *     real metal `TbvFrame` plate art behind padded content — matching the
 *     Claims / Dealers screens.
 *   • Plain Light / Dark themes: renders the standard flat "ShadowBox" chrome
 *     (bg + border + soft elevation).
 *
 * Padding model is symmetric across both skins:
 *   - `style`      → OUTER wrapper (use for margins, width, flex).
 *   - `innerStyle` → CONTENT layout only (flexDirection / alignItems / gap).
 *   - `padX/padTop/padBottom` → inner content padding (clears the metal rails
 *      in industrial; same inset in plain so rows line up identically).
 *
 * Make it tappable by passing `onPress` (and/or `onLongPress`).
 */
import React, { ReactNode } from "react";
import { View, TouchableOpacity, StyleProp, ViewStyle } from "react-native";
import { themedStyles, useSkin } from "../themeContext";
import { theme } from "../theme";
import { SKIN, CAP } from "../tbv/skins";
import { TbvFrame } from "../tbv/components/TbvFrame";

type Props = {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
  /** Outer wrapper style — margins / width / flex. */
  style?: StyleProp<ViewStyle>;
  /** Inner content layout — flexDirection / alignItems / gap (no padding). */
  innerStyle?: StyleProp<ViewStyle>;
  padX?: number;
  padTop?: number;
  padBottom?: number;
  /** Use the larger "window" frame instead of the wide "plate" frame. */
  frame?: "plate" | "window";
};

export function SkinPlate({
  children,
  onPress,
  onLongPress,
  testID,
  style,
  innerStyle,
  padX = 16,
  padTop = 12,
  padBottom = 12,
  frame = "plate",
}: Props) {
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const Wrap: any = onPress || onLongPress ? TouchableOpacity : View;
  const wrapProps =
    onPress || onLongPress
      ? { onPress, onLongPress, activeOpacity: 0.85 }
      : {};

  if (isIndustrial) {
    const source = frame === "window" ? SKIN.window : SKIN.plate;
    const cap = frame === "window" ? CAP.window : CAP.plate;
    return (
      <Wrap testID={testID} style={style} {...wrapProps}>
        <TbvFrame source={source} capInsets={cap} padX={padX} padTop={padTop} padBottom={padBottom}>
          <View style={innerStyle}>{children}</View>
        </TbvFrame>
      </Wrap>
    );
  }

  return (
    <Wrap testID={testID} style={[styles.plainCard, style]} {...wrapProps}>
      <View
        style={[
          { paddingHorizontal: padX, paddingTop: padTop, paddingBottom: padBottom },
          innerStyle,
        ]}
      >
        {children}
      </View>
    </Wrap>
  );
}

const styles = themedStyles((c) => ({
  plainCard: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    overflow: "hidden",
    ...(theme.elevation.md as object),
  },
}));

export default SkinPlate;
