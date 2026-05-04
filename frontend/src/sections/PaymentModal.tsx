import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import { api } from "../api";
import { DateField } from "../DateField";

export function PaymentModal({
  visible,
  dealer,
  account, // "credit" | "personal"
  defaultType = "payment", // "payment" decreases balance, "charge" increases
  onClose,
  onSaved,
}: {
  visible: boolean;
  dealer: any;
  account: "credit" | "personal";
  defaultType?: "payment" | "charge";
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().substring(0, 10);
  const [type, setType] = useState<"payment" | "charge">(defaultType);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setType(defaultType);
      setAmount("");
      setNote("");
      setDate(today);
    }
  }, [visible, defaultType]);

  const submit = async () => {
    const a = parseFloat(amount);
    if (!a || a <= 0) {
      Alert.alert("Invalid", "Enter an amount > 0");
      return;
    }
    setBusy(true);
    try {
      await api.addDealerTransaction(dealer.id, {
        account,
        type,
        amount: a,
        note,
        date,
      });
      onSaved();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!dealer) return null;
  const accountLabel = account === "credit" ? "CREDIT ACCOUNT" : "PERSONAL ACCOUNT";
  const currentBalance =
    account === "credit"
      ? Number(dealer.credit_balance || 0)
      : Number(dealer.personal_balance || 0);
  const projected =
    type === "payment"
      ? currentBalance - (parseFloat(amount) || 0)
      : currentBalance + (parseFloat(amount) || 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.bg}>
          <View style={styles.card}>
            <Text style={styles.title}>{dealer.name}</Text>
            <Text style={styles.subtitle}>{accountLabel}</Text>
            <View style={styles.balRow}>
              <Text style={styles.balLabel}>Current</Text>
              <Text style={[styles.balVal, currentBalance > 0 && { color: theme.colors.danger }]}>
                ${currentBalance.toFixed(2)}
              </Text>
              <Ionicons name="arrow-forward" size={14} color={theme.colors.textMuted} />
              <Text
                style={[
                  styles.balVal,
                  projected > currentBalance && { color: theme.colors.danger },
                  projected < currentBalance && { color: theme.colors.success },
                ]}
              >
                ${projected.toFixed(2)}
              </Text>
            </View>

            <View style={styles.segment}>
              <TouchableOpacity
                testID="type-payment"
                style={[styles.segBtn, type === "payment" && styles.segBtnActive]}
                onPress={() => setType("payment")}
              >
                <Ionicons
                  name="trending-down"
                  size={14}
                  color={type === "payment" ? "#000" : theme.colors.textSecondary}
                />
                <Text style={[styles.segText, type === "payment" && styles.segTextActive]}>
                  PAYMENT
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="type-charge"
                style={[styles.segBtn, type === "charge" && styles.segBtnActive]}
                onPress={() => setType("charge")}
              >
                <Ionicons
                  name="trending-up"
                  size={14}
                  color={type === "charge" ? "#000" : theme.colors.textSecondary}
                />
                <Text style={[styles.segText, type === "charge" && styles.segTextActive]}>
                  CHARGE
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>AMOUNT ($)</Text>
            <TextInput
              testID="amount-input"
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              style={[styles.input, { fontSize: 18, fontWeight: "900" }]}
              keyboardType="decimal-pad"
              autoFocus
            />

            <Text style={styles.label}>DATE</Text>
            <DateField value={date} onChange={setDate} />

            <Text style={styles.label}>NOTE</Text>
            <TextInput
              testID="note-input"
              placeholder="Check #, invoice ref, etc."
              placeholderTextColor={theme.colors.textMuted}
              value={note}
              onChangeText={setNote}
              style={styles.input}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={styles.btnGhost} onPress={onClose} disabled={busy}>
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="submit-tx"
                style={[
                  styles.btnPrimary,
                  type === "charge" && { backgroundColor: theme.colors.danger },
                ]}
                onPress={submit}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={type === "charge" ? "#fff" : "#000"} />
                ) : (
                  <Text
                    style={[
                      styles.btnPrimaryText,
                      type === "charge" && { color: "#fff" },
                    ]}
                  >
                    {type === "payment" ? "LOG PAYMENT" : "ADD CHARGE"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  card: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 22,
    borderRadius: theme.radii.md,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
  },
  title: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 4,
  },
  balRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    marginVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  balLabel: { color: theme.colors.textMuted, fontSize: 9, fontWeight: "700" },
  balVal: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: "900" },
  segment: {
    flexDirection: "row",
    backgroundColor: theme.colors.bg,
    borderRadius: 6,
    padding: 3,
    marginBottom: 14,
  },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 4,
  },
  segBtnActive: { backgroundColor: theme.colors.accent },
  segText: { color: theme.colors.textSecondary, fontWeight: "800", letterSpacing: 1.5, fontSize: 10 },
  segTextActive: { color: "#000" },
  label: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 4,
    fontSize: 11,
  },
  btnGhost: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.sm,
  },
  btnGhostText: { color: theme.colors.textPrimary, fontWeight: "800", letterSpacing: 2 },
  btnPrimary: {
    flex: 2,
    height: 46,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.sm,
  },
  btnPrimaryText: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 11 },
});
