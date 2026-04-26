import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  RefreshControl,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { getCached, setCached } from "../../src/cache";
import { usePrefs } from "../../src/prefs";
import { SummaryHeader } from "../../src/SummaryHeader";
import { confirm } from "../../src/confirm";
import { ReportLostModal } from "../../src/sections/LostStatusSection";
import { buildLocationTree, flattenLocationTree } from "../../src/locationTree";

type Filter = "all" | "available" | "out" | "consumables" | "lost" | "maintenance";

export default function InventoryScreen() {
  const router = useRouter();
  const { prefs } = usePrefs();
  const [tools, setTools] = useState<any[]>(() => getCached("inv_tools", []));
  const [agg, setAgg] = useState<any>(() => getCached("inv_agg", null));
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [warningCount, setWarningCount] = useState(0);
  const [openClaims, setOpenClaims] = useState(0);
  const [maintDueCount, setMaintDueCount] = useState(0);
  const [maintToolIds, setMaintToolIds] = useState<Set<string>>(new Set());

  // Bulk select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkLocation, setShowBulkLocation] = useState(false);
  const [showBulkTag, setShowBulkTag] = useState(false);
  const [showBulkLost, setShowBulkLost] = useState(false);
  const [allLocations, setAllLocations] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);

  const toggleSelect = (id: string) => {
    setSelectedIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds([]);
    setBulkActionsOpen(false);
  };

  const enterSelect = (initialId?: string) => {
    setSelectMode(true);
    if (initialId) setSelectedIds([initialId]);
  };

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const ok = await confirm(
      "Delete Tools",
      `Delete ${selectedIds.length} tool${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`,
      "Delete",
      true
    );
    if (!ok) return;
    setBulkBusy(true);
    try {
      await api.bulkTools({ tool_ids: selectedIds, action: "delete" });
      exitSelect();
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkMoveLocation = async (locId: string | null, locName: string) => {
    setBulkBusy(true);
    try {
      await api.bulkTools({
        tool_ids: selectedIds,
        action: "move_location",
        location_id: locId,
        location_name: locName,
      });
      setShowBulkLocation(false);
      exitSelect();
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkAddTag = async (tagId: string, tagName: string) => {
    setBulkBusy(true);
    try {
      await api.bulkTools({
        tool_ids: selectedIds,
        action: "add_tag",
        tag_id: tagId,
        tag_name: tagName,
      });
      setShowBulkTag(false);
      exitSelect();
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const load = useCallback(async () => {
    const params: any = { search: search || undefined };
    if (filter === "available") params.checked_out = false;
    if (filter === "out") params.checked_out = true;
    if (filter === "consumables") params.is_consumable = true;
    try {
      const [t, a, w, cs, locs, tags, mu] = await Promise.all([
        api.listTools(params),
        api.aggregate(params),
        prefs.warranty_alerts ? api.warrantyAlerts(60) : Promise.resolve({ expiring: [], expired: [] }),
        api.warrantyClaimsSummary().catch(() => ({ totals: { open: 0 } })),
        api.listLocations().catch(() => []),
        api.listTags().catch(() => []),
        api.upcomingMaintenance(60).catch(() => ({ overdue: [], due_soon: [] })),
      ]);
      // Build maintenance tool id set (overdue + due_soon)
      const mItems: any[] = (mu as any)?.items || [];
      const mIds = new Set<string>(mItems.map((x: any) => x.tool_id));
      setMaintToolIds(mIds);
      // Client-side filter for "lost" / "maintenance" since backend doesn't expose these as params
      const filteredTools =
        filter === "lost"
          ? t.filter((x: any) => x?.lost_status?.is_lost)
          : filter === "maintenance"
          ? t.filter((x: any) => mIds.has(x.id))
          : t;
      setTools(setCached("inv_tools", filteredTools));
      setAgg(setCached("inv_agg", a));
      setWarningCount((w.expiring?.length || 0) + (w.expired?.length || 0));
      setOpenClaims(cs?.totals?.open || 0);
      setMaintDueCount(mItems.length);
      setAllLocations(locs);
      setAllTags(tags);
    } catch (e) {
      console.error(e);
    }
  }, [search, filter, prefs.warranty_alerts]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search, filter, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>TOOLBOX</Text>
          <Text style={styles.subtitle}>Inventory Tracker</Text>
        </View>
      </View>

      {prefs.warranty_alerts && warningCount > 0 && (
        <TouchableOpacity
          testID="warranty-banner"
          style={styles.warrantyBanner}
          onPress={() => router.push("/warranty")}
        >
          <Ionicons name="shield-checkmark" size={18} color={theme.colors.warning} />
          <Text style={styles.warrantyText}>
            {warningCount} warranty alert{warningCount > 1 ? "s" : ""} — tap to view
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.warning} />
        </TouchableOpacity>
      )}

      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { flex: 1 }]}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            testID="search-input"
            placeholder="Search name, brand, dealer, agent, tag..."
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity testID="clear-search-btn" onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          testID="select-mode-btn"
          style={styles.selectHeaderBtn}
          onPress={() => setSelectMode(true)}
          hitSlop={6}
        >
          <Ionicons name="checkmark-done" size={20} color={theme.colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {[
            { k: "all", label: "ALL" },
            { k: "available", label: "AVAILABLE" },
            { k: "out", label: "CHECKED OUT" },
            { k: "maintenance", label: maintDueCount > 0 ? `MAINT (${maintDueCount})` : "MAINT" },
            { k: "consumables", label: "CONSUMABLES" },
            { k: "lost", label: "LOST/STOLEN" },
          ].map((f) => (
            <TouchableOpacity
              key={f.k}
              testID={`filter-${f.k}`}
              onPress={() => setFilter(f.k as any)}
              style={[styles.chip, filter === f.k && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === f.k && styles.chipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {prefs.show_details_summary && agg && (
        <SummaryHeader agg={agg} showPrices={prefs.show_prices} />
      )}

      <FlatList
        data={tools}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="construct-outline" size={64} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>NO TOOLS YET</Text>
            <Text style={styles.emptyText}>
              Tap the yellow button to add your first tool.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSelected = selectedIds.includes(item.id);
          const isLost = item?.lost_status?.is_lost;
          const isStolen = isLost && item?.lost_status?.type === "stolen";
          return (
            <TouchableOpacity
              testID={`tool-card-${item.id}`}
              style={[styles.row, isSelected && styles.rowSelected]}
              onPress={() => {
                if (selectMode) {
                  toggleSelect(item.id);
                } else {
                  router.push(`/tool/${item.id}`);
                }
              }}
              onLongPress={() => {
                if (!selectMode) enterSelect(item.id);
              }}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={["#1F1F1F", "#0E0E0E"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              {selectMode && (
                <View style={styles.checkbox}>
                  <Ionicons
                    name={isSelected ? "checkbox" : "square-outline"}
                    size={22}
                    color={isSelected ? theme.colors.accent : theme.colors.textMuted}
                  />
                </View>
              )}
              <View style={styles.thumb}>
                {item.photos?.[0] ? (
                  <Image source={{ uri: item.photos[0] }} style={styles.thumbImg} />
                ) : (
                  <Ionicons name="construct" size={28} color={theme.colors.accent} />
                )}
                {item.is_consumable && (
                  <View style={styles.consumableBadge}>
                    <Ionicons name="repeat" size={10} color="#000" />
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {isLost && (
                    <View style={styles.lostBadge}>
                      <Ionicons
                        name={isStolen ? "warning" : "help-circle"}
                        size={10}
                        color="#fff"
                      />
                      <Text style={styles.lostBadgeText}>
                        {isStolen ? "STOLEN" : "LOST"}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.location_name || "No location"}
                  {prefs.show_prices && item.cost ? `  ·  $${Number(item.cost).toFixed(0)}` : ""}
                </Text>
                {!!item.dealer_name && (
                  <Text style={styles.rowDealer} numberOfLines={1}>
                    <Ionicons name="briefcase" size={11} color={theme.colors.textMuted} />{" "}
                    {item.dealer_name}
                  </Text>
                )}
                {(() => {
                  // Compute soonest maintenance due date
                  const schedules: any[] = item.maintenance || [];
                  if (schedules.length === 0) return null;
                  const todayMs = Date.now();
                  let soonest: { days: number; type: string } | null = null;
                  schedules.forEach((s) => {
                    if (!s.next_due_date) return;
                    const dt = new Date(s.next_due_date + "T00:00:00").getTime();
                    const days = Math.round((dt - todayMs) / 86400000);
                    if (days <= 90 && (!soonest || days < soonest.days)) {
                      soonest = { days, type: s.type };
                    }
                  });
                  if (!soonest) return null;
                  const overdue = soonest.days < 0;
                  return (
                    <View
                      style={[
                        styles.mntPill,
                        { borderColor: overdue ? theme.colors.danger : theme.colors.accent },
                      ]}
                    >
                      <Ionicons
                        name="settings"
                        size={10}
                        color={overdue ? theme.colors.danger : theme.colors.accent}
                      />
                      <Text
                        style={[
                          styles.mntText,
                          { color: overdue ? theme.colors.danger : theme.colors.accent },
                        ]}
                      >
                        {overdue
                          ? `${soonest.type.toUpperCase()} OVERDUE ${Math.abs(soonest.days)}D`
                          : `${soonest.type.toUpperCase()} DUE IN ${soonest.days}D`}
                      </Text>
                    </View>
                  );
                })()}
              </View>
              {!selectMode && (
                <View style={styles.rowRight}>
                  {item.needs_repair ? (
                    <>
                      <Ionicons name="build" size={16} color={theme.colors.danger} />
                      <Text style={[styles.statusText, { color: theme.colors.danger }]}>REPAIR</Text>
                    </>
                  ) : (
                    <>
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor: item.is_checked_out
                              ? theme.colors.accentSecondary
                              : theme.colors.success,
                          },
                        ]}
                      />
                      <Text style={styles.statusText}>
                        {item.is_checked_out ? "OUT" : "IN"}
                      </Text>
                    </>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {selectMode ? (
        <View style={styles.bulkBar}>
          <View style={styles.bulkTopRow}>
            <TouchableOpacity testID="exit-select" onPress={exitSelect} hitSlop={10} style={{ padding: 8 }}>
              <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.bulkCount}>
              {selectedIds.length} SELECTED
            </Text>
            <TouchableOpacity
              testID="select-all"
              onPress={() =>
                setSelectedIds(
                  selectedIds.length === tools.length ? [] : tools.map((t) => t.id)
                )
              }
              style={styles.selectAllBtn}
            >
              <Text style={styles.selectAllText}>
                {selectedIds.length === tools.length ? "NONE" : "ALL"}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bulkActions}>
            <TouchableOpacity
              testID="bulk-move"
              style={[styles.bulkBtn, selectedIds.length === 0 && { opacity: 0.4 }]}
              onPress={() => setShowBulkLocation(true)}
              disabled={selectedIds.length === 0 || bulkBusy}
            >
              <Ionicons name="location" size={16} color={theme.colors.accent} />
              <Text style={styles.bulkBtnText}>MOVE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="bulk-tag"
              style={[styles.bulkBtn, selectedIds.length === 0 && { opacity: 0.4 }]}
              onPress={() => setShowBulkTag(true)}
              disabled={selectedIds.length === 0 || bulkBusy}
            >
              <Ionicons name="pricetag" size={16} color={theme.colors.accent} />
              <Text style={styles.bulkBtnText}>ADD TAG</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="bulk-lost"
              style={[styles.bulkBtn, selectedIds.length === 0 && { opacity: 0.4 }]}
              onPress={() => setShowBulkLost(true)}
              disabled={selectedIds.length === 0 || bulkBusy}
            >
              <Ionicons name="warning" size={16} color={theme.colors.danger} />
              <Text style={[styles.bulkBtnText, { color: theme.colors.danger }]}>MARK LOST</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="bulk-delete"
              style={[styles.bulkBtn, selectedIds.length === 0 && { opacity: 0.4 }]}
              onPress={bulkDelete}
              disabled={selectedIds.length === 0 || bulkBusy}
            >
              {bulkBusy ? (
                <ActivityIndicator color={theme.colors.danger} size="small" />
              ) : (
                <>
                  <Ionicons name="trash" size={16} color={theme.colors.danger} />
                  <Text style={[styles.bulkBtnText, { color: theme.colors.danger }]}>DELETE</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      ) : (
        <TouchableOpacity
          testID="add-tool-fab"
          style={styles.fab}
          onPress={() => router.push("/tool/edit")}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={32} color="#000" />
        </TouchableOpacity>
      )}

      {/* Bulk: Move location modal */}
      <Modal visible={showBulkLocation} transparent animationType="slide" onRequestClose={() => setShowBulkLocation(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>MOVE {selectedIds.length} TOOLS TO...</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <TouchableOpacity
                style={styles.locOption}
                onPress={() => bulkMoveLocation(null, "")}
              >
                <Ionicons name="ban-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.locOptName}>NO LOCATION</Text>
              </TouchableOpacity>
              {flattenLocationTree(buildLocationTree(allLocations)).map((n) => (
                <TouchableOpacity
                  key={n.id}
                  style={[styles.locOption, { paddingLeft: 16 + n.depth * 16 }]}
                  onPress={() => bulkMoveLocation(n.id, n.name)}
                >
                  <Ionicons
                    name={n.children.length > 0 ? "folder" : "location"}
                    size={16}
                    color={theme.colors.accent}
                  />
                  <Text style={styles.locOptName}>{n.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.btnGhost} onPress={() => setShowBulkLocation(false)}>
              <Text style={styles.btnGhostText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bulk: Add tag modal */}
      <Modal visible={showBulkTag} transparent animationType="slide" onRequestClose={() => setShowBulkTag(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>ADD TAG TO {selectedIds.length} TOOLS</Text>
            <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {allTags.length === 0 ? (
                <Text style={{ color: theme.colors.textMuted, padding: 12 }}>
                  No tags exist. Create some first from a tool's edit screen.
                </Text>
              ) : (
                allTags.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.bulkTagChip}
                    onPress={() => bulkAddTag(t.id, t.name)}
                  >
                    <Text style={styles.bulkTagChipText}>#{t.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.btnGhost} onPress={() => setShowBulkTag(false)}>
              <Text style={styles.btnGhostText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bulk: Report lost modal */}
      <ReportLostModal
        visible={showBulkLost}
        toolIds={selectedIds}
        bulk
        onClose={() => setShowBulkLost(false)}
        onSaved={() => {
          setShowBulkLost(false);
          exitSelect();
          load();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgSecondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  headerBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  headerBadge: {
    backgroundColor: theme.colors.warning,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 2,
    minWidth: 22,
    alignItems: "center",
  },
  headerBadgeText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "900",
  },
  title: { color: theme.colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: 2 },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  warrantyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(245, 158, 11, 0.18)",
    borderWidth: 1,
    borderColor: theme.colors.warning,
    borderRadius: theme.radii.md,
    ...(theme.elevation.sm as object),
  },
  warrantyText: {
    color: theme.colors.warning,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  claimsBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(185, 28, 28, 0.10)",
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: theme.radii.md,
    ...(theme.elevation.sm as object),
  },
  claimsBannerText: {
    color: theme.colors.danger,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  searchRow: { paddingHorizontal: 20, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  rowDealer: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: 0.3,
  },
  mntPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 3,
    marginTop: 5,
  },
  mntText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  selectHeaderBtn: {
    width: 44,
    height: 44,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
    borderRadius: theme.radii.md,
    gap: 8,
    ...(theme.elevation.inset as object),
  },
  searchInput: { flex: 1, color: theme.colors.textPrimary, fontSize: 15 },
  filterWrap: { maxHeight: 56, paddingVertical: 4 },
  filterRow: { paddingHorizontal: 20, paddingVertical: 8, gap: 8, alignItems: "center" },
  rowSelected: {
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },
  checkbox: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  lostBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: theme.colors.danger,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  lostBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  selectFab: {
    position: "absolute",
    right: 24,
    bottom: 90,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  bulkBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 64,
    backgroundColor: theme.colors.bgSecondary,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
    paddingTop: 8,
    paddingBottom: 12,
  },
  bulkTopRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  bulkCount: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 13,
    marginLeft: 6,
  },
  selectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
  },
  selectAllText: {
    color: theme.colors.accent,
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1.5,
  },
  bulkActions: {
    paddingHorizontal: 12,
    gap: 8,
  },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
    backgroundColor: theme.colors.bg,
  },
  bulkBtnText: {
    color: theme.colors.accent,
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1.2,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 20,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: "85%",
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 12,
  },
  locOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingRight: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  locOptName: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  bulkTagChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.bg,
  },
  bulkTagChipText: {
    color: theme.colors.accent,
    fontWeight: "700",
    fontSize: 13,
  },
  btnGhost: {
    height: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.sm,
    marginTop: 12,
  },
  btnGhostText: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    letterSpacing: 2,
  },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    marginRight: 8,
    backgroundColor: theme.colors.surface,
    ...(theme.elevation.sm as object),
  },
  chipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: "#FFA000",
    ...(theme.elevation.accent as object),
  },
  chipClaims: {
    backgroundColor: theme.colors.danger,
    borderColor: "#7F1D1D",
    ...(theme.elevation.md as object),
  },
  chipClaimsText: { color: "#FFFFFF" },
  chipText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  chipTextActive: { color: "#000" },
  row: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
    overflow: "hidden",
    ...(theme.elevation.md as object),
  },
  thumb: {
    width: 56,
    height: 56,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  consumableBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: theme.colors.accent,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    ...(theme.elevation.sm as object),
  },
  rowTitle: { color: theme.colors.textPrimary, fontWeight: "700", fontSize: 16 },
  rowSub: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  tagRow: { flexDirection: "row", marginTop: 6, gap: 4, flexWrap: "wrap" },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(255,193,7,0.15)",
    borderRadius: theme.radii.sm,
  },
  tagText: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  rowRight: { alignItems: "center", gap: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: {
    color: theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  empty: { alignItems: "center", marginTop: 80, paddingHorizontal: 40 },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 16,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  fab: {
    position: "absolute",
    bottom: 30,
    right: 24,
    width: 64,
    height: 64,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.lg,
    ...(theme.elevation.accent as object),
  },
});
