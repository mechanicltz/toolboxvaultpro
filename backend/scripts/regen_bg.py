"""Regenerate the login screen background to match the user's original
reference image: dark industrial machinery scene with visible gears, layered
metal structures, diamond plate steel, dimensional depth, dark gunmetal tones.
NOT the current flat rusted-metal version.
"""
import asyncio, os, sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration

PROMPT = """A dark industrial workshop scene rendered as a mobile app background. Portrait 9:19.5 aspect ratio.

CRITICAL: NO text, NO logos, NO buttons, NO UI elements, NO panels — this image is ONLY a textured industrial backdrop that other UI will be composited on top of.

SCENE COMPOSITION (multiple layers, photorealistic depth):

LAYER 1 (deep background, very dark):
- Pitch-black industrial workshop interior (#050505)
- Subtle diamond plate steel surface covering the entire frame, slightly visible

LAYER 2 (mid background, machinery silhouettes):
- Large heavy iron GEARS partially visible bleeding off the top-left, top-right, bottom-left, and bottom-right corners — each gear is huge (1/3 of image dimension), with visible gear teeth, photorealistic 3D with deep rust spots, oil smudges, and metallic shine. The gears should be clearly visible as the dominant background element, NOT subtle.
- Heavy mechanical structures and pipes visible in the middle-distance, slightly out of focus — chains, hydraulics, hex-bolted joints, brackets
- Photoreal layered depth with overlapping forms

LAYER 3 (foreground texture, subtle):
- Diamond plate steel stud pattern overlay across the entire image, about 12% opacity, providing fine texture
- Realistic scratches, oil stains, machined imperfections scattered across the surface
- Subtle reflective spots suggesting overhead workshop lighting

LIGHTING:
- Dramatic side-lighting from upper-right giving the metal a 3D forged feel
- Faint burnt-orange (#FF6A00) edge glow reflections in 3-4 spots (NOT everywhere — just suggesting hot metal accents nearby), about 15% intensity
- Heavy ambient occlusion in crevices, machined grooves, and behind machinery

OVERALL FEEL:
- Looks like a Hollywood industrial movie scene — Snap-On factory floor / military fabrication shop / heavy diesel mechanic workshop
- Dark gunmetal palette: #050505 to #2B2B2B base with #FF6A00 accent flashes
- DIMENSIONAL DEPTH is critical — must NOT look like a flat metal sheet
- Photorealistic, 4K cinematic, AAA game environment art quality

ABSOLUTELY NOT:
- NO text characters anywhere
- NO mobile UI elements
- NO buttons or panels
- NO logos or wordmarks
- NO flat plain metal sheet appearance
- NO single-tone rusted texture

The image must feel like LOOKING INTO a dark industrial workshop through your phone screen."""


async def main():
    image_gen = OpenAIImageGeneration(api_key=os.getenv("EMERGENT_LLM_KEY"))
    print("Generating new dramatic industrial background...")
    images = await image_gen.generate_images(
        prompt=PROMPT, model="gpt-image-1", number_of_images=1
    )
    out = Path("/app/backend/generated/tbv_background_dark_v2.png")
    out.write_bytes(images[0])
    print(f"Saved: {out} ({out.stat().st_size:,} bytes)")

if __name__ == "__main__":
    asyncio.run(main())
