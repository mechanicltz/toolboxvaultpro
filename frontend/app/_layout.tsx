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
 *  2. On iOS / Android only, monkey-patch the Text component's render
 *     so every Text gets its fontSize multiplied by NATIVE_FONT_SCALE.
 *     We chose 0.88 because RN-iOS's default SF rendering looks ~12%
 *     bigger than the same fontSize on RN-web at the same logical
 *     viewport — bringing them visually in line.
 */
const NATIVE_FONT_SCALE = Platform.select({ ios: 0.84, android: 0.88, default: 1 }) as number;

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

// Monkey-patch render so every Text on native gets its fontSize scaled.
// (Web is left untouched — its rendering is the target we're matching.)
if (Platform.OS !== "web" && NATIVE_FONT_SCALE !== 1 && !TextAny.__tv_patched__) {
  TextAny.__tv_patched__ = true;
  const origRender = TextAny.render;
  if (typeof origRender === "function") {
    TextAny.render = function patchedTextRender(props: any, ref: any) {
      let nextProps = props;
      if (props && props.style) {
        const flat = StyleSheet.flatten(props.style);
        if (flat && typeof flat.fontSize === "number") {
          const scaled = Math.round(flat.fontSize * NATIVE_FONT_SCALE);
          nextProps = {
            ...props,
            style: [props.style, { fontSize: scaled }],
          };
        }
      }
      return origRender.call(this, nextProps, ref);
    };
  }
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
