/**
 * TbvHeader — reusable NATIVE-TEXT header for all authenticated screens.
 * No image wordmarks. "TOOLBOX" steel + "VAULT" orange, condensed Bebas, caps.
 * Optional back button, subtitle, and right-slot. Orange accent bar beneath.
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTbvTheme } from "../useTbvTheme";
import { TBV_FONT } from "../useTbvFonts";

interface Props {
  /** Custom title; when omitted renders the TOOLBOX VAULT two-tone wordmark. */
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
}

export function TbvHeader({ title, subtitle, showBack, onBack, right }: Props) {
  const { t } = useTbvTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const back = () => (onBack ? onBack() : router.back());

  return (
    <View style={{ paddingTop: insets.top + 6 }}>
      <View style={styles.row}>
        {showBack ? (
          <TouchableOpacity onPress={back} hitSlop={12} style={styles.side}>
            <Ionicons name="chevron-back" size={26} color={t.orange} />
          </TouchableOpacity>
        ) : (
          <View style={styles.side} />
        )}

        <View style={styles.titleWrap}>
          {title ? (
            <Text style={[styles.title, { color: t.headSteel }]} numberOfLines={1}>
              {title.toUpperCase()}
            </Text>
          ) : (
            <Text style={styles.title} numberOfLines={1}>
              <Text style={{ color: t.headSteel }}>TOOLBOX </Text>
              <Text style={{ color: t.headVault }}>VAULT</Text>
            </Text>
          )}
          {!!subtitle && (
            <Text style={[styles.sub, { color: t.orange }]} numberOfLines={1}>
              {subtitle.toUpperCase()}
            </Text>
          )}
        </View>

        <View style={[styles.side, styles.sideRight]}>{right}</View>
      </View>
      <View style={[styles.accent, { backgroundColor: t.orange }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    minHeight: 52,
    gap: 6,
  },
  side: { width: 44, justifyContent: "center" },
  sideRight: { alignItems: "flex-end" },
  titleWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: {
    fontFamily: TBV_FONT.head,
    fontSize: 30,
    letterSpacing: 2,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sub: {
    fontFamily: TBV_FONT.label,
    fontSize: 11,
    letterSpacing: 3,
    marginTop: 1,
    textAlign: "center",
  },
  accent: {
    height: 2,
    width: "100%",
    opacity: 0.9,
  },
});

export default TbvHeader;
