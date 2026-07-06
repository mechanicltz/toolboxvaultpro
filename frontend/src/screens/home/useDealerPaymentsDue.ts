/**
 * useDealerPaymentsDue
 * --------------------
 * Derives scheduled-payment UI state for the Home screen straight from the
 * dealers we already fetched (each dealer carries `personal_schedule` /
 * `credit_schedule`), so there is no extra network call.
 *
 * Returns `paymentSubByDealer` — a map of dealerId -> short sub-line like
 * "Truck • $250.00 due tomorrow" for any account due within 7 days.
 *
 * It also drives the in-app "was it processed?" confirmation: when an account
 * payment is due today or overdue it pops a Yes/No Alert (mirrors the local
 * notification). Confirming records the payment via the API and reloads. Each
 * due item is prompted at most once per session (keyed by dealer:account:date).
 */
import { useEffect, useRef } from "react";
import { formatMoney } from "../../currency";
import { Alert } from "react-native";
import { api } from "../../api";
import { formatDateUS } from "../../dateUtil";

type DealerLike = {
  id: string;
  name: string;
  personal_schedule?: any;
  credit_schedule?: any;
};

const daysUntil = (iso?: string): number | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(y, m - 1, d);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
};

const dueLabel = (days: number) =>
  days < 0
    ? `overdue ${Math.abs(days)}d`
    : days === 0
      ? "due today"
      : days === 1
        ? "due tomorrow"
        : `due in ${days}d`;

export function useDealerPaymentsDue(
  dealers: DealerLike[],
  reload: () => void,
): { paymentSubByDealer: Record<string, string> } {
  const paymentSubByDealer: Record<string, string> = {};
  const duePaymentsNow: {
    dealerId: string;
    dealerName: string;
    account: "credit" | "personal";
    accountLabel: string;
    amount: number;
    nextDue: string;
  }[] = [];

  for (const d of dealers) {
    const entries: { account: "credit" | "personal"; label: string; sched: any }[] = [
      { account: "personal", label: "Truck", sched: d.personal_schedule },
      { account: "credit", label: "Credit", sched: d.credit_schedule },
    ];
    let soonest: { days: number; label: string; amount: number } | null = null;
    for (const e of entries) {
      if (!e.sched?.enabled || !e.sched?.next_due_date) continue;
      const days = daysUntil(e.sched.next_due_date);
      if (days == null) continue;
      if (days <= 0) {
        duePaymentsNow.push({
          dealerId: d.id,
          dealerName: d.name,
          account: e.account,
          accountLabel: e.label,
          amount: Number(e.sched.amount) || 0,
          nextDue: e.sched.next_due_date,
        });
      }
      if (days <= 7 && (!soonest || days < soonest.days)) {
        soonest = { days, label: e.label, amount: Number(e.sched.amount) || 0 };
      }
    }
    if (soonest) {
      // Account label intentionally omitted (no "Truck"/"Credit" prefix) so the
      // dealer sub-line stays clean: just the amount + when it's due.
      paymentSubByDealer[d.id] = `${formatMoney(soonest.amount)} ${dueLabel(soonest.days)}`;
    }
  }

  const promptedRef = useRef<Set<string>>(new Set());
  const promptingRef = useRef(false);
  const dueKey = duePaymentsNow
    .map((p) => `${p.dealerId}:${p.account}:${p.nextDue}`)
    .join("|");

  useEffect(() => {
    if (promptingRef.current) return;
    const pending = duePaymentsNow.filter(
      (p) => !promptedRef.current.has(`${p.dealerId}:${p.account}:${p.nextDue}`),
    );
    if (pending.length === 0) return;
    promptingRef.current = true;

    const runNext = (idx: number) => {
      if (idx >= pending.length) {
        promptingRef.current = false;
        return;
      }
      const p = pending[idx];
      promptedRef.current.add(`${p.dealerId}:${p.account}:${p.nextDue}`);
      Alert.alert(
        "Payment due",
        `You have a ${p.dealerName} ${p.accountLabel} payment of ${formatMoney(p.amount)} due ${formatDateUS(p.nextDue)}. Was it processed?`,
        [
          {
            text: "No",
            style: "cancel",
            onPress: async () => {
              // #27 — "No" means this scheduled payment was SKIPPED. Advance the
              // schedule to the next due date (persisted) so we never re-ask
              // about this date and simply move on to the next payment.
              try {
                await api.skipAccountPayment(p.dealerId, p.account);
                reload();
              } catch {
                /* user can retry from the dealer screen */
              }
              runNext(idx + 1);
            },
          },
          {
            text: "Yes",
            onPress: async () => {
              try {
                await api.confirmAccountPayment(p.dealerId, p.account);
                reload();
              } catch {
                /* user can retry from the dealer screen */
              }
              runNext(idx + 1);
            },
          },
        ],
        { cancelable: false },
      );
    };
    runNext(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueKey]);

  return { paymentSubByDealer };
}
