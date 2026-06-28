import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { themedStyles, useColors, useSkin } from "../../src/themeContext";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { AddFab } from "../../src/components/AddFab";
import { TbvListPanel } from "../../src/tbv/components/TbvListPanel";
import { useIsSteel, useSteelPanelFrame } from "../../src/tbv/steel";
import { SKIN, CAP } from "../../src/tbv/skins";
import { insuranceApi, ClaimSummary } from "../../src/insuranceApi";

const money = (n: number) =>
  "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Mirror the backend status buckets (insurance_claims.py).
const OPEN_STATUSES = new Set([
  "Draft", "Submitted", "Under Review", "More Information Needed", "Reopened", "Partially Approved",
]);
const CLOSED_STATUSES = new Set(["Approved", "Denied", "Paid", "Closed"]);

const STATUS_TINT: Record<string, "muted" | "accent" | "success" | "danger" | "warning"> = {
  Draft: "muted", Submitted: "accent", "Under Review": "accent",
  "More Information Needed": "warning", Approved: "success", "Partially Approved": "warning",
  Denied: "danger", Paid: "success", Closed: "muted", Reopened: "accent",
};

type ViewKey = "summary" | "open" | "closed" | "archived";

const TABS: { key: ViewKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "summary", label: "Summary", icon: "stats-chart" },
  { key: "open", label: "Open", icon: "folder-open" },
  { key: "closed", label: "Closed", icon: "checkmark-done" },
  { key: "archived", label: "Archived", icon: "archive" },
];

