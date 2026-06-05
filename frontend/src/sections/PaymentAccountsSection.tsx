// Scheduled recurring payments for a dealer ("per dealer, per account").
// A dealer can have multiple payment accounts (e.g. "Truck Loan", "Tool
// Account"), each with an amount, frequency, next due date, autopay flag and
// per-account reminder toggles. Mirrors the BalanceSection pattern.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import { PillButton } from "../components/PillButton";
import { BevelCard } from "../components/BevelCard";
import { DateField } from "../DateField";
import { confirm } from "../confirm";
import { api, PaymentAccount, PaymentAccountInput } from "../api";
import { todayISO, formatDateUS } from "../dateUtil";
import { reschedulePaymentRemindersNow } from "../notifications";
import { themedStyles } from "../themeContext";

const FREQUENCIES: { id: "weekly" | "biweekly" | "monthly"; label: string }[] = [
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Biweekly" },
  { id: "monthly", label: "Monthly" },
];

const freqLabel = (f: string) =>
  f === "weekly" ? "Weekly" : f === "biweekly" ? "Every 2 weeks" : "Monthly";

function dueStatus(iso: string): { text: string; color: string; urgent: boolean } {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = iso.split("-").map(Number);
    const due = new Date(y, m - 1, d);
    const days = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (days < 0) return { text: `Overdue by ${Math.abs(days)}d`, color: theme.colors.danger, urgent: true };
    if (days === 0) return { text: "Due today", color: theme.colors.danger, urgent: true };
    if (days === 1) return { text: "Due tomorrow", color: theme.colors.warning || "#E0A100", urgent: true };
    if (days <= 7) return { text: `Due in ${days} days`, color: theme.colors.warning || "#E0A100", urgent: false };
    return { text: `Due ${formatDateUS(iso)}`, color: theme.colors.textMuted, urgent: false };
  } catch {
    return { text: iso, color: theme.colors.textMuted, urgent: false };
  }
}

