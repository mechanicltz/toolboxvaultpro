import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { theme } from "./theme";
import { useResponsive, CONTENT_MAX_WIDTH_WIDE } from "./responsive";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: {
  name: string;
  label: string;
  icon: IconName;
  route: string;
  altRoutes?: string[];
  // If set, tapping the tab opens an inline chooser instead of navigating.
  chooser?: { title: string; options: { label: string; sub: string; icon: IconName; route: string }[] };
}[] = [
  { name: "home", label: "HOME", icon: "home", route: "/" },
  { name: "inventory", label: "INVENTORY", icon: "construct", route: "/inventory" },
  {
    name: "contacts",
    label: "CONTACTS",
    icon: "people",
    route: "/dealers", // ignored when chooser is set
    altRoutes: ["/dealers", "/borrowers", "/borrower"],
    chooser: {
      title: "Open",
      options: [
        {
          label: "Dealers",
          sub: "Vendors, balances & purchases",
          icon: "briefcase",
          route: "/dealers",
        },
        {
          label: "Contacts",
          sub: "Borrowers & checkout history",
          icon: "people",
          route: "/borrowers",
        },
      ],
    },
  },
  { name: "claims", label: "CLAIMS", icon: "build", route: "/claims" },
  { name: "more", label: "MORE", icon: "apps", route: "/more" },
];

export function BottomBar() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { isPhone, isTablet } = useResponsive();
  const [chooserOpen, setChooserOpen] = useState<null | (typeof TABS)[number]>(null);

  const isActive = (tab: (typeof TABS)[number]) => {
    if (tab.altRoutes) {
      return tab.altRoutes.some((r) =>
        r === "/" ? pathname === "/" || pathname === "/index" : pathname.startsWith(r),
      );
    }
    if (tab.route === "/") return pathname === "/" || pathname === "/index";
    return pathname.startsWith(tab.route);
  };

  return (
    <>
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
            const active = isActive(t);
            return (
              <TouchableOpacity
                key={t.name}
                testID={`tab-${t.name}`}
                style={styles.btn}
                onPress={() => {
                  if (t.chooser) {
                    setChooserOpen(t);
                  } else {
                    router.push(t.route as never);
                  }
                }}
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
                    !isPhone && { fontSize: 8 },
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

      <Modal
        visible={!!chooserOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setChooserOpen(null)}
      >
        <Pressable style={styles.modalBg} onPress={() => setChooserOpen(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{chooserOpen?.chooser?.title || "Open"}</Text>
            {chooserOpen?.chooser?.options.map((opt) => (
              <TouchableOpacity
                key={opt.route}
                testID={`tab-${chooserOpen.name}-${opt.label.toLowerCase()}`}
                style={styles.sheetRow}
                activeOpacity={0.7}
                onPress={() => {
                  setChooserOpen(null);
                  router.push(opt.route as never);
                }}
              >
                <View style={styles.sheetIcon}>
                  <Ionicons name={opt.icon} size={22} color={theme.colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetRowTitle}>{opt.label}</Text>
                  <Text style={styles.sheetRowSub}>{opt.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              testID="chooser-cancel"
              style={styles.sheetCancel}
              onPress={() => setChooserOpen(null)}
            >
              <Text style={styles.sheetCancelText}>CANCEL</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.colors.bgSecondary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 32 : 18,
    paddingHorizontal: 14,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetTitle: {
    color: theme.colors.textMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
    marginBottom: 8,
  },
  sheetIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetRowTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    fontSize: 11,
  },
  sheetRowSub: {
    color: theme.colors.textSecondary,
    fontSize: 8,
    marginTop: 2,
  },
  sheetCancel: {
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  sheetCancelText: {
    color: theme.colors.textMuted,
    fontWeight: "800",
    fontSize: 9,
    letterSpacing: 2,
  },
});
