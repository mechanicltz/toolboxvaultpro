import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSkin, useColors } from "../../themeContext";
import { useSteelPanelFrame } from "../../tbv/steel";
import { SKIN, CAP } from "../../tbv/skins";
import { TbvFrame } from "../../tbv/components/TbvFrame";

export type HomeNotif = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  text: string;
  color?: string;
  onPress?: () => void;
};

const STORAGE_KEY = "home.notifOpen";
const ROW_H = 46; // matches the dealer-route panel content height
const AUTO_MS = 3000;

/**
 * Home "Notifications" panel — always visible, behaves like the inventory
 * search-bar accordion. Closed → shows a single "NOTIFICATIONS" row. Open →
 * a fixed-height area that auto-scrolls through alerts (next dealer route,
 * warranty & maintenance warnings) every 3s; the user can also swipe
 * forward/back. Open/closed state is remembered across app restarts (defaults
 * to OPEN). A 3-line handle at the bottom-center toggles it.
 */
export function NotificationsAccordion({ notifications }: { notifications: HomeNotif[] }) {
  const { skin, metalStyle } = useSkin();
  const c = useColors();
  const isSkinned = skin !== "plain";
  const isSteel = metalStyle === "steel";
  const steelPanel = useSteelPanelFrame();
  const plateFrame: any = isSteel
    ? steelPanel
    : { source: SKIN.plate, capInsets: CAP.plate, padX: 30, padTop: 18, padBottom: 18 };

  const [open, setOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [width, setWidth] = useState(0);
  const idxRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  // Restore open/closed (default OPEN).
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === "0") setOpen(false);
        setHydrated(true);
      })
      .catch(() => setHydrated(true));
  }, []);

  const toggle = useCallback(() => {
    setOpen((o) => {
      const n = !o;
      AsyncStorage.setItem(STORAGE_KEY, n ? "1" : "0").catch(() => {});
      return n;
    });
  }, []);

  const data: HomeNotif[] = notifications.length
    ? notifications
    : [{ id: "empty", icon: "checkmark-done-circle", label: "ALL CLEAR", text: "No alerts right now" }];
  const count = data.length;

  // Auto-advance every 3s when open and there's more than one alert.
  useEffect(() => {
    if (!open || count <= 1 || width <= 0) return;
    const t = setInterval(() => {
      const next = (idxRef.current + 1) % count;
      idxRef.current = next;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
    }, AUTO_MS);
    return () => clearInterval(t);
  }, [open, count, width]);

  // Keep the index valid if the alert list shrinks.
  useEffect(() => {
    if (idxRef.current >= count) {
      idxRef.current = 0;
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [count]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    idxRef.current = i;
  };

  const renderRow = (item: HomeNotif, fixedWidth?: number) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.item, { width: fixedWidth ?? "100%", height: ROW_H }]}
      activeOpacity={item.onPress ? 0.8 : 1}
      onPress={item.onPress}
      disabled={!item.onPress}
      testID={`home-notif-${item.id}`}
    >
      <View style={[styles.iconWrap, { borderColor: c.accent }]}>
        <Ionicons name={item.icon} size={20} color={item.color || c.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: c.accent }]} numberOfLines={1}>{item.label}</Text>
        <Text style={[styles.text, { color: c.textPrimary }]} numberOfLines={1}>{item.text}</Text>
      </View>
      {!!item.onPress && <Ionicons name="chevron-forward" size={18} color={c.accent} />}
    </TouchableOpacity>
  );

  const Inner = (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height: ROW_H }}>
      {!open ? (
        <TouchableOpacity style={[styles.item, { height: ROW_H }]} activeOpacity={0.8} onPress={toggle} testID="home-notif-collapsed">
          <View style={[styles.iconWrap, { borderColor: c.accent }]}>
            <Ionicons name="notifications" size={20} color={c.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: c.accent }]}>NOTIFICATIONS</Text>
            <Text style={[styles.text, { color: c.textPrimary }]}>
              {notifications.length} alert{notifications.length === 1 ? "" : "s"}
            </Text>
          </View>
        </TouchableOpacity>
      ) : width === 0 ? (
        renderRow(data[0])
      ) : (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          scrollEnabled={count > 1}
          style={{ height: ROW_H }}
          testID="home-notif-carousel"
        >
          {data.map((item) => renderRow(item, width))}
        </ScrollView>
      )}
    </View>
  );

  if (!hydrated) return <View style={{ height: ROW_H + 24 }} />;

  return (
    <View style={styles.wrap}>
      {isSkinned ? (
        <TbvFrame {...plateFrame}>{Inner}</TbvFrame>
      ) : (
        <View style={[styles.plainCard, { backgroundColor: c.bgSecondary, borderColor: c.border }]}>{Inner}</View>
      )}

      {/* 3-line handle, bottom-center — same affordance as the inventory page. */}
      <View style={styles.handleWrap} pointerEvents="box-none">
        <TouchableOpacity
          testID="home-notif-toggle"
          onPress={toggle}
          hitSlop={{ top: 10, bottom: 10, left: 24, right: 24 }}
          style={styles.handleBtn}
          activeOpacity={0.75}
        >
          <Ionicons name="filter" size={15} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", marginBottom: 26 },
  plainCard: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  label: { fontFamily: "BebasNeue_400Regular", fontSize: 12, letterSpacing: 1.4 },
  text: { fontFamily: "Rajdhani_700Bold", fontSize: 13, marginTop: 2 },
  handleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -20,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  handleBtn: { width: 42, height: 22, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
});

export default NotificationsAccordion;
