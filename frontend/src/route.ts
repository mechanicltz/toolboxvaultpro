/**
 * Dealer route helpers — compute next route visit based on frequency + day of week.
 */
import { formatDateUS } from "./dateUtil";

export const ROUTE_FREQUENCIES = ["Weekly", "Bi-weekly", "Monthly", "N/A"] as const;
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const dayIndex = (d?: string): number => {
  if (!d) return -1;
  const i = DAY_NAMES.indexOf(d);
  if (i >= 0) return i;
  const j = DAY_NAMES_SHORT.indexOf(d);
  return j;
};

/** Next Date when this dealer will visit, or null if no schedule. */
export function nextRouteDate(dealer: any): Date | null {
  if (!dealer) return null;
  const freq = (dealer.route_frequency || "").toLowerCase();
  if (!freq || freq === "n/a") return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (freq === "weekly") {
    const di = dayIndex(dealer.route_day_of_week);
    if (di < 0) return null;
    const todayDi = today.getDay();
    let delta = (di - todayDi + 7) % 7;
    if (delta === 0) delta = 0; // today
    const d = new Date(today);
    d.setDate(today.getDate() + delta);
    return d;
  }
  if (freq === "bi-weekly" || freq === "biweekly") {
    const di = dayIndex(dealer.route_day_of_week);
    if (di < 0) return null;
    const todayDi = today.getDay();
    let delta = (di - todayDi + 7) % 7;
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + delta);
    // Use anchor_date if provided to determine even/odd week alignment
    const anchorStr = dealer.route_anchor_date;
    if (anchorStr) {
      const a = new Date(anchorStr);
      a.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((candidate.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays % 14 !== 0) {
        candidate.setDate(candidate.getDate() + 7);
      }
    }
    return candidate;
  }
  if (freq === "monthly") {
    const anchorStr = dealer.route_anchor_date;
    let anchorDay = 1;
    if (anchorStr) {
      const a = new Date(anchorStr);
      if (!isNaN(a.getTime())) anchorDay = a.getDate();
    }
    const candidate = new Date(today.getFullYear(), today.getMonth(), anchorDay);
    if (candidate < today) {
      candidate.setMonth(candidate.getMonth() + 1);
    }
    return candidate;
  }
  return null;
}

/** Short label like "Wed weekly" or "1st of month" or "—". */
export function routeLabel(dealer: any): string {
  if (!dealer) return "NO ROUTE";
  const freq = dealer.route_frequency;
  if (!freq || freq === "N/A") return "NO ROUTE";
  if (freq === "Weekly" && dealer.route_day_of_week) {
    return `WEEKLY ${dealer.route_day_of_week.toUpperCase().slice(0, 3)}`;
  }
  if (freq === "Bi-weekly" && dealer.route_day_of_week) {
    return `BI-WEEKLY ${dealer.route_day_of_week.toUpperCase().slice(0, 3)}`;
  }
  if (freq === "Monthly") {
    const day = dealer.route_anchor_date ? new Date(dealer.route_anchor_date).getDate() : null;
    return day ? `MONTHLY • DAY ${day}` : "MONTHLY";
  }
  return freq.toUpperCase();
}

/** Display text for dealer's next route, e.g. "Wednesday 06/26/2025" */
export function nextRouteText(dealer: any): string {
  const d = nextRouteDate(dealer);
  if (!d) return "";
  return `${DAY_NAMES[d.getDay()]} ${formatDateUS(d.toISOString().slice(0, 10))}`;
}
