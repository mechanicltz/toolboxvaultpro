// =============================================================================
// login.tsx — Toolbox Vault Login
// -----------------------------------------------------------------------------
// Strategy:
//   • The reference artwork (full_reference_clean.jpg, 852x1847) is used as
//     the ENTIRE visual chrome: background, diamond plate, gears, logo,
//     TOOLBOX VAULT title, panel frame with bolts, tab plates, input frames,
//     and orange SIGN IN button. All baked-in TEXT/ICONS have been
//     programmatically erased from the chrome.
//   • Native React Native TextInput / Pressable / Text sit ON TOP of the
//     chrome at proportional pixel positions that match the reference.
//   • The whole screen is clamped to maxWidth on tablets so the chrome
//     doesn't stretch awkwardly — it stays a phone-shaped form, centered.
// =============================================================================

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
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

const REF = require("../assets/tbv/slices/full_reference_clean.jpg");

// Reference image dimensions — every Y/X below is a fraction of these.
const REF_W = 852;
const REF_H = 1847;
const REF_AR = REF_W / REF_H; // ~0.4613

// Pixel positions on the reference (used to compute % positions on the chrome).
// All values are in source-image pixels (852x1847).
// Y-coords for input/button BANDS are the FULL visible chrome frame, so the
// native overlay sits at the vertical CENTER of the chrome frame.
const COORDS = {
  tabs:        { top: 765, bottom: 860 },
  email_lbl:   { top: 880, bottom: 925 },
  email_in:    { top: 940, bottom: 1060 },     // full email frame
  pw_lbl:      { top: 1035, bottom: 1080 },
  pw_in:       { top: 1090, bottom: 1210 },    // full password frame (incl. eye chrome)
  signin_btn:  { top: 1278, bottom: 1395 },
  forgot:      { top: 1428, bottom: 1480 },
  footer:      { top: 1500, bottom: 1610 },
  // Horizontal partitions inside the panel
  tab_split:   { signin: [0.137, 0.539], create: [0.560, 0.875] }, // % of width
  field_l:     0.124, // labels start
  field_r:     0.890, // labels/inputs end
  eye_l:       0.846,
  eye_r:       0.928,
};

// Format: ratio of source image pixels (top/bottom Y → fraction of 1847)
const pctY = (v: number) => (v / REF_H) * 100;

