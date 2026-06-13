#!/usr/bin/env python3
"""Static asset reference scan for the Toolbox Vault frontend.
Metro requires literal require() paths, so this is reliable for the shipped app."""
import os, re, json
from collections import defaultdict

FRONT = "/app/frontend"
ASSETS = os.path.join(FRONT, "assets")
CODE_DIRS = [os.path.join(FRONT, "app"), os.path.join(FRONT, "src")]
APP_JSON = os.path.join(FRONT, "app.json")

# 1. Collect every referenced asset path (normalized to start at "assets/")
referenced = set()
ref_re = re.compile(r"""require\(\s*['"]([^'"]+)['"]\s*\)""")
str_re = re.compile(r"""['"]([^'"]*assets/[^'"]+\.(?:png|jpg|jpeg|webp|mp4|ttf|otf|gif))['"]""", re.I)

def norm(p):
    i = p.find("assets/")
    return p[i:] if i >= 0 else None

for d in CODE_DIRS:
    for root, _, files in os.walk(d):
        for f in files:
            if not f.endswith((".ts", ".tsx", ".js", ".jsx")):
                continue
            txt = open(os.path.join(root, f), encoding="utf-8", errors="ignore").read()
            for m in ref_re.findall(txt):
                n = norm(m)
                if n:
                    referenced.add(n)
            for m in str_re.findall(txt):
                n = norm(m)
                if n:
                    referenced.add(n)

# app.json
aj = open(APP_JSON, encoding="utf-8").read()
for m in re.findall(r'"\./(assets/[^"]+)"', aj):
    referenced.add(m)

# 2. Walk all asset files
all_assets = {}  # rel -> size
for root, _, files in os.walk(ASSETS):
    for f in files:
        full = os.path.join(root, f)
        rel = os.path.relpath(full, FRONT)  # assets/....
        all_assets[rel] = os.path.getsize(full)

# 3. Unreferenced
unref = {p: s for p, s in all_assets.items() if p not in referenced}

# 4. Group by top-2-level folder
by_folder = defaultdict(lambda: [0, 0])  # folder -> [count, bytes]
unref_by_folder = defaultdict(lambda: [0, 0])
for p, s in all_assets.items():
    parts = p.split("/")
    key = "/".join(parts[:2]) if len(parts) > 2 else "/".join(parts[:2])
    by_folder[key][0] += 1
    by_folder[key][1] += s
for p, s in unref.items():
    parts = p.split("/")
    key = "/".join(parts[:2]) if len(parts) > 2 else "/".join(parts[:2])
    unref_by_folder[key][0] += 1
    unref_by_folder[key][1] += s

def mb(b):
    return f"{b/1024/1024:.2f} MB"

total_assets_bytes = sum(all_assets.values())
total_unref_bytes = sum(unref.values())

print("=" * 70)
print(f"TOTAL assets: {len(all_assets)} files, {mb(total_assets_bytes)}")
print(f"REFERENCED (static): {len(all_assets)-len(unref)} files")
print(f"UNREFERENCED: {len(unref)} files, {mb(total_unref_bytes)}")
print("=" * 70)
print("\nPER TOP-FOLDER (total vs unreferenced):")
for k in sorted(by_folder, key=lambda x: -by_folder[x][1]):
    tc, tb = by_folder[k]
    uc, ub = unref_by_folder.get(k, [0, 0])
    print(f"  {k:40s} total {tc:3d}/{mb(tb):>9s}  | UNREF {uc:3d}/{mb(ub):>9s}")

# Folders that are 100% unreferenced (safe-delete candidates)
print("\nFOLDERS THAT ARE 100% UNREFERENCED (whole-folder delete candidates):")
for k in sorted(by_folder):
    tc, tb = by_folder[k]
    uc, ub = unref_by_folder.get(k, [0, 0])
    if tc == uc and tc > 0:
        print(f"  {k:40s} {uc:3d} files / {mb(ub)}")

# Save full unref list
with open("/app/unreferenced_assets.txt", "w") as out:
    for p, s in sorted(unref.items(), key=lambda x: -x[1]):
        out.write(f"{s:>10d}  {p}\n")
print("\nFull unreferenced list -> /app/unreferenced_assets.txt")
