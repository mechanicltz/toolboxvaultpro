/**
 * ThemeContext — runtime light/dark switcher for the whole app.
 *
 * USAGE in components
 * ───────────────────
 *   import { useColors, useThemedStyles } from "../src/themeContext";
 *
 *   function MyScreen() {
 *     const c = useColors();                  // raw palette (live)
 *     const styles = useThemedStyles((c) => ({
 *       container: { backgroundColor: c.bg },
 *       title:     { color: c.textPrimary },
 *     }));
 *     return <View style={styles.container} />;
 *   }
 *
 * USAGE inline (most JSX color props work automatically because
 * `theme.colors` is a Proxy that resolves at access time):
 *
 *   import { theme } from "../src/theme";
 *   <Ionicons color={theme.colors.accent} />  // live — picks up theme change
 *
 * The reason `useThemedStyles` exists: `StyleSheet.create({...})` snapshots
 * color string values at module-load time. So any module-level styles block
 * cannot be theme-reactive on its own — it needs to be recreated whenever
 * the palette flips. `useThemedStyles` does exactly that with `useMemo`.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ColorPalette,
  applyPalette,
  currentPalette,
  darkPalette,
  darkPaletteIndustrial,
  darkPalettePink,
  darkPaletteArctic,
  darkPaletteEmerald,
  lightPalette,
} from "./theme";
import { setIndustrialVariant as applyIndustrialVariant } from "./tbv/skins";

export type ThemeMode = "dark" | "light";
/**
 * Presentation skin:
 *  - "industrial" → the textured metal/PNG-frame look (Dashboard style).
 *    This mode IGNORES light/dark and always uses the dark industrial palette.
 *  - "plain"      → no skins; clean flat cards that honour the light/dark mode.
 */
export type SkinMode = "industrial" | "plain";

/** Colour variant of the industrial skin (orange base + Pillow recolors). */
export type IndustrialVariant = "orange" | "pink" | "arctic" | "emerald";

/** Metal art family for the industrial skin: Iron Forge (textured) vs Steel (brushed silver). */
export type MetalStyle = "iron" | "steel";

/** The user-facing appearance choices shown in the picker. */
export type AppearanceOption =
  | "light"
  | "dark"
  | "industrial"
  | "industrial-pink"
  | "industrial-arctic"
  | "industrial-emerald"
  | "steel"
  | "steel-pink"
  | "steel-arctic"
  | "steel-emerald";

type Ctx = {
  mode: ThemeMode;
  skin: SkinMode;
  industrialVariant: IndustrialVariant;
  metalStyle: MetalStyle;
  appearance: AppearanceOption;
  colors: ColorPalette;
  setMode: (m: ThemeMode) => Promise<void>;
  setSkin: (s: SkinMode) => Promise<void>;
  setAppearance: (o: AppearanceOption) => Promise<void>;
  toggle: () => Promise<void>;
};

const STORAGE_KEY = "toolbox.themeMode";
const STORAGE_KEY_SKIN = "toolbox.skinMode";
const STORAGE_KEY_VARIANT = "toolbox.industrialVariant";
const STORAGE_KEY_METAL = "toolbox.metalStyle";

/** Accent palette per industrial colour variant (only the accent family differs). */
const VARIANT_PALETTE: Record<IndustrialVariant, ColorPalette> = {
  orange: darkPaletteIndustrial,
  pink: darkPalettePink,
  arctic: darkPaletteArctic,
  emerald: darkPaletteEmerald,
};

/**
 * The palette that should actually be applied for a given skin + mode + variant
 * combo. Industrial always renders on the dark workshop palette; each colour
 * variant swaps only the accent family.
 */
