import React from "react";
import { Image as ExpoImage, ImageProps as ExpoImageProps } from "expo-image";

type ResizeMode = "cover" | "contain" | "stretch" | "center";

const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

/**
 * Resolve a stored photo reference to a loadable URI.
 * - GridFS media is stored as a relative `/api/files/{id}` URL → prefix the
 *   backend origin so it loads on native (iOS/Android), not just web.
 * - `data:` URIs and absolute http(s) URLs pass through unchanged.
 */
export function resolveUri(uri?: string): string | undefined {
  if (!uri) return uri;
  if (uri.startsWith("/")) return `${BACKEND_URL}${uri}`;
  return uri;
}

type Props = Omit<ExpoImageProps, "contentFit" | "source"> & {
  source?: any;
  /** RN-Image compatibility: accepts `resizeMode` and maps it to expo-image's `contentFit`. */
  resizeMode?: ResizeMode;
  contentFit?: ExpoImageProps["contentFit"];
};

/**
 * Drop-in replacement for React Native's <Image> when rendering USER photos
 * (base64 data-URIs, GridFS `/api/files` URLs, or remote URLs).
 *
 * Why: RN's <Image> decodes every source into a full-resolution, uncompressed
 * bitmap and keeps it in memory — with hundreds of tool photos this causes the
 * out-of-memory crashes (Expo Go closing to the home screen). `expo-image`
 * downsamples to the display size, bounds its memory cache, disk-caches by URL,
 * and recycles bitmaps in lists via `recyclingKey`.
 *
 * Defaults: contentFit "cover", cachePolicy "memory-disk", no transition.
 * Keep using RN's <Image>/<ImageBackground> for the static metal-skin PNGs.
 */
export function AppImage({
  source,
  resizeMode,
  contentFit,
  cachePolicy,
  transition,
  ...rest
}: Props) {
  const resolved =
    source && typeof source === "object" && "uri" in source
      ? { ...source, uri: resolveUri(source.uri) }
      : source;
  return (
    <ExpoImage
      source={resolved}
      contentFit={contentFit ?? resizeMode ?? "cover"}
      cachePolicy={cachePolicy ?? "memory-disk"}
      transition={transition ?? 0}
      {...rest}
    />
  );
}
