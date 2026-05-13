import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  View,
  ActivityIndicator,
  Text as RNText,
  TextInput as RNTextInput,
  AppState,
  AppStateStatus,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { AuroraBackground } from "../src/Aurora";
import { BottomBar } from "../src/BottomBar";
import { ReportsFab } from "../src/ReportsFab";
import { AuthProvider, useAuth } from "../src/AuthContext";
import { ResponsiveContainer } from "../src/ResponsiveContainer";
import { NetworkProvider, OfflineBanner } from "../src/NetworkProvider";
import { theme } from "../src/theme";
import { initRevenueCat, identifyRevenueCatUser, getCurrentCustomerInfo, buildSyncPayload } from "../src/revenuecat";
import { setPaymentRequiredHandler, api } from "../src/api";
import { shouldShowIntro, markAppActive } from "../src/idle";

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

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const introBootCheckedRef = useRef(false);
  const lastAppStateRef = useRef<AppStateStatus>("active");
  // Local state — once we've decided whether to show the intro splash,
  // we can render children. Until then we keep a totally black canvas
  // up so the user never sees a stray loading spinner before the
  // animation kicks off.
  const [bootDecided, setBootDecided] = useState(false);
  const [routeToIntroOnBoot, setRouteToIntroOnBoot] = useState(false);

  // On cold boot, decide whether to show the intro splash. Runs exactly
  // once per app launch. We do this BEFORE letting AuthGate render its
  // normal contents to avoid flashing the auth spinner on a black
  // background (which looked like the app was frozen).
  useEffect(() => {
    if (introBootCheckedRef.current) return;
    introBootCheckedRef.current = true;
    (async () => {
      const show = await shouldShowIntro();
      if (show) {
        setRouteToIntroOnBoot(true);
        // Defer router.replace until after the children mount so the
        // Stack is alive to receive the navigation.
        setTimeout(() => router.replace("/intro"), 0);
      } else {
        markAppActive();
      }
      setBootDecided(true);
    })();
  }, [router]);

  // When the app comes back to the foreground after being away for
  // 5+ minutes, replay the intro. We use AppState rather than a timer
  // so we catch suspend/resume cycles correctly on iOS.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      const wasBackground =
        lastAppStateRef.current === "background" ||
        lastAppStateRef.current === "inactive";
      lastAppStateRef.current = next;
      if (next === "active" && wasBackground) {
        (async () => {
          const show = await shouldShowIntro();
          if (show) router.replace("/intro");
        })();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (loading) return;
    const first = segments[0];
    if (first === "intro") return; // intro routes itself when done
    const publicRoute = first === "login" || first === "forgot-password";
    if (!user && !publicRoute) {
      router.replace("/login");
    } else if (user && publicRoute) {
      router.replace("/");
    }
  }, [user, loading, segments, router]);

  // While we're still figuring out whether to play the intro, just
  // show a black canvas — no spinner, no chrome. This avoids the
  // "frozen loading wheel" effect users were seeing.
  if (!bootDecided) {
    return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  }

  // If we're on the intro route, render children directly (the intro
  // screen itself is full-black and self-contained).
  if (segments[0] === "intro" || routeToIntroOnBoot) {
    return <>{children}</>;
  }

  // Outside of intro: if the auth state is still resolving, show a
  // small spinner on the app's standard dark background.
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.bg }}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </View>
    );
  }
  return <>{children}</>;
}

function ShellNav() {
  const { user } = useAuth();
  const router = useRouter();
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
      <OfflineBanner />
      <View style={{ flex: 1 }}>
        <ResponsiveContainer variant="wide">
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "transparent" },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="login" options={{ animation: "fade" }} />
            <Stack.Screen name="intro" options={{ animation: "fade", headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="tool/[id]" />
            <Stack.Screen name="tool/edit" />
            <Stack.Screen name="paywall" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
          </Stack>
        </ResponsiveContainer>
        {showShell && <ReportsFab />}
      </View>
      {showShell && <BottomBar />}
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0A0A0A" }}>
      <StatusBar style="light" />
      <AuthProvider>
        <NetworkProvider>
          <AuroraBackground>
            <AuthGate>
              <ShellNav />
            </AuthGate>
          </AuroraBackground>
        </NetworkProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
