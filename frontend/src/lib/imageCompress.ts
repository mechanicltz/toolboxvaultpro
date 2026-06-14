import * as ImageManipulator from "expo-image-manipulator";

/**
 * Compress/resize an image URI to a max width and JPEG quality, returning a
 * base64 string WITHOUT the data-URI prefix (callers add `data:image/jpeg;base64,`).
 *
 * Keeps user photos small so they don't bloat MongoDB documents or cause
 * out-of-memory crashes when many are decoded at once. Standardized across all
 * upload paths. Falls back to the original URI's manipulate with no resize if
 * the source is already small.
 */
export async function compressToBase64(
  uri: string,
  maxWidth = 1280,
  quality = 0.55,
): Promise<string> {
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return out.base64 ?? "";
}

/** Same as compressToBase64 but returns a ready-to-use data URI. */
export async function compressToDataUri(
  uri: string,
  maxWidth = 1280,
  quality = 0.55,
): Promise<string> {
  const b64 = await compressToBase64(uri, maxWidth, quality);
  return `data:image/jpeg;base64,${b64}`;
}
