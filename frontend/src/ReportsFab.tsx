import { TouchableOpacity, StyleSheet, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "./theme";

/**
 * Floating "Reports" shortcut button shown in the top-right of every screen.
 * Hidden on the reports/insurance-report screens themselves to avoid clutter.
 */
export function ReportsFab() {
  const router = useRouter();
  const path = usePathname();
  const insets = useSafeAreaInsets();

  // Only show on the 5 main tab screens. Hide on detail/stack screens
  // where the top-right area is already used by edit/delete/back buttons.
  const TAB_PATHS = new Set(["/", "/inventory", "/dealers", "/claims", "/more"]);
  if (!TAB_PATHS.has(path || "")) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 18 }]}>
      <TouchableOpacity
        testID="global-reports-btn"
        style={styles.btn}
        onPress={() => router.push("/reports")}
        accessibilityLabel="Reports"
      >
        <Text style={styles.text}>REPORTS</Text>
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
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
});
