"""
One-off generator for the "Hardened Riveted Steel — Light" theme assets.
Uses Gemini Nano Banana (gemini-3.1-flash-image-preview) via the Emergent key.

Generates a master panel first, then uses it as a STYLE REFERENCE for the
remaining pieces so the weathered finish / lighting / rivets stay consistent.

Run:  python3 gen_steel.py
Output: /app/frontend/assets/tbv-v3/light-steel/*.png
"""
import asyncio
import os
import base64
import traceback
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv()

API_KEY = os.getenv("EMERGENT_LLM_KEY")
MODEL = "gemini-3.1-flash-image-preview"
OUT = "/app/frontend/assets/tbv-v3/light-steel"
os.makedirs(OUT, exist_ok=True)

# Shared art-direction baked into every prompt.
STYLE = (
    "Material: HARDENED BRUSHED STEEL, light silver tone (#C9CDD2 to #DCE0E4), "
    "with a clearly USED / WEATHERED finish — fine horizontal brush striations, "
    "scattered micro-scratches, light scuffs and swirl marks, faint darker patina "
    "gathering near edges and around rivets, a slightly matte aged sheen. It must look "
    "battle-tested and solid, like a tool that has been around for years — but with "
    "ABSOLUTELY NO rust, no orange corrosion, no dents, no cracks, no holes. "
    "Lighting is a single hard source from the TOP-LEFT: crisp bright specular highlight "
    "on top/left bevel edges, deep hard shadow on bottom/right bevel edges. "
    "Edges are sharp chamfered bevels (not rounded). Rivets are raised gunmetal dome "
    "bolts (#5a5f66) with a tiny top-left highlight and a hard drop shadow. "
    "Photorealistic, ultra sharp, high detail, orthographic top-down view (flat, no perspective), "
    "even studio lighting across the whole piece, isolated UI texture asset."
)

PROMPTS = {
    "panel": (
        "A single rectangular HARDENED RIVETED STEEL plate that FILLS THE ENTIRE IMAGE "
        "edge-to-edge (portrait orientation). A bold chamfered bevel frame runs along all "
        "four outer edges (about 6% of the width thick). One raised gunmetal rivet sits just "
        "inside each of the four corners, plus one rivet centered on the top edge and one on "
        "the bottom edge. The large CENTER is a FLAT EMPTY brushed-steel field with no text, "
        "no icons, no holes — clean enough to lay UI text on top. " + STYLE
    ),
    "bg": (
        "A large flat sheet of weathered brushed steel filling the entire image (portrait), "
        "used as a subtle full-screen app BACKGROUND. NO frame, NO bevel, NO rivets — just an "
        "expansive aged brushed-metal sheet, a touch darker and flatter than a foreground panel "
        "so panels placed on top stand out, with a gentle darkening vignette toward the corners. "
        + STYLE
    ),
    "input": (
        "A wide, short horizontal RECESSED slot / inset trough milled into a brushed steel plate "
        "(landscape bar shape, fills the image edge-to-edge), used as a text INPUT field. The "
        "interior is slightly DARKER and sunken with a thin engraved bevel lip around the opening "
        "so it reads as carved INTO the metal. The sunken center is flat and empty for typed text. "
        "No rivets. " + STYLE
    ),
    "btn_primary": (
        "A wide, short horizontal RAISED push BUTTON made of hardened brushed steel (landscape bar "
        "shape, fills the image edge-to-edge). A bold chamfered bevel makes it look raised and "
        "pressable. A glowing SAFETY-ORANGE (#FF7800) accent rim/edge-light traces the inner border, "
        "and a faint warm orange sheen catches the brushed surface. One small gunmetal rivet just "
        "inside each corner. The face center stays clean and flat for a bold uppercase label. " + STYLE
    ),
    "header": (
        "A wide horizontal riveted steel NAMEPLATE bar (landscape, fills the image edge-to-edge) like "
        "a stamped machine ID plate. Bold chamfered bevel frame; a 2x2 cluster of raised gunmetal "
        "rivets in EACH of the four corners. The center is a FLAT EMPTY brushed-steel field for an "
        "engraved uppercase title to be placed on top — no text in the image itself. " + STYLE
    ),
}


def save_b64_png(b64, path):
    with open(path, "wb") as f:
        f.write(base64.b64decode(b64))


async def gen(name, prompt, ref_b64=None):
    chat = LlmChat(api_key=API_KEY, session_id=f"steel-{name}",
                   system_message="You are an expert game/UI texture artist.")
    chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
    if ref_b64:
        msg = UserMessage(
            text=("Match the EXACT weathered brushed-steel finish, color, lighting direction, "
                  "scratch/scuff texture and rivet style of the reference image. " + prompt),
            file_contents=[ImageContent(ref_b64)],
        )
    else:
        msg = UserMessage(text=prompt)
    _text, images = await chat.send_message_multimodal_response(msg)
    if not images:
        print(f"[FAIL] {name}: no image returned")
        return None
    path = os.path.join(OUT, f"{name}.png")
    save_b64_png(images[0]["data"], path)
    print(f"[OK] {name} -> {path} ({images[0]['mime_type']})")
    return images[0]["data"]


async def main():
    # 1) master panel sets the look
    panel_b64 = await gen("panel", PROMPTS["panel"])
    ref = panel_b64  # style anchor for the rest
    for name in ["bg", "input", "btn_primary", "header"]:
        try:
            await gen(name, PROMPTS[name], ref_b64=ref)
        except Exception:
            print(f"[ERR] {name}")
            traceback.print_exc()
    print("DONE")


if __name__ == "__main__":
    asyncio.run(main())
