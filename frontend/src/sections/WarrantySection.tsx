import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../theme";
import { formatDateUS } from "../dateUtil";

import { themedStyles } from "../themeContext";

const COVERAGE_LABEL: Record<string, string> = {
  months: "TIME-LIMITED",
  limited: "LIMITED COVERAGE",
  lifetime: "LIFETIME",
};

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function WarrantySection({ tool }: { tool: any }) {
  const router = useRouter();
  const w = tool.warranty || {};
  const has = w.has_warranty;

  if (!has) {
    return (
      <View style={styles.wrap}>
        <View style={styles.head}>
          <Ionicons name="shield-outline" size={22} color={theme.colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>WARRANTY</Text>
          </View>
        </View>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No warranty information available.</Text>
          <TouchableOpacity
            testID="add-warranty-link"
            style={styles.addBtn}
            onPress={() =>
              router.push({ pathname: "/tool/edit", params: { id: tool.id, focus: "warranty" } })
            }
          >
            <Ionicons name="add-circle" size={16} color={theme.colors.accent} />
            <Text style={styles.addBtnText}>ADD WARRANTY INFORMATION</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const coverageType = w.coverage_type || "months";
  const isLifetime = coverageType === "lifetime";
  const isLimited = coverageType === "limited";
  const days = daysUntil(w.expiry_date);
  const expired = days !== null && days < 0;
  const expiringSoon = days !== null && days >= 0 && days <= 30;

  let badgeColor = theme.colors.success;
  let badgeLabel = "ACTIVE";
  if (isLifetime) {
    badgeColor = theme.colors.success;
    badgeLabel = "LIFETIME";
  } else if (isLimited) {
    badgeColor = theme.colors.accent;
    badgeLabel = "LIMITED";
  } else if (expired) {
    badgeColor = theme.colors.danger;
    badgeLabel = "EXPIRED";
  } else if (expiringSoon) {
    badgeColor = theme.colors.warning;
    badgeLabel = `EXPIRES IN ${days}D`;
  } else if (days !== null) {
    badgeLabel = `${days} DAYS LEFT`;
  }

  return (
    <View style={styles.wrap}>
      {/* Header — flat (NOT inside the inner card) per user's reference
          screenshot 2026-05-27. Title + sub-label on the left, status
          badge on the right. */}
      <View style={styles.head}>
        <Ionicons name="shield-checkmark" size={22} color={theme.colors.success} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>WARRANTY</Text>
          <Text style={styles.sub}>
            {COVERAGE_LABEL[coverageType] || coverageType.toUpperCase()}
          </Text>
        </View>
        <View style={[styles.badge, { borderColor: badgeColor, backgroundColor: badgeColor + "15" }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
        </View>
      </View>
      {/* Inset inner card — ONLY the data rows + EDIT button live here.
          Slightly offset from the parent group card edges with a clear
          drop shadow so it visually pops as a "second details card
          within the first" (the user's exact words). */}
      <View style={styles.card}>
        {!!w.provider && <Row label="Provider" value={w.provider} />}
        {!!w.contact && <Row label="Contact" value={w.contact} />}
        {!isLifetime && !!w.start_date && (
          <Row label="Started" value={formatDateUS(w.start_date)} />
        )}
        {!isLifetime && !!w.expiry_date && (
          <Row
            label="Expires"
            value={formatDateUS(w.expiry_date)}
            valueColor={expired ? theme.colors.danger : expiringSoon ? theme.colors.warning : undefined}
          />
        )}
        {!!w.length_months && coverageType === "months" && (
          <Row
            label="Length"
            value={
              w.length_months >= 12 && w.length_months % 12 === 0
                ? `${w.length_months / 12} year${w.length_months === 12 ? "" : "s"}`
                : `${w.length_months} month${w.length_months === 1 ? "" : "s"}`
            }
          />
        )}
        {!!w.terms && (
          <View style={styles.terms}>
            <Text style={styles.termsLabel}>TERMS</Text>
            <Text style={styles.termsText}>{w.terms}</Text>
          </View>
        )}
        <TouchableOpacity
          testID="edit-warranty-link"
          style={styles.editLink}
          onPress={() =>
            router.push({ pathname: "/tool/edit", params: { id: tool.id, focus: "warranty" } })
          }
        >
          <Ionicons name="create-outline" size={14} color={theme.colors.accent} />
          <Text style={styles.editLinkText}>EDIT WARRANTY</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.rowValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = themedStyles((c) => ({
  // Outer wrap — small top padding so the nested card lifts off the
  // accordion header row above it.
  wrap: { paddingHorizontal: 0, paddingTop: 8, paddingBottom: 6 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  // Big bold "WARRANTY" title — matches the user's 2026-05-27 reference.
  title: {
    color: c.textPrimary,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 3,
  },
  sub: {
    color: c.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 2,
  },
  badge: {
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  card: {
    // Inset nested card — offset from the left edge so it visually pops
    // as a "second details card within the first" (the user's exact
    // reference 2026-05-27 IMG_6427.png). Strong drop shadow makes it
    // visibly lift off the parent group card.
    backgroundColor: c.bgSecondary,
    borderRadius: 10,
    padding: 16,
    marginLeft: 24,
    marginRight: 4,
    marginTop: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  emptyCard: {
    // Empty-state card — same inset + shadow treatment as `card`, dashed
    // border for the "no warranty yet" hint.
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: c.border,
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
    gap: 12,
    marginLeft: 24,
    marginRight: 4,
    marginTop: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  emptyText: {
    color: c.textMuted,
    fontSize: 12,
    fontStyle: "italic",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: c.accent,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 4,
  },
  addBtnText: {
    color: c.accent,
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 9,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  rowLabel: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },
  rowValue: {
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  terms: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
  },
  termsLabel: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 4,
  },
  termsText: {
    color: c.textSecondary,
    fontSize: 9,
    lineHeight: 13,
  },
  editLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-end",
    marginTop: 10,
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  editLinkText: {
    color: c.accent,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
}));
