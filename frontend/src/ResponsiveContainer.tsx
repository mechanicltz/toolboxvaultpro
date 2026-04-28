import React from "react";
import { View, StyleSheet } from "react-native";
import { useResponsive, CONTENT_MAX_WIDTH, CONTENT_MAX_WIDTH_WIDE } from "./responsive";

type Props = {
  children: React.ReactNode;
  /**
   * "narrow" — typical content (forms, lists, single column). Caps at 760px.
   * "wide"   — grid/list views that benefit from extra width on tablets. 1080px.
   * "full"   — full-bleed (e.g. backgrounds, bottom bars).
   */
  variant?: "narrow" | "wide" | "full";
  style?: any;
};

/**
 * Centers its children with a max-width constraint on tablets/desktops.
 * On phones it's a no-op (children render full width).
 */
export function ResponsiveContainer({ children, variant = "narrow", style }: Props) {
  const { isPhone } = useResponsive();
  if (isPhone || variant === "full") {
    return <View style={[styles.full, style]}>{children}</View>;
  }
  const maxWidth = variant === "wide" ? CONTENT_MAX_WIDTH_WIDE : CONTENT_MAX_WIDTH;
  return (
    <View style={[styles.full, style]}>
      <View style={[styles.constrained, { maxWidth }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, width: "100%" },
  constrained: {
    flex: 1,
    alignSelf: "center",
    width: "100%",
  },
});
