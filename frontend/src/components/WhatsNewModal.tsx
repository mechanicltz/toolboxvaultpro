import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { themedStyles } from "../themeContext";
import { theme } from "../theme";
import { APP_VERSION } from "../version";
import { useIntroFinished } from "../introState";
import { usePermissionsOnboardingDone } from "../onboardingState";

// One-time "What's New" popup. Shows once on the first launch after the app is
// updated to APP_VERSION, then never again (gated by a version-stamped flag so
// each future release can reuse this component just by bumping the version).
const SEEN_KEY = `tbv_whatsnew_seen_${APP_VERSION}`;

const WHATS_NEW: string[] = [
  "New Steel Theme",
  "Cleaner user interface and navigation",
  "Updated reports",
  "Updated Bundle/Set items",
  "Overhauled the insurance claim feature",
  "On/Off toggle for intro video",
  "Several bug fixes",
  "Upcoming Feature list",
  "New notifications settings",
  "Add/remove or install data sets",
  "New Notifications Scroller on Dashboard",
  "Health Check for inventory list",
  "Easier to navigate menus, 3-dot menus & back navigation buttons throughout",
];

export function WhatsNewModal() {
  const [visible, setVisible] = useState(false);
  const introDone = useIntroFinished();
  const onbDone = usePermissionsOnboardingDone();
  const s = styles;

  useEffect(() => {
    // Hold off until the intro video overlay is gone AND the first-launch
    // permission cards have been handled — otherwise this native Modal would
    // render on top of the splash / permission flow.
    if (!introDone || !onbDone) return;
    let cancelled = false;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(SEEN_KEY);
        if (!cancelled && seen !== "1") {
          // small delay so it appears after the dashboard settles
          setTimeout(() => {
            if (!cancelled) setVisible(true);
          }, 700);
        }
      } catch {
        /* storage unavailable — skip silently */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [introDone, onbDone]);

  const dismiss = useCallback(async () => {
    setVisible(false);
    try {
      await AsyncStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* best-effort */
    }
  }, []);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={s.overlay}>
        <View style={s.card} testID="whats-new-modal">
          <View style={s.header}>
            <Ionicons name="sparkles" size={26} color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={s.title}>What&apos;s New</Text>
              <Text style={s.version}>Version {APP_VERSION}</Text>
            </View>
          </View>

          <ScrollView style={s.bodyScroll} bounces={false} showsVerticalScrollIndicator={false}>
            {WHATS_NEW.map((line) => (
              <View key={line} style={s.bulletRow}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={theme.colors.success}
                  style={{ marginTop: 1 }}
                />
                <Text style={s.bulletText}>{line}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            testID="whats-new-dismiss"
            activeOpacity={0.85}
            onPress={dismiss}
            style={s.primaryBtn}
          >
            <Text style={s.primaryBtnText}>GOT IT</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles((c) => ({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "82%",
    backgroundColor: c.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.border,
    padding: 22,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  title: { color: c.textPrimary, fontSize: 20, fontWeight: "900", letterSpacing: 0.3 },
  version: { color: c.accent, fontSize: 12, fontWeight: "800", letterSpacing: 0.5, marginTop: 2 },
  bodyScroll: { flexGrow: 0 },
  bulletRow: { flexDirection: "row", gap: 8, marginTop: 10, paddingRight: 4 },
  bulletText: { flex: 1, color: c.textSecondary, fontSize: 14, lineHeight: 19 },
  primaryBtn: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: c.accent,
    alignItems: "center",
  },
  primaryBtnText: {
    color: c.textOnAccent,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
}));

export default WhatsNewModal;