export function PaymentAccountsSection({
  dealerId,
  onChange,
}: {
  dealerId: string;
  onChange?: () => void;
}) {
  const [accounts, setAccounts] = useState<PaymentAccount[] | null>(null);
  const [editing, setEditing] = useState<PaymentAccount | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.listPaymentAccounts(dealerId);
      setAccounts(rows);
    } catch {
      setAccounts([]);
    }
  }, [dealerId]);

  useEffect(() => { load(); }, [load]);

  const afterMutation = useCallback(async () => {
    await load();
    onChange?.();
    // Reschedule local reminders to reflect the new due dates (best-effort).
    reschedulePaymentRemindersNow().catch(() => {});
  }, [load, onChange]);

  const markPaid = useCallback(async (acct: PaymentAccount) => {
    const ok = await confirm(
      "Confirm payment?",
      `Record a ${acct.label} payment of $${Number(acct.amount).toFixed(2)} as made today and advance to the next due date.`,
      "Mark Paid",
    );
    if (!ok) return;
    setBusyId(acct.id);
    try {
      await api.confirmPayment(acct.id);
      await afterMutation();
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  }, [afterMutation]);

  const remove = useCallback(async (acct: PaymentAccount) => {
    const ok = await confirm("Delete payment account?", `"${acct.label}" and its history will be removed.`, "Delete", true);
    if (!ok) return;
    setBusyId(acct.id);
    try {
      await api.deletePaymentAccount(acct.id);
      await afterMutation();
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  }, [afterMutation]);

  return (
    <>
      <Text style={styles.sectionLabel}>SCHEDULED PAYMENTS</Text>

      {accounts === null ? (
        <View style={{ paddingVertical: 16, alignItems: "center" }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : accounts.length === 0 ? (
        <BevelCard style={styles.card}>
          <Text style={styles.empty}>
            No payment accounts yet. Track loans or recurring bills for this dealer.
          </Text>
        </BevelCard>
      ) : (
        accounts.map((acct) => {
          const st = dueStatus(acct.next_due_date);
          return (
            <BevelCard key={acct.id} style={[styles.card, st.urgent && { borderLeftColor: theme.colors.danger }]}>
              <View style={styles.rowTop}>
                <Text style={styles.label} numberOfLines={1}>{acct.label}</Text>
                {acct.autopay && (
                  <View style={styles.autopayPill}>
                    <Ionicons name="sync" size={10} color={theme.colors.accent} />
                    <Text style={styles.autopayText}>AUTOPAY</Text>
                  </View>
                )}
              </View>
              <Text style={styles.amount}>${Number(acct.amount).toFixed(2)}</Text>
              <Text style={styles.freq}>{freqLabel(acct.frequency)}</Text>
              <Text style={[styles.due, { color: st.color }]}>{st.text}</Text>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" }}>
                <PillButton
                  testID={`mark-paid-${acct.id}`}
                  label={busyId === acct.id ? "…" : acct.autopay ? "LOG NOW" : "MARK PAID"}
                  icon="checkmark-circle"
                  variant="active"
                  onPress={() => markPaid(acct)}
                  disabled={busyId === acct.id}
                  style={{ flex: 1, justifyContent: "center" }}
                />
                <TouchableOpacity style={styles.iconBtn} onPress={() => setEditing(acct)} testID={`edit-pay-${acct.id}`} hitSlop={8}>
                  <Ionicons name="create-outline" size={18} color={theme.colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => remove(acct)} testID={`del-pay-${acct.id}`} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                </TouchableOpacity>
              </View>
            </BevelCard>
          );
        })
      )}

      <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
        <PillButton
          testID="add-payment-account"
          label="ADD PAYMENT ACCOUNT"
          icon="add-circle-outline"
          variant="active"
          onPress={() => setEditing("new")}
          style={{ justifyContent: "center" }}
        />
      </View>

      {editing && (
        <PaymentAccountModal
          dealerId={dealerId}
          account={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); afterMutation(); }}
        />
      )}
    </>
  );
}

function PaymentAccountModal({
  dealerId,
  account,
  onClose,
  onSaved,
}: {
  dealerId: string;
  account: PaymentAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(account?.label || "");
  const [amount, setAmount] = useState(account ? String(account.amount) : "");
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly">(account?.frequency || "monthly");
  const [nextDue, setNextDue] = useState(account?.next_due_date || todayISO());
  const [autopay, setAutopay] = useState(account?.autopay ?? false);
  const [remindBefore, setRemindBefore] = useState(account?.remind_day_before ?? true);
  const [remindDayOf, setRemindDayOf] = useState(account?.remind_day_of ?? true);
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    const name = label.trim();
    if (!name) { Alert.alert("Label required", "Give this account a name (e.g. Truck Loan)."); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) { Alert.alert("Amount invalid", "Enter a valid payment amount."); return; }
    if (!nextDue) { Alert.alert("Due date required", "Pick the next due date."); return; }
    const body: PaymentAccountInput = {
      label: name,
      amount: amt,
      frequency,
      next_due_date: nextDue,
      autopay,
      remind_day_before: remindBefore,
      remind_day_of: remindDayOf,
    };
    setSaving(true);
    try {
      if (account) await api.updatePaymentAccount(account.id, body);
      else await api.createPaymentAccount(dealerId, body);
      onSaved();
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }, [label, amount, frequency, nextDue, autopay, remindBefore, remindDayOf, account, dealerId, onSaved]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalSheet}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{account ? "EDIT PAYMENT ACCOUNT" : "NEW PAYMENT ACCOUNT"}</Text>

            <Text style={styles.fieldLabel}>Label</Text>
            <TextInput
              testID="pay-label"
              style={styles.input}
              placeholder="Truck Loan, Tool Account…"
              placeholderTextColor={theme.colors.textMuted}
              value={label}
              onChangeText={setLabel}
            />

            <Text style={styles.fieldLabel}>Amount ($)</Text>
            <TextInput
              testID="pay-amount"
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />

            <Text style={styles.fieldLabel}>Frequency</Text>
            <View style={styles.chipRow}>
              {FREQUENCIES.map((f) => {
                const active = frequency === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    testID={`freq-${f.id}`}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setFrequency(f.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Next due date</Text>
            <DateField value={nextDue} onChange={setNextDue} testID="pay-due-date" />

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Autopay</Text>
                <Text style={styles.toggleSub}>Auto-advances on the due date — no manual confirm.</Text>
              </View>
              <Switch
                testID="pay-autopay"
                value={autopay}
                onValueChange={setAutopay}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Remind day before</Text>
              <Switch
                testID="pay-remind-before"
                value={remindBefore}
                onValueChange={setRemindBefore}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor="#fff"
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Remind on due day</Text>
              <Switch
                testID="pay-remind-dayof"
                value={remindDayOf}
                onValueChange={setRemindDayOf}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor="#fff"
              />
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
              <TouchableOpacity style={styles.btnGhost} onPress={onClose} disabled={saving}>
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <PillButton
                  testID="pay-save"
                  label={saving ? "SAVING…" : "SAVE"}
                  icon="save-outline"
                  variant="active"
                  onPress={save}
                  disabled={saving}
                  style={{ justifyContent: "center" }}
                />
              </View>
            </View>
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles((c) => ({
  sectionLabel: {
    color: c.textPrimary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: c.bgSecondary,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: theme.radii.md,
    borderLeftWidth: 3,
    borderLeftColor: c.accent,
  },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: c.textPrimary, fontSize: 13, fontWeight: "900", letterSpacing: 0.5, flex: 1, paddingRight: 8 },
  autopayPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  autopayText: { color: c.accent, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  amount: { color: c.textPrimary, fontSize: 20, fontWeight: "900", marginTop: 8 },
  freq: { color: c.textMuted, fontSize: 9, fontWeight: "700", marginTop: 2, letterSpacing: 0.5 },
  due: { fontSize: 11, fontWeight: "800", marginTop: 6 },
  iconBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: theme.radii.sm,
  },
  empty: { color: c.textMuted, fontStyle: "italic", fontSize: 12, textAlign: "center" },
  // Modal
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: c.bgSecondary,
    padding: 20,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderTopWidth: 2,
    borderTopColor: c.accent,
    maxHeight: "90%",
  },
  modalTitle: { color: c.textPrimary, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginBottom: 14 },
  fieldLabel: { color: c.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: c.textPrimary,
    backgroundColor: c.surface,
    fontSize: 15,
  },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radii.sm,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: "center",
  },
  chipActive: { borderColor: c.accent, backgroundColor: c.accent + "22" },
  chipText: { color: c.textSecondary, fontWeight: "800", fontSize: 12 },
  chipTextActive: { color: c.accent },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
    gap: 12,
  },
  toggleLabel: { color: c.textPrimary, fontSize: 13, fontWeight: "700" },
  toggleSub: { color: c.textMuted, fontSize: 10, marginTop: 2 },
  btnGhost: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.sm,
  },
  btnGhostText: { color: c.textPrimary, fontWeight: "800", letterSpacing: 2 },
}));
