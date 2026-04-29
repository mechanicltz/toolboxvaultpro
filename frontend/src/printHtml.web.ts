/**
 * Web implementation: POST the HTML to the backend's `/api/render-pdf`
 * endpoint, get a real PDF binary back, and download it.
 *
 * Why server-side?  Browser-side PDF rendering (html2pdf.js / html2canvas)
 * is unreliable inside the Expo Web sandboxed iframe AND on iOS Safari
 * (canvas height ends up 0, downloads get blocked, etc). xhtml2pdf on the
 * backend produces a valid PDF every time, regardless of browser quirks.
 *
 * Native uses `printHtml.native.ts` (expo-print + expo-sharing).
 */
import { getToken } from "./api";

const BACKEND_BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(
  /\/+$/,
  "",
);

function isIOSSafari(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = (globalThis as any).window;
  if (!w?.navigator) return false;
  const ua = String(w.navigator.userAgent || "");
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (w.navigator.platform === "MacIntel" &&
      (w.navigator.maxTouchPoints || 0) > 1);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  return isIOS && isSafari;
}

async function getAuthToken(): Promise<string | null> {
  try {
    return await getToken();
  } catch {
    return null;
  }
}

export async function printReportHtml(
  html: string,
  filename: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = (globalThis as any).window;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = w.document;

  const safeName = filename.endsWith(".pdf")
    ? filename
    : `${filename.replace(/\.html?$/, "")}.pdf`;

  // ------- Build request -------
  const url = BACKEND_BASE
    ? `${BACKEND_BASE}/api/render-pdf`
    : "/api/render-pdf";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = await getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let blob: Blob;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ html, filename: safeName }),
    });
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
      throw new Error(`PDF server returned ${resp.status} ${detail}`);
    }
    blob = await resp.blob();
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[printReportHtml] PDF render failed:", err);
    try {
      // RN Web's Alert.alert is a no-op — use the real DOM alert.
      w.alert(
        "Could not generate PDF.\n\n" + (err?.message || String(err)),
      );
    } catch {
      /* ignore */
    }
    throw err;
  }

  // ------- Trigger the download -------
  const blobUrl = w.URL.createObjectURL(blob);

  // Strategy A: anchor download (Chrome / Firefox / Edge / Android)
  try {
    const a = doc.createElement("a");
    a.href = blobUrl;
    a.download = safeName;
    a.style.display = "none";
    a.rel = "noopener";
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
  } catch {
    /* ignore */
  }

  // Strategy B (iOS Safari): anchor `download` is ignored on blob URLs;
  // open the PDF inline so the user can use the share sheet to save it.
  if (isIOSSafari()) {
    try {
      const win = w.open(blobUrl, "_blank");
      if (!win) w.location.href = blobUrl;
    } catch {
      /* ignore */
    }
  }

  setTimeout(() => {
    try {
      w.URL.revokeObjectURL(blobUrl);
    } catch {
      /* ignore */
    }
  }, 60_000);
}
