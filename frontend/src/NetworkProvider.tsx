import React, { createContext, useContext, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isOnline, startNetworkWatcher, subscribeOnline } from "./network";
import { theme } from "./theme";

type NetCtx = { online: boolean };
const NetContext = createContext<NetCtx>({ online: true });

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnlineState] = useState<boolean>(isOnline());

  useEffect(() => {
    startNetworkWatcher();
    const unsub = subscribeOnline((v) => setOnlineState(v));
    return unsub;
  }, []);

  return (
    <NetContext.Provider value={{ online }}>
      {children}
      {!online && <OfflineBanner />}
    </NetContext.Provider>
  );
}

export function useIsOnline(): boolean {
  return useContext(NetContext).online;
}

function OfflineBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      style={[styles.banner, { paddingTop: 6 + insets.top }]}
      testID="offline-banner"
    >
      <Ionicons name="cloud-offline" size={14} color="#000" />
      <Text style={styles.bannerText}>OFFLINE · SHOWING CACHED DATA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.danger,
    paddingBottom: 6,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    zIndex: 9999,
  },
  bannerText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1.5,
  },
});
