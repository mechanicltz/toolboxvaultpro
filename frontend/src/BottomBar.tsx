import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { theme } from "./theme";
import { useResponsive, CONTENT_MAX_WIDTH_WIDE } from "./responsive";

const TABS = [
  { name: "home", label: "HOME", icon: "home" as const, route: "/" },
  { name: "inventory", label: "INVENTORY", icon: "construct" as const, route: "/inventory" },
  { name: "dealers", label: "DEALERS", icon: "briefcase" as const, route: "/dealers" },
  { name: "claims", label: "CLAIMS", icon: "build" as const, route: "/claims" },
  { name: "more", label: "MORE", icon: "apps" as const, route: "/more" },
];

export function BottomBar() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { isPhone, isTablet } = useResponsive();

  const isActive = (route: string) => {
    if (route === "/") return pathname === "/" || pathname === "/index";
    return pathname.startsWith(route);
  };

  return (
    <View style={styles.bar}>
      <View
        style={[
          styles.inner,
          !isPhone && {
            maxWidth: CONTENT_MAX_WIDTH_WIDE,
            width: "100%",
            alignSelf: "center",
            paddingHorizontal: isTablet ? 24 : 32,
          },
        ]}
      >
        {TABS.map((t) => {
          const active = isActive(t.route);
          return (
            <TouchableOpacity
              key={t.name}
              testID={`tab-${t.name}`}
              style={styles.btn}
              onPress={() => router.push(t.route as any)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={t.icon}
                size={isPhone ? 22 : 26}
                color={active ? theme.colors.accent : theme.colors.textMuted}
              />
              <Text
                numberOfLines={1}
                allowFontScaling={false}
                style={[
                  styles.label,
                  !isPhone && { fontSize: 11 },
                  { color: active ? theme.colors.accent : theme.colors.textMuted },
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "rgba(15, 15, 15, 0.95)",
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    height: Platform.OS === "ios" ? 80 : 64,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 24 : 10,
  },
  inner: {
    flex: 1,
    flexDirection: "row",
  },
  btn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
