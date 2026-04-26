// Centralized date helpers — DD/MM/YYYY everywhere.
// Accepts either ISO timestamp or YYYY-MM-DD or DD/MM/YYYY input strings.

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function parseAny(s?: string | null): Date | null {
  if (!s) return null;
  // YYYY-MM-DD
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  // DD/MM/YYYY
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  // Fallback to native parsing (full ISO with time)
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Format a date string/ISO/Date as DD/MM/YYYY
export function formatDate(input?: string | Date | null): string {
  if (!input) return "—";
  const d = input instanceof Date ? input : parseAny(input);
  if (!d) return typeof input === "string" ? input : "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Format ISO timestamp as DD/MM/YYYY · h:mm AM/PM
export function formatDateTime(iso?: string | Date | null): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : parseAny(iso);
  if (!d) return typeof iso === "string" ? iso : "—";
  let h = d.getHours();
  const m = pad(d.getMinutes());
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}  ·  ${h}:${m} ${ampm}`;
}

// Convert anything to YYYY-MM-DD for backend storage
export function toIsoDate(input?: string | Date | null): string {
  if (!input) return "";
  const d = input instanceof Date ? input : parseAny(input);
  if (!d) return typeof input === "string" ? input : "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Today as YYYY-MM-DD (for backend)
export function todayIso(): string {
  return toIsoDate(new Date());
}
