import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../theme";
import { api } from "../api";
import { formatDateUS } from "../dateUtil";

const STATUS_COLORS: Record<string, string> = {
  broken: theme.colors.danger,
  awaiting_approval: theme.colors.warning,
  waiting_replacement: theme.colors.accentSecondary,
  completed: theme.colors.success,
  rejected: theme.colors.textMuted,
};

const STATUS_LABEL: Record<string, string> = {
  broken: "OPEN",
  awaiting_approval: "AWAITING APPROVAL",
  waiting_replacement: "WAITING REPLACEMENT",
  completed: "COMPLETED",
  rejected: "REJECTED",
};

export function ClaimsHistorySection({ toolId }: { toolId: string }) {
  const router = useRouter();
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!toolId) return;
    let mounted = true;
    api
      .listWarrantyClaims({ tool_id: toolId })
      .then((c) => {
        if (mounted) setClaims(c || []);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [toolId]);

  if (loading || claims.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>CLAIMS HISTORY</Text>
          <Text style={styles.sub}>
            {claims.length} CLAIM{claims.length === 1 ? "" : "S"} ON THIS ITEM
          </Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{claims.length}</Text>
        </View>
      </View>

      {claims.map((c, idx) => {
        const status = (c.claim_status || "broken").toLowerCase();
        const color = STATUS_COLORS[status] || theme.colors.textMuted;
        const label = STATUS_LABEL[status] || status.toUpperCase();
        return (
          <TouchableOpacity
            key={c.id}
            testID={`claim-history-${c.id}`}
            style={styles.card}
            onPress={() => router.push(`/claim/${c.id}`)}
          >
            <View style={styles.row}>
              <View style={styles.numCol}>
                <Text style={styles.num}>#{idx + 1}</Text>
              </View>
              {c.broken_photo ? (
                <Image source={{ uri: c.broken_photo }} style={styles.thumb} />
              ) : null}
              <View style={{ flex: 1 }}>
                <View style={[styles.statusPill, { borderColor: color }]}>
                  <Text style={[styles.statusText, { color }]}>{label}</Text>
                </View>
                {!!c.notified_at && (
                  <Text style={styles.notifiedHi}>
                    Notified: {formatDateUS(c.notified_at)}
                  </Text>
                )}
                {!!c.repair_company && (
                  <Text style={styles.meta}>Company: {c.repair_company}</Text>
                )}
                {!!c.contact && (
                  <Text style={styles.meta}>Contact: {c.contact}</Text>
                )}
                {!!c.expected_completion && (
                  <Text style={styles.meta}>
                    Expected back: {formatDateUS(c.expected_completion)}
                  </Text>
                )}
                {!!c.completed_at && (
                  <Text style={styles.meta}>
                    Closed: {formatDateUS(c.completed_at)}
                  </Text>
                )}
              </View>
            </View>
            {!!c.notes && (
              <View style={styles.notesBox}>
                <Text style={styles.notesLabel}>NOTES</Text>
                <Text style={styles.notes}>{c.notes}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 18, paddingTop: 18 },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  sub: {
    color: theme.colors.textMuted,
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: theme.colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 30,
    alignItems: "center",
  },
  countBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  card: {
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  numCol: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  num: {
    color: theme.colors.accent,
    fontSize: 8,
    fontWeight: "900",
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 4,
    backgroundColor: theme.colors.bg,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    marginBottom: 4,
  },
  statusText: { fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  notifiedHi: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 2,
  },
  meta: {
    color: theme.colors.textSecondary,
    fontSize: 8,
    marginTop: 2,
  },
  notesBox: {
    backgroundColor: theme.colors.bg,
    borderRadius: 4,
    padding: 8,
    marginTop: 8,
  },
  notesLabel: {
    color: theme.colors.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  notes: {
    color: theme.colors.textPrimary,
    fontSize: 9,
    lineHeight: 14,
  },
});
