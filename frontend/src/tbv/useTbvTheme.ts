/**
 * useTbvTheme — the bridge between the app's existing ThemeProvider
 * (src/themeContext) and the Toolbox Vault skin system. Reads the current
 * mode (driven by the MORE → theme toggle) and returns the matching tokens
 * + a skin resolver. Components call this; screens don't touch assets.
 */
import { ImageSourcePropType } from "react-native";
import { useThemeMode } from "../themeContext";
import { TBV_TOKENS, TbvTokens } from "./tokens";
import { SKINS, SkinName, StretchMode } from "./registry";

export function useTbvTheme() {
  const { mode } = useThemeMode();
  const isDark = mode !== "light";
  const key = isDark ? "dark" : "light";
  const t: TbvTokens = TBV_TOKENS[key];
  const skin = (name: SkinName): ImageSourcePropType => SKINS[name][key];
  const padOf = (name: SkinName): number => SKINS[name].pad ?? 16;
  const stretchOf = (name: SkinName): StretchMode => SKINS[name].stretch;
  return { mode, isDark, t, skin, padOf, stretchOf };
}
