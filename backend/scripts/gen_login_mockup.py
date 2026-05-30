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

PROMPT = """A photorealistic AAA-quality mobile app login screen, portrait 9:16 aspect ratio. The entire screen looks like it was physically forged from steel inside a heavy machine shop — Snap-On meets military equipment meets diamond plate metal.

THE ABSOLUTE MUST-HAVES (do NOT skip any of these):

(1) DRAMATIC BACKGROUND: Dark industrial black with FOUR LARGE PHOTOREALISTIC IRON GEARS visible in all four corners — each gear is huge, only partially visible (bleeding off the screen edges), heavy 3D depth with shadows, rust spots, oily metallic shine. The gears are clearly the dominant background element. Between them, dark diamond plate steel texture overlay with realistic scratches and machined wear marks. Heavy ambient occlusion. Looks like a Hollywood movie poster of a tool truck.

(2) iPhone status bar at very top: time 3:51, location arrow icon, signal/wifi/100% battery, white text.

(3) COMPACT OCTAGONAL BADGE at top center (only ~18-20% of screen height — NOT bigger). Heavy 3D forged dark steel octagon with bright burnt-orange (#FF6A00) glowing edge trim around the outer perimeter. SIX visible large industrial hex bolts: 4 at the corner intersections + 2 at the midpoints of the longer horizontal sides. Inside the octagon: a 3D crossed hammer (top-left to bottom-right) and wrench (top-right to bottom-left), both rendered in dark forged steel with subtle orange glow highlights along their edges, photorealistic reflections, slight depth. Inside the octagon background: subtle dark diamond plate texture.

(4) TITLE "TOOLBOX VAULT" below badge, in HEAVY CONDENSED INDUSTRIAL STENCIL FONT, large and bold:
- "TOOLBOX" rendered in brushed silver-white steel color (#F2F2F2) with subtle wear/scratches and slight bevel
- A space, then "VAULT" rendered in bright burnt orange (#FF7E1B) with matching font weight and wear
- BOTH WORDS must use the EXACT same stencil font family, same size, same weight, same line — they only differ in color

(5) TWO HORIZONTAL ORANGE TRIM WINGS extending OUT from the title bar to BOTH the left AND right screen edges. Each wing is a solid burnt orange industrial metal trim bar, parallel to the title text at the same vertical center line, with realistic wear/scratches and ONE visible hex bolt in the middle of each wing. They look like brand nameplate trim bolted onto the chassis on either side of the title.

(6) SUBTITLE row just below the title: "INVENTORY  •  DEALERS  •  WARRANTIES  •  REPORTS" in wide-spaced small-caps clean white text, with BRIGHT GLOWING ORANGE DOTS as bullet separators between the words.

(7) LARGE LOGIN PANEL filling the middle/bottom of the screen (chamfered rectangle):
- THIN BRIGHT BURNT-ORANGE GLOW outlining the ENTIRE panel perimeter (this is critical — must be clearly visible)
- Six hex bolts on the panel frame: 4 corners + 2 midpoints of the long vertical sides
- Dark brushed steel surface with subtle diamond plate texture and scratches inside

(8) TAB SELECTOR (top of panel, two equal halves side-by-side):
- LEFT "SIGN IN" tab — ACTIVE: a solid burnt orange chamfered plate with 4 small hex bolts in its corners, bright orange hot-steel glow strip beneath it. Black bold stencil text "SIGN IN" with a small black person silhouette icon to its left.
- RIGHT "CREATE ACCOUNT" tab — INACTIVE: dark gunmetal flat appearance, muted gray text "CREATE ACCOUNT" with a small gray person-plus icon to its left.

(9) FORM FIELDS inside panel:
- "EMAIL" label in tall narrow stencil font, white-gray, followed by a thin orange dash line to the right
- Email input field: chamfered rectangular shape (corners clipped at 45 degrees, NOT rounded), inset near-black background, thin bright orange L-bracket lighting on its top-left corner, orange envelope outline icon on the left inside, placeholder text "you@example.com" in gray
- Same exact pattern for "PASSWORD" label and field showing dots ••••••••
- SEPARATE small chamfered eye-toggle button to the right of the password field (square-ish, dark with thin orange edge trim, contains a bright orange outlined eye icon)

(10) BIG SIGN IN BUTTON near bottom of panel:
- Wide chamfered/octagonal horizontal bar spanning almost the full panel width
- Solid bright burnt orange (#FF6A00) powder-coated steel with realistic wear marks, scratches, edge chips, machined imperfections
- Two visible LARGE hex bolts at the far-left and far-right ends with small washers and realistic shadows
- Centered text: a small black lock icon followed by bold black industrial stencil "SIGN IN"
- Bright hot-steel orange glow emanating from beneath the entire button

(11) "FORGOT PASSWORD?" centered below the button in burnt orange technical/blueprint style, flanked by two short orange horizontal separator lines.

(12) FOOTER NOTICE at very bottom of panel: a small inset dark steel rounded card with a tiny orange shield icon on the left and clean white text reading "New user? Use Create Account to get started for free."

QUALITY: Cinematic, hyper-detailed, 4K AAA game UI quality, product concept art level. Heavy realism with physical bevels, deep ambient occlusion, sharp steel reflections, hot-steel orange illumination. Looks PHOTOGRAPHIC, like an actual forged metal control panel. AVOID: flat design, AVOID glassmorphism, AVOID rounded modern SaaS aesthetic. Every component must look physically forged, bolted, machined, and worn from years of workshop use."""


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
