// =============================================================================
// app/login.tsx — Toolbox Vault Login (industrial skin-based, fully responsive)
// -----------------------------------------------------------------------------
// Rules of engagement (per /app/memory/tbv-design-rules.md):
//   • Use ToolboxVaultAssets skins via <Image> / <ImageBackground> with
//     resizeMode="stretch". Source PNG aspect ratios are irrelevant — Flexbox
//     decides final size.
//   • Native text/icons/inputs are rendered as CHILDREN on top of the skins.
//   • Layout is 100% Flexbox / gap / padding. NO `top: X%` positioning.
//   • Phone: full single column. Tablet/web: same component tree, just wider
//     content max-width — the form panel breathes, never letterboxed.
// =============================================================================

import { useState, useEffect, useRef } from "react";
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
// Skin source files (single import block — easy to swap later)
// =====================================================================
const SKIN = {
  bg:           require("../assets/tbv-v2/Textures/tbv_diamond_plate_dark.png"),
  panel:        require("../assets/tbv-v2/Panels/tbv_login_panel_dark.png"),
  tabActive:    require("../assets/tbv-v2/Tabs/tbv_tab_active_orange.png"),
  tabInactive:  require("../assets/tbv-v2/Tabs/tbv_tab_inactive_dark.png"),
  input:        require("../assets/tbv-v2/Inputs/tbv_input_dark.png"),
  eyeBtn:       require("../assets/tbv-v2/Inputs/tbv_eye_button_dark.png"),
  btnPrimary:   require("../assets/tbv-v2/Buttons/tbv_btn_primary_orange.png"),
  btnSecondary: require("../assets/tbv-v2/Buttons/tbv_btn_secondary_dark.png"),
  masterLogo:   require("../assets/tbv-v2/Branding/tbv_master_logo_dark_v2.png"),
  wordmark:     require("../assets/tbv-v2/Branding/tbv_wordmark_dark.png"),
};

