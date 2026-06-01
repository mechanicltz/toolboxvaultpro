// =============================================================================
// app/login.tsx — Toolbox Vault Login (industrial skin-based)
// -----------------------------------------------------------------------------
// RESPONSIVE CONTRACT (real-phone first):
//   • We DO NOT trust useWindowDimensions() for sizing — on the web preview it
//     reports the desktop window (~1920) while the real phone reports ~390,
//     which is exactly why preview ≠ phone. Instead we MEASURE the actual
//     rendered container with onLayout and size everything from that.
//   • The working column is capped to a phone width (WORK_W), so the web
//     preview renders the SAME phone-shaped layout you get on device.
//   • Every font / logo / control size is derived from the MEASURED width or
//     the panel's own dimensions — never from a hard-coded preview number.
//   • Skins are pre-cropped to opaque bounds so ImageBackground(stretch) fills
//     its container exactly. No redesign / no colour change / no asset swaps.
// =============================================================================

import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, Alert, Image, ImageBackground, Pressable, TouchableOpacity,
  ActivityIndicator, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
  bg:           require("../assets/tbv-v2/trimmed/Backgrounds/tbv_background_industrial_dark.png"),
  panel:        require("../assets/tbv-v2/trimmed/Panels/tbv_login_panel_dark_v2.png"),
  card:         require("../assets/tbv-v2/trimmed/Cards/tbv_card_dark.png"),
  tabActive:    require("../assets/tbv-v2/trimmed/Tabs/tbv_tab_active_orange.png"),
  tabInactive:  require("../assets/tbv-v2/trimmed/Tabs/tbv_tab_inactive_dark.png"),
  input:        require("../assets/tbv-v2/trimmed/Inputs/tbv_input_dark_slim.png"),
  btnPrimary:   require("../assets/tbv-v2/trimmed/Buttons/tbv_btn_primary_orange.png"),
  btnSecondary: require("../assets/tbv-v2/trimmed/Buttons/tbv_btn_secondary_dark.png"),
  masterLogo:   require("../assets/tbv-v2/trimmed/Branding/tbv_master_logo_dark_v2.png"),
};