function effectivePalette(
  skin: SkinMode,
  mode: ThemeMode,
  variant: IndustrialVariant,
): ColorPalette {
  if (skin === "industrial") return VARIANT_PALETTE[variant] ?? darkPalette;
  return mode === "light" ? lightPalette : darkPalette;
}

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [skin, setSkinState] = useState<SkinMode>("industrial");
  const [industrialVariant, setVariantState] = useState<IndustrialVariant>("orange");
  const [metalStyle, setMetalState] = useState<MetalStyle>("iron");
  const [hydrated, setHydrated] = useState(false);

  // Refs mirror the latest mode/skin so the setters always compute the
  // effective palette from up-to-date values — even when both are changed
  // back-to-back (e.g. tapping "Plain · Light" calls setSkin then setMode).
  // Closures alone would capture stale state and apply the wrong palette.
  const modeRef = useRef<ThemeMode>("dark");
  const skinRef = useRef<SkinMode>("industrial");
  // Mirrors the latest industrial colour variant (orange/pink) so the setters
  // resolve the correct palette + skin art even when skin/mode/variant are
  // changed back-to-back. (Previously referenced but never declared — that
  // crashed setMode/setAppearance and prevented the pink variant from ever
  // being applied on cold start.)
  const variantRef = useRef<IndustrialVariant>("orange");
  const metalRef = useRef<MetalStyle>("iron");

  // Hydrate both prefs from disk on first mount. Defaults: skin = industrial
  // (the premium textured look), mode = dark. Industrial forces the dark
  // palette regardless of the stored light/dark mode.
  useEffect(() => {
    (async () => {
      try {
        const [storedMode, storedSkin, storedVariant, storedMetal] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(STORAGE_KEY_SKIN),
          AsyncStorage.getItem(STORAGE_KEY_VARIANT),
          AsyncStorage.getItem(STORAGE_KEY_METAL),
        ]);
        const m: ThemeMode = storedMode === "light" ? "light" : "dark";
        const s: SkinMode = storedSkin === "plain" ? "plain" : "industrial";
        const v: IndustrialVariant =
          storedVariant === "pink" ||
          storedVariant === "arctic" ||
          storedVariant === "emerald"
            ? storedVariant
            : "orange";
        const metal: MetalStyle = storedMetal === "steel" ? "steel" : "iron";
        modeRef.current = m;
        skinRef.current = s;
        variantRef.current = v;
        metalRef.current = metal;
        applyIndustrialVariant(v);
        applyPalette(effectivePalette(s, m, v));
        bumpStyleCacheVersion();
        setModeState(m);
        setSkinState(s);
        setVariantState(v);
        setMetalState(metal);
      } catch {
        /* ignore */
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const setMode = useCallback(async (m: ThemeMode) => {
    modeRef.current = m;
    // Use the latest skin (ref) so chained skin+mode changes resolve correctly.
    applyPalette(effectivePalette(skinRef.current, m, variantRef.current));
    bumpStyleCacheVersion();
    setModeState(m);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const setSkin = useCallback(async (s: SkinMode) => {
    skinRef.current = s;
    applyPalette(effectivePalette(s, modeRef.current, variantRef.current));
    bumpStyleCacheVersion();
    setSkinState(s);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_SKIN, s);
    } catch {
      /* ignore */
    }
  }, []);

  // Atomic setter for the appearance options — sets skin + mode + industrial
  // variant together so the palette + skin art always resolve in one pass.
  // Plain Light/Dark force the orange variant; the industrial-* options each
  // map to their colour variant (which also tints the locked login screens).
  const setAppearance = useCallback(async (opt: AppearanceOption) => {
    let s: SkinMode;
    let m: ThemeMode;
    let v: IndustrialVariant;
    let metal: MetalStyle = "iron";
    if (opt === "light") {
      s = "plain"; m = "light"; v = "orange";
    } else if (opt === "dark") {
      s = "plain"; m = "dark"; v = "orange";
    } else if (opt === "industrial-pink") {
      s = "industrial"; m = modeRef.current; v = "pink"; metal = "iron";
    } else if (opt === "industrial-arctic") {
      s = "industrial"; m = modeRef.current; v = "arctic"; metal = "iron";
    } else if (opt === "industrial-emerald") {
      s = "industrial"; m = modeRef.current; v = "emerald"; metal = "iron";
    } else if (opt === "steel") {
      s = "industrial"; m = modeRef.current; v = "orange"; metal = "steel";
    } else if (opt === "steel-pink") {
      s = "industrial"; m = modeRef.current; v = "pink"; metal = "steel";
    } else if (opt === "steel-arctic") {
      s = "industrial"; m = modeRef.current; v = "arctic"; metal = "steel";
    } else if (opt === "steel-emerald") {
      s = "industrial"; m = modeRef.current; v = "emerald"; metal = "steel";
    } else {
      // "industrial" → Iron Forge (orange)
      s = "industrial"; m = modeRef.current; v = "orange"; metal = "iron";
    }
    skinRef.current = s;
    modeRef.current = m;
    variantRef.current = v;
    metalRef.current = metal;
    applyIndustrialVariant(v);
    applyPalette(effectivePalette(s, m, v));
    bumpStyleCacheVersion();
    setSkinState(s);
    setModeState(m);
    setVariantState(v);
    setMetalState(metal);
    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEY_SKIN, s),
        AsyncStorage.setItem(STORAGE_KEY, m),
        AsyncStorage.setItem(STORAGE_KEY_VARIANT, v),
        AsyncStorage.setItem(STORAGE_KEY_METAL, metal),
      ]);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(async () => {
    await setMode(modeRef.current === "dark" ? "light" : "dark");
  }, [setMode]);

  // The `colors` exposed here is a snapshot of currentPalette at this render,
  // which forces consumers to re-render when mode/skin changes. The Proxy in
  // theme.ts also reads from currentPalette, so inline usages stay in sync.
  // Derived: which of the 4 picker options is currently active.
  const appearance: AppearanceOption =
    skin === "plain"
      ? mode === "light"
        ? "light"
        : "dark"
      : metalStyle === "steel"
        ? industrialVariant === "pink"
          ? "steel-pink"
          : industrialVariant === "arctic"
            ? "steel-arctic"
            : industrialVariant === "emerald"
              ? "steel-emerald"
              : "steel"
        : industrialVariant === "pink"
          ? "industrial-pink"
          : industrialVariant === "arctic"
            ? "industrial-arctic"
            : industrialVariant === "emerald"
              ? "industrial-emerald"
              : "industrial";

  const value = useMemo<Ctx>(
    () => ({
      mode,
      skin,
      industrialVariant,
      metalStyle,
      appearance,
      colors: { ...currentPalette },
      setMode,
      setSkin,
      setAppearance,
      toggle,
    }),
    [mode, skin, industrialVariant, metalStyle, appearance, setMode, setSkin, setAppearance, toggle],
  );

  // Render the tree only AFTER hydration so the first paint already has the
  // user's saved theme — prevents a one-frame default→saved flash.
  if (!hydrated) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback for screens that render outside the provider (shouldn't happen
    // but keep things safe instead of crashing).
    return {
      mode: "dark" as ThemeMode,
      setMode: async () => {},
      toggle: async () => {},
    };
  }
  return { mode: ctx.mode, setMode: ctx.setMode, toggle: ctx.toggle };
}

/**
 * Returns the active presentation skin + a setter. `skin === "industrial"`
 * means render the textured metal look; `"plain"` means flat cards that honour
 * the light/dark mode. Future skinned screens branch on this.
 */
export function useSkin() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      skin: "industrial" as SkinMode,
      setSkin: async (_s: SkinMode) => {},
      industrialVariant: "orange" as IndustrialVariant,
      metalStyle: "iron" as MetalStyle,
      appearance: "industrial" as AppearanceOption,
      setAppearance: async (_o: AppearanceOption) => {},
    };
  }
  return {
    skin: ctx.skin,
    setSkin: ctx.setSkin,
    industrialVariant: ctx.industrialVariant,
    metalStyle: ctx.metalStyle,
    appearance: ctx.appearance,
    setAppearance: ctx.setAppearance,
  };
}

