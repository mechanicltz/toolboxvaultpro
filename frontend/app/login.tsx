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
import { useTbvSkinsReady } from "../src/tbv/useTbvSkins";
import { useSkin, useColors } from "../src/themeContext";
import { HEADER_SRC_BY_COLOR, HEADER_ASPECT } from "../src/tbv/header";
import { SILVER_SRC_BY_COLOR } from "../src/tbv/silver";
import { BUTTON_SRC_BY_COLOR } from "../src/tbv/button";
import { useSteelPanelFrame } from "../src/tbv/steel";
import TbvFrame from "../src/tbv/components/TbvFrame";
import { APP_VERSION_LABEL } from "../src/version";
// Shared, colour-variant-aware skin map (orange ↔ pink). The login screen is
// LOCKED to the industrial look but MUST honour the Industrial-Pink variant,
// so it pulls the same Proxy every other screen uses instead of a hardcoded
// orange require() map.
import { SKIN, getIndustrialVariant, VARIANT_ACCENT } from "../src/tbv/skins";

const AR = { logo: 0.968, card: 2.407, nameplate: 3.746 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Screen backdrop. Plain (Light/Dark) themes paint a flat theme colour exactly
// like every other in-app screen; Steel and Iron Forge keep the industrial
// background art.
function ScreenBg({
  plain,
  bg,
  children,
}: {
  plain: boolean;
  bg: string;
  children: React.ReactNode;
}) {
  if (plain) {
    return <View style={{ flex: 1, backgroundColor: bg }}>{children}</View>;
  }
  return (
    <ImageBackground source={SKIN.bg} style={{ flex: 1 }} resizeMode="cover">
      {children}
    </ImageBackground>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { login, register } = useAuth();
  const win = useWindowDimensions();

  const [fontsLoaded, fontError] = useGoogleFonts({
    BebasNeue_400Regular,
    Rajdhani_500Medium, Rajdhani_600SemiBold, Rajdhani_700Bold,
    Exo2_400Regular, Exo2_500Medium, Exo2_700Bold,
  });
  const skinsReady = useTbvSkinsReady();
  const c = useColors();
  const { metalStyle, industrialVariant, skin: loginSkin, appearance } = useSkin();
  const isPlain = loginSkin === "plain";
  const isSteel = !isPlain && metalStyle === "steel";
  const kind: "plain" | "steel" | "iron" = isPlain ? "plain" : isSteel ? "steel" : "iron";
  // The brushed-silver nameplate is shared by Steel AND Plain (matching the
  // in-app IndustrialBanner): Light → arctic plate, Dark → orange plate.
  const useSteelArt = isSteel || isPlain;
  const headerVariant = isPlain
    ? (appearance === "light" ? "arctic" : "orange")
    : industrialVariant;
  const steelPanel = useSteelPanelFrame();
  const nameplateSrc = useSteelArt ? HEADER_SRC_BY_COLOR[headerVariant] : SKIN.nameplate;
  const panelSrc = isSteel ? SILVER_SRC_BY_COLOR[headerVariant] : SKIN.panel;

  // Accent tint: plain → theme accent; steel → steel colour; iron → orange/variant.
  const TINT = isPlain
    ? c.accent
    : isSteel
      ? VARIANT_ACCENT[headerVariant]
      : (industrialVariant === "orange" ? "#FF8533" : VARIANT_ACCENT[industrialVariant]);
  const steelBtnSrc = BUTTON_SRC_BY_COLOR[headerVariant] ?? BUTTON_SRC_BY_COLOR.orange;

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

  // Device-measured height of the panel's inner control stack. Drives the
  // panel's explicit height so the frame always wraps the controls exactly.
  const [measuredInnerH, setMeasuredInnerH] = useState(0);

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
  const logoW = Math.min(WORK_W * 0.30, 132);
  const logoH = logoW / AR.logo;

  // Metal "TOOLBOX VAULT" nameplate (wordmark) — wide horizontal plaque.
  const nameplateW = Math.min(WORK_W * 0.94, 400);
  const nameplateH = nameplateW / (useSteelArt ? HEADER_ASPECT : AR.nameplate);

  // Native title + tagline fonts (scale with the real column width)
  const titleFont = clamp(WORK_W * 0.072, 22, 30);
  const tagFont = clamp(WORK_W * 0.034, 11, 14);

  // ---- PANEL (explicit height; see PANEL HEIGHT block below) ----
  // panelW == WORK_W → the panel IS the column, so web preview mirrors phone.
  // Padding clears the thick metal rails of the skin so the controls sit
  // INSIDE the frame's inner screen (not on top of the bolted borders).
  const panelW   = WORK_W;
  const padX     = clamp(panelW * 0.125, 38, 58);   // side rails (wide, insets inputs)
  const padTop   = clamp(panelW * 0.225, 66, 94);   // top rail band (taller panel)
  const padBot   = clamp(panelW * 0.255, 78, 110);  // bottom rail band (taller panel)
  const contentW = panelW - padX * 2;               // sits INSIDE the borders
  // EMAIL / PASSWORD fields span the FULL content width so every row — tabs
  // (top), inputs (middle), and the SIGN IN button (bottom) — share the exact
  // same width and left/right edges.
  const fieldInset = 0;
  const fieldW = contentW;
  const tabGap   = 3;                                // tabs almost touch in the center
  const tabW     = (contentW - tabGap) / 2;

  // ---- Controls (explicit heights; the panel grows to contain them) ----
  const tabH     = clamp(WORK_W * 0.115, 44, 50);
  const inputH   = clamp(WORK_W * 0.125, 46, 54);
  const btnH     = clamp(WORK_W * 0.145, 52, 60);
  const labelH   = 16;
  const innerGap = clamp(WORK_W * 0.027, 9, 13);    // a touch more room between controls

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
  const innerH = measuredInnerH > 0 ? measuredInnerH : fallbackInnerH;
  const panelH = innerH + padTop + padBot;  // frame exactly contains content

  // Help card — narrower secondary note, same column max.
  const helpW = Math.min(cw * 0.9, WORK_W);
  const helpH = clamp((helpW / AR.card) * 0.52, 40, 54);

  const blockGap = clamp(ch * 0.01, 5, 11);
  const headerGap = clamp(ch * 0.018, 10, 18);   // breathing room below logo
  const topPad = clamp(ch * 0.035, 14, 44);      // shifts the whole stack toward the top

  // Gate the render until the industrial fonts AND skins are loaded. Without
  // this, the iPhone lays out with the system font (San Francisco) — whose
  // metrics are far wider/taller than the condensed industrial fonts — so the
  // tagline wraps and every label/tab/title mis-sizes vs the web preview.
  // We also wait for the image skins to decode so the panel/background art
  // never "pops in" after the layout has already painted.
  if ((!fontsLoaded && !fontError) || !skinsReady) {
    return (
      <ScreenBg plain={isPlain} bg={c.bg}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={TINT} size="large" />
        </View>
      </ScreenBg>
    );
  }

  return (
    <ScreenBg plain={isPlain} bg={c.bg}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
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
                { minHeight: ch, gap: blockGap, paddingTop: topPad, paddingBottom: blockGap },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              automaticallyAdjustKeyboardInsets={true}
            >
              {/* ===================== HEADER ===================== */}
              <View style={[styles.block, { width: WORK_W, marginBottom: headerGap * 0.3 }]}>
                <Image
                  source={SKIN.masterLogo}
                  style={{ width: logoW, height: logoH }}
                  resizeMode="contain"
                />
                <View style={{ width: nameplateW, height: nameplateH, marginTop: headerGap * 0.08 }}>
                  <Image
                    source={nameplateSrc}
                    style={{ width: nameplateW, height: nameplateH }}
                    resizeMode="contain"
                  />
                  {/* Version — centered over the small plate near the bottom of
                      the nameplate art, matching the in-app IndustrialBanner. */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: nameplateH * 0.735,
                      height: nameplateH * 0.19,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: TINT,
                        fontSize: Math.round(nameplateH * 0.13),
                        fontWeight: "800",
                        letterSpacing: 1,
                      }}
                      allowFontScaling={false}
                    >
                      {APP_VERSION_LABEL}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[styles.tagline, { fontSize: tagFont, maxWidth: WORK_W * 0.96, marginTop: headerGap * 0.06 }, isPlain && { color: c.textSecondary }]}
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
                style={
                  isPlain
                    ? { width: panelW, minHeight: panelH, backgroundColor: c.bgSecondary, borderColor: c.border, borderWidth: 1, borderRadius: 14, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }
                    : { width: panelW, height: panelH, overflow: "hidden" }
                }
              >
                {kind === "steel" ? (
                  <View style={{ position: "absolute", top: 0, left: 0, width: panelW }}>
                    <TbvFrame
                      source={panelSrc}
                      capInsets={steelPanel.capInsets}
                      frameScale={steelPanel.frameScale}
                      padX={0}
                      padTop={0}
                      padBottom={0}
                    >
                      <View style={{ height: panelH }} />
                    </TbvFrame>
                  </View>
                ) : kind === "iron" ? (
                  <Image
                    source={panelSrc}
                    style={{ position: "absolute", top: 0, left: 0, width: panelW, height: panelH }}
                    resizeMode="stretch"
                  />
                ) : null}
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
                    const h = e.nativeEvent.layout.height;
                    if (Math.abs(h - measuredInnerH) > 0.5) setMeasuredInnerH(h);
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
                      kind={kind}
                      tint={TINT}
                      c={c}
                      steelSrc={steelBtnSrc}
                      testID="tab-login"
                    />
                    <TabButton
                      label="CREATE ACCOUNT"
                      width={tabW}
                      active={mode === "register"}
                      onPress={() => setMode("register")}
                      kind={kind}
                      tint={TINT}
                      c={c}
                      steelSrc={steelBtnSrc}
                      activeSkin={SKIN.tabActive}
                      inactiveSkin={SKIN.tabInactive}
                      testID="tab-register"
                    />
                  </View>

                  {/* ----- EMAIL ----- */}
                  <View style={[styles.fieldGroup, { marginTop: innerGap, paddingHorizontal: fieldInset }]}>
                    <Text style={[styles.label, { height: labelH }, isPlain && { color: c.textSecondary }]}>EMAIL</Text>
                    <FieldShell kind={kind} tint={TINT} c={c} width={fieldW} height={inputH}>
                      <View style={styles.inputInner}>
                        <Ionicons name="mail-outline" size={17} color={TINT} />
                        <TextInput
                          value={email}
                          onChangeText={setEmail}
                          placeholder="you@example.com"
                          placeholderTextColor={isPlain ? c.textMuted : "rgba(242,242,242,0.62)"}
                          autoCapitalize="none"
                          autoComplete="email"
                          keyboardType="email-address"
                          style={[styles.input, isPlain && { color: c.textPrimary }]}
                          testID="auth-email"
                        />
                      </View>
                    </FieldShell>
                  </View>

                  {/* ----- PASSWORD ----- */}
                  <View style={[styles.fieldGroup, { marginTop: innerGap, paddingHorizontal: fieldInset }]}>
                    <Text style={[styles.label, { height: labelH }, isPlain && { color: c.textSecondary }]}>PASSWORD</Text>
                    <FieldShell kind={kind} tint={TINT} c={c} width={fieldW} height={inputH}>
                      <View style={styles.inputInner}>
                        <Ionicons name="lock-closed-outline" size={17} color={TINT} />
                        <TextInput
                          value={password}
                          onChangeText={setPassword}
                          placeholder="••••••••"
                          placeholderTextColor={isPlain ? c.textMuted : "rgba(242,242,242,0.62)"}
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                          style={[styles.input, isPlain && { color: c.textPrimary }]}
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
                            color={TINT}
                          />
                        </TouchableOpacity>
                      </View>
                    </FieldShell>
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
                    {kind === "plain" ? (
                      <View style={[styles.center, { backgroundColor: c.bgSecondary, borderRadius: 10, borderWidth: 1, borderColor: c.border, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 }]}>
                        {busy ? (
                          <ActivityIndicator color={c.accent} />
                        ) : (
                          <View style={styles.row}>
                            {mode !== "register" && <Ionicons name="lock-closed" size={18} color={c.accent} />}
                            <Text style={[styles.submitText, { color: c.accent }]}>
                              {mode === "register" ? "CREATE ACCOUNT" : "SIGN IN"}
                            </Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <ImageBackground
                        source={kind === "steel" ? steelBtnSrc : SKIN.btnPrimary}
                        style={styles.center}
                        imageStyle={styles.fillImage}
                        resizeMode="stretch"
                      >
                        {busy ? (
                          <ActivityIndicator color={kind === "steel" ? "#FFFFFF" : "#0A0A0A"} />
                        ) : (
                          <View style={styles.row}>
                            {mode !== "register" && (
                              <Ionicons name="lock-closed" size={18} color={kind === "steel" ? "#FFFFFF" : "#0A0A0A"} />
                            )}
                            <Text style={[styles.submitText, kind === "steel" && { color: "#FFFFFF" }]}>
                              {mode === "register" ? "CREATE ACCOUNT" : "SIGN IN"}
                            </Text>
                          </View>
                        )}
                      </ImageBackground>
                    )}
                  </Pressable>

                  {/* ----- FORGOT (placeholder keeps height in register mode) ----- */}
                  {mode === "login" ? (
                    <TouchableOpacity
                      onPress={() => router.push("/forgot-password")}
                      activeOpacity={0.6}
                      style={styles.forgotWrap}
                      hitSlop={10}
                      testID="forgot-password-link"
                    >
                      <Text style={[styles.forgotText, { color: TINT }]}>FORGOT PASSWORD?</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.forgotWrap} pointerEvents="none">
                      <Text style={[styles.forgotText, { opacity: 0 }]}>FORGOT PASSWORD?</Text>
                    </View>
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
                  <View
                    style={[
                      styles.center,
                      kind !== "iron" && styles.steelSecondaryBtn,
                      kind === "plain" ? { backgroundColor: c.bgSecondary, borderColor: c.border }
                        : kind === "steel" ? { borderColor: TINT + "AA" } : null,
                    ]}
                  >
                  {kind === "iron" ? (
                    <Image source={SKIN.btnSecondary} style={StyleSheet.absoluteFill} resizeMode="stretch" />
                  ) : null}
                  <View style={kind === "iron" ? [styles.center, styles.row] : styles.row}>
                      <Ionicons
                        name={
                          bio.label.toLowerCase().includes("face") ? "scan"
                          : bio.label.toLowerCase().includes("touch") ||
                            bio.label.toLowerCase().includes("finger") ? "finger-print"
                          : "lock-closed"
                        }
                        size={18}
                        color={TINT}
                      />
                      <Text style={[styles.bioText, { color: TINT }]}>
                        {`SIGN IN WITH ${bio.label.toUpperCase()}`}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ) : null}

            </ScrollView>
          </View>
      </SafeAreaView>
    </ScreenBg>
  );
}

// =====================================================================
// Tab button — width is panel-relative, passed in from parent
// =====================================================================
function TabButton({
  label, icon, active, onPress, testID, activeSkin, inactiveSkin, width, kind, tint, c,
}: {
  label: string; icon?: any; active: boolean; onPress: () => void;
  testID?: string; activeSkin?: any; inactiveSkin?: any; width: number;
  kind: "plain" | "steel" | "iron"; tint?: string; c?: any;
}) {
  const inactiveTextColor = kind === "plain" ? (c?.textSecondary ?? "#C8C8C8") : "#C8C8C8";
  const inner = (
    <View style={[styles.row, { gap: 5, paddingHorizontal: 6 }]}>
      {icon ? (
        <Ionicons name={icon} size={13} color={active ? "#FFFFFF" : inactiveTextColor} />
      ) : null}
      <Text
        style={[
          styles.tabText,
          active ? styles.tabTextActive : styles.tabTextInactive,
          !active && kind === "plain" && { color: inactiveTextColor, textShadowColor: "transparent" },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {label}
      </Text>
    </View>
  );

  // Iron Forge keeps the textured orange/variant tab art.
  if (kind === "iron") {
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
          {inner}
        </ImageBackground>
      </Pressable>
    );
  }

  // Steel + Plain: a clean solid tab tinted to the active theme (NO orange art).
  const activeBg = kind === "plain" ? (c?.accent ?? tint ?? "#1FC3E8") : (tint ?? "#1FC3E8");
  const inactiveBg = kind === "plain" ? (c?.bgSecondary ?? "rgba(12,14,17,0.55)") : "rgba(12,14,17,0.55)";
  const activeBorder = kind === "plain" ? (c?.accent ?? tint ?? "#1FC3E8") : (tint ?? "#1FC3E8");
  const inactiveBorder = kind === "plain" ? (c?.border ?? "rgba(255,255,255,0.18)") : "rgba(255,255,255,0.18)";
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.center,
        styles.steelTab,
        {
          width,
          backgroundColor: active ? activeBg : inactiveBg,
          borderColor: active ? activeBorder : inactiveBorder,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {inner}
    </Pressable>
  );
}

// =====================================================================
// FieldShell — the text-input "slot". On the Steel/Plain look it's a clean
// recessed brushed-steel slot (dark fill + accent hairline); on Iron Forge it
// keeps the original orange industrial input skin. Module scope so it never
// remounts on keystroke (which would reload the PNG and flicker).
// =====================================================================
function FieldShell({ kind, tint, width, height, c, children }: {
  kind: "plain" | "steel" | "iron"; tint: string; width: number; height: number;
  c?: any; children: React.ReactNode;
}) {
  // Iron Forge keeps the textured orange input skin.
  if (kind === "iron") {
    return (
      <ImageBackground
        source={SKIN.input}
        style={{ width, height, justifyContent: "center" }}
        imageStyle={styles.fillImage}
        resizeMode="stretch"
      >
        {children}
      </ImageBackground>
    );
  }
  // Steel + Plain: a clean recessed slot. Steel → dark fill + accent hairline;
  // Plain → the theme's surface colour + border (matches every other screen).
  const bg = kind === "plain" ? (c?.bgSecondary ?? "rgba(12,14,17,0.72)") : "rgba(12,14,17,0.72)";
  const border = kind === "plain" ? (c?.border ?? tint + "AA") : tint + "AA";
  return (
    <View style={[styles.steelField, { width, height, backgroundColor: bg, borderColor: border }]}>
      {children}
    </View>
  );
}


// =====================================================================
// Styles  (visual values unchanged — only layout/scaling logic moved)
// =====================================================================
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0A0A0A" },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.38)" },

  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "flex-start", paddingHorizontal: 8 },

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

  // ---- steel-look inner controls (inputs / tabs / secondary button) ----
  steelField: {
    justifyContent: "center",
    backgroundColor: "rgba(12,14,17,0.72)",
    borderRadius: 9,
    borderWidth: 1.5,
  },
  steelTab: {
    height: "100%",
    borderRadius: 7,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  steelSecondaryBtn: {
    backgroundColor: "rgba(12,14,17,0.6)",
    borderRadius: 10,
    borderWidth: 1.5,
    overflow: "hidden",
  },

  // ---- tabs ----
  tabsRow: { flexDirection: "row", width: "100%" },
  tabText: { fontFamily: "BebasNeue_400Regular", fontSize: 13.5, letterSpacing: 0.8 },
  // Active tab: light text + dark outline-style shadow so it reads clearly on
  // the bright orange skin. Inactive: muted steel.
  tabTextActive: {
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  tabTextInactive: { color: "#C8C8C8" },

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
    paddingHorizontal: 22,
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
  // Build number stamped into the inner plate (debossed). Floated via an
  // absolute anchor so it never takes flex space / shifts the form.
  stampAnchor: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 5,
  },
  stampInline: {
    transform: [{ rotate: "-2deg" }],
    opacity: 0.96,
  },
  stampGroove: {
    color: "#FF6A1A",                        // true orange (was reading yellow)
    fontFamily: "BebasNeue_400Regular",
    fontSize: 15,
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.75)",     // tight drop shadow for contrast
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1.5,
  },
  stampHighlight: {
    position: "absolute",
    left: 0,
    top: 0,                                  // sits directly behind the face
    color: "rgba(0,0,0,0.9)",                // black base + soft halo = outline
    fontFamily: "BebasNeue_400Regular",
    fontSize: 15,
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2.5,                    // light black glow around the number
  },
  center: { flex: 1, width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  fillImage: { width: "100%", height: "100%" },
});
