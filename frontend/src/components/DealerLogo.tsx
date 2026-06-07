import React, { useEffect, useMemo, useState } from "react";
import { Image, StyleProp, ImageStyle } from "react-native";
import { resolveDealerLogo } from "../dealerLogos";

/**
 * Renders a dealer's logo.
 *
 * The logo ALWAYS keeps its true aspect ratio (never stretched) and the
 * rendered element hugs the artwork tightly — there is NO backing chip and NO
 * dead/letterbox space around it. The brand logos are transparent PNGs that
 * read well directly on the dark theme.
 *
 * `size`   = the bounding box WIDTH  (max width the logo may occupy)
 * `height` = the bounding box HEIGHT (max height, defaults to `size`)
 *
 * The logo is scaled to be as large as possible inside that box while keeping
 * its real proportions, so it never grows a list row taller than `height`.
 */
export function DealerLogo({
  logo,
  size = 48,
  height,
  style,
}: {
  logo?: string | null;
  size?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const maxW = size;
  const maxH = height ?? size;

  // Memoize on the logo STRING — resolveDealerLogo() returns a fresh { uri }
  // object for base64/custom logos, so we must key on the string (not the
  // object) to avoid an infinite re-render loop.
  const source = useMemo(() => resolveDealerLogo(logo), [logo]);

  // Intrinsic aspect ratio (width / height). Defaults to 1 until measured.
  const [aspect, setAspect] = useState(1);

  useEffect(() => {
    let cancelled = false;

    // Bundled require() assets resolve synchronously with real dimensions.
    const resolved = Image.resolveAssetSource(source as any);
    if (resolved?.width && resolved?.height) {
      setAspect(resolved.width / resolved.height);
      return;
    }

    // Remote / data-uri (custom uploads) — ask the platform for the size.
    const uri = (source as any)?.uri;
    if (uri) {
      Image.getSize(
        uri,
        (w, h) => {
          if (!cancelled && w && h) setAspect(w / h);
        },
        () => {
          if (!cancelled) setAspect(1);
        },
      );
    } else {
      setAspect(1);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logo]);

  // Fit the logo inside the [maxW x maxH] box at its true aspect ratio.
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }

  return (
    <Image
      source={source}
      style={[{ width: w, height: h }, style]}
      resizeMode="contain"
    />
  );
}

export default DealerLogo;