export default function LoginScreen() {
  const router = useRouter();
  const { login, register } = useAuth();
  const { width: winW } = useWindowDimensions();

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

  // ---------- Responsive shell ----------
  // Phone (<600): form takes full width
  // Tablet/web (>=600): form uses 78% of viewport up to 720 — wide enough
  // that the chrome breathes, not letterboxed phone-sized.
  const isTablet = winW >= 600;
  const FORM_MAX_W = isTablet ? Math.min(720, winW * 0.78) : 9999;

  return (
    <ImageBackground source={SKIN.bg} style={styles.bg} resizeMode="cover">
      {/* subtle dark veil for legibility */}
      <View style={styles.veil} />

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
            <View style={[styles.formColumn, { maxWidth: FORM_MAX_W }]}>

              {/* ===== BRAND HEADER ===== */}
              <View style={styles.brand}>
                <Image source={SKIN.masterLogo} style={styles.logo} resizeMode="contain" />
                <Image source={SKIN.wordmark} style={styles.wordmark} resizeMode="contain" />
                <Text style={styles.subtitle}>
                  INVENTORY · DEALERS · WARRANTIES · REPORTS
                </Text>
              </View>

              {/* ===== PANEL (login skin) ===== */}
              <View style={styles.panel}>
                <Image
                  source={SKIN.panel}
                  style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }] as any}
                  resizeMode="stretch"
                />
                <View style={styles.panelContent}>
                {/* ----- TABS ROW ----- */}
                <View style={styles.tabsRow}>
                  <TabButton
                    label="SIGN IN"
                    icon="person"
                    active={mode === "login"}
                    onPress={() => setMode("login")}
                    testID="tab-login"
                  />
                  <TabButton
                    label="CREATE ACCOUNT"
                    icon="person-add"
                    active={mode === "register"}
                    onPress={() => setMode("register")}
                    testID="tab-register"
                    small
                  />
                </View>

                {/* ----- EMAIL ----- */}
                <FieldLabel>EMAIL</FieldLabel>
                <InputSkin>
                  <Ionicons name="mail-outline" size={18} color="#FF8533" />
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
                </InputSkin>

                {/* ----- PASSWORD ----- */}
                <FieldLabel>PASSWORD</FieldLabel>
                <View style={styles.passRow}>
                  <InputSkin style={{ flex: 1 }}>
                    <Ionicons name="lock-closed-outline" size={18} color="#FF8533" />
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder=""
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      style={styles.input}
                      testID="auth-password"
                    />
                  </InputSkin>
                  <Pressable
                    onPress={() => setShowPassword(s => !s)}
                    style={styles.eyeWrap}
                    testID="password-eye"
                  >
                    <ImageBackground
                      source={SKIN.eyeBtn}
                      style={styles.eyeBg}
                      imageStyle={styles.skinImage}
                      resizeMode="stretch"
                    >
                      <Ionicons
                        name={showPassword ? "eye-off" : "eye"}
                        size={22}
                        color="#FF8533"
                      />
                    </ImageBackground>
                  </Pressable>
                </View>

                {/* ----- ERROR ----- */}
                {!!err && (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle" size={14} color="#FF6F61" />
                    <Text style={styles.errorText} numberOfLines={2}>{err}</Text>
                  </View>
                )}

                {/* ----- SUBMIT BUTTON ----- */}
                <Pressable
                  onPress={submit}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.submitWrap,
                    { opacity: busy ? 0.7 : (pressed ? 0.85 : 1) },
                  ]}
                  testID="auth-submit"
                >
                  <ImageBackground
                    source={SKIN.btnPrimary}
                    style={styles.submitBg}
                    imageStyle={styles.skinImage}
                    resizeMode="stretch"
                  >
                    {busy ? (
                      <ActivityIndicator color="#0A0A0A" />
                    ) : (
                      <View style={styles.submitContent}>
                        <Ionicons name="lock-closed" size={20} color="#0A0A0A" />
                        <Text style={styles.submitText}>
                          {mode === "register" ? "CREATE ACCOUNT" : "SIGN IN"}
                        </Text>
                      </View>
                    )}
                  </ImageBackground>
                </Pressable>

                {/* ----- FORGOT PASSWORD ----- */}
                {mode === "login" && (
                  <TouchableOpacity
                    onPress={() => router.push("/forgot-password")}
                    activeOpacity={0.6}
                    style={styles.forgotWrap}
                    hitSlop={12}
                    testID="forgot-password-link"
                  >
                    <Text style={styles.forgotText}>FORGOT PASSWORD?</Text>
                  </TouchableOpacity>
                )}

                {/* ----- FOOTER NOTE ----- */}
                <View style={styles.footer}>
                  <Ionicons name="shield-checkmark" size={16} color="#A8A8A8" />
                  <Text style={styles.footerText} numberOfLines={2}>
                    {mode === "login"
                      ? "New user? Tap CREATE ACCOUNT to get started for free."
                      : "Already have an account? Tap SIGN IN above."}
                  </Text>
                </View>
                </View>
              </View>

              {/* ===== BIOMETRIC ROW ===== */}
              {mode === "login" && bio?.enabled && bio.hasHardware && bio.isEnrolled && (
                <Pressable
                  onPress={runBiometricLogin}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.bioWrap,
                    { opacity: pressed ? 0.85 : 1 },
                  ]}
                  testID="auth-biometric"
                >
                  <ImageBackground
                    source={SKIN.btnSecondary}
                    style={styles.bioBg}
                    imageStyle={styles.skinImage}
                    resizeMode="stretch"
                  >
                    <View style={styles.submitContent}>
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
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

