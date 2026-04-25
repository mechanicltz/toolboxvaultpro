const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
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
  // Tools
  listTools: (params?: any) => request<any[]>(`/tools${qs(params)}`),
  getTool: (id: string) => request<any>(`/tools/${id}`),
  createTool: (data: any) => request<any>(`/tools`, { method: "POST", body: JSON.stringify(data) }),
  updateTool: (id: string, data: any) => request<any>(`/tools/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTool: (id: string) => request<any>(`/tools/${id}`, { method: "DELETE" }),
  checkoutTool: (id: string, data: any) => request<any>(`/tools/${id}/checkout`, { method: "POST", body: JSON.stringify(data) }),
  checkinTool: (id: string) => request<any>(`/tools/${id}/checkin`, { method: "POST" }),

  // Locations
  listLocations: () => request<any[]>(`/locations`),
  createLocation: (data: any) => request<any>(`/locations`, { method: "POST", body: JSON.stringify(data) }),
  updateLocation: (id: string, data: any) => request<any>(`/locations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLocation: (id: string, cascade = false) => request<any>(`/locations/${id}${cascade ? "?cascade=true" : ""}`, { method: "DELETE" }),

  // Tags
  listTags: () => request<any[]>(`/tags`),
  createTag: (data: any) => request<any>(`/tags`, { method: "POST", body: JSON.stringify(data) }),
  deleteTag: (id: string) => request<any>(`/tags/${id}`, { method: "DELETE" }),

  // Categories
  listCategories: () => request<any[]>(`/categories`),
  createCategory: (data: any) => request<any>(`/categories`, { method: "POST", body: JSON.stringify(data) }),
  deleteCategory: (id: string) => request<any>(`/categories/${id}`, { method: "DELETE" }),

  // Borrowers
  listBorrowers: () => request<any[]>(`/borrowers`),
  createBorrower: (data: any) => request<any>(`/borrowers`, { method: "POST", body: JSON.stringify(data) }),
  deleteBorrower: (id: string) => request<any>(`/borrowers/${id}`, { method: "DELETE" }),

  // Dealers
  listDealers: () => request<any[]>(`/dealers`),
  getDealer: (id: string) => request<any>(`/dealers/${id}`),
  createDealer: (data: any) => request<any>(`/dealers`, { method: "POST", body: JSON.stringify(data) }),
  updateDealer: (id: string, data: any) => request<any>(`/dealers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDealer: (id: string) => request<any>(`/dealers/${id}`, { method: "DELETE" }),
  addAgent: (dealerId: string, data: any) => request<any>(`/dealers/${dealerId}/agents`, { method: "POST", body: JSON.stringify(data) }),
  removeAgent: (dealerId: string, agentId: string) => request<any>(`/dealers/${dealerId}/agents/${agentId}`, { method: "DELETE" }),
  setCurrentAgent: (dealerId: string, agentId: string) => request<any>(`/dealers/${dealerId}/current-agent/${agentId}`, { method: "POST" }),

  // Stats / Aggregate / Warranty
  getStats: () => request<any>(`/stats`),
  aggregate: (params?: any) => request<any>(`/aggregate${qs(params)}`),
  warrantyAlerts: (days = 60) => request<any>(`/warranty-alerts?days=${days}`),

  // Toolbox layouts
  listLayouts: () => request<any[]>(`/toolbox-layouts`),
  getLayout: (id: string) => request<any>(`/toolbox-layouts/${id}`),
  createLayout: (data: any) => request<any>(`/toolbox-layouts`, { method: "POST", body: JSON.stringify(data) }),
  updateLayout: (id: string, data: any) => request<any>(`/toolbox-layouts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLayout: (id: string) => request<any>(`/toolbox-layouts/${id}`, { method: "DELETE" }),
  analyzeToolbox: (image_base64: string) => request<any>(`/toolbox/analyze`, { method: "POST", body: JSON.stringify({ image_base64 }) }),
};
