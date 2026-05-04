/**
 * Tiny CSV utilities — purposely no third-party dep.
 *
 *  parseCsv(text): string[][]
 *  saveBase64(filename, mime, base64) -> Promise<void>  (cross-platform)
 */
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

/**
 * Parse RFC-4180-ish CSV. Supports:
 *   - quoted fields with commas/newlines inside
 *   - escaped quotes via doubled quotes (`""`)
 *   - LF or CRLF line endings
 *   - leading UTF-8 BOM
 */
export function parseCsv(input: string): string[][] {
  let text = input || "";
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\r") {
        // ignore — handled with \n
      } else if (c === "\n") {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  // last field
  if (field !== "" || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  // Strip fully-empty trailing rows
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) {
    rows.pop();
  }
  return rows;
}

/**
 * Cross-platform save of a base64-encoded file.
 *  - Web: triggers an anchor download
 *  - Native: writes to cache + opens the OS share sheet so the user can
 *    save to Files / iCloud / Drive / email it.
 */
export async function saveBase64(
  filename: string,
  mime: string,
  base64: string,
): Promise<void> {
  if (Platform.OS === "web") {
    const w: any = (globalThis as any).window;
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = w.document.createElement("a");
    a.href = url;
    a.download = filename;
    w.document.body.appendChild(a);
    a.click();
    w.document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return;
  }
  const dir =
    (FileSystem as any).cacheDirectory ||
    (FileSystem as any).documentDirectory ||
    "";
  const uri = dir + filename;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: mime,
      UTI: "public.comma-separated-values-text",
      dialogTitle: filename,
    });
  }
}
