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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../src/theme";
import { useAuth } from "../src/AuthContext";

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (busy) return;
    setErr("");
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
            <View style={styles.logoBox}>
              <Ionicons name="construct" size={36} color={theme.colors.accent} />
            </View>
            <Text style={styles.brandTitle}>TOOLBOX TRACKER</Text>
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

            {err ? (
              <View style={styles.errBox}>
                <Ionicons name="alert-circle" size={16} color={theme.colors.danger} />
                <Text style={styles.errText}>{String(err)}</Text>
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

            <Text style={styles.hint}>
              {mode === "login"
                ? "New user? Use Create Account to get started for free."
                : "Free plan: 10 tools, 1 dealer. Upgrade anytime."}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { padding: 24, flexGrow: 1, justifyContent: "center" },
  brand: { alignItems: "center", marginBottom: 28 },
  logoBox: {
    width: 72,
    height: 72,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.glassBorder,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  brandTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "900",
    fontSize: 22,
    letterSpacing: 3,
  },
  brandSub: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: theme.colors.bgSecondary,
    borderRadius: 10,
    padding: 4,
    marginBottom: 18,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8 },
  tabActive: { backgroundColor: theme.colors.accent },
  tabText: { color: theme.colors.textMuted, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  tabTextActive: { color: "#000" },
  field: { marginBottom: 14 },
  label: {
    color: theme.colors.textMuted,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.bgSecondary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eye: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bgSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
  errText: { color: theme.colors.danger, fontSize: 13, flex: 1 },
  submitBtn: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  submitText: { color: "#000", fontWeight: "900", fontSize: 14, letterSpacing: 1.5 },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 14,
    lineHeight: 16,
  },
});
