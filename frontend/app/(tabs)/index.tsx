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

import { themedStyles, useSkin } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";
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
const HOME_BUILD = "BUILD 137";

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
          sub={mnt.overdue > 0 ? `${mnt.overdue} OVERDUE` : "DUE 30D"}
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
        sub: mnt.overdue > 0 ? `${mnt.overdue} OVERDUE` : "DUE 30D",
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
          title="SUMMARY"
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
            <BevelCard style={styles.plainBanner} onPress={() => router.push("/dealers")}>
              <Ionicons name="map" size={22} color={theme.colors.accent} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.plainBannerLabel}>NEXT DEALER ROUTE</Text>
                <Text style={styles.plainBannerText}>
                  {nextRouteBanner.dealers.join(" & ")} · {nextRouteBanner.dateStr}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </BevelCard>
          )}

          {renderSequence.map((item, idx) => {
            if (item.kind === "dealers") {
              return (
                <BevelCard
                  key={`dealers-${idx}`}
                  style={styles.owedCluster}
                  testID="home-dealers-widget"
                >
                  <TouchableOpacity
                    style={styles.dealerRow}
                    onPress={() => router.push("/dealers")}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dealerName, { fontWeight: "900", flex: 1 }]}>
                      DEALER ACCOUNTS
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                  {dealersAll.length === 0 ? (
                    <Text style={styles.emptyInline}>No dealers yet.</Text>
                  ) : (
                    <>
                      {dealersAll.map((d) => (
                        <View key={d.id} style={styles.owedDivider}>
                          <DealerBalanceRow
                            dealer={d}
                            onAdjust={() => openAdjustForDealer(d)}
                            onOpenDealer={() => router.push(`/dealer/${d.id}`)}
                          />
                        </View>
                      ))}
                      <View style={styles.owedTotalRow} testID="home-dealers-total">
                        <Text style={styles.owedTotalLabel}>TOTAL OWED</Text>
                        <Text style={styles.owedTotalValue}>${totalOwed.toFixed(2)}</Text>
                      </View>
                    </>
                  )}
                </BevelCard>
              );
            }
            return <View key={item.key}>{ROW_RENDERERS[item.key]?.()}</View>;
          })}

          <BevelCard
            style={styles.plainBanner}
            onPress={() => router.push("/feedback")}
            testID="feedback-banner"
          >
            <Ionicons name="chatbubble-ellipses" size={20} color={theme.colors.accent} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.plainBannerLabel}>REPORT A BUG · REQUEST A FEATURE</Text>
              <Text style={styles.plainBannerText}>Have an idea or hit a snag? Let us know.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </BevelCard>

          <Text style={styles.plainTip}>Pull to refresh · Customize under MORE → CUSTOMIZE</Text>
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
          <ActivityIndicator color={TBV.orange} />
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
          title="SUMMARY"
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

        {/* Next dealer route — kept prominent and highlighted */}
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
                <Ionicons name="map" size={22} color={TBV.orange} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.routeBannerLabel}>NEXT DEALER ROUTE</Text>
                <Text style={styles.routeBannerText}>
                  {nextRouteBanner.dealers.join(" & ")} · {nextRouteBanner.dateStr}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TBV.orange} />
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

            {dealersAll.length === 0 ? (
              <View style={[styles.detailsRow, styles.detailsRowLast]}>
                <Text style={[styles.detailsValue, styles.noChip, { color: theme.colors.textMuted, textAlign: "left", flex: 1 }]}>
                  No dealers yet.
                </Text>
              </View>
            ) : (
              <>
                {dealersAll.map((d) => {
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
                        <Text style={styles.detailsLabel} numberOfLines={1}>{d.name}</Text>
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

        {/* Feedback link at the bottom of the first page */}
        <TbvFrame
          source={SKIN.plate}
          capInsets={CAP.plate}
          style={styles.feedbackLayout}
          padX={30}
          padTop={22}
          padBottom={24}
        >
          <TouchableOpacity
            testID="feedback-banner"
            style={styles.feedbackRow}
            onPress={() => router.push("/feedback")}
            activeOpacity={0.85}
          >
            <Ionicons
              name="chatbubble-ellipses"
              size={18}
              color={TBV.orange}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.feedbackTitle}>
                REPORT A BUG · REQUEST A FEATURE
              </Text>
              <Text style={styles.feedbackSub}>
                Have an idea or hit a snag? Let us know.
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={TBV.textMuted}
            />
          </TouchableOpacity>
        </TbvFrame>

        <Text style={styles.tip}>
          Pull to refresh · Customize this list under MORE → CUSTOMIZE
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

/* ---------------- Reusable row components ---------------- */

function SummaryRow({
  icon,
  label,
  value,
  sub,
  onPress,
  rightSlot,
  valueColor,
  nested,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  onPress?: () => void;
  rightSlot?: ReactNode;
  valueColor?: string;
  /**
   * When TRUE, suppresses the card-style background/border/elevation on the
   * row so it can sit inside another raised container (used by the DEALER
   * ACCOUNTS cluster which groups one header + N sub-rows into one card).
   */
  nested?: boolean;
}) {
  const innerContent = (
    <>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={theme.colors.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {/* Skip the value pill when there's no value — otherwise a hollow
          empty pillbox renders next to the label (e.g. the DEALER
          ACCOUNTS header which intentionally has no header-level total). */}
      {value !== "" && value != null ? (
        <View
          style={[
            styles.rowValuePill,
            valueColor ? { borderColor: valueColor } : null,
          ]}
        >
          <Text
            style={[styles.rowValue, valueColor ? { color: valueColor } : null]}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
      ) : null}
      {rightSlot ? rightSlot : (onPress ? (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={theme.colors.textMuted}
          style={{ marginLeft: 8 }}
        />
      ) : null)}
    </>
  );
  // Nested rows (used inside the DEALER ACCOUNTS combined card) skip the
  // raised treatment — they sit flat inside their parent card.
  if (nested) {
    const Wrapper: any = onPress ? TouchableOpacity : View;
    return (
      <Wrapper style={styles.rowNested} onPress={onPress} activeOpacity={0.65}>
        {innerContent}
      </Wrapper>
    );
  }
  // All other summary rows render through BevelCard so the gradient surface
  // + bevel borders + drop shadow match the NET WORTH style universally.
  return (
    <BevelCard style={styles.rowOuter} onPress={onPress}>
      {innerContent}
    </BevelCard>
  );
}

function DealerBalanceRow({
  dealer,
  onAdjust,
  onOpenDealer,
}: {
  dealer: any;
  onAdjust: () => void;
  onOpenDealer: () => void;
}) {
  const credit = Number(dealer.credit_balance) || 0;
  const truck = Number(dealer.personal_balance) || 0;
  const total = credit + truck;
  return (
    <View style={styles.dealerRow}>
      <Text style={styles.dealerName} numberOfLines={1}>
        {dealer.name}
      </Text>
      <TouchableOpacity
        testID={`balance-${dealer.id}`}
        style={styles.dealerBalancePill}
        onPress={onOpenDealer}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.dealerBalancePillText,
            total === 0 && { color: theme.colors.textMuted },
          ]}
        >
          ${total.toFixed(2)}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID={`adjust-${dealer.id}`}
        style={styles.dealerAdjustPill}
        onPress={onAdjust}
        activeOpacity={0.85}
      >
        <Text style={styles.dealerAdjustText}>Adjust</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: "transparent" },
  bg: { flex: 1, backgroundColor: TBV.ink },
  bgVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,10,10,0.60)" },
  gateVeil: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,10,0.55)",
  },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 2,
  },
  // Industrial header — centered TOOLBOX VAULT nameplate over the textured
  // steel plate, with an orange hairline groove beneath (matches login).
  header: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  nameplate: { width: "92%", maxWidth: 380, height: 82 },
  // Native-text TOOLBOX VAULT wordmark (replaces the PNG nameplate).
  wordmark: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 40,
    letterSpacing: 2.5,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  wordmarkSteel: { color: "#D8D8D8" },
  wordmarkVault: { color: TBV.orange },
  // Top-right build beacon — bright + bold so it's unmistakable.
  buildStamp: {
    position: "absolute",
    top: 10,
    right: 92,
    zIndex: 100,
    color: TBV.orange,
    fontFamily: "Rajdhani_700Bold",
    fontSize: 13,
    letterSpacing: 1.5,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headerSub: {
    color: TBV.orange,
    fontFamily: "Rajdhani_700Bold",
    fontSize: 11,
    letterSpacing: 3,
    marginTop: 6,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  title: {
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2.5,
    flexShrink: 1,
  },
  subtitle: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 3,
  },
  versionLine: {
    color: c.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 4,
  },

  /* Decorative center logo on Home — fixed height so even large user
     photos render as a contained thumbnail. Width is responsive (fills
     the content padding) and resizeMode="contain" preserves aspect
     ratio so square photos AND wide banners both look right. */
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoImage: {
    width: "60%",
    height: 140,
  },

  /* Highlighted next-route banner */
  bannerLayout: { marginBottom: 14 },
  routeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  routeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: TBV.orange,
  },
  routeBannerLabel: {
    color: TBV.orange,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 12,
    letterSpacing: 1.4,
  },
  routeBannerText: {
    color: TBV.steel,
    fontFamily: "Rajdhani_700Bold",
    fontSize: 13,
    marginTop: 2,
  },

  /* Main list — claim-screen style: separate cards w/ rounded corners + small gap */
  list: {
    gap: 8,
  },

  // ---------- DETAILS BOX (warranty-card style, mirrors tool/dealer detail) ----------
  detailsBoxLayout: { marginBottom: 14 },
  nestedCardLayout: { marginVertical: 6 },
  detailsBox: {
    backgroundColor: "rgba(18,18,18,0.92)",
    borderWidth: 1.5,
    borderColor: "rgba(255,133,51,0.45)",
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    ...(Platform.select({
      web: { boxShadow: "0 4px 14px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)" as any },
      default: { shadowColor: "#000", shadowOpacity: 0.6, shadowOffset: { width: 0, height: 5 }, shadowRadius: 10, elevation: 8 },
    }) as object),
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginVertical: 2,
    borderRadius: 6,
    // Deep recessed "machined slot" — each line is its own seated container.
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderTopColor: "rgba(0,0,0,0.85)",
    borderLeftColor: "rgba(0,0,0,0.7)",
    borderRightColor: "rgba(255,255,255,0.07)",
    borderBottomColor: "rgba(255,255,255,0.11)",
    gap: 8,
  },
  // Orange accent tick to the left of every row label (control-panel readout).
  rowTick: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    backgroundColor: TBV.orange,
    marginRight: 10,
  },
  rowLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  detailsRowLast: {
    borderBottomWidth: 0,
  },
  detailsLabel: {
    color: TBV.textMuted,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 14,
    letterSpacing: 1.2,
  },
  detailsRowSub: {
    color: TBV.orange,
    fontFamily: "Rajdhani_600SemiBold",
    fontSize: 9,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  detailsValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    justifyContent: "flex-end",
  },
  detailsValue: {
    color: TBV.steel,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 14,
    letterSpacing: 1.2,
    textAlign: "right",
    flexShrink: 1,
    // Recessed "gauge readout" chip
    backgroundColor: "rgba(0,0,0,0.34)",
    borderColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  valueMuted: { color: TBV.textMuted },
  noChip: { backgroundColor: "transparent", borderWidth: 0, paddingHorizontal: 0 },
  // Dealer rows inside the dealer-accounts card use a slightly larger name
  // since the dealer name is the row's primary identifier (analogous to the
  // agent rows on the dealer detail screen).
  dealerRowName: {
    color: TBV.steel,
    fontFamily: "Rajdhani_700Bold",
    fontSize: 14,
  },
  dealerAdjustChip: {
    width: 28,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: TBV.orange,
    borderRadius: 5,
  },
  dealerAdjustChipText: {
    color: TBV.orange,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 15,
    letterSpacing: 0,
  },

  // ---------- NESTED SUB-CARD (used for DEALER ACCOUNTS inside the main
  // Description Card so the dealer cluster reads as a card-within-a-card). ----------
  nestedCard: {
    backgroundColor: "rgba(8,8,8,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,133,51,0.22)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginVertical: 6,
  },
  // The header row inside the nested card gets an emphasized bottom border so
  // it visually separates from the dealer list directly below it.
  nestedHeaderRow: {
    borderBottomColor: c.border,
  },
  // The TOTAL footer inside the dealer sub-card — label uses the same
  // typography as every other row label in the Description Card; only the
  // value is accent-colored so the grand total still reads as a "total"
  // without breaking the visual rhythm of the rest of the card.
  nestedTotalRow: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 10,
    marginTop: 2,
  },
  nestedTotalLabel: {
    color: TBV.steel,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 14,
    letterSpacing: 1.5,
  },
  nestedTotalValue: {
    color: TBV.orange,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 14,
    letterSpacing: 1.2,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: c.bgSecondary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    ...(theme.elevation.md as object),
  },
  rowNested: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "transparent",
  },
  // Layout-only style for SummaryRow when rendered through BevelCard. The
  // BevelCard supplies the gradient surface + borders + drop shadow — this
  // block just controls inner flex layout & padding.
  rowOuter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  /* Sharp Bevel 3D — the OUTER pillbox gets a chiseled bevel: thicker
     lighter top + left edge (highlight catching light from the top), thicker
     darker bottom + right edge (drop-off shadow). A visible offset outer
     drop shadow lifts the whole tile off the page. Layout dimensions stay
     identical to the standard `row` style. */
  rowBevel: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    // Uniform 2px borders on every side — only the COLOURS differ — so the
    // corner mitering stays clean.
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderTopColor: c.bevelHighlight,
    borderLeftColor: c.bevelHighlight,
    borderBottomColor: c.bevelShadow,
    borderRightColor: c.bevelShadow,
    overflow: "hidden",
    ...(Platform.select({
      web: {
        boxShadow: `4px 4px 0 ${c.bevelDrop}, 6px 6px 12px ${c.bevelDrop}` as any,
      },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.55,
        shadowOffset: { width: 3, height: 5 },
        shadowRadius: 6,
        elevation: 8,
      },
    }) as object),
  },
  bevelGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bevelInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
  },
  rowLabel: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  rowSub: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "600",
    marginTop: 2,
    letterSpacing: 0.3,
  },
  rowValuePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: c.bg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    minWidth: 64,
    alignItems: "center",
    marginLeft: 6,
  },
  rowValue: {
    color: c.textPrimary,
    fontSize: 9,
    fontWeight: "900",
  },

  /* Dealer rows (two-line) — nested inside the OWED TO DEALERS card */
  emptyInline: {
    color: c.textMuted,
    fontSize: 10,
    fontStyle: "italic",
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlign: "center",
  },
  owedCluster: {
    backgroundColor: c.bgSecondary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    overflow: "hidden",
    ...(theme.elevation.md as object),
  },
  owedDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  /* Subtotal row pinned to the bottom of the DEALER ACCOUNTS cluster — sums
     up everything owed across all dealers above. Transparent background so
     it inherits the parent gradient surface (no jarring darker rectangle). */
  owedTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "transparent",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  owedTotalLabel: {
    color: c.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  owedTotalValue: {
    color: c.accent,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  dealerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dealerName: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  dealerTotal: {
    color: c.textPrimary,
    fontSize: 11,
    fontWeight: "900",
    minWidth: 64,
    textAlign: "right",
  },
  dealerBalancePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: c.bg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    minWidth: 76,
    alignItems: "center",
  },
  dealerBalancePillText: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "900",
  },
  dealerAdjustPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: c.accent,
    borderRadius: 999,
  },
  dealerAdjustText: {
    color: "#000",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  /* Feedback */
  feedbackLayout: { marginTop: 16 },
  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  feedbackTitle: {
    color: TBV.steel,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 14,
    letterSpacing: 1,
  },
  feedbackSub: {
    color: TBV.textMuted,
    fontFamily: "Rajdhani_600SemiBold",
    fontSize: 11,
    marginTop: 3,
  },
  tip: {
    color: TBV.textMuted,
    fontFamily: "Rajdhani_500Medium",
    fontSize: 10,
    textAlign: "center",
    marginTop: 14,
  },
  // ---- PLAIN MODE (non-skinned) Home layout ----
  plainSafe: { flex: 1, backgroundColor: c.bg },
  plainContent: { padding: 16, paddingBottom: 110, gap: 10 },
  plainBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  plainBannerLabel: {
    color: c.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  plainBannerText: {
    color: c.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 3,
  },
  plainBuildStamp: {
    position: "absolute",
    top: 6,
    right: 10,
    zIndex: 50,
    color: c.textMuted,
    fontSize: 9,
    fontWeight: "700",
    opacity: 0.7,
  },
  // Old-style plain Home text header (TOOLBOX VAULT / SUMMARY / version + ADD ITEM)
  plainHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  plainTitle: {
    color: c.textPrimary,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 2,
  },
  plainSummary: {
    color: c.accent,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 3,
    marginTop: 2,
  },
  plainVersion: {
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 2,
  },
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  addItemText: {
    color: c.accent,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  // Readable bottom hint for plain mode (the global `tip` uses a hardcoded
  // muted grey that is too light to read on the light palette).
  plainTip: {
    color: c.textSecondary,
    fontSize: 12,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 16,
  },
}));
