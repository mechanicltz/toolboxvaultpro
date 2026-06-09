/**
 * Change Login Email — secure 2-step flow.
 *   Step 1 (request): re-authenticate with current password + enter new email.
 *            Backend emails a 6-digit code to the NEW address.
 *   Step 2 (confirm): enter the code → email is updated and a fresh auth token
 *            is issued so the user stays signed in.
 *
 * The account email is the single source of truth: Personal Info and the
 * Report-a-Bug form both read from it, so changing it here updates everywhere.
 */
import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
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
import { IndustrialBanner } from "../src/components/IndustrialBanner";

export default function ChangeEmailScreen() {
  const router = useRouter();
  const { user, setUser } = useAuth();

  const [step, setStep] = useState<"request" | "confirm">("request");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const isValidEmail = (e: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const onRequest = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!currentPassword) {
      Alert.alert("Password required", "Enter your current password to continue.");
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert("Invalid email", "Please enter a valid new email address.");
      return;
    }
    if (email === String(user?.email || "").trim().toLowerCase()) {
      Alert.alert("Same email", "That is already your login email.");
      return;
    }
    setBusy(true);
    try {
      await api.requestEmailChange({
        current_password: currentPassword,
        new_email: email,
      });
      setStep("confirm");
      Alert.alert(
        "Code sent",
        `We sent a 6-digit code to ${email}. Enter it below to confirm the change.`
      );
    } catch (e: any) {
      Alert.alert("Could not continue", e?.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    const c = code.trim();
    if (c.length !== 6) {
      Alert.alert("Invalid code", "Enter the 6-digit code from your new email.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.confirmEmailChange({ code: c });
      // Persist the fresh token + updated user so the session stays valid.
      await setToken(res.token);
      setUser(res.user);
      Alert.alert(
        "Email updated",
        "Your login email has been changed. Use it next time you sign in.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert("Could not confirm", e?.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    setBusy(true);
    try {
      await api.requestEmailChange({
        current_password: currentPassword,
        new_email: newEmail.trim().toLowerCase(),
      });
      Alert.alert("Code resent", "A new code is on its way to your new email.");
    } catch (e: any) {
      Alert.alert("Could not resend", e?.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title="CHANGE LOGIN EMAIL"
        subtitle="Update the email you sign in with"
        onBack={() => router.back()} backIcon="chevron-back"
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.currentBox}>
            <Ionicons name="mail" size={16} color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.currentLabel}>CURRENT LOGIN EMAIL</Text>
              <Text style={styles.currentValue} numberOfLines={1}>
                {user?.email || "—"}
              </Text>
            </View>
          </View>

          {step === "request" ? (
            <>
              <Text style={styles.intro}>
                For your security, confirm your current password, then enter the
                new email you want to sign in with. We&apos;ll email a 6-digit code
                to that address to verify it.
              </Text>

              <Text style={styles.label}>CURRENT PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="Your current password"
                placeholderTextColor={theme.colors.textMuted}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                testID="ce-current-password"
              />

              <Text style={styles.label}>NEW LOGIN EMAIL</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={theme.colors.textMuted}
                value={newEmail}
                onChangeText={setNewEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                testID="ce-new-email"
              />

              <TouchableOpacity
                style={[styles.submit, busy && { opacity: 0.6 }]}
                onPress={onRequest}
                disabled={busy}
                activeOpacity={0.85}
                testID="ce-send-code"
              >
                {busy ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#000" />
                    <Text style={styles.submitText}>SEND VERIFICATION CODE</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.intro}>
                Enter the 6-digit code we sent to{" "}
                <Text style={{ color: theme.colors.accent, fontWeight: "900" }}>
                  {newEmail.trim().toLowerCase()}
                </Text>
                . The code expires in 15 minutes.
              </Text>

              <Text style={styles.label}>VERIFICATION CODE</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="123456"
                placeholderTextColor={theme.colors.textMuted}
                value={code}
                onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                testID="ce-code"
              />

              <TouchableOpacity
                style={[styles.submit, busy && { opacity: 0.6 }]}
                onPress={onConfirm}
                disabled={busy}
                activeOpacity={0.85}
                testID="ce-confirm"
              >
                {busy ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={16} color="#000" />
                    <Text style={styles.submitText}>CONFIRM EMAIL CHANGE</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkBtn}
                onPress={resendCode}
                disabled={busy}
                testID="ce-resend"
              >
                <Text style={styles.linkText}>Didn&apos;t get it? Resend code</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => {
                  setStep("request");
                  setCode("");
                }}
                disabled={busy}
                testID="ce-change-email-back"
              >
                <Text style={styles.linkTextMuted}>Use a different email</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  body: { padding: 16, paddingBottom: 32 },
  currentBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  currentLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  currentValue: {
    color: c.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  intro: {
    color: c.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 14,
  },
  label: {
    color: c.accent,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 12,
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
    fontSize: 13,
  },
  codeInput: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 8,
    textAlign: "center",
  },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.accent,
    paddingVertical: 15,
    borderRadius: 8,
    marginTop: 22,
  },
  submitText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  linkBtn: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
  linkText: {
    color: c.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  linkTextMuted: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
}));
