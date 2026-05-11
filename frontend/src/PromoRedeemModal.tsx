// Reusable modal that lets a logged-in user redeem a promo code.
// Used from More → Settings and from the (future) Paywall screen.
import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";
import { api } from "./api";

export function PromoRedeemModal({
  visible,
  onClose,
  onRedeemed,
}: {
  visible: boolean;
  onClose: () => void;
  onRedeemed?: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState<string | null>(null);

  const reset = () => {
    setCode("");
    setErr("");
    setOk(null);
  };

  const submit = async () => {
    const c = code.trim().toUpperCase();
    if (!c) {
      setErr("Enter a code");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await api.redeemPromo(c);
      setOk(
        r?.is_lifetime
          ? "✨ Lifetime PRO unlocked!"
          : r?.expires_at
            ? `✨ PRO unlocked until ${new Date(r.expires_at).toLocaleDateString()}`
            : "✨ Code applied!",
      );
      onRedeemed?.();
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not redeem code");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={Platform.OS === "ios" ? "slide" : "fade"}
      onRequestClose={close}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={close}
        testID="promo-backdrop"
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>REDEEM CODE</Text>
              <TouchableOpacity onPress={close} hitSlop={12} testID="promo-close">
                <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Enter your code below.</Text>

            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="e.g. PROMO-A7K9-X2M1"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
              testID="promo-input"
            />

            {err ? (
              <View style={styles.errBox}>
                <Ionicons name="alert-circle" size={16} color={theme.colors.danger} />
                <Text style={styles.errText}>{err}</Text>
              </View>
            ) : null}

            {ok ? (
              <View style={styles.okBox}>
                <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                <Text style={styles.okText}>{ok}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.submit,
                (busy || !!ok) && { opacity: 0.5 },
              ]}
              onPress={ok ? close : submit}
              disabled={busy}
              testID="promo-submit"
            >
              {busy ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.submitText}>
                  {ok ? "DONE" : "REDEEM"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: theme.colors.bgSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    color: theme.colors.textPrimary,
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 13,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.bg,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 12,
  },
  errBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(220,38,38,0.10)",
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    alignItems: "center",
  },
  errText: { color: theme.colors.danger, fontWeight: "700", fontSize: 12, flex: 1 },
  okBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(46,160,67,0.12)",
    borderWidth: 1,
    borderColor: theme.colors.success,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    alignItems: "center",
  },
  okText: { color: theme.colors.success, fontWeight: "800", fontSize: 12, flex: 1 },
  submit: {
    backgroundColor: theme.colors.accent,
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 12,
  },
});
