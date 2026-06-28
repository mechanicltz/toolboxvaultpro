/**
 * Insurance Claims API client. Self-contained (uses API_BASE + getToken from
 * api.ts) so it stays out of the large central api object. JSON only — PDF
 * rendering lives in insuranceReport.ts.
 */
import { API_BASE, getToken } from "./api";

const BASE = API_BASE.replace(/\/+$/, "");

async function req<T = any>(path: string, method = "GET", body?: any): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    let detail = "";
    try {
      const j = await resp.json();
      detail = j?.detail || "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Request failed (${resp.status})`);
  }
  if (resp.status === 204) return undefined as unknown as T;
  return (await resp.json()) as T;
}

export interface ClaimSpec {
  claim_types: string[];
  statuses: string[];
  pre_loss_conditions: string[];
  post_loss_conditions: string[];
  note_categories: string[];
  evidence_kinds: string[];
  report_sections: string[];
}

export interface ClaimSummary {
  total_claims: number;
  open_claims: number;
  closed_claims: number;
  denied_claims: number;
  open_tasks: number;
  total_claimed_value: number;
  total_approved_value: number;
  total_paid_value: number;
}

export const insuranceApi = {
  spec: () => req<ClaimSpec>("/insurance-claims/spec"),
  getProfile: () => req<any>("/personal-profile"),
  listTools: () => req<any[]>("/tools"),
  summary: () => req<ClaimSummary>("/insurance-claims/summary"),
  list: (params: Record<string, any> = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== null)
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return req<any[]>(`/insurance-claims${q ? `?${q}` : ""}`);
  },
  get: (id: string) => req<any>(`/insurance-claims/${id}`),
  create: (data: any) => req<any>("/insurance-claims", "POST", data),
  update: (id: string, data: any) => req<any>(`/insurance-claims/${id}`, "PUT", data),
  remove: (id: string) => req<any>(`/insurance-claims/${id}`, "DELETE"),
  setStatus: (id: string, data: any) => req<any>(`/insurance-claims/${id}/status`, "POST", data),
  attachItems: (id: string, tool_ids: string[]) =>
    req<any>(`/insurance-claims/${id}/items`, "POST", { tool_ids }),
  bulkRemove: (id: string, tool_ids: string[]) =>
    req<any>(`/insurance-claims/${id}/items/bulk-remove`, "POST", { tool_ids }),
  detachItem: (id: string, toolId: string) =>
    req<any>(`/insurance-claims/${id}/items/${toolId}`, "DELETE"),
  patchItem: (id: string, toolId: string, data: any) =>
    req<any>(`/insurance-claims/${id}/items/${toolId}`, "PATCH", data),
  addNote: (id: string, data: any) => req<any>(`/insurance-claims/${id}/notes`, "POST", data),
  deleteNote: (id: string, noteId: string) =>
    req<any>(`/insurance-claims/${id}/notes/${noteId}`, "DELETE"),
  addEvidence: (id: string, data: any) =>
    req<any>(`/insurance-claims/${id}/evidence`, "POST", data),
  listEvidence: (id: string) => req<any[]>(`/insurance-claims/${id}/evidence`),
  getEvidence: (id: string, evId: string) =>
    req<any>(`/insurance-claims/${id}/evidence/${evId}`),
  deleteEvidence: (id: string, evId: string) =>
    req<any>(`/insurance-claims/${id}/evidence/${evId}`, "DELETE"),
  duplicate: (id: string) => req<any>(`/insurance-claims/${id}/duplicate`, "POST"),
  archive: (id: string, archived: boolean) =>
    req<any>(`/insurance-claims/${id}/archive?archived=${archived}`, "POST"),
  listReports: (id: string) => req<any[]>(`/insurance-claims/${id}/reports`),
  emailReport: (id: string, reportId: string, data: any) =>
    req<any>(`/insurance-claims/${id}/reports/${reportId}/email`, "POST", data),

  // ---- tasks ----
  addTask: (id: string, data: any) => req<any>(`/insurance-claims/${id}/tasks`, "POST", data),
  patchTask: (id: string, taskId: string, data: any) =>
    req<any>(`/insurance-claims/${id}/tasks/${taskId}`, "PATCH", data),
  deleteTask: (id: string, taskId: string) =>
    req<any>(`/insurance-claims/${id}/tasks/${taskId}`, "DELETE"),

  // ---- contacts ----
  addContact: (id: string, data: any) => req<any>(`/insurance-claims/${id}/contacts`, "POST", data),
  patchContact: (id: string, contactId: string, data: any) =>
    req<any>(`/insurance-claims/${id}/contacts/${contactId}`, "PATCH", data),
  deleteContact: (id: string, contactId: string) =>
    req<any>(`/insurance-claims/${id}/contacts/${contactId}`, "DELETE"),

  // ---- documents (separate from evidence) ----
  addDocument: (id: string, data: any) => req<any>(`/insurance-claims/${id}/documents`, "POST", data),
  listDocuments: (id: string) => req<any[]>(`/insurance-claims/${id}/documents`),
  getDocument: (id: string, docId: string) =>
    req<any>(`/insurance-claims/${id}/documents/${docId}`),
  patchDocument: (id: string, docId: string, data: any) =>
    req<any>(`/insurance-claims/${id}/documents/${docId}`, "PATCH", data),
  deleteDocument: (id: string, docId: string) =>
    req<any>(`/insurance-claims/${id}/documents/${docId}`, "DELETE"),
};
