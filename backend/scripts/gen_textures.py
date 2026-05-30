"""Generate the 4 reusable industrial texture assets for Toolbox Vault.

Each is a focused single-purpose asset — NO mixed UI elements, NO text.
Run: cd /app/backend && python scripts/gen_textures.py
Output: /app/backend/generated/textures/
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

ASSETS = [
    {
        "name": "industrial-bg",
        "prompt": """A seamless dark industrial background texture for a mobile app. Portrait orientation. The entire image is a single cohesive dark metal surface — NO text, NO buttons, NO input fields, NO panels, NO logos, NO badges, NO UI elements whatsoever. ONLY raw industrial textures.

Composition:
- Base layer: deep industrial black (#050505) brushed steel surface
- Diamond plate steel pattern covering the entire surface, photorealistic, with subtle highlights and shadows on each diamond stud
- FOUR large heavy iron gears positioned in the four corners (top-left, top-right, bottom-left, bottom-right) — each gear is huge and only partially visible (gear teeth bleeding off the screen edges), dark gunmetal color, photoreal 3D depth with rust spots, oil smudges, and metallic shine, low contrast against the dark background
- Realistic scratches, wear marks, oil stains, machined imperfections scattered across the entire surface
- Heavy ambient occlusion, deep shadows
- NO orange accents anywhere — keep it all dark gunmetal and black

Quality: AAA photorealistic, cinematic, ultra-detailed, 4K product concept art. Looks like the inside of a Hollywood movie tool truck. NO UI ELEMENTS — pure background texture only.""",
    },
    {
        "name": "logo-badge",
        "prompt": """A single forged-steel octagonal industrial logo badge isolated on a SOLID PURE BLACK (#000000) background. Centered, taking up about 70% of the frame. NO text anywhere in the image, NO surrounding UI, NO border decoration outside the badge — ONLY the badge itself on solid black.

Badge design:
- Octagonal shape with chamfered edges, heavy 3D forged dark steel frame
- Bright burnt-orange (#FF6A00) glowing edge trim around the outer perimeter of the octagon
- SIX large industrial hex bolts: 4 at the corner intersections + 2 at the midpoints of the longer horizontal sides, with metallic reflections and shadows
- Inside the octagon: a photorealistic 3D crossed HAMMER (going from top-left to bottom-right) and WRENCH (going from top-right to bottom-left), both rendered in dark forged steel with subtle orange-glow highlights along their edges, sharp shadows, deep machined detail, slight depth, realistic metallic reflections — the wrench has an open jaw on one end and a closed ring on the other, the hammer has a heavy steel head
- Inside the octagon background: subtle dark diamond plate steel texture

Quality: AAA photorealistic, cinematic, ultra-detailed, sharp focus, 4K product concept art. Heavy realism with bevels, ambient occlusion, and steel reflections. The background MUST be pure solid black so it can be easily composited.""",
    },
    {
        "name": "panel-frame",
        "prompt": """A single industrial steel maintenance-door panel frame isolated on a SOLID PURE BLACK (#000000) background. Portrait orientation, frame fills about 90% of the image. NO text whatsoever, NO logo, NO buttons or inputs inside it — ONLY the empty panel frame with its bolted hardware. The INTERIOR of the frame must be visibly empty / hollow (showing pure black through it).

Frame design:
- A large rectangular steel access door with chamfered (clipped at 45 degrees) corners — looks like a removable machine maintenance panel bolted onto a chassis
- Heavy brushed dark steel border (~50px thick visually) with realistic wear marks, scratches, machined imperfections
- SIX visible large industrial hex bolts on the frame: 4 in the chamfered corners + 2 at the midpoints of the long vertical sides, photoreal metallic reflections and shadows
- The frame has slight 3D depth, ambient occlusion, beveled edges
- The INTERIOR of the panel is completely empty (pure solid black) — the panel frame is just an empty border ready to contain other UI

Quality: AAA photorealistic, cinematic, ultra-detailed, 4K product concept art. NO orange accents (we'll add those in code). Pure dark steel and bolts only. Background outside the frame must also be pure solid black.""",
    },
    {
        "name": "button-texture",
        "prompt": """A seamless horizontal industrial orange powder-coated steel button texture. Wide landscape rectangle filling the entire frame. NO text anywhere in the image, NO icons, NO bolts, NO borders — ONLY the raw worn metal surface that will be used as a tileable button background.

Surface design:
- Industrial burnt-orange (#FF6A00) powder-coated steel
- Realistic wear marks, scratches, chipped paint revealing dark steel underneath at the edges
- Machined imperfections, slight oil smudges
- Subtle gradient from #FF7E1B at the top to #D84E00 at the bottom for depth
- Edge highlights and slight shadows giving it a beveled / 3D depressed feel
- Hot-steel glow appearance

Quality: AAA photorealistic, cinematic, ultra-detailed, 4K product concept art. Looks like the surface of a real industrial power button or machine plate. NO UI elements, NO text, NO bolts — purely a raw orange metal texture suitable for being used as a repeating button background. Fill the entire frame edge-to-edge with the texture (no surrounding background).""",
    },
]


async def main() -> None:
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        print("ERROR: EMERGENT_LLM_KEY missing"); sys.exit(1)

    out_dir = Path("/app/backend/generated/textures")
    out_dir.mkdir(parents=True, exist_ok=True)

    image_gen = OpenAIImageGeneration(api_key=api_key)

    for i, a in enumerate(ASSETS, 1):
        print(f"→ [{i}/{len(ASSETS)}] Generating '{a['name']}'...")
        try:
            images = await image_gen.generate_images(
                prompt=a["prompt"],
                model="gpt-image-1",
                number_of_images=1,
            )
            if not images:
                print(f"  ✗ No image returned for {a['name']}")
                continue
            out_path = out_dir / f"{a['name']}.png"
            out_path.write_bytes(images[0])
            print(f"  ✓ Saved: {out_path} ({out_path.stat().st_size:,} bytes)")
        except Exception as e:
            print(f"  ✗ Failed: {a['name']}: {e}")

    print("\nDone. Asset directory:")
    for p in sorted(out_dir.glob("*.png")):
        print(f"  • {p.name} ({p.stat().st_size:,} bytes)")


if __name__ == "__main__":
    asyncio.run(main())
