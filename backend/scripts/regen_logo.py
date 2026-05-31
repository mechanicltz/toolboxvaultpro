"""Regenerate ONE combined logo asset matching the user's new screenshot ref:
chamfered-rectangle steel badge with orange OUTER border, 8 hex bolts at the
chamfered corners, and a large 3D crossed hammer+wrench centered inside.
"""
import asyncio, os, sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration

PROMPT = """A single forged industrial logo badge isolated on a SOLID PURE BLACK (#000000) background.

The badge is a chamfered RECTANGLE (8-sided, wider than tall, about 5:4 aspect ratio), filling about 85% of the frame, centered.

OUTER FRAME:
- Heavy bright burnt-orange (#FF6A00) chamfered border around the badge perimeter, about 25-30 pixels thick visually
- Eight (8) photorealistic industrial hex bolts visible — one at each of the 8 chamfered corners (top-left, top-right, top-left-chamfer, top-right-chamfer, bottom-left-chamfer, bottom-right-chamfer, bottom-left, bottom-right). Each bolt is dark metallic with realistic reflections, ambient occlusion.
- Inside the orange frame, an INNER chamfered border (also orange but thinner) ringing the interior surface, with subtle 3D depth/bevel

INTERIOR SURFACE:
- Dark gunmetal brushed steel surface (#1A1A1A to #2B2B2B)
- Visible deep scratches, gouges, machined wear marks, oil smudges, realistic workshop wear
- Subtle vertical brushed-metal texture

EMBLEM (centered, fills ~65% of the interior):
- A 3D PHOTOREALISTIC crossed HAMMER and WRENCH
- Hammer: heavy steel head with claw end facing top-right; handle going from top-left toward bottom-right; rendered in dark forged steel with bright burnt-orange (#FF6A00) edge-light glow along its outline
- Wrench: an open-jaw end facing the TOP-LEFT (showing the jaw opening), closed/round ring end at bottom-right; handle going from top-right toward bottom-left; same dark forged steel with bright orange edge-light glow along its outline
- Both tools cross dramatically in the center
- Deep shadows, hot ambient occlusion, realistic metallic reflections, machined sharp edges
- Both tools should LOOK heavy and industrial — not stylized

NO text. NO logos. NO words. NO additional decoration. NO background details outside the badge — the entire area outside the badge must be SOLID PURE BLACK (#000000) so the badge can be composited cleanly.

Photorealistic, 4K AAA product concept art quality, cinematic lighting, sharp focus."""


async def main():
    image_gen = OpenAIImageGeneration(api_key=os.getenv("EMERGENT_LLM_KEY"))
    print("Generating combined logo badge...")
    images = await image_gen.generate_images(
        prompt=PROMPT, model="gpt-image-1", number_of_images=1
    )
    out = Path("/app/backend/generated/industrial/03_logo_combined.png")
    out.write_bytes(images[0])
    print(f"Saved: {out} ({out.stat().st_size:,} bytes)")

if __name__ == "__main__":
    asyncio.run(main())
