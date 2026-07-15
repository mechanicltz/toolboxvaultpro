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
import { View, Image, Text, StyleSheet, StyleProp, ViewStyle, TouchableOpacity } from "react-native";
import {
  HEADER_SRC_BY_COLOR,
  HEADER_ASPECT,
  HEADER_VAULT_ORANGE,
  HEADER_VAULT_COLOR_BY_COLOR,
  HEADER_VERSION_POS,
} from "../tbv/header";
import { APP_VERSION_LABEL } from "../version";
import { useSkin } from "../themeContext";
import { openAdminStats } from "../adminStats";

// Plain + Light theme wordmark (transparent, trimmed). Aspect = 1419 / 206.
const LIGHT_LOGO_SRC = require("../../assets/light-header-logo.png");
const LIGHT_LOGO_ASPECT = 1419 / 206;

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
  const { skin, industrialVariant } = useSkin();
  const src = HEADER_SRC_BY_COLOR[industrialVariant] ?? HEADER_SRC_BY_COLOR.orange;
  const vaultColor = HEADER_VAULT_COLOR_BY_COLOR[industrialVariant] ?? HEADER_VAULT_ORANGE;

  // Plain theme (Light AND Dark): use the trimmed transparent "TOOLBOX VAULT"
  // wordmark image instead of the metal nameplate. Plain dark matches plain
  // light exactly.
  const useLightLogo = skin === "plain";
  if (useLightLogo) {
    const lh = w > 0 ? w / LIGHT_LOGO_ASPECT : 0;
    return (
      <View
        style={[{ width: "100%", alignItems: "center" }, style]}
        testID={testID}
        onLayout={(e) => {
          const nw = e.nativeEvent.layout.width;
          if (Math.abs(nw - w) > 0.5) setW(nw);
        }}
      >
        {w > 0 ? (
          <Image
            source={LIGHT_LOGO_SRC}
            style={{ width: w, height: lh }}
            resizeMode="contain"
            fadeDuration={0}
          />
        ) : null}
        {showVersion && w > 0 ? (
          <TouchableOpacity onPress={openAdminStats} hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }} testID="tbv-header-version-btn">
            <Text style={styles.lightVersion} allowFontScaling={false}>
              {APP_VERSION_LABEL}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

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
            source={src}
            style={{ width: w, height: h }}
            resizeMode="stretch"
            fadeDuration={0}
          />
          {showVersion ? (
            <TouchableOpacity
              onPress={openAdminStats}
              hitSlop={{ top: 14, bottom: 14, left: 24, right: 24 }}
              style={[
                styles.versionBtn,
                { right: w * HEADER_VERSION_POS.rightPct, bottom: h * HEADER_VERSION_POS.bottomPct },
              ]}
              testID="tbv-header-version-btn"
            >
              <Text
                style={[styles.version, { color: vaultColor }]}
                numberOfLines={1}
                testID="tbv-header-version"
              >
                {APP_VERSION_LABEL}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  versionBtn: {
    position: "absolute",
  },
  version: {
    color: HEADER_VAULT_ORANGE,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  lightVersion: {
    marginTop: 2,
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textAlign: "center",
  },
});

export default TbvHeader;
