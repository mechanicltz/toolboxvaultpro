"""Smoke test for AI Receipt Scanner endpoint POST /api/ai/receipt-scan.

Per review request:
1. Happy path — valid small JPEG base64 → 200 with ReceiptScanResponse shape
2. Empty input — 400 "image_base64 is required"
3. Invalid base64 — 400 "Invalid base64 image" (or 500 with clear msg)
4. Unauthorized — no Authorization header → 401
5. Smoke regression — GET /api/tools, /api/dealers, /api/auth/me → 200
"""
import os
import base64
import io
import sys
import requests

BASE = os.environ.get("BACKEND_URL") or "https://asset-locator-12.preview.emergentagent.com"
API = f"{BASE.rstrip('/')}/api"
EMAIL = "subtest@example.com"
PASSWORD = "password123"

PASS = []
FAIL = []


def check(cond: bool, label: str, detail: str = ""):
    if cond:
        PASS.append(label)
        print(f"  PASS: {label}")
    else:
        FAIL.append(f"{label} | {detail}")
        print(f"  FAIL: {label} | {detail}")


def login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    if r.status_code != 200:
        print(f"FATAL: login {r.status_code} body={r.text[:300]}")
        sys.exit(1)
    return r.json()["token"]


def make_tiny_jpeg_b64() -> str:
    """Return base64 of a real minimal 100x60 JPEG using Pillow."""
    try:
        from PIL import Image  # type: ignore

        img = Image.new("RGB", (100, 60), color=(220, 220, 220))
        # Draw something so the AI has any visual signal (still fine if it returns empty)
        for y in range(60):
            for x in range(100):
                if (x + y) % 12 == 0:
                    img.putpixel((x, y), (40, 40, 40))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=70)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        # Fallback to a minimal valid JPEG byte sequence (1x1 white pixel)
        # This is a known-good minimal JPEG.
        hexdata = (
            "ffd8ffe000104a46494600010100000100010000ffdb0043000806060706050806070707"
            "09090808090b0c0a0b0a0a0a0c110d0d0d0d11181010100c1418181818141818181818181"
            "8181818181818181818181818181818181818181818181818181818181818181818181818"
            "18181818181818181818181818ffc00011080001000103011100021101031101ffc40015"
            "00010100000000000000000000000000000007ffc4001411010000000000000000000000"
            "00000000ffda000c03010002110311003f00b2c0ffd9"
        )
        return base64.b64encode(bytes.fromhex(hexdata)).decode("ascii")


