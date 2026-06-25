"""
Test the include_receipts toggle on PDF reports.

Auth: subtest@example.com / password123
Tests:
1. Spec check — include_receipts in inventory/insurance/sales options_schema
2. Inventory PDF without receipts (regression)
3. Inventory PDF WITH receipts (creates tool with receipt; size > L1)
4. Insurance PDF WITH receipts
5. Sales PDF (listed) WITH receipts
6. Smoke regression: /api/auth/me, /api/tools, /api/dealers
7. Cleanup
"""
import os
import sys
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL")
if not BASE:
    # fallback to frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
                    BASE = line.strip().split("=", 1)[1].strip().strip('"')
                    break
    except Exception:
        pass

assert BASE, "missing backend URL"
API = BASE.rstrip("/") + "/api"

EMAIL = "subtest@example.com"
PASSWORD = "password123"

# 1×1 PNG
PNG_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg=="

PASS = []
FAIL = []


def ok(name):
    PASS.append(name)
    print(f"PASS  {name}")


def bad(name, info=""):
    FAIL.append((name, info))
    print(f"FAIL  {name}  {info}")


def login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def main():
    token = login()
    H = {"Authorization": f"Bearer {token}"}

    # --- TEST 1: Spec check ---
    r = requests.get(f"{API}/reports/spec", headers=H, timeout=30)
    if r.status_code == 200:
        spec = r.json()
        # Find each report
        reports = spec.get("reports") if isinstance(spec, dict) else spec
        # Could be list or dict
        if isinstance(reports, list):
            by_id = {x.get("id"): x for x in reports}
        elif isinstance(reports, dict):
            by_id = reports
        else:
            by_id = {}
        for rid in ("inventory", "insurance", "sales"):
            entry = by_id.get(rid)
            if not entry:
                bad(f"spec.{rid} present"); continue
            sch = entry.get("options_schema") or []
            ir = next((o for o in sch if o.get("id") == "include_receipts"), None)
            if not ir:
                bad(f"spec.{rid}.include_receipts present", str([o.get('id') for o in sch]))
                continue
            if ir.get("type") != "toggle":
                bad(f"spec.{rid}.include_receipts.type=='toggle'", str(ir))
            elif ir.get("default") is not False:
                bad(f"spec.{rid}.include_receipts.default==False", str(ir))
            else:
                ok(f"spec.{rid}.include_receipts toggle default=False")
    else:
        bad("GET /reports/spec 200", f"status={r.status_code}")

    # --- TEST 2: Inventory PDF without receipts ---
    r = requests.post(
        f"{API}/reports/render",
        headers=H,
        json={"report_type": "inventory", "format": "pdf", "options": {}},
        timeout=120,
    )
    L1 = 0
    if r.status_code != 200:
        # try other payload key
        r = requests.post(
            f"{API}/reports/render",
            headers=H,
            json={"report": "inventory", "format": "pdf", "options": {}},
            timeout=120,
        )
    if r.status_code == 200:
        ct = r.headers.get("content-type", "")
        if "application/pdf" not in ct:
            bad("inventory pdf no_receipts content-type", ct)
        elif not r.content.startswith(b"%PDF"):
            bad("inventory pdf no_receipts %PDF magic", r.content[:8].hex())
        else:
            L1 = len(r.content)
            ok(f"inventory pdf no_receipts 200 (L1={L1})")
    else:
        bad("inventory pdf no_receipts 200", f"status={r.status_code} body={r.text[:200]}")

    # --- TEST 3: Create tool with receipts and render WITH include_receipts ---
    created_tool_id = None
    r = requests.post(
        f"{API}/tools",
        headers=H,
        json={
            "name": "ReceiptTest Drill",
            "quantity": 1,
            "cost": 99.99,
            "receipts": [PNG_B64],
        },
        timeout=30,
    )
    if r.status_code != 200:
        bad("create ReceiptTest Drill", f"status={r.status_code} body={r.text[:200]}")
    else:
        body = r.json()
        created_tool_id = body.get("id")
        if not created_tool_id:
            bad("create tool returned id", str(body)[:200])
        else:
            ok(f"created tool id={created_tool_id}")
            # Verify receipts persists
            g = requests.get(f"{API}/tools/{created_tool_id}", headers=H, timeout=30)
            if g.status_code == 200:
                rec = g.json().get("receipts")
                if isinstance(rec, list) and len(rec) == 1:
                    ok("GET /tools/{id} receipts is list of 1")
                else:
                    bad("GET /tools/{id} receipts is list of 1", f"got={type(rec).__name__} len={len(rec) if isinstance(rec, list) else 'N/A'}")
            else:
                bad("GET /tools/{id} 200", f"status={g.status_code}")

    L2 = 0
    if created_tool_id:
        r = requests.post(
            f"{API}/reports/render",
            headers=H,
            json={
                "report_type": "inventory",
                "format": "pdf",
                "options": {"include_receipts": True},
            },
            timeout=120,
        )
        if r.status_code == 200:
            ct = r.headers.get("content-type", "")
            if "application/pdf" not in ct:
                bad("inventory pdf with_receipts content-type", ct)
            elif not r.content.startswith(b"%PDF"):
                bad("inventory pdf with_receipts %PDF magic", r.content[:8].hex())
            else:
                L2 = len(r.content)
                with open("/tmp/inv_with_receipts.pdf", "wb") as f:
                    f.write(r.content)
                # Verify file
                with open("/tmp/inv_with_receipts.pdf", "rb") as f:
                    head = f.read(4)
                if head == b"%PDF":
                    ok(f"inventory pdf with_receipts 200 (L2={L2}, /tmp file %PDF)")
                else:
                    bad("/tmp/inv_with_receipts.pdf magic", head.hex())
                # Compare sizes
                if L1 and L2 > L1:
                    ok(f"L2 > L1 ({L2} > {L1}) — receipts appendix added pages")
                elif L1:
                    bad("L2 > L1", f"L1={L1} L2={L2}")
        else:
            bad("inventory pdf with_receipts 200", f"status={r.status_code} body={r.text[:200]}")

    # --- TEST 4: Insurance PDF with receipts ---
    r = requests.post(
        f"{API}/reports/render",
        headers=H,
        json={
            "report_type": "insurance",
            "format": "pdf",
            "options": {"include_receipts": True, "include_personal": False},
        },
        timeout=120,
    )
    if r.status_code == 200:
        ct = r.headers.get("content-type", "")
        if "application/pdf" not in ct:
            bad("insurance pdf with_receipts content-type", ct)
        elif not r.content.startswith(b"%PDF"):
            bad("insurance pdf with_receipts %PDF magic", r.content[:8].hex())
        else:
            ok(f"insurance pdf with_receipts 200 (size={len(r.content)})")
    else:
        bad("insurance pdf with_receipts 200", f"status={r.status_code} body={r.text[:200]}")

    # --- TEST 5: Mark for sale + sales PDF with receipts ---
    if created_tool_id:
        u = requests.put(
            f"{API}/tools/{created_tool_id}",
            headers=H,
            json={"for_sale": True, "sale_price": 50},
            timeout=30,
        )
        if u.status_code != 200:
            bad("PUT tool for_sale=true", f"status={u.status_code} body={u.text[:200]}")
        else:
            ok("PUT tool for_sale=true sale_price=50")

    r = requests.post(
        f"{API}/reports/render",
        headers=H,
        json={
            "report_type": "sales",
            "format": "pdf",
            "options": {"sales_mode": "listed", "include_receipts": True},
        },
        timeout=120,
    )
    if r.status_code == 200:
        ct = r.headers.get("content-type", "")
        if "application/pdf" not in ct:
            bad("sales pdf listed with_receipts content-type", ct)
        elif not r.content.startswith(b"%PDF"):
            bad("sales pdf listed with_receipts %PDF magic", r.content[:8].hex())
        else:
            ok(f"sales pdf listed with_receipts 200 (size={len(r.content)})")
    else:
        bad("sales pdf listed with_receipts 200", f"status={r.status_code} body={r.text[:200]}")

    # --- TEST 6: Smoke regression ---
    for path in ("/auth/me", "/tools", "/dealers"):
        rr = requests.get(f"{API}{path}", headers=H, timeout=30)
        if rr.status_code == 200:
            ok(f"smoke GET {path} 200")
        else:
            bad(f"smoke GET {path} 200", f"status={rr.status_code}")

    # --- TEST 7: Cleanup ---
    if created_tool_id:
        d = requests.delete(f"{API}/tools/{created_tool_id}", headers=H, timeout=30)
        if d.status_code == 200:
            ok(f"DELETE tool {created_tool_id}")
        else:
            bad(f"DELETE tool {created_tool_id}", f"status={d.status_code}")

    print()
    print(f"PASS: {len(PASS)}    FAIL: {len(FAIL)}")
    if FAIL:
        for n, info in FAIL:
            print(f"  - {n}  {info}")
        sys.exit(1)


if __name__ == "__main__":
    main()
