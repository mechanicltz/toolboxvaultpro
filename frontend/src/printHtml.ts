/**
 * Generate / save HTML reports as a real PDF across:
 *   - Web (including the Expo platform's sandboxed iframe preview)
 *   - iOS / Android native
 *
 * Web strategy
 * ------------
 *   1. Extract the `<style>` blocks + `<body>` HTML from the supplied
 *      full HTML document so we can insert them into the main document
 *      (cloning an iframe's body strips its <head><style> rules).
 *   2. Render that content in a hidden, fixed-width (8.5in) container.
 *   3. Lazy-load `html2pdf.js` (jsPDF + html2canvas bundle) from a CDN.
 *   4. Rasterise the container and trigger a single .pdf download.
 *
 *   Result: a real PDF, no print dialog, no popup, no double download
 *   warning, no 30-second sit-and-wait.
 *
 * Native strategy
 * ---------------
 *   expo-print + expo-sharing (uses the system's native PDF renderer).
 */
import { Platform } from "react-native";

function extractParts(fullHtml: string): { styles: string; body: string } {
  // Pull every <style>…</style> block (handles multiple)
  const styleMatches = Array.from(
    fullHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi),
  );
  const styles = styleMatches.map((m) => m[1]).join("\n");

  // Body contents (or the whole string if no <body> tag present)
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : fullHtml;

  return { styles, body };
}

async function loadHtml2Pdf(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = (globalThis as any).window;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = w.document;

  if (w.html2pdf) return w.html2pdf;

  await new Promise<void>((resolve, reject) => {
    const existing = doc.querySelector("script[data-html2pdf]");
    if (existing) {
      if (w.html2pdf) return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load html2pdf.js")),
      );
      return;
    }
    const s = doc.createElement("script");
    s.src =
      "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    s.async = true;
    s.dataset.html2pdf = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load html2pdf.js"));
    doc.head.appendChild(s);
  });

  if (!w.html2pdf) throw new Error("html2pdf.js did not initialize");
  return w.html2pdf;
}

export async function printReportHtml(
  html: string,
  filename: string,
): Promise<void> {
  if (Platform.OS === "web") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w: any = (globalThis as any).window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc: any = w.document;

    const { styles, body } = extractParts(html);

    // Off-screen container (8.5in wide = Letter) so layout matches the page.
    const container = doc.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-99999px";
    container.style.top = "0";
    container.style.width = "7.7in"; // letter width minus 0.4in margins each side
    container.style.background = "#ffffff";
    container.style.color = "#111111";
    container.style.fontFamily = "Arial, Helvetica, sans-serif";
    container.style.zIndex = "-1";
    container.style.pointerEvents = "none";
    container.innerHTML = `<style>${styles}</style>${body}`;
    doc.body.appendChild(container);

    // Allow base64 images to decode
    await new Promise<void>((r) => setTimeout(r, 250));
    try {
      const imgs = container.querySelectorAll("img");
      await Promise.all(
        Array.prototype.map.call(imgs, (img: any) => {
          if (img.complete) return Promise.resolve();
          return new Promise((res) => {
            img.addEventListener("load", res, { once: true });
            img.addEventListener("error", res, { once: true });
            // hard cap so we never hang
            setTimeout(res, 2500);
          });
        }) as Promise<void>[],
      );
    } catch {
      /* ignore */
    }

    const safeName = filename.endsWith(".pdf")
      ? filename
      : `${filename.replace(/\.html?$/, "")}.pdf`;

    try {
      const html2pdf = await loadHtml2Pdf();
      await html2pdf()
        .from(container)
        .set({
          margin: [0.4, 0.4, 0.4, 0.4],
          filename: safeName,
          image: { type: "jpeg", quality: 0.92 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: "#ffffff",
            windowWidth: 816, // 8.5in @ 96dpi
          },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .save();
    } finally {
      try {
        doc.body.removeChild(container);
      } catch {
        /* ignore */
      }
    }
    return;
  }

  // ---------- Native (iOS / Android) ----------
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
