/**
 * Insurance-Claim Task Deadline Reminders
 * ---------------------------------------
 * Local notifications (no push server) that fire on a claim task's due date
 * (and optionally the day before) at the user's chosen time. A task is
 * eligible when it has a due_date, its per-task `notify` flag is on, and it
 * isn't already done. Tapping the notification deep-links into the claim.
 *
 * Mirrors the dealer-route / payment reminder pattern in notifications.ts:
 * tag-based cancel-then-reschedule, idempotent, local-only.
 *
 * NOTE: local notifications do NOT fire in Expo Go / web preview — a real
 * device build is required to actually see them.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { loadPrefs } from "./prefs";
import { insuranceApi } from "./insuranceApi";

const CHANNEL_ID = "claim-tasks";
const TAG = "claim-task";
const HORIZON_DAYS = 120; // schedule reminders for tasks due within this window

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Claim Task Deadlines",
      description: "Reminders for insurance-claim tasks that have a due date.",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch {
    /* best-effort */
  }
}

async function cancelTagged(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => (n.content?.data as any)?.tag === TAG)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    /* best-effort */
  }
}

/** Parse a stored due_date ("YYYY-MM-DD" or ISO) into [y, m, d] (1-based month). */
function parseYmd(s: string): [number, number, number] | null {
  if (!s) return null;
  const head = String(s).slice(0, 10);
  const [y, m, d] = head.split("-").map(Number);
  if (!y || !m || !d) return null;
  return [y, m, d];
}

/** Cancels everything we scheduled — used when the toggle is turned off. */
export async function cancelClaimTaskReminders(): Promise<void> {
  await cancelTagged();
}

/**
 * Recompute claim-task reminders from scratch. Cancels our existing ones, and
 * (if the master gate + this type are on) schedules a day-of (and optional
 * day-before) reminder for every eligible task across all active claims.
 *
 * Safe to call after any task add/edit/toggle/delete and on app resume.
 */
export async function rescheduleClaimTaskRemindersNow(): Promise<void> {
  if (Platform.OS === "web") return;
  await cancelTagged();

  let prefs;
  try {
    prefs = await loadPrefs();
  } catch {
    return;
  }
  if (!prefs.notifications_master_enabled) return;
  if (!prefs.claim_task_notifications_enabled) return;

  await ensureAndroidChannel();

  const hour = prefs.claim_task_notification_hour ?? 9;
  const minute = prefs.claim_task_notification_minute ?? 0;
  const remindDayBefore = prefs.claim_task_notify_day_before ?? true;

  let claims: any[] = [];
  try {
    claims = await insuranceApi.list({ archived: false });
  } catch {
    return;
  }

  const now = Date.now();
  const horizon = now + HORIZON_DAYS * 24 * 60 * 60 * 1000;

  for (const claim of claims || []) {
    for (const t of claim.tasks || []) {
      if (t.done || !t.notify || !t.due_date) continue;
      const parts = parseYmd(t.due_date);
      if (!parts) continue;
      const [y, m, d] = parts;

      const title = claim.title || "Claim";
      const taskText = String(t.text || "Task");

      // Day-of reminder at the chosen time.
      const dayOf = new Date(y, m - 1, d, hour, minute, 0, 0);
      if (dayOf.getTime() > now && dayOf.getTime() < horizon) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "📋 Claim task due today",
              body: `${taskText} — for "${title}".`,
              sound: "default",
              data: { tag: TAG, kind: "day-of", claim_id: claim.id, task_id: t.id, url: `/insurance-claims/${claim.id}` },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: dayOf,
              ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
            } as any,
          });
        } catch { /* skip one failure */ }
      }

      // Day-before reminder.
      if (remindDayBefore) {
        const dayBefore = new Date(y, m - 1, d, hour, minute, 0, 0);
        dayBefore.setDate(dayBefore.getDate() - 1);
        if (dayBefore.getTime() > now && dayBefore.getTime() < horizon) {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: "📋 Claim task due tomorrow",
                body: `${taskText} — for "${title}".`,
                sound: "default",
                data: { tag: TAG, kind: "day-before", claim_id: claim.id, task_id: t.id, url: `/insurance-claims/${claim.id}` },
              },
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: dayBefore,
                ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
              } as any,
            });
          } catch { /* skip one failure */ }
        }
      }
    }
  }
}

/** Diagnostic — count of pending claim-task reminders. */
export async function pendingClaimTaskReminderCount(): Promise<number> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.filter((n) => (n.content?.data as any)?.tag === TAG).length;
  } catch {
    return 0;
  }
}
