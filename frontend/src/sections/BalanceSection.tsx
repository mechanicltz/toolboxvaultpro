import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../theme";
import { PillButton } from "../components/PillButton";
import { api, AccountSchedule } from "../api";
import { confirm } from "../confirm";
import { PaymentModal } from "./PaymentModal";
import { DateField } from "../DateField";
import { todayISO, formatDateUS } from "../dateUtil";
import { reschedulePaymentRemindersNow } from "../notifications";
import { themedStyles, useSkin } from "../themeContext";
import { ShadowBox, ShadowBoxSubCard } from "../components/ShadowBox";
import { SKIN, CAP } from "../tbv/skins";
import { TbvFrame } from "../tbv/components/TbvFrame";

const FREQUENCIES: { id: "weekly" | "biweekly" | "monthly"; label: string }[] = [
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Biweekly" },
  { id: "monthly", label: "Monthly" },
];

const freqLabel = (f?: string) =>
  f === "weekly" ? "Weekly" : f === "biweekly" ? "Every 2 weeks" : "Monthly";

function dueStatus(iso?: string): { text: string; color: string; due: boolean } {
  if (!iso) return { text: "No due date set", color: theme.colors.textMuted, due: false };
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = iso.split("-").map(Number);
    const due = new Date(y, m - 1, d);
    const days = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (days < 0) return { text: `Overdue by ${Math.abs(days)}d`, color: theme.colors.danger, due: true };
    if (days === 0) return { text: "Due today", color: theme.colors.danger, due: true };
    if (days === 1) return { text: "Due tomorrow", color: theme.colors.warning || "#E0A100", due: false };
    if (days <= 7) return { text: `Due in ${days} days`, color: theme.colors.warning || "#E0A100", due: false };
    return { text: `Due ${formatDateUS(iso)}`, color: theme.colors.textMuted, due: false };
  } catch {
    return { text: iso, color: theme.colors.textMuted, due: false };
  }
}

