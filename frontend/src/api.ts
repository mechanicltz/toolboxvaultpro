import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiCacheKey, getCached, hasCached, setCached, getCachedAt, clearCachedByPrefix } from "./cache";
import { isOnline, OfflineError } from "./network";
import { showOfflineAlert } from "./offlineGuard";

// Backend URL is read from EXPO_PUBLIC_BACKEND_URL.
// - In Expo Go dev: read from /app/frontend/.env (set to production URL).
// - In EAS builds (TestFlight, App Store): read from eas.json build profiles.
// All three EAS profiles AND the dev .env point to the same production
// backend (asset-locator-12.emergent.host), so every client hits one
// single backend — no preview-vs-prod split-brain.
const _ENV_BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const BASE =
  _ENV_BASE && _ENV_BASE !== "undefined" && _ENV_BASE.startsWith("http")
    ? _ENV_BASE
    : "";

if (!BASE) {
  // Fail loud at boot if env var is missing — better than silent 404s.
  // eslint-disable-next-line no-console
  console.warn(
    "[api] EXPO_PUBLIC_BACKEND_URL is missing or invalid. API calls will fail.",
  );
}

/**
 * Exported so other modules (e.g. reportRunner.ts) hit the SAME backend
 * `api.ts` does — without this, reportRunner was reading the raw
 * EXPO_PUBLIC_BACKEND_URL and could end up at a different host.
 */
export const API_BASE = BASE;
const TOKEN_KEY = "tt.auth.token";

// ---------------------------------------------------------------------------
// In-flight request tracking + 20s hard timeout per fetch.
//
// PROBLEM (TestFlight 1.3.1): on iOS, when the app is sent to the background
// mid-fetch, the underlying socket gets suspended. When the user brings the
// app back to the foreground, the fetch() promise NEVER resolves and NEVER
// rejects — it hangs forever. Result: the Inventory / Dealers screen shows a
// permanent loading state until the user force-kills the app.
//
// FIX: every fetch is wrapped in an AbortController with a 20-second timeout.
// All live controllers are tracked in `_inFlight` so that the AppState
// listener in app/_layout.tsx can call `abortAllInFlight()` the moment the
// app comes back to active, instantly killing any zombie requests and
// letting screens retry against a healthy socket.
// ---------------------------------------------------------------------------
// Default timeout — applied to every fetch unless the caller bumps it.
// 20s was too short for photo/invoice/document uploads (1-5 MB of base64
// content over cellular routinely takes 30+ seconds), causing the app to
// fire "You're offline" alerts on requests that were actually succeeding.
// 60s is a reasonable mobile-network ceiling for typical API traffic.
// Upload-heavy requests can pass `{ timeoutMs: ... }` via the options to
// extend further (see UPLOAD_TIMEOUT_MS for the default we use).
const REQUEST_TIMEOUT_MS = 60_000;
// Bigger window for upload-heavy mutations (POST/PUT with photo payloads).
// On cellular, a 5 MB invoice can take 60-90s to upload. 120s gives
// generous headroom without letting truly-broken requests hang forever.
const UPLOAD_TIMEOUT_MS = 120_000;
const _inFlight = new Set<AbortController>();
// PERF (2026-06): in-flight GET dedupe — see request() below.
const _inFlightGetByKey = new Map<string, Promise<any>>();

/**
 * Abort every pending fetch right now. Safe to call multiple times.
 * Called by the AppState listener when the app comes back from background
 * so that any iOS-suspended requests fail fast instead of hanging forever.
 */
export function abortAllInFlight(reason: string = "app-resumed"): void {
  if (_inFlight.size === 0) return;
  // Snapshot first; aborting a controller triggers its handler which removes
  // itself from the set, so iterating the live set would skip entries.
  const snap = Array.from(_inFlight);
  _inFlight.clear();
  for (const ctrl of snap) {
    try {
      // Pass a reason for easier log filtering.
      // Note: older RN runtimes ignore the reason arg, which is fine.
      ctrl.abort(reason as any);
    } catch {
      /* best effort */
    }
  }
}

let memToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (memToken) return memToken;
  try {
    const t = await AsyncStorage.getItem(TOKEN_KEY);
    if (t) memToken = t;
    return t;
  } catch {
    return null;
  }
}

/**
 * Eagerly populate `memToken` from disk before any screen renders.
 * Called once at app boot from `AuthProvider`. Without this, the very
 * first navigation to a screen with `useFocusEffect(load)` could fire
 * its API call BEFORE AsyncStorage has been read, sending an
 * unauthenticated request → 401 → silent empty state.
 */
export async function bootstrapToken(): Promise<void> {
  if (memToken) return;
  try {
    const t = await AsyncStorage.getItem(TOKEN_KEY);
    if (t) memToken = t;
  } catch {
    /* best effort */
  }
}

