/**
 * Dealer Route Notifications
 * --------------------------
 * Schedules **local** notifications (no push server, no fees) on the user's
 * device for upcoming dealer route days. The user picks a single time of day
 * (e.g. 7:00 AM) and optionally also gets a "day-before" reminder.
 *
 * Why local-only:
 *   - No server cost / no push infrastructure
 *   - Works offline
 *   - No privacy concerns (the user's dealer schedule never leaves the device)
 *
 * iOS limit: 64 pending local notifications. We schedule 60 days ahead, so
 * even with several dealers this stays comfortably under the cap.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { nextRouteDate } from "./route";

// ---- Foreground behaviour: show banner+sound even when the app is open. ----
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const CHANNEL_ID = "dealer-routes";
const SCHEDULED_TAG = "dealer-route";        // identifierPrefix used so we know which notifs are ours
const HORIZON_DAYS = 60;                     // how far ahead we schedule

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

export async function getPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") return "granted";
    if (status === "denied") return "denied";
    return "undetermined";
  } catch {
    return "undetermined";
  }
}

/**
 * Asks the OS for permission. iOS shows the system prompt the first time.
 * On Android 13+ also requests POST_NOTIFICATIONS. Returns true if granted.
 */
export async function requestPermissions(): Promise<boolean> {
  try {
    if (Platform.OS === "android") {
      // Set up the channel BEFORE requesting permission so the channel
      // exists when the user grants access.
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Dealer Route Reminders",
        description: "Reminds you when a tool dealer is scheduled to visit",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") return true;
    if (!current.canAskAgain) return false;
    const next = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    return next.status === "granted";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

type DealerRecord = {
  id: string;
  name: string;
  route_frequency?: string;
  route_day_of_week?: string;
  route_anchor_date?: string;
};

type ScheduleOptions = {
  enabled: boolean;
  hour: number;          // 0-23
  minute: number;        // 0-59
  notifyDayBefore: boolean;
};

/**
 * Cancels all of OUR previously-scheduled dealer notifications. We tag each
 * one with `data.tag === SCHEDULED_TAG` so we don't touch any other
 * notifications the app might use in the future.
 */
async function cancelOurNotifications(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => (n.content?.data as any)?.tag === SCHEDULED_TAG)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    /* best effort */
  }
}

/** Returns YYYY-MM-DD for grouping dealers that share the same visit date. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Pretty join: "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Recompute the whole schedule from scratch:
 *   1. Cancel all of our existing pending notifications
 *   2. If notifications are off, stop here
 *   3. For each upcoming day in the next 60 days, find every dealer whose
 *      next visit lands on that day and schedule one combined notification
 *   4. (Optional) Also schedule a day-before reminder for each
 *
 * Idempotent — call this from `useFocusEffect` on the dealer list, after any
 * dealer create/edit/delete, and after the user changes notification prefs.
 */
export async function rescheduleDealerNotifications(
  dealers: DealerRecord[],
  options: ScheduleOptions,
): Promise<void> {
  await cancelOurNotifications();
  if (!options.enabled) return;

  // Build a date->[dealers] map for the next HORIZON_DAYS.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + HORIZON_DAYS);

  const byDay = new Map<string, string[]>();
  for (const d of dealers) {
    if (!d?.name) continue;
    let cursor = nextRouteDate(d);
    if (!cursor) continue;
    // Walk forward through repeats to capture every visit inside the horizon.
    let safety = 0;
    while (cursor && cursor <= horizon && safety++ < HORIZON_DAYS) {
      const key = ymd(cursor);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(d.name);
      // Advance: weekly = +7d, bi-weekly = +14d, monthly = +1mo
      const freq = (d.route_frequency || "").toLowerCase();
      const next = new Date(cursor);
      if (freq === "weekly") next.setDate(next.getDate() + 7);
      else if (freq === "bi-weekly" || freq === "biweekly") next.setDate(next.getDate() + 14);
      else if (freq === "monthly") next.setMonth(next.getMonth() + 1);
      else break; // unknown frequency → only schedule the first one
      cursor = next;
    }
  }

  // Schedule.
  const now = Date.now();
  for (const [day, names] of byDay.entries()) {
    const [y, m, dd] = day.split("-").map(Number);

    // Same-day reminder at user's chosen time
    const sameDay = new Date(y, m - 1, dd, options.hour, options.minute, 0, 0);
    if (sameDay.getTime() > now) {
      const body =
        names.length === 1
          ? `${names[0]} is on your route today.`
          : `Dealer day — ${joinNames(names)} are scheduled today.`;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🔧 Dealer Day",
          body,
          sound: "default",
          data: { tag: SCHEDULED_TAG, kind: "same-day", date: day },
        },
        trigger:
          Platform.OS === "android"
            ? ({ date: sameDay, channelId: CHANNEL_ID } as any)
            : ({ date: sameDay } as any),
      });
    }

    // Day-before reminder (same time, the day before)
    if (options.notifyDayBefore) {
      const dayBefore = new Date(sameDay);
      dayBefore.setDate(dayBefore.getDate() - 1);
      if (dayBefore.getTime() > now) {
        const body =
          names.length === 1
            ? `${names[0]} is scheduled to visit tomorrow.`
            : `Heads up — ${joinNames(names)} are scheduled tomorrow.`;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "🔧 Dealer Tomorrow",
            body,
            sound: "default",
            data: { tag: SCHEDULED_TAG, kind: "day-before", date: day },
          },
          trigger:
            Platform.OS === "android"
              ? ({ date: dayBefore, channelId: CHANNEL_ID } as any)
              : ({ date: dayBefore } as any),
        });
      }
    }
  }
}

/** Cancels everything we scheduled — used when the user turns the toggle off. */
export async function cancelDealerNotifications(): Promise<void> {
  await cancelOurNotifications();
}

/** For a debug/diagnostic UI — returns count of currently-scheduled dealer notifs. */
export async function pendingDealerNotificationCount(): Promise<number> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.filter((n) => (n.content?.data as any)?.tag === SCHEDULED_TAG).length;
  } catch {
    return 0;
  }
}
