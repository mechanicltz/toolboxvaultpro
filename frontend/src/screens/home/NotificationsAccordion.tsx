import React, { useEffect, useRef, useState } from "react";
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

const ROW_H = 64;
const AUTO_MS = 3000;

/**
 * Home alert strip — always visible, no open/close. Auto-scrolls (slides left)
 * through the alerts every 3s; the user can also swipe forward/back. Content:
 * next dealer route, warranty warnings, maintenance warnings.
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

  const [width, setWidth] = useState(0);
  const idxRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  const data: HomeNotif[] = notifications.length
    ? notifications
    : [{ id: "empty", icon: "checkmark-done-circle", label: "ALL CLEAR", text: "No alerts right now" }];
  const count = data.length;

  // Auto-advance (slides left) every 3s when there's more than one alert.
  useEffect(() => {
    if (count <= 1 || width <= 0) return;
    const t = setInterval(() => {
      const next = (idxRef.current + 1) % count;
      idxRef.current = next;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
    }, AUTO_MS);
    return () => clearInterval(t);
  }, [count, width]);

  // Keep the index valid if the alert list shrinks.
  useEffect(() => {
    if (idxRef.current >= count) {
      idxRef.current = 0;
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [count]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    idxRef.current = Math.round(e.nativeEvent.contentOffset.x / width);
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
        <Text style={[styles.label, { color: c.danger }]} numberOfLines={1}>{item.label}</Text>
        <Text style={[styles.text, { color: c.textPrimary }]} numberOfLines={2}>{item.text}</Text>
      </View>
      {!!item.onPress && <Ionicons name="chevron-forward" size={18} color={c.accent} />}
    </TouchableOpacity>
  );

  const Inner = (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height: ROW_H }}>
      {width === 0 ? (
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

  return (
    <View style={styles.wrap}>
      {isSkinned ? (
        <TbvFrame {...plateFrame}>{Inner}</TbvFrame>
      ) : (
        <View style={[styles.plainCard, { backgroundColor: c.bgSecondary, borderColor: c.border }]}>{Inner}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
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
  text: { fontFamily: "Rajdhani_700Bold", fontSize: 13, lineHeight: 17, marginTop: 2 },
});

export default NotificationsAccordion;
