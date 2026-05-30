// =============================================================================
// login.tsx — Toolbox Vault industrial sign-in (composed from texture assets)
// -----------------------------------------------------------------------------
// Layered architecture:
//   1) industrial-bg.jpg     — full-screen steel/gears/diamond-plate texture
//   2) logo-badge.jpg        — octagonal forged-steel emblem (Image, centered)
//   3) Native <Text> for TOOLBOX VAULT title + subtitle (perfect typography)
//   4) panel-frame.jpg       — bolted maintenance-door frame wraps the form
//   5) Native tabs / labels / TextInputs / icons on top of the panel
//   6) button-texture.jpg    — orange worn-metal SIGN IN button background
//
// All text rendered with real <Text> components → perfect on every device.
// Layout uses Flexbox + safe-area insets → scales on phones, tablets, web.
// All auth logic (biometric, login/register/forgot, error/info banners)
// is preserved from the previous version.
// =============================================================================

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  ImageBackground,
  Image,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  useFonts as useBlackOps,
  BlackOpsOne_400Regular,
} from "@expo-google-fonts/black-ops-one";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { theme } from "../src/theme";
import { useAuth } from "../src/AuthContext";
import {
  getBiometricStatus,
  tryBiometricLogin,
  enableBiometric,
  hasBeenPromptedForBiometric,
  markBiometricPrompted,
} from "../src/biometric";

const C = {
  black: "#050505",
  steel: "#1A1A1A",
  gunmetal: "#2B2B2B",
  orange: "#FF6A00",
  orangeBright: "#FF7E1B",
  orangeDeep: "#D84E00",
  textWhite: "#F2F2F2",
  textMuted: "#8A8A8A",
  panelInset: "rgba(0,0,0,0.55)",
};

const BG = require("../assets/images/textures/industrial-bg.jpg");
const LOGO = require("../assets/images/textures/logo-badge.png");
const PANEL = require("../assets/images/textures/panel-frame.jpg");
const BTN_TEX = require("../assets/images/textures/button-texture.jpg");

