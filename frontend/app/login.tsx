// =============================================================================
// login.tsx — Toolbox Vault industrial sign-in screen
// -----------------------------------------------------------------------------
// Visual identity: forged steel, hex bolts, gears, diamond plate, burnt orange.
// Auth logic (biometric prompt, login/register/forgot, error/info banners)
// is preserved verbatim from the previous version — only the JSX/styles below
// have changed.
//
// All decoration is drawn from SVG primitives so we ship zero image assets and
// the screen scales crisply on any device.
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
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  RadialGradient,
  Stop,
  G,
  Polygon,
  Rect,
} from "react-native-svg";
import { theme } from "../src/theme";
import { useAuth } from "../src/AuthContext";
import {
  getBiometricStatus,
  tryBiometricLogin,
  enableBiometric,
  hasBeenPromptedForBiometric,
  markBiometricPrompted,
} from "../src/biometric";

// =============================================================================
// PALETTE — matches the Toolbox Vault industrial design spec.
// =============================================================================
const C = {
  bg: "#050505",
  bgSecondary: "#111111",
  steel: "#1A1A1A",
  gunmetal: "#2B2B2B",
  orange: "#FF6A00",
  orangeBright: "#FF7E1B",
  orangeBurnt: "#D84E00",
  textWhite: "#F2F2F2",
  textMuted: "#8A8A8A",
  textSteel: "#6E6E6E",
};

// =============================================================================
// SVG DECORATION PRIMITIVES
// =============================================================================

/** Big gear silhouette used in screen corners. */
function CornerGear({
  size,
  rotation = 0,
  opacity = 0.22,
}: {
  size: number;
  rotation?: number;
  opacity?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G transform={`rotate(${rotation} 50 50)`} opacity={opacity}>
        <Path
          fill="#000"
          stroke="#1F1F1F"
          strokeWidth="0.6"
          d="M50 4 L57 4 L58 13 C62 14 66 16 69 18 L76 12 L81 17 L77 24 C79 27 81 31 82 35 L91 36 L91 43 L82 44 C82 47 82 50 81 53 L91 56 L90 63 L81 64 C80 67 78 71 76 74 L80 81 L75 86 L68 80 C65 82 61 84 57 85 L56 94 L49 94 L48 85 C44 84 40 82 37 80 L30 86 L25 81 L29 74 C27 71 25 67 24 64 L15 63 L15 56 L24 53 C24 50 24 47 25 44 L15 43 L16 36 L25 35 C26 31 28 27 30 24 L26 17 L31 12 L38 18 C41 16 45 14 49 13 L50 4 Z"
        />
        <Circle cx="50" cy="49" r="14" fill="#050505" stroke="#1F1F1F" strokeWidth="1" />
      </G>
    </Svg>
  );
}

/** Diamond-plate micro-tile across the very-top header band. */
function DiamondPlateBand({ width, height }: { width: number; height: number }) {
  // Light scattering of "lens" dashes, very low opacity.
  const dashes: { x: number; y: number; tilt: number }[] = [];
  const GAP_X = 32;
  const GAP_Y = 22;
  let row = 0;
  for (let y = GAP_Y / 2; y < height + GAP_Y; y += GAP_Y) {
    const offX = row % 2 === 0 ? 0 : GAP_X / 2;
    for (let x = offX; x < width + GAP_X; x += GAP_X) {
      dashes.push({ x, y, tilt: row % 2 === 0 ? -30 : 30 });
    }
    row++;
  }
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", top: 0, left: 0 }}
    >
      <Rect x="0" y="0" width={width} height={height} fill="#0A0A0A" opacity="0.55" />
      {dashes.map((d, i) => (
        <G key={i} transform={`rotate(${d.tilt} ${d.x} ${d.y})`}>
          <Path
            d={`M ${d.x} ${d.y - 8}
                Q ${d.x + 3} ${d.y} ${d.x} ${d.y + 8}
                Q ${d.x - 3} ${d.y} ${d.x} ${d.y - 8} Z`}
            fill="#3A3A3A"
            opacity="0.4"
          />
        </G>
      ))}
    </Svg>
  );
}

