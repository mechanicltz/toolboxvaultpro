import urllib.request, os
from PIL import Image
import numpy as np

URL = "https://customer-assets.emergentagent.com/job_a0121ba9-37c3-4fd2-b731-5b968eacf685/artifacts/3s10ddqx_light%20header.png"
OUT = "/app/frontend/assets/light-header-logo.png"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

tmp = "/tmp/light_header_src.png"
urllib.request.urlretrieve(URL, tmp)

img = Image.open(tmp).convert("RGBA")
arr = np.array(img).astype(np.float32)
rgb = arr[..., :3]
H, W = arr.shape[:2]

# Detect background colour from the 4 corners (robust to black OR white bg).
c = 24
corners = np.concatenate([
    rgb[:c, :c].reshape(-1, 3), rgb[:c, -c:].reshape(-1, 3),
    rgb[-c:, :c].reshape(-1, 3), rgb[-c:, -c:].reshape(-1, 3),
])
bg = np.median(corners, axis=0)
print("bg colour:", bg)

# Distance from background -> alpha. Pixels near bg become transparent; ramp
# gives clean anti-aliased text edges.
dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
lo, hi = 40.0, 110.0
alpha = np.clip((dist - lo) / (hi - lo), 0.0, 1.0) * 255.0
arr[..., 3] = alpha
out = Image.fromarray(arr.astype(np.uint8), "RGBA")

# Trim to the non-transparent bounding box (small margin).
a = np.array(out)[..., 3]
ys, xs = np.where(a > 50)
y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
pad = 8
y0 = max(0, y0 - pad); x0 = max(0, x0 - pad)
y1 = min(H - 1, y1 + pad); x1 = min(W - 1, x1 + pad)
cropped = out.crop((x0, y0, x1 + 1, y1 + 1))
cropped.save(OUT)
print("saved", OUT, "orig", (W, H), "->", cropped.size)
