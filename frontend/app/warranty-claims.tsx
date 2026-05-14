import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { printReportHtml } from "../src/printHtml";
import { confirm } from "../src/confirm";
import { formatDateUS } from "../src/dateUtil";
import { DateField } from "../src/DateField";

import { themedStyles } from "../src/themeContext";
import { BevelCard } from "../src/components/BevelCard";

const STATUS_LIST = [
  { key: "broken", label: "Broken", color: theme.colors.danger, icon: "alert-circle" as const },
  { key: "awaiting_approval", label: "Awaiting Approval", color: theme.colors.warning, icon: "time" as const },
  { key: "waiting_replacement", label: "Waiting on Replacement", color: theme.colors.accentSecondary, icon: "cube" as const },
  { key: "completed", label: "Completed", color: theme.colors.success, icon: "checkmark-circle" as const },
  { key: "rejected", label: "Rejected", color: theme.colors.textMuted, icon: "close-circle" as const },
];

const statusMeta = (k: string) => STATUS_LIST.find((s) => s.key === k) || STATUS_LIST[0];

export default function WarrantyClaimsScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCompletedFor, setShowCompletedFor] = useState<Record<string, boolean>>({});
  const [activeByDealer, setActiveByDealer] = useState<Record<string, any[]>>({});
  const [completedByDealer, setCompletedByDealer] = useState<Record<string, any[]>>({});
  const [pickerForClaim, setPickerForClaim] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.warrantyClaimsSummary();
      setSummary(s);
      // Pre-load active claims for every dealer so they're visible by default
      const map: Record<string, any[]> = {};
      await Promise.all(
        (s?.dealers || []).map(async (d: any) => {
          const key = d.dealer_id || "_none_";
          try {
            const items = await api.listWarrantyClaims({ dealer_id: key, archived: false });
            map[key] = items;
          } catch {
            map[key] = [];
          }
        })
      );
      setActiveByDealer(map);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    // refresh any expanded completed lists too
    await Promise.all(
      Object.entries(showCompletedFor).map(async ([key, on]) => {
        if (on) await loadCompletedClaims(key);
      })
    );
    setRefreshing(false);
  };

  const dealerKey = (d: any) => d.dealer_id || "_none_";

  const loadCompletedClaims = async (key: string) => {
    try {
      const items = await api.listWarrantyClaims({ dealer_id: key, archived: true });
      setCompletedByDealer((cur) => ({ ...cur, [key]: items }));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleCompleted = async (key: string) => {
    const next = !showCompletedFor[key];
    setShowCompletedFor((cur) => ({ ...cur, [key]: next }));
    if (next && !completedByDealer[key]) {
      await loadCompletedClaims(key);
    }
  };

  const setStatus = async (claim: any, status: string) => {
    try {
      await api.updateWarrantyClaim(claim.id, { claim_status: status });
      setPickerForClaim(null);
      await load();
      const key = claim.dealer_id || "_none_";
      if (showCompletedFor[key]) await loadCompletedClaims(key);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not update claim");
    }
  };

  const [busy, setBusy] = useState(false);

  // Filters (apply to view + export)
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatuses, setFilterStatuses] = useState<string[]>(STATUS_LIST.map((s) => s.key));
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const filtersActive =
    filterStatuses.length !== STATUS_LIST.length || !!filterFrom || !!filterTo;

  const passesFilter = (c: any) => {
    if (filterStatuses.length && !filterStatuses.includes(c.claim_status)) return false;
    const d = (c.notified_at || "").substring(0, 10);
    if (filterFrom && d && d < filterFrom) return false;
    if (filterTo && d && d > filterTo) return false;
    if ((filterFrom || filterTo) && !d) return false;
    return true;
  };

  const resetFilters = () => {
    setFilterStatuses(STATUS_LIST.map((s) => s.key));
    setFilterFrom("");
    setFilterTo("");
  };

  const fetchAllForExport = async () => {
    // Pull all claims (active + completed) once
    const claims = await api.listWarrantyClaims();
    return claims.filter(passesFilter);
  };

  const groupByDealer = (claims: any[]) => {
    const map = new Map<string, { dealer_name: string; items: any[] }>();
    claims.forEach((c) => {
      const key = c.dealer_id || "_none_";
      const name = c.dealer_name || "No Dealer";
      if (!map.has(key)) map.set(key, { dealer_name: name, items: [] });
      map.get(key)!.items.push(c);
    });
    return Array.from(map.values()).sort((a, b) => a.dealer_name.localeCompare(b.dealer_name));
  };

  const exportPdf = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const claims = await fetchAllForExport();
      const groups = groupByDealer(claims);
      const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const labelOf = (k: string) => statusMeta(k).label;
      const colorOf = (k: string) => {
        const m = statusMeta(k);
        return m.color;
      };
      const totals = summary?.totals || {};
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const yyyy = today.getFullYear();
      const todayStr = `${mm}/${dd}/${yyyy}`;

      const groupHtml = groups
        .map((g) => {
          const open = g.items.filter((c) => c.claim_status !== "completed" && c.claim_status !== "rejected");
          const done = g.items.filter((c) => c.claim_status === "completed" || c.claim_status === "rejected");
          const rows = (arr: any[]) =>
            arr
              .map(
                (c) => `<tr>
                  <td>${esc(c.tool_name)}</td>
                  <td><span class="pill" style="background:${colorOf(c.claim_status)}22;color:${colorOf(c.claim_status)};border:1px solid ${colorOf(c.claim_status)}">${esc(labelOf(c.claim_status).toUpperCase())}</span></td>
                  <td>${esc(c.repair_company || "—")}</td>
                  <td>${esc(c.contact || "—")}</td>
                  <td>${esc(formatDateUS(c.notified_at) || "—")}</td>
                  <td>${esc(formatDateUS(c.expected_completion) || "—")}</td>
                  <td>${esc(formatDateUS(c.completed_at) || "—")}</td>
                  <td style="font-style:italic;color:#666">${esc(c.notes || "")}</td>
                </tr>`
              )
              .join("");
          return `
            <h2>${esc(g.dealer_name)}</h2>
            <div class="counts">
              <span class="count open">${open.length} OPEN</span>
              <span class="count done">${done.length} CLOSED</span>
            </div>
            ${
              open.length > 0
                ? `<h3>Currently Broken</h3>
                   <table>
                     <thead><tr><th>Tool</th><th>Status</th><th>Company</th><th>Contact</th><th>Notified</th><th>Expected Back</th><th>Closed</th><th>Notes</th></tr></thead>
                     <tbody>${rows(open)}</tbody>
                   </table>`
                : `<p class="muted">No currently broken items.</p>`
            }
            ${
              done.length > 0
                ? `<h3>Completed History</h3>
                   <table>
                     <thead><tr><th>Tool</th><th>Status</th><th>Company</th><th>Contact</th><th>Notified</th><th>Expected Back</th><th>Closed</th><th>Notes</th></tr></thead>
                     <tbody>${rows(done)}</tbody>
                   </table>`
                : ""
            }
          `;
        })
        .join("<hr/>");

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Helvetica;margin:24px;color:#111}
        h1{font-size:24px;letter-spacing:2px;text-transform:uppercase;border-bottom:3px solid #F97316;padding-bottom:8px;margin-bottom:8px}
        .meta{color:#666;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px}
        .totalCard{display:inline-block;width:23%;border:1px solid #ddd;padding:10px;border-radius:4px;margin-right:1%;vertical-align:top}
        .totalLabel{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1.5px}
        .totalValue{font-size:22px;font-weight:900;margin-top:4px}
        h2{font-size:16px;letter-spacing:1px;text-transform:uppercase;margin:18px 0 6px;color:#F97316}
        h3{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#666;margin:14px 0 6px}
        .count{display:inline-block;font-size:10px;font-weight:800;padding:3px 8px;border:1px solid;border-radius:2px;letter-spacing:1px;margin-right:6px}
        .count.open{color:#dc2626;border-color:#dc2626}
        .count.done{color:#16a34a;border-color:#16a34a}
        .muted{color:#999;font-style:italic;font-size:12px}
        table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
        th{background:#111;color:#F97316;text-align:left;padding:6px;font-size:9px;letter-spacing:1px}
        td{padding:6px;border-bottom:1px solid #eee;vertical-align:top}
        .pill{display:inline-block;padding:2px 6px;font-size:9px;font-weight:700;letter-spacing:0.5px;border-radius:2px}
        hr{border:none;border-top:1px solid #ddd;margin:18px 0}
      </style></head><body>
        <h1>Warranty Claims</h1>
        <div class="meta">By Dealer &middot; Generated ${todayStr}</div>
        <div>
          <div class="totalCard"><div class="totalLabel">Total</div><div class="totalValue">${totals.total || 0}</div></div>
          <div class="totalCard"><div class="totalLabel">Open</div><div class="totalValue" style="color:#dc2626">${totals.open || 0}</div></div>
          <div class="totalCard"><div class="totalLabel">Replacement</div><div class="totalValue" style="color:#f59e0b">${totals.waiting_replacement || 0}</div></div>
          <div class="totalCard"><div class="totalLabel">Completed</div><div class="totalValue" style="color:#16a34a">${totals.completed || 0}</div></div>
        </div>
        ${groups.length === 0 ? `<p class="muted">No warranty claims yet.</p>` : groupHtml}
      </body></html>`;

      await printReportHtml(html, `warranty-claims-${Date.now()}`);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not export PDF");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const claims = await fetchAllForExport();
      const groups = groupByDealer(claims);
      const escape = (s: any) => {
        const v = String(s ?? "").replace(/"/g, '""');
        return /[",\n]/.test(v) ? `"${v}"` : v;
      };
      const headers = [
        "Dealer", "Tool", "Status", "Company", "Contact",
        "Notified", "Expected Back", "Closed", "Notes",
      ];
      const lines = [headers.join(",")];
      groups.forEach((g) => {
        const sorted = [...g.items].sort((a, b) => {
          const aClosed = a.claim_status === "completed" || a.claim_status === "rejected";
          const bClosed = b.claim_status === "completed" || b.claim_status === "rejected";
          if (aClosed === bClosed) return (a.tool_name || "").localeCompare(b.tool_name || "");
          return aClosed ? 1 : -1;
        });
        sorted.forEach((c) => {
          lines.push([
            g.dealer_name,
            c.tool_name || "",
            statusMeta(c.claim_status).label,
            c.repair_company || "",
            c.contact || "",
            formatDateUS(c.notified_at) || "",
            formatDateUS(c.expected_completion) || "",
            formatDateUS(c.completed_at) || "",
            c.notes || "",
          ].map(escape).join(","));
        });
      });
      const csv = lines.join("\n");
      const filename = `warranty-claims-${new Date().toISOString().substring(0, 10)}.csv`;

      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const uri = (FileSystem as any).cacheDirectory + filename;
        await (FileSystem as any).writeAsStringAsync(uri, csv);
        if (await Sharing.isAvailableAsync())
          await Sharing.shareAsync(uri, { mimeType: "text/csv" });
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not export CSV");
    } finally {
      setBusy(false);
    }
  };

  const removeClaim = async (claim: any) => {
    if (!(await confirm("Delete claim?", "This permanently removes the claim record.", "Delete", true))) return;
    try {
      await api.deleteWarrantyClaim(claim.id);
      const key = claim.dealer_id || "_none_";
      await load();
      if (showCompletedFor[key]) await loadCompletedClaims(key);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Delete failed");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const totals = summary?.totals || {};
  const dealers = summary?.dealers || [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity testID="claims-back" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.title}>WARRANTY CLAIMS</Text>
          <Text style={styles.subtitle}>By dealer · with status pipeline</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 14 }}>
          <TouchableOpacity testID="filters-btn" onPress={() => setShowFilters(true)} hitSlop={10}>
            <View>
              <Ionicons
                name="options-outline"
                size={22}
                color={filtersActive ? theme.colors.danger : theme.colors.accent}
              />
              {filtersActive && <View style={styles.filterDot} />}
            </View>
          </TouchableOpacity>
          <TouchableOpacity testID="export-csv-btn" onPress={exportCsv} hitSlop={10} disabled={busy}>
            <Ionicons name="grid-outline" size={22} color={busy ? theme.colors.textMuted : theme.colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity testID="export-pdf-btn" onPress={exportPdf} hitSlop={10} disabled={busy}>
            <Ionicons name="document-text-outline" size={22} color={busy ? theme.colors.textMuted : theme.colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
      >
        <View style={styles.statRow}>
          <Stat label="Total" value={totals.total ?? 0} />
          <Stat label="Open" value={totals.open ?? 0} color={theme.colors.danger} />
          <Stat label="Replacement" value={totals.waiting_replacement ?? 0} color={theme.colors.accentSecondary} />
          <Stat label="Completed" value={totals.completed ?? 0} color={theme.colors.success} />
        </View>

        {filtersActive && (
          <TouchableOpacity
            testID="filter-bar"
            style={styles.filterBar}
            onPress={() => setShowFilters(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="funnel" size={14} color={theme.colors.danger} />
            <Text style={styles.filterBarText}>
              FILTERS ACTIVE
              {filterStatuses.length !== STATUS_LIST.length
                ? ` · ${filterStatuses.length}/${STATUS_LIST.length} statuses`
                : ""}
              {filterFrom || filterTo ? ` · ${filterFrom || "…"} → ${filterTo || "…"}` : ""}
            </Text>
            <TouchableOpacity onPress={resetFilters} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={theme.colors.danger} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {dealers.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="construct-outline" size={64} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>NO CLAIMS YET</Text>
            <Text style={styles.emptyText}>
              Mark a tool as broken from its detail screen to open a warranty claim.
            </Text>
          </View>
        ) : (
          dealers.map((d: any) => {
            const key = dealerKey(d);
            const active = (activeByDealer[key] || []).filter(passesFilter);
            const completed = (completedByDealer[key] || []).filter(passesFilter);
            const showDone = !!showCompletedFor[key];
            // Hide dealer entirely if all of its claims are filtered out
            const dealerHasAny =
              (activeByDealer[key]?.some(passesFilter) ?? false) ||
              (showDone && completedByDealer[key]?.some(passesFilter)) ||
              !filtersActive;
            if (filtersActive && !dealerHasAny && active.length === 0 && completed.length === 0) return null;
            return (
              <View key={key} style={styles.dealerBlock} testID={`dealer-block-${key}`}>
                <View style={styles.dealerHead}>
                  <View style={styles.dealerIcon}>
                    <Ionicons name="briefcase" size={22} color={theme.colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dealerName}>{d.dealer_name}</Text>
                    <View style={styles.countsRow}>
                      <CountPill label="OPEN" value={d.open} color={theme.colors.danger} />
                      <CountPill label="DONE" value={d.completed} color={theme.colors.success} />
                      {d.rejected > 0 && (
                        <CountPill label="REJ" value={d.rejected} color={theme.colors.textMuted} />
                      )}
                    </View>
                  </View>
                </View>

                <View style={styles.dealerBody}>
                  {active.length === 0 ? (
                    <Text style={styles.muted}>No currently broken items.</Text>
                  ) : (
                    <>
                      <Text style={styles.bodyLabel}>CURRENTLY BROKEN</Text>
                      {active.map((c: any) => (
                        <ClaimCard
                          key={c.id}
                          claim={c}
                          onOpenTool={() => router.push(`/tool/${c.tool_id}`)}
                          onPickStatus={() => setPickerForClaim(c)}
                          onDelete={() => removeClaim(c)}
                        />
                      ))}
                    </>
                  )}

                  <TouchableOpacity
                    testID={`toggle-completed-${key}`}
                    style={[styles.completedToggle, { marginTop: active.length > 0 ? 12 : 4 }]}
                    onPress={() => toggleCompleted(key)}
                  >
                    <Ionicons
                      name={showDone ? "chevron-down" : "chevron-forward"}
                      size={14}
                      color={theme.colors.accent}
                    />
                    <Text style={styles.completedToggleText}>
                      {showDone ? "HIDE COMPLETED CLAIMS" : `SHOW COMPLETED CLAIMS (${d.completed + d.rejected})`}
                    </Text>
                  </TouchableOpacity>

                  {showDone && (
                    <View style={{ marginTop: 8, gap: 8 }}>
                      {completed.length === 0 ? (
                        <Text style={styles.muted}>No completed claims yet.</Text>
                      ) : (
                        completed.map((c: any) => (
                          <ClaimCard
                            key={c.id}
                            claim={c}
                            onOpenTool={() => router.push(`/tool/${c.tool_id}`)}
                            onPickStatus={() => setPickerForClaim(c)}
                            onDelete={() => removeClaim(c)}
                          />
                        ))
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={showFilters} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>FILTER CLAIMS</Text>
            <Text style={styles.modalSub}>
              Affects what's shown on screen and what's exported to PDF/CSV.
            </Text>

            <Text style={styles.fLabel}>STATUS</Text>
            <View style={{ gap: 6, marginBottom: 12 }}>
              {STATUS_LIST.map((s) => {
                const checked = filterStatuses.includes(s.key);
                return (
                  <TouchableOpacity
                    key={s.key}
                    testID={`fstatus-${s.key}`}
                    style={[styles.checkRow, checked && { borderColor: s.color }]}
                    onPress={() => {
                      setFilterStatuses((cur) =>
                        cur.includes(s.key) ? cur.filter((k) => k !== s.key) : [...cur, s.key]
                      );
                    }}
                  >
                    <Ionicons
                      name={checked ? "checkbox" : "square-outline"}
                      size={20}
                      color={checked ? s.color : theme.colors.textMuted}
                    />
                    <Ionicons name={s.icon} size={16} color={s.color} />
                    <Text style={styles.checkText}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fLabel}>NOTIFIED DATE RANGE</Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fSubLabel}>FROM</Text>
                <DateField
                  testID="fdate-from"
                  value={filterFrom}
                  onChange={setFilterFrom}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fSubLabel}>TO</Text>
                <DateField
                  testID="fdate-to"
                  value={filterTo}
                  onChange={setFilterTo}
                />
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity testID="filters-reset" style={styles.btnGhost} onPress={resetFilters}>
                <Text style={styles.btnGhostText}>RESET</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="filters-apply"
                style={[styles.btnGhost, { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }]}
                onPress={() => setShowFilters(false)}
              >
                <Text style={[styles.btnGhostText, { color: "#000" }]}>APPLY</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!pickerForClaim} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>SET STATUS</Text>
            <Text style={styles.modalSub} numberOfLines={1}>
              {pickerForClaim?.tool_name}
            </Text>
            {STATUS_LIST.map((s) => {
              const active = pickerForClaim?.claim_status === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  testID={`pick-status-${s.key}`}
                  style={[
                    styles.pickRow,
                    active && { backgroundColor: "rgba(249, 115, 22,0.1)", borderColor: s.color },
                  ]}
                  onPress={() => pickerForClaim && setStatus(pickerForClaim, s.key)}
                >
                  <Ionicons name={s.icon} size={20} color={s.color} />
                  <Text style={[styles.pickText, { color: theme.colors.textPrimary }]}>{s.label}</Text>
                  {active && <Ionicons name="checkmark" size={20} color={theme.colors.accent} />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.btnGhost}
              onPress={() => setPickerForClaim(null)}
            >
              <Text style={styles.btnGhostText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <BevelCard style={styles.statBox}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </BevelCard>
  );
}

function ClaimCard({
  claim,
  onOpenTool,
  onPickStatus,
  onDelete,
}: {
  claim: any;
  onOpenTool: () => void;
  onPickStatus: () => void;
  onDelete: () => void;
}) {
  const meta = statusMeta(claim.claim_status);
  return (
    <BevelCard style={styles.claimCard} testID={`claim-${claim.id}`}>
      <TouchableOpacity style={styles.claimHead} onPress={onOpenTool} activeOpacity={0.7}>
        {claim.tool_photo ? (
          <Image source={{ uri: claim.tool_photo }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPh]}>
            <Ionicons name="construct" size={20} color={theme.colors.accent} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.claimTitle} numberOfLines={1}>{claim.tool_name}</Text>
          {!!claim.repair_company && (
            <Text style={styles.claimMeta} numberOfLines={1}>{claim.repair_company}</Text>
          )}
          {!!claim.notified_at && (
            <Text style={styles.claimDate}>
              Notified {formatDateUS(claim.notified_at)}
              {claim.expected_completion ? ` · Back ${formatDateUS(claim.expected_completion)}` : ""}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
      </TouchableOpacity>
      <View style={styles.claimFoot}>
        <TouchableOpacity
          testID={`claim-status-${claim.id}`}
          style={[styles.statusPill, { borderColor: meta.color }]}
          onPress={onPickStatus}
        >
          <Ionicons name={meta.icon} size={14} color={meta.color} />
          <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
          <Ionicons name="chevron-down" size={12} color={meta.color} />
        </TouchableOpacity>
        <TouchableOpacity
          testID={`claim-delete-${claim.id}`}
          onPress={onDelete}
          hitSlop={8}
          style={{ padding: 6 }}
        >
          <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>
    </BevelCard>
  );
}

function CountPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.pillValue, { color }]}>{value}</Text>
      <Text style={[styles.pillLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomColor: c.border,
    borderBottomWidth: 1,
  },
  title: { color: c.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 2 },
  subtitle: { color: c.accent, fontSize: 7, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 },
  statRow: { flexDirection: "row", padding: 16, gap: 8 },
  statBox: {
    flex: 1,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: theme.radii.md,
    ...(theme.elevation.md as object),
  },
  statValue: { color: c.textPrimary, fontSize: 16, fontWeight: "900" },
  statLabel: { color: c.textMuted, fontSize: 7, fontWeight: "800", letterSpacing: 1, marginTop: 4 },
  empty: { alignItems: "center", marginTop: 60, paddingHorizontal: 40 },
  emptyTitle: { color: c.textPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 2, marginTop: 16 },
  emptyText: { color: c.textSecondary, fontSize: 10, textAlign: "center", marginTop: 8 },
  dealerBlock: { borderBottomColor: c.border, borderBottomWidth: 1 },
  dealerHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  dealerIcon: {
    width: 40, height: 40,
    backgroundColor: c.surface,
    alignItems: "center", justifyContent: "center",
    borderRadius: 4,
  },
  dealerName: { color: c.textPrimary, fontWeight: "800", fontSize: 11 },
  countsRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  pill: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 3,
  },
  pillValue: { fontWeight: "900", fontSize: 10 },
  pillLabel: { fontSize: 7, fontWeight: "800", letterSpacing: 1 },
  dealerBody: { paddingHorizontal: 20, paddingBottom: 14, gap: 10 },
  bodyLabel: { color: c.textMuted, fontSize: 7, fontWeight: "800", letterSpacing: 1.5, marginTop: 4 },
  completedToggle: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 3,
  },
  completedToggleText: { color: c.accent, fontSize: 7, fontWeight: "800", letterSpacing: 1 },
  muted: { color: c.textMuted, fontStyle: "italic", fontSize: 10, paddingVertical: 6 },
  claimCard: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    borderRadius: 4,
    padding: 10,
    gap: 8,
  
    ...(theme.elevation.md as object),
  },
  claimHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  thumb: { width: 44, height: 44, borderRadius: 4, borderWidth: 1, borderColor: c.border },
  thumbPh: { backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  claimTitle: { color: c.textPrimary, fontWeight: "700", fontSize: 10 },
  claimMeta: { color: c.textSecondary, fontSize: 8, marginTop: 2 },
  claimDate: { color: c.textMuted, fontSize: 7, marginTop: 2 },
  claimFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderRadius: 3,
  },
  statusPillText: { fontSize: 7, fontWeight: "800", letterSpacing: 1 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: c.bgSecondary,
    padding: 20,
    borderTopWidth: 2,
    borderTopColor: c.accent,
  },
  modalTitle: { color: c.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 2 },
  modalSub: { color: c.textSecondary, fontSize: 9, marginTop: 4, marginBottom: 12 },
  filterDot: {
    position: "absolute",
    top: -2, right: -2,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: c.danger,
  },
  filterBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: c.danger,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: 4,
  },
  filterBarText: {
    flex: 1,
    color: c.danger,
    fontSize: 7, fontWeight: "800", letterSpacing: 1,
  },
  fLabel: { color: c.textMuted, fontSize: 7, fontWeight: "800", letterSpacing: 1.5, marginTop: 4, marginBottom: 6 },
  fSubLabel: { color: c.textMuted, fontSize: 7, fontWeight: "800", letterSpacing: 1, marginBottom: 4 },
  checkRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: c.border, borderRadius: 4,
  },
  checkText: { color: c.textPrimary, fontSize: 10, fontWeight: "600" },
  dateInput: {
    backgroundColor: c.bg,
    borderWidth: 1, borderColor: c.border,
    color: c.textPrimary, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 4, fontSize: 10,
  },
  pickRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: c.border,
    borderRadius: 4, marginBottom: 6,
  },
  pickText: { flex: 1, fontSize: 10, fontWeight: "600" },
  btnGhost: {
    flex: 1,
    borderWidth: 1, borderColor: c.border, height: 48, marginTop: 8,
    alignItems: "center", justifyContent: "center", borderRadius: 4,
  },
  btnGhostText: { color: c.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 10 },
}));
