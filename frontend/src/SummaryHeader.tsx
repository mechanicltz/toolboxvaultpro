import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";

import { themedStyles } from "./themeContext";

export function SummaryHeader({
  agg,
  showPrices,
  compact,
  openClaims,
  framed,
  onHealthCheck,
  onEditList,
  healthActive,
}: {
  agg: any;
  showPrices: boolean;
  compact?: boolean;
  /** Number of currently-open warranty/repair claims. Surfaced as a stat in
   *  the top-right of the header. Replaces the old TAGS count (which was
   *  rarely actionable). */
  openClaims?: number;
  /** When true, the component drops its own card chrome (bg/border/margins)
   *  because it's being wrapped in a metal <TbvFrame/> by the parent screen. */
  framed?: boolean;
  /** Tapping "Inventory Health Check" filters the list to items missing info. */
  onHealthCheck?: () => void;
  /** Tapping "Edit List" enters multi-select / bulk-action mode. */
  onEditList?: () => void;
  /** Highlights the health-check button while its filter is active. */
  healthActive?: boolean;
}) {
  if (!agg) return null;

  return (
    <View style={[styles.box, framed && styles.boxFramed]} testID="summary-header">
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
      {!compact && (onHealthCheck || onEditList) && (
        <View style={styles.actionsRow}>
          {onHealthCheck && (
            <TouchableOpacity
              style={[styles.actionBtn, healthActive && styles.actionBtnActive]}
              onPress={onHealthCheck}
              testID="summary-health-check"
              activeOpacity={0.8}
            >
              <Ionicons
                name="medkit-outline"
                size={14}
                color={healthActive ? theme.colors.bg : theme.colors.accent}
              />
              <Text style={[styles.actionBtnText, healthActive && styles.actionBtnTextActive]}>
                {healthActive ? "Health Check: On" : "Inventory Health Check"}
              </Text>
            </TouchableOpacity>
          )}
          {onEditList && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={onEditList}
              testID="summary-edit-list"
              activeOpacity={0.8}
            >
              <Ionicons name="checkbox-outline" size={14} color={theme.colors.accent} />
              <Text style={styles.actionBtnText}>Edit List</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text
        style={[styles.statValue, color ? { color } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
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
  // Skinned mode: parent wraps us in a metal <TbvFrame/>, so shed our own
  // box chrome (background, borders, rounded corners, margins, shadow).
  boxFramed: {
    backgroundColor: "transparent",
    // theme.elevation.md injects a linear-gradient backgroundImage + 2px bevel
    // borders on every side (web). Clear ALL of them so no sub-card/shadow is
    // drawn behind the content when the parent already provides a metal panel.
    backgroundImage: "none" as any,
    borderWidth: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderColor: "transparent",
    borderTopColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "transparent",
    borderRadius: 0,
    marginHorizontal: 0,
    marginBottom: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  statsRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "flex-start" },
  stat: { alignItems: "center", flex: 1, minWidth: 0, paddingHorizontal: 2 },
  statValue: { color: c.textPrimary, fontWeight: "900", fontSize: 14 },
  statLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: "transparent",
  },
  actionBtnActive: {
    backgroundColor: c.accent,
  },
  actionBtnText: {
    color: c.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  actionBtnTextActive: {
    color: c.bg,
  },
}));
