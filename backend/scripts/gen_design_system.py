"""Generate the 10 Toolbox Vault Industrial Design System assets via gpt-image-1.

Prompts are expanded versions of the user's spec from EMERGENT_IMPLEMENTATION_GUIDE
to ensure clean, text-free, properly-isolated assets that drop straight into
React Native components.

Run: cd /app/backend && python scripts/gen_design_system.py
"""
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration  # noqa: E402

ASSETS = [
    {
        "name": "01_industrial_background_dark",
        "prompt": "Seamless vertical mobile-app background texture. Dark industrial workshop atmosphere. Base color deep gunmetal black (#050505 to #1E1E1E). Brushed steel surface with subtle diamond plate stud pattern across the entire image. Large heavy iron gears partially visible bleeding off the four corners and top edges — gears are dark with subtle rust spots and metallic shine. Realistic scratches, oil smudges, machined wear marks scattered throughout. Faint orange (#FF6A00) edge-glow reflections visible only in a few spots. NO text whatsoever. NO logos. NO UI elements. NO buttons. NO panels. Pure background texture only. Photorealistic, 4K cinematic, AAA game quality. Portrait orientation.",
    },
    {
        "name": "02_industrial_background_light",
        "prompt": "Seamless vertical mobile-app background texture in LIGHT industrial workshop style. Base color light brushed aluminum / silver steel (#D9D9D9 to #F2F2F2). Subtle diamond plate stud pattern across the entire image, slightly visible. Large heavy iron gears partially visible bleeding off the four corners and top edges — gears are mid-gray with subtle wear and metallic shine, visible against the lighter background. Faint machining marks, fine scratches, very subtle wear. Faint orange (#FF6A00) edge-glow reflections visible only in a few spots. NO text whatsoever. NO logos. NO UI elements. NO buttons. NO panels. Pure clean light background texture only. Photorealistic, 4K, premium product concept art. Portrait orientation.",
    },
    {
        "name": "03_logo_badge_octagon",
        "prompt": "A single forged industrial steel OCTAGONAL BADGE isolated on a SOLID PURE BLACK (#000000) background. NO content inside the badge — the interior of the octagon is empty/hollow (solid black). The badge is a hollow octagonal ring/frame only. Dark gunmetal steel frame with bright burnt-orange (#FF6A00) glowing edge trim around the OUTER octagon perimeter. SIX large industrial hex bolts positioned at the corner intersections of the octagon (one at each of the 6 visible corner vertices). Slight 3D bevel, metallic reflections, machined imperfections. NO text. NO icons inside. NO logos. NO hammer or wrench (those will be added separately). Just the empty octagonal ring badge. Photorealistic, AAA quality, transparent-friendly composition (solid black background).",
    },
    {
        "name": "04_hammer_wrench_emblem",
        "prompt": "A SINGLE crossed hammer and wrench emblem isolated on a SOLID PURE BLACK (#000000) background. The hammer goes diagonally from top-left to bottom-right; the wrench goes diagonally from top-right to bottom-left. Both rendered in dark forged steel with subtle orange (#FF6A00) accent glow along their edges. Photorealistic 3D depth, sharp machined edges, deep shadows, realistic metallic reflections. The wrench has an open jaw on one end and a closed ring on the other. The hammer has a heavy steel head. The emblem fills about 80% of the frame, centered. NO background decoration. NO text. NO badge or frame around them — just the crossed tools floating on solid black. Photorealistic, AAA product concept art, 4K.",
    },
    {
        "name": "05_panel_large_dark",
        "prompt": "A single industrial steel maintenance panel FRAME (hollow border ring) isolated on a SOLID PURE BLACK (#000000) background. Chamfered (45-degree-clipped) corners, portrait orientation, frame fills ~90% of the image. Heavy dark gunmetal steel border about 60-70 pixels thick visually. The INTERIOR of the frame is COMPLETELY EMPTY pure black — no panel, no door, no surface inside, just a hollow rectangular border. Six visible industrial hex bolts on the frame itself: 4 in the chamfered corners + 2 at the midpoints of the long vertical sides. Faint burnt-orange (#FF6A00) edge lighting glowing on the inside edge of the steel frame. Realistic wear, scratches, machined imperfections on the frame steel. NO text. NO icons. NO content inside the frame. Just an empty bolted steel border. Photorealistic, AAA quality.",
    },
    {
        "name": "06_dashboard_tile",
        "prompt": "A SMALL square industrial steel dashboard card frame isolated on SOLID PURE BLACK (#000000) background. Approximately 1:1 aspect ratio. Dark steel frame, chamfered corners, hollow empty interior (pure black inside). FOUR small hex bolts in each corner. Subtle burnt-orange (#FF6A00) edge highlights/glow on the inner edge of the frame. Realistic wear, brushed metal texture, slight machined imperfections. NO text. NO content inside. Just a small bolted steel card frame. Photorealistic, AAA quality, fills about 90% of the image.",
    },
    {
        "name": "07_button_primary_orange",
        "prompt": "A single industrial powder-coated orange steel button isolated on SOLID PURE BLACK (#000000) background. Wide horizontal rectangular bar with chamfered (45-degree-clipped) corners on its left and right ends. Approximately 4:1 aspect ratio. Solid burnt orange (#FF6A00) powder-coated surface with realistic wear marks, scratches, edge chips, machined imperfections. ONE large industrial hex bolt visible at the FAR LEFT end and another at the FAR RIGHT end of the button. Subtle hot-steel orange glow emanating from beneath the button. Photorealistic, 3D bevel. NO text. NO icons. Just the empty button surface ready for native text overlay. AAA quality.",
    },
    {
        "name": "08_tab_active",
        "prompt": "A single industrial active tab — orange powder-coated steel plate — isolated on SOLID PURE BLACK (#000000) background. Wide rectangular plate with chamfered corners on the right side (left side flush) suggesting it's the left half of a tab pair. Approximately 3:1 aspect ratio. Solid burnt orange (#FF6A00) surface with subtle metallic wear and scratches. FOUR small rivets / hex bolts in the four corners of the tab. Slight 3D bevel. Faint orange glow underneath the tab. NO text. NO icons. Just the empty active tab plate. Photorealistic, AAA quality.",
    },
    {
        "name": "09_tab_inactive",
        "prompt": "A single industrial inactive tab — dark gunmetal steel plate — isolated on SOLID PURE BLACK (#000000) background. Wide rectangular plate with chamfered corners on the left side (right side flush) suggesting it's the right half of a tab pair. Approximately 3:1 aspect ratio. Dark gunmetal steel (#2B2B2B) surface with subtle brushed-metal texture and faint scratches. NO orange. NO glow. NO bolts (or just very subtle dark bolts). Looks recessed and muted. NO text. NO icons. Just the empty inactive tab plate. Photorealistic, AAA quality.",
    },
    {
        "name": "10_hex_bolts_pack",
        "prompt": "A sprite sheet of photorealistic industrial HEX BOLTS arranged in a 4x4 grid on a SOLID PURE BLACK (#000000) background. Each bolt is rendered from a top-down view (hexagonal head visible). Mix of sizes — some larger, some smaller, ranging from small rivet-style bolts to large industrial cap bolts. Mix of conditions — some clean dark gunmetal steel, some with rust spots, some with wear/scratches, some with subtle orange-glow highlights. All bolts photorealistic with 3D depth, sharp machined edges, deep ambient occlusion, metallic reflections. Bolts arranged with consistent spacing on the black background so they can be cropped and used individually. NO text. NO labels. Just bolts. AAA quality, 4K.",
    },
]


