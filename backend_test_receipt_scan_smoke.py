"""Smoke test for POST /api/ai/receipt-scan after multi-item ReceiptItem update.

Tests:
1. Happy path — small JPEG → 200 ReceiptScanResponse with items[], raw_text, mirrored top-level fields.
2. Empty input → 400 'image_base64 is required'.
3. Invalid base64 → 400 'Invalid base64 image'.
4. Unauthorized — no Auth header → 401.
5. Smoke regression — GET /api/tools, /api/dealers, /api/auth/me → 200.
"""
import os
import io
import base64
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://asset-locator-12.preview.emergentagent.com"
API = BASE.rstrip("/") + "/api"

EMAIL = "subtest@example.com"
PASSWORD = "password123"

results = []
def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")

def login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]

def make_jpeg_b64() -> str:
    """Generate a small valid JPEG using Pillow."""
    from PIL import Image
    img = Image.new("RGB", (100, 60), (220, 220, 220))
    for x in range(10, 90, 10):
        for y in range(15, 50, 15):
            for dx in range(5):
                for dy in range(2):
                    img.putpixel((x+dx, y+dy), (30, 30, 30))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    return base64.b64encode(buf.getvalue()).decode("ascii")

def main():
    token = login()
    H = {"Authorization": f"Bearer {token}"}

    # TEST 4 — Unauthorized
    r = requests.post(f"{API}/ai/receipt-scan", json={"image_base64": "x"}, timeout=30)
    record("4. Unauthorized (no Auth header) -> 401", r.status_code == 401, f"status={r.status_code}")

    # TEST 2 — Empty input
    r = requests.post(f"{API}/ai/receipt-scan", json={"image_base64": ""}, headers=H, timeout=30)
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text
    record("2. Empty image_base64 -> 400 'image_base64 is required'",
           r.status_code == 400 and detail == "image_base64 is required",
           f"status={r.status_code} detail={detail!r}")

    # TEST 3 — Invalid base64
    r = requests.post(f"{API}/ai/receipt-scan", json={"image_base64": "not-base64!@#"}, headers=H, timeout=30)
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text
    record("3. 'not-base64!@#' -> 400 'Invalid base64 image'",
           r.status_code == 400 and detail == "Invalid base64 image",
           f"status={r.status_code} detail={detail!r}")

    # TEST 1 — Happy path with a real tiny JPEG
    try:
        img_b64 = make_jpeg_b64()
        record("1a. JPEG generated (Pillow)", True, f"len={len(img_b64)} chars")
    except Exception as e:
        record("1a. JPEG generated", False, f"error: {e}")
        return

    r = requests.post(f"{API}/ai/receipt-scan", json={"image_base64": img_b64}, headers=H, timeout=120)
    record("1b. Happy path -> 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code != 200:
        return

    body = r.json()

    # Required keys present
    expected_keys = {
        "dealer", "sold_by", "purchase_date", "raw_text", "items",
        "name", "brand", "model", "serial_number", "cost", "quantity", "description", "raw",
    }
    missing = expected_keys - set(body.keys())
    record("1c. Response has all expected keys (incl. sold_by, items, raw_text)", not missing,
           f"missing={missing}" if missing else f"keys={sorted(body.keys())}")

    # sold_by string
    sb = body.get("sold_by")
    record("1c2. sold_by key present and is str", isinstance(sb, str),
           f"type={type(sb).__name__} value={sb!r}")

    # purchase_date — must be empty OR YYYY-MM-DD
    import re as _re
    pd = body.get("purchase_date") or ""
    pd_ok = pd == "" or bool(_re.match(r"^\d{4}-\d{2}-\d{2}$", pd))
    record("1c3. purchase_date is empty or YYYY-MM-DD ISO", pd_ok,
           f"purchase_date={pd!r}")

    # items: list
    items = body.get("items")
    record("1d. items is a list", isinstance(items, list),
           f"type={type(items).__name__} len={len(items) if isinstance(items,list) else 'N/A'}")

    # items entries shape (if any)
    if isinstance(items, list) and items:
        it0 = items[0]
        item_keys = {"name", "brand", "model", "serial_number", "cost", "quantity", "description"}
        it_missing = item_keys - set(it0.keys())
        record("1e. items[0] has all ReceiptItem fields", not it_missing,
               f"missing={it_missing}" if it_missing else f"item0_keys={sorted(it0.keys())}")
        record("1e2. items[0].cost is numeric", isinstance(it0.get("cost"), (int, float)),
               f"cost={it0.get('cost')!r}")
        record("1e3. items[0].quantity is int", isinstance(it0.get("quantity"), int),
               f"quantity={it0.get('quantity')!r}")
        record("1e4. items[0].name is str", isinstance(it0.get("name"), str), f"name={it0.get('name')!r}")
    else:
        record("1e. items is empty (acceptable for synthetic image)", True, "items=[]")

    # raw_text: string
    rt = body.get("raw_text")
    record("1f. raw_text is a string", isinstance(rt, str),
           f"type={type(rt).__name__} len={len(rt) if isinstance(rt,str) else 'N/A'}")

    # dealer / purchase_date strings
    record("1g. dealer is str", isinstance(body.get("dealer"), str), f"dealer={body.get('dealer')!r}")
    record("1h. purchase_date is str", isinstance(body.get("purchase_date"), str), f"purchase_date={body.get('purchase_date')!r}")

    # Top-level mirror logic
    name = body.get("name"); brand = body.get("brand"); model = body.get("model")
    sn = body.get("serial_number"); cost = body.get("cost"); qty = body.get("quantity"); desc = body.get("description")
    record("1i. top-level name is str", isinstance(name, str), f"name={name!r}")
    record("1j. top-level brand is str", isinstance(brand, str))
    record("1k. top-level model is str", isinstance(model, str))
    record("1l. top-level serial_number is str", isinstance(sn, str))
    record("1m. top-level cost is numeric", isinstance(cost, (int, float)), f"cost={cost!r}")
    record("1n. top-level quantity is int", isinstance(qty, int), f"qty={qty!r}")
    record("1o. top-level description is str", isinstance(desc, str))

    # Mirror correctness
    if isinstance(items, list) and items:
        it0 = items[0]
        mirrors_ok = (
            name == it0.get("name") and brand == it0.get("brand") and model == it0.get("model")
            and sn == it0.get("serial_number") and cost == it0.get("cost")
            and qty == it0.get("quantity") and desc == it0.get("description")
        )
        record("1p. top-level fields mirror items[0]", mirrors_ok,
               f"items[0]={{name:{it0.get('name')!r}, cost:{it0.get('cost')!r}, qty:{it0.get('quantity')!r}}} top={{name:{name!r},cost:{cost!r},qty:{qty!r}}}")
    else:
        # Empty items → top-level should be empty/0 defaults
        empty_ok = (name == "" and brand == "" and model == "" and sn == "" and (cost == 0 or cost == 0.0) and qty == 1 and desc == "")
        record("1p. top-level empty/0 when items=[] (default ReceiptItem mirror)",
               empty_ok,
               f"name={name!r} brand={brand!r} sn={sn!r} cost={cost!r} qty={qty!r}")

    # raw: dict or None
    raw = body.get("raw")
    record("1q. raw is dict or None", raw is None or isinstance(raw, dict), f"type={type(raw).__name__}")

    # TEST 5 — Smoke regression
    r = requests.get(f"{API}/tools", headers=H, timeout=30)
    record("5a. GET /api/tools -> 200", r.status_code == 200, f"status={r.status_code}")
    r = requests.get(f"{API}/dealers", headers=H, timeout=30)
    record("5b. GET /api/dealers -> 200", r.status_code == 200, f"status={r.status_code}")
    r = requests.get(f"{API}/auth/me", headers=H, timeout=30)
    record("5c. GET /api/auth/me -> 200", r.status_code == 200, f"status={r.status_code}")

if __name__ == "__main__":
    try:
        main()
    finally:
        passed = sum(1 for _, ok, _ in results if ok)
        total = len(results)
        print(f"\n{'='*60}\n{passed}/{total} checks PASS, {total-passed} FAIL\n{'='*60}")
        for n, ok, d in results:
            if not ok:
                print(f"FAIL: {n}  {d}")
