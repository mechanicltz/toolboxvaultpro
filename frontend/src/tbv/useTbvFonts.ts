/**
 * useTbvFonts — loads the industrial font stack used across the whole app.
 * Screens gate their first paint on this (true once loaded OR errored) so the
 * layout never runs with the system font (see TBV_LOGIN_BUILD_NOTES.md).
 */
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

export function useTbvFonts(): boolean {
  const [loaded, error] = useGoogleFonts({
    BebasNeue_400Regular,
    Rajdhani_500Medium, Rajdhani_600SemiBold, Rajdhani_700Bold,
    Exo2_400Regular, Exo2_500Medium, Exo2_700Bold,
  });
  return loaded || !!error;
}

/** Canonical font-family names — use these instead of raw strings. */
export const TBV_FONT = {
  head: "BebasNeue_400Regular",   // headers, labels (condensed industrial)
  label: "Rajdhani_700Bold",      // strong values
  body: "Rajdhani_600SemiBold",   // body / names
  bodyMed: "Rajdhani_500Medium",
  small: "Exo2_500Medium",        // fine print
  smallReg: "Exo2_400Regular",
};
