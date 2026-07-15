import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { themedStyles } from "../themeContext";
import { theme } from "../theme";
import { api } from "../api";
import { useAdminStatsOpenSignal } from "../adminStats";

type Stats = Awaited<ReturnType<typeof api.adminDashboardStats>>;

// Owner/admin-only metrics popup, opened by tapping the build-number badge in
// the header. Non-admins never see it (the fetch is gated on adminWhoAmI, and
// the endpoint itself is 403-protected server-side).
export function AdminStatsModal() {
  const openSignal = useAdminStatsOpenSignal();
  const [isAdmin, setIsAdmin] = useState(false);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastSignal = useRef(openSignal);
  const s = styles;

  // Resolve admin status once.
  useEffect(() => {
    api
      .adminWhoAmI()
      .then((r) => setIsAdmin(!!r?.is_admin))
      .catch(() => setIsAdmin(false));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .adminDashboardStats()
      .then((d) => setStats(d))
      .catch((e: any) => setError(String(e?.detail || e?.message || "Failed to load stats")))
      .finally(() => setLoading(false));
  }, []);

  // React to the header badge tap.
  useEffect(() => {
    if (openSignal === lastSignal.current) return;
    lastSignal.current = openSignal;
    if (!isAdmin) return; // silently ignore taps from non-admins
    setVisible(true);
    load();
  }, [openSignal, isAdmin, load]);

  const Row = ({ label, value, red }: { label: string; value?: number; red?: boolean }) => (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, red && s.rowValueRed]}>
        {value === undefined || value === null ? "—" : value.toLocaleString()}
      </Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={s.backdrop}>
        <View style={s.card} testID="admin-stats-card">
          <View style={s.header}>
            <Ionicons name="stats-chart" size={20} color={theme.colors.accent} />
            <Text style={s.title}>ADMIN DASHBOARD</Text>
            <TouchableOpacity onPress={() => setVisible(false)} hitSlop={10} testID="admin-stats-close">
              <Ionicons name="close" size={22} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.center}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : error ? (
            <View style={s.center}>
              <Text style={s.error}>{error}</Text>
              <TouchableOpacity style={s.retry} onPress={load}>
                <Text style={s.retryText}>RETRY</Text>
              </TouchableOpacity>
            </View>
          ) : stats ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.section}>INVENTORY</Text>
              <Row label="Items logged today (all users)" value={stats.items_today} />
              <Row label="Total items (all users)" value={stats.items_total} />

              <View style={s.divider} />

              <Text style={s.section}>USERS</Text>
              <Row label="Total registered users" value={stats.users_total} />
              <Row label="New accounts today" value={stats.users_today} />
              <Row label="New accounts — last 7 days" value={stats.users_7d} />
              <Row label="New accounts — last 30 days" value={stats.users_30d} />

              <View style={s.divider} />

              <Text style={s.section}>SUBSCRIPTIONS</Text>
              <Row label="Users on promos" value={stats.promos} />
              <Row label="Monthly subscribers" value={stats.monthly} />
              <Row label="Yearly subscribers" value={stats.yearly} />
              <Row label="Apple subscribers" value={stats.apple} />
              <Row label="Google Play subscribers" value={stats.google} />
              <Row label="TOTAL SUBSCRIBERS" value={stats.total_subscribers} red />
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles((c) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "82%",
    backgroundColor: c.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.border,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  title: { flex: 1, color: c.textPrimary, fontSize: 17, fontWeight: "900", letterSpacing: 1 },
  center: { paddingVertical: 30, alignItems: "center", gap: 14 },
  error: { color: c.danger, fontSize: 14, textAlign: "center" },
  retry: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: c.accent,
  },
  retryText: { color: "#000", fontWeight: "900", letterSpacing: 0.5 },
  section: {
    color: c.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    gap: 12,
  },
  rowLabel: { flex: 1, color: c.textSecondary, fontSize: 14 },
  rowValue: { color: c.textPrimary, fontSize: 16, fontWeight: "800" },
  rowValueRed: { color: c.danger, fontSize: 18, fontWeight: "900" },
  divider: { height: 1, backgroundColor: c.borderSubtle, marginVertical: 12 },
}));

export default AdminStatsModal;
