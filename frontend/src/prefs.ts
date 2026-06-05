import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState, useCallback } from "react";

// Customizable rows on the Home screen. Each key matches a row id in
// /app/(tabs)/index.tsx — toggling it false hides that row.
export type HomeRowKey =
  | "total_items"
  | "invested"
  | "checked_out"
  | "selling"
  | "wishlist"
  | "lost"
  | "maintenance"
  | "open_claims"
  | "owed_to_dealers";

export type HomeRowVis = Record<HomeRowKey, boolean>;

export type Prefs = {
  show_prices: boolean;
  warranty_alerts: boolean;
  show_details_summary: boolean;
  home_rows: HomeRowVis;
  home_row_order: HomeRowKey[];
  // Dealer route notifications
  dealer_notifications_enabled: boolean;
  dealer_notification_hour: number; // 0-23
  dealer_notification_minute: number; // 0-59
  dealer_notify_day_before: boolean;
  // Borrowed-tool overdue reminders. When enabled, the app schedules a
  // local notification every `borrow_reminder_hours` while a tool is
  // checked out (until the user marks it returned).
  borrow_reminders_enabled: boolean;
  borrow_reminder_hours: number; // total hours between reminders. 24 = daily.
  // Home screen decorative logo. Modes:
  //   "custom"  — show the base64 image stored in `home_logo_data`
  //   "hidden"  — don't render the logo block at all (initial state)
  //   "default" — legacy mode kept only for backwards-compat with prefs
  //               saved before we removed the bundled default. Rendered
  //               the same as "hidden".
  home_logo_mode: "default" | "custom" | "hidden";
  // Base64 PNG/JPEG data URI of the user's custom logo. Only used when
  // `home_logo_mode` === "custom". Resized client-side to fit ~512x512 max
  // before being saved so AsyncStorage doesn't blow up on giant photos.
  home_logo_data: string | null;
  // Show the "Next dealer route" banner at the top of the home screen.
  // Defaults to TRUE (preserves prior behavior). User can hide via the
  // CUSTOMIZE section in the More tab.
  show_dealer_route_reminder: boolean;
  // Show the "Payments due this week" banner on the home screen (CUSTOMIZE).
  show_payments_banner: boolean;
  // Master switch for dealer-payment reminders (day-before / day-of are set
  // per payment account). Uses the same notification time as dealer routes.
  payment_notifications_enabled: boolean;
};

const KEY = "toolbox_prefs_v2";
const LEGACY_KEY = "toolbox_prefs_v1";

const DEFAULT_HOME_ROWS: HomeRowVis = {
  total_items: true,
  invested: true,
  checked_out: true,
  selling: true,
  wishlist: true,
  lost: true,
  maintenance: true,
  open_claims: true,
  owed_to_dealers: true,
};

// Order requested by the user: Dealer Accounts first (the big revenue-card
// block), then the rolled-up numeric metrics in priority of "things you
// actually want to glance at every day", then the longer-tail buckets.
const DEFAULT_HOME_ROW_ORDER: HomeRowKey[] = [
  "owed_to_dealers",
  "total_items",
  "invested",
  "checked_out",
  "open_claims",
  "maintenance",
  "selling",
  "wishlist",
  "lost",
];

const DEFAULTS: Prefs = {
  show_prices: true,
  warranty_alerts: true,
  show_details_summary: false,
  home_rows: DEFAULT_HOME_ROWS,
  home_row_order: DEFAULT_HOME_ROW_ORDER,
  dealer_notifications_enabled: false,
  dealer_notification_hour: 7,
  dealer_notification_minute: 0,
  dealer_notify_day_before: false,
  borrow_reminders_enabled: false,
  borrow_reminder_hours: 24, // default = 1 day per user spec (2026-05-26)
  home_logo_mode: "hidden",
  home_logo_data: null,
  show_dealer_route_reminder: true,
  show_payments_banner: true,
  payment_notifications_enabled: true,
};

export const loadPrefs = async (): Promise<Prefs> => {
  // Ensure the saved order array always has every known row key exactly once
  const normalizeOrder = (arr: any): HomeRowKey[] => {
    const seen = new Set<string>();
    const out: HomeRowKey[] = [];
    if (Array.isArray(arr)) {
      for (const k of arr) {
        if (
          typeof k === "string" &&
          (DEFAULT_HOME_ROW_ORDER as string[]).includes(k) &&
          !seen.has(k)
        ) {
          seen.add(k);
          out.push(k as HomeRowKey);
        }
      }
    }
    // Append any keys that weren't in the saved order yet (so adding a new
    // metric in a future version doesn't disappear).
    for (const k of DEFAULT_HOME_ROW_ORDER) {
      if (!seen.has(k)) out.push(k);
    }
    return out;
  };
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      const legacy = await AsyncStorage.getItem(LEGACY_KEY);
      if (legacy) {
        try {
          const lp = JSON.parse(legacy);
          return {
            ...DEFAULTS,
            ...lp,
            home_rows: { ...DEFAULT_HOME_ROWS, ...(lp.home_rows || {}) },
            home_row_order: normalizeOrder(lp.home_row_order),
          };
        } catch {
          return DEFAULTS;
        }
      }
      return DEFAULTS;
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      home_rows: { ...DEFAULT_HOME_ROWS, ...(parsed.home_rows || {}) },
      home_row_order: normalizeOrder(parsed.home_row_order),
    };
  } catch {
    return DEFAULTS;
  }
};

export const savePrefs = async (prefs: Partial<Prefs>) => {
  const current = await loadPrefs();
  const merged: Prefs = {
    ...current,
    ...prefs,
    home_rows:
      prefs.home_rows !== undefined
        ? { ...current.home_rows, ...prefs.home_rows }
        : current.home_rows,
    home_row_order:
      prefs.home_row_order !== undefined
        ? prefs.home_row_order
        : current.home_row_order,
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(merged));
  return merged;
};

export const HOME_ROW_LABELS: Record<HomeRowKey, string> = {
  total_items: "Total Items",
  invested: "Invested",
  checked_out: "Checked Out",
  selling: "Selling",
  wishlist: "Wish List",
  lost: "Lost / Stolen",
  maintenance: "Maintenance Due",
  open_claims: "Open Claims",
  owed_to_dealers: "Dealer Accounts",
};

export const usePrefs = () => {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const reload = useCallback(async () => {
    setPrefs(await loadPrefs());
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  const update = useCallback(async (p: Partial<Prefs>) => {
    const merged = await savePrefs(p);
    setPrefs(merged);
  }, []);
  return { prefs, update, reload };
};
