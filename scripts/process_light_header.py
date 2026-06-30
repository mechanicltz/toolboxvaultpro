import urllib.request, os
from PIL import Image
import numpy as np

# User-remade, already-transparent light-theme wordmark.
URL = "https://customer-assets.emergentagent.com/job_a0121ba9-37c3-4fd2-b731-5b968eacf685/artifacts/5aifdk40_light%20header.png"
OUT = "/app/frontend/assets/light-header-logo.png"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

tmp = "/tmp/light_header_src.png"
urllib.request.urlretrieve(URL, tmp)

img = Image.open(tmp).convert("RGBA")
arr = np.array(img)
H, W = arr.shape[:2]

# The asset is already transparent — just trim to the visible logo (+small pad).
a = arr[..., 3]
ys, xs = np.where(a > 16)
y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
pad = 6
y0 = max(0, y0 - pad); x0 = max(0, x0 - pad)
y1 = min(H - 1, y1 + pad); x1 = min(W - 1, x1 + pad)
cropped = img.crop((x0, y0, x1 + 1, y1 + 1))
cropped.save(OUT)
cw, ch = cropped.size
print("saved", OUT, "orig", (W, H), "->", cropped.size, "aspect", round(cw / ch, 4))