export function BalanceSection({
  dealer,
  onChange,
}: {
  dealer: any;
  onChange: () => void;
}) {
  const router = useRouter();
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const [target, setTarget] = useState<{ account: "credit" | "personal"; type: "payment" | "charge" } | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<"credit" | "personal" | null>(null);
  const [busy, setBusy] = useState(false);

  const openDealerReport = () => {
    router.push({
      pathname: "/(tabs)/reports",
      params: { preset: "account", dealer_id: dealer?.id || "", step: "format" },
    } as any);
  };

  const credit = Number(dealer?.credit_balance || 0);
  const personal = Number(dealer?.personal_balance || 0);
  const creditSched: AccountSchedule | null = dealer?.credit_schedule || null;
  const personalSched: AccountSchedule | null = dealer?.personal_schedule || null;

  const markPaid = async (account: "credit" | "personal", sched: AccountSchedule) => {
    const label = account === "credit" ? "Credit" : "Truck";
    const ok = await confirm(
      "Confirm payment?",
      `Record a ${label} account payment of $${Number(sched.amount).toFixed(2)} as made today and advance to the next due date.`,
      "Mark Paid",
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.confirmAccountPayment(dealer.id, account);
      onChange();
      reschedulePaymentRemindersNow().catch(() => {});
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Text style={styles.disclaimer}>
        For reference only — these balances are estimates and do not factor in
        interest rates or fees.
      </Text>

      {isIndustrial ? (
        <View style={styles.accountsBoxFlat}>
          <BalanceCard
            isIndustrial
            label="CREDIT ACCOUNT"
            balance={credit}
            schedule={creditSched}
            busy={busy}
            onPay={() => setTarget({ account: "credit", type: "payment" })}
            onCharge={() => setTarget({ account: "credit", type: "charge" })}
            onHistory={openDealerReport}
            onEditSchedule={() => setScheduleTarget("credit")}
            onMarkPaid={() => creditSched && markPaid("credit", creditSched)}
          />
          <BalanceCard
            isIndustrial
            label="TRUCK ACCOUNT"
            balance={personal}
            schedule={personalSched}
            busy={busy}
            onPay={() => setTarget({ account: "personal", type: "payment" })}
            onCharge={() => setTarget({ account: "personal", type: "charge" })}
            onHistory={openDealerReport}
            onEditSchedule={() => setScheduleTarget("personal")}
            onMarkPaid={() => personalSched && markPaid("personal", personalSched)}
          />
        </View>
      ) : (
        <ShadowBox style={styles.accountsBox}>
          <BalanceCard
            label="CREDIT ACCOUNT"
            balance={credit}
            schedule={creditSched}
            busy={busy}
            onPay={() => setTarget({ account: "credit", type: "payment" })}
            onCharge={() => setTarget({ account: "credit", type: "charge" })}
            onHistory={openDealerReport}
            onEditSchedule={() => setScheduleTarget("credit")}
            onMarkPaid={() => creditSched && markPaid("credit", creditSched)}
          />
          <BalanceCard
            label="TRUCK ACCOUNT"
            balance={personal}
            schedule={personalSched}
            busy={busy}
            onPay={() => setTarget({ account: "personal", type: "payment" })}
            onCharge={() => setTarget({ account: "personal", type: "charge" })}
            onHistory={openDealerReport}
            onEditSchedule={() => setScheduleTarget("personal")}
            onMarkPaid={() => personalSched && markPaid("personal", personalSched)}
          />
        </ShadowBox>
      )}
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

      {scheduleTarget && (
        <ScheduleModal
          dealerId={dealer.id}
          account={scheduleTarget}
          existing={scheduleTarget === "credit" ? creditSched : personalSched}
          onClose={() => setScheduleTarget(null)}
          onSaved={() => {
            setScheduleTarget(null);
            onChange();
            reschedulePaymentRemindersNow().catch(() => {});
          }}
        />
      )}
    </>
  );
}

function BalanceCard({
  label,
  balance,
  schedule,
  busy,
  onPay,
  onCharge,
  onHistory,
  onEditSchedule,
  onMarkPaid,
  isIndustrial,
}: {
  label: string;
  balance: number;
  schedule: AccountSchedule | null;
  busy: boolean;
  onPay: () => void;
  onCharge: () => void;
  onHistory: () => void;
  onEditSchedule: () => void;
  onMarkPaid: () => void;
  isIndustrial?: boolean;
}) {
  const owed = balance > 0;
  const hasSched = !!schedule?.enabled;
  const st = hasSched ? dueStatus(schedule?.next_due_date) : null;
  const idBase = label.replace(/\s/g, "-");
  const inner = (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={styles.balLabel}>{label}</Text>
        <TouchableOpacity onPress={onHistory} testID={`open-report-${idBase}`}>
          <Text style={styles.histLink}>OPEN REPORT ›</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.balAmount, { color: owed ? theme.colors.danger : theme.colors.success }]}>
        ${balance.toFixed(2)}
      </Text>
      <Text style={styles.balSub}>{owed ? "Outstanding balance" : "Paid up"}</Text>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <PillButton
          testID={`adjust-${idBase}`}
          label="Adjust"
          icon="swap-vertical"
          variant="active"
          onPress={onPay}
          style={{ flex: 1, justifyContent: "center" }}
        />
        <PillButton
          testID={`schedule-${idBase}`}
          label="Schedule"
          icon="alarm-outline"
          variant="default"
          onPress={onEditSchedule}
          style={{ flex: 1, justifyContent: "center" }}
        />
      </View>

      {/* ---- Recurring payment schedule summary (only when one exists) ---- */}
      {hasSched && (
        <View style={styles.schedWrap}>
          <View style={styles.schedHeaderRow}>
            <View style={styles.schedBadge}>
              <Ionicons name="repeat" size={11} color={theme.colors.accent} />
              <Text style={styles.schedBadgeText}>AUTO SCHEDULE</Text>
            </View>
          </View>
          <Text style={styles.schedAmount}>
            ${Number(schedule?.amount || 0).toFixed(2)}{" "}
            <Text style={styles.schedFreq}>· {freqLabel(schedule?.frequency)}</Text>
          </Text>
          <Text style={[styles.schedDue, { color: st?.color }]}>{st?.text}</Text>
          <PillButton
            testID={`mark-paid-${idBase}`}
            label={busy ? "…" : "MARK PAYMENT PAID"}
            icon="checkmark-circle"
            variant={st?.due ? "active" : "default"}
            onPress={onMarkPaid}
            disabled={busy}
            style={{ justifyContent: "center", marginTop: 10 }}
          />
        </View>
      )}
    </>
  );

  if (isIndustrial) {
    return (
      <TbvFrame
        source={SKIN.window}
        capInsets={CAP.window}
        style={styles.balCardSkinFrame}
        padX={30}
        padTop={18}
        padBottom={18}
        testID={`account-card-${idBase}`}
      >
        {inner}
      </TbvFrame>
    );
  }

  return (
    <ShadowBoxSubCard style={styles.balCard} testID={`account-card-${idBase}`}>
      {inner}
    </ShadowBoxSubCard>
  );
}

