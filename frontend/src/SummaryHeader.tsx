import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";

import { themedStyles } from "./themeContext";

export function SummaryHeader({
  agg,
  showPrices,
  compact,
  openClaims,
}: {
  agg: any;
  showPrices: boolean;
  compact?: boolean;
  /** Number of currently-open warranty/repair claims. Surfaced as a stat in
   *  the top-right of the header. Replaces the old TAGS count (which was
   *  rarely actionable). */
  openClaims?: number;
}) {
  if (!agg) return null;
  const breakdown = (obj: Record<string, number>) => {
    const entries = Object.entries(obj || {})
      .filter(([k]) => k && k !== "—")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return entries;
  };
  const locs = breakdown(agg.location_breakdown);
  const cats = breakdown(agg.category_breakdown);
  const dealers = breakdown(agg.dealer_breakdown);

  return (
    <View style={styles.box} testID="summary-header">
      <View style={styles.statsRow}>
        <Stat label="Items" value={String(agg.count ?? 0)} />
        {showPrices && (
          <Stat
            label="Total"
            value={`$${(agg.total_value ?? 0).toFixed(2)}`}
            color={theme.colors.accent}
          />
        )}
        <Stat label="Out" value={String(agg.checked_out ?? 0)} color={theme.colors.accentSecondary} />
        {(agg.needs_repair ?? 0) > 0 && (
          <Stat label="Repair" value={String(agg.needs_repair)} color={theme.colors.danger} />
        )}
        <Stat
          label="Claims"
          value={String(openClaims ?? 0)}
          color={(openClaims ?? 0) > 0 ? theme.colors.danger : undefined}
        />
      </View>
      {!compact && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          {locs.length > 0 && (
            <Group icon="location" title="Locations" items={locs} />
          )}
          {cats.length > 0 && (
            <Group icon="folder" title="Categories" items={cats} />
          )}
          {dealers.length > 0 && (
            <Group icon="briefcase" title="Dealers" items={dealers} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Group({
  title,
  icon,
  items,
}: {
  title: string;
  icon: any;
  items: [string, number][];
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Ionicons name={icon} size={12} color={theme.colors.accent} />
        <Text style={styles.groupTitle}>{title}</Text>
      </View>
      {items.map(([k, v]) => (
        <Text key={k} style={styles.groupItem} numberOfLines={1}>
          {k} <Text style={styles.groupCount}>· {v}</Text>
        </Text>
      ))}
    </View>
  );
}

const styles = themedStyles((c) => ({
  box: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: theme.radii.md,
    borderLeftColor: c.accent,
    borderLeftWidth: 3,
    ...(theme.elevation.md as object),
  },
  statsRow: { flexDirection: "row", justifyContent: "space-around" },
  stat: { alignItems: "center" },
  statValue: { color: c.textPrimary, fontWeight: "900", fontSize: 14 },
  statLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 2,
  },
  group: {
    marginRight: 18,
    minWidth: 100,
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  groupTitle: {
    color: c.accent,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1,
  },
  groupItem: { color: c.textPrimary, fontSize: 8, marginVertical: 1 },
  groupCount: { color: c.textMuted, fontWeight: "700" },
}));
