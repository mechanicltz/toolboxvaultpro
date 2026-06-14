import React from "react";
import { Image as ExpoImage, ImageProps as ExpoImageProps } from "expo-image";

type ResizeMode = "cover" | "contain" | "stretch" | "center";

type Props = Omit<ExpoImageProps, "contentFit"> & {
  /** RN-Image compatibility: accepts `resizeMode` and maps it to expo-image's `contentFit`. */
  resizeMode?: ResizeMode;
  contentFit?: ExpoImageProps["contentFit"];
};

/**
 * Drop-in replacement for React Native's <Image> when rendering USER photos
 * (base64 data-URIs or remote URLs).
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
  resizeMode,
  contentFit,
  cachePolicy,
  transition,
  ...rest
}: Props) {
  return (
    <ExpoImage
      contentFit={contentFit ?? resizeMode ?? "cover"}
      cachePolicy={cachePolicy ?? "memory-disk"}
      transition={transition ?? 0}
      {...rest}
    />
  );
}
