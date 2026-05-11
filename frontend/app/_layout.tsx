import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  View,
  ActivityIndicator,
  Text as RNText,
  TextInput as RNTextInput,
} from "react-native";
import { useEffect } from "react";
import { AuroraBackground } from "../src/Aurora";
import { BottomBar } from "../src/BottomBar";
import { ReportsFab } from "../src/ReportsFab";
import { AuthProvider, useAuth } from "../src/AuthContext";
import { ResponsiveContainer } from "../src/ResponsiveContainer";
import { NetworkProvider, OfflineBanner } from "../src/NetworkProvider";
import { theme } from "../src/theme";
import { initRevenueCat, identifyRevenueCatUser } from "../src/revenuecat";
import { setPaymentRequiredHandler } from "../src/api";

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

  useEffect(() => {
    if (loading) return;
    const first = segments[0];
    const publicRoute = first === "login" || first === "forgot-password";
    if (!user && !publicRoute) {
      router.replace("/login");
    } else if (user && publicRoute) {
      router.replace("/");
    }
  }, [user, loading, segments, router]);

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
