/**
 * TBVThemeProvider — wraps the app with the unified Toolbox Vault theme.
 * Replaces the older IndustrialThemeContext with a tokenized system per Part 6.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DARK,
  LIGHT,
  Palette,
  RADIUS,
  ResolvedMode,
  SPACING,
  TEXT_VARIANTS,
  TextVariant,
  ThemeMode,
  shadows,
} from "./tokens";

type Ctx = {
  mode: ThemeMode;
  resolvedMode: ResolvedMode;
  accent: string;
  palette: Palette;
  spacing: typeof SPACING;
  radius: typeof RADIUS;
  shadow: ReturnType<typeof shadows>;
  text: typeof TEXT_VARIANTS;
  textVariant: (v: TextVariant) => (typeof TEXT_VARIANTS)[TextVariant];
  setMode: (m: ThemeMode) => void;
  setAccent: (hex: string) => void;
};

const KEY_MODE = "@tbv/mode";
const KEY_ACCENT = "@tbv/accent";

const TBVThemeCtx = createContext<Ctx | null>(null);

function resolve(mode: ThemeMode): ResolvedMode {
  if (mode === "system") {
    const sys = Appearance.getColorScheme();
    return sys === "light" ? "light" : "dark";
  }
  return mode;
}

export function TBVThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [accent, setAccentState] = useState<string>(DARK.accent);
  const [resolvedMode, setResolvedMode] = useState<ResolvedMode>("dark");

  useEffect(() => {
    (async () => {
      try {
        const [m, a] = await Promise.all([
          AsyncStorage.getItem(KEY_MODE),
          AsyncStorage.getItem(KEY_ACCENT),
        ]);
        if (m === "light" || m === "dark" || m === "system") {
          setModeState(m);
          setResolvedMode(resolve(m));
        }
        if (a && /^#[0-9a-fA-F]{6}$/.test(a)) setAccentState(a);
      } catch { /* ignore */ }
    })();
  }, []);

  // Re-resolve system mode if the OS theme changes while we're in "system" mode.
  useEffect(() => {
    if (mode !== "system") return;
    const sub = Appearance.addChangeListener(() => setResolvedMode(resolve("system")));
    return () => sub.remove();
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    setResolvedMode(resolve(m));
    AsyncStorage.setItem(KEY_MODE, m).catch(() => undefined);
  }, []);

  const setAccent = useCallback((hex: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    setAccentState(hex);
    AsyncStorage.setItem(KEY_ACCENT, hex).catch(() => undefined);
  }, []);

  const palette = useMemo<Palette>(() => {
    const base = resolvedMode === "light" ? LIGHT : DARK;
    // Apply user accent on top.
    return { ...base, accent };
  }, [resolvedMode, accent]);

  const value = useMemo<Ctx>(() => ({
    mode,
    resolvedMode,
    accent,
    palette,
    spacing: SPACING,
    radius: RADIUS,
    shadow: shadows(resolvedMode),
    text: TEXT_VARIANTS,
    textVariant: (v) => TEXT_VARIANTS[v],
    setMode,
    setAccent,
  }), [mode, resolvedMode, accent, palette, setMode, setAccent]);

  return <TBVThemeCtx.Provider value={value}>{children}</TBVThemeCtx.Provider>;
}

export function useTBV(): Ctx {
  const ctx = useContext(TBVThemeCtx);
  if (!ctx) {
    // Sensible fallback when called outside provider
    return {
      mode: "dark",
      resolvedMode: "dark",
      accent: DARK.accent,
      palette: DARK,
      spacing: SPACING,
      radius: RADIUS,
      shadow: shadows("dark"),
      text: TEXT_VARIANTS,
      textVariant: (v) => TEXT_VARIANTS[v],
      setMode: () => undefined,
      setAccent: () => undefined,
    };
  }
  return ctx;
}

// Backwards-compat alias used by older code referencing the previous provider name.
export const useIndustrialTheme = () => {
  const t = useTBV();
  return { palette: t.palette, mode: t.resolvedMode, accent: t.accent, setMode: t.setMode, setAccent: t.setAccent };
};
