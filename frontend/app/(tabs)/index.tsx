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

import { themedStyles } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";
import { useSubscriptionChange } from "../../src/subscriptionEvents";
import { useAppResume } from "../../src/appLifecycle";

export default function HomeScreen() {
  const router = useRouter();
  const { prefs } = usePrefs();
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

  const load = useCallback(async () => {
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
      const [s, a, t, w, d, m, c] = await Promise.all([
        api.getStats().catch(keep),
        api.aggregate({}).catch(keep),
        api.listTools({}).catch(keep),
        api.listWishlist().catch(keep),
        api.listDealers().catch(keep),
        api.upcomingMaintenance(30).catch(keep),
        api.warrantyClaimsSummary().catch(keep),
      ]);
      if (s !== KEEP) setStats(setCached("home_stats", s));
      if (a !== KEEP) setAgg(setCached("home_agg", a));
      if (t !== KEEP) setTools(setCached("tools", t as any[]));
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
    await load();
    setRefreshing(false);
  };

  // ---------- Derived metrics ----------
  const totalItems = tools.length;
  const checkedOut = tools.filter((x) => x.is_checked_out).length;
  const forSaleCount = tools.filter((x) => x.for_sale && !x.is_sold).length;
  const lost = tools.filter((x) => x?.lost_status?.is_lost).length;
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
        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <Text style={styles.detailsLabel} numberOfLines={1}>{r.label}</Text>
          {!!r.sub && <Text style={styles.detailsRowSub} numberOfLines={1}>{r.sub}</Text>}
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>TOOLBOX VAULT</Text>
          <Text style={styles.subtitle}>SUMMARY</Text>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
            <Text style={styles.versionLine} testID="home-version">
              {APP_VERSION_LABEL}
            </Text>
            {/* Admin-only at-a-glance user-base counter.
                Free vs subscribed counts come from /api/admin/user-stats which
                is gated to ADMIN_EMAILS — non-admins simply never see this row
                because the fetch silently fails. Auto-refreshes on every home
                pull-to-refresh via the same `load()` cycle. */}
            {userStats && (
              <Text
                style={[styles.versionLine, { marginLeft: 8 }]}
                testID="home-admin-userstats"
              >
                FREE: {userStats.free}   SUB: {userStats.subscribed}
              </Text>
            )}
          </View>
        </View>
      </View>

      <ScrollView
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
            content scroll. User can pick a custom image or hide it
            altogether from More → Customize → Home Screen Logo. */}
        {prefs.home_logo_mode !== "hidden" && (
          <View style={styles.logoWrap}>
            <Image
              testID="home-logo"
              source={
                prefs.home_logo_mode === "custom" && prefs.home_logo_data
                  ? { uri: prefs.home_logo_data }
                  : require("../../assets/images/icon.png")
              }
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Next dealer route — kept prominent and highlighted */}
        {nextRouteBanner && (
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
        )}

        {/* UNIFIED HOME DESCRIPTION CARD — single warranty-card-style box
            containing every enabled row in the user's chosen order. The
            DEALER ACCOUNTS header sits at its assigned position in the
            sequence, with its dealer sub-rows nested directly beneath it.
            Previously the stats and dealer-accounts lived in two separate
            hardcoded-order cards, which ignored the user's row-order
            preference for `owed_to_dealers`. */}
        {renderSequence.length > 0 && (
          <View style={styles.detailsBox} testID="home-details-box">
            {renderSequence.map((item, idx) => {
              const isLastItem = idx === renderSequence.length - 1;
              if (item.kind === "stat") {
                // For stat rows, only mark as "last" when this is the final
                // item in the sequence (so no trailing divider on the very
                // last row of the card).
                return renderHomeRow(item.row, isLastItem, item.key);
              }
              // DEALER ACCOUNTS block — header row + N dealer sub-rows +
              // TOTAL footer, all nested inside a sub-card within the main
              // Description Card so the dealer cluster is visually distinct
              // from the surrounding stat rows.
              return (
                <View
                  key="owed_to_dealers"
                  style={[
                    styles.nestedCard,
                    // Only the divider between the dealer block and the next
                    // outer row should remain visible — the nested card's
                    // own border supplies the bottom edge already.
                    isLastItem && { marginBottom: 0 },
                  ]}
                >
                  <TouchableOpacity
                    style={[styles.detailsRow, styles.nestedHeaderRow]}
                    activeOpacity={0.6}
                    testID="home-dealers-header"
                    onPress={() => router.push("/dealers")}
                  >
                    <Text style={styles.detailsLabel}>DEALER ACCOUNTS</Text>
                    <View style={styles.detailsValueWrap}>
                      <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                  {dealersAll.length === 0 ? (
                    <View style={[styles.detailsRow, styles.detailsRowLast]}>
                      <Text
                        style={[
                          styles.detailsValue,
                          {
                            color: theme.colors.textMuted,
                            textAlign: "left",
                            flex: 1,
                            fontWeight: "500",
                          },
                        ]}
                      >
                        No dealers yet.
                      </Text>
                    </View>
                  ) : (
                    <>
                      {dealersAll.map((d, i) => {
                        const credit = Number(d.credit_balance) || 0;
                        const truck = Number(d.personal_balance) || 0;
                        const dTotal = credit + truck;
                        void i;
                        return (
                          <View key={d.id} style={styles.detailsRow}>
                            <TouchableOpacity
                              onPress={() => router.push(`/dealer/${d.id}`)}
                              activeOpacity={0.6}
                              style={{ flex: 1, minWidth: 0, marginRight: 8 }}
                              testID={`home-dealer-${d.id}`}
                            >
                              <Text style={styles.dealerRowName} numberOfLines={1}>
                                {d.name}
                              </Text>
                            </TouchableOpacity>
                            <View style={styles.detailsValueWrap}>
                              <Text
                                style={[
                                  styles.detailsValue,
                                  dTotal === 0 && { color: theme.colors.textMuted },
                                ]}
                              >
                                ${dTotal.toFixed(2)}
                              </Text>
                              <TouchableOpacity
                                testID={`adjust-${d.id}`}
                                style={styles.dealerAdjustChip}
                                onPress={() => openAdjustForDealer(d)}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.dealerAdjustChipText}>ADJUST</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                      {/* TOTAL footer — sum of every dealer balance shown above.
                          Always rendered when there's at least one dealer so the
                          user can see the grand total without scrolling back up. */}
                      <View
                        style={[styles.detailsRow, styles.detailsRowLast, styles.nestedTotalRow]}
                        testID="home-dealers-total"
                      >
                        <Text style={styles.nestedTotalLabel}>TOTAL</Text>
                        <Text
                          style={[
                            styles.nestedTotalValue,
                            totalOwed === 0 && { color: theme.colors.textMuted },
                          ]}
                        >
                          ${totalOwed.toFixed(2)}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              );
            })}
          </View>
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
        <TouchableOpacity
          testID="feedback-banner"
          style={styles.feedbackRow}
          onPress={() => router.push("/feedback")}
          activeOpacity={0.85}
        >
          <Ionicons
            name="chatbubble-ellipses"
            size={18}
            color={theme.colors.accent}
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
            color={theme.colors.textMuted}
          />
        </TouchableOpacity>

        <Text style={styles.tip}>
          Pull to refresh · Customize this list under MORE → DISPLAY
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
  container: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    gap: 8,
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
  routeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: `${c.accent}15`,
    borderWidth: 1,
    borderColor: c.accent,
    borderLeftWidth: 5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  routeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.accent,
  },
  routeBannerLabel: {
    color: c.accent,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  routeBannerText: {
    color: c.textPrimary,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },

  /* Main list — claim-screen style: separate cards w/ rounded corners + small gap */
  list: {
    gap: 8,
  },

  // ---------- DETAILS BOX (warranty-card style, mirrors tool/dealer detail) ----------
  detailsBox: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    ...(theme.elevation.md as object),
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
    gap: 8,
  },
  detailsRowLast: {
    borderBottomWidth: 0,
  },
  detailsLabel: {
    color: c.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  detailsRowSub: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "600",
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
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    flexShrink: 1,
  },
  // Dealer rows inside the dealer-accounts card use a slightly larger name
  // since the dealer name is the row's primary identifier (analogous to the
  // agent rows on the dealer detail screen).
  dealerRowName: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  dealerAdjustChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1.5,
    borderColor: c.accent,
    borderRadius: 6,
  },
  dealerAdjustChipText: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },

  // ---------- NESTED SUB-CARD (used for DEALER ACCOUNTS inside the main
  // Description Card so the dealer cluster reads as a card-within-a-card). ----------
  nestedCard: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.borderSubtle,
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
    color: c.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  nestedTotalValue: {
    color: c.accent,
    fontSize: 12,
    fontWeight: "700",
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
  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bgSecondary,
  
    ...(theme.elevation.md as object),
  },
  feedbackTitle: {
    color: c.textPrimary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  feedbackSub: {
    color: c.textMuted,
    fontSize: 9,
    fontWeight: "600",
    marginTop: 3,
  },
  tip: {
    color: c.textMuted,
    fontSize: 8,
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 14,
  },
}));
