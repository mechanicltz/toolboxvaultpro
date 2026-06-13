import { useState, useCallback, ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
  Image,
  ImageBackground,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { PaymentModal } from "../../src/sections/PaymentModal";
import { nextRouteDate, DAY_NAMES } from "../../src/route";
import { formatDateUS } from "../../src/dateUtil";
import { getCached, setCached } from "../../src/cache";
import { usePrefs } from "../../src/prefs";
import { APP_VERSION_LABEL } from "../../src/version";

import { useSkin } from "../../src/themeContext";
import { styles } from "../../src/screens/home/homeStyles";
import { SummaryRow } from "../../src/screens/home/SummaryRow";
import { DealerBalanceRow } from "../../src/screens/home/DealerBalanceRow";
import { DealerLogo } from "../../src/components/DealerLogo";
import { DEALER_LOGO_SLOT } from "../../src/dealerLogos";
import { useDealerPaymentsDue } from "../../src/screens/home/useDealerPaymentsDue";
import { BevelCard } from "../../src/components/BevelCard";
import { ShadowBox, ShadowBoxSubCard } from "../../src/components/ShadowBox";
import ReportBugBadge from "../../src/components/ReportBugBadge";
import DriveAlertBanner from "../../src/components/DriveAlertBanner";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { useSubscriptionChange } from "../../src/subscriptionEvents";
import { useAppResume } from "../../src/appLifecycle";

// --- Industrial skin (matches the locked login North Star) ---
// Every container is a REAL trimmed metal frame PNG (the same tbv-v2/trimmed
// set the login screen uses), wrapped via TbvFrame's 9-slice so the corner
// bolts never smear. No code-drawn gradient panels anymore.
import { SKIN, TBV, CAP } from "../../src/tbv/skins";
import { TbvFrame } from "../../src/tbv/components/TbvFrame";
import { useTbvSkinsReady } from "../../src/tbv/useTbvSkins";
import { useFonts as useGoogleFonts } from "@expo-google-fonts/bebas-neue";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import {
  Rajdhani_500Medium, Rajdhani_600SemiBold, Rajdhani_700Bold,
} from "@expo-google-fonts/rajdhani";
import {
  Exo_2_400Regular as Exo2_400Regular,
  Exo_2_500Medium as Exo2_500Medium,
  Exo_2_700Bold as Exo2_700Bold,
} from "@expo-google-fonts/exo-2";
import { Teko_600SemiBold, Teko_700Bold } from "@expo-google-fonts/teko";
import { Anton_400Regular } from "@expo-google-fonts/anton";

// Manual verification beacon — bump this on every change so we can confirm
// the device is actually showing the latest bundle. Rendered top-right of Home.
const HOME_BUILD = "BUILD 281";

export default function HomeScreen() {
  const router = useRouter();
  const { prefs } = usePrefs();
  const { skin } = useSkin();
  const [fontsLoaded, fontError] = useGoogleFonts({
    BebasNeue_400Regular,
    Rajdhani_500Medium, Rajdhani_600SemiBold, Rajdhani_700Bold,
    Exo2_400Regular, Exo2_500Medium, Exo2_700Bold,
    Teko_600SemiBold, Teko_700Bold, Anton_400Regular,
  });
  const skinsReady = useTbvSkinsReady();
  const [stats, setStats] = useState<any>(() => getCached("home_stats", {}));
  const [agg, setAgg] = useState<any>(() => getCached("home_agg", {}));
  const [tools, setTools] = useState<any[]>(() => getCached("tools", []));
  const [wishlist, setWishlist] = useState<any[]>(() => getCached("wishlist", []));
  const [dealers, setDealers] = useState<any[]>(() => getCached("dealers", []));
  const [mnt, setMnt] = useState<any>(() =>
    getCached("home_mnt", { overdue: 0, due_soon: 0, total: 0 }),
  );
  const [claims, setClaims] = useState<any>(() =>
    getCached("claims_summary", { totals: { open: 0 } }),
  );
  const [refreshing, setRefreshing] = useState(false);
  /** Admin-only counts of free vs subscribed accounts. `null` for non-admins
   *  (the /admin/user-stats endpoint returns 403, we swallow it). When set,
   *  the home header shows "FREE: N   SUB: N" next to the version label. */
  const [userStats, setUserStats] = useState<{
    free: number;
    subscribed: number;
  } | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<{
    dealer: any;
    account: "credit" | "personal";
  } | null>(null);

  const openAdjustForDealer = useCallback((d: any) => {
    // Action sheet — pick which account to adjust for this dealer
    Alert.alert(
      `Adjust ${d.name}`,
      "Which account do you want to adjust?",
      [
        {
          text: `Truck Acct  ($${(Number(d.personal_balance) || 0).toFixed(2)})`,
          onPress: () => setPaymentTarget({ dealer: d, account: "personal" }),
        },
        {
          text: `Credit Acct  ($${(Number(d.credit_balance) || 0).toFixed(2)})`,
          onPress: () => setPaymentTarget({ dealer: d, account: "credit" }),
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  }, []);

  void stats;

  const load = useCallback(async (opts?: { forceFresh?: boolean }) => {
    try {
      // ---------------------------------------------------------------
      // PRESERVE-ON-ERROR PATTERN — the previous version of this code
      // used `.catch(() => [])` / `.catch(() => ({}))` for each call,
      // which on ANY transient network failure (Cloudflare 520, NetInfo
      // false-offline, server reload, request abort, etc.) would WIPE
      // the user's data: the empty/fallback value got written into
      // BOTH React state AND the persistent disk cache, so the user
      // saw their tool list go blank for a few seconds until the next
      // successful fetch. (Confirmed via user feedback: "every once in
      // a while it will remove all my tools and information but after
      // I close the app and reopen it all of it comes back.")
      //
      // The fix: when a sub-fetch rejects, we return the sentinel
      // `__KEEP` and skip the corresponding state/cache update entirely
      // — keeping whatever was previously rendered. The user will see
      // stale data for a tick instead of a flash of empty state.
      // ---------------------------------------------------------------
      const KEEP = Symbol("keep-previous");
      const keep = () => KEEP as unknown;
      const ff = opts?.forceFresh ? { forceFresh: true } : undefined;
      // PERF (2026-06): dropped api.listTools() — home now derives all
      // tool counts/totals from /aggregate which returns counts only
      // (no full tool docs). Saves the biggest payload on home load.
      // The inventory tab still fetches tools itself when visited.
      const [s, a, w, d, m, c] = await Promise.all([
        api.getStats(ff).catch(keep),
        api.aggregate({}, ff).catch(keep),
        api.listWishlist(undefined, ff).catch(keep),
        api.listDealers(ff).catch(keep),
        api.upcomingMaintenance(30, ff).catch(keep),
        api.warrantyClaimsSummary(ff).catch(keep),
      ]);
      if (s !== KEEP) setStats(setCached("home_stats", s));
      if (a !== KEEP) setAgg(setCached("home_agg", a));
      if (w !== KEEP) setWishlist(setCached("wishlist", w as any[]));
      if (d !== KEEP) setDealers(setCached("dealers", d as any[]));
      if (m !== KEEP) setMnt(setCached("home_mnt", m));
      if (c !== KEEP) setClaims(setCached("claims_summary", c));
      // Probe the admin-only user-stats endpoint. Non-admins get 403/401
      // and we silently leave userStats null → the badge stays hidden.
      try {
        const us = await api.get("/admin/user-stats");
        if (us && typeof us.free === "number" && typeof us.subscribed === "number") {
          setUserStats({ free: us.free, subscribed: us.subscribed });
        }
      } catch {
        /* not admin — fine, just don't render the badge */
      }
    } catch {
      /* ignore */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // iOS suspends in-flight fetches when the app is backgrounded; on resume,
  // _layout.tsx aborts them and broadcasts here so the home summary doesn't
  // sit forever on stale/spinner state.
  useAppResume(useCallback(() => { load(); }, [load]));

  // Audit #10: when a free user upgrades to PRO mid-session (via paywall
  // purchase, restore, or promo redeem) the backend immediately unlocks all
  // their tools. We re-fetch here so the previously-hidden tools appear
  // without requiring the user to navigate away and back.
  useSubscriptionChange(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ forceFresh: true });
    setRefreshing(false);
  };

  // ---------- Derived metrics ----------
  // PERF (2026-06): all counts now come from /aggregate's $facet results.
  // The `tools` state is kept for back-compat (other code paths may still
  // hydrate it) but is no longer fetched on home load.
  const totalItems = Number(agg?.count ?? tools.length) || 0;
  const checkedOut = Number(agg?.checked_out ?? tools.filter((x) => x.is_checked_out).length) || 0;
  const forSaleCount = Number(agg?.for_sale ?? tools.filter((x) => x.for_sale && !x.is_sold).length) || 0;
  const lost = Number(agg?.lost ?? tools.filter((x) => x?.lost_status?.is_lost).length) || 0;
  const aggTotal = Number(agg?.total_value);
  const totalInvested = Number.isFinite(aggTotal)
    ? aggTotal
    : tools.reduce(
        (sum, x) =>
          sum + (Number(x.cost) || 0) * Math.max(1, Number(x.quantity) || 1),
        0,
      );
  const wishlistCount = wishlist.filter((w) => !w.is_purchased).length;
  const wishlistTotal = wishlist
    .filter((w) => !w.is_purchased)
    .reduce((sum, x) => sum + (Number(x.price) || 0), 0);

  // Show ALL dealers when the row is enabled, even if both balances are $0.
  const dealersAll = dealers
    .map((d) => ({
      ...d,
      truck: Number(d.personal_balance) || 0,
      credit: Number(d.credit_balance) || 0,
    }))
    .sort((a, b) => {
      // Dealers with balances first (largest owed → smallest), then $0 dealers alphabetically
      const aTotal = a.truck + a.credit;
      const bTotal = b.truck + b.credit;
      if (aTotal !== bTotal) return bTotal - aTotal;
      return (a.name || "").localeCompare(b.name || "");
    });

  const totalOwed = dealers.reduce(
    (sum, d) =>
      sum + (Number(d.credit_balance) || 0) + (Number(d.personal_balance) || 0),
    0,
  );

  // #22 — The dashboard "Dealer Accounts" widget only lists dealers that have
  // an active outstanding balance. Zero-balance dealers are hidden here (they
  // remain on the Dealers tab). Sorting/derivation reuses dealersAll.
  const dealersOwing = dealersAll.filter((d) => d.truck + d.credit > 0);

  // Scheduled-payment sub-lines + the in-app "was it processed?" prompt, all
  // derived from the dealers we already have (see the hook for details).
  const { paymentSubByDealer } = useDealerPaymentsDue(dealers, () =>
    load({ forceFresh: true }),
  );

  // ---------- Next-route banner ----------
  const upcomingRoutes = dealers
    .map((d) => ({ dealer: d, when: nextRouteDate(d) }))
    .filter((x): x is { dealer: any; when: Date } => !!x.when);
  let nextRouteBanner: { dateStr: string; dealers: string[] } | null = null;
  if (upcomingRoutes.length) {
    upcomingRoutes.sort((a, b) => a.when.getTime() - b.when.getTime());
    const earliest = upcomingRoutes[0].when.getTime();
    const sameDay = upcomingRoutes.filter(
      (x) => x.when.getTime() === earliest,
    );
    const dt = upcomingRoutes[0].when;
    const dateStr = `${DAY_NAMES[dt.getDay()]} ${formatDateUS(
      dt.toISOString().slice(0, 10),
    )}`;
    nextRouteBanner = {
      dateStr,
      dealers: sameDay.map((x) => x.dealer.name),
    };
  }

  const visible = prefs.home_rows;
  const order = prefs.home_row_order;

  // Lookup of how to render each row. We render in the user's chosen order
  // and skip any rows the user has hidden.
  const ROW_RENDERERS: Record<string, () => ReactNode> = {
    total_items: () => (
      <SummaryRow
        icon="cube"
        label="TOTAL ITEMS"
        value={String(totalItems)}
        onPress={() => router.push("/inventory")}
      />
    ),
    invested: () => (
      <SummaryRow
        icon="cash"
        label="NET WORTH"
        value={`$${totalInvested.toFixed(2)}`}
        valueColor={theme.colors.success}
      />
    ),
    checked_out: () => (
      <SummaryRow
        icon="swap-horizontal"
        label="CHECKED OUT"
        value={String(checkedOut)}
        valueColor={checkedOut > 0 ? theme.colors.danger : undefined}
        onPress={() => router.push("/inventory?filter=out")}
      />
    ),
    selling: () => (
      <SummaryRow
        icon="pricetag"
        label="SELLING"
        value={String(forSaleCount)}
        onPress={() => router.push("/for-sale")}
      />
    ),
    wishlist: () => (
      <SummaryRow
        icon="heart"
        label="WISH LIST"
        value={String(wishlistCount)}
        onPress={() => router.push("/wishlist")}
      />
    ),
    lost: () => (
      <SummaryRow
        icon="warning"
        label="LOST / STOLEN"
        value={String(lost)}
        onPress={() => router.push("/inventory?filter=lost")}
      />
    ),
    maintenance: () => {
      const mnTotal = mnt.overdue + mnt.due_soon;
      return (
        <SummaryRow
          icon="settings"
          label="MAINTENANCE DUE"
          value={String(mnTotal)}
          sub={mnt.overdue > 0 ? `${mnt.overdue} OVERDUE` : "DUE 30 DAYS"}
          valueColor={mnTotal > 0 ? theme.colors.danger : undefined}
          onPress={() => router.push("/maintenance")}
        />
      );
    },
    open_claims: () => {
      const oc = claims?.totals?.open || 0;
      return (
        <SummaryRow
          icon="document-text"
          label="OPEN CLAIMS"
          value={String(oc)}
          valueColor={oc > 0 ? theme.colors.danger : undefined}
          onPress={() => router.push("/claims")}
        />
      );
    },
    owed_to_dealers: () => null /* rendered in its own dealer-accounts card below */,
  };

  // Helper that renders a single warranty-card-style row matching the
  // tool detail screen exactly. Used for all stat rows on the home screen
  // so the look is consistent across the app.
  type HomeDetailRow = {
    label: string;
    value: string;
    sub?: string;
    valueColor?: string;
    onPress?: () => void;
    icon?: keyof typeof Ionicons.glyphMap;
  };
  const renderHomeRow = (r: HomeDetailRow, isLast: boolean, key: string) => {
    const Wrapper: any = r.onPress ? TouchableOpacity : View;
    const wrapperProps = r.onPress
      ? { onPress: r.onPress, activeOpacity: 0.6 }
      : {};
    return (
      <Wrapper
        key={key}
        testID={`home-row-${key}`}
        style={[styles.detailsRow, isLast && styles.detailsRowLast]}
        {...wrapperProps}
      >
        <View style={styles.rowLabelWrap}>
          <View style={styles.rowTick} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.detailsLabel} numberOfLines={1}>{r.label}</Text>
            {!!r.sub && <Text style={styles.detailsRowSub} numberOfLines={1}>{r.sub}</Text>}
          </View>
        </View>
        <View style={styles.detailsValueWrap}>
          {!!r.value && (
            <Text
              style={[styles.detailsValue, r.valueColor ? { color: r.valueColor } : null]}
              numberOfLines={1}
            >
              {r.value}
            </Text>
          )}
          {r.onPress && (
            <Ionicons
              name="chevron-forward"
              size={14}
              color={theme.colors.textMuted}
            />
          )}
        </View>
      </Wrapper>
    );
  };

  // Plain-mode Description-Card row (restored from the 05-30 backup) — a flat
  // line with the label on the left and value (+ optional chevron) on the
  // right. Palette-aware via the pd* styles so Plain Light & Dark both work.
  const renderPlainDescRow = (r: HomeDetailRow, isLast: boolean, key: string) => {
    const Wrapper: any = r.onPress ? TouchableOpacity : View;
    const wp = r.onPress ? { onPress: r.onPress, activeOpacity: 0.6 } : {};
    return (
      <Wrapper
        key={key}
        testID={`home-row-${key}`}
        style={[styles.pdRow, isLast && styles.pdRowLast]}
        {...wp}
      >
        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <Text style={styles.pdLabel} numberOfLines={1}>{r.label}</Text>
          {!!r.sub && <Text style={styles.pdSub} numberOfLines={1}>{r.sub}</Text>}
        </View>
        <View style={styles.pdValueWrap}>
          {!!r.value && (
            <Text
              style={[styles.pdValue, r.valueColor ? { color: r.valueColor } : null]}
              numberOfLines={1}
            >
              {r.value}
            </Text>
          )}
          {r.onPress && (
            <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
          )}
        </View>
      </Wrapper>
    );
  };

  // Build the list of stat rows the user has opted in to, in their preferred
  // order. The dealer-accounts row lives in its own separate card below.
  const STAT_ROW_DATA: Record<string, HomeDetailRow | null> = {
    total_items: {
      label: "TOTAL ITEMS",
      value: String(totalItems),
      onPress: () => router.push("/inventory"),
    },
    invested: prefs.show_prices
      ? {
          label: "NET WORTH",
          value: `$${totalInvested.toFixed(2)}`,
          valueColor: theme.colors.success,
        }
      : null,
    checked_out: {
      label: "CHECKED OUT",
      value: String(checkedOut),
      valueColor: checkedOut > 0 ? theme.colors.danger : undefined,
      onPress: () => router.push("/inventory?filter=out"),
    },
    selling: {
      label: "SELLING",
      value: String(forSaleCount),
      onPress: () => router.push("/for-sale"),
    },
    wishlist: {
      label: "WISH LIST",
      value: String(wishlistCount),
      onPress: () => router.push("/wishlist"),
    },
    lost: {
      label: "LOST / STOLEN",
      value: String(lost),
      onPress: () => router.push("/inventory?filter=lost"),
    },
    maintenance: (() => {
      const mnTotal = mnt.overdue + mnt.due_soon;
      return {
        label: "MAINTENANCE DUE",
        value: String(mnTotal),
        sub: mnt.overdue > 0 ? `${mnt.overdue} OVERDUE` : "DUE 30 DAYS",
        valueColor: mnTotal > 0 ? theme.colors.danger : undefined,
        onPress: () => router.push("/maintenance"),
      };
    })(),
    open_claims: (() => {
      const oc = claims?.totals?.open || 0;
      return {
        label: "OPEN CLAIMS",
        value: String(oc),
        valueColor: oc > 0 ? theme.colors.danger : undefined,
        onPress: () => router.push("/claims"),
      };
    })(),
  };
  // Build the full ordered render sequence for the unified Description Card.
  // The user's chosen `order` array drives EVERYTHING — including where the
  // DEALER ACCOUNTS block falls. Previously the dealer card was hardcoded to
  // render after the stats card, which silently ignored the user's order
  // preference for `owed_to_dealers`. Now each item knows its position.
  type RenderItem =
    | { kind: "stat"; key: string; row: HomeDetailRow }
    | { kind: "dealers" };
  const renderSequence: RenderItem[] = order
    .filter((k) => visible[k])
    .map((k): RenderItem | null => {
      if (k === "owed_to_dealers") return { kind: "dealers" };
      const row = STAT_ROW_DATA[k];
      return row ? { kind: "stat", key: k, row } : null;
    })
    .filter((x): x is RenderItem => x !== null);

  // ── PLAIN MODE ──────────────────────────────────────────────────────────
  // When the user picks a Plain appearance (light or dark), Home renders as
  // flat, palette-driven cards instead of the textured metal frames. It reuses
  // the exact same data + the palette-aware SummaryRow / DealerBalanceRow, so
  // the row ORDER and visibility prefs are respected identically. Login and
  // Forgot-Password remain skinned regardless; only post-login screens follow
  // this choice.
  if (skin === "plain") {
    return (
      <SafeAreaView style={styles.plainSafe} edges={["top"]}>
        <Text style={styles.plainBuildStamp} allowFontScaling={false} testID="home-build-stamp">
          {HOME_BUILD}
        </Text>
        <IndustrialBanner
          title="DASHBOARD"
          subtitle={
            userStats ? `FREE ${userStats.free} / SUB ${userStats.subscribed}` : undefined
          }
        />
        <ScrollView
          contentContainerStyle={styles.plainContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
            />
          }
        >
          {/* #23 — Quick actions row: Add Item + New Claim. ShadowBox style
              for the plain (light/dark) themes. */}
          <View style={styles.quickRow}>
            <ShadowBox style={styles.quickBtn} onPress={() => router.push("/tool/edit")} testID="quick-add-item">
              <Ionicons name="add-circle-outline" size={20} color={theme.colors.accent} />
              <Text style={styles.quickBtnText}>ADD ITEM</Text>
            </ShadowBox>
            <ShadowBox style={styles.quickBtn} onPress={() => router.push("/claims?newClaim=1")} testID="quick-new-claim">
              <Ionicons name="construct-outline" size={20} color={theme.colors.accent} />
              <Text style={styles.quickBtnText}>NEW CLAIM</Text>
            </ShadowBox>
          </View>

          <DriveAlertBanner />
          {prefs.home_logo_mode === "custom" && prefs.home_logo_data && (
            <View style={styles.logoWrap}>
              <Image
                testID="home-logo"
                source={{ uri: prefs.home_logo_data }}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          )}

          {nextRouteBanner && prefs.show_dealer_route_reminder && (
            <ShadowBox style={[styles.plainBanner, { marginBottom: 12 }]} onPress={() => router.push("/dealers")}>
              <Ionicons name="map" size={22} color={theme.colors.accent} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.plainBannerLabel}>NEXT DEALER ROUTE</Text>
                <Text style={styles.plainBannerText}>
                  {nextRouteBanner.dealers.join(" & ")} · {nextRouteBanner.dateStr}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </ShadowBox>
          )}

          {/* UNIFIED DESCRIPTION CARD (restored from the 05-30 backup) — a
              single box containing every enabled row in the user's chosen
              order as flat label/value lines, with DEALER ACCOUNTS rendered as
              a nested sub-card (dealer rows + ADJUST chips + TOTAL footer).
              Palette-aware so Plain Light & Plain Dark both work. Skinned mode
              is untouched. */}
          {renderSequence.length > 0 && (
            <ShadowBox style={styles.pdBoxWrap} testID="home-details-box">
              {renderSequence.map((item, idx) => {
                const isLastItem = idx === renderSequence.length - 1;
                if (item.kind === "stat") {
                  return renderPlainDescRow(item.row, isLastItem, item.key);
                }
                return (
                  <ShadowBoxSubCard
                    key="owed_to_dealers"
                    style={isLastItem ? { marginBottom: 0 } : undefined}
                    testID="home-dealers-widget"
                  >
                    <TouchableOpacity
                      style={[styles.pdRow, styles.pdNestedHeaderRow]}
                      activeOpacity={0.6}
                      testID="home-dealers-header"
                      onPress={() => router.push("/dealers")}
                    >
                      <Text style={styles.pdLabel}>DEALER ACCOUNTS</Text>
                      <View style={styles.pdValueWrap}>
                        <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
                      </View>
                    </TouchableOpacity>
                    {dealersOwing.length === 0 ? (
                      <View style={[styles.pdRow, styles.pdRowLast]}>
                        <Text
                          style={[
                            styles.pdValue,
                            { color: theme.colors.textMuted, textAlign: "left", flex: 1, fontWeight: "500" },
                          ]}
                        >
                          No outstanding balances.
                        </Text>
                      </View>
                    ) : (
                      <>
                        {dealersOwing.map((d) => {
                          const dTotal =
                            (Number(d.credit_balance) || 0) + (Number(d.personal_balance) || 0);
                          return (
                            <View key={d.id} style={styles.pdRow}>
                              <DealerLogo logo={d.logo} size={DEALER_LOGO_SLOT.compact} style={{ marginRight: 10 }} />
                              <TouchableOpacity
                                onPress={() => router.push(`/dealer/${d.id}`)}
                                activeOpacity={0.6}
                                style={{ flex: 1, minWidth: 0, marginRight: 8 }}
                                testID={`home-dealer-${d.id}`}
                              >
                                <Text style={styles.pdDealerName} numberOfLines={1}>
                                  {d.name}
                                </Text>
                                {paymentSubByDealer[d.id] && (
                                  <Text style={styles.pdDealerPaySub} numberOfLines={1}>
                                    {paymentSubByDealer[d.id]}
                                  </Text>
                                )}
                              </TouchableOpacity>
                              <View style={styles.pdValueWrap}>
                                <Text
                                  style={[
                                    styles.pdValue,
                                    dTotal === 0 && { color: theme.colors.textMuted },
                                  ]}
                                >
                                  ${dTotal.toFixed(2)}
                                </Text>
                                <TouchableOpacity
                                  testID={`adjust-${d.id}`}
                                  style={styles.pdAdjustChip}
                                  onPress={() => openAdjustForDealer(d)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.pdAdjustChipText}>ADJUST</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                        <View
                          style={[styles.pdRow, styles.pdRowLast, styles.pdNestedTotalRow]}
                          testID="home-dealers-total"
                        >
                          <Text style={styles.pdNestedTotalLabel}>TOTAL</Text>
                          <Text
                            style={[
                              styles.pdNestedTotalValue,
                              totalOwed === 0 && { color: theme.colors.textMuted },
                            ]}
                          >
                            ${totalOwed.toFixed(2)}
                          </Text>
                        </View>
                      </>
                    )}
                  </ShadowBoxSubCard>
                );
              })}
            </ShadowBox>
          )}

          <ReportBugBadge style={{ marginTop: 8 }} testID="feedback-banner" />

          <Text style={styles.plainTip}>Pull to refresh · Customize under VAULT → CUSTOMIZE</Text>
        </ScrollView>

        {paymentTarget && (
          <PaymentModal
            visible={!!paymentTarget}
            dealer={paymentTarget.dealer}
            account={paymentTarget.account}
            onClose={() => setPaymentTarget(null)}
            onSaved={() => {
              setPaymentTarget(null);
              load();
            }}
          />
        )}
      </SafeAreaView>
    );
  }

  // Gate on the industrial fonts + skins so the page never paints with the
  // system font / un-decoded textures (matches login / forgot-password).
  if ((!fontsLoaded && !fontError) || !skinsReady) {
    return (
      <ImageBackground source={SKIN.bg} style={styles.bg} resizeMode="cover">
        <View style={styles.gateVeil}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={SKIN.bg} style={styles.bg} resizeMode="cover">
      {/* dark veil so the textured plate reads but content stays legible */}
      <View style={styles.bgVeil} pointerEvents="none" />
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* BUILD STAMP — top-right verification beacon. */}
        <Text style={styles.buildStamp} allowFontScaling={false} testID="home-build-stamp">
          {HOME_BUILD}
        </Text>
        {/* Unified nameplate header (same on every page / theme). */}
        <IndustrialBanner
          title="DASHBOARD"
          subtitle={
            userStats ? `FREE ${userStats.free} / SUB ${userStats.subscribed}` : undefined
          }
        />

      <ScrollView
        style={{ backgroundColor: "transparent" }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
          />
        }
      >
        {/* #23 — Quick actions row: Add Item + New Claim. Skinned themes use
            the skin's button plate art. */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickBtnSkin}
            activeOpacity={0.85}
            onPress={() => router.push("/tool/edit")}
            testID="quick-add-item"
          >
            <ImageBackground
              source={SKIN.btnPrimary}
              style={styles.quickBtnSkinFill}
              imageStyle={styles.quickBtnSkinImg}
              resizeMode="stretch"
            >
              <Text style={styles.quickBtnSkinText}>ADD ITEM</Text>
            </ImageBackground>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtnSkin}
            activeOpacity={0.85}
            onPress={() => router.push("/claims?newClaim=1")}
            testID="quick-new-claim"
          >
            <ImageBackground
              source={SKIN.btnPrimary}
              style={styles.quickBtnSkinFill}
              imageStyle={styles.quickBtnSkinImg}
              resizeMode="stretch"
            >
              <Text style={styles.quickBtnSkinText}>NEW CLAIM</Text>
            </ImageBackground>
          </TouchableOpacity>
        </View>

        {/* HOME LOGO — purely decorative, sits at the very top of the
            content scroll. Hidden by default; only renders when the user
            has picked their own image from More → Customize → Home
            Screen Logo. The legacy "default" mode renders as hidden too
            (the bundled-default image was removed by user request). */}
        {prefs.home_logo_mode === "custom" && prefs.home_logo_data && (
          <View style={styles.logoWrap}>
            <Image
              testID="home-logo"
              source={{ uri: prefs.home_logo_data }}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Next dealer route — skinned panel to match the theme */}
        {nextRouteBanner && prefs.show_dealer_route_reminder && (
          <TbvFrame
            source={SKIN.plate}
            capInsets={CAP.plate}
            style={styles.bannerLayout}
            padX={30}
            padTop={22}
            padBottom={24}
          >
            <TouchableOpacity
              testID="next-route-banner"
              style={styles.routeBanner}
              onPress={() => router.push("/dealers")}
              activeOpacity={0.85}
            >
              <View style={styles.routeIconWrap}>
                <Ionicons name="map" size={22} color={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.routeBannerLabel}>NEXT DEALER ROUTE</Text>
                <Text style={styles.routeBannerText}>
                  {nextRouteBanner.dealers.join(" & ")} · {nextRouteBanner.dateStr}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.accent} />
            </TouchableOpacity>
          </TbvFrame>
        )}

        {/* UNIFIED HOME DESCRIPTION CARD — single warranty-card-style box
            containing every enabled row in the user's chosen order. The
            DEALER ACCOUNTS header sits at its assigned position in the
            sequence, with its dealer sub-rows nested directly beneath it.
            Previously the stats and dealer-accounts lived in two separate
            hardcoded-order cards, which ignored the user's row-order
            preference for `owed_to_dealers`. */}
        {/* DEALER ACCOUNTS — its own distinct widget panel (configurable;
            only renders when the user has the dealers row enabled). */}
        {renderSequence.some((it) => it.kind !== "stat") && (
          <TbvFrame
            source={SKIN.window}
            capInsets={CAP.window}
            style={styles.detailsBoxLayout}
            padX={30}
            padTop={24}
            padBottom={26}
            testID="home-dealers-widget"
          >
            <TouchableOpacity
              style={styles.detailsRow}
              activeOpacity={0.6}
              testID="home-dealers-header"
              onPress={() => router.push("/dealers")}
            >
              <View style={styles.rowLabelWrap}>
                <View style={styles.rowTick} />
                <Text style={styles.detailsLabel}>DEALER ACCOUNTS</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
            </TouchableOpacity>

            {dealersOwing.length === 0 ? (
              <View style={[styles.detailsRow, styles.detailsRowLast]}>
                <Text style={[styles.detailsValue, styles.noChip, { color: theme.colors.textMuted, textAlign: "left", flex: 1 }]}>
                  No outstanding balances.
                </Text>
              </View>
            ) : (
              <>
                {dealersOwing.map((d) => {
                  const credit = Number(d.credit_balance) || 0;
                  const truck = Number(d.personal_balance) || 0;
                  const dTotal = credit + truck;
                  return (
                    <View key={d.id} style={styles.detailsRow}>
                      <TouchableOpacity
                        onPress={() => router.push(`/dealer/${d.id}`)}
                        activeOpacity={0.6}
                        style={styles.rowLabelWrap}
                        testID={`home-dealer-${d.id}`}
                      >
                        <View style={styles.rowTick} />
                        <DealerLogo logo={d.logo} size={DEALER_LOGO_SLOT.compact} style={{ marginRight: 10 }} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.detailsLabel} numberOfLines={1}>{d.name}</Text>
                          {paymentSubByDealer[d.id] && (
                            <Text style={styles.detailsDealerPaySub} numberOfLines={1}>
                              {paymentSubByDealer[d.id]}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                      <View style={styles.detailsValueWrap}>
                        <Text style={[styles.detailsValue, dTotal === 0 && styles.valueMuted]}>
                          ${dTotal.toFixed(2)}
                        </Text>
                        <TouchableOpacity
                          testID={`adjust-${d.id}`}
                          style={styles.dealerAdjustChip}
                          onPress={() => openAdjustForDealer(d)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.dealerAdjustChipText}>$</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                <View
                  style={[styles.detailsRow, styles.detailsRowLast, styles.nestedTotalRow]}
                  testID="home-dealers-total"
                >
                  <Text style={styles.nestedTotalLabel}>TOTAL</Text>
                  <Text style={[styles.nestedTotalValue, totalOwed === 0 && styles.valueMuted]}>
                    ${totalOwed.toFixed(2)}
                  </Text>
                </View>
              </>
            )}
          </TbvFrame>
        )}

        {/* STAT LIST PANEL — stat rows only, in the user's chosen order. */}
        {renderSequence.some((it) => it.kind === "stat") && (
          <TbvFrame
            source={SKIN.window}
            capInsets={CAP.window}
            style={styles.detailsBoxLayout}
            padX={30}
            padTop={24}
            padBottom={26}
            testID="home-details-box"
          >
            {renderSequence
              .filter((it) => it.kind === "stat")
              .map((item, idx, arr) =>
                renderHomeRow(item.row, idx === arr.length - 1, item.key),
              )}
          </TbvFrame>
        )}

        {/* Render any other custom rows the user has set up but that
            don't fall into the two cards above. Currently nothing falls
            here — kept as a safety net for future row types. */}
        <View style={styles.list}>
          {order.map((k) =>
            visible[k] &&
            k !== "owed_to_dealers" &&
            !STAT_ROW_DATA[k] &&
            (k !== "invested" || prefs.show_prices) ? (
              <View key={k}>{ROW_RENDERERS[k]?.()}</View>
            ) : null,
          )}
        </View>

        {/* Report-a-bug — industrial badge image */}
        <ReportBugBadge style={{ marginTop: 8 }} testID="feedback-banner" />

        <Text style={styles.tip}>
          Pull to refresh · Customize this list under VAULT → CUSTOMIZE
        </Text>
      </ScrollView>

      {paymentTarget && (
        <PaymentModal
          visible={!!paymentTarget}
          dealer={paymentTarget.dealer}
          account={paymentTarget.account}
          onClose={() => setPaymentTarget(null)}
          onSaved={() => {
            setPaymentTarget(null);
            load();
          }}
        />
      )}
      </SafeAreaView>
    </ImageBackground>
  );
}