export default function LoginScreen() {
  const router = useRouter();
  const { login, register } = useAuth();
  const { width: winW, height: winH } = useWindowDimensions();

  const [, ] = useGoogleFonts({
    BebasNeue_400Regular,
    Rajdhani_500Medium, Rajdhani_600SemiBold, Rajdhani_700Bold,
    Exo2_400Regular, Exo2_500Medium, Exo2_700Bold,
  });

  const [mode, setMode] = useState<"login" | "register">("login");
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

  // -------- Sizing -----------------------------------------------------------
  // Clamp the chrome to a sensible width so on tablets/web it stays
  // phone-shaped and centered.
  const MAX_W = 480;
  const chromeW = Math.min(winW, MAX_W);
  const chromeH = chromeW / REF_AR;
  // If the chrome would be taller than the window, we still let the scrollview
  // handle it — Vault feels best at full width on phones.

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
    if (mode === "register" && password.length < 6) return setErr("Password must be at least 6 characters");
    setBusy(true);
    try {
      if (mode === "register") await register(email, password, name);
      else await login(email, password);
      await maybeOfferBiometricEnrol(email, password);
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Something went wrong");
    } finally { setBusy(false); }
  };

  // Helper to position an element at a Y% range of the chrome.
  const yBand = (top: number, bottom: number) => ({
    position: "absolute" as const,
    top: `${pctY(top)}%` as any,
    height: `${pctY(bottom - top)}%` as any,
    left: 0,
    right: 0,
  });

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Centered chrome stack — clamped to MAX_W for tablets/web */}
            <View style={[styles.chrome, { width: chromeW, height: chromeH }]}>
              <Image
                source={REF}
                style={styles.chromeImage}
                resizeMode="cover"
              />
              <View style={StyleSheet.absoluteFill}>
                {/* =================== TABS  (login mode only — in register
                     mode the tabs row is replaced by a NAME field overlay) === */}
                {mode === "login" && (
                  <View style={yBand(COORDS.tabs.top, COORDS.tabs.bottom)}>
                  {/* SIGN IN tab — left side, hits the orange plate */}
                  <Pressable
                    onPress={() => setMode("login")}
                    testID="tab-login"
                    style={[
                      styles.tabHit,
                      {
                        left: `${COORDS.tab_split.signin[0] * 100}%`,
                        right: `${(1 - COORDS.tab_split.signin[1]) * 100}%`,
                      },
                    ]}
                  >
                    <Ionicons name="person" size={18}
                      color={mode === "login" ? "#FF6A00" : "#A8A8A8"} />
                    <Text style={[
                      styles.tabText,
                      { color: mode === "login" ? "#FF8533" : "#A8A8A8" }
                    ]}>SIGN IN</Text>
                  </Pressable>

                  {/* CREATE ACCOUNT tab — right side, hits the dark plate */}
                  <Pressable
                    onPress={() => setMode("register")}
                    testID="tab-register"
                    style={[
                      styles.tabHit,
                      {
                        left: `${COORDS.tab_split.create[0] * 100}%`,
                        right: `${(1 - COORDS.tab_split.create[1]) * 100}%`,
                      },
                    ]}
                  >
                    <Ionicons name="person-add" size={16}
                      color={mode === "register" ? "#FF6A00" : "#8A8A8A"} />
                    <Text style={[
                      styles.tabTextSm,
                      { color: mode === "register" ? "#FF6A00" : "#8A8A8A" }
                    ]}>CREATE ACCOUNT</Text>
                  </Pressable>
                </View>
                )}

                {/* =================== REGISTER-MODE TAB OVERLAY ============
                     When in register mode, paint an opaque NAME field over
                     the tabs row so the visual chrome doesn't show the old
                     tab plates underneath, and provide a small "Back to
                     Sign In" link to switch back. */}
                {mode === "register" && (
                  <View style={[
                    yBand(COORDS.tabs.top, COORDS.tabs.bottom),
                    {
                      paddingHorizontal: `${COORDS.field_l * 100}%`,
                      justifyContent: "center",
                      backgroundColor: "rgba(8,8,8,0.78)",
                    },
                  ]}>
                    <View style={styles.regHeader}>
                      <Text style={styles.regHeaderTitle}>CREATE ACCOUNT</Text>
                      <TouchableOpacity
                        onPress={() => setMode("login")}
                        activeOpacity={0.6}
                        hitSlop={8}
                        testID="back-to-signin"
                      >
                        <Text style={styles.regHeaderLink}>← SIGN IN</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* =================== EMAIL LABEL =================== */}
                <View style={[
                  yBand(COORDS.email_lbl.top, COORDS.email_lbl.bottom),
                  { paddingLeft: `${COORDS.field_l * 100}%`, justifyContent: "center" },
                ]}>
                  <Text style={styles.label}>EMAIL</Text>
                </View>

                {/* =================== EMAIL INPUT =================== */}
                <View style={[
                  yBand(COORDS.email_in.top, COORDS.email_in.bottom),
                  styles.inputRow,
                ]}>
                  <Ionicons name="mail-outline" size={20} color="#FF6A00"
                    style={{ marginLeft: 4 }} />
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

                {/* =================== PASSWORD LABEL =================== */}
                <View style={[
                  yBand(COORDS.pw_lbl.top, COORDS.pw_lbl.bottom),
                  { paddingLeft: `${COORDS.field_l * 100}%`, justifyContent: "center" },
                ]}>
                  <Text style={styles.label}>PASSWORD</Text>
                </View>

                {/* =================== PASSWORD INPUT =================== */}
                <View style={[
                  yBand(COORDS.pw_in.top, COORDS.pw_in.bottom),
                  styles.inputRow,
                  { right: `${(1 - COORDS.eye_l) * 100 + 1}%` }, // shorter so eye stays
                ]}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder=""
                    placeholderTextColor="rgba(242,242,242,0.42)"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    style={[styles.input, { paddingLeft: 12 }]}
                    testID="auth-password"
                  />
                </View>
                {/* Eye toggle — independent hit area over the eye-button chrome */}
                <View style={yBand(COORDS.pw_in.top, COORDS.pw_in.bottom)}>
                  <TouchableOpacity
                    onPress={() => setShowPassword(s => !s)}
                    activeOpacity={0.7}
                    testID="password-eye"
                    style={{
                      position: "absolute",
                      left: `${COORDS.eye_l * 100}%`,
                      right: `${(1 - COORDS.eye_r) * 100}%`,
                      top: 0, bottom: 0,
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Ionicons name={showPassword ? "eye-off" : "eye"} size={22} color="#FF6A00" />
                  </TouchableOpacity>
                </View>

                {/* =================== ERROR BANNER (above sign-in btn) =================== */}
                {!!err && (
                  <View style={[
                    {
                      position: "absolute",
                      top: `${pctY(COORDS.signin_btn.top - 50)}%`,
                      left: `${COORDS.field_l * 100}%`,
                      right: `${(1 - COORDS.field_r) * 100}%`,
                      height: 28,
                    },
                    styles.errorBanner,
                  ]}>
                    <Ionicons name="alert-circle" size={13} color="#FF6F61" />
                    <Text style={styles.errorText} numberOfLines={1}>{err}</Text>
                  </View>
                )}

                {/* =================== SIGN IN BUTTON =================== */}
                <View style={yBand(COORDS.signin_btn.top, COORDS.signin_btn.bottom)}>
                  <Pressable
                    onPress={submit}
                    disabled={busy}
                    testID="auth-submit"
                    style={({ pressed }) => [
                      styles.signinHit,
                      { opacity: pressed ? 0.75 : 1 },
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#0A0A0A" />
                    ) : (
                      <>
                        <Ionicons name="lock-closed" size={20} color="#0A0A0A" />
                        <Text style={styles.signinText}>
                          {mode === "register" ? "CREATE ACCOUNT" : "SIGN IN"}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>

                {/* =================== FORGOT PASSWORD =================== */}
                {mode === "login" && (
                  <View style={[
                    yBand(COORDS.forgot.top, COORDS.forgot.bottom),
                    { alignItems: "center", justifyContent: "center" },
                  ]}>
                    <TouchableOpacity
                      onPress={() => router.push("/forgot-password")}
                      activeOpacity={0.65}
                      testID="forgot-password-link"
                      hitSlop={12}
                    >
                      <Text style={styles.forgotText}>FORGOT PASSWORD?</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* =================== FOOTER NOTICE =================== */}
                <View style={[
                  yBand(COORDS.footer.top, COORDS.footer.bottom),
                  {
                    paddingLeft: `${COORDS.field_l * 100}%`,
                    paddingRight: `${(1 - COORDS.field_r) * 100}%`,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  },
                ]}>
                  <Ionicons name="shield-checkmark" size={18} color="#9A9A9A" />
                  <Text style={styles.footerText} numberOfLines={2}>
                    {mode === "login"
                      ? "New user? Use Create Account to get started for free."
                      : "Already have an account? Tap SIGN IN above."}
                  </Text>
                </View>

                {/* NAME field is collected later via profile — registration
                    on this screen uses email/password only so it fits the
                    existing chrome cleanly. */}
              </View>
            </View>

            {/* =================== BIOMETRIC ROW (outside chrome) =================== */}
            {mode === "login" && bio?.enabled && bio.hasHardware && bio.isEnrolled && (
              <TouchableOpacity
                onPress={runBiometricLogin}
                disabled={busy}
                style={[styles.bioBtn, { maxWidth: MAX_W }]}
                testID="auth-biometric"
                activeOpacity={0.7}
              >
                <Ionicons
                  name={
                    bio.label.toLowerCase().includes("face") ? "scan" :
                    bio.label.toLowerCase().includes("touch") ||
                    bio.label.toLowerCase().includes("finger") ? "finger-print" : "lock-closed"
                  }
                  size={18} color="#FF6A00"
                />
                <Text style={styles.bioText}>
                  {`SIGN IN WITH ${bio.label.toUpperCase()}`}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: 0,
  },

  chrome: {
    // width / height set inline based on screen size
    position: "relative",
    overflow: "hidden",
    zIndex: 1,
    // Force a new stacking context so the Image's internal negative
    // z-index doesn't fall behind the page root's black background.
  },
  chromeImage: {
    position: "absolute",
    top: 0, left: 0,
    width: "100%",
    height: "100%",
    zIndex: 0,
  },

  // ---- TABS --------------------------------------------------------------
  tabHit: {
    position: "absolute",
    top: 0, bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  tabText: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 18,
    letterSpacing: 1.5,
  },
  tabTextSm: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 14,
    letterSpacing: 1.2,
  },

  // ---- LABELS ------------------------------------------------------------
  label: {
    fontFamily: "Rajdhani_700Bold",
    fontSize: 13,
    letterSpacing: 2,
    color: "#D8D8D8",
  },

  // ---- INPUT ROW ---------------------------------------------------------
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: "13.5%",
    paddingRight: "12%",
    gap: 8,
  },
  input: {
    flex: 1,
    color: "#F2F2F2",
    fontFamily: "Exo2_500Medium",
    fontSize: 15,
    paddingVertical: 0,
    paddingLeft: 6,
    includeFontPadding: false,
  },

  // ---- SIGN IN BUTTON ----------------------------------------------------
  signinHit: {
    position: "absolute",
    top: 0, bottom: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  signinText: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 24,
    color: "#0A0A0A",
    letterSpacing: 3,
  },

  // ---- FORGOT ------------------------------------------------------------
  forgotText: {
    fontFamily: "Rajdhani_700Bold",
    color: "#FF6A00",
    fontSize: 13,
    letterSpacing: 2,
  },

  // ---- FOOTER ------------------------------------------------------------
  footerText: {
    flex: 1,
    fontFamily: "Exo2_400Regular",
    fontSize: 12,
    color: "#9A9A9A",
    lineHeight: 16,
  },

  // ---- ERROR BANNER ------------------------------------------------------
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    backgroundColor: "rgba(170,20,20,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,80,80,0.6)",
    borderRadius: 4,
  },
  errorText: {
    flex: 1,
    color: "#FFE0E0",
    fontFamily: "Exo2_500Medium",
    fontSize: 12,
  },

  // ---- NAME (register mode) ----------------------------------------------
  nameFrame: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,106,0,0.6)",
    backgroundColor: "rgba(8,8,8,0.85)",
  },

  // ---- Register-mode header (replaces tabs row) --------------------------
  regHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  regHeaderTitle: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 22,
    letterSpacing: 2.4,
    color: "#FF6A00",
  },
  regHeaderLink: {
    fontFamily: "Rajdhani_700Bold",
    fontSize: 13,
    letterSpacing: 1.5,
    color: "#A8A8A8",
  },

  // ---- BIOMETRIC --------------------------------------------------------
  bioBtn: {
    width: "92%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
    marginTop: 10,
    marginBottom: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#FF6A00",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  bioText: {
    fontFamily: "BebasNeue_400Regular",
    color: "#FF6A00",
    fontSize: 15,
    letterSpacing: 1.5,
  },
});
