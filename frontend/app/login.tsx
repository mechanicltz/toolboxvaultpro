// =============================================================================
// login.tsx — Toolbox Vault Login (Phase 5 of Part 6 migration)
// -----------------------------------------------------------------------------
// Uses ONLY official Toolbox Vault assets:
//   • tbv_background_dark.jpg / tbv_background_light.jpg  → page background
//   • tbv_master_logo_dark_v2.png / tbv_master_logo_light.png → top logo
//   • tbv_wordmark_dark.png / tbv_wordmark_light.png → wordmark beneath logo
//   • Everything else (form, buttons, tabs) is pure React Native code
//     per Part 6 Rule #2-4 (no image-based buttons/cards).
// =============================================================================

import { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ImageBackground,
  Image,
  Pressable,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFonts as useGoogleFonts } from "@expo-google-fonts/bebas-neue";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import {
  Rajdhani_500Medium,
  Rajdhani_600SemiBold,
  Rajdhani_700Bold,
} from "@expo-google-fonts/rajdhani";
import {
  Exo_2_400Regular as Exo2_400Regular,
  Exo_2_500Medium as Exo2_500Medium,
  Exo_2_700Bold as Exo2_700Bold,
} from "@expo-google-fonts/exo-2";
import { useAuth } from "../src/AuthContext";
import {
  getBiometricStatus,
  tryBiometricLogin,
  enableBiometric,
  hasBeenPromptedForBiometric,
  markBiometricPrompted,
} from "../src/biometric";
import {
  IndustrialButton,
  IndustrialInput,
  IndustrialCard,
  PasswordEyeToggle,
  TBVText,
  useTBV,
  useBackground,
  useMasterLogo,
  useWordmark,
} from "../src/components/industrial";

