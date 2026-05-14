import React, { createContext, useContext, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isOnline, startNetworkWatcher, subscribeOnline } from "./network";
import { theme } from "./theme";

import { themedStyles } from "./themeContext";

type NetCtx = { online: boolean };
const NetContext = createContext<NetCtx>({ online: true });

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnlineState] = useState<boolean>(isOnline());

  useEffect(() => {
    startNetworkWatcher();
    const unsub = subscribeOnline((v) => setOnlineState(v));
    return unsub;
  }, []);

  return <NetContext.Provider value={{ online }}>{children}</NetContext.Provider>;
}

export function useIsOnline(): boolean {
  return useContext(NetContext).online;
}

/**
 * Inline offline banner — render this in the layout above the page Stack.
 * When online it returns null (zero height). When offline it pushes the
 * rest of the UI down so it can't cover header buttons like the Reports
 * pill or the page title row.
 */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  if (online) return null;
  return (
    <View
      style={[styles.banner, { paddingTop: 6 + insets.top }]}
      testID="offline-banner"
    >
      <Ionicons name="cloud-offline" size={14} color="#000" />
      <Text style={styles.bannerText}>OFFLINE · SHOWING CACHED DATA</Text>
    </View>
  );
}

const styles = themedStyles((c) => ({
  banner: {
    backgroundColor: c.danger,
    paddingBottom: 6,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  bannerText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 8,
    letterSpacing: 1.5,
  },
}));
