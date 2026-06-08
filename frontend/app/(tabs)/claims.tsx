import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  TextInput,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAppResume } from "../../src/appLifecycle";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { formatDateUS as fmtDate } from "../../src/dateUtil";
import { getCached, setCached } from "../../src/cache";
import { formatPhone } from "../../src/contactLinks";

import { themedStyles } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";
import { ShadowBox, ShadowBoxSubCard } from "../../src/components/ShadowBox";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";

type Mode = "dealers" | "all-open" | "history";

export default function ClaimsScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("all-open");
  const [dealers, setDealers] = useState<any[]>(() => getCached("dealers", []));
  const [tools, setTools] = useState<any[]>(() => getCached("claims_tools", []));
  const [summary, setSummary] = useState<any>(() => getCached("claims_summary", { totals: {}, dealers: [] }));
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [archivedClaims, setArchivedClaims] = useState<any[]>(() => getCached("claims_archived", []));

  const load = useCallback(async (opts?: { forceFresh?: boolean }) => {
    try {
      const ff = opts?.forceFresh ? { forceFresh: true } : undefined;
      const [d, t, s, archived] = await Promise.all([
        api.listDealers(ff),
        api.listTools({ needs_repair: true }, ff),
        api.warrantyClaimsSummary(ff).catch(() => ({ totals: {}, dealers: [] })),
        api.listWarrantyClaims({ archived: true }, ff).catch(() => []),
      ]);
      setDealers(setCached("dealers", d || []));
      setTools(setCached("claims_tools", t || []));
      setSummary(setCached("claims_summary", s || { totals: {}, dealers: [] }));
      setArchivedClaims(setCached("claims_archived", archived || []));
    } catch {
      /* ignore */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


  const onRefresh = async () => {
    setRefreshing(true);
    await load({ forceFresh: true });
    setRefreshing(false);
  };

  // Group broken tools by dealer; "unassigned" if no dealer
  const repairedSet = new Set(
    tools
      .filter((t) => (t.repair_info?.repair_status || "").toLowerCase() === "repaired")
      .map((t) => t.id)
  );
  const openTools = tools.filter((t) => !repairedSet.has(t.id));
  const completedTools = tools.filter((t) => repairedSet.has(t.id));

  const groupByDealer = (arr: any[]) => {
    const map: Record<string, any[]> = {};
    arr.forEach((t) => {
      const k = t.dealer_id || "_unassigned";
      if (!map[k]) map[k] = [];
      map[k].push(t);
    });
    return map;
  };
  const openByDealer = groupByDealer(openTools);
  const completedByDealer = groupByDealer(completedTools);

  // Filter dealers by search
  const filteredDealers = search
    ? dealers.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
    : dealers;

  // Search across CURRENT (broken tools) + HISTORY (archived warranty claims).
  // Active when there's any search text.
  const searchActive = !!search.trim();
  const searchLower = search.trim().toLowerCase();
  const matchesText = (s: any) => (s || "").toString().toLowerCase().includes(searchLower);
  const dealerName = (id?: string) =>
    (dealers.find((d) => d.id === id)?.name || "").toString();

  // Current claims (open + repaired) that match search
  const matchedCurrent = searchActive
    ? tools.filter(
        (t) =>
          matchesText(t.name) ||
          matchesText(t.brand) ||
          matchesText(t.model) ||
          matchesText(t.serial_number) ||
          matchesText(t.dealer_name) ||
          matchesText(dealerName(t.dealer_id))
      )
    : [];

  // Archived (history) claims that match search
  const matchedArchived = searchActive
    ? archivedClaims.filter(
        (c) =>
          matchesText(c.tool_name) ||
          matchesText(c.brand) ||
          matchesText(c.model) ||
          matchesText(c.serial_number) ||
          matchesText(c.dealer_name) ||
          matchesText(dealerName(c.dealer_id))
      )
    : [];

  // ===== New Claim flow: search an item, then reuse the SAME mark-broken
  // flow on the tool detail page (/tool/[id]?startClaim=1). =====
  const [newClaimOpen, setNewClaimOpen] = useState(false);
  const [claimSearch, setClaimSearch] = useState("");
  const [allTools, setAllTools] = useState<any[]>([]);
  const [loadingAllTools, setLoadingAllTools] = useState(false);
  const openNewClaim = async () => {
    setClaimSearch("");
    setNewClaimOpen(true);
    setLoadingAllTools(true);
    try {
      const all = await api.listTools();
      setAllTools(Array.isArray(all) ? all : []);
    } catch {
      setAllTools([]);
    } finally {
      setLoadingAllTools(false);
    }
  };
  const pickClaimTool = (t: any) => {
    setNewClaimOpen(false);
    router.push(`/tool/${t.id}?startClaim=1`);
  };

  // #23 — Dashboard "New Claim" quick button deep-links here with ?newClaim=1;
  // open the picker once, then clear the param so it doesn't re-trigger.
  const navParams = useLocalSearchParams<{ newClaim?: string }>();
  useEffect(() => {
    if (navParams.newClaim === "1") {
      openNewClaim();
      router.setParams({ newClaim: undefined } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navParams.newClaim]);
  const claimQ = claimSearch.trim().toLowerCase();
  const claimResults = claimQ
    ? allTools
        .filter(
          (t) =>
            (t.name || "").toLowerCase().includes(claimQ) ||
            (t.brand || "").toLowerCase().includes(claimQ) ||
            (t.model || "").toLowerCase().includes(claimQ) ||
            (t.serial_number || "").toLowerCase().includes(claimQ)
        )
        .slice(0, 40)
    : allTools.slice(0, 20);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner title="CLAIMS" subtitle="Broken Items by Dealer" />

      <View style={styles.statRow}>
        <Stat label="Total" value={summary?.totals?.total ?? 0} />
        <Stat label="Open" value={summary?.totals?.open ?? 0} color={theme.colors.danger} />
        <Stat label="Replacement" value={summary?.totals?.waiting_replacement ?? 0} color={theme.colors.accentSecondary} />
        <Stat label="Done" value={summary?.totals?.completed ?? 0} color={theme.colors.success} />
      </View>

      <TouchableOpacity
        testID="new-claim-btn"
        style={styles.newClaimBtn}
        onPress={openNewClaim}
        activeOpacity={0.85}
      >
        <Ionicons name="add-circle" size={18} color="#000" />
        <Text style={styles.newClaimBtnText}>NEW CLAIM</Text>
      </TouchableOpacity>

      <View style={styles.modeRow}>
        <TouchableOpacity
          testID="mode-all-open"
          style={[styles.modeChip, mode === "all-open" && styles.modeChipOn]}
          onPress={() => setMode("all-open")}
        >
          <Text style={[styles.modeText, mode === "all-open" && styles.modeTextOn]}>
            OPEN CLAIMS ({openTools.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="mode-dealers"
          style={[styles.modeChip, mode === "dealers" && styles.modeChipOn]}
          onPress={() => setMode("dealers")}
        >
          <Text style={[styles.modeText, mode === "dealers" && styles.modeTextOn]}>
            DEALERS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="mode-history"
          style={[styles.modeChip, mode === "history" && styles.modeChipOn]}
          onPress={() => setMode("history")}
        >
          <Text style={[styles.modeText, mode === "history" && styles.modeTextOn]}>
            HISTORY CLAIMS ({archivedClaims.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search bar — visible in BOTH modes; searches current + history claims */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={theme.colors.textMuted} />
        <TextInput
          placeholder="Search current & history claims..."
          placeholderTextColor={theme.colors.textMuted}
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          testID="claims-search"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
      >
        {searchActive ? (
          // Unified search results across current + history
          <>
            <View style={styles.groupHeader}>
              <Ionicons name="alert-circle" size={14} color={theme.colors.danger} />
              <Text style={styles.groupTitle}>CURRENT</Text>
              <View style={styles.groupCount}>
                <Text style={styles.groupCountText}>{matchedCurrent.length}</Text>
              </View>
            </View>
            {matchedCurrent.length === 0 ? (
              <Text style={[styles.empty, { paddingVertical: 12 }]}>No current matches.</Text>
            ) : (
              matchedCurrent.map((t: any) => {
                const status = (t.repair_info?.repair_status || "Not Reported").toUpperCase();
                const statusColor =
                  status === "NOT REPORTED"
                    ? theme.colors.textMuted
                    : status === "REPORTED"
                    ? theme.colors.accent
                    : status === "REPAIRED"
                    ? theme.colors.success
                    : theme.colors.accentSecondary;
                return (
                  <BevelCard
                    key={`cur-${t.id}`}
                    style={styles.itemRow}
                    onPress={() => router.push(`/tool/${t.id}`)}
                  >
                    <View style={styles.itemThumb}>
                      {t.photos?.[0] ? (
                        <Image source={{ uri: t.photos[0] }} style={styles.itemImg} />
                      ) : (
                        <Ionicons name="build" size={18} color={theme.colors.danger} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName} numberOfLines={1}>{t.name}</Text>
                      <Text style={styles.notifiedLine} numberOfLines={1}>
                        {t.dealer_name || dealerName(t.dealer_id) || "No dealer"}
                        {t.brand ? ` · ${t.brand}` : ""}
                      </Text>
                      <View style={[styles.statusPill, { borderColor: statusColor }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                  </BevelCard>
                );
              })
            )}

            <View style={[styles.groupHeader, { marginTop: 18 }]}>
              <Ionicons name="archive" size={14} color={theme.colors.success} />
              <Text style={styles.groupTitle}>HISTORY</Text>
              <View style={styles.groupCount}>
                <Text style={styles.groupCountText}>{matchedArchived.length}</Text>
              </View>
            </View>
            {matchedArchived.length === 0 ? (
              <Text style={[styles.empty, { paddingVertical: 12 }]}>No history matches.</Text>
            ) : (
              matchedArchived.map((c: any) => (
                <BevelCard
                  key={`arch-${c.id}`}
                  style={styles.itemRow}
                  onPress={() => router.push(`/claim/${c.id}`)}
                >
                  <View style={styles.itemThumb}>
                    {c.broken_photo ? (
                      <Image source={{ uri: c.broken_photo }} style={styles.itemImg} />
                    ) : (
                      <Ionicons name="checkmark-done" size={18} color={theme.colors.success} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {c.tool_name || "Tool"}
                    </Text>
                    <Text style={styles.notifiedLine} numberOfLines={1}>
                      {c.dealer_name || dealerName(c.dealer_id) || "No dealer"}
                      {c.completed_at ? ` · ${fmtDate(c.completed_at)}` : ""}
                    </Text>
                    <View style={[styles.statusPill, { borderColor: theme.colors.success }]}>
                      <Text style={[styles.statusText, { color: theme.colors.success }]}>
                        {(c.status || "REPAIRED").toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                </BevelCard>
              ))
            )}
          </>
        ) : mode === "dealers" ? (
          filteredDealers.length === 0 && (openByDealer["_unassigned"] || []).length === 0 ? (
            <Text style={styles.empty}>No dealers yet.</Text>
          ) : (
            <ShadowBox style={{ marginBottom: 16 }}>
              <ShadowBoxSubCard>
              {filteredDealers.map((d, idx) => {
                const liveOpened = (openByDealer[d.id] || []).length;
                const summaryEntry = (summary?.dealers || []).find((x: any) => x.dealer_id === d.id);
                const opened = Math.max(liveOpened, summaryEntry?.open || 0);
                const done = summaryEntry?.completed || 0;
                const isLast =
                  idx === filteredDealers.length - 1 &&
                  (openByDealer["_unassigned"] || []).length === 0;
                return (
                  <TouchableOpacity
                    key={d.id}
                    testID={`claim-dealer-${d.id}`}
                    style={[styles.dealerListRow, isLast && { borderBottomWidth: 0 }]}
                    onPress={() => router.push(`/dealer-claims/${d.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.dealerThumb}>
                      <Ionicons name="briefcase" size={20} color={theme.colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dealerName}>{d.name}</Text>
                      <Text style={styles.dealerSub}>
                        {d.agents?.length || 0} agent{d.agents?.length === 1 ? "" : "s"}
                        {d.phone ? `  ·  ${formatPhone(d.phone)}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <View style={styles.countRow}>
                        <View style={[styles.countPill, { backgroundColor: opened > 0 ? theme.colors.danger : theme.colors.bg }]}>
                          <Text style={[styles.countText, { color: opened > 0 ? "#fff" : theme.colors.textMuted }]}>
                            {opened} OPEN
                          </Text>
                        </View>
                      </View>
                      <View style={styles.countRow}>
                        <View style={[styles.countPill, { backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border }]}>
                          <Text style={[styles.countText, { color: theme.colors.success }]}>
                            {done} DONE
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
              {(openByDealer["_unassigned"] || []).length > 0 && (
                <View style={[styles.dealerListRow, { borderBottomWidth: 0 }]}>
                  <View style={styles.dealerThumb}>
                    <Ionicons name="alert-circle" size={20} color={theme.colors.danger} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dealerName}>NO DEALER ASSIGNED</Text>
                    <Text style={styles.dealerSub}>
                      {(openByDealer["_unassigned"] || []).length} broken item{(openByDealer["_unassigned"] || []).length === 1 ? "" : "s"} need a dealer
                    </Text>
                  </View>
                </View>
              )}
              </ShadowBoxSubCard>
            </ShadowBox>
          )
        ) : mode === "history" ? (
          archivedClaims.length === 0 ? (
            <View style={{ alignItems: "center", padding: 40 }}>
              <Ionicons name="archive" size={48} color={theme.colors.textMuted} />
              <Text style={[styles.empty, { textAlign: "center", marginTop: 12 }]}>
                No history claims yet.
              </Text>
            </View>
          ) : (
            <ShadowBox style={{ marginBottom: 16 }}>
              <View style={styles.groupHeader}>
                <Ionicons name="archive" size={14} color={theme.colors.success} />
                <Text style={styles.groupTitle}>HISTORY</Text>
                <View style={styles.groupCount}>
                  <Text style={styles.groupCountText}>{archivedClaims.length}</Text>
                </View>
              </View>
              {archivedClaims.map((c: any) => (
                <ShadowBoxSubCard
                  key={`hist-${c.id}`}
                  testID={`history-claim-${c.id}`}
                  style={styles.itemRow}
                  onPress={() => router.push(`/claim/${c.id}`)}
                >
                  <View style={styles.itemThumb}>
                    {c.broken_photo ? (
                      <Image source={{ uri: c.broken_photo }} style={styles.itemImg} />
                    ) : (
                      <Ionicons name="checkmark-done" size={18} color={theme.colors.success} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {c.tool_name || "Tool"}
                    </Text>
                    <Text style={styles.notifiedLine} numberOfLines={1}>
                      {c.dealer_name || dealerName(c.dealer_id) || "No dealer"}
                      {c.completed_at ? ` · ${fmtDate(c.completed_at)}` : ""}
                    </Text>
                    <View style={[styles.statusPill, { borderColor: theme.colors.success }]}>
                      <Text style={[styles.statusText, { color: theme.colors.success }]}>
                        {(c.status || "REPAIRED").toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                </ShadowBoxSubCard>
              ))}
            </ShadowBox>
          )
        ) : (
          // All open repairs grouped by dealer
          <>
            {openTools.length === 0 ? (
              <View style={{ alignItems: "center", padding: 40 }}>
                <Ionicons name="checkmark-circle" size={48} color={theme.colors.success} />
                <Text style={[styles.empty, { textAlign: "center", marginTop: 12 }]}>
                  Nothing broken right now. 🎉
                </Text>
              </View>
            ) : (
              dealers
                .map((d) => ({ d, items: openByDealer[d.id] || [] }))
                .concat(
                  (openByDealer["_unassigned"] || []).length > 0
                    ? [{ d: { id: "_unassigned", name: "NO DEALER" } as any, items: openByDealer["_unassigned"] || [] }]
                    : []
                )
                .filter((g) => g.items.length > 0)
                .map((group) => (
                  <ShadowBox key={group.d.id} style={{ marginBottom: 16 }}>
                    <View style={styles.groupHeader}>
                      <Ionicons name="briefcase" size={14} color={theme.colors.accent} />
                      <Text style={styles.groupTitle}>{group.d.name}</Text>
                      <View style={styles.groupCount}>
                        <Text style={styles.groupCountText}>{group.items.length}</Text>
                      </View>
                    </View>
                    {group.items.map((t: any) => {
                      const status = (t.repair_info?.repair_status || "Not Reported").toUpperCase();
                      const statusColor =
                        status === "NOT REPORTED"
                          ? theme.colors.textMuted
                          : status === "REPORTED"
                          ? theme.colors.accent
                          : status === "REPAIRED"
                          ? theme.colors.success
                          : theme.colors.accentSecondary;
                      return (
                        <ShadowBoxSubCard
                          key={t.id}
                          testID={`open-tool-${t.id}`}
                          style={styles.itemRow}
                          onPress={() => router.push(`/tool/${t.id}`)}
                        >
                          <View style={styles.itemThumb}>
                            {t.photos?.[0] ? (
                              <Image source={{ uri: t.photos[0] }} style={styles.itemImg} />
                            ) : (
                              <Ionicons name="build" size={18} color={theme.colors.danger} />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemName} numberOfLines={1}>
                              {t.name}
                            </Text>
                            {!!t.repair_info?.notified_at && (
                              <Text style={styles.notifiedLine}>
                                Notified: {fmtDate(t.repair_info.notified_at)}
                              </Text>
                            )}
                            <View style={[styles.statusPill, { borderColor: statusColor }]}>
                              <Text style={[styles.statusText, { color: statusColor }]}>
                                {status}
                              </Text>
                            </View>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                        </ShadowBoxSubCard>
                      );
                    })}
                  </ShadowBox>
                ))
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={newClaimOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setNewClaimOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.ncBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.ncSheet}>
            <View style={styles.ncHeader}>
              <Text style={styles.ncTitle}>START A CLAIM</Text>
              <TouchableOpacity testID="claim-modal-close" onPress={() => setNewClaimOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.ncSub}>Search an item to start a claim for it.</Text>
            <TextInput
              testID="claim-search-input"
              placeholder="Search by name, model, serial..."
              placeholderTextColor={theme.colors.textMuted}
              style={styles.ncInput}
              value={claimSearch}
              onChangeText={setClaimSearch}
              autoFocus
            />

            {/* Divider + label separating the search bar from the results */}
            <View style={styles.ncDivider} />
            <View style={styles.ncResultsHeader}>
              <Text style={styles.ncResultsLabel}>{claimQ ? "RESULTS" : "ALL ITEMS"}</Text>
              {!loadingAllTools && (
                <Text style={styles.ncResultsCount}>{claimResults.length}</Text>
              )}
            </View>

            {loadingAllTools ? (
              <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 24 }} />
            ) : claimResults.length === 0 ? (
              <Text style={styles.ncEmpty}>
                {claimQ ? "No items match your search." : "No items found."}
              </Text>
            ) : (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 360 }}
                contentContainerStyle={{ paddingTop: 6, paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              >
                {claimResults.map((t: any) => (
                  <ShadowBox
                    key={t.id}
                    testID={`claim-pick-${t.id}`}
                    style={styles.ncResultCard}
                    onPress={() => pickClaimTool(t)}
                  >
                    <View style={styles.ncThumb}>
                      {t.photos?.[0] ? (
                        <Image source={{ uri: t.photos[0] }} style={styles.ncThumbImg} />
                      ) : (
                        <Ionicons name="construct" size={18} color={theme.colors.accent} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ncRowName} numberOfLines={1}>{t.name}</Text>
                      {!!(t.model || t.serial_number) && (
                        <Text style={styles.ncRowMeta} numberOfLines={1}>
                          {[t.model, t.serial_number].filter(Boolean).join("  -  ")}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </ShadowBox>
                ))}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}


const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  statRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomColor: c.border,
    borderBottomWidth: 1,
  },
  statBox: {
    flex: 1,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 8,
    ...(theme.elevation.md as object),
  },
  statValue: {
    fontSize: 14,
    fontWeight: "900",
    color: c.textPrimary,
  },
  statLabel: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1,
    color: c.textMuted,
    marginTop: 2,
  },
  notifiedLine: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "800",
    marginTop: 3,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  title: { color: c.textPrimary, fontSize: 16, fontWeight: "900", letterSpacing: 4 },
  subtitle: { color: c.accent, fontSize: 7, fontWeight: "700", letterSpacing: 2, marginTop: 4 },
  modeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  newClaimBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.accent,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  newClaimBtnText: { color: "#000", fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  ncBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  ncSheet: {
    backgroundColor: c.bgSecondary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    maxHeight: "82%",
  },
  ncHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ncTitle: { color: c.textPrimary, fontSize: 16, fontWeight: "800", letterSpacing: 1 },
  ncSub: { color: c.textMuted, fontSize: 12, marginTop: 4, marginBottom: 10 },
  ncInput: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: c.textPrimary,
    fontSize: 14,
  },
  ncEmpty: { color: c.textMuted, fontSize: 13, textAlign: "center", marginTop: 24 },
  ncRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  ncThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ncThumbImg: { width: "100%", height: "100%" },
  ncRowName: { color: c.textPrimary, fontSize: 14, fontWeight: "700" },
  ncRowMeta: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  ncDivider: {
    height: 1,
    backgroundColor: c.border,
    marginTop: 14,
    marginBottom: 0,
  },
  ncResultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 2,
  },
  ncResultsLabel: {
    color: c.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  ncResultsCount: {
    color: c.accent,
    fontSize: 11,
    fontWeight: "900",
  },
  ncResultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 2,
    marginBottom: 8,
  },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: theme.radii.pill,
  },
  modeChipOn: { backgroundColor: "transparent", borderColor: c.accent, borderWidth: 2 },
  modeText: {
    color: c.textSecondary,
    fontWeight: "800",
    fontSize: 8,
    letterSpacing: 1.2,
  },
  modeTextOn: { color: c.accent },
  searchBox: {
    marginHorizontal: 16,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    gap: 8,
  
    ...(theme.elevation.md as object),
  },
  searchInput: { flex: 1, color: c.textPrimary, fontSize: 10 },
  empty: { color: c.textMuted, fontStyle: "italic", paddingVertical: 16 },
  dealerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.bgSecondary,
    padding: 12,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    marginBottom: 10,
    ...(theme.elevation.md as object),
  },
  dealerListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  dealerThumb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  dealerName: { color: c.textPrimary, fontWeight: "900", fontSize: 10, letterSpacing: 0.5 },
  dealerSub: { color: c.textMuted, fontSize: 8, marginTop: 3 },
  countRow: { marginVertical: 2 },
  countPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  countText: { fontWeight: "900", fontSize: 7, letterSpacing: 0.5 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  groupTitle: { color: c.textPrimary, fontWeight: "900", fontSize: 9, letterSpacing: 1.5 },
  groupCount: {
    backgroundColor: c.danger,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: "auto",
  },
  groupCountText: { color: "#fff", fontWeight: "900", fontSize: 7 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.bgSecondary,
    padding: 10,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    marginBottom: 8,
    ...(theme.elevation.md as object),
  },
  itemThumb: {
    width: 38,
    height: 38,
    backgroundColor: c.bg,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  itemImg: { width: "100%", height: "100%" },
  itemName: { color: c.textPrimary, fontWeight: "800", fontSize: 10 },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 3,
    marginTop: 4,
  },
  statusText: { fontWeight: "900", fontSize: 7, letterSpacing: 0.5 },
}));