export default function LoginScreen() {
  const router = useRouter();
  const { login, register } = useAuth();
  const { width: screenW } = useWindowDimensions();
  const { palette, resolvedMode, spacing } = useTBV();
  const bg = useBackground();
  const logo = useMasterLogo();
  const wordmark = useWordmark();

  const [fontsLoaded] = useGoogleFonts({
    BebasNeue_400Regular,
    Rajdhani_500Medium,
    Rajdhani_600SemiBold,
    Rajdhani_700Bold,
    Exo2_400Regular,
    Exo2_500Medium,
    Exo2_700Bold,
  });

  const [mode_, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const [bio, setBio] = useState<{
    enabled: boolean;
    label: string;
    hasHardware: boolean;
    isEnrolled: boolean;
  } | null>(null);
  const autoPromptedRef = useRef(false);

  // Responsive logo sizing — premium nameplate proportions.
  const logoWidth = Math.min(screenW * 0.55, 280);
  const logoHeight = logoWidth * 0.66;
  const wordmarkWidth = Math.min(screenW * 0.5, 240);

  useEffect(() => {
    (async () => {
      const s = await getBiometricStatus();
      setBio({
        enabled: s.enabled,
        label: s.label,
        hasHardware: s.hasHardware,
        isEnrolled: s.isEnrolled,
      });
      if (s.enabled && s.hasHardware && s.isEnrolled && !autoPromptedRef.current) {
        autoPromptedRef.current = true;
        await runBiometricLogin();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runBiometricLogin = async () => {
    if (busy) return;
    setErr("");
    setInfo("");
    const creds = await tryBiometricLogin();
    if (!creds) return;
    setBusy(true);
    try {
      await login(creds.email, creds.password);
    } catch {
      setErr("Saved credentials didn't work. Please sign in with your password to refresh them.");
    } finally {
      setBusy(false);
    }
  };

  const maybeOfferBiometricEnrol = async (mail: string, pw: string) => {
    if (Platform.OS === "web") return;
    try {
      const s = await getBiometricStatus();
      if (!s.hasHardware || !s.isEnrolled) return;
      if (s.enabled) return;
      const asked = await hasBeenPromptedForBiometric();
      if (asked) return;
      setTimeout(() => {
        Alert.alert(
          `Enable ${s.label}?`,
          `Sign in to Toolbox Vault with ${s.label} from now on — no need to type your password.`,
          [
            { text: "Not now", style: "cancel", onPress: () => markBiometricPrompted() },
            {
              text: `Enable ${s.label}`,
              onPress: async () => {
                try { await enableBiometric(mail, pw); } catch { /* ignore */ }
              },
            },
          ],
        );
      }, 700);
    } catch { /* ignore */ }
  };

  const submit = async () => {
    if (busy) return;
    setErr("");
    setInfo("");
    if (!email.trim()) return setErr("Email is required");
    if (!password) return setErr("Password is required");
    if (mode_ === "register" && password.length < 6)
      return setErr("Password must be at least 6 characters");
    setBusy(true);
    try {
      if (mode_ === "register") await register(email, password, name);
      else await login(email, password);
      await maybeOfferBiometricEnrol(email, password);
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // Tab styling for SIGN IN / CREATE ACCOUNT — pure code
  const renderTab = (key: "login" | "register", label: string, icon: keyof typeof Ionicons.glyphMap) => {
    const active = mode_ === key;
    return (
      <Pressable
        key={key}
        onPress={() => setMode(key)}
        style={[
          styles.tab,
          {
            backgroundColor: active ? palette.accent : "transparent",
            borderColor: active ? palette.accent : palette.border,
          },
        ]}
        testID={`tab-${key}`}
      >
        <Ionicons name={icon} size={14} color={active ? palette.textInverse : palette.textMuted} />
        <TBVText
          variant="buttonSm"
          color={active ? palette.textInverse : palette.textMuted}
        >
          {label}
        </TBVText>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      {bg ? (
        <ImageBackground source={bg} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      {/* Subtle darkening so card content stays legible on the textured bg */}
      <View
        pointerEvents="none"
        style={[
          styles.bgVignette,
          { backgroundColor: resolvedMode === "light" ? "rgba(236,236,236,0.20)" : "rgba(5,5,5,0.30)" },
        ]}
      />

      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingHorizontal: spacing.xl }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ============== MASTER LOGO ============== */}
            {logo ? (
              <Image
                source={logo}
                style={{
                  width: logoWidth,
                  height: logoHeight,
                  alignSelf: "center",
                  marginTop: spacing.lg,
                }}
                resizeMode="contain"
              />
            ) : null}

            {/* ============== WORDMARK ============== */}
            {wordmark ? (
              <Image
                source={wordmark}
                style={{
                  width: wordmarkWidth,
                  height: wordmarkWidth * 0.22,
                  alignSelf: "center",
                  marginTop: spacing.sm,
                }}
                resizeMode="contain"
              />
            ) : null}

            {/* ============== SUBTITLE ============== */}
            <View style={[styles.subRow, { marginTop: spacing.sm }]}>
              {["INVENTORY", "DEALERS", "WARRANTIES", "REPORTS"].map((w, i) => (
                <View key={w} style={styles.subItem}>
                  <TBVText variant="labelSmall" color={palette.text}>{w}</TBVText>
                  {i < 3 && <View style={[styles.subDot, { backgroundColor: palette.accent }]} />}
                </View>
              ))}
            </View>

            {/* ============== AUTH CARD ============== */}
            <IndustrialCard
              elevation="elevated"
              padding={spacing.xl}
              style={{ marginTop: spacing.xl, gap: spacing.md }}
            >
              {/* Tabs */}
              <View style={[styles.tabsRow, { gap: spacing.sm }]}>
                {renderTab("login", "SIGN IN", "person")}
                {renderTab("register", "CREATE ACCOUNT", "person-add")}
              </View>

              {/* Error / info banner */}
              {!!err && (
                <View style={[styles.banner, { backgroundColor: "rgba(220,53,69,0.18)", borderColor: palette.danger }]}>
                  <Ionicons name="alert-circle" size={16} color={palette.danger} />
                  <TBVText variant="bodySmall" color={palette.danger} style={{ flex: 1 }}>{err}</TBVText>
                </View>
              )}
              {!!info && !err && (
                <View style={[styles.banner, { backgroundColor: "rgba(46,160,67,0.18)", borderColor: palette.success }]}>
                  <Ionicons name="checkmark-circle" size={16} color={palette.success} />
                  <TBVText variant="bodySmall" color={palette.success} style={{ flex: 1 }}>{info}</TBVText>
                </View>
              )}

              {mode_ === "register" && (
                <IndustrialInput
                  label="FULL NAME"
                  leftIcon="person-outline"
                  placeholder="Enter your name"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  testID="auth-name"
                />
              )}

              <IndustrialInput
                label="EMAIL"
                leftIcon="mail-outline"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                testID="auth-email"
              />

              <IndustrialInput
                label="PASSWORD"
                leftIcon="lock-closed-outline"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                testID="auth-password"
                rightAccessory={
                  <PasswordEyeToggle visible={showPassword} onToggle={() => setShowPassword((s) => !s)} />
                }
              />

              <IndustrialButton
                label={mode_ === "register" ? "CREATE ACCOUNT" : "SIGN IN"}
                icon="lock-closed"
                onPress={submit}
                loading={busy}
                size="lg"
                testID="auth-submit"
                style={{ marginTop: spacing.xs }}
              />

              {mode_ === "login" && (
                <View style={[styles.forgotRow, { marginTop: spacing.sm }]}>
                  <View style={[styles.forgotLine, { backgroundColor: palette.accent }]} />
                  <TouchableOpacity
                    onPress={() => router.push("/forgot-password")}
                    activeOpacity={0.6}
                    testID="forgot-password-link"
                  >
                    <TBVText variant="button" color={palette.accent}>FORGOT PASSWORD?</TBVText>
                  </TouchableOpacity>
                  <View style={[styles.forgotLine, { backgroundColor: palette.accent }]} />
                </View>
              )}

              {mode_ === "login" &&
                bio?.enabled &&
                bio.hasHardware &&
                bio.isEnrolled && (
                  <IndustrialButton
                    label={`SIGN IN WITH ${bio.label.toUpperCase()}`}
                    icon={
                      bio.label.toLowerCase().includes("face") ? "scan" :
                      bio.label.toLowerCase().includes("touch") ||
                      bio.label.toLowerCase().includes("finger") ? "finger-print" : "lock-closed"
                    }
                    variant="ghost"
                    onPress={runBiometricLogin}
                    disabled={busy}
                    testID="auth-biometric"
                  />
                )}

              {mode_ === "login" && (
                <View style={[styles.footerNotice, {
                  backgroundColor: palette.accentSoft,
                  borderColor: palette.border,
                  marginTop: spacing.sm,
                }]}>
                  <Ionicons name="shield-checkmark" size={14} color={palette.accent} />
                  <TBVText variant="caption" muted style={{ flex: 1 }}>
                    New user? Use Create Account to get started for free.
                  </TBVText>
                </View>
              )}
            </IndustrialCard>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bgVignette: { ...StyleSheet.absoluteFillObject },
  scroll: { flexGrow: 1, paddingTop: 8, paddingBottom: 24 },

  // ---- SUBTITLE ----
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  subItem: { flexDirection: "row", alignItems: "center" },
  subDot: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 6 },

  // ---- TABS ----
  tabsRow: { flexDirection: "row" },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 40,
    borderWidth: 1,
    borderRadius: 6,
  },

  // ---- BANNER ----
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
  },

  // ---- FORGOT ----
  forgotRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  forgotLine: { flex: 1, height: 1, opacity: 0.4 },

  // ---- FOOTER ----
  footerNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
});