/** Single hex bolt (matches industrial style — used at panel corners + button corners). */
function HexBolt({ size = 18, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <RadialGradient id="boltMain" cx="35%" cy="30%" r="70%">
          <Stop offset="0%" stopColor="#7A7A7A" />
          <Stop offset="55%" stopColor="#3A3A3A" />
          <Stop offset="100%" stopColor="#0E0E0E" />
        </RadialGradient>
      </Defs>
      {glow && (
        <Circle cx="16" cy="16" r="15" fill={C.orange} opacity="0.18" />
      )}
      {/* hex head */}
      <Polygon
        points="16,2 28,9 28,23 16,30 4,23 4,9"
        fill="url(#boltMain)"
        stroke="#0A0A0A"
        strokeWidth="1.2"
      />
      {/* inner ring */}
      <Circle cx="16" cy="16" r="6.5" fill="#222" stroke="#0A0A0A" strokeWidth="0.8" />
      {/* slot */}
      <Path
        d="M11 16 L21 16"
        stroke="#000"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* highlight */}
      <Path
        d="M8 7 L22 4"
        stroke="#FFFFFF"
        strokeOpacity="0.18"
        strokeWidth="1"
      />
    </Svg>
  );
}

/** Octagonal forged-steel logo badge containing hammer + wrench crossed. */
function LogoBadge({ size = 168 }: { size?: number }) {
  // Octagon points (32-unit viewbox)
  const oct = "10,2 22,2 30,10 30,22 22,30 10,30 2,22 2,10";
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <SvgGradient id="badgeFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#3A3A3A" />
          <Stop offset="55%" stopColor="#1E1E1E" />
          <Stop offset="100%" stopColor="#0C0C0C" />
        </SvgGradient>
        <SvgGradient id="badgeFrame" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={C.orangeBright} />
          <Stop offset="100%" stopColor={C.orangeBurnt} />
        </SvgGradient>
      </Defs>
      {/* outer orange frame */}
      <Polygon
        points={oct}
        fill="none"
        stroke="url(#badgeFrame)"
        strokeWidth="1.2"
      />
      {/* inner badge body */}
      <Polygon
        points="10.7,3 21.3,3 29,10.7 29,21.3 21.3,29 10.7,29 3,21.3 3,10.7"
        fill="url(#badgeFill)"
        stroke="#000"
        strokeWidth="0.4"
      />
      {/* subtle inner bevel */}
      <Polygon
        points="11,4 21,4 28,11 28,21 21,28 11,28 4,21 4,11"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.06"
        strokeWidth="0.3"
      />

      {/* CROSSED HAMMER + WRENCH (simplified silhouettes) */}
      {/* Hammer (tilted from top-left to bottom-right) */}
      <G transform="rotate(-30 16 16)">
        {/* shaft */}
        <Rect x="9" y="15.2" width="14" height="1.6" fill="#3A3A3A" stroke="#000" strokeWidth="0.2" />
        {/* head */}
        <Rect x="8" y="13.3" width="3.6" height="5.4" fill="#4A4A4A" stroke="#000" strokeWidth="0.2" />
        {/* head accent */}
        <Rect x="8" y="13.3" width="0.6" height="5.4" fill={C.orangeBurnt} />
      </G>
      {/* Wrench (tilted from top-right to bottom-left) */}
      <G transform="rotate(30 16 16)">
        {/* shaft */}
        <Rect x="9" y="15.2" width="14" height="1.6" fill="#3A3A3A" stroke="#000" strokeWidth="0.2" />
        {/* open jaw on right */}
        <Path
          d="M21 13.6 L24 13.6 L24.6 14.5 L23 16 L24.6 17.5 L24 18.4 L21 18.4 Z"
          fill="#4A4A4A"
          stroke="#000"
          strokeWidth="0.2"
        />
        {/* jaw gap */}
        <Path d="M22.2 14.6 L23.8 16 L22.2 17.4 Z" fill="#0C0C0C" />
        {/* closed end on left */}
        <Circle cx="9.4" cy="16" r="1.7" fill="#4A4A4A" stroke="#000" strokeWidth="0.2" />
        <Circle cx="9.4" cy="16" r="0.6" fill="#0C0C0C" />
        {/* highlight strip */}
        <Rect x="9" y="15.2" width="14" height="0.3" fill={C.orangeBurnt} />
      </G>

      {/* corner hex-bolt holes */}
      <Circle cx="6" cy="6" r="1.2" fill="#0A0A0A" stroke="#444" strokeWidth="0.2" />
      <Circle cx="26" cy="6" r="1.2" fill="#0A0A0A" stroke="#444" strokeWidth="0.2" />
      <Circle cx="6" cy="26" r="1.2" fill="#0A0A0A" stroke="#444" strokeWidth="0.2" />
      <Circle cx="26" cy="26" r="1.2" fill="#0A0A0A" stroke="#444" strokeWidth="0.2" />
    </Svg>
  );
}

