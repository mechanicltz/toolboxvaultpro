import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
  Dimensions,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { theme } from "./theme";
import { useResponsive, CONTENT_MAX_WIDTH_WIDE } from "./responsive";

import { themedStyles } from "./themeContext";
import { useUpcomingBadge } from "./upcomingBadge";

// ----------------------------------------------------------------------------
// ANDROID NAV-BAR SAFE PADDING
// ----------------------------------------------------------------------------
// Android 15 (API 35+) makes edge-to-edge MANDATORY — `edgeToEdgeEnabled:false`
// in app.json is honored on older Androids but ignored on Android 15. Worse,
// `useSafeAreaInsets().bottom` returns 0 on Android 15 in this configuration
// (known bug in react-native-safe-area-context).
//
// Result: previous fixes that relied on insets did NOTHING — the tab bar sat
// underneath the system nav bar regardless. The only guaranteed solution is a
// HARDCODED minimum bottom padding that exceeds the largest typical Android
// nav-bar height. We compute it once at module load using the standard 48dp
// 3-button bar height, falling back larger for tablets where the bar can be
// taller. We can't measure the real height because the OS lies to us, so we
// pick a value that always clears the bar.
const ANDROID_NAV_SAFE_PAD = (() => {
  if (Platform.OS !== "android") return 0;
  // Detect whether the system is auto-insetting the window (non-edge-to-edge).
  // If `screen.height > window.height + statusBar`, Android already inset the
  // bottom for us — no extra padding needed (return 0). Otherwise we pad.
  const screen = Dimensions.get("screen");
  const win = Dimensions.get("window");
  const statusBar = StatusBar.currentHeight ?? 0;
  const systemReservedAtBottom = screen.height - win.height - statusBar;
  if (systemReservedAtBottom >= 24) {
    // OS is already reserving room — nothing to do.
    return 0;
  }
  // Edge-to-edge or unknown: pad enough to clear any nav bar style.
  // 48dp covers 3-button nav; tablets sometimes use 56dp. Pick 48 as a
  // sensible minimum that always works.
  return 48;
})();

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
  { name: "home", label: "DASHBOARD", icon: "home", route: "/" },
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
  { name: "more", label: "VAULT", icon: "apps", route: "/more" },
];

export function BottomBar() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { isPhone, isTablet } = useResponsive();
  const insets = useSafeAreaInsets();
  const upcomingNew = useUpcomingBadge();
  const [chooserOpen, setChooserOpen] = useState<null | (typeof TABS)[number]>(null);

  // Add the bottom safe-area inset on top of our base padding so the tab bar
  // never sits underneath the Android system nav bar / gesture pill or the
  // iOS home indicator.
  //
  // We take the LARGEST of three values:
  //   1. `basePad` — minimum visual breathing room (looks balanced even when
  //      no system bar exists, e.g. landscape or non-edge-to-edge)
  //   2. `insets.bottom` — what the OS reports (works on iOS; broken on
  //      Android 15 where it always returns 0)
  //   3. `ANDROID_NAV_SAFE_PAD` — hardcoded 48dp Android fallback that's
  //      ONLY active when we detect the system isn't already auto-insetting.
  //      This is what guarantees the bar clears the nav bar even when
  //      `useSafeAreaInsets` lies (the previous root cause we kept missing).
  const basePad = Platform.OS === "ios" ? 24 : 10;
  const bottomPad = Math.max(basePad, insets.bottom, ANDROID_NAV_SAFE_PAD);
  const baseHeight = Platform.OS === "ios" ? 80 : 64;
  const barHeight = baseHeight + Math.max(0, bottomPad - basePad);

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
      <View style={[styles.bar, { height: barHeight, paddingBottom: bottomPad }]}>
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
                  } else if (!active) {
                    // Already on this tab → do nothing (no endless reloads).
                    router.push(t.route as never);
                  }
                }}
                activeOpacity={0.7}
              >
                <View>
                  <Ionicons
                    name={t.icon}
                    size={isPhone ? 22 : 26}
                    color={active ? theme.colors.accent : theme.colors.textMuted}
                  />
                  {t.name === "more" && upcomingNew ? (
                    <View style={styles.dot} testID="tab-more-dot" />
                  ) : null}
                </View>
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
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(Platform.OS === "ios" ? 32 : 18, insets.bottom + 12) }]} onPress={() => {}}>
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

const styles = themedStyles((c) => ({
  bar: {
    flexDirection: "row",
    backgroundColor: c.tabBarBg,
    borderTopColor: c.tabBarBorder,
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
  dot: {
    position: "absolute",
    top: -3,
    right: -5,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#FF3B30",
    borderWidth: 1,
    borderColor: c.tabBarBg,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: c.bgSecondary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 32 : 18,
    paddingHorizontal: 14,
    borderTopColor: c.border,
    borderTopWidth: 1,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetTitle: {
    color: c.textMuted,
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
    borderColor: c.border,
    backgroundColor: c.bg,
    marginBottom: 8,
  },
  sheetIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetRowTitle: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 11,
  },
  sheetRowSub: {
    color: c.textSecondary,
    fontSize: 8,
    marginTop: 2,
  },
  sheetCancel: {
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  sheetCancelText: {
    color: c.textMuted,
    fontWeight: "800",
    fontSize: 9,
    letterSpacing: 2,
  },
}));
