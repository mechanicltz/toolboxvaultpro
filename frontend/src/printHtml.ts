/**
 * Print/save HTML reports across web (sandboxed Expo preview) and native.
 *
 * Web strategy: inject a hidden iframe with srcdoc=html, then call
 * iframe.contentWindow.print().  Works inside the parent platform's
 * sandboxed iframe (no new window required).  In parallel, also trigger
 * a Blob → anchor download of the same HTML — guaranteed fallback even
 * if the print dialog gets dismissed.
 *
 * Native strategy: expo-print + expo-sharing (real PDF file).
 */
import { Platform } from "react-native";

export async function printReportHtml(html: string, filename: string): Promise<void> {
  if (Platform.OS === "web") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w: any = (globalThis as any).window;
    const doc: any = w.document;

    const iframe = doc.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.setAttribute(
      "sandbox",
      "allow-same-origin allow-scripts allow-modals allow-popups",
    );
    doc.body.appendChild(iframe);

    await new Promise<void>((resolve) => {
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          try {
            doc.body.removeChild(iframe);
          } catch {
            /* ignore */
          }
          resolve();
        }, 30000);
      };
      iframe.srcdoc = html;
    });

    // Parallel fallback: download the HTML
    try {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = w.URL.createObjectURL(blob);
      const a = doc.createElement("a");
      a.href = url;
      a.download = filename.endsWith(".html") ? filename : `${filename}.html`;
      a.style.display = "none";
      doc.body.appendChild(a);
      a.click();
      doc.body.removeChild(a);
      setTimeout(() => w.URL.revokeObjectURL(url), 60_000);
    } catch {
      /* ignore */
    }
    return;
  }

  // Native path
  const Print = await import("expo-print");
  const Sharing = await import("expo-sharing");
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: filename,
    });
  }
}
