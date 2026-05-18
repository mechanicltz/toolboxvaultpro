import { useEffect, useState, useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { getCached, setCached } from "../../src/cache";
import { usePrefs } from "../../src/prefs";
import { SummaryHeader } from "../../src/SummaryHeader";
import { confirm } from "../../src/confirm";
import { ReportLostModal } from "../../src/sections/LostStatusSection";
import { buildLocationTree, flattenLocationTree } from "../../src/locationTree";
import { useAuth } from "../../src/AuthContext";
import { useSubscriptionChange } from "../../src/subscriptionEvents";
import { useAppResume } from "../../src/appLifecycle";
import { useResponsive } from "../../src/responsive";

import { themedStyles } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";

type Filter = "all" | "available" | "out" | "consumables" | "lost" | "maintenance" | "for_sale";

export default function InventoryScreen() {
  const router = useRouter();
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const { gridCols, isPhone } = useResponsive();
  // Allow other screens to deep-link into a specific inventory filter,
  // e.g. the Home dashboard's "CHECKED OUT" card sends ?filter=out.
  const params = useLocalSearchParams<{ filter?: string }>();
  const incomingFilter = typeof params?.filter === "string" ? params.filter : null;
  const [tools, setTools] = useState<any[]>(() => getCached("inv_tools", []));
  const [agg, setAgg] = useState<any>(() => getCached("inv_agg", null));
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const VALID_FILTERS: Filter[] = ["all", "available", "out", "consumables", "lost", "maintenance", "for_sale"];
  const [filter, setFilter] = useState<Filter>(
    (incomingFilter && (VALID_FILTERS as string[]).includes(incomingFilter))
      ? (incomingFilter as Filter)
      : "all"
  );

  // When the URL param changes (e.g. user taps the home card again while
  // Inventory is still mounted), sync it into local state.
  useEffect(() => {
    if (
      incomingFilter &&
      (VALID_FILTERS as string[]).includes(incomingFilter) &&
      incomingFilter !== filter
    ) {
      setFilter(incomingFilter as Filter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingFilter]);
  const [warningCount, setWarningCount] = useState(0);
  const [openClaims, setOpenClaims] = useState(0);
  const [maintDueCount, setMaintDueCount] = useState(0);
  const [maintToolIds, setMaintToolIds] = useState<Set<string>>(new Set());
  // Subscription state — used to render the "subscription expired,
  // hidden N items" upgrade banner at the END of the list when
  // free-tier visibility cap is active. Loaded lazily; null while
  // pending so the banner doesn't flash on initial render.
  const [hiddenCount, setHiddenCount] = useState(0);

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

  // Location filter
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Tag filter (multi-select)
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const tagFilterLabel = useMemo(() => {
    if (!tagFilter.length) return "All Tags";
    if (tagFilter.length === 1) {
      const found = allTags.find((t) => t.id === tagFilter[0]);
      return found?.name || "1 tag";
    }
    return `${tagFilter.length} tags`;
  }, [tagFilter, allTags]);

  // Status picker (replaces the horizontal chip scroller)
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  // ---------------------------------------------------------------------------
  // Filter COUNTS — how many tools would match each picker option if it were
  // the only filter applied. Surfaced in the picker labels as e.g.
  // "AVAILABLE (12)" / "Garage (4)" / "Power Tools (3)" so the user can see
  // at a glance how many items are in each bucket WITHOUT applying the filter
  // first. Each map is computed on the raw `tools` master list so the numbers
  // are independent of other active filters.
  // ---------------------------------------------------------------------------
  const filterCounts = useMemo(() => {
    const status: Record<string, number> = {
      all: tools.length,
      available: 0,
      out: 0,
      consumables: 0,
      for_sale: 0,
      lost: 0,
      maintenance: 0,
    };
    // Location counts include descendants — picking "Garage" with sub-locations
    // "Top Drawer" and "Bottom Drawer" should show the SUM, not just direct.
    // Build a parent→all-descendants map first.
    const childrenByParent: Record<string, string[]> = {};
    for (const l of allLocations) {
      if (l.parent_id) {
        if (!childrenByParent[l.parent_id]) childrenByParent[l.parent_id] = [];
        childrenByParent[l.parent_id].push(l.id);
      }
    }
    const descendantIds = (rootId: string): Set<string> => {
      const out = new Set<string>([rootId]);
      const queue = [rootId];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const cid of childrenByParent[cur] || []) {
          if (!out.has(cid)) {
            out.add(cid);
            queue.push(cid);
          }
        }
      }
      return out;
    };
    const location: Record<string, number> = {};
    const tag: Record<string, number> = {};
    for (const t of tools) {
      if (!t?.is_checked_out) status.available++;
      else status.out++;
      if (t?.is_consumable) status.consumables++;
      if (t?.for_sale && !t?.is_sold) status.for_sale++;
      if (t?.lost_status?.is_lost) status.lost++;
      if (Array.isArray(t?.maintenance) && t.maintenance.length > 0) status.maintenance++;
      if (Array.isArray(t?.tag_ids)) {
        for (const tid of t.tag_ids) tag[tid] = (tag[tid] || 0) + 1;
      }
    }
    // Location counts: for each location L, count tools whose location_id is
    // in descendantIds(L). This is O(L * T) which is fine for typical sizes
    // (sub-thousand of each) — runs instantly.
    for (const loc of allLocations) {
      const set = descendantIds(loc.id);
      let n = 0;
      for (const t of tools) {
        if (t?.location_id && set.has(t.location_id)) n++;
      }
      location[loc.id] = n;
    }
    return { status, location, tag };
  }, [tools, allLocations]);

  const STATUS_OPTIONS = useMemo(
    () => [
      { k: "all", label: `ALL (${filterCounts.status.all})`, icon: "apps" as const },
      {
        k: "available",
        label: `AVAILABLE (${filterCounts.status.available})`,
        icon: "checkmark-circle" as const,
      },
      {
        k: "out",
        label: `CHECKED OUT (${filterCounts.status.out})`,
        icon: "log-out" as const,
      },
      {
        k: "maintenance",
        label: `MAINTENANCE (${filterCounts.status.maintenance})`,
        icon: "build" as const,
      },
      {
        k: "consumables",
        label: `CONSUMABLES (${filterCounts.status.consumables})`,
        icon: "cube" as const,
      },
      {
        k: "for_sale",
        label: `FOR SALE (${filterCounts.status.for_sale})`,
        icon: "pricetag" as const,
      },
      {
        k: "lost",
        label: `LOST / STOLEN (${filterCounts.status.lost})`,
        icon: "alert-circle" as const,
      },
    ],
    [filterCounts],
  );
  const statusLabel =
    STATUS_OPTIONS.find((o) => o.k === filter)?.label || "ALL";

  // Sort dropdown
  type SortKey = "date_desc" | "date_asc" | "alpha" | "price_high" | "price_low";
  const [sortBy, setSortBy] = useState<SortKey>("date_desc");
  const [showSortPicker, setShowSortPicker] = useState(false);
  const SORT_OPTIONS: { k: SortKey; label: string; icon: any }[] = [
    { k: "date_desc", label: "DATE — NEWEST FIRST", icon: "arrow-down" },
    { k: "date_asc", label: "DATE — OLDEST FIRST", icon: "arrow-up" },
    { k: "alpha", label: "ALPHABETICAL (A → Z)", icon: "text" },
    { k: "price_high", label: "PRICE — HIGH TO LOW", icon: "trending-down" },
    { k: "price_low", label: "PRICE — LOW TO HIGH", icon: "trending-up" },
  ];
  const sortLabel = SORT_OPTIONS.find((o) => o.k === sortBy)?.label || "SORT";

  // Selected location + all its descendants
  const locationFilterIds = useMemo(() => {
    if (!locationFilter) return null;
    const ids = new Set<string>([locationFilter]);
    const queue = [locationFilter];
    while (queue.length) {
      const cur = queue.shift()!;
      allLocations
        .filter((l) => l.parent_id === cur)
        .forEach((l) => {
          if (!ids.has(l.id)) {
            ids.add(l.id);
            queue.push(l.id);
          }
        });
    }
    return ids;
  }, [locationFilter, allLocations]);

  const selectedLocationName = useMemo(() => {
    if (!locationFilter) return null;
    const found = allLocations.find((l) => l.id === locationFilter);
    return found?.name || null;
  }, [locationFilter, allLocations]);

  // No subscription tiers — every tool is fully editable for everyone.
  const lockedToolIds = useMemo(() => new Set<string>(), []);

  const atToolLimit = false;

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
    // Only `search` goes to the server. All other filters (status, location,
    // tag, sort) are applied client-side via the `displayedTools` useMemo
    // below, so changing them is instant — no network round-trip.
    const params: any = { search: search || undefined };
    try {
      // Same preserve-on-error pattern as index.tsx — if any individual
      // sub-fetch fails (transient 520 / network blip / NetInfo
      // false-offline), we skip the corresponding state update instead
      // of overwriting it with an empty array. Otherwise the filter
      // pickers (locations / tags) and the claims badge briefly go
      // blank during the failure, then snap back on the next refresh —
      // exactly the "my data disappears for a second" symptom users
      // reported.
      const KEEP = Symbol("keep-previous");
      const keep = () => KEEP as unknown;
      const [t, a, w, cs, locs, tags, mu, sub] = await Promise.all([
        api.listTools(params),
        api.aggregate({}),
        prefs.warranty_alerts
          ? api.warrantyAlerts(60)
          : Promise.resolve({ expiring: [], expired: [] }),
        api.warrantyClaimsSummary().catch(keep),
        api.listLocations().catch(keep),
        api.listTags().catch(keep),
        api.upcomingMaintenance(60).catch(keep),
        api.getSubscription().catch(keep),
      ]);
      const mItems: any[] = mu !== KEEP ? ((mu as any)?.items || []) : [];
      if (mu !== KEEP) {
        const mIds = new Set<string>(mItems.map((x: any) => x.tool_id));
        setMaintToolIds(mIds);
        setMaintDueCount(mItems.length);
      }
      // Raw master list — client-side filters apply to this.
      setTools(setCached("inv_tools", t));
      setAgg(setCached("inv_agg", a));
      setWarningCount((w.expiring?.length || 0) + (w.expired?.length || 0));
      if (cs !== KEEP) setOpenClaims((cs as any)?.totals?.open || 0);
      if (locs !== KEEP) setAllLocations(locs as any[]);
      if (tags !== KEEP) setAllTags(tags as any[]);
      if (sub !== KEEP) setHiddenCount((sub as any)?.hidden_tool_count || 0);
    } catch (e: any) {
      // Backend / network failure — DON'T spam the LogBox/console.error red
      // overlay in dev (the user already gets the OfflineBanner up top, and
      // shouldCacheGet inside api.ts transparently serves cached lists for
      // these endpoints). Only log under console.warn so it stays visible in
      // logs without triggering the iOS error redbox.
      console.warn("[inventory load]", e?.message || String(e));
    }
  }, [search, prefs.warranty_alerts]);

  // ---------------------------------------------------------------------------
  // Client-side filtering / sorting. Applied to the master `tools` list every
  // time any filter dep changes — runs in microseconds even for thousands of
  // items, so the list updates instantly when the user picks a new status,
  // location, tag, or sort. Network is only re-hit for search / refresh.
  // ---------------------------------------------------------------------------
  const displayedTools = useMemo(() => {
    let out = tools;

    // Status filter
    if (filter === "available") out = out.filter((x: any) => !x.is_checked_out);
    else if (filter === "out") out = out.filter((x: any) => x.is_checked_out);
    else if (filter === "consumables") out = out.filter((x: any) => x.is_consumable);
    else if (filter === "for_sale") out = out.filter((x: any) => x.for_sale && !x.is_sold);
    else if (filter === "lost") out = out.filter((x: any) => x?.lost_status?.is_lost);
    else if (filter === "maintenance")
      out = out.filter(
        (x: any) => Array.isArray(x?.maintenance) && x.maintenance.length > 0,
      );

    // Location filter (selected location + all descendants)
    if (locationFilter) {
      const ids = new Set<string>([locationFilter]);
      const queue: string[] = [locationFilter];
      while (queue.length) {
        const cur = queue.shift()!;
        (allLocations || [])
          .filter((l: any) => l.parent_id === cur)
          .forEach((l: any) => {
            if (!ids.has(l.id)) {
              ids.add(l.id);
              queue.push(l.id);
            }
          });
      }
      out = out.filter((x: any) => x.location_id && ids.has(x.location_id));
    }

    // Tag filter
    if (tagFilter.length) {
      const wanted = new Set(tagFilter);
      out = out.filter(
        (x: any) =>
          Array.isArray(x.tag_ids) &&
          x.tag_ids.some((tid: string) => wanted.has(tid)),
      );
    }

    // Sort
    const _toTime = (s: any): number => {
      if (!s) return 0;
      const t = new Date(String(s)).getTime();
      return isNaN(t) ? 0 : t;
    };
    const _toCost = (x: any): number => {
      const n = parseFloat(String(x?.cost ?? 0));
      return isNaN(n) ? 0 : n;
    };
    // Copy before sort so we don't mutate the master `tools` array.
    const sorted = [...out];
    // For date sorts: items WITHOUT a purchase_date should ALWAYS appear last,
    // regardless of asc/desc direction (per user request — Round 4 fix a).
    // We partition the list, sort the dated items, and append the no-date
    // items at the end in their original order.
    const partitionByDate = (cmp: (a: any, b: any) => number): any[] => {
      const dated: any[] = [];
      const undated: any[] = [];
      for (const t of sorted) {
        if (_toTime(t.purchase_date) > 0) dated.push(t);
        else undated.push(t);
      }
      dated.sort(cmp);
      return [...dated, ...undated];
    };
    switch (sortBy) {
      case "date_asc": {
        const result = partitionByDate(
          (a: any, b: any) => _toTime(a.purchase_date) - _toTime(b.purchase_date),
        );
        return result;
      }
      case "date_desc": {
        const result = partitionByDate(
          (a: any, b: any) => _toTime(b.purchase_date) - _toTime(a.purchase_date),
        );
        return result;
      }
      case "alpha":
        sorted.sort((a: any, b: any) =>
          String(a.name || "").localeCompare(
            String(b.name || ""),
            undefined,
            { sensitivity: "base" },
          ),
        );
        break;
      case "price_high":
        sorted.sort((a: any, b: any) => _toCost(b) - _toCost(a));
        break;
      case "price_low":
        sorted.sort((a: any, b: any) => _toCost(a) - _toCost(b));
        break;
    }
    return sorted;
  }, [tools, filter, locationFilter, tagFilter, sortBy, allLocations]);

  // Stable references — prevents FlatList from treating the callbacks as new
  // every render, which would force every visible row to remount and re-decode
  // its base64 thumbnail (the actual cause of the "filter takes 4 seconds"
  // lag in TestFlight).
  const keyExtractor = useCallback((i: any) => i.id, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // When the app comes back from background (iOS suspends in-flight fetches
  // that otherwise hang the UI), re-trigger the load on a fresh socket.
  useAppResume(useCallback(() => { load(); }, [load]));

  // Audit #10: re-fetch when subscription state flips Free→PRO so previously
  // hidden tools appear instantly (no need to navigate away & back).
  useSubscriptionChange(useCallback(() => { load(); }, [load]));

  // Re-fetch only when the search query changes (debounced).
  // Status / location / tag / sort changes are handled instantly client-side
  // by the `displayedTools` useMemo above — no network round-trip needed.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search, load]);

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

      {/* Filter / sort dropdowns — Status · Location · Tag · Sort (2 rows × 2) */}
      <View style={styles.filterDropdownGrid}>
        <View style={styles.filterDropdownRow}>
          <TouchableOpacity
            testID="status-filter-btn"
            style={[
              styles.locationFilterBtn,
              styles.filterHalf,
              filter !== "all" && styles.locationFilterBtnActive,
            ]}
            onPress={() => setShowStatusPicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="filter"
              size={14}
              color={filter !== "all" ? theme.colors.accent : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.locationFilterText,
                filter !== "all" && styles.locationFilterTextActive,
              ]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
            <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="location-filter-btn"
            style={[
              styles.locationFilterBtn,
              styles.filterHalf,
              locationFilter && styles.locationFilterBtnActive,
            ]}
            onPress={() => setShowLocationPicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="location"
              size={14}
              color={locationFilter ? theme.colors.accent : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.locationFilterText,
                locationFilter && styles.locationFilterTextActive,
              ]}
              numberOfLines={1}
            >
              {selectedLocationName || "Locations"}
            </Text>
            {locationFilter ? (
              <TouchableOpacity
                testID="location-filter-clear"
                onPress={(e) => {
                  e.stopPropagation();
                  setLocationFilter(null);
                }}
                hitSlop={6}
              >
                <Ionicons name="close-circle" size={14} color={theme.colors.accent} />
              </TouchableOpacity>
            ) : (
              <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.filterDropdownRow}>
          <TouchableOpacity
            testID="tag-filter-btn"
            style={[
              styles.locationFilterBtn,
              styles.filterHalf,
              tagFilter.length > 0 && styles.locationFilterBtnActive,
            ]}
            onPress={() => setShowTagPicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="pricetag"
              size={14}
              color={tagFilter.length ? theme.colors.accent : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.locationFilterText,
                tagFilter.length > 0 && styles.locationFilterTextActive,
              ]}
              numberOfLines={1}
            >
              {tagFilterLabel}
            </Text>
            {tagFilter.length > 0 ? (
              <TouchableOpacity
                testID="tag-filter-clear"
                onPress={(e) => {
                  e.stopPropagation();
                  setTagFilter([]);
                }}
                hitSlop={6}
              >
                <Ionicons name="close-circle" size={14} color={theme.colors.accent} />
              </TouchableOpacity>
            ) : (
              <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            testID="sort-filter-btn"
            style={[
              styles.locationFilterBtn,
              styles.filterHalf,
              sortBy !== "date_desc" && styles.locationFilterBtnActive,
            ]}
            onPress={() => setShowSortPicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="swap-vertical"
              size={14}
              color={sortBy !== "date_desc" ? theme.colors.accent : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.locationFilterText,
                sortBy !== "date_desc" && styles.locationFilterTextActive,
              ]}
              numberOfLines={1}
            >
              {sortBy === "date_desc"
                ? "NEWEST FIRST"
                : sortBy === "date_asc"
                  ? "OLDEST FIRST"
                  : sortBy === "alpha"
                    ? "A → Z"
                    : sortBy === "price_high"
                      ? "PRICE: HIGH → LOW"
                      : "PRICE: LOW → HIGH"}
            </Text>
            <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {prefs.show_details_summary && agg && (
        <SummaryHeader agg={agg} showPrices={prefs.show_prices} openClaims={openClaims} />
      )}

      <FlatList
        data={displayedTools}
        keyExtractor={keyExtractor}
        key={`grid-${gridCols}`}
        numColumns={gridCols}
        columnWrapperStyle={gridCols > 1 ? { gap: 12, paddingHorizontal: 16 } : undefined}
        contentContainerStyle={{ paddingBottom: selectMode ? 240 : 120, paddingTop: gridCols > 1 ? 0 : 0 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
        // ----- Virtualization tuning (critical for TestFlight perf) -----
        // Without these, FlatList renders far more rows than necessary on
        // mount and recycles them poorly during scroll, which causes the
        // "filter takes 4 seconds" symptom (most of that time is iOS
        // re-decoding base64 photo thumbnails for off-screen rows).
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={5}
        updateCellsBatchingPeriod={40}
        ListFooterComponent={
          hiddenCount > 0 ? (
            <TouchableOpacity
              testID="upgrade-banner"
              activeOpacity={0.85}
              onPress={() => router.push("/paywall")}
              style={styles.upgradeBanner}
            >
              <View style={styles.upgradeIconWrap}>
                <Ionicons name="lock-closed" size={22} color={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.upgradeTitle}>SUBSCRIPTION ENDED</Text>
                <Text style={styles.upgradeSub}>
                  {hiddenCount} more {hiddenCount === 1 ? "tool is" : "tools are"} hidden.
                  Tap to renew PRO and restore everything.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.accent} />
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name={
                filter === "maintenance"
                  ? "build-outline"
                  : filter === "lost"
                    ? "search-outline"
                    : filter === "consumables"
                      ? "flask-outline"
                      : filter === "out"
                        ? "swap-horizontal-outline"
                        : "construct-outline"
              }
              size={64}
              color={theme.colors.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {filter === "maintenance"
                ? "NO MAINTENANCE ITEMS"
                : filter === "lost"
                  ? "NO LOST/STOLEN ITEMS"
                  : filter === "out"
                    ? "NOTHING CHECKED OUT"
                    : filter === "consumables"
                      ? "NO CONSUMABLES"
                      : filter === "available"
                        ? "NO AVAILABLE TOOLS"
                        : tools.length === 0 && !search
                          ? "NO TOOLS YET"
                          : "NO RESULTS"}
            </Text>
            <Text style={styles.emptyText}>
              {filter === "maintenance"
                ? "No tools have a maintenance schedule yet. Open any tool, scroll to MAINTENANCE, and tap + ADD SCHEDULE."
                : filter === "lost"
                  ? "All your tools are accounted for. Mark one as lost from its detail page."
                  : filter === "consumables"
                    ? "Mark a tool as consumable from its edit screen to track it here."
                    : filter === "out"
                      ? "Tools that are checked out will appear here."
                      : !!search
                        ? `No tools match \"${search}\". Try a different search.`
                        : locationFilter
                          ? "No tools in the selected location. Try clearing the location filter."
                          : "Tap the yellow button to add your first tool."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSelected = selectedIds.includes(item.id);
          const isLost = item?.lost_status?.is_lost;
          const isStolen = isLost && item?.lost_status?.type === "stolen";
          return (
            <BevelCard
              testID={`tool-card-${item.id}`}
              style={[
                styles.row,
                gridCols > 1 && { flex: 1, marginHorizontal: 0 },
                isSelected && styles.rowSelected,
              ]}
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
                colors={[theme.colors.rowGradTop, theme.colors.rowGradBottom]}
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
                  <ExpoImage
                    source={{ uri: item.photos[0] }}
                    style={styles.thumbImg}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={item.id}
                    transition={0}
                  />
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
                  {/* Status pill removed — the small round IN/OUT dot on
                      the right of the row already conveys checked-out
                      state. Showing both was redundant. */}
                </View>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.location_name || "No location"}
                  {prefs.show_prices && item.cost
                    ? `  ·  $${(Number(item.cost) * Math.max(1, Number(item.quantity) || 1)).toFixed(0)}`
                    : ""}
                </Text>
                <View style={styles.rowDealerLine}>
                  {!!item.dealer_name && (
                    <Text style={styles.rowDealer} numberOfLines={1}>
                      <Ionicons name="briefcase" size={11} color={theme.colors.textMuted} />{" "}
                      {item.dealer_name}
                    </Text>
                  )}
                  {item.is_set && (
                    <View style={styles.setBadge}>
                      <Ionicons name="cube" size={10} color="#000" />
                      <Text style={styles.setBadgeText}>
                        SET{Array.isArray(item.set_serials) && item.set_serials.length > 0
                          ? ` · ${item.set_serials.length}`
                          : ""}
                      </Text>
                    </View>
                  )}
                  <View style={styles.rowQtyPill}>
                    <Text style={styles.rowQtyPillText}>×{Math.max(1, Number(item.quantity) || 1)}</Text>
                  </View>
                </View>
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
                  const s0 = soonest as { days: number; type: string };
                  const overdue = s0.days < 0;
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
                          ? `${s0.type.toUpperCase()} OVERDUE ${Math.abs(s0.days)}D`
                          : `${s0.type.toUpperCase()} DUE IN ${s0.days}D`}
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
            </BevelCard>
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // On phones wider than ~370px, the 4 actions all fit so we let the
            // inner View claim 100% width and flex:1 each. On very narrow
            // screens (<370) we fall back to horizontal scroll.
            contentContainerStyle={[styles.bulkActions, { width: "100%" }]}
          >
            <TouchableOpacity
              testID="bulk-move"
              style={[styles.bulkBtn, { flex: 1 }, selectedIds.length === 0 && { opacity: 0.4 }]}
              onPress={() => setShowBulkLocation(true)}
              disabled={selectedIds.length === 0 || bulkBusy}
            >
              <Ionicons name="location" size={16} color={theme.colors.accent} />
              <Text style={styles.bulkBtnText}>MOVE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="bulk-tag"
              style={[styles.bulkBtn, { flex: 1 }, selectedIds.length === 0 && { opacity: 0.4 }]}
              onPress={() => setShowBulkTag(true)}
              disabled={selectedIds.length === 0 || bulkBusy}
            >
              <Ionicons name="pricetag" size={16} color={theme.colors.accent} />
              <Text style={styles.bulkBtnText}>TAG</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="bulk-lost"
              style={[styles.bulkBtn, { flex: 1 }, selectedIds.length === 0 && { opacity: 0.4 }]}
              onPress={() => setShowBulkLost(true)}
              disabled={selectedIds.length === 0 || bulkBusy}
            >
              <Ionicons name="warning" size={16} color={theme.colors.danger} />
              <Text style={[styles.bulkBtnText, { color: theme.colors.danger }]}>LOST</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="bulk-delete"
              style={[
                styles.bulkBtn,
                styles.bulkBtnDanger,
                { flex: 1 },
                selectedIds.length === 0 && { opacity: 0.4 },
              ]}
              onPress={bulkDelete}
              disabled={selectedIds.length === 0 || bulkBusy}
            >
              {bulkBusy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="trash" size={16} color="#fff" />
                  <Text style={[styles.bulkBtnText, { color: "#fff" }]}>DELETE</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      ) : (
        // Bottom-right "+" FAB removed — ADD ITEM lives in the top-right
        // header (ReportsFab). Keeping the conditional so the lock state
        // logic above doesn't break, but no FAB is rendered now.
        null
      )}

      {/* Filter: Location picker modal */}
      <Modal visible={showLocationPicker} transparent animationType="slide" onRequestClose={() => setShowLocationPicker(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>FILTER BY LOCATION</Text>
            <ScrollView style={{ maxHeight: 460 }}>
              <TouchableOpacity
                testID="location-filter-all"
                style={[styles.locOption, !locationFilter && styles.locOptionActive]}
                onPress={() => {
                  setLocationFilter(null);
                  setShowLocationPicker(false);
                }}
              >
                <Ionicons
                  name="apps"
                  size={16}
                  color={!locationFilter ? theme.colors.accent : theme.colors.textMuted}
                />
                <Text style={[styles.locOptName, !locationFilter && { color: theme.colors.accent }]}>
                  ALL LOCATIONS
                </Text>
              </TouchableOpacity>
              {flattenLocationTree(buildLocationTree(allLocations)).map((n) => {
                const isActive = locationFilter === n.id;
                const cnt = filterCounts.location[n.id] || 0;
                return (
                  <TouchableOpacity
                    key={n.id}
                    testID={`location-filter-${n.id}`}
                    style={[
                      styles.locOption,
                      { paddingLeft: 16 + n.depth * 16 },
                      isActive && styles.locOptionActive,
                    ]}
                    onPress={() => {
                      setLocationFilter(n.id);
                      setShowLocationPicker(false);
                    }}
                  >
                    <Ionicons
                      name={n.children.length > 0 ? "folder" : "location"}
                      size={16}
                      color={isActive ? theme.colors.accent : theme.colors.accent}
                    />
                    <Text style={[styles.locOptName, isActive && { color: theme.colors.accent }]}>
                      {n.name} ({cnt})
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {allLocations.length === 0 && (
                <Text style={{ color: theme.colors.textMuted, padding: 16, textAlign: "center" }}>
                  No locations yet. Create some from a tool's edit screen.
                </Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.btnGhost} onPress={() => setShowLocationPicker(false)}>
              <Text style={styles.btnGhostText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Filter: Tag picker modal (multi-select) */}
      <Modal visible={showTagPicker} transparent animationType="slide" onRequestClose={() => setShowTagPicker(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>FILTER BY TAGS</Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 8, marginBottom: 8 }}>
              Tap to toggle. Items matching ANY checked tag will be shown.
            </Text>
            <ScrollView style={{ maxHeight: 460 }}>
              <TouchableOpacity
                testID="tag-filter-all"
                style={[styles.locOption, tagFilter.length === 0 && styles.locOptionActive]}
                onPress={() => setTagFilter([])}
              >
                <Ionicons
                  name="apps"
                  size={16}
                  color={tagFilter.length === 0 ? theme.colors.accent : theme.colors.textMuted}
                />
                <Text style={[styles.locOptName, tagFilter.length === 0 && { color: theme.colors.accent }]}>
                  ALL TAGS
                </Text>
              </TouchableOpacity>
              {[...allTags]
                .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                .map((t) => {
                  const isActive = tagFilter.includes(t.id);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      testID={`tag-filter-${t.id}`}
                      style={[styles.locOption, isActive && styles.locOptionActive]}
                      onPress={() =>
                        setTagFilter((curr) =>
                          curr.includes(t.id)
                            ? curr.filter((x) => x !== t.id)
                            : [...curr, t.id]
                        )
                      }
                    >
                      <View
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          borderWidth: 2,
                          borderColor: isActive ? theme.colors.accent : theme.colors.border,
                          backgroundColor: isActive ? theme.colors.accent : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {isActive && <Ionicons name="checkmark" size={12} color="#000" />}
                      </View>
                      <Text style={[styles.locOptName, isActive && { color: theme.colors.accent }]}>
                        {t.name} ({filterCounts.tag[t.id] || 0})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              {allTags.length === 0 && (
                <Text style={{ color: theme.colors.textMuted, padding: 16, textAlign: "center" }}>
                  No tags yet. Add tags to your tools to use this filter.
                </Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.btnGhost} onPress={() => setShowTagPicker(false)}>
              <Text style={styles.btnGhostText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Filter: Status picker modal */}
      <Modal
        visible={showStatusPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStatusPicker(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>FILTER BY STATUS</Text>
            <ScrollView style={{ maxHeight: 460 }}>
              {STATUS_OPTIONS.map((o) => {
                const isActive = filter === o.k;
                return (
                  <TouchableOpacity
                    key={o.k}
                    testID={`status-filter-${o.k}`}
                    style={[styles.locOption, isActive && styles.locOptionActive]}
                    onPress={() => {
                      setFilter(o.k as any);
                      setShowStatusPicker(false);
                    }}
                  >
                    <Ionicons
                      name={o.icon}
                      size={16}
                      color={isActive ? theme.colors.accent : theme.colors.textMuted}
                    />
                    <Text style={[styles.locOptName, isActive && { color: theme.colors.accent }]}>
                      {o.label}
                    </Text>
                    {isActive && (
                      <Ionicons name="checkmark" size={16} color={theme.colors.accent} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.btnGhost} onPress={() => setShowStatusPicker(false)}>
              <Text style={styles.btnGhostText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Filter: Sort picker modal */}
      <Modal
        visible={showSortPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSortPicker(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>SORT BY</Text>
            <ScrollView style={{ maxHeight: 460 }}>
              {SORT_OPTIONS.map((o) => {
                const isActive = sortBy === o.k;
                return (
                  <TouchableOpacity
                    key={o.k}
                    testID={`sort-filter-${o.k}`}
                    style={[styles.locOption, isActive && styles.locOptionActive]}
                    onPress={() => {
                      setSortBy(o.k);
                      setShowSortPicker(false);
                    }}
                  >
                    <Ionicons
                      name={o.icon}
                      size={16}
                      color={isActive ? theme.colors.accent : theme.colors.textMuted}
                    />
                    <Text style={[styles.locOptName, isActive && { color: theme.colors.accent }]}>
                      {o.label}
                    </Text>
                    {isActive && (
                      <Ionicons name="checkmark" size={16} color={theme.colors.accent} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.btnGhost} onPress={() => setShowSortPicker(false)}>
              <Text style={styles.btnGhostText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


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

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
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
    borderColor: c.border,
    backgroundColor: c.bgSecondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  
    ...(theme.elevation.md as object),
  },
  headerBtnText: {
    color: c.textPrimary,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  headerBadge: {
    backgroundColor: c.warning,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 2,
    minWidth: 22,
    alignItems: "center",
  },
  headerBadgeText: {
    color: "#000",
    fontSize: 7,
    fontWeight: "900",
  },
  title: { color: c.textPrimary, fontSize: 21, fontWeight: "900", letterSpacing: 2 },
  subtitle: {
    color: c.accent,
    fontSize: 8,
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
    borderColor: c.warning,
    borderRadius: theme.radii.md,
    ...(theme.elevation.sm as object),
  },
  warrantyText: {
    color: c.warning,
    flex: 1,
    fontSize: 9,
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
    borderColor: c.danger,
    borderRadius: theme.radii.md,
    ...(theme.elevation.sm as object),
  },
  claimsBannerText: {
    color: c.danger,
    flex: 1,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  searchRow: { paddingHorizontal: 20, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  rowDealer: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  rowDealerLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    flexWrap: "wrap",
  },
  rowQtyPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: c.accent,
  },
  rowQtyPillText: {
    color: "#000",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
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
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  selectHeaderBtn: {
    width: 44,
    height: 44,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surfaceAlt,
    borderColor: c.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
    borderRadius: theme.radii.md,
    gap: 8,
    ...(theme.elevation.inset as object),
  },
  searchInput: { flex: 1, color: c.textPrimary, fontSize: 11 },
  filterWrap: { maxHeight: 56, paddingVertical: 4 },
  filterRow: { paddingHorizontal: 20, paddingVertical: 8, gap: 8, alignItems: "center" },
  filterDropdownGrid: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    rowGap: 8,
  },
  filterDropdownRow: {
    flexDirection: "row",
    columnGap: 8,
  },
  locationFilterRow: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 8,
  },
  locationFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: theme.radii.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  
    ...(theme.elevation.md as object),
  },
  filterHalf: {
    flex: 1,
    minWidth: 0,
  },
  locationFilterBtnActive: {
    borderColor: c.accent,
    backgroundColor: "rgba(249, 115, 22,0.08)",
  },
  locationFilterText: {
    flex: 1,
    color: c.textSecondary,
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 1,
  },
  locationFilterTextActive: {
    color: c.accent,
  },
  rowSelected: {
    borderWidth: 2,
    borderColor: c.accent,
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
    backgroundColor: c.danger,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  checkedOutBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: c.accentSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  setBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: c.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  setBadgeText: {
    color: "#000",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  lostBadgeText: {
    color: "#fff",
    fontSize: 7,
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
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.accent,
  },
  bulkBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 64,
    backgroundColor: c.bgSecondary,
    borderTopWidth: 2,
    borderTopColor: c.accent,
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
    color: c.textPrimary,
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 10,
    marginLeft: 6,
  },
  selectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 4,
  },
  selectAllText: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 8,
    letterSpacing: 1.5,
  },
  bulkActions: {
    paddingHorizontal: 12,
    gap: 8,
  },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 4,
    backgroundColor: c.bg,
  },
  bulkBtnDanger: {
    backgroundColor: c.danger,
    borderColor: c.danger,
  },
  bulkBtnText: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 8,
    letterSpacing: 1.2,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: c.bgSecondary,
    padding: 20,
    borderTopWidth: 2,
    borderTopColor: c.accent,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: "85%",
  },
  modalTitle: {
    color: c.textPrimary,
    fontSize: 10,
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
    borderBottomColor: c.borderSubtle,
  },
  locOptionActive: {
    backgroundColor: "rgba(249, 115, 22,0.1)",
  },
  locOptName: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    flex: 1,
  },
  bulkTagChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: theme.radii.pill,
    backgroundColor: c.bg,
  },
  bulkTagChipText: {
    color: c.accent,
    fontWeight: "700",
    fontSize: 10,
  },
  btnGhost: {
    height: 44,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.sm,
    marginTop: 12,
  },
  btnGhostText: {
    color: c.textPrimary,
    fontWeight: "800",
    letterSpacing: 2,
  },
  chip: {
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    marginRight: 8,
    backgroundColor: c.surface,
    ...(theme.elevation.sm as object),
  },
  chipActive: {
    backgroundColor: c.accent,
    borderColor: "#FFA000",
    ...(theme.elevation.accent as object),
  },
  chipClaims: {
    backgroundColor: c.danger,
    borderColor: "#7F1D1D",
    ...(theme.elevation.md as object),
  },
  chipClaimsText: { color: "#FFFFFF" },
  chipText: {
    color: c.textSecondary,
    fontSize: 8,
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
    backgroundColor: c.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    gap: 12,
    overflow: "hidden",
    ...(theme.elevation.md as object),
  },
  rowLocked: {
    opacity: 0.45,
    borderColor: c.warning,
  },
  thumb: {
    width: 56,
    height: 56,
    backgroundColor: c.surfaceAlt,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  consumableBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: c.accent,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    ...(theme.elevation.sm as object),
  },
  rowTitle: { color: c.textPrimary, fontWeight: "700", fontSize: 12 },
  rowSub: { color: c.textSecondary, fontSize: 9, marginTop: 2 },
  tagRow: { flexDirection: "row", marginTop: 6, gap: 4, flexWrap: "wrap" },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: "rgba(255,193,7,0.15)",
    borderRadius: theme.radii.sm,
  },
  tagText: {
    color: c.accent,
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  rowRight: { alignItems: "center", gap: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: {
    color: c.textSecondary,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1,
  },
  empty: { alignItems: "center", marginTop: 80, paddingHorizontal: 40 },
  emptyTitle: {
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 16,
  },
  emptyText: {
    color: c.textSecondary,
    fontSize: 10,
    textAlign: "center",
    marginTop: 8,
  },
  fab: {
    position: "absolute",
    bottom: 30,
    right: 24,
    width: 64,
    height: 64,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.lg,
    ...(theme.elevation.accent as object),
  },
  fabLocked: {
    backgroundColor: c.warning,
  },
  upgradeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: c.bgSecondary,
    borderWidth: 1.5,
    borderColor: c.accent,
    ...(theme.elevation.md as object),
  },
  upgradeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.accent + "22",
    borderWidth: 1,
    borderColor: c.accent + "55",
  },
  upgradeTitle: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  upgradeSub: {
    color: c.textPrimary,
    fontSize: 12,
    lineHeight: 16,
  },
}));
