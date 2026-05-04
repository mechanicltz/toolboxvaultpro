/**
 * Native (iOS / Android) implementation: real PDF via expo-print + share sheet.
 * The web implementation lives in `printHtml.web.ts`.
 *
 * Reliability notes:
 * - `Sharing.isAvailableAsync()` can return `false` on certain Expo Go
 *   configurations or restricted devices. Previously, when that happened
 *   we silently exited and the user saw nothing — that's the "nothing
 *   happens after Generate" bug.
 * - We now always either share the PDF, OR fall back to the native print
 *   sheet via `Print.printAsync({ uri })`. Both routes let the user save,
 *   AirDrop, or print the PDF.
 * - We also rename the temp file to a meaningful name before sharing so
 *   recipients see something better than `print.pdf`.
 */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Alert, Platform } from "react-native";

function safeFilename(name: string): string {
  const trimmed = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  const stem = trimmed || "report";
  return stem.toLowerCase().endsWith(".pdf") ? stem : `${stem}.pdf`;
}

async function renameToFinal(srcUri: string, finalName: string): Promise<string> {
  try {
    // expo-file-system v19 — `documentDirectory` is the preferred root.
    const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!dir) return srcUri;
    const destUri = `${dir}${finalName}`;
    // Remove any existing file with that name (e.g. user generated twice).
    try {
      await FileSystem.deleteAsync(destUri, { idempotent: true });
    } catch {
      /* ignore */
    }
    await FileSystem.copyAsync({ from: srcUri, to: destUri });
    return destUri;
  } catch {
    // If anything goes wrong we just keep the original tmp uri.
    return srcUri;
  }
}

export async function printReportHtml(
  html: string,
  filename: string,
): Promise<void> {
  const finalName = safeFilename(filename);

  // Step 1: render HTML → PDF on disk.
  let uri: string;
  try {
    const result = await Print.printToFileAsync({ html, base64: false });
    uri = result.uri;
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[printHtml] Print.printToFileAsync failed", err);
    Alert.alert(
      "Could not generate PDF",
      err?.message || "The print engine couldn't render this document.",
    );
    throw err;
  }

  // Step 2: rename to a friendlier filename so it shares nicely.
  const friendlyUri = await renameToFinal(uri, finalName);

  // Step 3: hand off to share sheet — or fall back to the native print
  // preview if Sharing isn't available in this runtime.
  let sharingAvailable = false;
  try {
    sharingAvailable = await Sharing.isAvailableAsync();
  } catch {
    sharingAvailable = false;
  }

  if (sharingAvailable) {
    try {
      await Sharing.shareAsync(friendlyUri, {
        mimeType: "application/pdf",
        dialogTitle: finalName,
        UTI: "com.adobe.pdf",
      });
      return;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn("[printHtml] Sharing.shareAsync failed, falling back", err);
      // fall through to the print fallback
    }
  }

  // Fallback A: open the native print preview (lets the user save to Files /
  // AirDrop / send via email).
  try {
    await Print.printAsync({ uri: friendlyUri });
    return;
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.warn("[printHtml] Print.printAsync fallback failed", err);
  }

  // Fallback B: nothing else worked. Tell the user where the file lives so
  // they can recover it manually rather than experiencing "nothing happens".
  Alert.alert(
    "PDF saved",
    Platform.OS === "ios"
      ? `The PDF was generated but the share sheet is unavailable on this device. The file is saved at:\n\n${friendlyUri}`
      : `The PDF was generated but cannot be shared automatically. The file is saved at:\n\n${friendlyUri}`,
  );
}