async def main() -> None:
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        print("ERROR: EMERGENT_LLM_KEY missing"); sys.exit(1)

    out_dir = Path("/app/backend/generated/industrial")
    out_dir.mkdir(parents=True, exist_ok=True)

    image_gen = OpenAIImageGeneration(api_key=api_key)

    for i, a in enumerate(ASSETS, 1):
        out_path = out_dir / f"{a['name']}.png"
        if out_path.exists() and out_path.stat().st_size > 100_000:
            print(f"  [{i:02d}] {a['name']}: skip (already generated)")
            continue
        print(f"→ [{i:02d}/{len(ASSETS)}] Generating '{a['name']}'...")
        try:
            images = await image_gen.generate_images(
                prompt=a["prompt"],
                model="gpt-image-1",
                number_of_images=1,
            )
            if not images:
                print(f"     ✗ No image returned")
                continue
            out_path.write_bytes(images[0])
            print(f"     ✓ {out_path.name} ({out_path.stat().st_size:,} bytes)")
        except Exception as e:
            print(f"     ✗ Failed: {e}")

    print("\nDone. Output:")
    for p in sorted(out_dir.glob("*.png")):
        print(f"  • {p.name} ({p.stat().st_size:,})")


if __name__ == "__main__":
    asyncio.run(main())
