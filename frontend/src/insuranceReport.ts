/**
 * Insurance claim report runner — renders a claim PDF on the server, brings it
 * to the device, and views it (in-app pdf-viewer on native, download on web).
 * Mirrors the proven approach in reportRunner.ts.
 */
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { getToken, API_BASE } from "./api";

const BACKEND = API_BASE.replace(/\/+$/, "");

function pickFilename(headers: Headers, fallback: string): string {
  const cd = headers.get("Content-Disposition") || "";
  const m = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
  return (m && m[1]) || fallback;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + chars[n & 63];
  }
  if (i < bytes.length) {
    const rem = bytes.length - i;
    const n = rem === 2 ? (bytes[i] << 16) | (bytes[i + 1] << 8) : bytes[i] << 16;
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63];
    out += rem === 2 ? chars[(n >> 6) & 63] + "=" : "==";
  }
  return out;
}

interface Fetched {
  uri: string;
  filename: string;
  mime: string;
  reportId?: string;
  version?: string;
}

async function fetchPdf(url: string, method: string, body?: any): Promise<Fetched> {
  const token = await getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let resp: Response;
  try {
    resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e: any) {
    throw new Error(`Network error reaching report service (${e?.message || e}).`);
  }
  if (!resp.ok) {
    let detail = "";
    try {
      detail = (await resp.json())?.detail || "";
    } catch {
      /* ignore */
    }
    throw new Error(`Report failed — server ${resp.status}${detail ? `: ${detail}` : ""}`);
  }
  const filename = pickFilename(resp.headers, `insurance-claim-${Date.now()}.pdf`);
  const reportId = resp.headers.get("X-Report-Id") || undefined;
  const version = resp.headers.get("X-Report-Version") || undefined;
  const mime = "application/pdf";

  if (Platform.OS === "web") {
    const blob = await resp.blob();
    const w: any = (globalThis as any).window;
    const uri = w.URL.createObjectURL(blob);
    return { uri, filename, mime, reportId, version };
  }
  const arrayBuf = await resp.arrayBuffer();
  const Buffer = (globalThis as any).Buffer;
  const base64 = Buffer?.from ? Buffer.from(arrayBuf).toString("base64") : bytesToBase64(new Uint8Array(arrayBuf));
  const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || "";
  const safeName = filename.replace(/[^A-Za-z0-9._-]+/g, "_");
  const fileUri = `${cacheDir}${safeName}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return { uri: fileUri, filename, mime, reportId, version };
}

function viewFile(file: Fetched) {
  if (Platform.OS === "web") {
    const w: any = (globalThis as any).window;
    const doc: any = w.document;
    const a = doc.createElement("a");
    a.href = file.uri;
    a.download = file.filename;
    a.style.display = "none";
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    setTimeout(() => {
      try {
        w.URL.revokeObjectURL(file.uri);
      } catch {
        /* ignore */
      }
    }, 60_000);
    return;
  }
  router.push({
    pathname: "/pdf-viewer",
    params: { uri: file.uri, title: file.filename || "Claim Report", mime: file.mime },
  });
}

/** Render a NEW report version and immediately view it. Returns the stored
 *  report id/version so the caller can refresh history. */
export async function renderAndViewClaimReport(claimId: string, opts: any): Promise<Fetched> {
  const file = await fetchPdf(`${BACKEND}/api/insurance-claims/${claimId}/reports/render`, "POST", opts);
  viewFile(file);
  return file;
}

/** Render a NEW report version WITHOUT opening the viewer — used by the
 *  one-tap "Email to Insurer" flow, which generates a fresh Detailed report
 *  silently and then hands its id straight to the email composer. */
export async function renderClaimReportOnly(claimId: string, opts: any): Promise<Fetched> {
  return fetchPdf(`${BACKEND}/api/insurance-claims/${claimId}/reports/render`, "POST", opts);
}

/** View an already-generated stored report version. */
export async function viewStoredClaimReport(claimId: string, reportId: string): Promise<void> {
  const file = await fetchPdf(
    `${BACKEND}/api/insurance-claims/${claimId}/reports/${reportId}`,
    "GET",
  );
  viewFile(file);
}

/** Share a stored report via the OS share sheet (native) / download (web). */
export async function shareStoredClaimReport(claimId: string, reportId: string): Promise<void> {
  const file = await fetchPdf(
    `${BACKEND}/api/insurance-claims/${claimId}/reports/${reportId}`,
    "GET",
  );
  if (Platform.OS === "web") {
    viewFile(file);
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: file.mime, dialogTitle: "Share claim report", UTI: "com.adobe.pdf" });
  } else {
    viewFile(file);
  }
}