export async function setToken(t: string | null) {
  memToken = t;
  try {
    if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {}
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

// Triggered when the backend returns HTTP 402 Payment Required —
// signals the free-tier limit was reached. The app handler typically
// navigates to /paywall.
let onPaymentRequired: ((detail: string) => void) | null = null;
export function setPaymentRequiredHandler(fn: (detail: string) => void) {
  onPaymentRequired = fn;
}

export class ApiError extends Error {
  status: number;
  detail: string;
  // True when the server returned 402 Payment Required (free-tier limit).
  // Callers can use this to skip showing their own alert because the
  // global 402 handler will already have opened the paywall.
  paymentRequired?: boolean;
  constructor(status: number, detail: string) {
    super(detail || `Request failed: ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

// A few endpoints either don't make sense to cache (auth, feedback) or
// are pure write paths. Everything else GET is cached transparently.
const NO_CACHE_GET_PREFIXES = ["/auth/", "/feedback"];

function shouldCacheGet(path: string): boolean {
  return !NO_CACHE_GET_PREFIXES.some((p) => path.startsWith(p));
}

function isMutation(method?: string): boolean {
  if (!method) return false;
  const m = method.toUpperCase();
  return m === "POST" || m === "PUT" || m === "DELETE" || m === "PATCH";
}

// "Network error" detection — fetch throws a TypeError when the device
// can't reach the server. We treat any non-ApiError throw as offline-ish.
function isNetworkError(err: any): boolean {
  if (!err) return false;
  if (err instanceof ApiError) return false;
  if (err instanceof OfflineError) return true;
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed")
  );
}

async function request<T>(
  path: string,
  options: (RequestInit & { freshFor?: number; forceFresh?: boolean }) = {},
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();

  // -----------------------------------------------------------------
  // PERF (2026-06): Stale-While-Revalidate + in-flight dedupe for GETs.
  // (See _doRequest for the actual network logic.) Pull-to-refresh /
  // explicit reloads can bypass the freshness check by passing
  // `forceFresh: true`.
  // -----------------------------------------------------------------
  const DEFAULT_FRESH_MS = 5000;
  const freshFor = options.freshFor ?? (method === "GET" ? DEFAULT_FRESH_MS : 0);
  const forceFresh = !!options.forceFresh;

  if (method === "GET" && shouldCacheGet(path) && !forceFresh) {
    const key = apiCacheKey(path);
    if (freshFor > 0 && hasCached(key)) {
      const ts = getCachedAt(key) || 0;
      if (Date.now() - ts < freshFor) {
        return getCached(key, undefined as any);
      }
    }
    const pending = _inFlightGetByKey.get(key);
    if (pending) return pending as Promise<T>;
    const p = _doRequest<T>(path, options);
    _inFlightGetByKey.set(key, p);
    // IMPORTANT: must NOT create a side-promise that re-throws — otherwise
    // when `p` rejects (e.g. /admin/user-stats → 403 "Admin access
    // required" for non-admin users, which the home screen catches),
    // the side-promise's rejection is unhandled and shows up as the
    // dev LogBox redbox. Use .then(cb, cb) which runs the cleanup on
    // both fulfillment and rejection but does NOT re-throw, so only the
    // caller's `await p` observes the rejection.
    const cleanup = () => {
      if (_inFlightGetByKey.get(key) === p) _inFlightGetByKey.delete(key);
    };
    p.then(cleanup, cleanup);
    return p;
  }

  return _doRequest<T>(path, options);
}

async function _doRequest<T>(
  path: string,
  options: (RequestInit & { freshFor?: number; forceFresh?: boolean }) = {},
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const mutation = isMutation(method);

  // Block mutations early when we know we're offline, with a helpful alert.
  // Auth endpoints are also mutations; we let those through so the login
  // screen can show its own friendlier error.
  if (mutation && !isOnline() && !path.startsWith("/auth/")) {
    showOfflineAlert("This change");
    throw new OfflineError();
  }

  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  // Hard timeout via AbortController so iOS-suspended requests can't hang
  // forever. The controller is registered in _inFlight so the AppState
  // listener can yank it the moment the app comes back to foreground.
  //
  // Heavy uploads (mutations that include a `photos` or `invoice` field
  // in the JSON body) get the longer UPLOAD_TIMEOUT_MS window because
  // 1-5 MB of base64 over cellular routinely exceeds the default 60s.
  const isHeavyUpload =
    mutation &&
    typeof options.body === "string" &&
    (options.body.includes('"photos"') ||
      options.body.includes('"invoice"') ||
      options.body.includes('"image"') ||
      options.body.length > 500_000);
  const effectiveTimeout = isHeavyUpload ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      ctrl.abort("timeout" as any);
    } catch {
      /* best effort */
    }
  }, effectiveTimeout);
  _inFlight.add(ctrl);
  try {
    res = await fetch(`${BASE}/api${path}`, {
      ...options,
      headers,
      signal: ctrl.signal,
    });
  } catch (e: any) {
    // Network failure path — for GETs we silently fall back to cache.
    // Includes AbortError (timeout / app-resume) which behaves the same
    // as a normal offline event from the screen's point of view: pull
    // cached data, no red error.
    if (method === "GET" && shouldCacheGet(path) && hasCached(apiCacheKey(path))) {
      return getCached(apiCacheKey(path), undefined as any);
    }
    if (mutation) {
      // Distinguish a timeout (our own AbortController fired) from a real
      // network failure. A timeout doesn't mean the user is offline — it
      // just means the request took longer than we waited. Showing
      // "You're offline" in that case is misleading and exactly what the
      // user reported on 2026-05-24 (their wifi/cellular was fine).
      if (timedOut) {
        if (!path.startsWith("/auth/")) {
          showOfflineAlert(
            "This change",
            isHeavyUpload
              ? "Your upload is taking longer than expected. Check your connection and try again — large invoices / photos can take a minute on cellular."
              : "The request took too long to complete. Check your connection and try again.",
            "Request timed out",
          );
        }
        throw new OfflineError("Request timed out");
      }
      if (!path.startsWith("/auth/")) showOfflineAlert("This change");
      throw new OfflineError();
    }
    throw e;
  } finally {
    clearTimeout(timer);
    _inFlight.delete(ctrl);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const t = await res.text();
      // If the response body is HTML (e.g. Cloudflare 520 / nginx error
      // page / outdated backend URL returning a landing page), DON'T leak
      // the raw markup into a user-facing alert. Translate it to a clean
      // human message based on the HTTP status.
      const trimmed = (t || "").trim();
      const looksLikeHtml =
        trimmed.startsWith("<!") ||
        trimmed.startsWith("<html") ||
        trimmed.startsWith("<HTML") ||
        trimmed.toLowerCase().includes("<head>") ||
        trimmed.toLowerCase().includes("<body>");
      if (looksLikeHtml) {
        if (res.status >= 500) {
          detail = "Server is temporarily unreachable. Please try again in a moment.";
        } else if (res.status === 404) {
          detail = "That feature is unavailable on this version. Please update the app.";
        } else if (res.status === 403) {
          detail = "Access denied.";
        } else {
          detail = "Something went wrong. Please try again.";
        }
      } else {
        try {
          const j = JSON.parse(t);
          // FastAPI/Pydantic 422 returns detail as an array of error objects:
          // [{type, loc, msg, input, ctx}, ...]. Flatten to a readable string.
          if (Array.isArray(j?.detail)) {
            detail = j.detail
              .map((e: any) => {
                const loc = Array.isArray(e?.loc)
                  ? e.loc.filter((p: any) => p !== "body").join(".")
                  : "";
                const msg = e?.msg || "Invalid value";
                return loc ? `${loc}: ${msg}` : msg;
              })
              .join("; ");
          } else if (typeof j?.detail === "string") {
            detail = j.detail;
          } else if (j?.detail && typeof j.detail === "object") {
            // Single error object form. FastAPI custom paywall errors use
            // `message` (see subscriptions.enforce_tool_limit); fall back to
            // `msg` for Pydantic, then a final JSON dump.
            detail =
              j.detail.message ||
              j.detail.msg ||
              j.detail.error ||
              JSON.stringify(j.detail);
          } else if (typeof j?.message === "string") {
            // FastAPI custom error shape: {"error": "...", "message": "..."}
            detail = j.message;
          } else {
            detail = t;
          }
        } catch {
          detail = t;
        }
      }
    } catch {}
    if (!detail) detail = `Request failed: ${res.status}`;
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    if (res.status === 402 && onPaymentRequired) {
      onPaymentRequired(detail || "Free tier limit reached");
    }
    const apiErr = new ApiError(res.status, detail);
    if (res.status === 402) apiErr.paymentRequired = true;
    throw apiErr;
  }
  // Some endpoints return no body
  const text = await res.text();
  const parsed: T = text ? JSON.parse(text) : ({} as T);

  // Stash successful GETs into the persistent cache.
  if (method === "GET" && shouldCacheGet(path)) {
    try {
      setCached(apiCacheKey(path), parsed);
    } catch {
      /* cache write best-effort */
    }
  }
  // Mutations invalidate any list caches that share the resource root.
  if (mutation) {
    invalidateRelatedCaches(path);
  }
  return parsed;
}

// Best-effort: when a mutation hits "/tools/abc/checkout" we want to bust
// "/tools" and "/stats" so the next read shows fresh data immediately.
//
// PERF (2026-06): previously this function was a no-op (it just iterated
// without clearing anything, relying on the next focus to refetch). Now
// that requests use a 5 s freshness window, the no-op meant mutations
// might not show up for 5 s. We actively clear the relevant caches AND
// invalidate any in-flight dedupe so the next read goes straight to
// the network with a fresh result.
function invalidateRelatedCaches(path: string) {
  // Crudely inspect the first segment of the path.
  // e.g. "/tools/abc/maintenance/x" → root segment "tools".
  const seg = path.split("/").filter(Boolean)[0];
  if (!seg) return;
  // Prefix-clear the resource root so EVERY variant is busted, not just the
  // bare list. Covers `api:/tools`, `api:/tools?search=...` (filtered list),
  // and `api:/tools/<id>` (per-item). Previously only the exact `api:/tools`
  // key was cleared, so creating an item while a search filter was active
  // left the filtered list stale → the new item appeared to "not save".
  const prefixes: string[] = [
    apiCacheKey(`/${seg}`),
    apiCacheKey(`/stats`),
    apiCacheKey(`/aggregate`),
  ];
  for (const pre of prefixes) {
    clearCachedByPrefix(pre);
    // Drop any in-flight GET dedupe entries under this prefix so the next
    // read goes straight to the network instead of awaiting a stale promise.
    for (const k of Array.from(_inFlightGetByKey.keys())) {
      if (k.startsWith(pre)) _inFlightGetByKey.delete(k);
    }
  }
}

const qs = (params?: Record<string, any>) => {
  if (!params) return "";
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") s.append(k, String(v));
  });
  const q = s.toString();
  return q ? `?${q}` : "";
};

// ---- Per-account payment schedule (attached to a dealer's Truck/Credit acct) ----
export interface AccountSchedule {
  enabled: boolean;
  amount: number;
  frequency: "weekly" | "biweekly" | "monthly";
  next_due_date: string;
  remind_day_before: boolean;
  remind_day_of: boolean;
  last_paid_date?: string;
}

export interface DealerPaymentDue {
  id: string;
  dealer_id: string;
  dealer_name: string;
  account: "credit" | "personal";
  account_label: string; // "Truck" | "Credit"
  amount: number;
  frequency: string;
  next_due_date: string;
  remind_day_before: boolean;
  remind_day_of: boolean;
  days_until: number;
  overdue: boolean;
}

export type UpcomingFeatureStatus = "On The List" | "Work Started" | "Completed";

export interface UpcomingFeatureItem {
  id: string;
  title: string;
  description?: string;
  status: UpcomingFeatureStatus;
}

export interface UpcomingRelease {
  id: string;
  release_date: string; // ISO "YYYY-MM-DD"
  title?: string;
  features: UpcomingFeatureItem[];
  created_at?: string;
  updated_at?: string;
}

export const api = {
  // Auth
  register: (data: { email: string; password: string; name?: string }) =>
    request<any>(`/auth/register`, { method: "POST", body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<any>(`/auth/login`, { method: "POST", body: JSON.stringify(data) }),
  me: () => request<any>(`/auth/me`),
  updateMe: (data: any) => request<any>(`/auth/me`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAccount: (password: string) =>
    request<any>(`/auth/account`, { method: "DELETE", body: JSON.stringify({ password }) }),

  // Subscription
  getSubscription: () => request<any>(`/subscription`),

  // Admin (gated by ADMIN_EMAILS server-side)
  adminWhoAmI: () => request<{ is_admin: boolean; email: string }>(`/admin/me`),

  // ---- Upcoming Features / Roadmap ----
  listUpcomingFeatures: () =>
    request<UpcomingRelease[]>(`/upcoming-features`),
  adminCreateUpcomingFeature: (body: {
    release_date: string;
    title?: string;
    features?: { id?: string; title: string; description?: string; status?: string }[];
  }) =>
    request<UpcomingRelease>(`/admin/upcoming-features`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminUpdateUpcomingFeature: (
    id: string,
    body: {
      release_date?: string;
      title?: string;
      features?: { id?: string; title: string; description?: string; status?: string }[];
    },
  ) =>
    request<UpcomingRelease>(`/admin/upcoming-features/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  adminDeleteUpcomingFeature: (id: string) =>
    request<{ ok: boolean }>(`/admin/upcoming-features/${id}`, {
      method: "DELETE",
    }),

  // ---- Admin (gated by ADMIN_EMAILS server-side)
  adminBackupConfig: () =>
    request<{
      schedule: string;
      schedule_human: string;
      next_run_at: string;
      next_run_in_seconds: number;
      max_retained: number;
      collections_backed_up: string[];
    }>(`/admin/backups/config`),
  adminListBackups: () =>
    request<{
      id: string;
      created_at: string;
      size_bytes: number;
      size_human: string;
      trigger: string;
      collections: string[];
      document_count: number;
    }[]>(`/admin/backups`),
  adminTriggerBackup: () =>
    request<{
      id: string;
      created_at: string;
      size_bytes: number;
      size_human: string;
      trigger: string;
      collections: string[];
      document_count: number;
    }>(`/admin/backups/run`, { method: "POST" }),
  adminDeleteBackup: (id: string) =>
    request<{ ok: boolean; deleted_id: string }>(`/admin/backups/${id}`, {
      method: "DELETE",
    }),
  // Helper for the download URL — frontend opens this in a new tab / share sheet.
  adminBackupDownloadUrl: (id: string): string =>
    `${API_BASE}/api/admin/backups/${id}/download`,

  // ---- Google Drive backup integration ----
  adminGdriveStatus: () =>
    request<{
      connected: boolean;
      email?: string;
      connected_at?: string;
      needs_reauth?: boolean;
      reason?: string;
      detail?: string;
      degraded?: boolean;
    }>(
      `/admin/gdrive/status`,
    ),
  adminGdriveAuthUrl: () =>
    request<{ url: string }>(`/admin/gdrive/auth-url`),
  adminGdriveDisconnect: () =>
    request<{ ok: boolean }>(`/admin/gdrive/disconnect`, { method: "POST" }),
  adminGdriveListFiles: () =>
    request<{
      files: Array<{
        id: string;
        name: string;
        createdTime: string;
        size?: string;
        webViewLink?: string;
      }>;
      count: number;
    }>(`/admin/gdrive/files`),
  adminGdriveUploadLatest: () =>
    request<{ ok: boolean; uploaded_backup_id: string }>(
      `/admin/gdrive/upload-latest`,
      { method: "POST" },
    ),
  adminGdriveApplyRetention: () =>
    request<{
      kept: number;
      deleted: number;
      deleted_names: string[];
      retention_days: number;
      keep_min: number;
    }>(`/admin/gdrive/retention`, { method: "POST" }),

  // ---- Offsite-backup health alerts (email admin if backups stop working) ----
  adminBackupHealth: () =>
    request<{
      health: { healthy: boolean; reason: string; detail: string };
      alert_state: {
        healthy?: boolean;
        reason?: string;
        unhealthy_since?: string;
        last_email_at?: string;
        last_checked_at?: string;
      };
      recipients: string[];
      reminder_days: number;
    }>(`/admin/backup-health`),
  // test=true → sends a sample alert email now (verifies deliverability).
  adminBackupHealthSendTest: () =>
    request<{ test: boolean; recipients: string[]; sent_to: string[]; ok: boolean }>(
      `/admin/backup-health/run-now?test=true`,
      { method: "POST" },
    ),

  // Unified one-click backup: snapshots DB + uploads to Drive in one call
  adminBackupFullNow: () =>
    request<{
      ok: boolean;
      backup_id: string;
      size_human: string;
      document_count: number;
      gdrive_uploaded: boolean;
      gdrive_filename?: string;
    }>(`/admin/backups/full-now`, { method: "POST" }),

  // ---- Disaster recovery: encrypted full snapshot + restore + verify/sandbox ----
  // Build the complete ENCRYPTED code+data+env snapshot and push to Drive +
  // passphrase file. Heavy (hundreds of MB) — uses raw fetch with NO client
  // timeout so the long Drive upload isn't aborted mid-flight.
  adminFullSnapshot: async () => {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/api/admin/backups/full-snapshot`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any)?.detail || `Server ${res.status}`);
    return data as {
      ok: boolean;
      filename: string;
      size_human: string;
      size_bytes: number;
      document_count: number;
      encrypted: boolean;
      selfcheck_ok: boolean;
      gdrive_uploaded: boolean;
      passphrase_uploaded: boolean;
    };
  },

  // Restore production DB directly from a Drive backup file id. The server
  // auto-fetches the matching passphrase from Drive for encrypted archives.
  adminRestoreFromDrive: async (fileId: string, confirmEmail: string) => {
    const token = await getToken();
    const form = new FormData();
    form.append("file_id", fileId);
    form.append("confirm_email", confirmEmail);
    const res = await fetch(`${API_BASE}/api/admin/backups/restore-from-drive`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form as any,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any)?.detail || `Server ${res.status}`);
    return data as { ok: boolean; total_documents: number; restored: Record<string, number>; pre_restore_backup_id?: string };
  },

  // Verify a backup file (no DB writes). Accepts a local file uri + passphrase.
  adminVerifyBackup: async (fileUri: string, fileName: string, passphrase: string) => {
    const token = await getToken();
    const form = new FormData();
    form.append("file", { uri: fileUri, name: fileName, type: "application/zip" } as any);
    if (passphrase) form.append("passphrase", passphrase);
    const res = await fetch(`${API_BASE}/api/admin/backups/verify`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form as any,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any)?.detail || `Server ${res.status}`);
    return data as { ok: boolean; valid: boolean; encrypted: boolean; total_documents: number; has_code: boolean; has_env: boolean; summary: Record<string, number> };
  },

  // Test-restore a backup into a throwaway sandbox DB (production untouched).
  adminTestSandbox: async (fileUri: string, fileName: string, passphrase: string) => {
    const token = await getToken();
    const form = new FormData();
    form.append("file", { uri: fileUri, name: fileName, type: "application/zip" } as any);
    if (passphrase) form.append("passphrase", passphrase);
    const res = await fetch(`${API_BASE}/api/admin/backups/test-sandbox`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form as any,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any)?.detail || `Server ${res.status}`);
    return data as { ok: boolean; restored: Record<string, number>; comparison: Record<string, { sandbox: number; production: number; match: boolean }> };
  },

  // ---- Bootstrap (public, only works on an empty DB) ----
  bootstrapStatus: () =>
    request<{ fresh: boolean; user_count: number }>(`/bootstrap/status`, { auth: false } as any),

  bootstrapRestore: async (fileUri: string, fileName: string, passphrase: string, dryRun: boolean) => {
    const form = new FormData();
    form.append("file", { uri: fileUri, name: fileName, type: "application/zip" } as any);
    form.append("dry_run", dryRun ? "true" : "false");
    if (passphrase) form.append("passphrase", passphrase);
    const res = await fetch(`${API_BASE}/api/bootstrap/restore`, {
      method: "POST",
      body: form as any,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any)?.detail || `Server ${res.status}`);
    return data as { ok: boolean; dry_run?: boolean; would_restore?: Record<string, number>; restored?: Record<string, number>; total_documents: number };
  },

  // ---- Dealer Payment Accounts (scheduled recurring payments) ----
  listPaymentAccounts: (dealerId: string) =>
    request<PaymentAccount[]>(`/dealers/${dealerId}/payment-accounts`),
  createPaymentAccount: (dealerId: string, body: PaymentAccountInput) =>
    request<PaymentAccount>(`/dealers/${dealerId}/payment-accounts`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePaymentAccount: (accountId: string, body: Partial<PaymentAccountInput>) =>
    request<PaymentAccount>(`/payment-accounts/${accountId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deletePaymentAccount: (accountId: string) =>
    request<{ ok: boolean }>(`/payment-accounts/${accountId}`, { method: "DELETE" }),
  confirmPayment: (accountId: string) =>
    request<PaymentAccount>(`/payment-accounts/${accountId}/confirm`, { method: "POST" }),
  upcomingPayments: (days = 7) =>
    request<{ days: number; count: number; items: UpcomingPayment[] }>(
      `/payment-accounts/upcoming?days=${days}`,
    ),

  // ---- Per-account payment schedules (Truck/Credit) — new model ----
  setAccountSchedule: (
    dealerId: string,
    account: "credit" | "personal",
    body: AccountSchedule,
  ) =>
    request<any>(`/dealers/${dealerId}/accounts/${account}/schedule`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  clearAccountSchedule: (dealerId: string, account: "credit" | "personal") =>
    request<any>(`/dealers/${dealerId}/accounts/${account}/schedule`, {
      method: "DELETE",
    }),
  confirmAccountPayment: (dealerId: string, account: "credit" | "personal") =>
    request<any>(`/dealers/${dealerId}/accounts/${account}/confirm-payment`, {
      method: "POST",
    }),
  skipAccountPayment: (dealerId: string, account: "credit" | "personal") =>
    request<any>(`/dealers/${dealerId}/accounts/${account}/skip-payment`, {
      method: "POST",
    }),
  dealerPaymentsUpcoming: (days = 7) =>
    request<{ days: number; count: number; items: DealerPaymentDue[] }>(
      `/dealers/payments/upcoming?days=${days}`,
    ),

  forgotPassword: (data: { email: string }) =>
    request<{ ok: boolean; message: string }>(`/auth/forgot-password`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  resetPassword: (data: { email: string; code: string; new_password: string }) =>
    request<any>(`/auth/reset-password`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  // Change login email — step 1 (re-auth + send code to new email), step 2 (confirm code).
  requestEmailChange: (data: { current_password: string; new_email: string }) =>
    request<{ ok: boolean; message: string }>(`/auth/change-email/request`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  confirmEmailChange: (data: { code: string }) =>
    request<{ token: string; user: any }>(`/auth/change-email/confirm`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  submitFeedback: (data: {
    name: string;
    email: string;
    subject: string;
    message: string;
    platform?: string;
    is_bug?: boolean;
    is_feature?: boolean;
    app_version?: string;
    website?: string;
    screenshot_base64?: string;
  }) =>
    request<{ ok: boolean; message: string }>(`/feedback`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Tools
  listTools: (params?: any, opts?: { forceFresh?: boolean }) =>
    request<any[]>(`/tools${qs(params)}`, opts as any),
  getTool: (id: string) => request<any>(`/tools/${id}`),
  createTool: (data: any) => request<any>(`/tools`, { method: "POST", body: JSON.stringify(data) }),
  updateTool: (id: string, data: any) => request<any>(`/tools/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTool: (id: string) => request<any>(`/tools/${id}`, { method: "DELETE" }),
  checkoutTool: (id: string, data: any) => request<any>(`/tools/${id}/checkout`, { method: "POST", body: JSON.stringify(data) }),
  checkinTool: (id: string) => request<any>(`/tools/${id}/checkin`, { method: "POST" }),
  markToolSold: (id: string, data: any) => request<any>(`/tools/${id}/mark-sold`, { method: "POST", body: JSON.stringify(data) }),
  unmarkToolSold: (id: string) => request<any>(`/tools/${id}/unmark-sold`, { method: "POST" }),

  // Bundles / Sets — group items into a "set" with its own part # and set price
  listBundles: (opts?: { forceFresh?: boolean }) =>
    request<any[]>(`/bundles`, opts as any),
  getBundle: (id: string) => request<any>(`/bundles/${id}`),
  createBundle: (data: any) =>
    request<any>(`/bundles`, { method: "POST", body: JSON.stringify(data) }),
  updateBundle: (id: string, data: any) =>
    request<any>(`/bundles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBundle: (id: string) =>
    request<any>(`/bundles/${id}`, { method: "DELETE" }),
  addItemToBundle: (bundleId: string, toolId: string) =>
    request<any>(`/bundles/${bundleId}/items/${toolId}`, { method: "POST" }),
  removeItemFromBundle: (bundleId: string, toolId: string) =>
    request<any>(`/bundles/${bundleId}/items/${toolId}`, { method: "DELETE" }),

  // Prefilled Demo System
  demoStatus: (opts?: { forceFresh?: boolean }) =>
    request<{ present: boolean; intro_seen: boolean }>(`/demo/status`, opts as any),
  demoIntroSeen: () => request<any>(`/demo/intro-seen`, { method: "POST" }),
  demoClear: (mode: "everything" | "keep_taxonomy") =>
    request<any>(`/demo/clear`, { method: "POST", body: JSON.stringify({ mode }) }),

  // Locations
  listLocations: () => request<any[]>(`/locations`),
  createLocation: (data: any) => request<any>(`/locations`, { method: "POST", body: JSON.stringify(data) }),
  updateLocation: (id: string, data: any) => request<any>(`/locations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLocation: (id: string, cascade = false) => request<any>(`/locations/${id}${cascade ? "?cascade=true" : ""}`, { method: "DELETE" }),

  // Tags
  listTags: () => request<any[]>(`/tags`),
  createTag: (data: any) => request<any>(`/tags`, { method: "POST", body: JSON.stringify(data) }),
  updateTag: (id: string, data: any) => request<any>(`/tags/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTag: (id: string) => request<any>(`/tags/${id}`, { method: "DELETE" }),

  // Brands — typeahead source for the Brand field on tools
  listBrands: () => request<any[]>(`/brands`),
  createBrand: (data: any) => request<any>(`/brands`, { method: "POST", body: JSON.stringify(data) }),
  deleteBrand: (id: string) => request<any>(`/brands/${id}`, { method: "DELETE" }),

  // Categories
  listCategories: () => request<any[]>(`/categories`),
  createCategory: (data: any) => request<any>(`/categories`, { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id: string, data: any) => request<any>(`/categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCategory: (id: string) => request<any>(`/categories/${id}`, { method: "DELETE" }),

  // Borrowers
  listBorrowers: () => request<any[]>(`/borrowers`),
  createBorrower: (data: any) => request<any>(`/borrowers`, { method: "POST", body: JSON.stringify(data) }),
  updateBorrower: (id: string, data: any) => request<any>(`/borrowers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBorrower: (id: string) => request<any>(`/borrowers/${id}`, { method: "DELETE" }),
  borrowerHistory: (id: string) => request<any>(`/borrowers/${id}/history`),

  // Dealers
  listDealers: (opts?: { forceFresh?: boolean }) =>
    request<any[]>(`/dealers`, opts as any),
  getDealer: (id: string) => request<any>(`/dealers/${id}`),
  createDealer: (data: any) => request<any>(`/dealers`, { method: "POST", body: JSON.stringify(data) }),
  updateDealer: (id: string, data: any) => request<any>(`/dealers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDealer: (id: string) => request<any>(`/dealers/${id}`, { method: "DELETE" }),
  addAgent: (dealerId: string, data: any) => request<any>(`/dealers/${dealerId}/agents`, { method: "POST", body: JSON.stringify(data) }),
  updateAgent: (dealerId: string, agentId: string, data: any) => request<any>(`/dealers/${dealerId}/agents/${agentId}`, { method: "PUT", body: JSON.stringify(data) }),
  removeAgent: (dealerId: string, agentId: string) => request<any>(`/dealers/${dealerId}/agents/${agentId}`, { method: "DELETE" }),
  setCurrentAgent: (dealerId: string, agentId: string) => request<any>(`/dealers/${dealerId}/current-agent/${agentId}`, { method: "POST" }),

  // Stats / Aggregate / Warranty
  getStats: (opts?: { forceFresh?: boolean }) =>
    request<any>(`/stats`, opts as any),
  aggregate: (params?: any, opts?: { forceFresh?: boolean }) =>
    request<any>(`/aggregate${qs(params)}`, opts as any),
  warrantyAlerts: (days = 60) => request<any>(`/warranty-alerts?days=${days}`),

  // Warranty claims
  listWarrantyClaims: (
    params?: { dealer_id?: string; tool_id?: string; status?: string; archived?: boolean },
    opts?: { forceFresh?: boolean },
  ) => request<any[]>(`/warranty-claims${qs(params)}`, opts as any),
  getWarrantyClaim: (id: string) => request<any>(`/warranty-claims/${id}`),
  warrantyClaimsSummary: (opts?: { forceFresh?: boolean }) =>
    request<any>(`/warranty-claims/summary`, opts as any),
  updateWarrantyClaim: (id: string, data: any) =>
    request<any>(`/warranty-claims/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteWarrantyClaim: (id: string) =>
    request<any>(`/warranty-claims/${id}`, { method: "DELETE" }),

  // Wishlist
  listWishlist: (
    params?: { purchased?: boolean },
    opts?: { forceFresh?: boolean },
  ) => request<any[]>(`/wishlist${qs(params)}`, opts as any),
  createWishlist: (data: any) =>
    request<any>(`/wishlist`, { method: "POST", body: JSON.stringify(data) }),
  updateWishlist: (id: string, data: any) =>
    request<any>(`/wishlist/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteWishlist: (id: string) =>
    request<any>(`/wishlist/${id}`, { method: "DELETE" }),
  convertWishlist: (id: string) =>
    request<any>(`/wishlist/${id}/convert`, { method: "POST" }),

  // Documents
  addDocument: (toolId: string, data: any) =>
    request<any>(`/tools/${toolId}/documents`, { method: "POST", body: JSON.stringify(data) }),
  deleteDocument: (toolId: string, docId: string) =>
    request<any>(`/tools/${toolId}/documents/${docId}`, { method: "DELETE" }),

  // Maintenance
  addMaintenance: (toolId: string, data: any) =>
    request<any>(`/tools/${toolId}/maintenance`, { method: "POST", body: JSON.stringify(data) }),
  updateMaintenance: (toolId: string, schId: string, data: any) =>
    request<any>(`/tools/${toolId}/maintenance/${schId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteMaintenance: (toolId: string, schId: string) =>
    request<any>(`/tools/${toolId}/maintenance/${schId}`, { method: "DELETE" }),
  logService: (toolId: string, schId: string, data: any) =>
    request<any>(`/tools/${toolId}/maintenance/${schId}/service`, { method: "POST", body: JSON.stringify(data) }),
  upcomingMaintenance: (days = 30, opts?: { forceFresh?: boolean }) =>
    request<any>(`/maintenance/upcoming?days=${days}`, opts as any),

  // Theft / Loss
  reportLost: (toolId: string, data: any) =>
    request<any>(`/tools/${toolId}/report-lost`, { method: "POST", body: JSON.stringify(data) }),
  recoverTool: (toolId: string) =>
    request<any>(`/tools/${toolId}/recover`, { method: "POST" }),

  // Bulk
  bulkTools: (data: any) =>
    request<any>(`/tools/bulk`, { method: "POST", body: JSON.stringify(data) }),

  // Dealer balances
  addDealerTransaction: (dealerId: string, data: any) =>
    request<any>(`/dealers/${dealerId}/transactions`, { method: "POST", body: JSON.stringify(data) }),
  deleteDealerTransaction: (dealerId: string, txId: string) =>
    request<any>(`/dealers/${dealerId}/transactions/${txId}`, { method: "DELETE" }),

  // Personal Profile
  getPersonalProfile: () => request<any>(`/personal-profile`),
  updatePersonalProfile: (data: any) =>
    request<any>(`/personal-profile`, { method: "PUT", body: JSON.stringify(data) }),

  // Generic helpers — useful for new endpoints (Reports, etc.) without
  // having to add a typed entry every time. `path` should NOT include the
  // leading "/api"; pass "/reports/spec", "/locations", etc.
  get: <T = any>(path: string) => request<T>(path),
  post: <T = any>(path: string, data?: any) =>
    request<T>(path, {
      method: "POST",
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  put: <T = any>(path: string, data?: any) =>
    request<T>(path, {
      method: "PUT",
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  del: <T = any>(path: string) => request<T>(path, { method: "DELETE" }),
};