export default function InsuranceClaimsDashboard() {
  const router = useRouter();
  const c = useColors();
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const isSteel = useIsSteel();
  const steelPanel = useSteelPanelFrame();
  const winSrc = isSteel ? steelPanel.source : SKIN.window;
  const winCap = isSteel ? steelPanel.capInsets : CAP.window;
  const steelScale = isSteel ? steelPanel.frameScale : undefined;

  const [view, setView] = useState<ViewKey>("summary");
  const [summary, setSummary] = useState<ClaimSummary | null>(null);
  const [activeList, setActiveList] = useState<any[]>([]);
  const [archivedList, setArchivedList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, active, arch] = await Promise.all([
        insuranceApi.summary(),
        insuranceApi.list({ archived: false }),
        insuranceApi.list({ archived: true }),
      ]);
      setSummary(s);
      setActiveList(Array.isArray(active) ? active : []);
      setArchivedList(Array.isArray(arch) ? arch : []);
    } catch {
      /* soft fail — keep prior data */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tint = (key: string) => {
    const t = STATUS_TINT[key] || "muted";
    return t === "muted" ? c.textSecondary : t === "accent" ? c.accent
      : t === "success" ? c.success : t === "danger" ? c.danger : c.warning;
  };

  // Soonest incomplete task deadline → "overdue" / "due soon" pill.
  const taskDeadline = (claim: any): { label: string; color: string } | null => {
    const tasks = claim?.tasks || [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const soon = new Date(today); soon.setDate(soon.getDate() + 3); // within 3 days
    let best: Date | null = null;
    for (const t of tasks) {
      if (t.done || !t.due_date) continue;
      const head = String(t.due_date).slice(0, 10);
      const [y, m, d] = head.split("-").map(Number);
      if (!y || !m || !d) continue;
      const due = new Date(y, m - 1, d); due.setHours(0, 0, 0, 0);
      if (!best || due < best) best = due;
    }
    if (!best) return null;
    if (best < today) return { label: "Overdue", color: c.danger };
    if (best <= soon) return { label: "Due soon", color: c.warning };
    return null;
  };

  const openClaims = activeList.filter((cl) => OPEN_STATUSES.has(cl.status));
  const closedClaims = activeList.filter((cl) => CLOSED_STATUSES.has(cl.status));

  const counts = {
    summary: 0,
    open: openClaims.length,
    closed: closedClaims.length,
    archived: archivedList.length,
  };

  const baseList = view === "open" ? openClaims : view === "closed" ? closedClaims : archivedList;
  const ql = q.trim().toLowerCase();
  const visible = ql
    ? baseList.filter((cl) =>
        [cl.title, cl.claim_number, cl.claim_type, cl.insurance?.company, cl.insurance?.agent_name]
          .some((f) => (f || "").toString().toLowerCase().includes(ql)))
    : baseList;

  const statRows = summary ? [
    { label: "Total Claims", value: String(summary.total_claims), color: c.textPrimary, icon: "documents" as const },
    { label: "Open Claims", value: String(summary.open_claims), color: c.accent, icon: "folder-open" as const },
    { label: "Closed Claims", value: String(summary.closed_claims), color: c.textMuted, icon: "checkmark-done" as const },
    { label: "Denied Claims", value: String(summary.denied_claims), color: c.danger, icon: "close-circle" as const },
    { label: "Tasks to Complete", value: String(summary.open_tasks), color: summary.open_tasks > 0 ? c.warning : c.success, icon: "checkbox" as const },
    { label: "Archived Claims", value: String(archivedList.length), color: c.textMuted, icon: "archive" as const },
    { label: "Total Claimed", value: money(summary.total_claimed_value), color: c.textPrimary, icon: "cash" as const },
    { label: "Total Approved", value: money(summary.total_approved_value), color: c.success, icon: "shield-checkmark" as const },
    { label: "Total Paid", value: money(summary.total_paid_value), color: c.success, icon: "wallet" as const },
  ] : [];

  const renderSummary = () => (
    <View>
      {statRows.map((row) => (
        <View key={row.label} style={styles.statRow} testID={`ic-stat-${row.label}`}>
          <View style={styles.statIcon}>
            <Ionicons name={row.icon} size={16} color={c.accent} />
          </View>
          <Text style={styles.statRowLabel} numberOfLines={1}>{row.label.toUpperCase()}</Text>
          <View style={{ flex: 1 }} />
          <Text style={[styles.statRowValue, { color: row.color }]} numberOfLines={1}>{row.value}</Text>
        </View>
      ))}
    </View>
  );

  const renderEmpty = (msg: string) => (
    <View style={styles.emptyWrap}>
      <Ionicons name="shield-checkmark-outline" size={40} color={c.textMuted} />
      <Text style={styles.emptyTitle}>{msg}</Text>
      {view !== "archived" && (
        <TouchableOpacity testID="ic-empty-new" onPress={() => router.push("/insurance-claims/new" as any)} style={styles.primaryBtn}>
          <Ionicons name="add" size={18} color={c.textOnAccent} />
          <Text style={styles.primaryBtnText}>Create New Claim</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderList = () => (
    <View>
      {/* Inline search for list views */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={c.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          testID="ic-search"
          value={q}
          onChangeText={setQ}
          placeholder="Search title, #, company…"
          placeholderTextColor={c.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {q ? (
          <TouchableOpacity onPress={() => setQ("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={c.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {visible.length === 0 ? (
        renderEmpty(ql ? "No claims match your search." : `No ${view} claims yet.`)
      ) : (
        visible.map((claim, i) => {
          const openTasks = (claim.tasks || []).filter((t: any) => !t.done).length;
          return (
          <TouchableOpacity
            key={claim.id}
            testID={`ic-claim-${claim.id}`}
            onPress={() => router.push(`/insurance-claims/${claim.id}` as any)}
            activeOpacity={0.7}
            style={[styles.claimRow, i === visible.length - 1 && styles.claimRowLast]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.claimTitle} numberOfLines={1}>{claim.title}</Text>
              <Text style={styles.claimMeta} numberOfLines={1}>Claimed: {money(claim._total_claimed || 0)}</Text>
              {view === "open" ? (
                <Text style={styles.claimMeta} numberOfLines={1}>
                  {openTasks} task{openTasks === 1 ? "" : "s"} to complete
                </Text>
              ) : (
                <Text style={styles.claimMeta} numberOfLines={1}>Payout: {money(claim.paid_value || 0)}</Text>
              )}
            </View>
            <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
              <View style={[styles.badge, { backgroundColor: tint(claim.status) + "22", borderColor: tint(claim.status) }]}>
                <Text style={[styles.badgeText, { color: tint(claim.status) }]}>{claim.status}</Text>
              </View>
              {(() => {
                const dl = taskDeadline(claim);
                return dl ? (
                  <View style={[styles.deadlinePill, { backgroundColor: dl.color + "22", borderColor: dl.color }]} testID={`ic-deadline-${claim.id}`}>
                    <Ionicons name={dl.label === "Overdue" ? "alert-circle" : "time"} size={10} color={dl.color} />
                    <Text style={[styles.deadlineText, { color: dl.color }]}>{dl.label}</Text>
                  </View>
                ) : null;
              })()}
              <Ionicons name="chevron-forward" size={16} color={c.textMuted} style={{ marginTop: 6 }} />
            </View>
          </TouchableOpacity>
          );
        })
      )}
    </View>
  );

  const panelContent = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.accent} />
      }
    >
      {loading && !summary ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : view === "summary" ? (
        renderSummary()
      ) : (
        renderList()
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <IndustrialBanner title="INSURANCE CLAIMS" onBack={() => router.back()} />

      {/* 4 selector buttons */}
      <View style={styles.tabsRow}>
        {TABS.map((t) => {
          const on = view === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              testID={`ic-tab-${t.key}`}
              onPress={() => { setQ(""); setView(t.key); }}
              activeOpacity={0.8}
              style={[styles.tabBtn, on && styles.tabBtnOn]}
            >
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]} numberOfLines={1}>{t.label}</Text>
              {t.key !== "summary" && (
                <View style={[styles.tabCount, on && { backgroundColor: c.accent }]}>
                  <Text style={[styles.tabCountText, on && { color: c.textOnAccent }]}>{counts[t.key]}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* One static panel; content scrolls inside (showroom layout). */}
      <View style={styles.panelOuter}>
        {isIndustrial ? (
          <TbvListPanel
            source={winSrc}
            capInsets={winCap}
            frameScale={steelScale}
            style={{ flex: 1 }}
            padX={isSteel ? 18 : 30}
            padTop={isSteel ? 10 : 14}
            padBottom={isSteel ? 8 : 12}
          >
            {panelContent}
          </TbvListPanel>
        ) : (
          <View style={styles.panelPlain}>{panelContent}</View>
        )}
      </View>

      <AddFab testID="ic-new-fab" onPress={() => router.push("/insurance-claims/new" as any)} />
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg },

  tabsRow: { flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    paddingVertical: 9, paddingHorizontal: 4, borderRadius: 10,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
  },
  tabBtnOn: { borderColor: c.accent, borderWidth: 2, backgroundColor: "transparent" },
  tabLabel: { color: c.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  tabLabelOn: { color: c.accent },
  tabCount: {
    minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 9,
    backgroundColor: c.textMuted, alignItems: "center",
  },
  tabCountText: { color: c.textOnAccent, fontSize: 9, fontWeight: "900" },

  panelOuter: { flex: 1, paddingHorizontal: 14, paddingTop: 2, paddingBottom: 14 },
  panelPlain: {
    flex: 1, backgroundColor: c.bgSecondary, borderWidth: 1, borderColor: c.border,
    borderRadius: 10, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6,
  },

  // Summary stat rows
  statRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 11, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: c.borderSubtle,
  },
  statIcon: {
    width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)", marginRight: 10,
  },
  statRowLabel: { color: c.textSecondary, fontWeight: "800", fontSize: 11, letterSpacing: 0.8 },
  statRowValue: { fontWeight: "800", fontSize: 11, letterSpacing: 0.3, textAlign: "right", color: c.textPrimary },

  // Search
  searchRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12,
    height: 42, marginBottom: 10,
  },
  searchInput: { flex: 1, color: c.textPrimary, fontSize: 14 },

  // Claim rows
  claimRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.borderSubtle,
  },
  claimRowLast: { borderBottomWidth: 0 },
  claimTitle: { color: c.textPrimary, fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
  claimMeta: { color: c.textMuted, fontSize: 11, fontWeight: "600", marginTop: 2 },
  badge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },
  deadlinePill: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginTop: 5 },
  deadlineText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.2 },

  // Empty
  emptyWrap: { alignItems: "center", paddingVertical: 40 },
  emptyTitle: { color: c.textPrimary, fontSize: 15, fontWeight: "800", marginTop: 12, textAlign: "center" },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.accent,
    paddingHorizontal: 18, paddingVertical: 11, borderRadius: 24, marginTop: 16,
  },
  primaryBtnText: { color: c.textOnAccent, fontWeight: "800", fontSize: 14 },
}));
