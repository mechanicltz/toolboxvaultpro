"""Generate Toolbox Vault industrial login mockup with gpt-image-1.

Run: cd /app/backend && python scripts/gen_login_mockup.py
"""
import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration  # noqa: E402

PROMPT = """A photorealistic mobile app login screen rendered in portrait 9:16 aspect ratio. Industrial heavy-duty mechanic toolbox aesthetic — Snap-On meets military equipment meets diamond plate steel.

LAYOUT (top to bottom, exact proportions):
- iPhone status bar at very top (time 3:51, location arrow, signal/wifi/100% battery)
- COMPACT octagonal forged-steel badge centered at top (about 20% of screen height, NOT bigger)
- "TOOLBOX VAULT" title text below badge
- Two horizontal orange industrial trim bars extending out from the title bar to BOTH left and right screen edges, like brand nameplate wings, each with a single hex bolt and slight wear
- Subtitle row below title with 4 words separated by orange dots
- Login panel filling the rest of the screen

BADGE (top center, compact):
- Octagon shape with chamfered edges
- Heavy 3D forged dark steel frame, bright burnt-orange (#FF6A00) edge trim/lighting around the outer octagon perimeter
- 6 visible industrial hex bolts: 4 at the corner intersections plus 2 at the midpoints of the longer sides
- Inside the octagon: crossed black steel hammer (top-left to bottom-right) and wrench (top-right to bottom-left), 3D photorealistic with orange glow highlights on edges, slight depth
- Background of octagon: subtle dark diamond plate texture

TITLE TYPOGRAPHY (below badge, large, bold):
- "TOOLBOX" in heavy condensed industrial stencil font, brushed silver-white color, subtle wear/scratches on letters, slight bevel
- "VAULT" right next to it, same stencil font, bright burnt orange color (#FF7E1B), matching wear
- Both words must look like they share the same font family and weight
- Centered, both words on the same horizontal line

DECORATIVE TRIM WINGS (this is critical — DO NOT OMIT):
- Two horizontal thin industrial bars extending OUT from the title row to BOTH the left and right screen edges
- Each wing is solid burnt orange metal with realistic scratches and a single hex bolt
- They look like the side trim of a metal nameplate bolted onto the chassis
- These bars run parallel to the title text at the same vertical level

SUBTITLE (right below title):
- Small caps spaced letters in clean white: "INVENTORY  •  DEALERS  •  WARRANTIES  •  REPORTS"
- Bullet separators are bright glowing orange dots
- Letter spacing wide

LOGIN PANEL (large rectangle filling middle/bottom of screen):
- Dark brushed-steel rectangular access door, chamfered corners
- THIN BRIGHT ORANGE GLOW LINE outlining the entire panel perimeter
- 6 visible hex bolts on the panel frame: 4 corners + 2 midpoints of the long vertical sides
- Subtle diamond plate texture inside the panel
- Slight wear, scratches, machined imperfections

TAB SELECTOR (top of panel, two equal halves):
- LEFT tab "SIGN IN" — ACTIVE: solid burnt orange chamfered plate with 4 small hex bolts in its corners, bright orange glow strip underneath, black bold stencil text "SIGN IN" with a small person silhouette icon to its left in black
- RIGHT tab "CREATE ACCOUNT" — INACTIVE: dark gunmetal flat, no glow, muted gray text "CREATE ACCOUNT" with a small gray person+plus icon to its left

FORM (inside panel, below tabs):
- Label "EMAIL" in tall narrow industrial stencil font, white-gray, with a thin orange dash trim to its right
- Email input field: chamfered rectangular shape (corners clipped at 45 degrees), inset near-black background, thin bright orange L-bracket lighting on its top-left corner, an orange envelope outline icon inside on left, placeholder text "you@example.com"
- Same pattern for "PASSWORD" label
- Password input field with same chamfered shape, showing dots "•••••••"
- To the right of the password field is a SEPARATE small chamfered eye-toggle button (square-ish, dark with thin orange edge, contains a bright orange outlined eye icon)

PRIMARY SIGN IN BUTTON (large, near bottom of panel):
- Wide chamfered/octagonal horizontal bar spanning almost the full panel width
- Solid bright burnt orange (#FF6A00) powder-coated steel surface with realistic wear marks, scratches, edge chips
- Two visible large hex bolts at the far left and far right ends of the button with small washers
- Centered: a small black lock icon followed by bold black industrial stencil text "SIGN IN"
- Bright hot-steel orange glow emanating from beneath the button

BOTTOM ROW (below button):
- Centered burnt-orange text "FORGOT PASSWORD?" in technical/blueprint style, flanked by two short horizontal orange separator lines on each side
- Below that: a small inset dark steel notice card with a tiny orange shield icon on the left and white text "New user? Use Create Account to get started for free."

BACKGROUND (behind the entire login screen, NOT inside the panel):
- Dark industrial black with multiple large heavy iron gears visible at all four corners (partial gears bleeding off screen edges), low contrast but clearly visible
- Subtle diamond plate steel texture overlay
- Realistic scratches, oil smudges, machined imperfections, ambient occlusion

COLOR PALETTE — STRICT:
- Background black: #050505
- Steel panels: #1A1A1A to #2B2B2B gunmetal
- Industrial burnt orange: #FF6A00 (primary), #FF7E1B (highlights), #D84E00 (deep shadows)
- White-silver text: #F2F2F2
- Muted gray: #8A8A8A

QUALITY: Photorealistic AAA game UI quality, ultra-detailed, 4K product concept art, pixel-perfect mobile interface. Heavy realism, physical bevels, ambient occlusion, steel reflections, hot-steel orange illumination. AVOID flat design, AVOID glassmorphism, AVOID rounded SaaS aesthetic. Everything must look physically forged, bolted, and machined."""


async def main() -> None:
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        print("ERROR: EMERGENT_LLM_KEY missing from /app/backend/.env")
        sys.exit(1)

    out_dir = Path("/app/backend/generated")
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    out_path = out_dir / f"login-mockup-{ts}.png"

    print("→ Generating image with gpt-image-1 (high quality, ~45-75s)...")
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
