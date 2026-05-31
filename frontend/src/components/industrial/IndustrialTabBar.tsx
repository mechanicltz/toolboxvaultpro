/**
 * IndustrialTabBar — segmented tab control using active/inactive textures.
 * Native <Text> labels on top so text is always crisp.
 */
import React from "react";
import { ImageBackground, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIndustrialTheme } from "./IndustrialThemeContext";
import { INDUSTRIAL_FONTS } from "./theme";
import { getAsset } from "./assets";

export interface TabSpec {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface Props {
  tabs: TabSpec[];
  activeKey: string;
  onChange: (key: string) => void;
  style?: ViewStyle;
}

export function IndustrialTabBar({ tabs, activeKey, onChange, style }: Props) {
  const { palette } = useIndustrialTheme();
  const activeSrc = getAsset("tab_active");
  const inactiveSrc = getAsset("tab_inactive");
  return (
    <View style={[styles.row, style]}>
      {tabs.map((t) => {
        const isActive = t.key === activeKey;
        const src = isActive ? activeSrc : inactiveSrc;
        const labelColor = isActive ? "#000" : palette.textMuted;
        const body = (
          <View style={styles.contentRow}>
            {t.icon ? <Ionicons name={t.icon} size={14} color={labelColor} /> : null}
            <Text
              style={[
                styles.label,
                { color: labelColor, fontFamily: INDUSTRIAL_FONTS.label },
              ]}
              numberOfLines={1}
            >
              {t.label}
            </Text>
          </View>
        );
        return (
          <TouchableOpacity
            key={t.key}
            onPress={() => onChange(t.key)}
            activeOpacity={0.8}
            style={styles.tabWrap}
            testID={`tab-${t.key}`}
          >
            {src ? (
              <ImageBackground source={src} resizeMode="stretch" style={styles.tabImg}>
                {body}
              </ImageBackground>
            ) : (
              <View
                style={[
                  styles.tabFallback,
                  isActive
                    ? { backgroundColor: palette.accent }
                    : { backgroundColor: palette.steel, borderWidth: 1, borderColor: palette.border },
                ]}
              >
                {body}
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6 },
  tabWrap: { flex: 1, borderRadius: 4, overflow: "hidden" },
  tabImg: { height: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  tabFallback: { height: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderRadius: 4 },
  contentRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { fontSize: 13, fontWeight: "800", letterSpacing: 1.6 },
});
