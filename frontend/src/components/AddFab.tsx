import React from "react";
import { TouchableOpacity, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { themedStyles } from "../themeContext";

/**
 * AddFab — the shared floating "+" action button used across the app
 * (Inventory, Wishlist, Dealers, Contacts, Claims, For Sale).
 *
 * A round accent button pinned bottom-right with a real BLACK drop shadow
 * (not the theme's accent-glow elevation) so it visibly floats above the
 * page on both light and the textured dark/industrial backgrounds.
 */
export const AddFab = ({
  testID,
  onPress,
  icon = "add",
  style,
}: {
  testID: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) => (
  <TouchableOpacity
    testID={testID}
    style={[styles.fab, style]}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <Ionicons name={icon} size={32} color="#000" />
  </TouchableOpacity>
);

const styles = themedStyles((c) => ({
  fab: {
    position: "absolute",
    bottom: 28,
    right: 24,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    // Real drop shadow so the button reads as "floating".
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 14,
  },
}));

export default AddFab;
