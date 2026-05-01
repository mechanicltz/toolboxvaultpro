import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "tt.auth.token";

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

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail || `Request failed: ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = "";
    try {
      const t = await res.text();
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
          // Single error object form
          detail = j.detail.msg || JSON.stringify(j.detail);
        } else {
          detail = t;
        }
      } catch {
        detail = t;
      }
    } catch {}
    if (!detail) detail = `Request failed: ${res.status}`;
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, detail);
  }
  // Some endpoints return no body
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text);
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
