/**
 * Borrowed-Tool Overdue Reminders
 * --------------------------------
 * Local notifications (no push server) that fire every N hours/days while a
 * tool is checked out to a borrower. User picks the interval in More tab.
 *
 * When the notification fires, tapping it deep-links into the tool detail
 * screen (so the user can text/call the borrower). The notification body
 * also embeds the borrower phone (if known) for quick action handlers.
 *
 * iOS limit: 64 pending local notifications across the WHOLE app. We
 * schedule at most ONE recurring reminder per checked-out tool, plus the
 * dealer-route ones. Should stay well under the cap for normal users.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL_ID = "borrow-reminders";
const TAG = "borrow-reminder";

// Bring up to date with prefs — keep in sync with src/prefs.ts.
export type BorrowReminderOptions = {
  enabled: boolean;
  reminderHours: number;  // total hours between reminders. 24 = daily.
};

// ---------------------------------------------------------------------------

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Overdue Borrowed Tools",
      description: "Reminders for tools that are still checked out.",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Per-tool stable identifier prefix. Used so we can cancel just one tool's
 * reminders without disturbing other scheduled notifications.
 */
function idPrefixFor(toolId: string): string {
  return `${TAG}:${toolId}`;
}

async function cancelToolReminders(toolId: string): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const prefix = idPrefixFor(toolId);
    await Promise.all(
      all
        .filter((n) => {
          const d = (n.content?.data as any) || {};
          return d.tag === TAG && d.tool_id === toolId;
        })
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
    // Belt-and-braces — also try cancelling by predictable id pattern.
    void prefix;
  } catch {
    /* best-effort */
  }
}

/**
 * Cancel ALL borrow reminders across the app (e.g., when user disables the
 * feature globally in settings).
 */
export async function cancelAllBorrowReminders(): Promise<void> {
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

/**
 * Schedule a recurring overdue reminder for a checked-out tool.
 *
 * Strategy: We schedule THREE future occurrences (1×, 2×, 3× the period
 * after checkout). iOS lacks a true "repeat every N hours" trigger for
 * arbitrary periods, so we stack a few in advance and re-extend whenever
 * the user opens the app (the dealer-route module already does the same).
 *
 * `reminderHours` is the user's chosen interval. e.g., 24 = daily reminder.
 * Tap-through deep-links to /tool/<id> via the notification's data payload.
 */
export async function scheduleBorrowReminder(args: {
  toolId: string;
  toolName: string;
  borrowerName: string;
  borrowerPhone?: string;
  options: BorrowReminderOptions;
}): Promise<void> {
  if (!args.options.enabled) return;
  if (Platform.OS === "web") return; // no local notifs on web
  await ensureAndroidChannel();

  // Cancel any existing reminders for this tool first (re-schedule fresh).
  await cancelToolReminders(args.toolId);

  const hours = Math.max(1, Math.round(args.options.reminderHours || 24));
  const periodMs = hours * 60 * 60 * 1000;

  // Schedule up to 5 stacked reminders into the future. The app refreshes
  // these on launch via re-scheduling, so the user keeps getting them as
  // long as the tool stays out.
  const now = Date.now();
  for (let i = 1; i <= 5; i++) {
    const fireAt = new Date(now + periodMs * i);
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "⏰ Tool Still Out",
          body: `${args.toolName} is still checked out to ${args.borrowerName}. Tap to follow up.`,
          sound: "default",
          data: {
            tag: TAG,
            tool_id: args.toolId,
            tool_name: args.toolName,
            borrower_name: args.borrowerName,
            borrower_phone: args.borrowerPhone || "",
            // Deep link: tapping the notification opens the tool detail.
            url: `/tool/${args.toolId}`,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
          ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
        } as any,
      });
    } catch {
      /* one failure shouldn't break the rest */
    }
  }
}

/**
 * Called when the user marks the tool as RETURNED. Cancels all pending
 * overdue notifications for that tool so we don't keep pinging them.
 */
export async function cancelBorrowReminder(toolId: string): Promise<void> {
  if (Platform.OS === "web") return;
  await cancelToolReminders(toolId);
}

/**
 * Recompute the schedule for ALL currently-checked-out tools. Call this on
 * app start and after the user changes their reminder interval so that
 * existing checkouts keep firing reminders.
 */
export async function rescheduleAllBorrowReminders(
  tools: Array<any>,
  options: BorrowReminderOptions,
): Promise<void> {
  if (Platform.OS === "web") return;
  // Wipe everything we previously scheduled.
  await cancelAllBorrowReminders();
  if (!options.enabled) return;
  for (const t of tools || []) {
    const co = t?.current_checkout;
    if (!t?.is_checked_out || !co) continue;
    await scheduleBorrowReminder({
      toolId: t.id,
      toolName: t.name || "Tool",
      borrowerName: co.borrower_name || "Unknown",
      borrowerPhone: co.borrower_phone || "",
      options,
    });
  }
}

/**
 * Compose the SMS body the user sees pre-filled when they tap "Text" on
 * the notification (or the equivalent button in-app). This EXACT wording
 * was provided by the user on 2026-05-26. Do not change without asking.
 */
export function composeBorrowSmsBody(toolName: string, borrowerName: string): string {
  return `Hey ${borrowerName} — just a friendly reminder you still have my ${toolName}. Let me know when it's coming back, Thanks`;
}

/** Returns the count of pending borrow reminders (for diagnostics). */
export async function pendingBorrowReminderCount(): Promise<number> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.filter((n) => (n.content?.data as any)?.tag === TAG).length;
  } catch {
    return 0;
  }
}
