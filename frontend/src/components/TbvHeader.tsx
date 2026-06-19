/**
 * TbvHeader — the brushed-metal "TOOLBOX VAULT" nameplate header.
 *
 * Measures its own width and renders the header art at EXACTLY that width and
 * the matching height for the art's natural aspect ratio, so the baked-in
 * lettering + detailing never stretch, zoom or smear. The app version is painted
 * into the bottom-right corner, just inside the metal border, in the same warm
 * orange as the "VAULT" word.
 *
 *   <TbvHeader />
 *   <TbvHeader style={{ marginBottom: 16 }} />
 */
import React, { useState } from "react";
import { View, Image, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import {
  HEADER_SRC,
  HEADER_ASPECT,
  HEADER_VAULT_ORANGE,
  HEADER_VERSION_POS,
} from "../tbv/header";
import { APP_VERSION_LABEL } from "../version";

export function TbvHeader({
  style,
  showVersion = true,
  testID,
}: {
  style?: StyleProp<ViewStyle>;
  showVersion?: boolean;
  testID?: string;
}) {
  const [w, setW] = useState(0);
  const h = w > 0 ? w / HEADER_ASPECT : 0;

  return (
    <View
      style={[{ width: "100%" }, style]}
      testID={testID}
      onLayout={(e) => {
        const nw = e.nativeEvent.layout.width;
        if (Math.abs(nw - w) > 0.5) setW(nw);
      }}
    >
      {w > 0 ? (
        <View style={{ width: w, height: h }}>
          <Image
            source={HEADER_SRC}
            style={{ width: w, height: h }}
            resizeMode="stretch"
            fadeDuration={0}
          />
          {showVersion ? (
            <Text
              style={[
                styles.version,
                { right: w * HEADER_VERSION_POS.rightPct, bottom: h * HEADER_VERSION_POS.bottomPct },
              ]}
              numberOfLines={1}
              testID="tbv-header-version"
            >
              {APP_VERSION_LABEL}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  version: {
    position: "absolute",
    color: HEADER_VAULT_ORANGE,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});

export default TbvHeader;
