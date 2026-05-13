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

/**
 * Normalize a base64 / data-URI / file-URI / http(s) string into a value that
 * ImageManipulator.manipulateAsync can consume AND that can be safely embedded
 * as an `<img src="...">` in a PDF.
 *
 * Historically the AI receipt scanner stored receipts as bare base64 strings
 * (no `data:` prefix). When such a string was passed to ImageManipulator it
 * silently threw, compressForPdf fell back to returning the raw base64, and
 * the resulting <img src="<raw b64>"> rendered as the dreaded "blue ?" broken
 * image icon in xhtml2pdf output (Bug #12).
 */
export function ensureDataUri(src: string): string {
  if (!src) return src;
  const s = String(src).trim();
  if (!s) return s;
  if (s.startsWith("data:")) return s;
  if (/^(file|https?|content|blob|ph):/i.test(s)) return s;
  // Bare base64 string — assume JPEG (the common case for our receipts).
  return `data:image/jpeg;base64,${s}`;
}

export async function compressForPdf(
  src: string,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<string> {
  if (!src) return src;
  const maxWidth = opts.maxWidth ?? 1000;
  const quality = opts.quality ?? 0.6;
  const normalized = ensureDataUri(src);
  try {
    const out = await ImageManipulator.manipulateAsync(
      normalized,
      [{ resize: { width: maxWidth } }],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!out.base64) return normalized;
    return `data:image/jpeg;base64,${out.base64}`;
  } catch {
    // If compression fails for any reason, fall back to the normalized URI so
    // the PDF still has *some* image rather than rendering a broken-image
    // placeholder.
    return normalized;
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
