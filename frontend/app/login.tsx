// =============================================================================
// app/login.tsx — Toolbox Vault Login (industrial skin-based)
// -----------------------------------------------------------------------------
// STRICT LAYOUT (user-mandated, percentages of usable screen height):
//   • Logo Area    → 25%
//   • Tagline Area →  5%
//   • Login Panel  → 55%   (all form content lives INSIDE the panel skin)
//   • Footer Area  → 15%
//
// SKINS: every UI skin in /assets/tbv-v2/cropped/ has been pre-cropped to its
// opaque bounds, so used as <ImageBackground resizeMode="stretch"> the graphic
// FILLS its container exactly (no transparent margins, no floating / spillage).
// Native text / inputs / icons are rendered as CHILDREN on top of the skins.
// =============================================================================

import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  Alert, Image, ImageBackground, Pressable, TouchableOpacity,
  ActivityIndicator, useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
import { useAuth } from "../src/AuthContext";
import {
  getBiometricStatus, tryBiometricLogin, enableBiometric,
  hasBeenPromptedForBiometric, markBiometricPrompted,
} from "../src/biometric";

// =====================================================================
// Cropped skin sources (opaque-bounds only — fill their containers)
// =====================================================================
const SKIN = {
  bg:           require("../assets/tbv-v2/Backgrounds/tbv_background_industrial_dark.png"),
  panel:        require("../assets/tbv-v2/cropped/panel.png"),
  card:         require("../assets/tbv-v2/cropped/card.png"),
  tabActive:    require("../assets/tbv-v2/cropped/tab_active.png"),
  tabInactive:  require("../assets/tbv-v2/cropped/tab_inactive.png"),
  input:        require("../assets/tbv-v2/cropped/input.png"),
  btnPrimary:   require("../assets/tbv-v2/cropped/btn_primary.png"),
  btnSecondary: require("../assets/tbv-v2/cropped/btn_secondary.png"),
  masterLogo:   require("../assets/tbv-v2/cropped/logo.png"),
  wordmark:     require("../assets/tbv-v2/cropped/wordmark.png"),
};

// True aspect ratios of the cropped graphics (w / h)
const AR = { logo: 0.968, wordmark: 2.4, card: 2.429 };

