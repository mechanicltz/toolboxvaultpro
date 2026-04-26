/**
 * Date utilities — store dates as YYYY-MM-DD (ISO) but display as MM/DD/YYYY.
 */
export const todayISO = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

export const todayUS = (): string => formatDateUS(todayISO());

/** "2025-06-10" -> "06/10/2025"; "06/10/2025" passes through. */
export const formatDateUS = (input?: string | null): string => {
  if (!input) return "";
  const s = String(input).trim();
  // YYYY-MM-DD (or YYYY-MM-DDTHH:mm...)
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[2]}/${ymd[3]}/${ymd[1]}`;
  // already MM/DD/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  return s;
};

/** "06/10/2025" -> "2025-06-10"; "2025-06-10" passes through. */
export const parseDateUS = (input?: string | null): string => {
  if (!input) return "";
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  return s;
};

/** Format an ISO datetime ("2025-06-10T13:25:00Z") for display: MM/DD/YYYY h:mm AM/PM */
export const formatDateTimeUS = (input?: string | null): string => {
  if (!input) return "";
  const d = new Date(input);
  if (isNaN(d.getTime())) return formatDateUS(input);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${mm}/${dd}/${yyyy} ${h}:${min} ${ampm}`;
};