/**
 * Returns the live color palette. Re-renders the consumer when the theme
 * changes.
 */
export function useColors(): ColorPalette {
  const ctx = useContext(ThemeContext);
  return ctx?.colors || currentPalette;
}

/**
 * Returns a memoised StyleSheet rebuilt whenever the active palette changes.
 *
 * Pass a factory `(c) => ({...style obj literal...})` — the StyleSheet is
 * automatically recreated when the theme flips, so colour references in the
 * factory always reflect the current mode.
 *
 *   const styles = useThemedStyles((c) => ({
 *     container: { backgroundColor: c.bg, padding: 16 },
 *     title:     { color: c.textPrimary, fontSize: 20 },
 *   }));
 */
export function useThemedStyles<T extends Record<string, any>>(
  factory: (c: ColorPalette) => T,
): T {
  const c = useColors();
  return useMemo(
    () => StyleSheet.create(factory(c) as any) as unknown as T,
    [c, factory],
  );
}

/**
 * Module-level themed styles. Use this when you currently have:
 *
 *   const styles = StyleSheet.create({
 *     container: { backgroundColor: theme.colors.bg },
 *   });
 *
 * Replace with:
 *
 *   const styles = themedStyles((c) => ({
 *     container: { backgroundColor: c.bg },
 *   }));
 *
 * Returns a Proxy that lazily evaluates the factory function on every
 * property access — but caches the result per theme version. When the user
 * flips themes, the cache is invalidated automatically (ThemeProvider bumps
 * `styleCacheVersion`) so the very next access returns freshly-themed styles.
 *
 * The returned objects are PLAIN style objects (not StyleSheet IDs), which is
 * slightly less optimal than `StyleSheet.create()` but still highly
 * performant for our scale, and is the only way to keep static `const styles
 * = ...` blocks working with runtime theme switching without refactoring
 * every component.
 */
let styleCacheVersion = 0;

export function bumpStyleCacheVersion() {
  styleCacheVersion += 1;
}

export function themedStyles<T extends Record<string, any>>(
  factory: (c: ColorPalette) => T,
): T {
  let cachedVersion = -1;
  let cached: T | null = null;
  return new Proxy({} as T, {
    get(_, key: string) {
      if (cachedVersion !== styleCacheVersion || cached === null) {
        cached = factory(currentPalette);
        cachedVersion = styleCacheVersion;
      }
      return (cached as any)[key];
    },
    has(_, key: string) {
      if (cachedVersion !== styleCacheVersion || cached === null) {
        cached = factory(currentPalette);
        cachedVersion = styleCacheVersion;
      }
      return key in (cached as any);
    },
    ownKeys() {
      if (cachedVersion !== styleCacheVersion || cached === null) {
        cached = factory(currentPalette);
        cachedVersion = styleCacheVersion;
      }
      return Object.keys(cached as any);
    },
    getOwnPropertyDescriptor(_, key: string) {
      if (cachedVersion !== styleCacheVersion || cached === null) {
        cached = factory(currentPalette);
        cachedVersion = styleCacheVersion;
      }
      return {
        enumerable: true,
        configurable: true,
        value: (cached as any)[key],
      };
    },
  }) as T;
}
