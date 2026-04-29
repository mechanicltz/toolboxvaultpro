"""Generate 5 app icon concepts using Gemini Nano Banana."""
import asyncio
import base64
import os
from pathlib import Path

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()

OUT = Path("/tmp/icons")
OUT.mkdir(parents=True, exist_ok=True)

# 5 distinct concepts. All share: square 1:1 format, app-icon style,
# bright accent yellow #FFB300 from the existing app theme on a dark/black
# background, no text or letters (Apple/Google rejects icons with words),
# clean iconic silhouettes, mobile-app-icon-friendly with 22% safe area.
CONCEPTS = [
    {
        "id": "1_wrench_monogram",
        "name": "Wrench Monogram",
        "prompt": (
            "A premium iOS-style mobile app icon, perfectly square 1:1 with "
            "rounded square shape (squircle), 1024x1024, no text, no letters, "
            "no words. Subject: a single bold modern adjustable wrench rendered "
            "in vibrant yellow #FFB300 on a deep black background with a subtle "
            "dark grey radial gradient. The wrench is rotated 45 degrees, "
            "centered, occupying about 60% of the icon. Clean flat design with "
            "soft drop shadow. Studio quality, professional app store ready."
        ),
    },
    {
        "id": "2_isometric_toolbox",
        "name": "Isometric Toolbox",
        "prompt": (
            "A premium iOS-style mobile app icon, perfectly square 1:1 with "
            "rounded square shape (squircle), 1024x1024, absolutely no text or "
            "letters. Subject: a 3D isometric red metal toolbox slightly open, "
            "with a yellow wrench, a silver hammer, and a screwdriver subtly "
            "peeking out of the top. The toolbox has a chrome handle. "
            "Background is a flat black with a faint yellow glow behind the "
            "toolbox. Modern app-store-grade rendering, bright saturation, "
            "clean shadows."
        ),
    },
    {
        "id": "3_crossed_tools_crest",
        "name": "Crossed Tools Crest",
        "prompt": (
            "A premium iOS-style mobile app icon, perfectly square 1:1, "
            "rounded square (squircle), 1024x1024, no text, no letters. "
            "Subject: an emblem of a wrench crossed over a hammer in an X "
            "shape, both rendered in glossy yellow gold #FFB300, centered on "
            "a deep black background, surrounded by a thin yellow ring. "
            "Workshop crest aesthetic, slight metallic highlights, premium "
            "feel, professional app-store quality."
        ),
    },
    {
        "id": "4_hex_grid_tools",
        "name": "Hex Grid Tools",
        "prompt": (
            "A premium iOS-style mobile app icon, perfectly square 1:1, "
            "rounded square (squircle), 1024x1024, no text, no letters. "
            "Subject: a 2x2 grid of four small minimalist tool silhouettes — "
            "wrench (top-left), hammer (top-right), screwdriver "
            "(bottom-left), drill (bottom-right) — each in bright yellow "
            "#FFB300 inside a soft dark-grey rounded tile, on an overall "
            "black background. Clean, organized inventory aesthetic, modern "
            "flat design."
        ),
    },
    {
        "id": "5_glowing_hex_bolt",
        "name": "Glowing Hex Bolt",
        "prompt": (
            "A premium iOS-style mobile app icon, perfectly square 1:1, "
            "rounded square (squircle), 1024x1024, no text, no letters, no "
            "words at all. Subject: a single large hex bolt head viewed from "
            "the front, rendered in matte gunmetal with a subtle yellow "
            "#FFB300 glowing rim light, centered on pitch black. The "
            "hexagonal silhouette is crisp and recognizable from a distance. "
            "Modern industrial, slight bevel, premium app-icon quality."
        ),
    },
]


async def make_one(concept):
    api_key = os.getenv("EMERGENT_LLM_KEY")
    chat = (
        LlmChat(
            api_key=api_key,
            session_id=f"icon-{concept['id']}",
            system_message="You are a senior mobile app icon designer.",
        )
        .with_model("gemini", "gemini-3.1-flash-image-preview")
        .with_params(modalities=["image", "text"])
    )
    msg = UserMessage(text=concept["prompt"])
    try:
        text, images = await chat.send_message_multimodal_response(msg)
    except Exception as e:
        print(f"  ✗ {concept['name']}: {e}")
        return False
    if not images:
        print(f"  ✗ {concept['name']}: no image returned (text={text[:80]!r})")
        return False
    img_bytes = base64.b64decode(images[0]["data"])
    out = OUT / f"{concept['id']}.png"
    out.write_bytes(img_bytes)
    print(f"  ✓ {concept['name']:24s} → {out} ({len(img_bytes) // 1024} KB)")
    return True


async def main():
    print(f"Generating {len(CONCEPTS)} icons → {OUT}")
    # Run sequentially to avoid hammering the API
    results = []
    for c in CONCEPTS:
        results.append(await make_one(c))
    print(f"\nDone: {sum(results)}/{len(CONCEPTS)} succeeded")


if __name__ == "__main__":
    asyncio.run(main())
