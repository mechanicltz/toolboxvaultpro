/**
 * IndustrialStatCard — small numeric tile for dashboard.
 * Per Part 5C: card-style, NO heavy decoration.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { IndustrialCard } from "./IndustrialCard";
import { TBVText } from "./TBVText";
import { useTBV } from "./TBVThemeContext";

interface Props {
  label: string;
  value: string | number;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  hint?: string;
  testID?: string;
}

export function IndustrialStatCard({ label, value, icon, onPress, hint, testID }: Props) {
  const { palette, spacing } = useTBV();
  return (
    <IndustrialCard onPress={onPress} padding={spacing.lg} testID={testID}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TBVText variant="label" color={palette.textMuted}>{label.toUpperCase()}</TBVText>
          <TBVText variant="display" color={palette.text} style={styles.value}>{String(value)}</TBVText>
          {hint ? <TBVText variant="caption" color={palette.textMuted}>{hint}</TBVText> : null}
        </View>
        {icon ? (
          <View style={[styles.iconWrap, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}>
            <Ionicons name={icon} size={20} color={palette.accent} />
          </View>
        ) : null}
      </View>
    </IndustrialCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  value: { marginTop: 6, marginBottom: 2 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
});
