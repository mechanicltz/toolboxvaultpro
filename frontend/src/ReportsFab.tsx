import { TouchableOpacity, StyleSheet, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "./theme";

import { themedStyles } from "./themeContext";

/**
 * Floating "Add Item" shortcut button shown in the top-right of the main
 * tab screens — gives the user a one-tap way to start creating a new tool
 * from anywhere. Shown on Home, Inventory, Dealers and More.
 * Hidden on Claims (different workflow) and on stack/detail screens.
 */
export function ReportsFab() {
  const router = useRouter();
  const path = usePathname();
  const insets = useSafeAreaInsets();

  // Show on these main tab routes only. Some Expo Router versions return the
  // route-group-prefixed path ("/(tabs)/inventory") so we normalize first.
  // NOTE: /dealers, /borrowers (contacts), and detail pages get their own
  // page-specific "Add X" buttons in their own headers, so we exclude them here.
  // Show on Inventory only — Home and More no longer surface a global
  // "ADD ITEM" shortcut (user requested removal so the new industrial
  // banner reads cleanly without overlap).
  // ADD ITEM now lives as a full-width button directly under the Inventory
  // search bar (per user request), so the floating top-right shortcut is
  // retired everywhere to avoid two competing "Add Item" controls.
  const p = (path || "").replace("/(tabs)", "") || "/";
  const TAB_PATHS = new Set<string>([]);
  if (!TAB_PATHS.has(p)) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 22 }]}>
      <TouchableOpacity
        testID="global-add-item-btn"
        style={styles.btn}
        onPress={() => router.push("/tool/edit")}
        accessibilityLabel="Add new item"
      >
        <Ionicons name="add" size={14} color={theme.colors.accent} />
        <Text style={styles.text}>ADD ITEM</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: {
    position: "absolute",
    right: 44, // clears the industrial banner's top-right bolt (≈8px from edge, ~20px wide)
    zIndex: 50,
    flexDirection: "row",
    gap: 6,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15,15,15,0.9)",
    borderWidth: 1,
    borderColor: c.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  text: {
    color: c.accent,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
}));
