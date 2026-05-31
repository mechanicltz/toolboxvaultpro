// =============================================================================
// login.tsx — Toolbox Vault industrial sign-in
// -----------------------------------------------------------------------------
// Composed entirely from the IndustrialDesignSystem (per ChatGPT spec):
//   IndustrialBackground (full screen, theme-aware)
//   <Image> logo badge + emblem (no surrounding box, transparent PNG)
//   Native <Text> for TOOLBOX VAULT title (Anton font for nameplate feel)
//   IndustrialPanel wrapping the form area
//   IndustrialTabBar for SIGN IN / CREATE ACCOUNT
//   IndustrialInput x2 for email + password (chamfered, with orange L-bracket)
//   IndustrialButton for the primary submit action
//
// All auth logic (biometric, login/register, forgot password) preserved
// verbatim from the previous version.
// =============================================================================

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ImageBackground,
  Image,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  useFonts as useGoogleFonts,
  BlackOpsOne_400Regular,
} from "@expo-google-fonts/black-ops-one";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { Anton_400Regular } from "@expo-google-fonts/anton";
import { theme } from "../src/theme";
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
  IndustrialPanel,
  IndustrialTabBar,
  PasswordEyeToggle,
  useBackgroundAsset,
  useIndustrialTheme,
  INDUSTRIAL_FONTS,
  getAsset,
} from "../src/components/industrial";

