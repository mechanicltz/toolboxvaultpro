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
import { useIsSteel, useSteelPanelFrame } from "../tbv/steel";

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
  padX,
  padTop,
  padBottom,
  frame = "plate",
}: Props) {
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const isSteel = useIsSteel();
  const steelFrame = useSteelPanelFrame();
  const Wrap: any = onPress || onLongPress ? TouchableOpacity : View;
  const wrapProps =
    onPress || onLongPress
      ? { onPress, onLongPress, activeOpacity: 0.85 }
      : {};

  if (isIndustrial) {
    // STEEL family — render the brushed-silver frame (recolored per variant)
    // so cards match the rest of the Steel skin instead of the iron art.
    if (isSteel) {
      const px = Math.max(padX ?? steelFrame.padX, steelFrame.padX);
      const pt = Math.max(padTop ?? steelFrame.padTop, steelFrame.padTop);
      const pb = Math.max(padBottom ?? steelFrame.padBottom, steelFrame.padBottom);
      return (
        <Wrap testID={testID} style={style} {...wrapProps}>
          <TbvFrame
            source={steelFrame.source}
            capInsets={steelFrame.capInsets}
            frameScale={steelFrame.frameScale}
            padX={px}
            padTop={pt}
            padBottom={pb}
          >
            <View style={innerStyle}>{children}</View>
          </TbvFrame>
        </Wrap>
      );
    }

    const source = frame === "window" ? SKIN.window : SKIN.plate;
    const cap = frame === "window" ? CAP.window : CAP.plate;
    // Content MUST clear the metal rails AND leave breathing room so text never
    // sits on/under the bolts. The rendered rail thickness equals the cap inset
    // (frameScale = 1 here): plate = 46 L/R · 12 T/B; window = 38 L/R · 32/34
    // T/B. We add ~8–12pt of clearance beyond each rail and enforce it as a
    // minimum, so no screen can under-pad and crowd the frame.
    const railX = frame === "window" ? 38 : 44;
    const railTop = frame === "window" ? 28 : 14;
    const railBottom = frame === "window" ? 30 : 16;
    const px = Math.max(padX ?? railX, railX);
    const pt = Math.max(padTop ?? railTop, railTop);
    const pb = Math.max(padBottom ?? railBottom, railBottom);
    return (
      <Wrap testID={testID} style={style} {...wrapProps}>
        <TbvFrame source={source} capInsets={cap} padX={px} padTop={pt} padBottom={pb}>
          <View style={innerStyle}>{children}</View>
        </TbvFrame>
      </Wrap>
    );
  }

  return (
    <Wrap testID={testID} style={[styles.plainCard, style]} {...wrapProps}>
      <View
        style={[
          { paddingHorizontal: padX ?? 14, paddingTop: padTop ?? 12, paddingBottom: padBottom ?? 12 },
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
