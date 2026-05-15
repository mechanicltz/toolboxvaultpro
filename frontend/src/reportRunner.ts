/**
 * Shared report runner — turns wizard choices into a real file and then
 * dispatches the chosen action (View, Email, Save) on the user's device.
 *
 * On native: uses expo-file-system to write the file, expo-sharing to
 * trigger the OS share sheet (= Save / Open in...), and expo-mail-composer
 * for emailing with the file attached. All of these work consistently on
 * iOS, Android, and Expo Go.
 *
 * On web: triggers an anchor download (Save / View — same thing in a
 * browser) and falls back to a mailto: with download instructions for Email.
 */
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as MailComposer from "expo-mail-composer";
import { getToken, API_BASE } from "./api";

// Single source of truth for the backend URL — shared with api.ts so login
// and report generation always hit the same backend (and therefore the same
// MongoDB). Previously reportRunner read EXPO_PUBLIC_BACKEND_URL directly,
// which on certain builds returns the preview URL even though api.ts pins
// to production — causing every report to fail with 401 "User not found"
// (a token from production's DB sent to preview's DB).
const BACKEND = API_BASE.replace(/\/+$/, "");

export type ReportFormat = "pdf" | "csv";
export type ReportAction = "view" | "email" | "save";

export interface RenderRequest {
  reportType: string;
  format: ReportFormat;
  columns?: string[];
  options?: Record<string, any>;
}

interface RenderedFile {
  // On native: a file:// URI written to cache. On web: a blob: URL.
  uri: string;
  // Suggested filename incl. extension.
  filename: string;
  // Mime type.
  mime: string;
  // The Blob (web only) for direct download.
  blob?: Blob;
  // Human-friendly file size (web only — native uses FS info).
  size?: number;
}

function pickFilename(headers: Headers, fallback: string): string {
  const cd = headers.get("Content-Disposition") || "";
  const m = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
  return (m && m[1]) || fallback;
}

async function renderToFile(req: RenderRequest): Promise<RenderedFile> {
  const url = `${BACKEND}/api/reports/render`;
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        report_type: req.reportType,
        format: req.format,
        columns: req.columns,
        options: req.options || {},
      }),
    });
  } catch (netErr: any) {
    // Network reachability failure — surface as something clearer than
    // the platform's default "Network request failed" which users have
    // misread as "404" in the past.
    throw new Error(
      `Network error reaching ${url} (${netErr?.message || netErr}). Check your connection and try again.`,
    );
  }
  if (!resp.ok) {
    let detail = "";
    try {
      const j = await resp.json();
      detail = j?.detail || "";
    } catch {
      try {
        detail = await resp.text();
      } catch {
        /* ignore */
      }
    }
    // Include the full URL + report type so the support ticket can pinpoint
    // exactly which endpoint and which report failed (was hard to debug
    // when the error was just "404").
    throw new Error(
      `Report failed (${req.reportType} ${req.format}) — server ${resp.status} at ${url}${detail ? `: ${detail}` : ""}`,
    );
  }

  const fallbackName = `${req.reportType}-${Date.now()}.${req.format}`;
  const filename = pickFilename(resp.headers, fallbackName);
  const mime = req.format === "pdf" ? "application/pdf" : "text/csv";

  if (Platform.OS === "web") {
    const blob = await resp.blob();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w: any = (globalThis as any).window;
    const uri = w.URL.createObjectURL(blob);
    return { uri, filename, mime, blob, size: blob.size };
  }

  // Native: write to cache as base64
  const arrayBuf = await resp.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Buffer = (globalThis as any).Buffer;
  let base64: string;
  if (Buffer && Buffer.from) {
    base64 = Buffer.from(arrayBuf).toString("base64");
  } else {
    base64 = bytesToBase64(new Uint8Array(arrayBuf));
  }

  const cacheDir =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (FileSystem as any).cacheDirectory ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (FileSystem as any).documentDirectory ||
    "";
  const safeName = filename.replace(/[^A-Za-z0-9._-]+/g, "_");
  const fileUri = `${cacheDir}${safeName}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { uri: fileUri, filename, mime };
}

function bytesToBase64(bytes: Uint8Array): string {
  // Pure-JS base64 encoder for environments without Buffer
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + chars[n & 63];
  }
  if (i < bytes.length) {
    const rem = bytes.length - i;
    const n =
      rem === 2
        ? (bytes[i] << 16) | (bytes[i + 1] << 8)
        : bytes[i] << 16;
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63];
    out += rem === 2 ? chars[(n >> 6) & 63] + "=" : "==";
  }
  return out;
}

/** Render the report and dispatch the chosen action. */
export async function runReport(
  req: RenderRequest,
  action: ReportAction,
  emailContext?: { subject?: string; body?: string },
): Promise<void> {
  const file = await renderToFile(req);

  if (Platform.OS === "web") {
    return runReportWeb(file, action, emailContext);
  }
  return runReportNative(file, action, emailContext);
}

async function runReportWeb(
  file: RenderedFile,
  action: ReportAction,
  emailContext?: { subject?: string; body?: string },
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = (globalThis as any).window;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = w.document;

  if (action === "view" || action === "save") {
    // Anchor-download is the only universally-working approach inside
    // the Expo Web sandboxed iframe.
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

  if (action === "email") {
    // Web doesn't support attachments via mailto. Download the file then
    // open the user's mail composer with a note explaining how to attach it.
    const a = doc.createElement("a");
    a.href = file.uri;
    a.download = file.filename;
    a.style.display = "none";
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);

    const subject = encodeURIComponent(emailContext?.subject || "Toolbox Report");
    const body = encodeURIComponent(
      (emailContext?.body || "Please find the attached Toolbox report.") +
        `\n\n(The file "${file.filename}" was just downloaded — please attach it from your Downloads folder.)`,
    );
    try {
      w.location.href = `mailto:?subject=${subject}&body=${body}`;
    } catch {
      /* ignore */
    }
  }
}

async function runReportNative(
  file: RenderedFile,
  action: ReportAction,
  emailContext?: { subject?: string; body?: string },
): Promise<void> {
  if (action === "email") {
    const available = await MailComposer.isAvailableAsync();
    if (!available) {
      // Fall back to share sheet so user can pick a mail app
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: file.mime,
          dialogTitle: "Email report",
        });
      } else {
        throw new Error("No mail app is configured on this device.");
      }
      return;
    }
    await MailComposer.composeAsync({
      subject: emailContext?.subject || "Toolbox Report",
      body: emailContext?.body || "Please find the attached Toolbox report.",
      attachments: [file.uri],
    });
    return;
  }

  // For both "view" and "save" we use the system share sheet — the user can
  // then "Save to Files", "Open in Acrobat", "Print", etc. This is the
  // standard iOS/Android pattern for delivering generated files.
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: file.mime,
      dialogTitle: action === "save" ? "Save report" : "Open report",
      UTI: file.mime === "application/pdf" ? "com.adobe.pdf" : "public.comma-separated-values-text",
    });
  } else {
    throw new Error("Sharing is not available on this device.");
  }
}
