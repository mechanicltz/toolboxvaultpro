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
import { printReportHtml } from "../printHtml";

type Stats = Awaited<ReturnType<typeof api.adminDashboardStats>>;

function buildStatsHtml(st: Stats): string {
  const generated = (() => {
    try {
      return new Date(st.generated_at).toLocaleString();
    } catch {
      return st.generated_at || "";
    }
  })();
  const row = (label: string, value: number, red?: boolean) => `
    <tr>
      <td class="label">${label}</td>
      <td class="value${red ? " red" : ""}">${(value ?? 0).toLocaleString()}</td>
    </tr>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
  <style>
    * { font-family: Helvetica, Arial, sans-serif; }
    body { padding: 32px; color: #111; }
    h1 { font-size: 22px; margin: 0 0 2px; letter-spacing: 1px; }
    .sub { color: #666; font-size: 12px; margin: 0 0 24px; }
    h2 { font-size: 13px; letter-spacing: 2px; color: #C2410C; margin: 22px 0 6px;
         border-bottom: 2px solid #eee; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 0; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
    td.label { color: #333; }
    td.value { text-align: right; font-weight: 800; font-size: 15px; width: 30%; }
    td.value.red { color: #DC2626; font-size: 17px; }
  </style></head>
  <body>
    <h1>TOOLBOX VAULT — ADMIN DASHBOARD</h1>
    <p class="sub">Generated ${generated}</p>

    <h2>INVENTORY</h2>
    <table>
      ${row("Total items (all users)", st.items_total, true)}
      ${row("Items logged today (all users)", st.items_today)}
    </table>

    <h2>USERS</h2>
    <table>
      ${row("Total registered users", st.users_total, true)}
      ${row("New accounts today", st.users_today)}
      ${row("New accounts — last 7 days", st.users_7d)}
      ${row("New accounts — last 30 days", st.users_30d)}
    </table>

    <h2>SUBSCRIPTIONS</h2>
    <table>
      ${row("TOTAL SUBSCRIBERS", st.total_subscribers, true)}
      ${row("Users on promos", st.promos)}
      ${row("Monthly subscribers", st.monthly)}
      ${row("Yearly subscribers", st.yearly)}
      ${row("Apple subscribers", st.apple)}
      ${row("Google Play subscribers", st.google)}
    </table>
  </body></html>`;
}

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
  const [sharing, setSharing] = useState(false);
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

  const onShare = useCallback(async () => {
    if (!stats || sharing) return;
    setSharing(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      // Close this modal first so the share sheet / PDF preview isn't buried
      // underneath it (the popup is a root-level RN Modal).
      setVisible(false);
      await printReportHtml(buildStatsHtml(stats), `toolbox-vault-stats-${date}.pdf`);
    } catch {
      /* printReportHtml surfaces its own errors */
    } finally {
      setSharing(false);
    }
  }, [stats, sharing]);

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
              <Row label="Total items (all users)" value={stats.items_total} red />
              <Row label="Items logged today (all users)" value={stats.items_today} />

              <View style={s.divider} />

              <Text style={s.section}>USERS</Text>
              <Row label="Total registered users" value={stats.users_total} red />
              <Row label="New accounts today" value={stats.users_today} />
              <Row label="New accounts — last 7 days" value={stats.users_7d} />
              <Row label="New accounts — last 30 days" value={stats.users_30d} />

              <View style={s.divider} />

              <Text style={s.section}>SUBSCRIPTIONS</Text>
              <Row label="TOTAL SUBSCRIBERS" value={stats.total_subscribers} red />
              <Row label="Users on promos" value={stats.promos} />
              <Row label="Monthly subscribers" value={stats.monthly} />
              <Row label="Yearly subscribers" value={stats.yearly} />
              <Row label="Apple subscribers" value={stats.apple} />
              <Row label="Google Play subscribers" value={stats.google} />
            </ScrollView>
          ) : null}

          {stats && !loading && !error ? (
            <TouchableOpacity
              style={[s.shareBtn, sharing && { opacity: 0.6 }]}
              onPress={onShare}
              disabled={sharing}
              testID="admin-stats-share"
            >
              {sharing ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={18} color="#000" />
                  <Text style={s.shareBtnText}>SHARE / EXPORT PDF</Text>
                </>
              )}
            </TouchableOpacity>
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
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: c.accent,
  },
  shareBtnText: { color: "#000", fontSize: 14, fontWeight: "900", letterSpacing: 0.8 },
}));

export default AdminStatsModal;