export default function LoginScreen() {
  const router = useRouter();
  const { login, register } = useAuth();
  const { width: screenW, height: screenH } = useWindowDimensions();

  // Industrial typography — Black Ops One for the heavy stencil title,
  // Bebas Neue for labels and chrome text. Both fall back gracefully if
  // they haven't finished loading.
  const [fontsLoaded] = useBlackOps({
    BlackOpsOne_400Regular,
    BebasNeue_400Regular,
  });

  const [mode, setMode] = useState<"login" | "register">("login");
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

  // Responsive logo + title sizing — logo is intentionally larger so the
  // hammer+wrench reads cleanly.
  const logoSize = Math.min(screenW * 0.42, 200);
  const titleSize = Math.min(screenW * 0.115, 50);

  // Font family helpers — these return the loaded font, or a sane
  // platform fallback if Google Fonts haven't loaded yet.
  const titleFont = fontsLoaded
    ? "BlackOpsOne_400Regular"
    : Platform.select({ ios: "Impact", android: "sans-serif-condensed", default: "Impact" });
  const labelFont = fontsLoaded
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
    if (mode === "register" && password.length < 6)
      return setErr("Password must be at least 6 characters");
    setBusy(true);
    try {
      if (mode === "register") {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
      await maybeOfferBiometricEnrol(email, password);
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ImageBackground source={BG} style={StyleSheet.absoluteFill} resizeMode="cover">
        {/* darkening vignette so foreground content is legible on bright spots */}
        <View style={styles.bgVignette} pointerEvents="none" />

        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
          >
            <ScrollView
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {/* ============== LOGO BADGE ============== */}
              <View style={styles.logoWrap}>
                <Image
                  source={LOGO}
                  style={{ width: logoSize, height: logoSize }}
                  resizeMode="contain"
                />
              </View>

              {/* ============== TITLE TOOLBOX|VAULT ============== */}
              <View style={styles.titleRow}>
                {/* Left trim wing */}
                <View style={styles.wingLeft} />
                <View style={styles.titleTextWrap}>
                  {/* Drop shadow layer (offset down/right, dark) */}
                  <Text
                    style={[
                      styles.titleShadow,
                      { fontSize: titleSize, fontFamily: titleFont },
                    ]}
                  >
                    TOOLBOX <Text style={{ color: "#7a3500" }}>VAULT</Text>
                  </Text>
                  {/* Foreground layer with metallic gradient feel */}
                  <Text
                    style={[
                      styles.titleFront,
                      { fontSize: titleSize, fontFamily: titleFont },
                    ]}
                  >
                    <Text style={styles.titleSilver}>TOOLBOX</Text>{" "}
                    <Text style={styles.titleOrange}>VAULT</Text>
                  </Text>
                  {/* Subtle scratch overlay using mid-gray opacity */}
                  <Text
                    style={[
                      styles.titleScratch,
                      { fontSize: titleSize, fontFamily: titleFont },
                    ]}
                    pointerEvents="none"
                  >
                    TOOLBOX VAULT
                  </Text>
                </View>
                {/* Right trim wing */}
                <View style={styles.wingRight} />
              </View>

              {/* ============== SUBTITLE ============== */}
              <View style={styles.subtitleRow}>
                <Text style={[styles.subtitleWord, { fontFamily: labelFont }]}>INVENTORY</Text>
                <View style={styles.subtitleDot} />
                <Text style={[styles.subtitleWord, { fontFamily: labelFont }]}>DEALERS</Text>
                <View style={styles.subtitleDot} />
                <Text style={[styles.subtitleWord, { fontFamily: labelFont }]}>WARRANTIES</Text>
                <View style={styles.subtitleDot} />
                <Text style={[styles.subtitleWord, { fontFamily: labelFont }]}>REPORTS</Text>
              </View>

              {/* ============== PANEL ============== */}
              <View style={styles.panelOuter}>
                <ImageBackground
                  source={PANEL}
                  resizeMode="stretch"
                  style={styles.panelImage}
                  imageStyle={styles.panelImageStyle}
                >
                  {/* Orange perimeter glow rendered in code (so accent color can change) */}
                  <View style={styles.panelOrangeBorder} pointerEvents="none" />

                  <View style={styles.panelInner}>
                    {/* ============== TABS ============== */}
                    <View style={styles.tabsRow}>
                      <TabButton
                        active={mode === "login"}
                        label="SIGN IN"
                        icon="person"
                        onPress={() => setMode("login")}
                      />
                      <TabButton
                        active={mode === "register"}
                        label="CREATE ACCOUNT"
                        icon="person-add"
                        onPress={() => setMode("register")}
                      />
                    </View>

                    {/* ============== ERROR/INFO BANNER ============== */}
                    {!!err && (
                      <View style={styles.banner}>
                        <Ionicons name="alert-circle" size={16} color="#fff" />
                        <Text style={styles.bannerText}>{err}</Text>
                      </View>
                    )}
                    {!!info && !err && (
                      <View style={[styles.banner, styles.bannerInfo]}>
                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        <Text style={styles.bannerText}>{info}</Text>
                      </View>
                    )}

                    {/* ============== NAME (register only) ============== */}
                    {mode === "register" && (
                      <View style={styles.field}>
                        <FieldLabel text="NAME" />
                        <ChamferedInput
                          icon="person-outline"
                          placeholder="Your name"
                          value={name}
                          onChangeText={setName}
                          autoCapitalize="words"
                        />
                      </View>
                    )}

                    {/* ============== EMAIL ============== */}
                    <View style={styles.field}>
                      <FieldLabel text="EMAIL" />
                      <ChamferedInput
                        icon="mail-outline"
                        placeholder="you@example.com"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        autoComplete="email"
                        keyboardType="email-address"
                      />
                    </View>

                    {/* ============== PASSWORD ============== */}
                    <View style={styles.field}>
                      <FieldLabel text="PASSWORD" />
                      <ChamferedInput
                        icon="lock-closed-outline"
                        placeholder="••••••••"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        rightAccessory={
                          <TouchableOpacity
                            onPress={() => setShowPassword((s) => !s)}
                            style={styles.eyeBtn}
                            activeOpacity={0.6}
                            testID="toggle-password"
                          >
                            <Ionicons
                              name={showPassword ? "eye-off" : "eye"}
                              size={18}
                              color={C.orange}
                            />
                          </TouchableOpacity>
                        }
                      />
                    </View>

                    {/* ============== SIGN IN BUTTON ============== */}
                    <TouchableOpacity
                      onPress={submit}
                      disabled={busy}
                      activeOpacity={0.8}
                      style={styles.signBtnWrap}
                      testID="auth-submit"
                    >
                      <ImageBackground
                        source={BTN_TEX}
                        resizeMode="cover"
                        style={styles.signBtn}
                        imageStyle={styles.signBtnImg}
                      >
                        {/* Bolts on each end */}
                        <View style={[styles.bolt, { left: 12 }]} />
                        <View style={[styles.bolt, { right: 12 }]} />
                        {busy ? (
                          <ActivityIndicator color="#000" />
                        ) : (
                          <View style={styles.signBtnContent}>
                            <Ionicons name="lock-closed" size={18} color="#000" />
                            <Text style={styles.signBtnText}>
                              {mode === "register" ? "CREATE ACCOUNT" : "SIGN IN"}
                            </Text>
                          </View>
                        )}
                      </ImageBackground>
                    </TouchableOpacity>

                    {/* ============== FORGOT PASSWORD ============== */}
                    {mode === "login" && (
                      <View style={styles.forgotRow}>
                        <View style={styles.forgotLine} />
                        <TouchableOpacity
                          onPress={() => router.push("/forgot-password")}
                          activeOpacity={0.6}
                          testID="forgot-password-link"
                        >
                          <Text style={styles.forgotText}>FORGOT PASSWORD?</Text>
                        </TouchableOpacity>
                        <View style={styles.forgotLine} />
                      </View>
                    )}

                    {/* ============== BIOMETRIC ============== */}
                    {mode === "login" &&
                      bio?.enabled &&
                      bio.hasHardware &&
                      bio.isEnrolled && (
                        <TouchableOpacity
                          style={styles.bioBtn}
                          onPress={runBiometricLogin}
                          disabled={busy}
                          testID="auth-biometric"
                        >
                          <Ionicons
                            name={
                              bio.label.toLowerCase().includes("face")
                                ? "scan"
                                : bio.label.toLowerCase().includes("touch") ||
                                  bio.label.toLowerCase().includes("finger")
                                ? "finger-print"
                                : "lock-closed"
                            }
                            size={16}
                            color={C.orange}
                          />
                          <Text style={styles.bioBtnText}>
                            SIGN IN WITH {bio.label.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      )}

                    {/* ============== FOOTER NOTICE ============== */}
                    {mode === "login" && (
                      <View style={styles.footerNotice}>
                        <Ionicons name="shield-checkmark" size={14} color={C.orange} />
                        <Text style={styles.footerText}>
                          New user? Use Create Account to get started for free.
                        </Text>
                      </View>
                    )}
                  </View>
                </ImageBackground>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function FieldLabel({ text }: { text: string }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{text}</Text>
      <View style={styles.labelDash} />
    </View>
  );
}

function ChamferedInput({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  autoCapitalize,
  autoComplete,
  keyboardType,
  rightAccessory,
}: any) {
  return (
    <View style={styles.inputOuter}>
      {/* Top-left orange L-bracket lighting */}
      <View style={styles.inputCornerTL} pointerEvents="none" />
      <View style={styles.inputInner}>
        <Ionicons name={icon} size={18} color={C.orange} style={styles.inputIcon} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(242,242,242,0.35)"
          style={styles.input}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          keyboardType={keyboardType}
        />
        {rightAccessory ?? null}
      </View>
    </View>
  );
}

function TabButton({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: any;
  onPress: () => void;
}) {
  if (active) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.tabActiveWrap}>
        <ImageBackground
          source={BTN_TEX}
          resizeMode="cover"
          style={styles.tabActive}
          imageStyle={styles.tabActiveImg}
        >
          <View style={[styles.boltTiny, { top: 4, left: 4 }]} />
          <View style={[styles.boltTiny, { top: 4, right: 4 }]} />
          <View style={[styles.boltTiny, { bottom: 4, left: 4 }]} />
          <View style={[styles.boltTiny, { bottom: 4, right: 4 }]} />
          <View style={styles.tabActiveContent}>
            <Ionicons name={icon} size={14} color="#000" />
            <Text style={styles.tabActiveLabel}>{label}</Text>
          </View>
        </ImageBackground>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={styles.tabInactive}>
      <Ionicons name={icon} size={14} color={C.textMuted} />
      <Text style={styles.tabInactiveLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.black },
  bgVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,5,5,0.45)",
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },

  // ---- LOGO ----
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 4,
  },

  // ---- TITLE ----
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -2,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  titleTextWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  titleFront: {
    fontWeight: "400",
    letterSpacing: 2.5,
    textAlign: "center",
  },
  titleSilver: {
    color: "#E8E8E8",
    // Multiple shadow layers create a metallic embossed look
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 2,
  },
  titleOrange: {
    color: "#FF7E1B",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 2,
  },
  titleShadow: {
    position: "absolute",
    top: 3,
    left: 3,
    color: "rgba(0,0,0,0.85)",
    fontWeight: "400",
    letterSpacing: 2.5,
    textAlign: "center",
  },
  titleScratch: {
    position: "absolute",
    top: -1,
    left: -1,
    color: "rgba(255,255,255,0.04)",
    fontWeight: "400",
    letterSpacing: 2.5,
    textAlign: "center",
  },
  // Legacy keys kept (used only if fonts haven't loaded yet)
  titleWord: {
    fontWeight: "900",
    letterSpacing: 3,
  },
  titleSpacer: { fontWeight: "900" },
  wingLeft: {
    flex: 1,
    height: 4,
    backgroundColor: C.orange,
    marginRight: 8,
    opacity: 0.75,
    borderRadius: 1,
    shadowColor: C.orange,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  wingRight: {
    flex: 1,
    height: 4,
    backgroundColor: C.orange,
    marginLeft: 8,
    opacity: 0.75,
    borderRadius: 1,
    shadowColor: C.orange,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },

  // ---- SUBTITLE ----
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    flexWrap: "wrap",
  },
  subtitleWord: {
    color: C.textWhite,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    marginHorizontal: 4,
  },
  subtitleDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.orange,
    shadowColor: C.orange,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },

  // ---- PANEL ----
  panelOuter: {
    flex: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  panelImage: {
    width: "100%",
    minHeight: 480,
    borderRadius: 6,
  },
  panelImageStyle: { borderRadius: 6 },
  panelOrangeBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderColor: C.orange,
    borderRadius: 6,
    shadowColor: C.orange,
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  panelInner: {
    padding: 18,
    gap: 12,
  },

  // ---- TABS ----
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  tabActiveWrap: { flex: 1, borderRadius: 4, overflow: "hidden" },
  tabActive: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  tabActiveImg: { borderRadius: 4 },
  tabActiveContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  tabActiveLabel: {
    color: "#000",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1.5,
  },
  tabInactive: {
    flex: 1,
    minHeight: 42,
    backgroundColor: C.gunmetal,
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tabInactiveLabel: {
    color: C.textMuted,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 1.5,
  },

  // ---- BANNER ----
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: "rgba(220,53,69,0.92)",
    borderColor: theme.colors.danger,
  },
  bannerInfo: {
    backgroundColor: "rgba(46,160,67,0.92)",
    borderColor: theme.colors.success,
  },
  bannerText: { flex: 1, color: "#fff", fontSize: 12, fontWeight: "700" },

  // ---- FIELD LABELS ----
  field: { gap: 4 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  labelDash: {
    flex: 1,
    height: 1,
    backgroundColor: C.orange,
    opacity: 0.6,
  },

  // ---- INPUTS ----
  inputOuter: {
    position: "relative",
    backgroundColor: C.panelInset,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(255,126,27,0.25)",
    overflow: "hidden",
  },
  inputCornerTL: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 22,
    height: 22,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: C.orange,
    borderTopLeftRadius: 3,
  },
  inputInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  inputIcon: { width: 22, textAlign: "center" },
  input: {
    flex: 1,
    color: C.textWhite,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.4,
    paddingVertical: 0,
  },
  eyeBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(255,106,0,0.4)",
    backgroundColor: "rgba(0,0,0,0.5)",
    marginRight: -4,
  },

  // ---- SIGN IN BUTTON ----
  signBtnWrap: {
    marginTop: 8,
    borderRadius: 6,
    overflow: "hidden",
    shadowColor: C.orange,
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  signBtn: {
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  signBtnImg: { borderRadius: 6 },
  signBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  signBtnText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 3,
    fontFamily: Platform.select({
      ios: "Impact",
      android: "sans-serif-condensed",
      default: "Impact",
    }),
  },

  // ---- BOLTS ----
  bolt: {
    position: "absolute",
    top: "50%",
    width: 14,
    height: 14,
    marginTop: -7,
    borderRadius: 7,
    backgroundColor: "#1A1A1A",
    borderWidth: 2,
    borderColor: "#3a3a3a",
  },
  boltTiny: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#3a3a3a",
  },

  // ---- FORGOT ----
  forgotRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  forgotLine: { flex: 1, height: 1, backgroundColor: C.orange, opacity: 0.4 },
  forgotText: {
    color: C.orange,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },

  // ---- BIOMETRIC ----
  bioBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.orange,
    borderRadius: 4,
    backgroundColor: "rgba(5,5,5,0.7)",
  },
  bioBtnText: {
    color: C.orange,
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1.4,
  },

  // ---- FOOTER ----
  footerNotice: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  footerText: {
    flex: 1,
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
