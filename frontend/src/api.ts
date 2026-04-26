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
};