export default function LoginScreen() {
  const router = useRouter();
  const { login, register } = useAuth();
  const { width: screenW } = useWindowDimensions();
  const { palette, mode } = useIndustrialTheme();
  const bgAsset = useBackgroundAsset();
  const combinedLogo = getAsset("logo_combined");
  const logoBadge = getAsset("logo_badge_octagon");
  const emblem = getAsset("hammer_wrench_emblem");

  const [fontsLoaded] = useGoogleFonts({
    BlackOpsOne_400Regular,
    BebasNeue_400Regular,
    Anton_400Regular,
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

  // Logo sizing — roughly matches the reference image proportions
  const badgeSize = Math.min(screenW * 0.42, 200);
  const emblemSize = badgeSize * 0.55;
  const titleSize = Math.min(screenW * 0.115, 48);

  const titleFont = fontsLoaded
    ? "Anton_400Regular"
    : Platform.select({ ios: "Impact", android: "sans-serif-condensed", default: "Impact" });
  const subFont = fontsLoaded
    ? "BebasNeue_400Regular"
    : Platform.select({ ios: "Impact", android: "sans-serif-condensed", default: "Impact" });

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

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      {bgAsset ? (
        <ImageBackground source={bgAsset} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      {/* slight darkening so content always pops on the textured bg */}
      <View
        style={[
          styles.bgVignette,
          { backgroundColor: mode === "light" ? "rgba(255,255,255,0.10)" : "rgba(5,5,5,0.18)" },
        ]}
        pointerEvents="none"
      />

      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* ============== LOGO (single combined image) ============== */}
            <View style={[styles.logoWrap, { width: badgeSize * 1.05, height: badgeSize }]}>
              {combinedLogo ? (
                <Image
                  source={combinedLogo}
                  style={{ width: badgeSize * 1.05, height: badgeSize }}
                  resizeMode="contain"
                />
              ) : logoBadge ? (
                <>
                  <Image
                    source={logoBadge}
                    style={{ width: badgeSize, height: badgeSize }}
                    resizeMode="contain"
                  />
                  {emblem ? (
                    <Image
                      source={emblem}
                      style={[styles.emblem, { width: emblemSize, height: emblemSize }]}
                      resizeMode="contain"
                    />
                  ) : null}
                </>
              ) : null}
            </View>

            {/* ============== TITLE ============== */}
            <View style={styles.titleRow}>
              <View style={[styles.wing, { backgroundColor: palette.accent, marginRight: 10 }]} />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.title, { fontSize: titleSize, fontFamily: titleFont }]}
              >
                <Text style={{ color: palette.text }}>TOOLBOX</Text>
                <Text style={{ color: palette.text }}> </Text>
                <Text style={{ color: palette.accent }}>VAULT</Text>
              </Text>
              <View style={[styles.wing, { backgroundColor: palette.accent, marginLeft: 10 }]} />
            </View>

            {/* ============== SUBTITLE ============== */}
            <View style={styles.subRow}>
              {["INVENTORY", "DEALERS", "WARRANTIES", "REPORTS"].map((w, i) => (
                <View key={w} style={styles.subItem}>
                  <Text style={[styles.subText, { color: palette.text, fontFamily: subFont }]}>{w}</Text>
                  {i < 3 && (
                    <View style={[styles.subDot, { backgroundColor: palette.accent }]} />
                  )}
                </View>
              ))}
            </View>

            {/* ============== PANEL ============== */}
            <IndustrialPanel style={{ marginTop: 18 }}>
              <View style={{ gap: 14 }}>
                <IndustrialTabBar
                  tabs={[
                    { key: "login", label: "SIGN IN", icon: "person" },
                    { key: "register", label: "CREATE ACCOUNT", icon: "person-add" },
                  ]}
                  activeKey={mode_}
                  onChange={(k) => setMode(k as "login" | "register")}
                />

                {!!err && (
                  <View style={[styles.banner, { backgroundColor: "rgba(220,53,69,0.92)", borderColor: theme.colors.danger }]}>
                    <Ionicons name="alert-circle" size={16} color="#fff" />
                    <Text style={styles.bannerText}>{err}</Text>
                  </View>
                )}
                {!!info && !err && (
                  <View style={[styles.banner, { backgroundColor: "rgba(46,160,67,0.92)", borderColor: theme.colors.success }]}>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={styles.bannerText}>{info}</Text>
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
                  testID="auth-submit"
                  style={{ marginTop: 4 }}
                />

                {mode_ === "login" && (
                  <View style={styles.forgotRow}>
                    <View style={[styles.forgotLine, { backgroundColor: palette.accent }]} />
                    <Text
                      onPress={() => router.push("/forgot-password")}
                      style={[styles.forgotText, { color: palette.accent, fontFamily: subFont }]}
                      testID="forgot-password-link"
                    >
                      FORGOT PASSWORD?
                    </Text>
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
                        bio.label.toLowerCase().includes("face")
                          ? "scan"
                          : bio.label.toLowerCase().includes("touch") ||
                            bio.label.toLowerCase().includes("finger")
                          ? "finger-print"
                          : "lock-closed"
                      }
                      variant="secondary"
                      onPress={runBiometricLogin}
                      disabled={busy}
                      testID="auth-biometric"
                    />
                  )}

                {mode_ === "login" && (
                  <View style={[styles.footerNotice, { backgroundColor: mode === "light" ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.5)", borderColor: mode === "light" ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)" }]}>
                    <Ionicons name="shield-checkmark" size={14} color={palette.accent} />
                    <Text style={[styles.footerText, { color: palette.textMuted }]}>
                      New user? Use Create Account to get started for free.
                    </Text>
                  </View>
                )}
              </View>
            </IndustrialPanel>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bgVignette: { ...StyleSheet.absoluteFillObject },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },

  // ---- LOGO ----
  logoWrap: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  emblem: {
    position: "absolute",
    alignSelf: "center",
  },

  // ---- TITLE ----
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    marginTop: -2,
  },
  title: {
    letterSpacing: 2.5,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 2,
  },
  wing: {
    flex: 1,
    height: 3,
    opacity: 0.7,
    borderRadius: 1,
  },

  // ---- SUBTITLE ----
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    flexWrap: "wrap",
  },
  subItem: { flexDirection: "row", alignItems: "center" },
  subText: { fontSize: 12, fontWeight: "700", letterSpacing: 2, marginHorizontal: 5 },
  subDot: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 4 },

  // ---- BANNER ----
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  bannerText: { flex: 1, color: "#fff", fontSize: 12, fontWeight: "700" },

  // ---- FORGOT ----
  forgotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  forgotLine: { flex: 1, height: 1, opacity: 0.4 },
  forgotText: { fontSize: 13, fontWeight: "800", letterSpacing: 2 },

  // ---- FOOTER ----
  footerNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
  },
  footerText: { flex: 1, fontSize: 11, fontWeight: "600" },
});
