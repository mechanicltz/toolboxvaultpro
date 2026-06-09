"""Recolor a whole Iron Forge (orange) asset folder into another hue theme.

The industrial themes are produced from the orange base art by a uniform HSV
hue rotation (saturation/value/alpha preserved, so the steel greys stay
neutral and only the accent glow shifts). Crimson = -37 deg.

Usage:
  python3 recolor_theme.py <src_dir> <dst_dir> <hue_delta_deg>
e.g.
  python3 recolor_theme.py assets/tbv-v2/trimmed assets/tbv-v2/trimmed-arctic 167
"""
import os
import sys
from PIL import Image
import numpy as np


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


def recolor_file(src: str, dst: str, delta_deg: float) -> None:
    im = Image.open(src).convert("RGBA")
    arr = np.asarray(im, dtype=np.float32)
    rgb = arr[..., :3] / 255.0
    alpha = arr[..., 3:4]
    h, s, v = rgb_to_hsv(rgb)
    h = (h + delta_deg / 360.0) % 1.0
    out_rgb = np.clip(hsv_to_rgb(h, s, v) * 255.0, 0, 255)
    out = np.concatenate([out_rgb, alpha], axis=-1).astype(np.uint8)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    Image.fromarray(out, "RGBA").save(dst, "PNG", optimize=True)


def recolor_dir(src_dir: str, dst_dir: str, delta_deg: float) -> None:
    count = 0
    for root, _, files in os.walk(src_dir):
        for fn in files:
            if not fn.lower().endswith(".png"):
                continue
            src = os.path.join(root, fn)
            rel = os.path.relpath(src, src_dir)
            dst = os.path.join(dst_dir, rel)
            recolor_file(src, dst, delta_deg)
            count += 1
    print(f"  recolored {count} PNGs -> {dst_dir} (delta {delta_deg} deg)")


if __name__ == "__main__":
    recolor_dir(sys.argv[1], sys.argv[2], float(sys.argv[3]))