def main():
    print(f"Testing against {API}")
    token = login()
    auth = {"Authorization": f"Bearer {token}"}
    print(f"Logged in as {EMAIL}")

    # ---- Test 4 first (cheap): unauthorized -------------------------------
    print("\n[Test 4] Unauthorized — no Authorization header")
    r = requests.post(f"{API}/ai/receipt-scan", json={"image_base64": "abc"}, timeout=20)
    check(r.status_code == 401, "Test 4: POST /ai/receipt-scan without auth → 401",
          f"got status={r.status_code} body={r.text[:200]}")

    # ---- Test 2: empty input ---------------------------------------------
    print("\n[Test 2] Empty input")
    r = requests.post(f"{API}/ai/receipt-scan", json={"image_base64": ""}, headers=auth, timeout=20)
    check(r.status_code == 400, "Test 2: empty image_base64 → 400",
          f"got status={r.status_code} body={r.text[:200]}")
    if r.status_code == 400:
        try:
            detail = r.json().get("detail", "")
        except Exception:
            detail = ""
        check(detail == "image_base64 is required",
              "Test 2: detail == 'image_base64 is required'",
              f"got detail={detail!r}")

    # ---- Test 3: invalid base64 ------------------------------------------
    print("\n[Test 3] Invalid base64 input")
    r = requests.post(f"{API}/ai/receipt-scan", json={"image_base64": "not-base64!@#"},
                      headers=auth, timeout=60)
    # Acceptable: 400 with "Invalid base64 image" OR 500 with clear base64 decode error
    if r.status_code == 400:
        try:
            detail = r.json().get("detail", "")
        except Exception:
            detail = ""
        check(detail == "Invalid base64 image",
              "Test 3: 400 with detail 'Invalid base64 image'",
              f"got detail={detail!r}")
    elif r.status_code == 500:
        try:
            detail = r.json().get("detail", "")
        except Exception:
            detail = r.text
        # since b64decode validate=False is lenient, this branch may also accept
        # if the AI step then chokes. Accept any 500 with non-empty detail.
        check(bool(detail), "Test 3 (alt): 500 with non-empty detail",
              f"got detail={detail!r}")
        print(f"    note: 500 path accepted per review (detail={detail!r:.200})")
    else:
        check(False, "Test 3: invalid base64 should return 400 or 500",
              f"got status={r.status_code} body={r.text[:200]}")

    # ---- Test 1: happy path ----------------------------------------------
    print("\n[Test 1] Happy path — tiny JPEG base64")
    img_b64 = make_tiny_jpeg_b64()
    print(f"    sending {len(img_b64)} chars of base64 JPEG")
    r = requests.post(f"{API}/ai/receipt-scan", json={"image_base64": img_b64},
                      headers=auth, timeout=120)
    check(r.status_code == 200, "Test 1: POST /ai/receipt-scan → 200",
          f"got status={r.status_code} body={r.text[:400]}")
    if r.status_code == 200:
        try:
            data = r.json()
        except Exception as e:
            data = None
            check(False, "Test 1: response is JSON", f"err={e}")
        if isinstance(data, dict):
            expected_keys = {"name", "brand", "model", "serial_number", "cost",
                             "quantity", "purchase_date", "dealer", "description", "raw"}
            missing = expected_keys - set(data.keys())
            check(not missing,
                  "Test 1: response has all ReceiptScanResponse keys",
                  f"missing={missing} got={list(data.keys())}")
            # Type checks
            check(isinstance(data.get("name"), str), "Test 1: name is str")
            check(isinstance(data.get("brand"), str), "Test 1: brand is str")
            check(isinstance(data.get("model"), str), "Test 1: model is str")
            check(isinstance(data.get("serial_number"), str), "Test 1: serial_number is str")
            check(isinstance(data.get("cost"), (int, float)),
                  "Test 1: cost is numeric (int|float)",
                  f"type={type(data.get('cost')).__name__} val={data.get('cost')!r}")
            check(isinstance(data.get("quantity"), int),
                  "Test 1: quantity is int",
                  f"type={type(data.get('quantity')).__name__} val={data.get('quantity')!r}")
            check(isinstance(data.get("purchase_date"), str), "Test 1: purchase_date is str")
            check(isinstance(data.get("dealer"), str), "Test 1: dealer is str")
            check(isinstance(data.get("description"), str), "Test 1: description is str")
            # raw can be dict or None
            check(data.get("raw") is None or isinstance(data.get("raw"), dict),
                  "Test 1: raw is dict or None")
            print(f"    AI returned: name={data.get('name')!r} cost={data.get('cost')!r} "
                  f"qty={data.get('quantity')!r} dealer={data.get('dealer')!r}")

    # ---- Test 5: smoke regression ----------------------------------------
    print("\n[Test 5] Smoke regression for authenticated GETs")
    for path in ("/tools", "/dealers", "/auth/me"):
        r = requests.get(f"{API}{path}", headers=auth, timeout=30)
        check(r.status_code == 200, f"Test 5: GET {path} → 200",
              f"got {r.status_code} body={r.text[:200]}")

    # ---- Summary ---------------------------------------------------------
    print("\n" + "=" * 70)
    print(f"PASSED: {len(PASS)}    FAILED: {len(FAIL)}")
    if FAIL:
        print("\nFAILURES:")
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)
    print("\nAll smoke checks passed.")


if __name__ == "__main__":
    main()
