import React, { ReactNode } from "react";
import { View, StyleProp, ViewStyle } from "react-native";
import { useSkin } from "../themeContext";
import { SKIN, CAP } from "../tbv/skins";
import { useIsSteel, useSteelPanelFrame } from "../tbv/steel";
import TbvFrame from "../tbv/components/TbvFrame";
import { BevelCard } from "./BevelCard";

/**
 * A theme-aware content card. On the industrial skin it renders the real metal
 * `window` frame PNG (matching the rest of the app); on plain Light/Dark it
 * falls back to the beveled `BevelCard`. Inner padding is applied by the
 * component itself so callers only supply outer spacing via `style`.
 */
export function SkinnedCard({
  children,
  style,
  testID,
  padding = 16,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  padding?: number;
}) {
  const { skin } = useSkin();
  const isSteel = useIsSteel();
  const steelFrame = useSteelPanelFrame();
  if (skin === "industrial") {
    // STEEL family → brushed-silver frame (recolored per variant) so this card
    // matches the rest of the Steel skin instead of the Iron Forge art.
    if (isSteel) {
      return (
        <View style={style}>
          <TbvFrame
            source={steelFrame.source}
            capInsets={steelFrame.capInsets}
            frameScale={steelFrame.frameScale}
            padX={Math.max(padding + 8, steelFrame.padX)}
            padTop={Math.max(padding + 4, steelFrame.padTop)}
            padBottom={Math.max(padding + 4, steelFrame.padBottom)}
            testID={testID}
          >
            {children}
          </TbvFrame>
        </View>
      );
    }
    return (
      <View style={style}>
        <TbvFrame
          source={SKIN.window}
          capInsets={CAP.window}
          padX={padding + 8}
          padTop={padding + 4}
          padBottom={padding + 4}
          testID={testID}
        >
          {children}
        </TbvFrame>
      </View>
    );
  }
  return (
    <BevelCard style={[{ padding }, style]} testID={testID}>
      {children}
    </BevelCard>
  );
}

export default SkinnedCard;
