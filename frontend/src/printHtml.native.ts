/**
 * Native (iOS / Android) implementation: real PDF via expo-print + share sheet.
 * The web implementation lives in `printHtml.web.ts`.
 */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export async function printReportHtml(
  html: string,
  filename: string,
): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: filename,
    });
  }
}
