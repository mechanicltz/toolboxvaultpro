/**
 * Forgot Password flow.
 *
 * Two-step:
 *  1) User enters email → we call /auth/forgot-password → backend emails a
 *     6-digit code. The screen transitions to Step 2 regardless of whether
 *     the email exists (security: no enumeration).
 *  2) User enters the 6-digit code + new password → /auth/reset-password →
 *     on success, we set the auth token and route the user into the app.
 */
import { useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../src/theme";
import { api, setToken } from "../src/api";
import { useAuth } from "../src/AuthContext";

import { themedStyles } from "../src/themeContext";

type Step = "request" | "verify";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const submitEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert("Missing info", "Please enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await api.forgotPassword({ email: trimmed });
      // Always transition — backend does not reveal whether email exists.
      setEmail(trimmed);
      setStep("verify");
      Alert.alert(
        "Check your email",
        "If that email is registered, we've sent a 6-digit code. It expires in 15 minutes.",
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not request a reset code.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    const codeTrim = code.replace(/\s+/g, "").trim();
    if (!/^\d{6}$/.test(codeTrim)) {
      Alert.alert("Missing info", "Please enter the 6-digit code from your email.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Missing info", "New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.resetPassword({
        email,
        code: codeTrim,
        new_password: newPassword,
      });
      if (res?.token) {
        await setToken(res.token);
      }
      await refresh();
      Alert.alert(
        "Password reset",
        "Your password has been updated and you're now signed in.",
        [{ text: "OK", onPress: () => router.replace("/") }],
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Invalid or expired code.");
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    setBusy(true);
    try {
      await api.forgotPassword({ email });
      Alert.alert("Sent", "A new 6-digit code has been sent if that email is registered.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not resend code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (step === "verify" ? setStep("request") : router.back())}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === "request" ? "FORGOT PASSWORD" : "RESET PASSWORD"}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {step === "request" ? (
            <>
              <Text style={styles.intro}>
                Enter the email address on your account. We&apos;ll send you a 6-digit
                code so you can set a new password.
              </Text>

              <Text style={styles.label}>EMAIL</Text>
              <TextInput
                testID="fp-email"
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={theme.colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={[styles.submit, busy && { opacity: 0.6 }]}
                onPress={submitEmail}
                disabled={busy}
                testID="fp-send-code"
              >
                {busy ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Ionicons name="mail" size={16} color="#000" />
                    <Text style={styles.submitText}>SEND CODE</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.intro}>
                Enter the 6-digit code we sent to{" "}
                <Text style={{ color: theme.colors.accent, fontWeight: "800" }}>
                  {email}
                </Text>
                , then choose a new password.
              </Text>

              <Text style={styles.label}>6-DIGIT CODE</Text>
              <TextInput
                testID="fp-code"
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor={theme.colors.textMuted}
                value={code}
                onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />

              <Text style={styles.label}>NEW PASSWORD</Text>
              <View style={styles.pwWrap}>
                <TextInput
                  testID="fp-new-password"
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="At least 6 characters"
                  placeholderTextColor={theme.colors.textMuted}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setShowPw((s) => !s)}
                  style={styles.pwToggle}
                  hitSlop={10}
                >
                  <Ionicons
                    name={showPw ? "eye-off" : "eye"}
                    size={20}
                    color={theme.colors.textMuted}
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>CONFIRM NEW PASSWORD</Text>
              <TextInput
                testID="fp-confirm-password"
                style={styles.input}
                placeholder="Re-enter your new password"
                placeholderTextColor={theme.colors.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={[styles.submit, busy && { opacity: 0.6 }]}
                onPress={submitCode}
                disabled={busy}
                testID="fp-reset"
              >
                {busy ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={16} color="#000" />
                    <Text style={styles.submitText}>RESET PASSWORD</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={{ alignSelf: "center", marginTop: 18 }}
                onPress={resendCode}
                disabled={busy}
              >
                <Text style={{ color: theme.colors.accent, fontSize: 10, fontWeight: "700" }}>
                  Didn&apos;t get it? Resend code
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerTitle: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  body: { padding: 20, paddingBottom: 40 },
  intro: {
    color: c.textSecondary,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 22,
  },
  label: {
    color: c.accent,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: c.bgSecondary,
    color: c.textPrimary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 11,
  
    ...(theme.elevation.md as object),
  },
  codeInput: {
    fontSize: 19,
    letterSpacing: 10,
    textAlign: "center",
    fontWeight: "900",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  pwWrap: { flexDirection: "row", alignItems: "center" },
  pwToggle: {
    position: "absolute",
    right: 10,
    padding: 6,
  },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.accent,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 20,
  },
  submitText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
}));