export default function LoginScreen() {
  const router = useRouter();
  const { login, register } = useAuth();
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  useGoogleFonts({
    BebasNeue_400Regular,
    Rajdhani_500Medium, Rajdhani_600SemiBold, Rajdhani_700Bold,
    Exo2_400Regular, Exo2_500Medium, Exo2_700Bold,
  });

  // Form state
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Biometric
  const [bio, setBio] = useState<{
    enabled: boolean; label: string; hasHardware: boolean; isEnrolled: boolean;
  } | null>(null);
  const autoPromptedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const s = await getBiometricStatus();
      setBio({
        enabled: s.enabled, label: s.label,
        hasHardware: s.hasHardware, isEnrolled: s.isEnrolled,
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
    const creds = await tryBiometricLogin();
    if (!creds) return;
    setBusy(true);
    try { await login(creds.email, creds.password); }
    catch {
      setErr("Saved credentials didn't work. Please sign in with your password.");
    } finally { setBusy(false); }
  };

  const maybeOfferBiometricEnrol = async (mail: string, pw: string) => {
    if (Platform.OS === "web") return;
    try {
      const s = await getBiometricStatus();
      if (!s.hasHardware || !s.isEnrolled || s.enabled) return;
      if (await hasBeenPromptedForBiometric()) return;
      setTimeout(() => {
        Alert.alert(`Enable ${s.label}?`,
          `Sign in to Toolbox Vault with ${s.label} from now on.`,
          [
            { text: "Not now", style: "cancel", onPress: () => markBiometricPrompted() },
            { text: `Enable ${s.label}`, onPress: async () => {
              try { await enableBiometric(mail, pw); } catch {}
            }},
          ]);
      }, 700);
    } catch {}
  };

  const submit = async () => {
    if (busy) return;
    setErr("");
    if (!email.trim()) return setErr("Email is required");
    if (!password) return setErr("Password is required");
    if (mode === "register" && password.length < 6) {
      return setErr("Password must be at least 6 characters");
    }
    setBusy(true);
    try {
      if (mode === "register") await register(email, password, "");
      else await login(email, password);
      await maybeOfferBiometricEnrol(email, password);
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Something went wrong");
    } finally { setBusy(false); }
  };

  // ------------------------------------------------------------------
  // Strict region maths — 25 / 5 / 55 / 15 of the USABLE height
  // ------------------------------------------------------------------
  const availH = Math.max(480, winH - insets.top - insets.bottom);
  const isTablet = winW >= 600;

  // Brand sizing (driven by usable height so it always fits the 25% region)
  const logoH     = availH * 0.135;
  const wordmarkH = availH * 0.058;

  // Panel geometry
  const panelW = isTablet ? Math.min(540, winW * 0.6) : winW * 0.88;
  const panelH = availH * 0.55 * 0.96;
  const padX   = panelW * 0.115;
  const padTop = panelH * 0.135;
  const padBot = panelH * 0.145;

  // Control sizing inside panel
  const ctrlW   = panelW - padX * 2;
  const inputH  = Math.min(54, panelH * 0.115);
  const btnH    = Math.min(60, panelH * 0.135);
  const tabH    = Math.min(48, panelH * 0.105);

  // Footer card
  const footerCardW = panelW;

  return (
    <ImageBackground source={SKIN.bg} style={styles.bg} resizeMode="cover">
      <View style={styles.veil} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.regionStack}>

            {/* ===================== LOGO AREA — 25% ===================== */}
            <View style={styles.logoArea}>
              <Image
                source={SKIN.masterLogo}
                style={{ height: logoH, width: logoH * AR.logo }}
                resizeMode="contain"
              />
              <Image
                source={SKIN.wordmark}
                style={{ height: wordmarkH, width: wordmarkH * AR.wordmark, marginTop: 6 }}
                resizeMode="contain"
              />
            </View>

            {/* ===================== TAGLINE AREA — 5% ===================== */}
            <View style={styles.taglineArea}>
              <Text
                style={styles.tagline}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                INVENTORY · DEALERS · WARRANTIES · REPORTS
              </Text>
            </View>

            {/* ===================== LOGIN PANEL — 55% ===================== */}
            <View style={styles.panelArea}>
              <ImageBackground
                source={SKIN.panel}
                style={{
                  width: panelW,
                  height: panelH,
                  paddingHorizontal: padX,
                  paddingTop: padTop,
                  paddingBottom: padBot,
                  justifyContent: "center",
                }}
                imageStyle={styles.fillImage}
                resizeMode="stretch"
              >
                <View style={styles.panelInner}>
                  {/* ----- TABS ----- */}
                  <View style={[styles.tabsRow, { height: tabH }]}>
                    <TabButton
                      label="SIGN IN"
                      icon="person"
                      active={mode === "login"}
                      onPress={() => setMode("login")}
                      activeSkin={SKIN.tabActive}
                      inactiveSkin={SKIN.tabInactive}
                      testID="tab-login"
                    />
                    <TabButton
                      label="CREATE"
                      icon="person-add"
                      active={mode === "register"}
                      onPress={() => setMode("register")}
                      activeSkin={SKIN.tabActive}
                      inactiveSkin={SKIN.tabInactive}
                      testID="tab-register"
                    />
                  </View>

                  {/* ----- EMAIL ----- */}
                  <Text style={styles.label}>EMAIL</Text>
                  <ImageBackground
                    source={SKIN.input}
                    style={{ width: ctrlW, height: inputH, justifyContent: "center" }}
                    imageStyle={styles.fillImage}
                    resizeMode="stretch"
                  >
                    <View style={styles.inputInner}>
                      <Ionicons name="mail-outline" size={17} color="#FF8533" />
                      <TextInput
                        value={email}
                        onChangeText={setEmail}
                        placeholder="you@example.com"
                        placeholderTextColor="rgba(242,242,242,0.42)"
                        autoCapitalize="none"
                        autoComplete="email"
                        keyboardType="email-address"
                        style={styles.input}
                        testID="auth-email"
                      />
                    </View>
                  </ImageBackground>

                  {/* ----- PASSWORD ----- */}
                  <Text style={styles.label}>PASSWORD</Text>
                  <ImageBackground
                    source={SKIN.input}
                    style={{ width: ctrlW, height: inputH, justifyContent: "center" }}
                    imageStyle={styles.fillImage}
                    resizeMode="stretch"
                  >
                    <View style={styles.inputInner}>
                      <Ionicons name="lock-closed-outline" size={17} color="#FF8533" />
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder="••••••••"
                        placeholderTextColor="rgba(242,242,242,0.42)"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        style={styles.input}
                        testID="auth-password"
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(s => !s)}
                        hitSlop={10}
                        testID="password-eye"
                      >
                        <Ionicons
                          name={showPassword ? "eye-off" : "eye"}
                          size={20}
                          color="#FF8533"
                        />
                      </TouchableOpacity>
                    </View>
                  </ImageBackground>

                  {/* ----- ERROR ----- */}
                  {!!err && (
                    <View style={styles.errorRow}>
                      <Ionicons name="alert-circle" size={13} color="#FF6F61" />
                      <Text style={styles.errorText} numberOfLines={2}>{err}</Text>
                    </View>
                  )}

                  {/* ----- SUBMIT ----- */}
                  <Pressable
                    onPress={submit}
                    disabled={busy}
                    style={({ pressed }) => ({
                      width: ctrlW,
                      height: btnH,
                      marginTop: 4,
                      opacity: busy ? 0.7 : pressed ? 0.85 : 1,
                    })}
                    testID="auth-submit"
                  >
                    <ImageBackground
                      source={SKIN.btnPrimary}
                      style={styles.center}
                      imageStyle={styles.fillImage}
                      resizeMode="stretch"
                    >
                      {busy ? (
                        <ActivityIndicator color="#0A0A0A" />
                      ) : (
                        <View style={styles.row}>
                          <Ionicons name="lock-closed" size={18} color="#0A0A0A" />
                          <Text style={styles.submitText}>
                            {mode === "register" ? "CREATE ACCOUNT" : "SIGN IN"}
                          </Text>
                        </View>
                      )}
                    </ImageBackground>
                  </Pressable>

                  {/* ----- FORGOT ----- */}
                  {mode === "login" && (
                    <TouchableOpacity
                      onPress={() => router.push("/forgot-password")}
                      activeOpacity={0.6}
                      style={styles.forgotWrap}
                      hitSlop={10}
                      testID="forgot-password-link"
                    >
                      <Text style={styles.forgotText}>FORGOT PASSWORD?</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ImageBackground>
            </View>

            {/* ===================== FOOTER AREA — 15% ===================== */}
            <View style={styles.footerArea}>
              {mode === "login" && bio?.enabled && bio.hasHardware && bio.isEnrolled ? (
                <Pressable
                  onPress={runBiometricLogin}
                  disabled={busy}
                  style={({ pressed }) => ({
                    width: footerCardW,
                    height: Math.min(54, availH * 0.085),
                    opacity: pressed ? 0.85 : 1,
                  })}
                  testID="auth-biometric"
                >
                  <ImageBackground
                    source={SKIN.btnSecondary}
                    style={styles.center}
                    imageStyle={styles.fillImage}
                    resizeMode="stretch"
                  >
                    <View style={styles.row}>
                      <Ionicons
                        name={
                          bio.label.toLowerCase().includes("face") ? "scan"
                          : bio.label.toLowerCase().includes("touch") ||
                            bio.label.toLowerCase().includes("finger") ? "finger-print"
                          : "lock-closed"
                        }
                        size={18}
                        color="#FF8533"
                      />
                      <Text style={styles.bioText}>
                        {`SIGN IN WITH ${bio.label.toUpperCase()}`}
                      </Text>
                    </View>
                  </ImageBackground>
                </Pressable>
              ) : (
                <ImageBackground
                  source={SKIN.card}
                  style={{
                    width: footerCardW,
                    height: Math.min(footerCardW / AR.card, availH * 0.12),
                    justifyContent: "center",
                  }}
                  imageStyle={styles.fillImage}
                  resizeMode="stretch"
                >
                  <View style={styles.footerInner}>
                    <Ionicons name="shield-checkmark" size={16} color="#FF8533" />
                    <Text style={styles.footerText} numberOfLines={2}>
                      {mode === "login"
                        ? "New here? Tap CREATE to set up your vault — free."
                        : "Already registered? Tap SIGN IN above."}
                    </Text>
                  </View>
                </ImageBackground>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

// =====================================================================
// Tab button
// =====================================================================
function TabButton({
  label, icon, active, onPress, testID, activeSkin, inactiveSkin,
}: {
  label: string; icon: any; active: boolean; onPress: () => void;
  testID?: string; activeSkin: any; inactiveSkin: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.tabPressable, { opacity: pressed ? 0.85 : 1 }]}
    >
      <ImageBackground
        source={active ? activeSkin : inactiveSkin}
        style={styles.center}
        imageStyle={styles.fillImage}
        resizeMode="stretch"
      >
        <View style={styles.row}>
          <Ionicons name={icon} size={15} color={active ? "#0A0A0A" : "#C8C8C8"} />
          <Text style={[styles.tabText, { color: active ? "#0A0A0A" : "#C8C8C8" }]}>
            {label}
          </Text>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

// =====================================================================
// Styles
// =====================================================================
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0A0A0A" },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.38)" },

  regionStack: { flex: 1, paddingHorizontal: 8 },

  // ---- regions ----
  logoArea:    { flex: 25, alignItems: "center", justifyContent: "flex-end", paddingBottom: 4 },
  taglineArea: { flex: 5,  alignItems: "center", justifyContent: "center" },
  panelArea:   { flex: 55, alignItems: "center", justifyContent: "center" },
  footerArea:  { flex: 15, alignItems: "center", justifyContent: "center" },

  tagline: {
    fontFamily: "Rajdhani_600SemiBold",
    fontSize: 12,
    letterSpacing: 2.4,
    color: "#F2F2F2",
    textAlign: "center",
  },

  // ---- panel ----
  panelInner: { width: "100%", justifyContent: "center", gap: 7 },

  // ---- tabs ----
  tabsRow: { flexDirection: "row", gap: 10, marginBottom: 2 },
  tabPressable: { flex: 1 },
  tabText: { fontFamily: "BebasNeue_400Regular", fontSize: 17, letterSpacing: 1.5 },

  // ---- labels ----
  label: {
    fontFamily: "Rajdhani_700Bold",
    fontSize: 11,
    letterSpacing: 2,
    color: "#D8D8D8",
    paddingLeft: 2,
  },

  // ---- inputs ----
  inputInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    height: "100%",
  },
  input: {
    flex: 1,
    color: "#F2F2F2",
    fontFamily: "Exo2_500Medium",
    fontSize: 15,
    paddingVertical: 0,
    includeFontPadding: false,
  },

  // ---- error ----
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "rgba(170,20,20,0.5)",
    borderColor: "rgba(255,80,80,0.5)",
    borderWidth: 1,
    borderRadius: 4,
  },
  errorText: { flex: 1, color: "#FFE0E0", fontFamily: "Exo2_500Medium", fontSize: 12 },

  // ---- submit ----
  submitText: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 22,
    letterSpacing: 2.5,
    color: "#0A0A0A",
  },

  // ---- forgot ----
  forgotWrap: { alignSelf: "center", paddingVertical: 2 },
  forgotText: {
    fontFamily: "Rajdhani_700Bold",
    fontSize: 11,
    letterSpacing: 2,
    color: "#FF8533",
  },

  // ---- footer ----
  footerInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 22,
  },
  footerText: {
    flex: 1,
    color: "#C8C8C8",
    fontFamily: "Exo2_400Regular",
    fontSize: 12,
    lineHeight: 16,
  },
  bioText: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 16,
    letterSpacing: 2,
    color: "#FF8533",
  },

  // ---- shared ----
  center: { flex: 1, width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  fillImage: { width: "100%", height: "100%" },
});
