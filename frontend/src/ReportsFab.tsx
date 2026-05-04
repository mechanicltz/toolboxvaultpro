import { TouchableOpacity, StyleSheet, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "./theme";

/**
 * Floating "Add Item" shortcut button shown in the top-right of the main
 * tab screens — gives the user a one-tap way to start creating a new tool
 * from anywhere. Hidden on Inventory (which already has its own bottom-
 * right FAB) and on stack/detail screens.
 */
export function ReportsFab() {
  const router = useRouter();
  const path = usePathname();
  const insets = useSafeAreaInsets();

  // Hide on Inventory (has its own + FAB) and on detail/stack screens.
  const TAB_PATHS = new Set(["/", "/dealers", "/claims", "/more"]);
  if (!TAB_PATHS.has(path || "")) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 18 }]}>
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

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 12,
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
    borderColor: theme.colors.accent,
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
    color: theme.colors.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
});
