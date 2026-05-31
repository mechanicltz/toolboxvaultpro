// =============================================================================
// login.tsx — Toolbox Vault Login (HERO industrial styling per user revision)
// -----------------------------------------------------------------------------
// Per the user's revision request, this is a HERO screen — significantly more
// industrial styling than any operational screen. Goals:
//   • Background: dramatic industrial workshop scene (gears, diamond plate)
//   • Panel: physical industrial access panel with multi-layer steel framing,
//     hex bolts, beveled edges, orange edge highlights, recessed sections
//   • Tabs: industrial control plates with bevels, bolts, orange active state
//   • Inputs: recessed angular shapes with orange edge highlights
//   • Sign In button: bolted steel control plate, orange painted surface,
//     dimensional edges, orange hot-steel glow, physical presence
//
// Theme system, fonts, asset organization, and architecture remain intact.
// All chrome rendering uses React Native + LinearGradient + SVG bolts.
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
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
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
  TBVText,
  useTBV,
  useBackground,
  useMasterLogo,
  useWordmark,
} from "../src/components/industrial";

// ---------- Local industrial chrome primitives ----------

/** Photoreal-ish hex bolt rendered as concentric circles. */
function HexBolt({ size = 14, style }: { size?: number; style?: any }) {
  const inner = Math.max(4, Math.round(size * 0.5));
  return (
    <View
      style={[
        boltStyles.outer,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    >
      <View
        style={[
          boltStyles.head,
          { width: size - 2, height: size - 2, borderRadius: (size - 2) / 2 },
        ]}
      >
        <View
          style={[
            boltStyles.inner,
            { width: inner, height: inner, borderRadius: inner / 2 },
          ]}
        />
      </View>
    </View>
  );
}

const boltStyles = StyleSheet.create({
  outer: {
    backgroundColor: "#5a5a5a",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.9,
    shadowRadius: 2,
    shadowOffset: { width: 1, height: 1 },
    elevation: 3,
  },
  head: {
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#0a0a0a",
  },
  inner: {
    backgroundColor: "#0a0a0a",
  },
});

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

  // Responsive logo sizing
  const logoWidth = Math.min(screenW * 0.5, 240);
  const logoHeight = logoWidth * 0.66;
  const wordmarkWidth = Math.min(screenW * 0.45, 220);

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

  // ---------- Industrial input row ----------
  const renderIndustrialInput = (props: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    placeholder: string;
    value: string;
    onChangeText: (s: string) => void;
    secure?: boolean;
    rightAccessory?: React.ReactNode;
    keyboardType?: any;
    autoComplete?: any;
    autoCapitalize?: any;
    testID?: string;
  }) => (
    <View style={{ gap: 4 }}>
      {/* LABEL ROW */}
      <View style={styles.labelRow}>
        <TBVText variant="label" color={palette.textMuted}>{props.label}</TBVText>
        <View style={[styles.labelDash, { backgroundColor: palette.accent }]} />
      </View>
      {/* INPUT BOX with bevel + orange L-bracket + recessed look */}
      <View style={styles.inputOuter}>
        {/* Outer steel border */}
        <LinearGradient
          colors={["#3a3a3a", "#0a0a0a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.inputBevel}
        >
          {/* Inner inset dark surface */}
          <View style={styles.inputInset}>
            {/* Orange L-bracket top-left corner light */}
            <View style={[styles.inputCornerTL, { borderColor: palette.accent }]} pointerEvents="none" />
            {/* Orange L-bracket bottom-right corner light */}
            <View style={[styles.inputCornerBR, { borderColor: palette.accent }]} pointerEvents="none" />
            <View style={styles.inputRow}>
              <Ionicons name={props.icon} size={18} color={palette.accent} />
              <View style={{ flex: 1 }}>
                <RNInput
                  value={props.value}
                  onChangeText={props.onChangeText}
                  placeholder={props.placeholder}
                  placeholderTextColor="rgba(242,242,242,0.32)"
                  style={[styles.input, { color: palette.text }]}
                  secureTextEntry={props.secure}
                  keyboardType={props.keyboardType}
                  autoCapitalize={props.autoCapitalize ?? "none"}
                  autoComplete={props.autoComplete}
                  testID={props.testID}
                />
              </View>
              {props.rightAccessory}
            </View>
          </View>
        </LinearGradient>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      {bg ? (
        <ImageBackground source={bg} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}

      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingHorizontal: spacing.lg }]}
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
                  marginTop: spacing.md,
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
                  marginTop: spacing.xs,
                }}
                resizeMode="contain"
              />
            ) : null}

            {/* ============== SUBTITLE ============== */}
            <View style={[styles.subRow, { marginTop: spacing.xs }]}>
              {["INVENTORY", "DEALERS", "WARRANTIES", "REPORTS"].map((w, i) => (
                <View key={w} style={styles.subItem}>
                  <TBVText variant="labelSmall" color={palette.text}>{w}</TBVText>
                  {i < 3 && <View style={[styles.subDot, { backgroundColor: palette.accent }]} />}
                </View>
              ))}
            </View>

            {/* ============== INDUSTRIAL ACCESS PANEL ============== */}
            <View style={[styles.panelWrap, { marginTop: spacing.lg }]}>
              {/* Outer steel frame with gradient + heavy shadow */}
              <LinearGradient
                colors={["#1a1d22", "#0a0c10", "#1a1d22"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.panelOuterFrame}
              >
                {/* Orange inner-edge glow */}
                <View style={[styles.panelOrangeEdge, { borderColor: palette.accent }]} pointerEvents="none" />

                {/* 6 hex bolts: 4 corners + 2 mid-sides */}
                <View style={[styles.boltPos, { top: 8, left: 8 }]}><HexBolt size={14} /></View>
                <View style={[styles.boltPos, { top: 8, right: 8 }]}><HexBolt size={14} /></View>
                <View style={[styles.boltPos, { bottom: 8, left: 8 }]}><HexBolt size={14} /></View>
                <View style={[styles.boltPos, { bottom: 8, right: 8 }]}><HexBolt size={14} /></View>
                <View style={[styles.boltPos, { top: "50%", left: 8, marginTop: -7 }]}><HexBolt size={14} /></View>
                <View style={[styles.boltPos, { top: "50%", right: 8, marginTop: -7 }]}><HexBolt size={14} /></View>

                {/* Recessed inner surface */}
                <View style={styles.panelRecessed}>
                  <View style={{ gap: spacing.md }}>
                    {/* ============== TABS — INDUSTRIAL CONTROL PLATES ============== */}
                    <View style={styles.tabsRow}>
                      <IndustrialTab
                        active={mode_ === "login"}
                        label="SIGN IN"
                        icon="person"
                        onPress={() => setMode("login")}
                        accent={palette.accent}
                        accentBright={palette.accentBright}
                        accentDeep={palette.accentDeep}
                        textColor={palette.text}
                        textMuted={palette.textMuted}
                        side="left"
                        testID="tab-login"
                      />
                      <IndustrialTab
                        active={mode_ === "register"}
                        label="CREATE ACCOUNT"
                        icon="person-add"
                        onPress={() => setMode("register")}
                        accent={palette.accent}
                        accentBright={palette.accentBright}
                        accentDeep={palette.accentDeep}
                        textColor={palette.text}
                        textMuted={palette.textMuted}
                        side="right"
                        testID="tab-register"
                      />
                    </View>

                    {/* Error / info banner */}
                    {!!err && (
                      <View style={[styles.banner, { backgroundColor: "rgba(220,53,69,0.20)", borderColor: palette.danger }]}>
                        <Ionicons name="alert-circle" size={16} color={palette.danger} />
                        <TBVText variant="bodySmall" color={palette.danger} style={{ flex: 1 }}>{err}</TBVText>
                      </View>
                    )}
                    {!!info && !err && (
                      <View style={[styles.banner, { backgroundColor: "rgba(46,160,67,0.20)", borderColor: palette.success }]}>
                        <Ionicons name="checkmark-circle" size={16} color={palette.success} />
                        <TBVText variant="bodySmall" color={palette.success} style={{ flex: 1 }}>{info}</TBVText>
                      </View>
                    )}

                    {mode_ === "register" && renderIndustrialInput({
                      label: "FULL NAME",
                      icon: "person-outline",
                      placeholder: "Enter your name",
                      value: name,
                      onChangeText: setName,
                      autoCapitalize: "words",
                      testID: "auth-name",
                    })}

                    {renderIndustrialInput({
                      label: "EMAIL",
                      icon: "mail-outline",
                      placeholder: "you@example.com",
                      value: email,
                      onChangeText: setEmail,
                      autoComplete: "email",
                      keyboardType: "email-address",
                      testID: "auth-email",
                    })}

                    {renderIndustrialInput({
                      label: "PASSWORD",
                      icon: "lock-closed-outline",
                      placeholder: "••••••••",
                      value: password,
                      onChangeText: setPassword,
                      secure: !showPassword,
                      testID: "auth-password",
                      rightAccessory: (
                        <TouchableOpacity
                          onPress={() => setShowPassword((s) => !s)}
                          style={[styles.eyeBtn, { borderColor: palette.accent }]}
                          activeOpacity={0.6}
                          testID="password-eye"
                        >
                          <Ionicons name={showPassword ? "eye-off" : "eye"} size={18} color={palette.accent} />
                        </TouchableOpacity>
                      ),
                    })}

                    {/* ============== SIGN IN BUTTON — INDUSTRIAL CONTROL PLATE ============== */}
                    <SignInButton
                      label={mode_ === "register" ? "CREATE ACCOUNT" : "SIGN IN"}
                      onPress={submit}
                      busy={busy}
                      palette={palette}
                    />

                    {mode_ === "login" && (
                      <View style={styles.forgotRow}>
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
                      bio?.enabled && bio.hasHardware && bio.isEnrolled && (
                        <TouchableOpacity
                          onPress={runBiometricLogin}
                          disabled={busy}
                          activeOpacity={0.7}
                          style={[styles.bioBtn, { borderColor: palette.accent }]}
                          testID="auth-biometric"
                        >
                          <Ionicons
                            name={
                              bio.label.toLowerCase().includes("face") ? "scan" :
                              bio.label.toLowerCase().includes("touch") ||
                              bio.label.toLowerCase().includes("finger") ? "finger-print" : "lock-closed"
                            }
                            size={16} color={palette.accent}
                          />
                          <TBVText variant="button" color={palette.accent}>
                            {`SIGN IN WITH ${bio.label.toUpperCase()}`}
                          </TBVText>
                        </TouchableOpacity>
                      )}

                    {mode_ === "login" && (
                      <View style={[styles.footerNotice, {
                        backgroundColor: "rgba(0,0,0,0.45)",
                        borderColor: palette.borderSubtle,
                      }]}>
                        <Ionicons name="shield-checkmark" size={14} color={palette.accent} />
                        <TBVText variant="caption" muted style={{ flex: 1 }}>
                          New user? Use Create Account to get started for free.
                        </TBVText>
                      </View>
                    )}
                  </View>
                </View>
              </LinearGradient>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ---------- IndustrialTab — control plate with bevel + bolts ----------
function IndustrialTab({
  active, label, icon, onPress, accent, accentBright, accentDeep, textColor, textMuted, side, testID,
}: any) {
  const colors: [string, string, ...string[]] = active
    ? [accentBright, accent, accentDeep]
    : ["#28292d", "#16181c"];
  return (
    <Pressable onPress={onPress} style={styles.tabWrap} testID={testID}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.tab, active && styles.tabActive]}
      >
        {/* 4 rivets at corners */}
        <View style={[styles.tabBolt, { top: 4, left: 4 }]}><HexBolt size={8} /></View>
        <View style={[styles.tabBolt, { top: 4, right: 4 }]}><HexBolt size={8} /></View>
        <View style={[styles.tabBolt, { bottom: 4, left: 4 }]}><HexBolt size={8} /></View>
        <View style={[styles.tabBolt, { bottom: 4, right: 4 }]}><HexBolt size={8} /></View>
        <View style={styles.tabContent}>
          <Ionicons name={icon} size={14} color={active ? "#000" : textMuted} />
          <TBVText variant="buttonSm" color={active ? "#000" : textMuted}>{label}</TBVText>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

// ---------- SignInButton — bolted steel control plate ----------
function SignInButton({ label, onPress, busy, palette }: any) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.signWrap,
        { opacity: busy ? 0.6 : pressed ? 0.9 : 1 },
      ]}
      testID="auth-submit"
    >
      {/* Orange glow shadow box */}
      <View style={[styles.signGlow, { shadowColor: palette.accent }]} pointerEvents="none" />
      {/* Outer steel frame */}
      <LinearGradient
        colors={["#2a2c30", "#0a0c10"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.signFrame}
      >
        {/* Orange surface */}
        <LinearGradient
          colors={[palette.accentBright, palette.accent, palette.accentDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.signSurface}
        >
          {/* Top highlight line */}
          <View style={styles.signTopHighlight} pointerEvents="none" />
          {/* Bolts at each end */}
          <View style={[styles.signBolt, { left: 14 }]}><HexBolt size={16} /></View>
          <View style={[styles.signBolt, { right: 14 }]}><HexBolt size={16} /></View>
          {/* Label */}
          <View style={styles.signContent}>
            {busy ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={20} color="#000" />
                <TBVText variant="buttonLg" color="#000">{label}</TBVText>
              </>
            )}
          </View>
        </LinearGradient>
      </LinearGradient>
    </Pressable>
  );
}

