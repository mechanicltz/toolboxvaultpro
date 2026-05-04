import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  View,
  ActivityIndicator,
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  Platform,
} from "react-native";
import { useEffect } from "react";
import { AuroraBackground } from "../src/Aurora";
import { BottomBar } from "../src/BottomBar";
import { ReportsFab } from "../src/ReportsFab";
import { AuthProvider, useAuth } from "../src/AuthContext";
import { ResponsiveContainer } from "../src/ResponsiveContainer";
import { NetworkProvider, OfflineBanner } from "../src/NetworkProvider";
import { theme } from "../src/theme";

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
const NATIVE_FONT_SCALE = Platform.select({ ios: 0.78, android: 0.82, default: 1 }) as number;

// Disable iOS auto font scaling globally — must be set before any Text renders.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const StyleSheetAny = StyleSheet as any;
if (
  Platform.OS !== "web" &&
  NATIVE_FONT_SCALE !== 1 &&
  !StyleSheetAny.__tv_create_patched__
) {
  StyleSheetAny.__tv_create_patched__ = true;
  const origCreate = StyleSheet.create.bind(StyleSheet);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (StyleSheet as any).create = (styles: any) => {
    const next: any = {};
    for (const key of Object.keys(styles || {})) {
      const s = styles[key];
      if (s && typeof s === "object") {
        const scaled: any = { ...s };
        if (typeof s.fontSize === "number") {
          scaled.fontSize = Math.max(1, Math.round(s.fontSize * NATIVE_FONT_SCALE));
        }
        if (typeof s.lineHeight === "number") {
          scaled.lineHeight = Math.max(
            1,
            Math.round(s.lineHeight * NATIVE_FONT_SCALE),
          );
        }
        next[key] = scaled;
      } else {
        next[key] = s;
      }
    }
    return origCreate(next);
  };
}

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
  const showShell = !!user;
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
