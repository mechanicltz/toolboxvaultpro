"""One-off: generate UI panel background/frame textures via Gemini Nano Banana.
Saves PNGs into frontend/assets/images/panels/. Temporary showcase asset gen.
"""
import asyncio
import os
import base64
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()

OUT = "/app/frontend/assets/images/panels"
MODEL = "gemini-3.1-flash-image-preview"
API_KEY = os.getenv("EMERGENT_LLM_KEY")

PANELS = {
    "riveted_steel": "Industrial brushed steel metal plate panel with a thick raised metal border and large round hex rivets and bolts evenly placed along all four edges and in the corners, brushed gunmetal surface, smooth flat empty center area, subtle scratches and wear, dramatic even top-down studio lighting, photorealistic, perfectly square, a UI frame asset with empty middle",
    "carbon_fiber": "Seamless real woven carbon fiber texture, glossy clear-coat, fine diagonal twill weave, dark charcoal black with a subtle deep blue sheen, thin red kevlar stitching accent running near the edges, flat top-down view, even lighting, premium automotive material, perfectly square",
    "black_marble_gold": "Luxurious polished black marble slab with elegant thin gold veins running through it, high gloss reflective finish, extremely expensive Fortune 500 executive material, subtle soft reflection, flat top-down lay, even soft studio lighting, perfectly square, ultra premium",
    "futuristic_hud": "Dark futuristic sci-fi UI panel surface, matte black with glowing cyan and electric blue circuit traces and a subtle hexagonal grid, soft neon glow concentrated near the edges, high-tech HUD aesthetic, the center is darker and flatter for text readability, flat top-down view, perfectly square",
    "brushed_titanium": "Brushed titanium gunmetal metal surface, fine horizontal grain, cool silver-grey with a subtle anodized rainbow sheen, machined precision aerospace finish, flat top-down view, even lighting, premium material, perfectly square",
    "walnut_brass": "Rich dark walnut wood panel framed by a polished brass metal border with brass corner brackets and small screws, luxury executive desktop material, warm even lighting, flat empty wood grain center, top-down photorealistic view, perfectly square, expensive premium",
    "concrete_industrial": "Polished industrial concrete slab surface, smooth cement grey with subtle aggregate speckle and faint form lines, modern minimalist architectural material, flat top-down view, even soft lighting, perfectly square",
    "holographic_glass": "Iridescent holographic frosted glass panel, soft pastel rainbow sheen over a dark translucent surface, futuristic premium material, subtle reflections and light refraction, flat top-down view, even lighting, perfectly square",
    "diamond_plate": "Aluminum diamond tread checker plate metal, raised diamond and lozenge non-slip pattern, brushed silver metal with subtle wear and grime, rugged durable industrial surface, flat top-down view, even lighting, perfectly square",
}


async def gen_one(name: str, prompt: str):
    try:
        chat = LlmChat(api_key=API_KEY, session_id=f"panel-{name}",
                       system_message="You are a precise product texture generator.")
        chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
        msg = UserMessage(text=prompt + " No text, no words, no logos. High resolution, sharp detail.")
        _text, images = await chat.send_message_multimodal_response(msg)
        if images:
            img_bytes = base64.b64decode(images[0]["data"])
            path = os.path.join(OUT, f"{name}.png")
            # Gemini often returns JPEG bytes — re-encode to a REAL PNG so the
            # native iOS asset loader doesn't crash ("Exception in HostFunction").
            try:
                import io
                from PIL import Image
                Image.open(io.BytesIO(img_bytes)).convert("RGB").save(path, "PNG")
            except Exception:
                with open(path, "wb") as f:
                    f.write(img_bytes)
            print(f"OK  {name}  ({len(img_bytes)} bytes)")
        else:
            print(f"ERR {name}  no image returned")
    except Exception as e:
        print(f"ERR {name}  {e}")


async def main():
    for name, prompt in PANELS.items():
        await gen_one(name, prompt)
    print("DONE")


if __name__ == "__main__":
    asyncio.run(main())
