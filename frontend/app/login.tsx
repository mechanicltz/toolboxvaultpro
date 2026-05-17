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
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../src/theme";
import { useAuth } from "../src/AuthContext";
import {
  getBiometricStatus,
  tryBiometricLogin,
  enableBiometric,
  hasBeenPromptedForBiometric,
  markBiometricPrompted,
} from "../src/biometric";

import { themedStyles } from "../src/themeContext";

export default function LoginScreen() {
  const router = useRouter();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  // Biometric state — drives whether we show the Face ID / Touch ID
  // button and which label to use (Face ID vs Touch ID vs Fingerprint).
  const [bio, setBio] = useState<{ enabled: boolean; label: string; hasHardware: boolean; isEnrolled: boolean } | null>(null);
  const autoPromptedRef = useRef(false);

  // On mount, read biometric status. If the user has previously opted in,
  // immediately fire the biometric prompt so they don't have to type
  // anything (auto-prompt every time the login screen appears after intro).
  useEffect(() => {
    (async () => {
      const s = await getBiometricStatus();
      setBio({ enabled: s.enabled, label: s.label, hasHardware: s.hasHardware, isEnrolled: s.isEnrolled });
      if (s.enabled && s.hasHardware && s.isEnrolled && !autoPromptedRef.current) {
        autoPromptedRef.current = true;
        await runBiometricLogin();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Prompt with Face ID / Touch ID. On success, retrieve the saved
   * credentials and complete a normal backend login (so the user gets
   * a fresh JWT/session).
   */
  const runBiometricLogin = async () => {
    if (busy) return;
    setErr("");
    setInfo("");
    const creds = await tryBiometricLogin();
    if (!creds) return; // user cancelled or unavailable
    setBusy(true);
    try {
      await login(creds.email, creds.password);
    } catch (e: any) {
      // Saved password no longer valid — surface a sensible error and
      // let the user type it manually.
      setErr(
        "Saved credentials didn't work. Please sign in with your password to refresh them.",
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * Called after a SUCCESSFUL password login. If the device has
   * biometric hardware enrolled but the user has never been asked,
   * offer to enable it. Marks "prompted" either way so we don't keep
   * pestering.
   *
   * BUG FIX (user report #10): we used to fire Alert.alert immediately
   * after `login()` resolved. But `login()` synchronously sets the
   * user state, which makes AuthGate re-render and navigate AWAY from
   * the login screen on the next paint. iOS sometimes drops the
   * pending Alert in that transition, so the user never saw the
   * "Enable Face ID?" prompt. Deferring by ~700ms gives the navigator
   * time to settle so the alert fires from a stable UI context.
   */
  const maybeOfferBiometricEnrol = async (mail: string, pw: string) => {
    if (Platform.OS === "web") return;
    try {
      const s = await getBiometricStatus();
      if (!s.hasHardware || !s.isEnrolled) return;
      if (s.enabled) return; // already on
      const asked = await hasBeenPromptedForBiometric();
      if (asked) return;
      // Defer the alert past the post-login navigation transition.
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
                  // ignore — user can enable later from More tab
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
        const result = await register(email, password, name, promoCode);
        if (result?.promoRedeemed) {
          setInfo("✓ Account created and promo code applied! You now have PRO.");
        } else if (result?.promoError) {
          setInfo(
            "Account created. But the promo code couldn't be applied: " +
              result.promoError,
          );
        }
        // Offer biometric enrolment after fresh sign-up too.
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
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <Image
              source={require("../assets/images/icon-transparent.png")}
              style={styles.brandLogo}
              resizeMode="contain"
            />
            <Text style={styles.brandTitle}>TOOLBOX VAULT</Text>
            <Text style={styles.brandSub}>
              Inventory · Dealers · Warranties · Reports
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.tabs}>
              <TouchableOpacity
                onPress={() => setMode("login")}
                style={[styles.tab, mode === "login" && styles.tabActive]}
              >
                <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMode("register")}
                style={[styles.tab, mode === "register" && styles.tabActive]}
              >
                <Text
                  style={[styles.tabText, mode === "register" && styles.tabTextActive]}
                >
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>

            {mode === "register" && (
              <View style={styles.field}>
                <Text style={styles.label}>NAME (OPTIONAL)</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.input}
                  autoCapitalize="words"
                  testID="auth-name"
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>EMAIL</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                testID="auth-email"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={mode === "register" ? "At least 6 characters" : "••••••••"}
                  placeholderTextColor={theme.colors.textMuted}
                  style={[styles.input, { flex: 1 }]}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  testID="auth-password"
                />
                <TouchableOpacity
                  style={styles.eye}
                  onPress={() => setShowPassword((s) => !s)}
                >
                  <Ionicons
                    name={showPassword ? "eye-off" : "eye"}
                    size={18}
                    color={theme.colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {mode === "register" && (
              <View style={styles.field}>
                <Text style={styles.label}>PROMO CODE (OPTIONAL)</Text>
                <TextInput
                  value={promoCode}
                  onChangeText={(t) => setPromoCode(t.toUpperCase())}
                  placeholder="If you have a code, enter it here"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.input}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  testID="auth-promo-code"
                />
              </View>
            )}

            {err ? (
              <View style={styles.errBox}>
                <Ionicons name="alert-circle" size={16} color={theme.colors.danger} />
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
                <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                <Text style={[styles.errText, { color: theme.colors.success }]}>{info}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={submit}
              disabled={busy}
              testID="auth-submit"
            >
              {busy ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Ionicons
                    name={mode === "login" ? "log-in" : "person-add"}
                    size={18}
                    color="#000"
                  />
                  <Text style={styles.submitText}>
                    {mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {mode === "login" && bio?.enabled && bio.hasHardware && bio.isEnrolled ? (
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
                  color={theme.colors.accent}
                />
                <Text style={styles.bioBtnText}>
                  SIGN IN WITH {bio.label.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ) : null}

            {mode === "login" && (
              <TouchableOpacity
                onPress={() => router.push("/forgot-password")}
                style={{ alignSelf: "center", marginTop: 14 }}
                testID="forgot-password-link"
              >
                <Text style={{ color: theme.colors.accent, fontSize: 10, fontWeight: "700" }}>
                  Forgot password?
                </Text>
              </TouchableOpacity>
            )}

            <Text style={styles.hint}>
              {mode === "login"
                ? "New user? Use Create Account to get started for free."
                : "Create an account to start tracking your tools."}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 24, flexGrow: 1, justifyContent: "center" },
  brand: { alignItems: "center", marginBottom: 28 },
  brandLogo: {
    width: 110,
    height: 110,
    marginBottom: 14,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "transparent",
    resizeMode: "cover",
  },
  logoBox: {
    width: 72,
    height: 72,
    backgroundColor: c.surface,
    borderColor: c.glassBorder,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  brandTitle: {
    color: c.textPrimary,
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 3,
  },
  brandSub: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: c.border,
  
    ...(theme.elevation.md as object),
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: c.bgSecondary,
    borderRadius: 10,
    padding: 4,
    marginBottom: 18,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8 },
  tabActive: { backgroundColor: c.accent },
  tabText: { color: c.textMuted, fontWeight: "800", fontSize: 9, letterSpacing: 1 },
  tabTextActive: { color: "#000" },
  field: { marginBottom: 14 },
  label: {
    color: c.textMuted,
    fontWeight: "800",
    fontSize: 8,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: c.bgSecondary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: c.textPrimary,
    fontSize: 11,
    borderWidth: 1,
    borderColor: c.border,
  
    ...(theme.elevation.input as object),
  },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eye: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.bgSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239,68,68,0.1)",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  errText: { color: c.danger, fontSize: 10, flex: 1 },
  submitBtn: {
    backgroundColor: c.accent,
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  submitText: { color: "#000", fontWeight: "900", fontSize: 10, letterSpacing: 1.5 },
  bioBtn: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: c.accent,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },
  bioBtnText: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  hint: {
    color: c.textMuted,
    fontSize: 8,
    textAlign: "center",
    marginTop: 14,
    lineHeight: 12,
  },
}));
