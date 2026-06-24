import { Stack, useRouter, useSegments } from "expo-router";
import { ThemeProvider as NavThemeProvider, DefaultTheme as NavDefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  View,
  ActivityIndicator,
  Text as RNText,
  TextInput as RNTextInput,
  AppState,
  AppStateStatus,
  InteractionManager,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { AuroraBackground } from "../src/Aurora";
import { BottomBar } from "../src/BottomBar";
import { ReportsFab } from "../src/ReportsFab";
import { ReviewPrompt } from "../src/ReviewPrompt";
import { AuthProvider, useAuth } from "../src/AuthContext";
import { BiometricLockGate } from "../src/BiometricLockGate";
import { ResponsiveContainer } from "../src/ResponsiveContainer";
import { AppBackground } from "../src/AppBackground";
import { NetworkProvider, OfflineBanner } from "../src/NetworkProvider";
import { theme } from "../src/theme";
import { initRevenueCat, identifyRevenueCatUser, getCurrentCustomerInfo, buildSyncPayload } from "../src/revenuecat";
import { setPaymentRequiredHandler, api, abortAllInFlight } from "../src/api";
import { shouldShowIntro, markAppActive, getIntroVideoEnabledAsync } from "../src/idle";
import { IntroOverlay } from "../src/IntroOverlay";
import { ThemeProvider, useColors, useThemeMode } from "../src/themeContext";
import { IndustrialThemeProvider } from "../src/components/industrial";
import { notifyAppResume } from "../src/appLifecycle";
import { preloadTbvSkins } from "../src/tbv/useTbvSkins";
import { useTbvFonts } from "../src/tbv/useTbvFonts";

// Transparent navigator theme so the global AppBackground photo shows through
// the screen scenes on dark themes. (React Navigation defaults its scene
// background to solid white, which otherwise covers the photo in the centre
// content column.) Light-theme screens paint their own solid background on top,
// so they're unaffected.
const navTheme = {
  ...NavDefaultTheme,
  colors: { ...NavDefaultTheme.colors, background: "transparent", card: "transparent" },
};

/**
 * Make native (iOS Expo Go / TestFlight) layouts visually match the web
 * preview rendering.
 *
 *  1. Disable iOS Dynamic Type so a user's accessibility "larger text"
 *     setting cannot inflate every font size and break tight tab/header
 *     layouts.
 *  2. On iOS / Android only, monkey-patch `StyleSheet.create` so every
 *     style with a numeric `fontSize` gets multiplied by NATIVE_FONT_SCALE
 *     at registration time. This is bulletproof — every screen's styles
 *     get scaled regardless of how Text is wrapped — and runs exactly once
 *     per stylesheet.
 */
/**
 * Disable iOS Dynamic Type globally so a user's accessibility "larger
 * text" setting can't blow up tight tab/header layouts. This is the only
 * font-related root tweak we apply globally — per-screen sizing is tuned
 * directly in each StyleSheet.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TextAny = RNText as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TextInputAny = RNTextInput as any;

TextAny.defaultProps = TextAny.defaultProps || {};
TextAny.defaultProps.allowFontScaling = false;
TextAny.defaultProps.maxFontSizeMultiplier = 1;
TextInputAny.defaultProps = TextInputAny.defaultProps || {};
TextInputAny.defaultProps.allowFontScaling = false;
TextInputAny.defaultProps.maxFontSizeMultiplier = 1;

// ── INTRO VIDEO TOGGLE ───────────────────────────────────────────────
// Re-enabled for production: plays the brand splash video on cold boot
// and on 5-min-idle resume. Flip to `false` to mute during dev/screenshots.
const INTRO_ENABLED = true;

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const introBootCheckedRef = useRef(false);
  const lastAppStateRef = useRef<AppStateStatus>("active");
  // showIntro renders the IntroOverlay on top of the app. Initialised
  // to TRUE so the splash plays on every cold boot — and only on cold
  // boot, because component state resets on kill. After the overlay's
  // video finishes we set this to false and the app reveals itself.
  // Foreground/background cycles don't trigger it unless the JS VM was
  // actually torn down.
  const [showIntro, setShowIntro] = useState(INTRO_ENABLED);
  const [bootDecided] = useState(true);
  // When logged-out, learn whether the DB is empty so we can route to the
  // "Fresh Install Detected" bootstrap screen instead of login.
  const [bootstrapFresh, setBootstrapFresh] = useState<boolean | null>(null);

  // Warm the industrial image-skin cache shortly AFTER first mount so it
  // never competes with the boot intro video for the JS thread (decoding the
  // PNGs up-front was delaying the video's first frame). InteractionManager
  // lets the intro start playing first; the skins then decode during it, so
  // login / forgot-password still appear fully-decorated with no pop-in.
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      preloadTbvSkins();
    });
    return () => handle.cancel();
  }, []);

  // Respect the user's "intro video" preference (Vault → Settings). The
  // cold-boot intro is initialised ON; if the user turned it off, disable
  // it before the overlay renders (the auth-loading gate gives us time).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const on = await getIntroVideoEnabledAsync();
      if (!cancelled && !on) setShowIntro(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // (No async shouldShowIntro check here anymore — the intro just runs
  // whenever this component first mounts.)

  // When the app comes back to the foreground after being away for
  // 5+ minutes, replay the intro. We use AppState rather than a timer
  // so we catch suspend/resume cycles correctly on iOS.
  //
  // ALSO: on EVERY background→active transition (regardless of duration),
  // abort any in-flight fetch() and broadcast an "app resumed" event.
  // This kills iOS-suspended sockets that were hanging the Inventory /
  // Dealers loading spinners after the app was backgrounded mid-request.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      const wasBackground =
        lastAppStateRef.current === "background" ||
        lastAppStateRef.current === "inactive";
      lastAppStateRef.current = next;
      if (next === "active" && wasBackground) {
        // 1) Yank every pending fetch immediately so screens stop showing
        //    a forever-spinning loader. The screens' load() functions
        //    swallow AbortError gracefully (cache fallback).
        abortAllInFlight("app-resumed");
        // 2) Tell the top screens (Inventory / Dealers / Home) to refetch
        //    on a fresh socket so the user sees current data right away.
        //    Listeners are registered via useAppResume(load).
        notifyAppResume();
        // 3) 5-minute idle intro replay (existing behaviour).
        (async () => {
          const show = await shouldShowIntro();
          if (INTRO_ENABLED && show) setShowIntro(true);
        })();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  // Auth routing — public vs private routes. Skip while the intro is
  // showing or while we're still resolving cold-boot state.
  // When logged-out and not loading, check whether the DB is fresh (empty).
  useEffect(() => {
    if (loading || user) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await api.bootstrapStatus();
        if (!cancelled) setBootstrapFresh(s.fresh);
      } catch {
        if (!cancelled) setBootstrapFresh(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, loading]);

  useEffect(() => {
    if (loading) return;
    if (showIntro) return;
    if (!bootDecided) return;
    const first = segments[0];
    const publicRoute =
      first === "login" || first === "forgot-password" || first === "bootstrap";
    if (!user) {
      // Empty DB → send to the "Fresh Install Detected" restore screen.
      if (bootstrapFresh === true && first !== "bootstrap") {
        router.replace("/bootstrap");
      } else if (!publicRoute) {
        router.replace("/login");
      }
    } else if (user && publicRoute) {
      router.replace("/");
    }
  }, [user, loading, segments, router, showIntro, bootDecided, bootstrapFresh]);

  const handleIntroDone = () => {
    markAppActive();
    setShowIntro(false);
  };

  // While we're still figuring out whether to play the intro, just
  // show a black canvas — no spinner, no chrome. This avoids the
  // "frozen loading wheel" effect that the user previously saw.
  if (!bootDecided) {
    return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  }

  // Auth still resolving on cold launch — small spinner. This only
  // ever fires at the very start of the session (before children mount
  // for the first time), so an early return here is safe and won't
  // cause the Stack to unmount mid-session.
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.bg }}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </View>
    );
  }

  // Render the IntroOverlay on top of the regular tree as an OVERLAY so
  // the navigation stack stays mounted. If we returned <IntroOverlay/>
  // alone here (early return) the entire Stack would unmount and remount
  // when the intro finished — that's what was sending users back to the
  // Home tab every time the 5-min idle splash replayed after backgrounding.
  // Now the user lands back on whatever screen they were viewing.
  return (
    <>
      {children}
      {showIntro && (
        <View
          pointerEvents="auto"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#000",
            zIndex: 10000,
          }}
        >
          <IntroOverlay onDone={handleIntroDone} />
        </View>
      )}
    </>
  );
}

function ShellNav() {
  const { user } = useAuth();
  const router = useRouter();
  const c = useColors();
  const showShell = !!user;
  // Load the whole industrial font stack ONCE at the root and gate the screen
  // stack on it. Without this, the dashboard (the first screen) could mount on
  // a cold start before BebasNeue/Rajdhani were registered and paint with a
  // larger fallback system font (oversized labels / truncated dealer names),
  // only self-correcting on a remount (navigate away + back). Gating here means
  // every screen's first paint already has the fonts available.
  const tbvFontsReady = useTbvFonts();

  // Even after expo-font reports the families are loaded, iOS can render the
  // FIRST text node that uses a freshly-registered custom font at a given size
  // with fallback metrics for one frame (the symptom: the dashboard NET WORTH
  // numbers look wrong on cold start, then correct themselves after navigating
  // away and back). To prevent that, once fonts are ready we render an
  // invisible "warmer" for one paint cycle — which forces the glyph atlas to
  // build — and only THEN reveal the app.
  const [fontsWarm, setFontsWarm] = useState(false);
  useEffect(() => {
    if (tbvFontsReady && !fontsWarm) {
      const id = setTimeout(() => setFontsWarm(true), 50);
      return () => clearTimeout(id);
    }
  }, [tbvFontsReady, fontsWarm]);

  // Register the 402 (payment required) interceptor exactly once.
  // When the backend rejects a write because the user hit the free
  // tier limit, we automatically navigate to the paywall.
  useEffect(() => {
    setPaymentRequiredHandler(() => {
      try { router.push("/paywall"); } catch { /* navigation not ready */ }
    });
  }, [router]);

  // Initialize the RevenueCat SDK once after we know who the user is.
  // On Expo Go / web this is a no-op (stub mode). On native dev/prod
  // builds it configures the SDK and identifies the user so future
  // purchases tie back to this account.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        await initRevenueCat(user.id);
        if (cancelled) return;
        await identifyRevenueCatUser(user.id);
        if (cancelled) return;
        // After identify, pull the user's current entitlements from RC
        // and push them to our backend. This unlocks PRO on app boot if
        // they've already purchased (even from another device, or if a
        // previous sync was lost). No-op in stub mode.
        const info = await getCurrentCustomerInfo();
        const payload = buildSyncPayload(info);
        if (payload) {
          try {
            await api.post("/subscription/sync", payload);
          } catch (e) {
            console.warn("[RC] boot sync failed", e);
          }
        }
      } catch (e) {
        console.warn("[RC] init failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Hold the screen stack until the font stack is ready so no screen's first
  // paint uses a fallback system font. The boot intro overlay (in AuthGate)
  // covers this on cold start, so it's invisible to the user.
  if (!tbvFontsReady || !fontsWarm) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.accent} />
        {/* Invisible warmer: lays out every custom font (including the large
            numeric sizes used by the dashboard stat tiles) so the glyph atlas
            is built before any real screen paints. */}
        {tbvFontsReady && (
          <View style={{ position: "absolute", opacity: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <RNText style={{ fontFamily: "BebasNeue_400Regular", fontSize: 40 }}>0123456789 $.,</RNText>
            <RNText style={{ fontFamily: "BebasNeue_400Regular", fontSize: 14 }}>0123456789 $.,</RNText>
            <RNText style={{ fontFamily: "Rajdhani_700Bold", fontSize: 24 }}>0123456789 $.,</RNText>
            <RNText style={{ fontFamily: "Rajdhani_600SemiBold", fontSize: 18 }}>0123456789 $.,</RNText>
            <RNText style={{ fontFamily: "Rajdhani_500Medium", fontSize: 14 }}>0123456789</RNText>
            <RNText style={{ fontFamily: "Exo2_500Medium", fontSize: 12 }}>0123456789</RNText>
            <RNText style={{ fontFamily: "Exo2_400Regular", fontSize: 11 }}>0123456789</RNText>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* PERMANENT invisible font warmer. Some dashboard sections (dealer
          accounts, stat tiles) render only AFTER their API data arrives — a
          moment after the screen first paints. On iOS the first text node that
          uses a given font family+size can render with a fallback for one frame
          and then stay wrong until a remount. Keeping this off-screen warmer
          mounted for the whole session pre-registers every family at every size
          the app uses, so those late sections never fall back. */}
      <View style={{ position: "absolute", left: -9999, top: -9999, opacity: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {["BebasNeue_400Regular", "Rajdhani_700Bold", "Rajdhani_600SemiBold", "Rajdhani_500Medium", "Exo2_700Bold", "Exo2_500Medium", "Exo2_400Regular"].map((fam) =>
          [9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40].map((sz) => (
            <RNText key={`${fam}-${sz}`} style={{ fontFamily: fam, fontSize: sz }}>0123456789$.,ABC</RNText>
          ))
        )}
      </View>
      {/* Global FULL-BLEED industrial backdrop — uses the exact same
          ImageBackground + resizeMode="cover" + veil as the skinned Home
          screen, at the OUTERMOST level, so the photo is scaled/contained
          identically on every page. Non-light themes only; nothing in light. */}
      <AppBackground />
      <OfflineBanner />
      <View style={{ flex: 1 }}>
        <ResponsiveContainer variant="wide">
          <NavThemeProvider value={navTheme}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: c.canvas },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="login" options={{ animation: "none" }} />
            <Stack.Screen name="bootstrap" options={{ animation: "fade", gestureEnabled: false }} />
            <Stack.Screen name="intro" options={{ animation: "fade", headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="tool/[id]" />
            <Stack.Screen name="tool/edit" />
            <Stack.Screen name="bundle/index" />
            <Stack.Screen name="bundle/[id]" />
            <Stack.Screen name="bundle/edit" />
            <Stack.Screen name="paywall" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
            {/* In-app PDF preview — renders its OWN themed header inside the
                screen, so the native nav header stays hidden. */}
            <Stack.Screen
              name="pdf-viewer"
              options={{
                headerShown: false,
                animation: "slide_from_right",
                presentation: "card",
              }}
            />
          </Stack>
          </NavThemeProvider>
        </ResponsiveContainer>
        {showShell && <ReportsFab />}
      </View>
      {showShell && <BottomBar />}
      {showShell && <ReviewPrompt />}
    </View>
  );
}

// Theme-aware status bar. Reads the live theme mode from context so it
// flips between "light" (white text — used on dark bg) and "dark" (black
// text — used on light bg) at the moment the user toggles themes.
function ThemedStatusBar() {
  const { mode } = useThemeMode();
  return <StatusBar style={mode === "light" ? "dark" : "light"} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {/* SafeAreaProvider MUST wrap everything that uses <SafeAreaView> or
          useSafeAreaInsets — without it, both fall back to 0 insets on
          iOS which makes top-bars and back buttons render UNDER the
          status bar / Dynamic Island / notch. (Symptom: "screens extend
          above my phone's clock so I can't tap back".) */}
      <SafeAreaProvider>
        <KeyboardProvider>
        <ThemeProvider>
          <IndustrialThemeProvider>
            <ThemedStatusBar />
            <AuthProvider>
              <NetworkProvider>
                <AuroraBackground>
                  <AuthGate>
                    <BiometricLockGate>
                      <ShellNav />
                    </BiometricLockGate>
                  </AuthGate>
                </AuroraBackground>
              </NetworkProvider>
            </AuthProvider>
          </IndustrialThemeProvider>
        </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
