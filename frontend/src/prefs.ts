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
};

const KEY = "toolbox_prefs_v2";
const LEGACY_KEY = "toolbox_prefs_v1";

const DEFAULT_HOME_ROWS: HomeRowVis = {
  total_items: true,
  invested: true,
  checked_out: true,
  selling: false,
  wishlist: false,
  lost: false,
  maintenance: true,
  open_claims: true,
  owed_to_dealers: true,
};

const DEFAULTS: Prefs = {
  show_prices: true,
  warranty_alerts: true,
  show_details_summary: false,
  home_rows: DEFAULT_HOME_ROWS,
};

export const loadPrefs = async (): Promise<Prefs> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      // Migrate legacy v1 prefs (which had no home_rows)
      const legacy = await AsyncStorage.getItem(LEGACY_KEY);
      if (legacy) {
        try {
          const lp = JSON.parse(legacy);
          return {
            ...DEFAULTS,
            ...lp,
            home_rows: { ...DEFAULT_HOME_ROWS, ...(lp.home_rows || {}) },
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
  owed_to_dealers: "Owed to Dealers",
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
