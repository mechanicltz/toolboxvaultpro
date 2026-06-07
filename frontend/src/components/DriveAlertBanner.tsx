import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "../api";

type Status = {
  connected: boolean;
  needs_reauth?: boolean;
  email?: string;
  degraded?: boolean;
};

/**
 * Dashboard safety banner. Only the admin sees it, and only when Google Drive
 * offsite backup is NOT working (expired/revoked auth or never connected).
 * A dead Drive connection is otherwise easy to miss — this makes it loud.
 */
export default function DriveAlertBanner() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);

  const load = useCallback(async () => {
    try {
      const me = await api.adminWhoAmI();
      if (!me?.is_admin) {
        setStatus(null);
        return;
      }
      const s = await api.adminGdriveStatus();
      setStatus(s as Status);
    } catch {
      // not admin / not logged in / backend down — stay silent
      setStatus(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Only alert when there is a real problem with offsite backups.
  if (!status || status.connected) return null;

  const expired = !!status.needs_reauth;
  const title = expired
    ? "GOOGLE DRIVE BACKUP DISCONNECTED"
    : "OFFSITE BACKUP NOT CONNECTED";
  const sub = expired
    ? "Drive authorization expired — your backups are NOT being saved offsite. Tap to reconnect."
    : "Connect Google Drive so encrypted backups are stored offsite. Tap to set up.";

  return (
    <TouchableOpacity
      testID="drive-alert-banner"
      activeOpacity={0.85}
      onPress={() => router.push("/admin/backups")}
      style={styles.banner}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="warning" size={22} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#B3261E",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8A23C",
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#fff", fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  sub: { color: "rgba(255,255,255,0.92)", fontSize: 12, marginTop: 3, lineHeight: 16 },
});
