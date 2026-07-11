import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, Platform, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Notifications from "expo-notifications";
import { themedStyles } from "../themeContext";
import { theme } from "../theme";
import { getPermissionStatus, requestPermissions } from "../notifications";
import { useAppResume } from "../appLifecycle";

// A small, dismissible dashboard chip that appears when notifications are OFF
// (denied / not-yet-asked) — e.g. a user tapped "Not Now" in the first-launch
// permission flow. Tapping it re-asks for permission if allowed, otherwise
// deep-links to the OS Settings so they can enable it. Native-only.
export function NotificationsReminderChip() {
  const [off, setOff] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const s = styles;

  const check = useCallback(() => {
    if (Platform.OS === "web") return;
    getPermissionStatus()
      .then((st) => setOff(st !== "granted"))
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      check();
    }, [check]),
  );

  // Re-check when returning from Settings / the OS prompt.
  useAppResume(check);

  const onPress = useCallback(async () => {
    try {
      const perm = await Notifications.getPermissionsAsync();
      if (perm.status !== "granted" && perm.canAskAgain) {
        await requestPermissions();
      } else if (perm.status !== "granted") {
        await Linking.openSettings();
      }
    } catch {
      /* best-effort */
    } finally {
      check();
    }
  }, [check]);

  if (Platform.OS === "web" || !off || dismissed) return null;

  return (
    <View style={s.wrap} testID="notif-off-chip">
      <Ionicons name="notifications-off" size={16} color={theme.colors.warning} />
      <View style={{ flex: 1 }}>
        <Text style={s.title}>Notifications are off</Text>
        <Text style={s.sub}>Turn them on to get dealer, payment & loan reminders.</Text>
      </View>
      <TouchableOpacity style={s.btn} onPress={onPress} testID="notif-off-turn-on">
        <Text style={s.btnText}>TURN ON</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setDismissed(true)} hitSlop={10} testID="notif-off-dismiss">
        <Ionicons name="close" size={16} color={theme.colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.warning,
    backgroundColor: c.surfaceAlt,
  },
  title: { color: c.textPrimary, fontSize: 13, fontWeight: "800" },
  sub: { color: c.textSecondary, fontSize: 11, marginTop: 1, lineHeight: 15 },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: c.warning,
  },
  btnText: { color: "#000", fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
}));

export default NotificationsReminderChip;
