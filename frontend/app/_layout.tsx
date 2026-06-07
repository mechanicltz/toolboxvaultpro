import { Stack, useRouter, useSegments } from "expo-router";
import { ThemeProvider as NavThemeProvider, DefaultTheme as NavDefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
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
import { AuthProvider, useAuth } from "../src/AuthContext";
import { BiometricLockGate } from "../src/BiometricLockGate";
import { ResponsiveContainer } from "../src/ResponsiveContainer";
import { AppBackground } from "../src/AppBackground";
import { NetworkProvider, OfflineBanner } from "../src/NetworkProvider";
import { theme } from "../src/theme";
import { initRevenueCat, identifyRevenueCatUser, getCurrentCustomerInfo, buildSyncPayload } from "../src/revenuecat";
import { setPaymentRequiredHandler, api, abortAllInFlight } from "../src/api";
import { shouldShowIntro, markAppActive } from "../src/idle";
import { IntroOverlay } from "../src/IntroOverlay";
import { ThemeProvider, useColors, useThemeMode } from "../src/themeContext";
import { IndustrialThemeProvider } from "../src/components/industrial";
import { notifyAppResume } from "../src/appLifecycle";
import { preloadTbvSkins } from "../src/tbv/useTbvSkins";

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
// Temporarily disabled so the brand splash video doesn't gate the screen
// during development/screenshots. Flip back to `true` to re-enable the
// cold-boot + 5-min-idle intro exactly as before. (Nothing else changed.)
const INTRO_ENABLED = false;

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

  return (
    <View style={{ flex: 1 }}>
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
            <Stack.Screen name="paywall" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
            {/* In-app PDF preview — header gets configured by the screen
                itself (sets title + Share button on the right). */}
            <Stack.Screen
              name="pdf-viewer"
              options={{
                headerShown: true,
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
