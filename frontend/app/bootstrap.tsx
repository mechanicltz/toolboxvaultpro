// Bootstrap · "Fresh Install Detected"
// Shown BEFORE login when the database is empty (e.g. after a full wipe or a
// brand-new deployment). Lets the owner restore everything from a backup ZIP
// they saved (download the encrypted .zip + its PASSPHRASE.txt from Google
// Drive to this device, pick the .zip here, paste the passphrase, restore).
//
// This route is PUBLIC and only functional while the DB has zero users — the
// backend's /bootstrap/restore returns 410 the moment any user exists.
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { themedStyles } from "../src/themeContext";

type Picked = { uri: string; name: string };

export default function BootstrapScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [fresh, setFresh] = useState<boolean | null>(null);
  const [file, setFile] = useState<Picked | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState<"" | "preview" | "restore">("");
  const [preview, setPreview] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const s = await api.bootstrapStatus();
      setFresh(s.fresh);
      // If the DB already has data, there's nothing to bootstrap — go to login.
      if (!s.fresh) {
        router.replace("/login");
      }
    } catch {
      setFresh(true); // assume fresh so the user can still attempt a restore
    } finally {
      setChecking(false);
    }
  }, [router]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const pickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/octet-stream", "*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setFile({ uri: a.uri, name: a.name || "backup.zip" });
      setPreview(null);
    } catch (e: any) {
      Alert.alert("Could not open file", String(e?.message || e));
    }
  }, []);

  const runPreview = useCallback(async () => {
    if (!file) return;
    setBusy("preview");
    setPreview(null);
    try {
      const r = await api.bootstrapRestore(file.uri, file.name, passphrase.trim(), true);
      const counts = r.would_restore || {};
      const lines = Object.entries(counts)
        .filter(([, n]) => (n as number) > 0)
        .map(([k, n]) => `• ${n} ${k}`)
        .join("\n");
      setPreview(`Would restore ${r.total_documents.toLocaleString()} documents:\n${lines}`);
    } catch (e: any) {
      Alert.alert("Preview failed", String(e?.message || e));
    } finally {
      setBusy("");
    }
  }, [file, passphrase]);

  const runRestore = useCallback(async () => {
    if (!file) return;
    Alert.alert(
      "Restore everything?",
      "This will populate the database from this backup. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: async () => {
            setBusy("restore");
            try {
              const r = await api.bootstrapRestore(file.uri, file.name, passphrase.trim(), false);
              Alert.alert(
                "Restore complete ✓",
                `Restored ${r.total_documents.toLocaleString()} documents.\n` +
                  "You can now sign in with your account.",
                [{ text: "Go to Login", onPress: () => router.replace("/login") }],
              );
            } catch (e: any) {
              Alert.alert("Restore failed", String(e?.message || e));
            } finally {
              setBusy("");
            }
          },
        },
      ],
    );
  }, [file, passphrase, router]);

  if (checking) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}>
            <Ionicons name="construct" size={48} color={theme.colors.accent} />
          </View>
          <Text style={styles.title}>Fresh Install Detected</Text>
          <Text style={styles.subtitle}>
            This database is empty. If you have a backup, restore everything now —
            or continue to login to start fresh.
          </Text>

          <View style={styles.card}>
            <Text style={styles.step}>1 · Choose your backup file</Text>
            <Text style={styles.hint}>
              Download the encrypted <Text style={styles.b}>.zip</Text> (and its{" "}
              <Text style={styles.b}>PASSPHRASE.txt</Text>) from Google Drive to this
              device first, then pick the .zip here.
            </Text>
            <TouchableOpacity style={styles.pickBtn} onPress={pickFile} activeOpacity={0.8} testID="bootstrap-pick">
              <Ionicons name="document-attach-outline" size={18} color={theme.colors.accent} />
              <Text style={styles.pickText} numberOfLines={1}>
                {file ? file.name : "Select backup .zip"}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.step, { marginTop: 16 }]}>2 · Passphrase</Text>
            <Text style={styles.hint}>From the matching PASSPHRASE.txt (leave blank if unencrypted).</Text>
            <TextInput
              testID="bootstrap-passphrase"
              style={styles.input}
              placeholder="Paste passphrase"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              value={passphrase}
              onChangeText={setPassphrase}
            />

            <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost, !file && styles.btnDisabled]}
                onPress={runPreview}
                disabled={!file || busy !== ""}
                activeOpacity={0.8}
                testID="bootstrap-preview"
              >
                {busy === "preview" ? (
                  <ActivityIndicator color={theme.colors.accent} />
                ) : (
                  <Text style={styles.btnGhostText}>PREVIEW</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, !file && styles.btnDisabled]}
                onPress={runRestore}
                disabled={!file || busy !== ""}
                activeOpacity={0.8}
                testID="bootstrap-restore"
              >
                {busy === "restore" ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.btnPrimaryText}>RESTORE EVERYTHING</Text>
                )}
              </TouchableOpacity>
            </View>

            {preview && <Text style={styles.preview}>{preview}</Text>}
          </View>

          <TouchableOpacity onPress={() => router.replace("/login")} style={styles.skip} testID="bootstrap-skip">
            <Text style={styles.skipText}>Skip — continue to login</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 24, paddingBottom: 48 },
  iconWrap: { alignItems: "center", marginTop: 12, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "900", color: c.textPrimary, textAlign: "center", letterSpacing: 0.5 },
  subtitle: { fontSize: 14, color: c.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 20 },
  card: {
    marginTop: 24,
    backgroundColor: c.bgSecondary,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: c.border,
  },
  step: { fontSize: 13, fontWeight: "800", color: c.accent, letterSpacing: 0.4 },
  hint: { fontSize: 12, color: c.textMuted, marginTop: 4, lineHeight: 17 },
  b: { fontWeight: "800", color: c.textSecondary },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickText: { color: c.textPrimary, fontSize: 14, fontWeight: "700", flex: 1 },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: c.textPrimary,
    backgroundColor: c.surface,
    fontSize: 15,
  },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  btnGhost: { borderWidth: 2, borderColor: c.accent },
  btnGhostText: { color: c.accent, fontWeight: "800", fontSize: 13, letterSpacing: 0.4 },
  btnPrimary: { backgroundColor: c.accent },
  btnPrimaryText: { color: "#000", fontWeight: "800", fontSize: 13, letterSpacing: 0.4 },
  btnDisabled: { opacity: 0.45 },
  preview: { marginTop: 14, color: c.success, fontSize: 13, lineHeight: 19 },
  skip: { marginTop: 22, alignItems: "center" },
  skipText: { color: c.textMuted, fontSize: 14, textDecorationLine: "underline" },
}));
