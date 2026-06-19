/**
 * TbvHeader — the brushed-metal "TOOLBOX VAULT" nameplate header.
 *
 * Renders the header art (with its baked-in lettering + detailing) at its EXACT
 * natural aspect ratio so nothing ever stretches or smears — it simply fills the
 * width it's given. The app version is painted into the bottom-right corner,
 * just inside the metal border, in the same warm orange as the "VAULT" word.
 *
 *   <TbvHeader />                       // full-width, auto height, live version
 *   <TbvHeader style={{ marginBottom }} />
 */
import React from "react";
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
  return (
    <View style={[styles.wrap, { aspectRatio: HEADER_ASPECT }, style]} testID={testID}>
      <Image
        source={HEADER_SRC}
        style={StyleSheet.absoluteFill}
        resizeMode="stretch"
        fadeDuration={0}
      />
      {showVersion ? (
        <Text
          style={[
            styles.version,
            {
              right: `${HEADER_VERSION_POS.rightPct * 100}%`,
              bottom: `${HEADER_VERSION_POS.bottomPct * 100}%`,
            },
          ]}
          numberOfLines={1}
          testID="tbv-header-version"
        >
          {APP_VERSION_LABEL}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", position: "relative" },
  version: {
    position: "absolute",
    color: HEADER_VAULT_ORANGE,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});

export default TbvHeader;
