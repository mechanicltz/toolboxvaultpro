const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Tools
  listTools: (params?: {
    search?: string;
    location_id?: string;
    tag_id?: string;
    checked_out?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.append("search", params.search);
    if (params?.location_id) qs.append("location_id", params.location_id);
    if (params?.tag_id) qs.append("tag_id", params.tag_id);
    if (params?.checked_out !== undefined)
      qs.append("checked_out", String(params.checked_out));
    const q = qs.toString();
    return request<any[]>(`/tools${q ? "?" + q : ""}`);
  },
  getTool: (id: string) => request<any>(`/tools/${id}`),
  createTool: (data: any) =>
    request<any>(`/tools`, { method: "POST", body: JSON.stringify(data) }),
  updateTool: (id: string, data: any) =>
    request<any>(`/tools/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTool: (id: string) =>
    request<any>(`/tools/${id}`, { method: "DELETE" }),
  checkoutTool: (id: string, data: any) =>
    request<any>(`/tools/${id}/checkout`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  checkinTool: (id: string) =>
    request<any>(`/tools/${id}/checkin`, { method: "POST" }),

  // Locations
  listLocations: () => request<any[]>(`/locations`),
  createLocation: (data: any) =>
    request<any>(`/locations`, { method: "POST", body: JSON.stringify(data) }),
  deleteLocation: (id: string) =>
    request<any>(`/locations/${id}`, { method: "DELETE" }),

  // Tags
  listTags: () => request<any[]>(`/tags`),
  createTag: (data: any) =>
    request<any>(`/tags`, { method: "POST", body: JSON.stringify(data) }),
  deleteTag: (id: string) =>
    request<any>(`/tags/${id}`, { method: "DELETE" }),

  // Borrowers
  listBorrowers: () => request<any[]>(`/borrowers`),
  createBorrower: (data: any) =>
    request<any>(`/borrowers`, { method: "POST", body: JSON.stringify(data) }),
  deleteBorrower: (id: string) =>
    request<any>(`/borrowers/${id}`, { method: "DELETE" }),

  // Stats
  getStats: () => request<any>(`/stats`),
};
