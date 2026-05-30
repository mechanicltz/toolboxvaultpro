"""Regenerate just the panel-frame texture with stricter prompting + a
properly portrait aspect ratio + transparent background flag (if supported).
"""
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration  # noqa: E402


PROMPT = """A single industrial steel maintenance-door BORDER FRAME with chamfered corners, isolated on a SOLID PURE BLACK (#000000) background. The frame is a hollow rectangular border ONLY — like a picture frame made of dark steel. The INTERIOR of the frame must be completely empty pure black so it can be filled with other UI elements.

Critical constraints (DO NOT VIOLATE):
- The frame is a BORDER only, around 60-70 pixels thick visually
- The entire INTERIOR of the rectangle (the area enclosed by the border) MUST be completely empty solid pure black — NO panel, NO door, NO surface, NO texture, NO ANYTHING inside the rectangle. Just black void.
- Background OUTSIDE the frame is also solid pure black (#000000)
- The frame itself: dark brushed steel with chamfered (clipped at 45 degrees) corners, slight 3D depth, realistic wear scratches, machined imperfections
- SIX visible industrial hex bolts on the frame itself: 4 at the chamfered corners + 2 at the midpoints of the long vertical sides
- Each bolt has realistic metallic reflections, shadows, ambient occlusion
- Portrait aspect ratio (taller than wide), frame fills about 92% of the image

NO orange accents — just dark gunmetal steel and bolts. NO text. NO ICONS. NO ADDITIONAL PANEL INSIDE.

The result should look like a HOLLOW PICTURE FRAME made of industrial steel — you can see straight through the middle to pure black void.

Quality: AAA photorealistic, 4K product concept art, ultra-detailed bevels and ambient occlusion on the frame border."""


async def main() -> None:
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        print("ERROR: EMERGENT_LLM_KEY missing"); sys.exit(1)

    out_dir = Path("/app/backend/generated/textures")
    out_dir.mkdir(parents=True, exist_ok=True)

    image_gen = OpenAIImageGeneration(api_key=api_key)
    print("→ Regenerating panel-frame...")
    images = await image_gen.generate_images(
        prompt=PROMPT,
        model="gpt-image-1",
        number_of_images=1,
    )
    if not images:
        print("ERROR: No image returned")
        sys.exit(1)
    out_path = out_dir / "panel-frame-v2.png"
    out_path.write_bytes(images[0])
    print(f"✓ Saved: {out_path} ({out_path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    asyncio.run(main())
