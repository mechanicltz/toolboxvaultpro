import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState, useCallback } from "react";

export type Prefs = {
  show_prices: boolean;
  warranty_alerts: boolean;
  show_details_summary: boolean;
};

const KEY = "toolbox_prefs_v1";
const DEFAULTS: Prefs = {
  show_prices: true,
  warranty_alerts: true,
  show_details_summary: false,
};

export const loadPrefs = async (): Promise<Prefs> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
};

export const savePrefs = async (prefs: Partial<Prefs>) => {
  const current = await loadPrefs();
  const merged = { ...current, ...prefs };
  await AsyncStorage.setItem(KEY, JSON.stringify(merged));
  return merged;
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
