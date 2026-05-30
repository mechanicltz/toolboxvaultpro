"""One-off script: generate a mockup of the Toolbox Vault industrial login
screen using gpt-image-1. Saves the PNG to /app/backend/generated/ so we can
preview & iterate before turning it into actual React Native code.

Usage:
    cd /app/backend && python scripts/gen_login_mockup.py
"""
import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Make sibling modules importable when run from any cwd.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration  # noqa: E402

PROMPT = """Mobile app login screen for "Toolbox Vault" — a heavy-duty industrial tool inventory app for professional mechanics.

OVERALL MOOD: Snap-On toolbox meets military equipment. Industrial machinery control panel. Heavy steel fabrication. Premium mechanic workstation. Rugged but modern. Built from steel, bolts, gears, and diamond plate metal. Photorealistic, AAA game UI quality. Portrait orientation, 9:16 aspect ratio.

COLOR PALETTE:
- Deep industrial black background (#050505)
- Dark steel layers (#111111, #1A1A1A)
- Gunmetal accents (#2B2B2B)
- Industrial burnt orange highlights (#FF6A00, #FF7E1B, #D84E00)
- Bright text white (#F2F2F2)
- Muted metal gray for secondary text (#8A8A8A)

BACKGROUND (multi-layer):
- Dark brushed steel base texture
- Large partially visible heavy iron gears in all 4 corners, very dark, low opacity, photoreal
- Diamond plate steel pattern, subtle, 8% opacity overlay
- Realistic scratches, wear marks, machined imperfections throughout

LOGO AREA (top center, ~25% of screen height):
- Forged steel octagonal badge with heavy steel frame, orange illuminated edge trim, hex bolts in each corner, slight bevel
- Center: crossed 3D black steel hammer + wrench, photorealistic, orange glow accents, machined edges, slight depth

TITLE (below logo):
- "TOOLBOX VAULT" in bold condensed industrial stencil font
- "TOOLBOX" rendered as brushed silver steel with metal texture, subtle bevel
- "VAULT" rendered as industrial burnt orange with metal texture
- Drop shadow, premium industrial look

SUBTITLE:
- "INVENTORY • DEALERS • WARRANTIES • REPORTS" in small caps, spaced lettering, muted steel gray with tiny orange separator dots

LOGIN PANEL (looks like a removable steel machine access door bolted onto a chassis):
- Heavy steel border, chamfered corners, machined edges (12-16px visual depth)
- Visible industrial hex bolts in all four corners and midpoints of long sides, with metal reflections and shadows
- Dark brushed metal panel surface, subtle wear, slight scratches, very realistic

TAB SELECTOR (top of panel):
- Two metal plates side by side
- LEFT "SIGN IN" tab: ACTIVE — industrial orange powder-coated plate, rivets, surface scratches, beveled edge, orange glow underneath
- RIGHT "CREATE ACCOUNT" tab: INACTIVE — dark steel, no glow, muted

FORM FIELDS:
- Labels "EMAIL" and "PASSWORD" in tall condensed industrial font, 6-8% letter spacing, steel gray color
- Input fields are angular machined hexagonal-ish shapes, NOT rounded rectangles. Near-black background, inset appearance like cut into metal, thin orange edge lighting
- Email field shows industrial line-art envelope icon (orange) and placeholder "you@example.com"
- Password field shows lock icon (orange), dotted password, and orange eye visibility toggle, all machined metal style

SIGN IN BUTTON (most important element, near bottom):
- Wide steel plate construction, angled corners, large (~60-70px tall)
- Industrial orange powder-coated steel surface with visible wear marks, scratches, edge chips, realistic metal texture
- Hex bolts in left and right corners with small metal washers and realistic shadows
- "SIGN IN" in large bold black industrial stencil text
- Subtle hot-steel orange glow beneath the button

FORGOT PASSWORD: centered below button, orange text, thin technical appearance, small horizontal separator lines on both sides like blueprint styling

FOOTER NOTICE: small dark gray text with tiny shield icon — "New user? Use Create Account to get started for free."

QUALITY: Photorealistic, ultra detailed, 4K design presentation quality, pixel-perfect mobile application interface, bevels, extrusions, ambient occlusion, steel reflections. AVOID: flat design, Material Design, iOS glassmorphism, rounded modern SaaS aesthetics. Every component must feel physically forged, bolted, machined, industrial. Status bar visible at top (3:51, signal, wifi, 100% battery)."""


async def main() -> None:
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        print("ERROR: EMERGENT_LLM_KEY missing from /app/backend/.env")
        sys.exit(1)

    out_dir = Path("/app/backend/generated")
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    out_path = out_dir / f"login-mockup-{ts}.png"

    print("→ Generating image with gpt-image-1 (this can take ~30-60s)...")
    image_gen = OpenAIImageGeneration(api_key=api_key)
    images = await image_gen.generate_images(
        prompt=PROMPT,
        model="gpt-image-1",
        number_of_images=1,
    )
    if not images:
        print("ERROR: No image returned")
        sys.exit(1)

    out_path.write_bytes(images[0])
    print(f"✓ Saved: {out_path}")
    print(f"✓ Size:  {out_path.stat().st_size:,} bytes")


if __name__ == "__main__":
    asyncio.run(main())
