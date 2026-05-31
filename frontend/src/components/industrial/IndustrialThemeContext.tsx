/**
 * IndustrialThemeContext — wraps app-wide industrial theme mode + accent.
 * Provides current palette + setter so any component can switch between
 * dark/light and recolor on accent change.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DARK_PALETTE, IndustrialPalette, IndustrialThemeMode, LIGHT_PALETTE } from "./theme";

type Ctx = {
  mode: IndustrialThemeMode;
  accent: string;
  palette: IndustrialPalette;
  setMode: (m: IndustrialThemeMode) => void;
  setAccent: (hex: string) => void;
};

const KEY_MODE = "@industrial/mode";
const KEY_ACCENT = "@industrial/accent";

const IndustrialThemeCtx = createContext<Ctx | null>(null);

export function IndustrialThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<IndustrialThemeMode>("dark");
  const [accent, setAccentState] = useState<string>(DARK_PALETTE.accent);

  useEffect(() => {
    (async () => {
      try {
        const [m, a] = await Promise.all([
          AsyncStorage.getItem(KEY_MODE),
          AsyncStorage.getItem(KEY_ACCENT),
        ]);
        if (m === "light" || m === "dark") setModeState(m);
        if (a && /^#[0-9a-fA-F]{6}$/.test(a)) setAccentState(a);
      } catch { /* ignore */ }
    })();
  }, []);

  const setMode = useCallback((m: IndustrialThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(KEY_MODE, m).catch(() => undefined);
  }, []);

  const setAccent = useCallback((hex: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    setAccentState(hex);
    AsyncStorage.setItem(KEY_ACCENT, hex).catch(() => undefined);
  }, []);

  const palette = useMemo<IndustrialPalette>(() => {
    const base = mode === "light" ? LIGHT_PALETTE : DARK_PALETTE;
    // Apply user accent on top of the base palette.
    return { ...base, accent, border: hexToBorder(accent) };
  }, [mode, accent]);

  const value = useMemo<Ctx>(() => ({ mode, accent, palette, setMode, setAccent }), [mode, accent, palette, setMode, setAccent]);

  return (
    <IndustrialThemeCtx.Provider value={value}>
      {children}
    </IndustrialThemeCtx.Provider>
  );
}

export function useIndustrialTheme(): Ctx {
  const ctx = useContext(IndustrialThemeCtx);
  if (!ctx) {
    // Allow component use outside the provider — fall back to dark defaults.
    return {
      mode: "dark",
      accent: DARK_PALETTE.accent,
      palette: DARK_PALETTE,
      setMode: () => undefined,
      setAccent: () => undefined,
    };
  }
  return ctx;
}

function hexToBorder(hex: string): string {
  // Convert solid hex to a border rgba with 0.55 alpha
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) return "rgba(255,106,0,0.55)";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},0.55)`;
}
