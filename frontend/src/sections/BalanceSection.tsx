import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import { api } from "../api";
import { confirm } from "../confirm";
import { PaymentModal } from "./PaymentModal";

export function BalanceSection({
  dealer,
  onChange,
}: {
  dealer: any;
  onChange: () => void;
}) {
  const [target, setTarget] = useState<{ account: "credit" | "personal"; type: "payment" | "charge" } | null>(null);
  const [historyOpen, setHistoryOpen] = useState<"credit" | "personal" | null>(null);

  const credit = Number(dealer?.credit_balance || 0);
  const personal = Number(dealer?.personal_balance || 0);

  const removeTx = async (txId: string) => {
    const ok = await confirm("Delete Transaction", "Reverses the balance change. Sure?", "Delete", true);
    if (!ok) return;
    try {
      await api.deleteDealerTransaction(dealer.id, txId);
      onChange();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const transactionsForAccount = (account: "credit" | "personal") =>
    (dealer?.transactions || [])
      .filter((t: any) => t.account === account)
      .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));

  return (
    <>
      <Text style={styles.sectionLabel}>BALANCES</Text>

      <BalanceCard
        label="CREDIT ACCOUNT"
        balance={credit}
        onPay={() => setTarget({ account: "credit", type: "payment" })}
        onCharge={() => setTarget({ account: "credit", type: "charge" })}
        onHistory={() => setHistoryOpen("credit")}
        history={transactionsForAccount("credit")}
      />
      <BalanceCard
        label="PERSONAL ACCOUNT"
        balance={personal}
        onPay={() => setTarget({ account: "personal", type: "payment" })}
        onCharge={() => setTarget({ account: "personal", type: "charge" })}
        onHistory={() => setHistoryOpen("personal")}
        history={transactionsForAccount("personal")}
      />

      {target && (
        <PaymentModal
          visible={!!target}
          dealer={dealer}
          account={target.account}
          defaultType={target.type}
          onClose={() => setTarget(null)}
          onSaved={() => {
            setTarget(null);
            onChange();
          }}
        />
      )}

      <Modal visible={!!historyOpen} transparent animationType="slide" onRequestClose={() => setHistoryOpen(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {historyOpen === "credit" ? "CREDIT" : "PERSONAL"} HISTORY
            </Text>
            <ScrollView style={{ maxHeight: 480 }}>
              {historyOpen && transactionsForAccount(historyOpen).length === 0 ? (
                <Text style={styles.empty}>No transactions yet.</Text>
              ) : (
                historyOpen &&
                transactionsForAccount(historyOpen).map((t: any) => (
                  <View key={t.id} style={styles.txRow}>
                    <View style={styles.txIconBox}>
                      <Ionicons
                        name={t.type === "payment" ? "trending-down" : "trending-up"}
                        size={18}
                        color={t.type === "payment" ? theme.colors.success : theme.colors.danger}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txAmount}>
                        {t.type === "payment" ? "−" : "+"}${Number(t.amount).toFixed(2)}
                      </Text>
                      <Text style={styles.txMeta}>
                        {t.date}  ·  {(t.type || "").toUpperCase()}
                      </Text>
                      {!!t.note && <Text style={styles.txNote}>{t.note}</Text>}
                    </View>
                    <TouchableOpacity onPress={() => removeTx(t.id)} hitSlop={10}>
                      <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.btnGhost} onPress={() => setHistoryOpen(null)}>
              <Text style={styles.btnGhostText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function BalanceCard({
  label,
  balance,
  onPay,
  onCharge,
  onHistory,
  history,
}: {
  label: string;
  balance: number;
  onPay: () => void;
  onCharge: () => void;
  onHistory: () => void;
  history: any[];
}) {
  const owed = balance > 0;
  return (
    <View style={[styles.balCard, owed && { borderLeftColor: theme.colors.danger }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={styles.balLabel}>{label}</Text>
        <TouchableOpacity onPress={onHistory}>
          <Text style={styles.histLink}>HISTORY ({history.length})</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.balAmount, { color: owed ? theme.colors.danger : theme.colors.success }]}>
        ${balance.toFixed(2)}
      </Text>
      <Text style={styles.balSub}>{owed ? "Outstanding balance" : "Paid up"}</Text>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <TouchableOpacity testID={`pay-${label.replace(/\s/g, "-")}`} style={styles.payBtn} onPress={onPay}>
          <Ionicons name="trending-down" size={14} color="#000" />
          <Text style={styles.payText}>LOG PAYMENT</Text>
        </TouchableOpacity>
        <TouchableOpacity testID={`charge-${label.replace(/\s/g, "-")}`} style={styles.chargeBtn} onPress={onCharge}>
          <Ionicons name="trending-up" size={14} color="#fff" />
          <Text style={styles.chargeText}>ADD CHARGE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  balCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: theme.radii.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.success,
  },
  balLabel: { color: theme.colors.textPrimary, fontSize: 9, fontWeight: "900", letterSpacing: 2 },
  histLink: { color: theme.colors.accent, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  balAmount: { fontSize: 23, fontWeight: "900", marginTop: 8 },
  balSub: { color: theme.colors.textMuted, fontSize: 9, marginTop: 2 },
  payBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: theme.colors.accent,
    borderRadius: 4,
  },
  payText: { color: "#000", fontWeight: "900", fontSize: 9, letterSpacing: 1 },
  chargeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: 4,
  },
  chargeText: { color: theme.colors.danger, fontWeight: "900", fontSize: 9, letterSpacing: 1 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 20,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
    maxHeight: "85%",
  },
  modalTitle: { color: theme.colors.textPrimary, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginBottom: 12 },
  empty: { color: theme.colors.textMuted, fontStyle: "italic", padding: 16, textAlign: "center" },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  txIconBox: { width: 36, height: 36, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.bg, borderRadius: 18 },
  txAmount: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 13 },
  txMeta: { color: theme.colors.textMuted, fontSize: 9, fontWeight: "700", marginTop: 2, letterSpacing: 0.5 },
  txNote: { color: theme.colors.textSecondary, fontSize: 10, marginTop: 3, fontStyle: "italic" },
  btnGhost: {
    height: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.sm,
    marginTop: 12,
  },
  btnGhostText: { color: theme.colors.textPrimary, fontWeight: "800", letterSpacing: 2 },
});