// =============================================================================
// SCREEN
// =============================================================================

export default function LoginScreen() {
  const router = useRouter();
  const { login, register } = useAuth();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  // Biometric state — drives whether we show the Face ID / Touch ID
  // button and which label to use (Face ID vs Touch ID vs Fingerprint).
  const [bio, setBio] = useState<{
    enabled: boolean;
    label: string;
    hasHardware: boolean;
    isEnrolled: boolean;
  } | null>(null);
  const autoPromptedRef = useRef(false);

  // On mount, read biometric status. If the user has previously opted in,
  // immediately fire the biometric prompt so they don't have to type
  // anything (auto-prompt every time the login screen appears after intro).
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
    } catch (e: any) {
      setErr(
        "Saved credentials didn't work. Please sign in with your password to refresh them.",
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * BUG FIX (user report #10): defer Alert by ~700ms past post-login
   * navigation so iOS doesn't drop the pending prompt.
   */
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
            {
              text: "Not now",
              style: "cancel",
              onPress: () => {
                markBiometricPrompted();
              },
            },
            {
              text: `Enable ${s.label}`,
              onPress: async () => {
                try {
                  await enableBiometric(mail, pw);
                } catch {
                  /* user can enable later from More tab */
                }
              },
            },
          ],
        );
      }, 700);
    } catch {
      /* ignore */
    }
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
        await maybeOfferBiometricEnrol(email, password);
      } else {
        await login(email, password);
        await maybeOfferBiometricEnrol(email, password);
      }
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* ----- BACKGROUND LAYERS ----- */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* base steel */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]} />
        {/* gears in each corner */}
        <View style={{ position: "absolute", top: -40, left: -50 }}>
          <CornerGear size={Math.round(width * 0.55)} rotation={0} opacity={0.18} />
        </View>
        <View style={{ position: "absolute", top: -60, right: -60 }}>
          <CornerGear size={Math.round(width * 0.5)} rotation={28} opacity={0.16} />
        </View>
        <View style={{ position: "absolute", bottom: -60, left: -60 }}>
          <CornerGear size={Math.round(width * 0.5)} rotation={42} opacity={0.16} />
        </View>
        <View style={{ position: "absolute", bottom: -50, right: -50 }}>
          <CornerGear size={Math.round(width * 0.55)} rotation={15} opacity={0.18} />
        </View>
        {/* faint diamond plate behind everything */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { opacity: 0.45 },
          ]}
        >
          <DiamondPlateBand width={width} height={1100} />
        </View>
      </View>

      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* ----- LOGO / TITLE ----- */}
            <View style={styles.brand}>
              <LogoBadge size={Math.min(180, width * 0.45)} />
              <View style={styles.titleRow}>
                <Text style={styles.titleSilver}>TOOLBOX </Text>
                <Text style={styles.titleOrange}>VAULT</Text>
              </View>
              <View style={styles.subRow}>
                {["INVENTORY", "DEALERS", "WARRANTIES", "REPORTS"].map(
                  (t, i, arr) => (
                    <View
                      key={t}
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <Text style={styles.subText}>{t}</Text>
                      {i < arr.length - 1 && (
                        <Text style={styles.subDot}> • </Text>
                      )}
                    </View>
                  ),
                )}
              </View>
            </View>

            {/* ----- MAINTENANCE PANEL ----- */}
            <View style={styles.panel}>
              {/* panel orange edge */}
              <View style={styles.panelOrangeEdge} pointerEvents="none" />
              {/* corner bolts */}
              <View style={[styles.boltAt, { top: 10, left: 10 }]}>
                <HexBolt size={18} />
              </View>
              <View style={[styles.boltAt, { top: 10, right: 10 }]}>
                <HexBolt size={18} />
              </View>
              <View style={[styles.boltAt, { bottom: 10, left: 10 }]}>
                <HexBolt size={18} />
              </View>
              <View style={[styles.boltAt, { bottom: 10, right: 10 }]}>
                <HexBolt size={18} />
              </View>

              {/* TAB SELECTOR */}
              <View style={styles.tabRow}>
                <TouchableOpacity
                  onPress={() => setMode("login")}
                  activeOpacity={0.85}
                  testID="tab-signin"
                  style={[
                    styles.tab,
                    mode === "login" ? styles.tabActive : styles.tabInactive,
                  ]}
                >
                  <Ionicons
                    name="person"
                    size={14}
                    color={mode === "login" ? "#000" : C.textMuted}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      { color: mode === "login" ? "#000" : C.textMuted },
                    ]}
                  >
                    SIGN IN
                  </Text>
                  {mode === "login" && <View style={styles.tabActiveGlow} />}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMode("register")}
                  activeOpacity={0.85}
                  testID="tab-register"
                  style={[
                    styles.tab,
                    mode === "register" ? styles.tabActive : styles.tabInactive,
                  ]}
                >
                  <Ionicons
                    name="person-add"
                    size={14}
                    color={mode === "register" ? "#000" : C.textMuted}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      { color: mode === "register" ? "#000" : C.textMuted },
                    ]}
                  >
                    CREATE ACCOUNT
                  </Text>
                  {mode === "register" && <View style={styles.tabActiveGlow} />}
                </TouchableOpacity>
              </View>

              {/* NAME (register only) */}
              {mode === "register" && (
                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>NAME (OPTIONAL)</Text>
                    <View style={styles.labelRule} />
                  </View>
                  <View style={styles.inputBox}>
                    <View style={styles.inputIconBox}>
                      <Ionicons name="person" size={16} color={C.orange} />
                    </View>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder="Your name"
                      placeholderTextColor={C.textSteel}
                      style={styles.input}
                      autoCapitalize="words"
                      testID="auth-name"
                    />
                  </View>
                </View>
              )}

              {/* EMAIL */}
              <View style={styles.field}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>EMAIL</Text>
                  <View style={styles.labelRule} />
                </View>
                <View style={styles.inputBox}>
                  <View style={styles.inputIconBox}>
                    <Ionicons name="mail" size={16} color={C.orange} />
                  </View>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={C.textSteel}
                    style={styles.input}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    testID="auth-email"
                  />
                </View>
              </View>

              {/* PASSWORD */}
              <View style={styles.field}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>PASSWORD</Text>
                  <View style={styles.labelRule} />
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={[styles.inputBox, { flex: 1 }]}>
                    <View style={styles.inputIconBox}>
                      <Ionicons name="lock-closed" size={16} color={C.orange} />
                    </View>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder={
                        mode === "register"
                          ? "At least 6 characters"
                          : "••••••••"
                      }
                      placeholderTextColor={C.textSteel}
                      style={styles.input}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      testID="auth-password"
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword((s) => !s)}
                    activeOpacity={0.8}
                    testID="toggle-password"
                  >
                    <Ionicons
                      name={showPassword ? "eye-off" : "eye"}
                      size={20}
                      color={C.orange}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* ERROR / INFO BANNERS */}
              {err ? (
                <View style={styles.errBox}>
                  <Ionicons
                    name="alert-circle"
                    size={16}
                    color={theme.colors.danger}
                  />
                  <Text style={styles.errText}>{String(err)}</Text>
                </View>
              ) : null}
              {info ? (
                <View
                  style={[
                    styles.errBox,
                    {
                      backgroundColor: "rgba(46,160,67,0.12)",
                      borderColor: theme.colors.success,
                    },
                  ]}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={theme.colors.success}
                  />
                  <Text
                    style={[
                      styles.errText,
                      { color: theme.colors.success },
                    ]}
                  >
                    {info}
                  </Text>
                </View>
              ) : null}

              {/* SUBMIT BUTTON */}
              <TouchableOpacity
                onPress={submit}
                disabled={busy}
                activeOpacity={0.85}
                style={styles.submitWrap}
                testID="auth-submit"
              >
                <View style={styles.submitGlow} pointerEvents="none" />
                <View style={styles.submitBtn}>
                  <View style={[styles.btnBoltAt, { left: 8 }]}>
                    <HexBolt size={14} />
                  </View>
                  <View style={[styles.btnBoltAt, { right: 8 }]}>
                    <HexBolt size={14} />
                  </View>
                  {busy ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <>
                      <Ionicons
                        name={mode === "login" ? "lock-closed" : "person-add"}
                        size={20}
                        color="#000"
                      />
                      <Text style={styles.submitText}>
                        {mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
                      </Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>

              {/* BIOMETRIC FALLBACK */}
              {mode === "login" &&
              bio?.enabled &&
              bio.hasHardware &&
              bio.isEnrolled ? (
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
                    size={18}
                    color={C.orange}
                  />
                  <Text style={styles.bioBtnText}>
                    SIGN IN WITH {bio.label.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {/* FORGOT PASSWORD */}
              {mode === "login" && (
                <View style={styles.forgotRow}>
                  <View style={styles.forgotRule} />
                  <TouchableOpacity
                    onPress={() => router.push("/forgot-password")}
                    testID="forgot-password-link"
                  >
                    <Text style={styles.forgotText}>FORGOT PASSWORD?</Text>
                  </TouchableOpacity>
                  <View style={styles.forgotRule} />
                </View>
              )}

              {/* FOOTER NOTICE */}
              <View style={styles.notice}>
                <Ionicons name="shield-checkmark" size={14} color={C.textMuted} />
                <Text style={styles.noticeText}>
                  {mode === "login"
                    ? "New user? Use Create Account to get started for free."
                    : "Create an account to start tracking your tools."}
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 32,
    justifyContent: "center",
  },
  // --- brand ---
  brand: { alignItems: "center", marginBottom: 14 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  titleSilver: {
    color: "#CFCFCF",
    fontWeight: "900",
    fontSize: 30,
    letterSpacing: 3,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  titleOrange: {
    color: C.orange,
    fontWeight: "900",
    fontSize: 30,
    letterSpacing: 3,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 8,
  },
  subText: {
    color: "#BABABA",
    fontWeight: "800",
    fontSize: 9,
    letterSpacing: 1.8,
  },
  subDot: {
    color: C.orange,
    fontWeight: "900",
    fontSize: 9,
  },
  // --- maintenance panel ---
  panel: {
    backgroundColor: "#0E0E0E",
    borderColor: "#262626",
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 28,
    paddingHorizontal: 18,
    marginTop: 14,
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.6,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 10 },
    }),
  },
  panelOrangeEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: C.orangeBurnt,
    borderRadius: 12,
    opacity: 0.55,
  },
  boltAt: { position: "absolute", zIndex: 2 },
  // --- tabs ---
  tabRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 22,
    marginTop: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderRadius: 4,
    position: "relative",
  },
  tabActive: {
    backgroundColor: C.orange,
    borderColor: C.orangeBright,
  },
  tabInactive: {
    backgroundColor: "#1A1A1A",
    borderColor: "#2B2B2B",
  },
  tabText: {
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1.6,
  },
  tabActiveGlow: {
    position: "absolute",
    bottom: -6,
    left: 16,
    right: 16,
    height: 6,
    backgroundColor: C.orange,
    opacity: 0.45,
    borderRadius: 6,
  },
  // --- fields ---
  field: { marginBottom: 16 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
  },
  label: {
    color: "#C9C9C9",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 2,
  },
  labelRule: {
    flex: 1,
    height: 1,
    backgroundColor: "#2A2A2A",
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#080808",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 4,
    overflow: "hidden",
    // subtle orange inset glow via shadow
    ...Platform.select({
      ios: {
        shadowColor: C.orange,
        shadowOpacity: 0.18,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 0 },
      },
      android: {},
    }),
  },
  inputIconBox: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "#1F1F1F",
    marginRight: 4,
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === "ios" ? 12 : 6,
    paddingHorizontal: 4,
    color: C.textWhite,
    fontSize: 15,
    fontWeight: "600",
  },
  eyeBtn: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#080808",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 4,
    alignSelf: "flex-end",
  },
  // --- error / info ---
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(220,53,69,0.12)",
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: 4,
    padding: 10,
    marginBottom: 12,
  },
  errText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  // --- submit ---
  submitWrap: {
    marginTop: 6,
    marginBottom: 6,
    position: "relative",
  },
  submitGlow: {
    position: "absolute",
    left: 4,
    right: 4,
    bottom: -6,
    height: 14,
    backgroundColor: C.orange,
    opacity: 0.35,
    borderRadius: 12,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 18,
    backgroundColor: C.orange,
    borderWidth: 1.5,
    borderColor: C.orangeBright,
    borderRadius: 6,
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: C.orange,
        shadowOpacity: 0.6,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 8 },
    }),
  },
  btnBoltAt: {
    position: "absolute",
    top: "50%",
    marginTop: -7,
  },
  submitText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 4,
  },
  // --- bio ---
  bioBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: C.orange,
    borderRadius: 4,
    backgroundColor: "transparent",
  },
  bioBtnText: {
    color: C.orange,
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1.4,
  },
  // --- forgot ---
  forgotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
    marginBottom: 8,
  },
  forgotRule: {
    flex: 1,
    height: 1,
    backgroundColor: "#2A2A2A",
  },
  forgotText: {
    color: C.orange,
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 2,
  },
  // --- footer notice ---
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: "#1E1E1E",
  },
  noticeText: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
    lineHeight: 16,
  },
});
