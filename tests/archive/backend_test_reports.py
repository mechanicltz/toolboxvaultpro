"""Backend test for /api/reports changes (brands/tag_ids/dealer_ids, serial col, CSV clean)."""
import os
import sys
import time
import uuid
import base64
from typing import Any, Dict, List, Optional

import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://toolbox-vault-v3.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

EMAIL = "subtest@example.com"
PASSWORD = "password123"

PASS = 0
FAIL = 0
FAILS: List[str] = []
created_tool_ids: List[str] = []
created_dealer_ids: List[str] = []
created_tag_ids: List[str] = []
created_claim_ids: List[str] = []


def ok(cond: bool, label: str, extra: str = ""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✓ {label}")
    else:
        FAIL += 1
        FAILS.append(label + (f" | {extra}" if extra else ""))
        print(f"  ✗ {label} | {extra}")


def login() -> str:
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    r.raise_for_status()
    return r.json()["token"]


def h(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def main():
    print(f"BASE={BASE}")
    print("=== Login ===")
    token = login()
    H = h(token)
    ok(True, "Logged in as subtest@example.com")

    # -------- Step 2: /reports/spec --------
    print("\n=== 2. GET /api/reports/spec ===")
    r = requests.get(f"{API}/reports/spec", headers=H, timeout=15)
    ok(r.status_code == 200, f"spec → 200 (got {r.status_code})", r.text[:200])
    spec_body = r.json() if r.status_code == 200 else {}
    reports = spec_body.get("reports", [])
    inventory = next((s for s in reports if s.get("id") == "inventory"), None)
    claims = next((s for s in reports if s.get("id") == "claims"), None)
    ok(inventory is not None, "inventory spec present")
    ok(claims is not None, "claims spec present")

    if inventory:
        inv_opts = {o.get("id"): o for o in inventory.get("options_schema", [])}
        ok("tag_ids" in inv_opts, "inventory has tag_ids option")
        ok(inv_opts.get("tag_ids", {}).get("type") == "tag_multi", "inventory tag_ids type=tag_multi")
        ok("brands" in inv_opts, "inventory has brands option")
        ok(inv_opts.get("brands", {}).get("type") == "brand_multi", "inventory brands type=brand_multi")
        ok("brand" not in inv_opts, "inventory does NOT have legacy 'brand' text option")

    if claims:
        c_opts = {o.get("id"): o for o in claims.get("options_schema", [])}
        ok("dealer_ids" in c_opts, "claims has dealer_ids option")
        ok(c_opts.get("dealer_ids", {}).get("type") == "dealer_multi", "claims dealer_ids type=dealer_multi")
        ok("dealer_id" not in c_opts, "claims does NOT have legacy 'dealer_id' single option")
        defcols = claims.get("default_columns")
        expected = ["notified_at", "tool_name", "serial", "dealer", "status", "notes"]
        ok(defcols == expected, f"claims default_columns == {expected}", f"got={defcols}")
        col_ids = [c.get("id") for c in claims.get("columns", [])]
        ok("serial" in col_ids, "claims columns include 'serial'")

    # -------- Step 3: filter-options --------
    print("\n=== 3. GET /api/reports/filter-options ===")
    r = requests.get(f"{API}/reports/filter-options", headers=H, timeout=15)
    ok(r.status_code == 200, f"filter-options → 200 (got {r.status_code})", r.text[:200])
    fo = r.json() if r.status_code == 200 else {}
    ok(isinstance(fo.get("brands"), list), "filter-options.brands is list")
    ok(isinstance(fo.get("tags"), list), "filter-options.tags is list")
    brands = fo.get("brands", []) or []
    tags = fo.get("tags", []) or []
    ok(all(isinstance(b, str) for b in brands), "brands entries are strings")
    ok(brands == sorted(brands, key=lambda s: s.lower()),
       "brands sorted case-insensitive")
    ok(len(brands) == len(set(brands)), "brands deduplicated")
    if tags:
        ok(all(isinstance(t, dict) and "id" in t and "name" in t for t in tags),
           "tags entries have id+name")

    # Ensure we have a recognizable brand — create a test tool if needed.
    test_brand_a = f"Snap-on-Test-{uuid.uuid4().hex[:6]}"
    test_brand_b = f"Matco-Test-{uuid.uuid4().hex[:6]}"
    tool_payloads = [
        {"name": "RPT Test Wrench", "brand": test_brand_a, "serial_number": "RPT-S-A-1", "cost": 100},
        {"name": "RPT Test Ratchet", "brand": test_brand_b, "serial_number": "RPT-S-B-1", "cost": 200},
        {"name": "RPT Test Hammer", "brand": "GenericBrandZZZ", "serial_number": "RPT-S-C-1", "cost": 50},
    ]
    print("\n=== 3b. Create 3 prerequisite tools with known brands ===")
    for p in tool_payloads:
        r = requests.post(f"{API}/tools", json=p, headers=H, timeout=15)
        ok(r.status_code == 200, f"created tool {p['name']} brand={p['brand']}", r.text[:200])
        if r.status_code == 200:
            created_tool_ids.append(r.json()["id"])

    # Re-fetch filter-options — should include test_brand_a
    r = requests.get(f"{API}/reports/filter-options", headers=H, timeout=15)
    fo2 = r.json() if r.status_code == 200 else {}
    ok(test_brand_a in (fo2.get("brands") or []), f"filter-options.brands includes {test_brand_a}")

    # -------- Step 4: POST /reports/render inventory --------
    print("\n=== 4a. Inventory render PDF with brands filter ===")
    payload = {
        "report_type": "inventory",
        "format": "pdf",
        "columns": ["name", "brand", "serial"],
        "options": {"brands": [test_brand_a, test_brand_b]},
    }
    r = requests.post(f"{API}/reports/render", json=payload, headers=H, timeout=30)
    ok(r.status_code == 200, f"inventory PDF (brands filter) → 200 (got {r.status_code})", r.text[:200])
    ok(r.headers.get("content-type", "").startswith("application/pdf"),
       f"content-type is application/pdf (got {r.headers.get('content-type')})")
    ok(r.content[:4] == b"%PDF", "response body starts with %PDF magic")

    # Verify by using CSV output (row-level check): only tools with matching brands
    print("\n=== 4a2. Same filter in CSV — verify only matching-brand rows ===")
    payload_csv = {**payload, "format": "csv"}
    r = requests.post(f"{API}/reports/render", json=payload_csv, headers=H, timeout=30)
    ok(r.status_code == 200, f"inventory CSV (brands filter) → 200", r.text[:200])
    text = r.content.decode("utf-8-sig", errors="replace")
    # Parse CSV rows
    import csv as _csv
    import io
    rdr = list(_csv.reader(io.StringIO(text)))
    body_rows = rdr[1:] if rdr else []
    # Drop totals footer if present (last row might be TOTAL)
    body_rows = [row for row in body_rows if not any("TOTAL" in (c or "") for c in row)]
    # Extract brand column — payload had columns=[name, brand, serial], so with index
    # header is ["#", "Name", "Brand", "Serial #"] if >1 row, else ["Name","Brand","Serial #"]
    header = rdr[0] if rdr else []
    try:
        brand_idx = header.index("Brand")
    except ValueError:
        brand_idx = -1
    matching = [row for row in body_rows if brand_idx >= 0 and len(row) > brand_idx and row[brand_idx] in (test_brand_a, test_brand_b)]
    non_matching = [row for row in body_rows if brand_idx >= 0 and len(row) > brand_idx and row[brand_idx] not in (test_brand_a, test_brand_b, "")]
    ok(len(matching) == 2, f"CSV has exactly 2 rows matching our two brands (got {len(matching)})", str(body_rows))
    ok(len(non_matching) == 0, f"CSV has no rows with other brands (got {len(non_matching)})", str(non_matching))

    # -------- 4b. Empty options → all tools --------
    print("\n=== 4b. Inventory render with empty options (all tools CSV) ===")
    payload_all = {
        "report_type": "inventory",
        "format": "csv",
        "columns": ["name", "brand", "serial"],
        "options": {},
    }
    r = requests.post(f"{API}/reports/render", json=payload_all, headers=H, timeout=30)
    ok(r.status_code == 200, "inventory CSV all → 200")
    all_text = r.content.decode("utf-8-sig", errors="replace")
    all_rows = list(_csv.reader(io.StringIO(all_text)))
    all_body = [row for row in all_rows[1:] if not any("TOTAL" in (c or "") for c in row)]
    ok(len(all_body) >= 3, f"CSV all rows count >=3 (got {len(all_body)})")

    # -------- 4c. tag_ids filter --------
    print("\n=== 4c. Inventory render with tag_ids filter ===")
    # Create a tag, assign to first tool via bulk add_tag.
    tag_name = f"ReportTag-{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/tags", json={"name": tag_name}, headers=H, timeout=15)
    ok(r.status_code == 200, "created test tag", r.text[:200])
    tag_id = r.json()["id"] if r.status_code == 200 else None
    if tag_id:
        created_tag_ids.append(tag_id)
        # Assign tag to first test tool
        r = requests.post(
            f"{API}/tools/bulk",
            json={"action": "add_tag", "tool_ids": [created_tool_ids[0]],
                  "tag_id": tag_id, "tag_name": tag_name},
            headers=H, timeout=15,
        )
        ok(r.status_code == 200, "bulk add_tag to tool[0]", r.text[:200])
        # Render with tag_ids
        payload_tag = {
            "report_type": "inventory",
            "format": "csv",
            "columns": ["name", "brand", "serial"],
            "options": {"tag_ids": [tag_id]},
        }
        r = requests.post(f"{API}/reports/render", json=payload_tag, headers=H, timeout=30)
        ok(r.status_code == 200, "inventory CSV (tag_ids) → 200", r.text[:200])
        t_text = r.content.decode("utf-8-sig", errors="replace")
        t_rows = list(_csv.reader(io.StringIO(t_text)))
        t_body = [row for row in t_rows[1:] if not any("TOTAL" in (c or "") for c in row)]
        ok(len(t_body) == 1, f"tag_ids filter returned exactly 1 row (got {len(t_body)})", str(t_body))

    # -------- Step 5: Claims render --------
    print("\n=== 5a. Create 2 dealers for claim tests ===")
    d1 = requests.post(f"{API}/dealers", json={"name": f"RptDealerA-{uuid.uuid4().hex[:4]}"}, headers=H, timeout=15)
    d2 = requests.post(f"{API}/dealers", json={"name": f"RptDealerB-{uuid.uuid4().hex[:4]}"}, headers=H, timeout=15)
    ok(d1.status_code == 200 and d2.status_code == 200, "created 2 dealers")
    dealer_a = d1.json() if d1.status_code == 200 else {}
    dealer_b = d2.json() if d2.status_code == 200 else {}
    if dealer_a.get("id"):
        created_dealer_ids.append(dealer_a["id"])
    if dealer_b.get("id"):
        created_dealer_ids.append(dealer_b["id"])

    # Create 3 tools (one as set) with dealer assignments
    print("\n=== 5b. Create 3 tools for claims (1 as set) ===")
    tool_set_payload = {
        "name": "RPT Set Tool",
        "brand": "BrandX",
        "serial_number": "SET-MAIN-001",
        "is_set": True,
        "set_serials": ["SET-CHILD-A", "SET-CHILD-B", "SET-CHILD-C"],
        "dealer_id": dealer_a.get("id"),
        "dealer_name": dealer_a.get("name"),
    }
    t_set = requests.post(f"{API}/tools", json=tool_set_payload, headers=H, timeout=15)
    ok(t_set.status_code == 200, "created set tool", t_set.text[:200])
    if t_set.status_code == 200:
        created_tool_ids.append(t_set.json()["id"])

    t_reg1 = requests.post(f"{API}/tools", json={
        "name": "RPT Claim Tool A",
        "brand": "BrandY",
        "serial_number": "SN-CLAIM-A",
        "dealer_id": dealer_a.get("id"),
        "dealer_name": dealer_a.get("name"),
    }, headers=H, timeout=15)
    ok(t_reg1.status_code == 200, "created tool for dealer A")
    if t_reg1.status_code == 200:
        created_tool_ids.append(t_reg1.json()["id"])

    t_reg2 = requests.post(f"{API}/tools", json={
        "name": "RPT Claim Tool B",
        "brand": "BrandZ",
        "serial_number": "SN-CLAIM-B",
        "dealer_id": dealer_b.get("id"),
        "dealer_name": dealer_b.get("name"),
    }, headers=H, timeout=15)
    ok(t_reg2.status_code == 200, "created tool for dealer B")
    if t_reg2.status_code == 200:
        created_tool_ids.append(t_reg2.json()["id"])

    # Create warranty claims via the auto-create path (PUT tools with needs_repair=true).
    print("\n=== 5c. Create 3 warranty claims via PUT needs_repair=true ===")

    def mkclaim(tool_obj: dict, notes: str = ""):
        """Flip the tool broken → auto-creates a WarrantyClaim."""
        payload = {
            "needs_repair": True,
            "repair_info": {
                "company_notified": tool_obj.get("dealer_name") or "",
                "notified_at": "2026-03-15",
                "repair_status": "Reported",
                "notes": notes,
            },
        }
        return requests.put(f"{API}/tools/{tool_obj['id']}", json=payload, headers=H, timeout=15)

    r = mkclaim(t_set.json(), "Set tool broken")
    ok(r.status_code == 200, f"PUT needs_repair=true for set tool → {r.status_code}", r.text[:200])

    r = mkclaim(t_reg1.json(), "Tool A awaiting")
    ok(r.status_code == 200, f"PUT needs_repair=true for tool A → {r.status_code}")

    r = mkclaim(t_reg2.json(), "Tool B broken")
    ok(r.status_code == 200, f"PUT needs_repair=true for tool B → {r.status_code}")

    # Fetch the auto-created claims so we can clean them up later.
    r = requests.get(f"{API}/warranty-claims", headers=H, timeout=15)
    if r.status_code == 200:
        auto_claims = [c for c in r.json()
                       if c.get("tool_id") in [t_set.json().get("id"),
                                               t_reg1.json().get("id"),
                                               t_reg2.json().get("id")]]
        for c in auto_claims:
            if c.get("id"):
                created_claim_ids.append(c["id"])
        ok(len(auto_claims) >= 3, f"3 claims auto-created (got {len(auto_claims)})")

    # --- 5d. Render claims with empty dealer_ids → PDF 200 ---
    print("\n=== 5d. Claims render PDF dealer_ids=[] ===")
    payload = {
        "report_type": "claims",
        "format": "pdf",
        "columns": ["notified_at", "tool_name", "serial", "dealer", "status", "notes"],
        "options": {"dealer_ids": [], "claims_mode": "all"},
    }
    r = requests.post(f"{API}/reports/render", json=payload, headers=H, timeout=30)
    ok(r.status_code == 200, f"claims PDF empty dealer_ids → 200 (got {r.status_code})", r.text[:200])
    ok(r.content[:4] == b"%PDF", "claims PDF starts with %PDF")

    # --- 5e. dealer_ids=[dealer_a] only → should only include dealer A ---
    print("\n=== 5e. Claims render CSV dealer_ids=[A] only ===")
    payload = {
        "report_type": "claims",
        "format": "csv",
        "columns": ["notified_at", "tool_name", "serial", "dealer", "status", "notes"],
        "options": {"dealer_ids": [dealer_a.get("id")], "claims_mode": "all"},
    }
    r = requests.post(f"{API}/reports/render", json=payload, headers=H, timeout=30)
    ok(r.status_code == 200, "claims CSV dealer_ids=[A] → 200", r.text[:200])
    txt = r.content.decode("utf-8-sig", errors="replace")
    rows = list(_csv.reader(io.StringIO(txt)))
    body = [row for row in rows[1:] if not any("TOTAL" in (c or "") for c in row)]
    header = rows[0] if rows else []
    # Find dealer column index
    try:
        d_idx = header.index("Dealer")
    except ValueError:
        d_idx = -1
    a_rows = [row for row in body if d_idx >= 0 and len(row) > d_idx and row[d_idx] == dealer_a.get("name")]
    b_rows = [row for row in body if d_idx >= 0 and len(row) > d_idx and row[d_idx] == dealer_b.get("name")]
    ok(len(a_rows) >= 2, f"dealer_ids=[A] returned >=2 rows from A (got {len(a_rows)})")
    ok(len(b_rows) == 0, f"dealer_ids=[A] excluded all dealer B rows (got {len(b_rows)})")

    # --- 5f. Backwards compat: legacy dealer_id single ---
    print("\n=== 5f. Claims render legacy dealer_id=<A> single ===")
    payload = {
        "report_type": "claims",
        "format": "csv",
        "columns": ["notified_at", "tool_name", "serial", "dealer", "status", "notes"],
        "options": {"dealer_id": dealer_a.get("id"), "claims_mode": "all"},
    }
    r = requests.post(f"{API}/reports/render", json=payload, headers=H, timeout=30)
    ok(r.status_code == 200, "claims CSV legacy dealer_id=A → 200", r.text[:200])
    txt = r.content.decode("utf-8-sig", errors="replace")
    rows = list(_csv.reader(io.StringIO(txt)))
    body = [row for row in rows[1:] if not any("TOTAL" in (c or "") for c in row)]
    header = rows[0] if rows else []
    try:
        d_idx = header.index("Dealer")
    except ValueError:
        d_idx = -1
    a_rows = [row for row in body if d_idx >= 0 and len(row) > d_idx and row[d_idx] == dealer_a.get("name")]
    b_rows = [row for row in body if d_idx >= 0 and len(row) > d_idx and row[d_idx] == dealer_b.get("name")]
    ok(len(a_rows) >= 2 and len(b_rows) == 0,
       f"legacy dealer_id filter works (A={len(a_rows)} B={len(b_rows)})")

    # --- 6. CSV claims variant: no pseudo-section-header rows ---
    print("\n=== 6. Claims CSV must not have pseudo section-header rows ===")
    payload = {
        "report_type": "claims",
        "format": "csv",
        "columns": ["notified_at", "tool_name", "serial", "dealer", "status", "notes"],
        "options": {"claims_mode": "all"},
    }
    r = requests.post(f"{API}/reports/render", json=payload, headers=H, timeout=30)
    ok(r.status_code == 200, "claims CSV (all, no dealer filter) → 200")
    txt = r.content.decode("utf-8-sig", errors="replace")
    rows = list(_csv.reader(io.StringIO(txt)))
    header = rows[0] if rows else []
    body = [row for row in rows[1:] if not any("TOTAL" in (c or "") for c in row)]
    # A pseudo-section-header row looks like: first cell is a dealer name and
    # the rest are empty. With our index column, header=[#, Notified, Tool, Serial, Dealer, Status, Notes]
    # Section-header row in CSV would be e.g. ["DealerA", "", "", "", "", "", ""]
    section_like = [
        row for row in body
        if len(row) >= 2 and row[0] and all(not c for c in row[1:])
    ]
    ok(len(section_like) == 0,
       f"CSV has NO pseudo-section-header rows (found {len(section_like)})",
       str(section_like[:3]))
    # Verify set tool rendered serial column properly (multi-line newlines)
    try:
        serial_idx = header.index("Serial #")
    except ValueError:
        serial_idx = -1
    set_related = [row for row in body if len(row) > serial_idx and "SET-CHILD-A" in (row[serial_idx] or "")]
    ok(len(set_related) >= 1, "set-tool claim row contains set serials in Serial column")

    # --- 8. Smoke check ---
    print("\n=== 8. Smoke check endpoints ===")
    for path in ["tools", "dealers", "locations", "tags"]:
        r = requests.get(f"{API}/{path}", headers=H, timeout=15)
        ok(r.status_code == 200, f"GET /api/{path} → 200 (got {r.status_code})")


def cleanup(token: str):
    H = h(token)
    print("\n=== Cleanup ===")
    for cid in created_claim_ids:
        try:
            requests.delete(f"{API}/warranty-claims/{cid}", headers=H, timeout=10)
        except Exception:
            pass
    for tid in created_tool_ids:
        try:
            requests.delete(f"{API}/tools/{tid}", headers=H, timeout=10)
        except Exception:
            pass
    for did in created_dealer_ids:
        try:
            requests.delete(f"{API}/dealers/{did}", headers=H, timeout=10)
        except Exception:
            pass
    for tid in created_tag_ids:
        try:
            requests.delete(f"{API}/tags/{tid}", headers=H, timeout=10)
        except Exception:
            pass
    print(f"Cleanup: {len(created_claim_ids)} claims, {len(created_tool_ids)} tools, "
          f"{len(created_dealer_ids)} dealers, {len(created_tag_ids)} tags deleted")


if __name__ == "__main__":
    token = None
    try:
        main()
    except Exception as e:
        print(f"FATAL: {e}")
        import traceback
        traceback.print_exc()
        FAIL += 1
    finally:
        try:
            if token is None:
                token = login()
            cleanup(token)
        except Exception as e:
            print(f"Cleanup error: {e}")

    print("\n" + "=" * 60)
    print(f"PASSED: {PASS}")
    print(f"FAILED: {FAIL}")
    if FAILS:
        print("\nFailures:")
        for f in FAILS:
            print(f"  - {f}")
    sys.exit(0 if FAIL == 0 else 1)
