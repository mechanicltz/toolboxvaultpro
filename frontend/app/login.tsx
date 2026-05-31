// =============================================================================
// login.tsx — Toolbox Vault Login (SLICE-BASED, mimics reference exactly)
// -----------------------------------------------------------------------------
// Strategy:
//   • Reference image sliced into 9 visual pieces (logo, title, subtitle,
//     panel, tabs, input, sign-in button, footer).
//   • Each piece is positioned via Flexbox so it scales across phone sizes.
//   • Real React Native text/inputs are overlaid on top of the painted UI
//     chrome — so text is always crisp + functional, but the visual IS the
//     reference.
//   • Background is the full reference image, blurred behind the rest if
//     desired, otherwise just used as the bg surface.
// =============================================================================

import { useState, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ImageBackground,
  Image,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
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
import { useTBV, TBVText } from "../src/components/industrial";

// Reference slices — each piece is a tile from the canonical login design.
const REF_BG       = require("../assets/tbv/slices/full_reference.jpg");
const REF_LOGO     = require("../assets/tbv/slices/logo.png");
const REF_TITLE    = require("../assets/tbv/slices/title.png");
const REF_SUBTITLE = require("../assets/tbv/slices/subtitle.png");
const REF_PANEL    = require("../assets/tbv/slices/panel.png");
const REF_TAB_ON   = require("../assets/tbv/slices/tab_active.png");
const REF_TAB_OFF  = require("../assets/tbv/slices/tab_inactive.png");
const REF_INPUT    = require("../assets/tbv/slices/input.png");
const REF_BUTTON   = require("../assets/tbv/slices/signin_btn.png");

export default function LoginScreen() {
  const router = useRouter();
  const { login, register } = useAuth();
  const { width: screenW } = useWindowDimensions();
  const { palette } = useTBV();

  const [, ] = useGoogleFonts({
    BebasNeue_400Regular,
    Rajdhani_500Medium, Rajdhani_600SemiBold, Rajdhani_700Bold,
    Exo2_400Regular, Exo2_500Medium, Exo2_700Bold,
  });

  const [mode_, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
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
    catch { setErr("Saved credentials didn't work. Please sign in with your password to refresh them."); }
    finally { setBusy(false); }
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
            { text: `Enable ${s.label}`, onPress: async () => { try { await enableBiometric(mail, pw); } catch {} } },
          ]);
      }, 700);
    } catch {}
  };

  const submit = async () => {
    if (busy) return;
    setErr("");
    if (!email.trim()) return setErr("Email is required");
    if (!password) return setErr("Password is required");
    if (mode_ === "register" && password.length < 6) return setErr("Password must be at least 6 characters");
    setBusy(true);
    try {
      if (mode_ === "register") await register(email, password, name);
      else await login(email, password);
      await maybeOfferBiometricEnrol(email, password);
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Something went wrong");
    } finally { setBusy(false); }
  };

  // The reference image is 852x1847. We keep all proportions relative to
  // that so the layout reads the same on every device.
  const sidePad = Math.max(16, screenW * 0.04);

  return (
    <View style={styles.root}>
      <ImageBackground source={REF_BG} style={StyleSheet.absoluteFill} resizeMode="cover">
        {/* light vignette so overlay text is readable on bright spots */}
        <View style={styles.vignette} pointerEvents="none" />

        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, paddingHorizontal: sidePad, paddingBottom: 20 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* ============== LOGO (painted) ============== */}
              <Image source={REF_LOGO} style={styles.logo} resizeMode="contain" />

              {/* ============== TITLE bar with orange wings (painted) ============== */}
              <Image source={REF_TITLE} style={styles.title} resizeMode="contain" />

              {/* ============== SUBTITLE (painted) ============== */}
              <Image source={REF_SUBTITLE} style={styles.subtitle} resizeMode="contain" />

              {/* ============== PANEL — painted frame with overlaid functional UI ============== */}
              <View style={styles.panelWrap}>
                {/* Painted panel chrome (frame, bolts, orange edge glow) */}
                <Image source={REF_PANEL} style={styles.panelImage} resizeMode="stretch" />

                {/* Functional overlay sits inside the painted frame */}
                <View style={styles.panelInner}>
                  {/* TABS row — painted tab plates + native text on top */}
                  <View style={styles.tabsRow}>
                    <Pressable onPress={() => setMode("login")} style={styles.tabWrap} testID="tab-login">
                      <Image
                        source={mode_ === "login" ? REF_TAB_ON : REF_TAB_OFF}
                        style={styles.tabImage}
                        resizeMode="stretch"
                      />
                      <View style={styles.tabTextWrap}>
                        <Ionicons name="person" size={14} color={mode_ === "login" ? "#000" : "#888"} />
                        <TBVText
                          variant="buttonSm"
                          color={mode_ === "login" ? "#000" : "#888"}
                          style={{ marginLeft: 6 }}
                        >SIGN IN</TBVText>
                      </View>
                    </Pressable>
                    <Pressable onPress={() => setMode("register")} style={styles.tabWrap} testID="tab-register">
                      <Image
                        source={mode_ === "register" ? REF_TAB_ON : REF_TAB_OFF}
                        style={styles.tabImage}
                        resizeMode="stretch"
                      />
                      <View style={styles.tabTextWrap}>
                        <Ionicons name="person-add" size={14} color={mode_ === "register" ? "#000" : "#888"} />
                        <TBVText
                          variant="buttonSm"
                          color={mode_ === "register" ? "#000" : "#888"}
                          style={{ marginLeft: 6 }}
                        >CREATE ACCOUNT</TBVText>
                      </View>
                    </Pressable>
                  </View>

                  {/* Error banner */}
                  {!!err && (
                    <View style={[styles.banner, { borderColor: palette.danger }]}>
                      <Ionicons name="alert-circle" size={14} color={palette.danger} />
                      <TBVText variant="bodySmall" color={palette.danger} style={{ flex: 1 }}>{err}</TBVText>
                    </View>
                  )}

                  {/* NAME (register mode) */}
                  {mode_ === "register" && (
                    <View style={{ gap: 4 }}>
                      <View style={styles.labelRow}>
                        <TBVText variant="label" color="#aaa">NAME</TBVText>
                        <View style={styles.labelDash} />
                      </View>
                      <View style={styles.inputWrap}>
                        <Image source={REF_INPUT} style={styles.inputImage} resizeMode="stretch" />
                        <View style={styles.inputTextWrap}>
                          <TextInput
                            value={name}
                            onChangeText={setName}
                            placeholder="Your name"
                            placeholderTextColor="rgba(242,242,242,0.35)"
                            autoCapitalize="words"
                            style={styles.input}
                            testID="auth-name"
                          />
                        </View>
                      </View>
                    </View>
                  )}

                  {/* EMAIL */}
                  <View style={{ gap: 4 }}>
                    <View style={styles.labelRow}>
                      <TBVText variant="label" color="#aaa">EMAIL</TBVText>
                      <View style={styles.labelDash} />
                    </View>
                    <View style={styles.inputWrap}>
                      <Image source={REF_INPUT} style={styles.inputImage} resizeMode="stretch" />
                      <View style={styles.inputTextWrap}>
                        <TextInput
                          value={email}
                          onChangeText={setEmail}
                          placeholder="you@example.com"
                          placeholderTextColor="rgba(242,242,242,0.35)"
                          autoCapitalize="none"
                          autoComplete="email"
                          keyboardType="email-address"
                          style={[styles.input, { paddingLeft: 38 }]}
                          testID="auth-email"
                        />
                      </View>
                    </View>
                  </View>

                  {/* PASSWORD */}
                  <View style={{ gap: 4 }}>
                    <View style={styles.labelRow}>
                      <TBVText variant="label" color="#aaa">PASSWORD</TBVText>
                      <View style={styles.labelDash} />
                    </View>
                    <View style={styles.passRow}>
                      <View style={[styles.inputWrap, { flex: 1 }]}>
                        <Image source={REF_INPUT} style={styles.inputImage} resizeMode="stretch" />
                        <View style={styles.inputTextWrap}>
                          <TextInput
                            value={password}
                            onChangeText={setPassword}
                            placeholder="••••••••"
                            placeholderTextColor="rgba(242,242,242,0.35)"
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            style={[styles.input, { paddingLeft: 38 }]}
                            testID="auth-password"
                          />
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => setShowPassword((s) => !s)}
                        style={styles.eyeBtn}
                        activeOpacity={0.6}
                        testID="password-eye"
                      >
                        <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#FF6A00" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* SIGN IN button — painted plate + native text overlay */}
                  <Pressable onPress={submit} disabled={busy} testID="auth-submit" style={styles.signBtnWrap}>
                    <Image source={REF_BUTTON} style={styles.signBtnImage} resizeMode="stretch" />
                    <View style={styles.signBtnTextWrap}>
                      {busy ? (
                        <ActivityIndicator color="#000" />
                      ) : (
                        <>
                          <Ionicons name="lock-closed" size={18} color="#000" />
                          <TBVText variant="buttonLg" color="#000" style={{ marginLeft: 10 }}>
                            {mode_ === "register" ? "CREATE ACCOUNT" : "SIGN IN"}
                          </TBVText>
                        </>
                      )}
                    </View>
                  </Pressable>

                  {/* FORGOT PASSWORD */}
                  {mode_ === "login" && (
                    <View style={styles.forgotRow}>
                      <View style={styles.forgotLine} />
                      <TouchableOpacity
                        onPress={() => router.push("/forgot-password")}
                        activeOpacity={0.6}
                        testID="forgot-password-link"
                      >
                        <TBVText variant="button" color="#FF6A00">FORGOT PASSWORD?</TBVText>
                      </TouchableOpacity>
                      <View style={styles.forgotLine} />
                    </View>
                  )}

                  {/* Biometric */}
                  {mode_ === "login" && bio?.enabled && bio.hasHardware && bio.isEnrolled && (
                    <TouchableOpacity
                      onPress={runBiometricLogin}
                      disabled={busy}
                      style={styles.bioBtn}
                      testID="auth-biometric"
                    >
                      <Ionicons
                        name={
                          bio.label.toLowerCase().includes("face") ? "scan" :
                          bio.label.toLowerCase().includes("touch") ||
                          bio.label.toLowerCase().includes("finger") ? "finger-print" : "lock-closed"
                        }
                        size={16} color="#FF6A00"
                      />
                      <TBVText variant="button" color="#FF6A00">
                        {`SIGN IN WITH ${bio.label.toUpperCase()}`}
                      </TBVText>
                    </TouchableOpacity>
                  )}

                  {/* Footer notice */}
                  {mode_ === "login" && (
                    <View style={styles.footerNotice}>
                      <Ionicons name="shield-checkmark" size={14} color="#FF6A00" />
                      <TBVText variant="caption" color="#aaa" style={{ flex: 1 }}>
                        New user? Use Create Account to get started for free.
                      </TBVText>
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  vignette: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.18)" },

  // ---- Top elements (proportional to the reference image) ----
  logo: { width: "55%", aspectRatio: 341 / 369, alignSelf: "center", marginTop: 16 },
  title: { width: "100%", aspectRatio: 852 / 120, alignSelf: "center", marginTop: 6 },
  subtitle: { width: "100%", aspectRatio: 852 / 74, alignSelf: "center", marginTop: 4 },

  // ---- Panel ----
  panelWrap: {
    width: "100%",
    aspectRatio: 736 / 1024, // reference panel proportions
    marginTop: 14,
    position: "relative",
  },
  panelImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  // Inner content sits inside the painted steel border — proportional padding
  panelInner: {
    position: "absolute",
    top: "5%", left: "7%", right: "7%", bottom: "5%",
    gap: 10,
  },

  // ---- Tabs ----
  tabsRow: { flexDirection: "row", gap: 6 },
  tabWrap: { flex: 1, aspectRatio: 367 / 102, position: "relative" },
  tabImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  tabTextWrap: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
  },

  // ---- Labels + Inputs ----
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  labelDash: { flex: 1, height: 1, backgroundColor: "#FF6A00", opacity: 0.45 },
  inputWrap: { aspectRatio: 681 / 111, position: "relative" },
  inputImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  inputTextWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    paddingLeft: 14, paddingRight: 14,
  },
  input: { color: "#F2F2F2", fontSize: 15, fontWeight: "500", paddingVertical: 0 },

  // ---- Password row (input + eye button) ----
  passRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eyeBtn: {
    width: 44, height: 44,
    alignItems: "center", justifyContent: "center",
    borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,106,0,0.6)",
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  // ---- Banner ----
  banner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 4, borderWidth: 1,
    backgroundColor: "rgba(220,53,69,0.20)",
  },

  // ---- SIGN IN button ----
  signBtnWrap: { width: "100%", aspectRatio: 749 / 111, marginTop: 6, position: "relative" },
  signBtnImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  signBtnTextWrap: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
  },

  // ---- Forgot + biometric + footer ----
  forgotRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  forgotLine: { flex: 1, height: 1, backgroundColor: "#FF6A00", opacity: 0.45 },
  bioBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 10, marginTop: 2,
    borderWidth: 1, borderColor: "#FF6A00", borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  footerNotice: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 8, paddingHorizontal: 10, marginTop: 2,
    borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
});
