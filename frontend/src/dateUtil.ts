/**
 * Date utilities — store dates as YYYY-MM-DD (ISO) but display as DD/MM/YYYY.
 */
export const todayISO = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

export const todayUS = (): string => formatDateUS(todayISO());

/** "2025-06-10" -> "10/06/2025"; "10/06/2025" passes through. */
export const formatDateUS = (input?: string | null): string => {
  if (!input) return "";
  const s = String(input).trim();
  // YYYY-MM-DD (or YYYY-MM-DDTHH:mm...)
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  // already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  return s;
};

/** "10/06/2025" -> "2025-06-10"; "2025-06-10" passes through. */
export const parseDateUS = (input?: string | null): string => {
  if (!input) return "";
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  return s;
};

/** Format an ISO datetime ("2025-06-10T13:25:00Z") for display: DD/MM/YYYY h:mm AM/PM */
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
  return `${dd}/${mm}/${yyyy} ${h}:${min} ${ampm}`;
};
