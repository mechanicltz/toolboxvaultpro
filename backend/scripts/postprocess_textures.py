"""Post-process the AI-generated industrial textures.

1) logo-badge.jpg → logo-badge.png with the surrounding black chroma-keyed
   to transparent so the badge sits cleanly on any background.
2) Apply a slight brightness/contrast bump to industrial-bg so the gears
   are more visible without re-running gpt-image-1.
"""
from pathlib import Path

from PIL import Image, ImageEnhance


SRC = Path("/app/frontend/assets/images/textures")


def chroma_key_black(in_path: Path, out_path: Path, threshold: int = 24) -> None:
    """Make pixels darker than `threshold` (in all channels) transparent.
    Pixels within `threshold` blend smoothly to anti-alias the badge edge."""
    im = Image.open(in_path).convert("RGB")
    rgba = im.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            mx = max(r, g, b)
            if mx <= threshold:
                px[x, y] = (0, 0, 0, 0)
            elif mx <= threshold * 2:
                # smooth anti-aliased fade-out near the edge
                alpha = int(255 * (mx - threshold) / threshold)
                px[x, y] = (r, g, b, alpha)
    rgba.save(out_path, "PNG", optimize=True)
    print(f"  ✓ {out_path.name}: {out_path.stat().st_size/1024:.0f}KB")


def brighten(in_path: Path, out_path: Path, factor: float = 1.4) -> None:
    im = Image.open(in_path).convert("RGB")
    enhanced = ImageEnhance.Brightness(im).enhance(factor)
    enhanced = ImageEnhance.Contrast(enhanced).enhance(1.15)
    enhanced.save(out_path, "JPEG", quality=85, optimize=True, progressive=True)
    print(f"  ✓ {out_path.name}: {out_path.stat().st_size/1024:.0f}KB")


def main() -> None:
    print("→ Chroma-keying logo badge (removing black surround)...")
    chroma_key_black(SRC / "logo-badge.jpg", SRC / "logo-badge.png")
    # Remove the JPEG version so frontend uses PNG
    (SRC / "logo-badge.jpg").unlink(missing_ok=True)

    print("→ Brightening industrial-bg so gears are more visible...")
    brighten(SRC / "industrial-bg.jpg", SRC / "industrial-bg.jpg", factor=1.5)

    print("Done.")


if __name__ == "__main__":
    main()
