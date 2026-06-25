#!/usr/bin/env python3
"""
Backend test — multi-line set_serials fix across reports.
Verifies that when a tool has is_set=True and set_serials=[...], the Serial
column in all reports (inventory, insurance, sales, claims, ...) contains
the set's serials joined by '\n' newline characters.
"""
import csv
import io
import os
import sys
from typing import Any, Dict, List, Optional

import requests

FRONTEND_ENV = "/app/frontend/.env"


def read_backend_url() -> str:
    with open(FRONTEND_ENV, "r") as f:
        for line in f:
            if line.strip().startswith("EXPO_PUBLIC_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found")


BASE = read_backend_url().rstrip("/") + "/api"
print(f"[env] BASE={BASE}")

EMAIL = "subtest@example.com"
PASSWORD = "password123"

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})

PASS = 0
FAIL = 0
FAILED: List[str] = []


def _check(label: str, cond: bool, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        FAILED.append(f"{label} — {detail}")
        print(f"  FAIL  {label} :: {detail}")


def login() -> str:
    r = session.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json()["token"]
    session.headers["Authorization"] = f"Bearer {tok}"
    return tok


def render_csv(report_type: str, columns: List[str], options: Optional[Dict] = None) -> List[List[str]]:
    payload = {
        "report_type": report_type,
        "format": "csv",
        "columns": columns,
        "options": options or {},
    }
    r = session.post(f"{BASE}/reports/render", json=payload)
    assert r.status_code == 200, f"render {report_type} failed: {r.status_code} {r.text[:400]}"
    # Decode CSV (utf-8-sig to strip BOM)
    text = r.content.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    return [row for row in reader]


def find_row_by_name(rows: List[List[str]], name: str, name_col: int) -> Optional[List[str]]:
    for r in rows[1:]:
        if len(r) > name_col and r[name_col] == name:
            return r
    return None


def main() -> int:
    print("\n=== 1. LOGIN ===")
    login()
    _check("login 200 + token", bool(session.headers.get("Authorization")))

    print("\n=== 2. SMOKE — /reports/spec + /reports/filter-options ===")
    r = session.get(f"{BASE}/reports/spec")
    _check("GET /reports/spec 200", r.status_code == 200, f"status={r.status_code}")
    specs = (r.json() or {}).get("reports") or []
    spec_ids = {s.get("id") for s in specs}
    _check("spec contains inventory/insurance/sales/claims",
           {"inventory", "insurance", "sales", "claims"}.issubset(spec_ids),
           f"got={spec_ids}")
    r = session.get(f"{BASE}/reports/filter-options")
    _check("GET /reports/filter-options 200", r.status_code == 200,
           f"status={r.status_code}")

    print("\n=== 3. SETUP — create 1 regular tool + 1 set tool ===")
    # 3a. Regular tool
    hammer_payload = {
        "name": "ZZZ Set-Serial Test Hammer",
        "serial_number": "HM-001",
        "is_set": False,
        "brand": "TestBrand",
        "cost": 25.0,
        "quantity": 1,
    }
    r = session.post(f"{BASE}/tools", json=hammer_payload)
    assert r.status_code == 200, f"create hammer failed: {r.status_code} {r.text}"
    hammer = r.json()
    tool_id_1 = hammer["id"]
    _check("POST /tools (hammer) 200 with id", bool(tool_id_1))
    _check("hammer.serial_number == HM-001", hammer.get("serial_number") == "HM-001",
           f"got={hammer.get('serial_number')}")

    # 3b. Need a dealer to later attach to the set (for claim test)
    r = session.post(f"{BASE}/dealers", json={"name": "ZZZ Set-Serial Test Dealer"})
    # Might fail on free tier if there's already a dealer; check.
    dealer_id = None
    if r.status_code == 200:
        dealer = r.json()
        dealer_id = dealer.get("id")
        dealer_name = dealer.get("name")
        _check("POST /dealers (test dealer) 200", bool(dealer_id))
    elif r.status_code == 402:
        # Pick an existing dealer
        d_r = session.get(f"{BASE}/dealers")
        existing = d_r.json() or []
        if existing:
            dealer_id = existing[0].get("id")
            dealer_name = existing[0].get("name")
            _check("fallback to existing dealer", bool(dealer_id),
                   f"using existing dealer {dealer_name}")
        else:
            _check("dealer setup", False, "402 free-tier AND no existing dealers")
    else:
        _check("POST /dealers 200 or 402", False,
               f"status={r.status_code} body={r.text[:200]}")

    # 3c. Set tool — with needs_repair=True + dealer, so a warranty claim is auto-created
    wrench_payload = {
        "name": "ZZZ Set-Serial Test Wrench Set",
        "is_set": True,
        "set_serials": ["WS-A", "WS-B", "WS-C"],
        "serial_number": "",
        "brand": "TestBrand",
        "cost": 80.0,
        "quantity": 1,
        "dealer_id": dealer_id,
        "dealer_name": dealer_name if dealer_id else "",
        "needs_repair": True,
        "repair_info": {
            "repair_status": "Reported",
            "company_notified": "Test Repair Co",
            "notified_at": "2026-04-01",
            "contact": "555-1234",
            "notes": "set is broken",
            "broken_photo": "",
        },
    }
    r = session.post(f"{BASE}/tools", json=wrench_payload)
    assert r.status_code == 200, f"create wrench set failed: {r.status_code} {r.text}"
    wrench = r.json()
    tool_id_2 = wrench["id"]
    _check("POST /tools (wrench set) 200 with id", bool(tool_id_2))
    _check("wrench.is_set == True", wrench.get("is_set") is True,
           f"got={wrench.get('is_set')}")
    _check("wrench.set_serials == [WS-A,WS-B,WS-C]",
           wrench.get("set_serials") == ["WS-A", "WS-B", "WS-C"],
           f"got={wrench.get('set_serials')}")

    # Collect all created ids so we always clean up
    created_claim_id = None

    try:
        # ------------------------------------------------------------------
        print("\n=== 4. INVENTORY report — CSV ===")
        rows = render_csv(
            "inventory",
            columns=["name", "serial"],
            options={},
        )
        # header: ['#', 'Name', 'Serial #'] if show_idx, else ['Name', 'Serial #']
        header = rows[0] if rows else []
        has_idx = header and header[0] == "#"
        name_col = 1 if has_idx else 0
        serial_col = 2 if has_idx else 1
        _check("inventory CSV has header + at least 2 rows", len(rows) >= 3,
               f"got {len(rows)} rows")

        hammer_row = find_row_by_name(rows, hammer_payload["name"], name_col)
        _check("inventory contains Hammer row", hammer_row is not None,
               f"rows={[r[name_col] if len(r)>name_col else '' for r in rows[1:8]]}")
        if hammer_row:
            _check("inventory hammer serial == 'HM-001'",
                   hammer_row[serial_col] == "HM-001",
                   f"got={hammer_row[serial_col]!r}")

        wrench_row = find_row_by_name(rows, wrench_payload["name"], name_col)
        _check("inventory contains Wrench Set row", wrench_row is not None)
        if wrench_row:
            cell = wrench_row[serial_col]
            _check("inventory wrench-set serial contains newline \\n",
                   "\n" in cell,
                   f"got={cell!r}")
            _check("inventory wrench-set serial == 'WS-A\\nWS-B\\nWS-C'",
                   cell == "WS-A\nWS-B\nWS-C",
                   f"got={cell!r}")

        # ------------------------------------------------------------------
        print("\n=== 5. INSURANCE report — CSV ===")
        rows = render_csv(
            "insurance",
            columns=["name", "serial"],
            options={"include_personal": False},
        )
        header = rows[0] if rows else []
        has_idx = header and header[0] == "#"
        name_col = 1 if has_idx else 0
        serial_col = 2 if has_idx else 1
        hammer_row = find_row_by_name(rows, hammer_payload["name"], name_col)
        _check("insurance contains Hammer row", hammer_row is not None)
        if hammer_row:
            _check("insurance hammer serial == 'HM-001'",
                   hammer_row[serial_col] == "HM-001",
                   f"got={hammer_row[serial_col]!r}")
        wrench_row = find_row_by_name(rows, wrench_payload["name"], name_col)
        _check("insurance contains Wrench Set row", wrench_row is not None)
        if wrench_row:
            cell = wrench_row[serial_col]
            _check("insurance wrench-set serial contains newline \\n",
                   "\n" in cell,
                   f"got={cell!r}")
            _check("insurance wrench-set serial == 'WS-A\\nWS-B\\nWS-C'",
                   cell == "WS-A\nWS-B\nWS-C",
                   f"got={cell!r}")

        # ------------------------------------------------------------------
        print("\n=== 6. CLAIMS report — CSV (regression) ===")
        # The wrench was created with needs_repair=True which auto-creates a claim.
        # Verify via GET /warranty-claims?tool_id=<wrench>
        r = session.get(f"{BASE}/warranty-claims", params={"tool_id": tool_id_2})
        claims = r.json() if r.status_code == 200 else []
        _check(f"GET /warranty-claims?tool_id={tool_id_2[:8]} returns >=1",
               isinstance(claims, list) and len(claims) >= 1,
               f"status={r.status_code} claims count={len(claims) if isinstance(claims, list) else 'n/a'}")
        if claims:
            created_claim_id = claims[0].get("id")

        rows = render_csv(
            "claims",
            columns=["notified_at", "tool_name", "serial", "dealer", "status", "notes"],
            options={"claims_mode": "all"},
        )
        header = rows[0] if rows else []
        # header format: ['#', 'Notified', 'Tool', 'Serial #', 'Dealer', 'Status', 'Notes']
        print(f"    claims CSV header: {header}")
        _check("claims CSV header present", len(header) > 0)
        has_idx = header and header[0] == "#"
        # Find tool_name col and serial col
        try:
            tool_col = header.index("Tool")
            serial_col = header.index("Serial #")
        except ValueError:
            tool_col = 2 if has_idx else 1
            serial_col = 3 if has_idx else 2

        claim_row = find_row_by_name(rows, wrench_payload["name"], tool_col)
        _check("claims report contains Wrench Set claim row", claim_row is not None,
               f"tool_col={tool_col} rows={[r[tool_col] if len(r)>tool_col else '' for r in rows[1:10]]}")
        if claim_row:
            cell = claim_row[serial_col]
            _check("claims wrench-set serial contains newline \\n",
                   "\n" in cell,
                   f"got={cell!r}")
            _check("claims wrench-set serial == 'WS-A\\nWS-B\\nWS-C'",
                   cell == "WS-A\nWS-B\nWS-C",
                   f"got={cell!r}")

        # ------------------------------------------------------------------
        print("\n=== 7. SALES report — mark hammer sold + CSV ===")
        # Free tier: this endpoint doesn't have a tier restriction; should be ok.
        r = session.post(
            f"{BASE}/tools/{tool_id_1}/mark-sold",
            json={"sold_price": 30.0, "sold_to": "Test Buyer", "sold_at": "2026-04-15"},
        )
        if r.status_code == 200:
            _check("POST /tools/{hammer}/mark-sold 200", True)
            rows = render_csv(
                "sales",
                columns=["name", "serial"],
                options={"sales_mode": "sold"},
            )
            header = rows[0] if rows else []
            has_idx = header and header[0] == "#"
            name_col = 1 if has_idx else 0
            serial_col = 2 if has_idx else 1
            hammer_row = find_row_by_name(rows, hammer_payload["name"], name_col)
            _check("sales(sold) contains hammer row", hammer_row is not None)
            if hammer_row:
                _check("sales hammer serial == 'HM-001'",
                       hammer_row[serial_col] == "HM-001",
                       f"got={hammer_row[serial_col]!r}")
        else:
            _check("sales skipped — mark-sold failed",
                   False,
                   f"status={r.status_code} body={r.text[:200]}")

    finally:
        # ------------------------------------------------------------------
        print("\n=== 8. CLEANUP ===")
        # Delete claim (if one was auto-created)
        if created_claim_id:
            r = session.delete(f"{BASE}/warranty-claims/{created_claim_id}")
            print(f"  DELETE claim {created_claim_id[:8]}... status={r.status_code}")

        # Delete tools (unmark sold first for hammer if needed)
        # Unmark sold so we can delete
        session.post(f"{BASE}/tools/{tool_id_1}/unmark-sold")
        r = session.delete(f"{BASE}/tools/{tool_id_1}")
        print(f"  DELETE tool hammer {tool_id_1[:8]}... status={r.status_code}")
        r = session.delete(f"{BASE}/tools/{tool_id_2}")
        print(f"  DELETE tool wrench {tool_id_2[:8]}... status={r.status_code}")

        # Delete the dealer only if we created it (name starts with ZZZ)
        if dealer_id:
            d_r = session.get(f"{BASE}/dealers/{dealer_id}")
            if d_r.status_code == 200 and (d_r.json() or {}).get("name", "").startswith("ZZZ"):
                r = session.delete(f"{BASE}/dealers/{dealer_id}")
                print(f"  DELETE dealer {dealer_id[:8]}... status={r.status_code}")
            else:
                print(f"  (not deleting pre-existing dealer {dealer_id[:8]})")

    print(f"\n\n========== RESULT: {PASS} PASS / {FAIL} FAIL ==========")
    if FAILED:
        print("Failures:")
        for f in FAILED:
            print(f"  - {f}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
