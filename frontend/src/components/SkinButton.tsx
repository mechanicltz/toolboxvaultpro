import React from "react";
import { Text, TouchableOpacity, ImageBackground, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSkin, useColors } from "../themeContext";
import { useTbvSkinsReady } from "../tbv/useTbvSkins";
import { SKIN } from "../tbv/skins";

/**
 * Primary action button that matches the Dashboard "ADD ITEM" / "NEW CLAIM"
 * metal-plate buttons on skinned themes (industrial / pink / arctic / emerald),
 * and falls back to a solid accent button on the plain theme.
 */
export const SkinButton = ({
  label,
  onPress,
  icon,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon?: any;
  disabled?: boolean;
  testID?: string;
}) => {
  const { skin } = useSkin();
  const c = useColors();
  const ready = useTbvSkinsReady();
  const wantsSkin = skin !== "plain";
  const skinned = wantsSkin && ready;

  // On skinned themes, while the metal-plate bitmaps are still decoding, show a
  // neutral dark placeholder instead of the bright accent button so it never
  // flashes orange before swapping to the metal plate.
  if (wantsSkin && !ready) {
    return (
      <TouchableOpacity
        style={[styles.skinBtn, styles.skinLoading, disabled && styles.disabled]}
        activeOpacity={0.85}
        onPress={onPress}
        disabled={disabled}
        testID={testID}
      >
        {icon && <Ionicons name={icon} size={17} color="#E8E8E8" style={styles.skinIcon} />}
        <Text style={[styles.skinText, { color: "#E8E8E8" }]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  if (skinned) {
    return (
      <TouchableOpacity
        style={[styles.skinBtn, disabled && styles.disabled]}
        activeOpacity={0.85}
        onPress={onPress}
        disabled={disabled}
        testID={testID}
      >
        <ImageBackground
          source={SKIN.btnPrimary}
          style={styles.skinFill}
          imageStyle={styles.skinImg}
          resizeMode="stretch"
        >
          {icon && <Ionicons name={icon} size={17} color="#0A0A0A" style={styles.skinIcon} />}
          <Text style={styles.skinText}>{label}</Text>
        </ImageBackground>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.plainBtn,
        { backgroundColor: c.accent },
        disabled && styles.disabled,
      ]}
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
    >
      {icon && <Ionicons name={icon} size={19} color={c.textOnAccent} />}
      <Text style={[styles.plainText, { color: c.textOnAccent }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  skinBtn: { height: 48, overflow: "hidden", borderRadius: 6, width: "100%" },
  skinLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2A2A2A",
    borderWidth: 1,
    borderColor: "#3A3A3A",
  },
  skinFill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  skinImg: { borderRadius: 6 },
  skinIcon: { marginBottom: 4 },
  skinText: {
    color: "#0A0A0A",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 4,
  },
  plainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 12,
    minHeight: 50,
  },
  plainText: { fontWeight: "800", fontSize: 15 },
  disabled: { opacity: 0.5 },
});
