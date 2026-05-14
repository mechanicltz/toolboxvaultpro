import React from "react";
import { View, StyleSheet } from "react-native";
import { theme } from "./theme";

import { themedStyles } from "./themeContext";

/**
 * Simple solid dark background for predictable readability.
 * Aurora ornamental glow removed — depth comes from card elevation, not the bg.
 */
export function AuroraBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

export function GlassCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[cardStyles.card, style]}>{children}</View>;
}

const styles = themedStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
}));

const cardStyles = themedStyles((c) => ({
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: theme.radii.md,
    overflow: "hidden",
  },
}));
