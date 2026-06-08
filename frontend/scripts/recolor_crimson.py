"""Recolor an Iron Forge (orange) asset into the Crimson Steel (pink) variant.

The Crimson theme is produced from the orange art by a uniform HSV hue
rotation of -37 degrees (orange accent ~22 deg -> crimson accent ~343 deg),
preserving saturation, value and alpha. This matches the existing
trimmed-pink assets to within ~1/255 mean error (derived empirically from the
plate-frame pair).

Usage:
  python3 recolor_crimson.py <src_orange.png> <dst_pink.png>
"""
import sys
from PIL import Image
import numpy as np

HUE_DELTA_DEG = -37.0


def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    df = mx - mn
    v = mx
    s = np.where(mx == 0, 0, df / np.where(mx == 0, 1, mx))
    h = np.zeros_like(mx)
    mask = df != 0
    idx = (mx == r) & mask
    h[idx] = ((g - b)[idx] / df[idx]) % 6
    idx = (mx == g) & mask
    h[idx] = ((b - r)[idx] / df[idx]) + 2
    idx = (mx == b) & mask
    h[idx] = ((r - g)[idx] / df[idx]) + 4
    return h / 6.0, s, v


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6).astype(int)
    f = h * 6 - i
    p = v * (1 - s)
    q = v * (1 - f * s)
    t = v * (1 - (1 - f) * s)
    i = i % 6
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)


def recolor(src: str, dst: str) -> None:
    im = Image.open(src).convert("RGBA")
    arr = np.asarray(im, dtype=np.float32)
    rgb = arr[..., :3] / 255.0
    alpha = arr[..., 3:4]
    h, s, v = rgb_to_hsv(rgb)
    h = (h + HUE_DELTA_DEG / 360.0) % 1.0
    out_rgb = np.clip(hsv_to_rgb(h, s, v) * 255.0, 0, 255)
    out = np.concatenate([out_rgb, alpha], axis=-1).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(dst, "PNG", optimize=True)
    print(f"  wrote {dst}")


if __name__ == "__main__":
    recolor(sys.argv[1], sys.argv[2])