// Stubbing import for proper TextInput typing
import { TextInput as RNInput } from "react-native";

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingTop: 8, paddingBottom: 24 },

  // ---- SUBTITLE ----
  subRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap" },
  subItem: { flexDirection: "row", alignItems: "center" },
  subDot: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 6 },

  // ---- PANEL ----
  panelWrap: {
    shadowColor: "#000",
    shadowOpacity: 0.85,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  panelOuterFrame: {
    borderRadius: 4,
    padding: 30,
    borderWidth: 1,
    borderColor: "#2a2c30",
  },
  panelOrangeEdge: {
    position: "absolute",
    top: 6, left: 6, right: 6, bottom: 6,
    borderWidth: 1.5,
    borderRadius: 2,
    shadowColor: "#FF6A00",
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  boltPos: { position: "absolute", zIndex: 5 },
  panelRecessed: {
    backgroundColor: "rgba(8,9,11,0.7)",
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.5)",
    padding: 16,
    // inset shadow approximation
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  // ---- TABS ----
  tabsRow: { flexDirection: "row", gap: 6 },
  tabWrap: { flex: 1, borderRadius: 3, overflow: "hidden" },
  tab: {
    height: 42,
    borderWidth: 1,
    borderColor: "#0a0a0a",
    borderRadius: 3,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  tabActive: {
    shadowColor: "#FF6A00",
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  tabBolt: { position: "absolute" },
  tabContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },

  // ---- BANNER ----
  banner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 4, borderWidth: 1,
  },

  // ---- INPUT ----
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  labelDash: { flex: 1, height: 1, opacity: 0.5 },
  inputOuter: {
    borderRadius: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  inputBevel: { padding: 1.5, borderRadius: 4 },
  inputInset: {
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 3,
    paddingHorizontal: 10,
    height: 46,
    justifyContent: "center",
    position: "relative",
  },
  inputCornerTL: {
    position: "absolute", top: 0, left: 0, width: 18, height: 18,
    borderTopWidth: 2, borderLeftWidth: 2,
  },
  inputCornerBR: {
    position: "absolute", bottom: 0, right: 0, width: 18, height: 18,
    borderBottomWidth: 2, borderRightWidth: 2, opacity: 0.5,
  },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: { fontSize: 15, fontWeight: "500", paddingVertical: 0 },
  eyeBtn: {
    width: 34, height: 34,
    alignItems: "center", justifyContent: "center",
    borderRadius: 3, borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },

  // ---- SIGN IN BUTTON ----
  signWrap: { marginTop: 4 },
  signGlow: {
    ...StyleSheet.absoluteFillObject,
    shadowOpacity: 0.85,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
    borderRadius: 4,
  },
  signFrame: { padding: 3, borderRadius: 5, borderWidth: 1, borderColor: "#0a0a0a" },
  signSurface: {
    height: 56,
    borderRadius: 3,
    paddingHorizontal: 50,
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  signTopHighlight: {
    position: "absolute", top: 0, left: 0, right: 0, height: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  signBolt: { position: "absolute", top: "50%", marginTop: -8 },
  signContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },

  // ---- FORGOT / BIOMETRIC / FOOTER ----
  forgotRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  forgotLine: { flex: 1, height: 1, opacity: 0.45 },
  bioBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 12, borderRadius: 4, borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  footerNotice: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 4, borderWidth: 1,
  },
});
