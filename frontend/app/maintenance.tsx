import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { theme } from "../src/theme";
import { api } from "../src/api";

function daysUntil(iso: string): number {
  if (!iso) return 9999;
  const target = new Date(iso + "T00:00:00").getTime();
  const today = new Date(new Date().toISOString().substring(0, 10) + "T00:00:00").getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

export default function MaintenanceScreen() {
  const router = useRouter();
  const [data, setData] = useState<{ items: any[]; overdue: number; due_soon: number; total: number }>({
    items: [],
    overdue: 0,
    due_soon: 0,
    total: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [horizon, setHorizon] = useState<30 | 60 | 90 | 365>(90);

  const load = useCallback(async () => {
    try {
      const res = await api.upcomingMaintenance(horizon);
      setData(res);
    } catch {
      /* ignore */
    }
  }, [horizon]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>MAINTENANCE</Text>
          <Text style={styles.subtitle}>CALIBRATION · SERVICE · INSPECTION</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <View style={[styles.statCard, { borderLeftColor: theme.colors.danger }]}>
          <Text style={[styles.statValue, { color: theme.colors.danger }]}>
            {data.overdue}
          </Text>
          <Text style={styles.statLabel}>OVERDUE</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: theme.colors.accent }]}>
          <Text style={[styles.statValue, { color: theme.colors.accent }]}>
            {data.due_soon}
          </Text>
          <Text style={styles.statLabel}>DUE SOON</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: theme.colors.success }]}>
          <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>
            {data.total}
          </Text>
          <Text style={styles.statLabel}>TOTAL TRACKED</Text>
        </View>
      </View>

      <View style={styles.horizonRow}>
        {[
          { v: 30, l: "30D" },
          { v: 90, l: "90D" },
          { v: 365, l: "1YR" },
        ].map((h) => (
          <TouchableOpacity
            key={h.v}
            testID={`horizon-${h.v}`}
            style={[styles.horizonChip, horizon === h.v && styles.horizonChipOn]}
            onPress={() => setHorizon(h.v as any)}
          >
            <Text style={[styles.horizonText, horizon === h.v && styles.horizonTextOn]}>
              {h.l}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
      >
        {data.items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="construct-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>NO MAINTENANCE DUE</Text>
            <Text style={styles.emptyText}>
              Schedules due within {horizon} days will appear here.
              {"\n"}Add one from any tool's detail screen.
            </Text>
          </View>
        ) : (
          data.items.map((it: any) => {
            const days = daysUntil(it.next_due_date);
            const isOverdue = it.is_overdue;
            const isUrgent = !isOverdue && days <= 30;
            return (
              <TouchableOpacity
                key={`${it.tool_id}-${it.schedule_id}`}
                testID={`mnt-${it.schedule_id}`}
                style={[
                  styles.itemCard,
                  isOverdue && { borderLeftColor: theme.colors.danger, borderLeftWidth: 3 },
                  isUrgent && { borderLeftColor: theme.colors.accent, borderLeftWidth: 3 },
                ]}
                onPress={() => router.push(`/tool/${it.tool_id}`)}
                activeOpacity={0.8}
              >
                <View style={styles.thumb}>
                  {it.tool_photo ? (
                    <Image source={{ uri: it.tool_photo }} style={styles.thumbImg} />
                  ) : (
                    <Ionicons name="construct" size={24} color={theme.colors.accent} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTool} numberOfLines={1}>
                    {it.tool_name}
                  </Text>
                  <Text style={styles.itemType}>
                    {it.type}  ·  every {it.interval_months} mo
                  </Text>
                  <Text style={styles.itemDate}>
                    Next due: {it.next_due_date}
                    {it.last_done_date ? `  ·  Last: ${it.last_done_date}` : ""}
                  </Text>
                </View>
                <View
                  style={[
                    styles.daysBadge,
                    isOverdue && { backgroundColor: theme.colors.danger },
                    isUrgent && !isOverdue && { backgroundColor: theme.colors.accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.daysText,
                      (isOverdue || isUrgent) && { color: isOverdue ? "#fff" : "#000" },
                    ]}
                  >
                    {isOverdue ? `${Math.abs(days)}D OVERDUE` : `${days}D`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 8 },
  title: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: "900", letterSpacing: 2 },
  subtitle: { color: theme.colors.accent, fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 },
  statRow: { flexDirection: "row", padding: 12, gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.bgSecondary,
    padding: 12,
    borderLeftWidth: 3,
    borderRadius: 4,
  },
  statValue: { fontSize: 24, fontWeight: "900" },
  statLabel: { color: theme.colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: 2 },
  horizonRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 8,
  },
  horizonChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.pill,
  },
  horizonChipOn: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  horizonText: { color: theme.colors.textSecondary, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  horizonTextOn: { color: "#000" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyTitle: { color: theme.colors.textPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  emptyText: { color: theme.colors.textMuted, fontSize: 12, textAlign: "center", lineHeight: 18, paddingHorizontal: 30 },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: theme.colors.bgSecondary,
    borderRadius: 4,
    marginBottom: 8,
    borderLeftColor: theme.colors.border,
    borderLeftWidth: 1,
  },
  thumb: {
    width: 50,
    height: 50,
    backgroundColor: theme.colors.bg,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  itemTool: { color: theme.colors.textPrimary, fontWeight: "800", fontSize: 14 },
  itemType: { color: theme.colors.accent, fontSize: 11, fontWeight: "700", marginTop: 3, letterSpacing: 0.5 },
  itemDate: { color: theme.colors.textMuted, fontSize: 11, marginTop: 3 },
  daysBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
  },
  daysText: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 11, letterSpacing: 0.5 },
});
