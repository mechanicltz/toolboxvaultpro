// =============================================================================
// app/login.tsx — Toolbox Vault Login (industrial skin-based)
// -----------------------------------------------------------------------------
// RESPONSIVE CONTRACT (real-phone first):
//   • EVERY size is derived from useWindowDimensions() + safe-area insets.
//     Nothing is hard-coded to a browser-preview size.
//   • Major blocks (Header / Panel / Help) are laid out with Flexbox.
//   • Inside the panel, controls are sized RELATIVE TO THE PANEL (panel-W /
//     panel-H), never the screen — so they always stay inside the skin.
//   • Skins are pre-cropped to their opaque bounds (see /assets/tbv-v2/cropped)
//     so ImageBackground(resizeMode="stretch") fills its container exactly.
//   • No redesign / no colour change / no asset swaps — scaling fixes only.
// =============================================================================

import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, Alert, Image, ImageBackground, Pressable, TouchableOpacity,
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
};

// True aspect ratios of the cropped graphics (w / h)
const AR = { logo: 0.968, card: 2.429 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function LoginScreen() {
  const router = useRouter();
  const { login, register } = useAuth();
  const { width: SW, height: SH } = useWindowDimensions();
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

  // ==================================================================
  // RESPONSIVE MATHS — 100% derived from the real device viewport.
  // ==================================================================
  const availH = Math.max(520, SH - insets.top - insets.bottom);
  const isTablet = SW >= 600;

  // ---- Block heights (Header 34% / Panel 46% / Help 14% / slack 6%) ----
  const headerH = availH * 0.34;
  const helpAreaH = availH * 0.14;

  // ---- Logo (cap 180 on phone, scales with width) ----
  const logoW = isTablet ? 200 : Math.min(SW * 0.42, 180);
  const logoH = logoW / AR.logo;

  // ---- Title + tagline (native text, responsive font sizes) ----
  const titleFont = clamp(SW * 0.082, 26, isTablet ? 40 : 34);
  const tagFont = clamp(SW * 0.045, 13, 18);

  // ---- Panel geometry (panel-relative internals derive from these) ----
  const panelW = Math.min(SW * 0.88, 420);
  const panelH = clamp(availH * 0.46, 360, 470);
  const padX = panelW * 0.09;
  const padTop = panelH * 0.11;
  const padBot = panelH * 0.08;
  const contentW = panelW - padX * 2;

  // ---- Controls (sized off PANEL height, kept inside the skin) ----
  const tabH   = clamp(panelH * 0.12, 44, 58);
  const inputH = clamp(panelH * 0.13, 50, 60);
  const btnH   = clamp(panelH * 0.15, 58, 70);
  const labelH = clamp(panelH * 0.06, 16, 24);
  const tabGap = contentW * 0.04;
  const tabW   = (contentW - tabGap) / 2;

  // ---- Help card ----
  const helpW = Math.min(SW * 0.88, 420);
  const helpH = clamp(helpW / AR.card, 80, 105);

  return (
    <ImageBackground source={SKIN.bg} style={styles.bg} resizeMode="cover">
      <View style={styles.veil} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={[styles.scroll, { minHeight: availH }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* ===================== HEADER BLOCK — 34% ===================== */}
            <View style={[styles.headerBlock, { height: headerH, paddingTop: Math.max(8, 40 - insets.top) }]}>
              <Image
                source={SKIN.masterLogo}
                style={{ width: logoW, height: logoH }}
                resizeMode="contain"
              />
              <Text
                style={[styles.title, { fontSize: titleFont }]}
                numberOfLines={1}
                allowFontScaling={false}
              >
                <Text style={styles.titleSteel}>TOOLBOX </Text>
                <Text style={styles.titleOrange}>VAULT</Text>
              </Text>
              <Text
                style={[styles.tagline, { fontSize: tagFont, maxWidth: SW * 0.92 }]}
                numberOfLines={2}
                allowFontScaling={false}
              >
                INVENTORY • DEALERS • WARRANTIES • REPORTS
              </Text>
            </View>

            {/* ===================== LOGIN PANEL — 46% ===================== */}
            <View style={styles.panelBlock}>
              <ImageBackground
                source={SKIN.panel}
                style={{
                  width: panelW,
                  height: panelH,
                  paddingHorizontal: padX,
                  paddingTop: padTop,
                  paddingBottom: padBot,
                }}
                imageStyle={styles.fillImage}
                resizeMode="stretch"
              >
                <View style={styles.panelInner}>
                  {/* ----- TABS ----- */}
                  <View style={[styles.tabsRow, { height: tabH, gap: tabGap }]}>
                    <TabButton
                      label="SIGN IN"
                      icon="person"
                      width={tabW}
                      active={mode === "login"}
                      onPress={() => setMode("login")}
                      activeSkin={SKIN.tabActive}
                      inactiveSkin={SKIN.tabInactive}
                      testID="tab-login"
                    />
                    <TabButton
                      label="CREATE ACCOUNT"
                      icon="person-add"
                      width={tabW}
                      active={mode === "register"}
                      onPress={() => setMode("register")}
                      activeSkin={SKIN.tabActive}
                      inactiveSkin={SKIN.tabInactive}
                      testID="tab-register"
                    />
                  </View>

                  {/* ----- EMAIL ----- */}
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.label, { height: labelH }]}>EMAIL</Text>
                    <ImageBackground
                      source={SKIN.input}
                      style={{ width: contentW, height: inputH, justifyContent: "center" }}
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
                  </View>

                  {/* ----- PASSWORD ----- */}
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.label, { height: labelH }]}>PASSWORD</Text>
                    <ImageBackground
                      source={SKIN.input}
                      style={{ width: contentW, height: inputH, justifyContent: "center" }}
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
                  </View>

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
                      width: contentW,
                      height: btnH,
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

            {/* ===================== HELP BLOCK — 14% ===================== */}
            <View style={[styles.helpBlock, { height: helpAreaH }]}>
              {mode === "login" && bio?.enabled && bio.hasHardware && bio.isEnrolled ? (
                <Pressable
                  onPress={runBiometricLogin}
                  disabled={busy}
                  style={({ pressed }) => ({
                    width: helpW,
                    height: Math.min(helpH, 60),
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
                  style={{ width: helpW, height: helpH, justifyContent: "center" }}
                  imageStyle={styles.fillImage}
                  resizeMode="stretch"
                >
                  <View style={[styles.footerInner, { paddingHorizontal: helpW * 0.13 }]}>
                    <Ionicons name="shield-checkmark" size={15} color="#FF8533" />
                    <Text style={styles.footerText} numberOfLines={2}>
                      {mode === "login"
                        ? "New here? Tap CREATE to set up your vault — free."
                        : "Already registered? Tap SIGN IN above."}
                    </Text>
                  </View>
                </ImageBackground>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

// =====================================================================
// Tab button — width is panel-relative, passed in from parent
// =====================================================================
function TabButton({
  label, icon, active, onPress, testID, activeSkin, inactiveSkin, width,
}: {
  label: string; icon: any; active: boolean; onPress: () => void;
  testID?: string; activeSkin: any; inactiveSkin: any; width: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [{ width, height: "100%", opacity: pressed ? 0.85 : 1 }]}
    >
      <ImageBackground
        source={active ? activeSkin : inactiveSkin}
        style={styles.center}
        imageStyle={styles.fillImage}
        resizeMode="stretch"
      >
        <View style={[styles.row, { gap: 5, paddingHorizontal: 6 }]}>
          <Ionicons name={icon} size={13} color={active ? "#0A0A0A" : "#C8C8C8"} />
          <Text
            style={[styles.tabText, { color: active ? "#0A0A0A" : "#C8C8C8" }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {label}
          </Text>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

// =====================================================================
// Styles  (visual values unchanged — only layout/scaling logic moved)
// =====================================================================
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0A0A0A" },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.38)" },

  scroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 8 },

  // ---- header ----
  headerBlock: { width: "100%", alignItems: "center", justifyContent: "center" },
  title: {
    fontFamily: "BebasNeue_400Regular",
    letterSpacing: 3,
    marginTop: 6,
    textAlign: "center",
  },
  titleSteel: { color: "#E8E8E8" },
  titleOrange: { color: "#FF8533" },
  tagline: {
    fontFamily: "Rajdhani_600SemiBold",
    letterSpacing: 2,
    color: "#F2F2F2",
    textAlign: "center",
    marginTop: 6,
  },

  // ---- panel ----
  panelBlock: { width: "100%", alignItems: "center", justifyContent: "center" },
  panelInner: { flex: 1, justifyContent: "space-between" },

  // ---- tabs ----
  tabsRow: { flexDirection: "row", width: "100%" },
  tabText: { fontFamily: "BebasNeue_400Regular", fontSize: 16, letterSpacing: 1 },

  // ---- fields ----
  fieldGroup: { width: "100%" },
  label: {
    fontFamily: "Rajdhani_700Bold",
    fontSize: 11,
    letterSpacing: 2,
    color: "#D8D8D8",
    paddingLeft: 2,
    textAlignVertical: "bottom",
  },
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
    paddingVertical: 4,
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
    fontSize: 13,
    letterSpacing: 2,
    color: "#FF8533",
  },

  // ---- help ----
  helpBlock: { width: "100%", alignItems: "center", justifyContent: "center" },
  footerInner: { flexDirection: "row", alignItems: "center", gap: 10 },
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
