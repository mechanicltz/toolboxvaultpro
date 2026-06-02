/**
 * TbvAccordion — expandable industrial section. Header (title + optional count
 * badge + chevron) toggles a body rendered on the `accordionContainer` skin.
 *
 * STRETCH NOTE: body height is content-driven (no fixed height) so it scales
 * from 1 to 400+ rows. The skin uses resizeMode="stretch" today; when the final
 * 9-slice accordion asset arrives, only the registry entry changes.
 */
import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, UIManager, LayoutAnimation,
  StyleProp, ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TbvPanel } from "./TbvPanel";
import { useTbvTheme } from "../useTbvTheme";
import { TBV_FONT } from "../useTbvFonts";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
  defaultOpen?: boolean;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function TbvAccordion({ title, icon, count, defaultOpen, children, style }: Props) {
  const { t } = useTbvTheme();
  const [open, setOpen] = useState(!!defaultOpen);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };

  return (
    <View style={style}>
      <TouchableOpacity activeOpacity={0.8} onPress={toggle}>
        <TbvPanel skin="actionBox" pad={14}>
          <View style={styles.headerRow}>
            <View style={styles.left}>
              {icon ? (
                <Ionicons name={icon} size={20} color={t.orange} style={{ marginRight: 10 }} />
              ) : null}
              <Text style={[styles.title, { color: t.headSteel }]} numberOfLines={1}>
                {title.toUpperCase()}
              </Text>
              {typeof count === "number" ? (
                <View style={[styles.badge, { borderColor: t.cardBorder }]}>
                  <Text style={[styles.badgeTxt, { color: t.orange }]}>{count}</Text>
                </View>
              ) : null}
            </View>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={22} color={t.orange} />
          </View>
        </TbvPanel>
      </TouchableOpacity>

      {open ? (
        <TbvPanel skin="accordionContainer" pad={12} style={{ marginTop: 8 }}>
          {children}
        </TbvPanel>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  left: { flexDirection: "row", alignItems: "center", flex: 1 },
  title: { fontFamily: TBV_FONT.head, fontSize: 18, letterSpacing: 1.2 },
  badge: {
    marginLeft: 10, paddingHorizontal: 8, paddingVertical: 1,
    borderRadius: 10, borderWidth: 1, minWidth: 24, alignItems: "center",
  },
  badgeTxt: { fontFamily: TBV_FONT.label, fontSize: 12 },
});

export default TbvAccordion;
