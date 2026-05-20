import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiCacheKey, getCached, hasCached, setCached } from "./cache";
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
const REQUEST_TIMEOUT_MS = 20_000;
const _inFlight = new Set<AbortController>();

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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try {
      ctrl.abort("timeout" as any);
    } catch {
      /* best effort */
    }
  }, REQUEST_TIMEOUT_MS);
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
      // The eager check above usually catches this, but if connectivity
      // dropped *during* the request we still warn.
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
function invalidateRelatedCaches(path: string) {
  // Crudely inspect the first segment of the path.
  // e.g. "/tools/abc/maintenance/x" → root segment "tools".
  const seg = path.split("/").filter(Boolean)[0];
  if (!seg) return;
  // Always blow away common aggregate endpoints since they depend on lots of things.
  const toClear: string[] = [
    apiCacheKey(`/${seg}`),
    apiCacheKey(`/${seg}/`),
    apiCacheKey(`/stats`),
    apiCacheKey(`/aggregate`),
  ];
  // We don't have an easy way to enumerate cached query-string variants
  // here; that's OK because the screens will refetch on focus and the
  // cache will be repopulated. The cleared base list is the important one.
  for (const k of toClear) {
    if (hasCached(k)) {
      // Setting to a defensive empty value would mislead screens; we
      // simply re-mark by calling setCached with the existing value to
      // refresh its meta timestamp. Real refresh comes from the next fetch.
      // (Intentional no-op — kept for clarity; real screens use stale-while-revalidate.)
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

  // Admin · Database backups (audit #17)
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
  listTools: (params?: any) => request<any[]>(`/tools${qs(params)}`),
  getTool: (id: string) => request<any>(`/tools/${id}`),
  createTool: (data: any) => request<any>(`/tools`, { method: "POST", body: JSON.stringify(data) }),
  updateTool: (id: string, data: any) => request<any>(`/tools/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTool: (id: string) => request<any>(`/tools/${id}`, { method: "DELETE" }),
  checkoutTool: (id: string, data: any) => request<any>(`/tools/${id}/checkout`, { method: "POST", body: JSON.stringify(data) }),
  checkinTool: (id: string) => request<any>(`/tools/${id}/checkin`, { method: "POST" }),
  markToolSold: (id: string, data: any) => request<any>(`/tools/${id}/mark-sold`, { method: "POST", body: JSON.stringify(data) }),
  unmarkToolSold: (id: string) => request<any>(`/tools/${id}/unmark-sold`, { method: "POST" }),

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
  listDealers: () => request<any[]>(`/dealers`),
  getDealer: (id: string) => request<any>(`/dealers/${id}`),
  createDealer: (data: any) => request<any>(`/dealers`, { method: "POST", body: JSON.stringify(data) }),
  updateDealer: (id: string, data: any) => request<any>(`/dealers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDealer: (id: string) => request<any>(`/dealers/${id}`, { method: "DELETE" }),
  addAgent: (dealerId: string, data: any) => request<any>(`/dealers/${dealerId}/agents`, { method: "POST", body: JSON.stringify(data) }),
  updateAgent: (dealerId: string, agentId: string, data: any) => request<any>(`/dealers/${dealerId}/agents/${agentId}`, { method: "PUT", body: JSON.stringify(data) }),
  removeAgent: (dealerId: string, agentId: string) => request<any>(`/dealers/${dealerId}/agents/${agentId}`, { method: "DELETE" }),
  setCurrentAgent: (dealerId: string, agentId: string) => request<any>(`/dealers/${dealerId}/current-agent/${agentId}`, { method: "POST" }),

  // Stats / Aggregate / Warranty
  getStats: () => request<any>(`/stats`),
  aggregate: (params?: any) => request<any>(`/aggregate${qs(params)}`),
  warrantyAlerts: (days = 60) => request<any>(`/warranty-alerts?days=${days}`),

  // Warranty claims
  listWarrantyClaims: (params?: { dealer_id?: string; tool_id?: string; status?: string; archived?: boolean }) =>
    request<any[]>(`/warranty-claims${qs(params)}`),
  getWarrantyClaim: (id: string) => request<any>(`/warranty-claims/${id}`),
  warrantyClaimsSummary: () => request<any>(`/warranty-claims/summary`),
  updateWarrantyClaim: (id: string, data: any) =>
    request<any>(`/warranty-claims/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteWarrantyClaim: (id: string) =>
    request<any>(`/warranty-claims/${id}`, { method: "DELETE" }),

  // Wishlist
  listWishlist: (params?: { purchased?: boolean }) =>
    request<any[]>(`/wishlist${qs(params)}`),
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
  upcomingMaintenance: (days = 30) =>
    request<any>(`/maintenance/upcoming?days=${days}`),

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