// =====================================================================
// Tab button — uses tab_active / tab_inactive skin with native content
// =====================================================================
function TabButton({
  label, icon, active, onPress, testID, small,
}: {
  label: string; icon: any; active: boolean; onPress: () => void;
  testID?: string; small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.tabPressable,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <ImageBackground
        source={active ? SKIN.tabActive : SKIN.tabInactive}
        style={styles.tabBg}
        imageStyle={styles.skinImage}
        resizeMode="stretch"
      >
        <View style={styles.tabContent}>
          <Ionicons
            name={icon}
            size={small ? 14 : 16}
            color={active ? "#0A0A0A" : "#C8C8C8"}
          />
          <Text style={[
            small ? styles.tabTextSm : styles.tabText,
            { color: active ? "#0A0A0A" : "#C8C8C8" },
          ]}>
            {label}
          </Text>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

// =====================================================================
// Field label (Rajdhani uppercase letterspaced)
// =====================================================================
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

// =====================================================================
// Input skin wrapper — uses tbv_input_dark.png with native children
// =====================================================================
function InputSkin({
  children, style,
}: { children: React.ReactNode; style?: any }) {
  return (
    <ImageBackground
      source={SKIN.input}
      style={[styles.inputBg, style]}
      imageStyle={styles.skinImage}
      resizeMode="stretch"
    >
      <View style={styles.inputInner}>{children}</View>
    </ImageBackground>
  );
}

// =====================================================================
// Styles
// =====================================================================
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0A0A0A" },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
  },

  formColumn: {
    width: "100%",
    alignItems: "stretch",
    gap: 16,
  },

  // ---- BRAND ----
  brand: {
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  logo:     { width: 92, height: 92 },
  wordmark: { width: 260, height: 60 },
  subtitle: {
    fontFamily: "Rajdhani_600SemiBold",
    fontSize: 11,
    letterSpacing: 2.2,
    color: "#FFB266",
    textAlign: "center",
  },

  // ---- PANEL ----
  // The login-panel skin has thick bolted chrome on all four sides plus
  // corner bolts. Padding has to clear those so children land in the
  // panel's clean interior, not on top of the bolts.
  panel: {
    width: "100%",
    position: "relative",
    paddingHorizontal: 40,
    paddingTop: 64,
    paddingBottom: 56,
  },
  panelContent: {
    width: "100%",
    gap: 12,
  },

  // ---- TABS ----
  tabsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  tabPressable: {
    flex: 1,
  },
  tabBg: {
    width: "100%",
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  tabText: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 18,
    letterSpacing: 2,
  },
  tabTextSm: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 14,
    letterSpacing: 1.2,
  },

  // ---- LABELS ----
  label: {
    fontFamily: "Rajdhani_700Bold",
    fontSize: 12,
    letterSpacing: 2,
    color: "#D8D8D8",
    paddingLeft: 4,
    marginTop: 4,
  },

  // ---- INPUTS ----
  inputBg: {
    width: "100%",
    height: 56,
    justifyContent: "center",
  },
  inputInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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

  // ---- PASSWORD ROW ----
  passRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  eyeWrap: {
    width: 56,
    height: 56,
  },
  eyeBg: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  // ---- ERROR ----
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(170,20,20,0.55)",
    borderColor: "rgba(255,80,80,0.55)",
    borderWidth: 1,
    borderRadius: 4,
  },
  errorText: {
    flex: 1,
    color: "#FFE0E0",
    fontFamily: "Exo2_500Medium",
    fontSize: 12,
  },

  // ---- SUBMIT BUTTON ----
  submitWrap: {
    width: "100%",
    marginTop: 4,
  },
  submitBg: {
    width: "100%",
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  submitContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  submitText: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 22,
    letterSpacing: 3,
    color: "#0A0A0A",
  },

  // ---- FORGOT ----
  forgotWrap: {
    alignSelf: "center",
    paddingVertical: 6,
  },
  forgotText: {
    fontFamily: "Rajdhani_700Bold",
    fontSize: 12,
    letterSpacing: 2,
    color: "#FF8533",
  },

  // ---- FOOTER ----
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  footerText: {
    flex: 1,
    color: "#A8A8A8",
    fontFamily: "Exo2_400Regular",
    fontSize: 12,
    lineHeight: 16,
  },

  // ---- BIOMETRIC ----
  bioWrap: {
    width: "100%",
    marginTop: 4,
  },
  bioBg: {
    width: "100%",
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  bioText: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 16,
    letterSpacing: 2,
    color: "#FF8533",
  },

  // ---- shared skin image style ----
  skinImage: {
    // Force RN-Web to stretch instead of natural-size the underlying <img>
    width: "100%",
    height: "100%",
  },
});
