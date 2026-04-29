import { TouchableOpacity, StyleSheet, Platform, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { theme } from "./theme";

/**
 * Floating "Reports" shortcut button shown in the top-right of every screen.
 * Hidden on the reports/insurance-report screens themselves to avoid clutter.
 */
export function ReportsFab() {
  const router = useRouter();
  const path = usePathname();

  // Only show on the 5 main tab screens. Hide on detail/stack screens
  // where the top-right area is already used by edit/delete/back buttons.
  const TAB_PATHS = new Set(["/", "/inventory", "/dealers", "/claims", "/more"]);
  if (!TAB_PATHS.has(path || "")) return null;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <TouchableOpacity
        testID="global-selling-btn"
        style={[styles.btn, styles.btnSelling]}
        onPress={() => router.push("/for-sale")}
        accessibilityLabel="Inventory for Sale"
      >
        <Ionicons name="pricetag" size={18} color={theme.colors.accent} />
        <Text style={styles.text}>SELLING</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="global-reports-btn"
        style={styles.btn}
        onPress={() => router.push("/reports")}
        accessibilityLabel="Reports"
      >
        <Ionicons name="document-text" size={18} color={theme.colors.accent} />
        <Text style={styles.text}>REPORTS</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 16,
    right: 14,
    zIndex: 50,
    flexDirection: "row",
    gap: 8,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(15,15,15,0.9)",
    borderWidth: 1,
    borderColor: theme.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  btnSelling: {
    // Same look as REPORTS — keeps the pair visually balanced
  },
  text: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
});
