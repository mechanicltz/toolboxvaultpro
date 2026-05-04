/**
 * Compress / downscale photos before embedding them as base64 data URIs in
 * PDFs. Tool photos taken from the device camera can be 5+ MB once
 * base64-encoded, which causes iOS WKWebView's print renderer (used by
 * `expo-print`) to silently hang when generating large reports / posters.
 *
 * On web the smaller payload also reduces the size of the JSON body POSTed
 * to /api/render-pdf and speeds up xhtml2pdf rendering.
 *
 * No-op for empty / non-data-URI strings.
 */
import * as ImageManipulator from "expo-image-manipulator";

export async function compressForPdf(
  src: string,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<string> {
  if (!src) return src;
  const maxWidth = opts.maxWidth ?? 1000;
  const quality = opts.quality ?? 0.6;
  try {
    const out = await ImageManipulator.manipulateAsync(
      src,
      [{ resize: { width: maxWidth } }],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!out.base64) return src;
    return `data:image/jpeg;base64,${out.base64}`;
  } catch {
    // If compression fails for any reason, fall back to the original so the
    // PDF still has *some* image rather than failing.
    return src;
  }
}

/**
 * Compress every URI in an array (in parallel). Bad/large items fall back
 * to the original so the PDF never breaks because of one weird photo.
 */
export async function compressManyForPdf(
  list: string[],
  opts?: { maxWidth?: number; quality?: number },
): Promise<string[]> {
  if (!list || list.length === 0) return [];
  return Promise.all(list.map((s) => compressForPdf(s, opts)));
}