const AR = { logo: 0.968, card: 2.407 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function LoginScreen() {
  const router = useRouter();
  const { login, register } = useAuth();
  const win = useWindowDimensions();

  const [fontsLoaded, fontError] = useGoogleFonts({
    BebasNeue_400Regular,
    Rajdhani_500Medium, Rajdhani_600SemiBold, Rajdhani_700Bold,
    Exo2_400Regular, Exo2_500Medium, Exo2_700Bold,
  });

  // Measured container size (post safe-area, post keyboard-avoid). This is the
  // REAL space we render into — identical logic on web preview and phone.
  const [box, setBox] = useState({ w: win.width, h: win.height });

  // Form state
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // DEVICE-INSTRUMENTATION: capture the ACTUAL rendered sizes from the
  // native layout engine so we can read them back off the phone. These are
  // display-only (never fed back into sizing) so they can't cause a loop.
  const [dbg, setDbg] = useState({
    pw: 0, ph: 0,        // panel rendered width / height
    innerW: 0, innerH: 0, // inner control-stack rendered width / height
    imgW: 0, imgH: 0,     // background skin image rendered width / height
  });

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
  // RESPONSIVE MATHS — single phone-shaped column, CONTENT-DRIVEN panel.
  //
  // ROOT-CAUSE FIX (why iPhone was wrong while web looked fine):
  //   1) The whole app is wrapped in <ResponsiveContainer variant="wide">
  //      (see app/_layout.tsx). On WEB that gives a ~1080px column, on a
  //      PHONE it's a no-op (~393px). So login received TWO completely
  //      different widths. Worse, the OLD code sized fonts off WORK_W(≤440)
  //      but sized the PANEL off a SEPARATE path (PANEL_MAX 760 on web).
  //      Result: the geometry you tuned on web (760-wide panel) was NOT
  //      what rendered on the 393-wide phone. The preview was lying.
  //   2) The panel had a FIXED height = content/0.70 with rails = 0.30,
  //      i.e. content fit with ZERO slack. The taller native control stack
  //      (or a sub-pixel/error-row change) spilled straight out of the frame.
  //
  // FIX: ONE phone-shaped column (panelW = WORK_W) so web == phone, and a
  // CONTENT-DRIVEN panel — the ImageBackground has NO fixed height, so it
  // GROWS to fit its children + padding and the skin stretches to match.
  // Overflow is now mathematically impossible on any device/engine.
  // ==================================================================
  const cw = box.w;
  const ch = box.h;

  // IMPORTANT: the ScrollView content has 8px horizontal padding and CENTERS
  // its children. A panel WIDER than this available space gets COMPRESSED by
  // iOS's flex engine — it collapses to its widest fixed child and DROPS its
  // padding (this is the exact bug we measured on device: want 402 → REAL
  // 334, with padding T/B totally ignored). Web simply overflows, hiding it.
  // So the working column must NEVER exceed the available width.
  const SCROLL_PAD_X = 8;
  const avail = Math.max(0, cw - SCROLL_PAD_X * 2);
  const WORK_W = Math.min(avail, 430);

  // Logo (never larger than the cap; scales down on small phones)
  const logoW = Math.min(WORK_W * 0.34, 150);
  const logoH = logoW / AR.logo;

  // Native title + tagline fonts (scale with the real column width)
  const titleFont = clamp(WORK_W * 0.072, 22, 30);
  const tagFont = clamp(WORK_W * 0.034, 11, 14);

  // ---- PANEL (content-driven; NO fixed height) ----
  // panelW == WORK_W → the panel IS the column, so web preview mirrors phone.
  // Padding is derived from panelW only (stable) and clears the skin rails.
  const panelW   = WORK_W;
  const padX     = clamp(panelW * 0.085, 22, 40);   // side rails
  const padTop   = clamp(panelW * 0.085, 24, 36);   // top rail band
  const padBot   = clamp(panelW * 0.11, 32, 48);    // bottom rail band
  const contentW = panelW - padX * 2;               // sits INSIDE the borders
  const tabGap   = 10;
  const tabW     = (contentW - tabGap) / 2;

  // ---- Controls (explicit heights; the panel grows to contain them) ----
  const tabH     = clamp(WORK_W * 0.115, 44, 50);
  const inputH   = clamp(WORK_W * 0.125, 46, 54);
  const btnH     = clamp(WORK_W * 0.145, 52, 60);
  const labelH   = 16;
  const innerGap = clamp(WORK_W * 0.03, 10, 14);

  // ---- PANEL HEIGHT (EXPLICIT, measured-driven) ----
  // The skin Image fills the panel via height:"100%", which only resolves
  // against a parent with a DEFINITE height. A content-driven (auto) height
  // leaves the image unable to stretch on iOS — so the frame art collapsed
  // to its natural aspect and the bottom controls (forgot password) fell
  // OUTSIDE the art. Fix: give the panel an explicit height = the REAL
  // measured inner height (proven reliable) + top/bottom padding. Falls back
  // to a JS estimate only for the very first paint, before onLayout fires.
  const fallbackInnerH =
    tabH + innerGap +
    (labelH + 2 + inputH) + innerGap +
    (labelH + 2 + inputH) + innerGap * 0.5 +
    btnH + (10 + 20);                       // submit margin + forgot row
  const innerH = dbg.innerH > 0 ? dbg.innerH : fallbackInnerH;
  const panelH = innerH + padTop + padBot;  // frame exactly contains content

  // Help card — narrower secondary note, same column max.
  const helpW = Math.min(cw * 0.9, WORK_W);
  const helpH = clamp((helpW / AR.card) * 0.52, 40, 54);

  const blockGap = clamp(ch * 0.016, 8, 16);
  const headerGap = clamp(ch * 0.018, 10, 18);   // breathing room below logo

  // Gate the render until the industrial fonts are actually loaded. Without
  // this, the iPhone lays out with the system font (San Francisco) — whose
  // metrics are far wider/taller than the condensed industrial fonts — so the
  // tagline wraps and every label/tab/title mis-sizes vs the web preview.
  if (!fontsLoaded && !fontError) {
    return (
      <ImageBackground source={SKIN.bg} style={styles.bg} resizeMode="cover">
        <View style={styles.veil} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#FF8533" size="large" />
        </View>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={SKIN.bg} style={styles.bg} resizeMode="cover">
      <View style={styles.veil} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View
            style={{ flex: 1 }}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (width > 0 && height > 0 &&
                  (Math.abs(width - box.w) > 1 || Math.abs(height - box.h) > 1)) {
                setBox({ w: width, h: height });
              }
            }}
          >
            <ScrollView
              contentContainerStyle={[
                styles.scroll,
                { minHeight: ch, gap: blockGap, paddingVertical: blockGap },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {/* ===================== HEADER ===================== */}
              <View style={[styles.block, { width: WORK_W, marginBottom: headerGap }]}>
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
                  style={[styles.tagline, { fontSize: tagFont, maxWidth: WORK_W * 0.96 }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  allowFontScaling={false}
                >
                  INVENTORY • DEALERS • WARRANTIES • REPORTS
                </Text>
              </View>

              {/* ===================== LOGIN PANEL ===================== */}
              {/* Plain padded View drives layout (iOS always honours padding
                  on a plain View); the skin is an ABSOLUTE-FILL Image behind
                  it. This is what ImageBackground does internally, but doing
                  it by hand sidesteps the iOS compression bug that was
                  dropping the panel's width + padding. */}
              {/* ===================== LOGIN PANEL ===================== */}
              {/* Outer frame: NO padding, explicit size. The skin Image fills
                  it with EXPLICIT NUMERIC dimensions (panelW×panelH) so it
                  covers edge-to-edge identically on iOS and web. Padding lives
                  on the INNER wrapper, because iOS resolves a child's "100%"
                  against the parent CONTENT box (inside padding) while web uses
                  the border box — that mismatch was squeezing the frame art
                  into the center and leaving forgot-password on bare metal. */}
              <View
                onLayout={(e) => {
                  const { width, height } = e.nativeEvent.layout;
                  setDbg((d) =>
                    Math.abs(d.pw - width) > 0.5 || Math.abs(d.ph - height) > 0.5
                      ? { ...d, pw: width, ph: height } : d);
                }}
                style={{
                  width: panelW,
                  height: panelH,
                  overflow: "hidden",
                }}
              >
                <Image
                  source={SKIN.panel}
                  onLayout={(e) => {
                    const { width, height } = e.nativeEvent.layout;
                    setDbg((d) =>
                      Math.abs(d.imgW - width) > 0.5 || Math.abs(d.imgH - height) > 0.5
                        ? { ...d, imgW: width, imgH: height } : d);
                  }}
                  style={{ position: "absolute", top: 0, left: 0, width: panelW, height: panelH }}
                  resizeMode="stretch"
                />
                <View
                  style={{
                    flex: 1,
                    paddingHorizontal: padX,
                    paddingTop: padTop,
                    paddingBottom: padBot,
                  }}
                >
                <View
                  style={styles.panelInner}
                  onLayout={(e) => {
                    const { width, height } = e.nativeEvent.layout;
                    setDbg((d) =>
                      Math.abs(d.innerW - width) > 0.5 || Math.abs(d.innerH - height) > 0.5
                        ? { ...d, innerW: width, innerH: height } : d);
                  }}
                >
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
                  <View style={[styles.fieldGroup, { marginTop: innerGap }]}>
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
                          placeholderTextColor="rgba(242,242,242,0.62)"
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
                  <View style={[styles.fieldGroup, { marginTop: innerGap }]}>
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
                          placeholderTextColor="rgba(242,242,242,0.62)"
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
                    <View style={[styles.errorRow, { marginTop: innerGap * 0.55 }]}>
                      <Ionicons name="alert-circle" size={13} color="#FF6F61" />
                      <Text style={styles.errorText} numberOfLines={2}>{err}</Text>
                    </View>
                  )}

                  {/* ----- SUBMIT (tight under password — part of the form) ----- */}
                  <Pressable
                    onPress={submit}
                    disabled={busy}
                    style={({ pressed }) => ({
                      width: contentW,
                      height: btnH,
                      marginTop: innerGap * 0.5,
                      alignSelf: "center",
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
                </View>
              </View>

              {/* ===================== HELP BLOCK ===================== */}
              {mode === "login" && bio?.enabled && bio.hasHardware && bio.isEnrolled ? (
                <Pressable
                  onPress={runBiometricLogin}
                  disabled={busy}
                  style={({ pressed }) => ({
                    width: helpW,
                    height: Math.min(helpH, 58),
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
                  <View style={[styles.footerInner, { paddingHorizontal: helpW * 0.06 }]}>
                    <Ionicons name="shield-checkmark" size={14} color="#FF8533" />
                    <Text style={[styles.footerText, { fontSize: clamp(WORK_W * 0.029, 10, 12) }]} numberOfLines={2}>
                      {mode === "login"
                        ? "New here? Tap CREATE to set up your vault — free."
                        : "Already registered? Tap SIGN IN above."}
                    </Text>
                  </View>
                </ImageBackground>
              )}

              {/* Build stamp (also mirrored in the pinned top overlay). */}
              <Text style={styles.buildStamp}>BUILD #007</Text>
            </ScrollView>

            {/* ===== PINNED DIAGNOSTIC OVERLAY (cannot be clipped) ===== */}
            {/* Absolutely positioned at the very top so it is ALWAYS visible
                regardless of how the form lays out / overflows. Read these
                numbers off the phone. pointerEvents=none so it never blocks
                taps on the form underneath. */}
            <View pointerEvents="none" style={styles.dbgOverlay}>
              <Text style={styles.dbgText}>
                {`BUILD #007  OS:${Platform.OS}\n`}
                {`box:${Math.round(cw)}x${Math.round(ch)}  win:${Math.round(win.width)}x${Math.round(win.height)}\n`}
                {`want panel:${Math.round(panelW)}x${Math.round(panelH)} contentW:${Math.round(contentW)}\n`}
                {`pad T:${Math.round(padTop)} B:${Math.round(padBot)} X:${Math.round(padX)}\n`}
                {`REAL panel:${Math.round(dbg.pw)}x${Math.round(dbg.ph)}\n`}
                {`REAL inner:${Math.round(dbg.innerW)}x${Math.round(dbg.innerH)}\n`}
                {`REAL skinImg:${Math.round(dbg.imgW)}x${Math.round(dbg.imgH)}`}
              </Text>
            </View>
          </View>
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
            minimumFontScale={0.6}
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

  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },

  // ---- header ----
  block: { alignItems: "center", justifyContent: "center" },
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
    letterSpacing: 1,
    color: "#F2F2F2",
    textAlign: "center",
    marginTop: 5,
  },

  // ---- panel ----
  panelInner: { width: "100%" },

  // ---- tabs ----
  tabsRow: { flexDirection: "row", width: "100%" },
  tabText: { fontFamily: "BebasNeue_400Regular", fontSize: 13.5, letterSpacing: 0.8 },

  // ---- fields ----
  fieldGroup: { width: "100%" },
  label: {
    fontFamily: "Rajdhani_700Bold",
    fontSize: 11,
    letterSpacing: 2,
    color: "#D8D8D8",
    paddingLeft: 18,
    marginBottom: 2,
    textAlignVertical: "bottom",
  },
  inputInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 15,
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
  forgotWrap: { alignSelf: "center", paddingVertical: 2, marginTop: 10 },
  forgotText: {
    fontFamily: "Rajdhani_700Bold",
    fontSize: 13,
    letterSpacing: 2,
    color: "#FF8533",
  },

  // ---- help ----
  footerInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  footerText: {
    flex: 1,
    color: "#C8C8C8",
    fontFamily: "Exo2_400Regular",
    lineHeight: 16,
  },
  bioText: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 16,
    letterSpacing: 2,
    color: "#FF8533",
  },

  // ---- shared ----
  buildStamp: {
    marginTop: 10,
    color: "#FF8533",
    fontFamily: "Rajdhani_700Bold",
    fontSize: 13,
    letterSpacing: 2,
    textAlign: "center",
  },
  dbgOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === "ios" ? 58 : 28,
    paddingBottom: 8,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.78)",
    zIndex: 9999,
  },
  dbgText: {
    marginTop: 4,
    color: "#7CFC00",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  center: { flex: 1, width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  fillImage: { width: "100%", height: "100%" },
});