function ScheduleModal({
  dealerId,
  account,
  existing,
  onClose,
  onSaved,
}: {
  dealerId: string;
  account: "credit" | "personal";
  existing: AccountSchedule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const acctLabel = account === "credit" ? "Credit" : "Truck";
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly">(existing?.frequency || "monthly");
  const [nextDue, setNextDue] = useState(existing?.next_due_date || todayISO());
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Amount invalid", "Enter the recurring payment amount.");
      return;
    }
    if (!nextDue) {
      Alert.alert("Due date required", "Pick the next due date.");
      return;
    }
    const body: AccountSchedule = {
      enabled: true,
      amount: amt,
      frequency,
      next_due_date: nextDue,
      // Reminder timing is controlled globally under NOTIFICATIONS in the Vault.
      // Keep both flags on so this account is always considered for reminders.
      remind_day_before: true,
      remind_day_of: true,
    };
    setSaving(true);
    try {
      await api.setAccountSchedule(dealerId, account, body);
      onSaved();
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const removeSchedule = async () => {
    const ok = await confirm(
      "Remove schedule?",
      `Stop recurring payment reminders for the ${acctLabel} account. Past payment history stays.`,
      "Remove",
      true,
    );
    if (!ok) return;
    setSaving(true);
    try {
      await api.clearAccountSchedule(dealerId, account);
      onSaved();
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalSheet}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{acctLabel.toUpperCase()} PAYMENT SCHEDULE</Text>
            <Text style={styles.modalHint}>
              We&apos;ll remind you on the due date and ask if it was processed. Confirming records a payment on this account.
            </Text>

            <Text style={styles.fieldLabel}>Payment amount ($)</Text>
            <TextInput
              testID="sched-amount"
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
                    testID={`sched-freq-${f.id}`}
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
            <DateField value={nextDue} onChange={setNextDue} testID="sched-due-date" />

            <View style={styles.notifNote}>
              <Ionicons name="notifications-outline" size={16} color={theme.colors.accent} />
              <Text style={styles.notifNoteText}>
                Turn on notifications for upcoming payments in the Vault →
                Notifications to get day-before and due-day reminders.
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
              <TouchableOpacity style={styles.btnGhost} onPress={onClose} disabled={saving}>
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <PillButton
                  testID="sched-save"
                  label={saving ? "SAVING…" : "SAVE"}
                  icon="save-outline"
                  variant="active"
                  onPress={save}
                  disabled={saving}
                  style={{ justifyContent: "center" }}
                />
              </View>
            </View>

            {existing?.enabled && (
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={removeSchedule}
                disabled={saving}
                testID="sched-remove"
              >
                <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                <Text style={styles.removeText}>REMOVE SCHEDULE</Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 16 }} />
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
  disclaimer: {
    color: c.textMuted,
    fontSize: 10,
    fontStyle: "italic",
    lineHeight: 14,
    marginTop: -4,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  accountsBox: {
    backgroundColor: c.surface,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  // Industrial: no grey wrapper box behind the cards — each account card is its
  // own metal TbvFrame, so the container is just a transparent spacer.
  accountsBoxFlat: {
    marginTop: 4,
    marginBottom: 4,
  },
  balCardSkinFrame: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  balCard: {
    backgroundColor: c.bgSecondary,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 0,
    marginBottom: 12,
    borderRadius: theme.radii.md,
  },
  balLabel: { color: c.textPrimary, fontSize: 8, fontWeight: "900", letterSpacing: 2 },
  histLink: { color: c.accent, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  balAmount: { fontSize: 21, fontWeight: "900", marginTop: 8 },
  balSub: { color: c.textMuted, fontSize: 8, marginTop: 2 },
  // schedule strip
  schedWrap: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
  },
  schedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  schedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  schedBadgeText: { color: c.accent, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  schedAmount: { color: c.textPrimary, fontSize: 16, fontWeight: "900", marginTop: 8 },
  schedFreq: { color: c.textMuted, fontSize: 10, fontWeight: "700" },
  schedDue: { fontSize: 11, fontWeight: "800", marginTop: 4 },
  setSchedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: 2,
  },
  setSchedText: { color: c.accent, fontWeight: "800", fontSize: 11, letterSpacing: 0.5 },
  // modal
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
  modalTitle: { color: c.textPrimary, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginBottom: 6 },
  modalHint: { color: c.textMuted, fontSize: 10, marginBottom: 8, lineHeight: 14 },
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
  notifNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  notifNoteText: {
    flex: 1,
    color: c.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
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
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
  },
  removeText: { color: c.danger, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
}));
