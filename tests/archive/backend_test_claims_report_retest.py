"""
Retest review request: Claims report multi-dealer (no filter) after KeyError fix.

Steps:
 - Login subtest@example.com / password123
 - Create 2 dealers + 3 tools (one a "set" with 2-3 set_serials) + 3 warranty claims (mix)
 - POST /api/reports/render claims, dealer_ids:[] (PDF) → expect 200 PDF
 - POST /api/reports/render claims, dealer_ids:[] (CSV) → expect 200, no section-header rows
 - Verify set tool's row Serial contains "\n"-joined serials (via internal _fetch_claims)
 - Cleanup
"""
from __future__ import annotations

import os
import sys
import json
import uuid
import asyncio
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://toolbox-vault-v3.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
EMAIL = "subtest@example.com"
PASSWORD = "password123"

ok = 0
fail = 0
failures: list[str] = []


def check(cond, label):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✓ {label}")
    else:
        fail += 1
        failures.append(label)
        print(f"  ✗ {label}")


def login() -> str:
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def main():
    token = login()
    h = {"Authorization": f"Bearer {token}"}
    created_dealer_ids: list[str] = []
    created_tool_ids: list[str] = []
    created_claim_ids: list[str] = []

    try:
        print("\n--- Create 2 dealers ---")
        d1 = requests.post(f"{API}/dealers", json={"name": "Snap-on Retest"}, headers=h, timeout=30)
        check(d1.status_code == 200, f"POST dealer1 → 200 (got {d1.status_code})")
        D1 = d1.json()
        created_dealer_ids.append(D1["id"])

        d2 = requests.post(f"{API}/dealers", json={"name": "Matco Retest"}, headers=h, timeout=30)
        check(d2.status_code == 200, f"POST dealer2 → 200 (got {d2.status_code})")
        D2 = d2.json()
        created_dealer_ids.append(D2["id"])

        print("\n--- Create 3 tools (one is a set) ---")
        # Tool 1: normal, dealer D1
        t1_payload = {
            "name": "Retest Impact Wrench",
            "serial": "SN-RT-001",
            "dealer_id": D1["id"],
            "dealer_name": D1["name"],
            "needs_repair": True,
            "repair_info": {
                "repair_status": "Reported",
                "company_notified": D1["name"],
                "notified_at": "2026-05-01",
                "notes": "Trigger stuck",
            },
        }
        t1 = requests.post(f"{API}/tools", json=t1_payload, headers=h, timeout=30)
        check(t1.status_code == 200, f"POST tool1 (normal) → 200 (got {t1.status_code})")
        T1 = t1.json()
        created_tool_ids.append(T1["id"])

        # Tool 2: SET, dealer D2
        t2_payload = {
            "name": "Retest Socket Set",
            "is_set": True,
            "set_serials": ["SET-RT-A", "SET-RT-B", "SET-RT-C"],
            "dealer_id": D2["id"],
            "dealer_name": D2["name"],
            "needs_repair": True,
            "repair_info": {
                "repair_status": "Reported",
                "company_notified": D2["name"],
                "notified_at": "2026-05-02",
                "notes": "Missing 10mm",
            },
        }
        t2 = requests.post(f"{API}/tools", json=t2_payload, headers=h, timeout=30)
        check(t2.status_code == 200, f"POST tool2 (set) → 200 (got {t2.status_code})")
        T2 = t2.json()
        created_tool_ids.append(T2["id"])
        check(T2.get("is_set") is True and len(T2.get("set_serials") or []) == 3,
              f"tool2 persisted is_set=True + 3 set_serials (got is_set={T2.get('is_set')}, serials={T2.get('set_serials')})")

        # Tool 3: normal, dealer D1 (mix of dealers in claims)
        t3_payload = {
            "name": "Retest Ratchet",
            "serial": "SN-RT-003",
            "dealer_id": D1["id"],
            "dealer_name": D1["name"],
            "needs_repair": True,
            "repair_info": {
                "repair_status": "Reported",
                "company_notified": D1["name"],
                "notified_at": "2026-05-03",
                "notes": "Slipping",
            },
        }
        t3 = requests.post(f"{API}/tools", json=t3_payload, headers=h, timeout=30)
        check(t3.status_code == 200, f"POST tool3 (normal) → 200 (got {t3.status_code})")
        T3 = t3.json()
        created_tool_ids.append(T3["id"])

        # The auto-create-claim-on-needs_repair path should have made 3 claims.
        claims = requests.get(f"{API}/warranty-claims", headers=h, timeout=30).json()
        my_claims = [c for c in claims if c.get("tool_id") in (T1["id"], T2["id"], T3["id"])]
        check(len(my_claims) == 3, f"Auto-created 3 warranty claims for the 3 broken tools (got {len(my_claims)})")
        for c in my_claims:
            created_claim_ids.append(c["id"])

        print("\n--- TEST 2: POST /api/reports/render claims PDF with dealer_ids:[] ---")
        payload_pdf = {
            "report_type": "claims",
            "format": "pdf",
            "options": {
                "claims_mode": "all",
                "dealer_ids": [],
            },
        }
        r_pdf = requests.post(f"{API}/reports/render", json=payload_pdf, headers=h, timeout=60)
        if r_pdf.status_code != 200:
            try:
                err = r_pdf.json()
            except Exception:
                err = r_pdf.text[:400]
            print("   ERROR BODY:", err)
        check(r_pdf.status_code == 200, f"PDF render (multi-dealer, no filter) → 200 (got {r_pdf.status_code}) — was 500 before fix")
        check(r_pdf.headers.get("content-type", "").startswith("application/pdf"),
              f"PDF Content-Type = application/pdf (got {r_pdf.headers.get('content-type')})")
        check(r_pdf.content[:4] == b"%PDF", f"PDF magic bytes present (got {r_pdf.content[:8]!r})")
        check(len(r_pdf.content) > 1000, f"PDF size > 1KB (got {len(r_pdf.content)} bytes)")

        print("\n--- TEST 2b: Also try with dealer_ids omitted entirely ---")
        payload_pdf2 = {
            "report_type": "claims",
            "format": "pdf",
            "options": {
                "claims_mode": "all",
            },
        }
        r_pdf2 = requests.post(f"{API}/reports/render", json=payload_pdf2, headers=h, timeout=60)
        if r_pdf2.status_code != 200:
            try:
                err = r_pdf2.json()
            except Exception:
                err = r_pdf2.text[:400]
            print("   ERROR BODY:", err)
        check(r_pdf2.status_code == 200, f"PDF render (dealer_ids omitted) → 200 (got {r_pdf2.status_code})")

        print("\n--- TEST 3: POST /api/reports/render claims CSV with dealer_ids:[] ---")
        payload_csv = {
            "report_type": "claims",
            "format": "csv",
            "options": {
                "claims_mode": "all",
                "dealer_ids": [],
            },
        }
        r_csv = requests.post(f"{API}/reports/render", json=payload_csv, headers=h, timeout=60)
        check(r_csv.status_code == 200, f"CSV render (multi-dealer, no filter) → 200 (got {r_csv.status_code})")
        check(r_csv.headers.get("content-type", "").startswith("text/csv"),
              f"CSV Content-Type = text/csv (got {r_csv.headers.get('content-type')})")

        # Decode CSV. Strip UTF-8 BOM.
        csv_text = r_csv.content.decode("utf-8-sig")
        csv_lines = [ln for ln in csv_text.splitlines() if ln.strip()]
        print("   CSV lines:", len(csv_lines))
        for ln in csv_lines[:15]:
            print("     ", ln[:220])

        # Column header row — default columns for claims: notified_at, tool_name, serial, dealer, status, notes
        header = csv_lines[0] if csv_lines else ""
        for label in ("Notified", "Tool", "Serial", "Dealer", "Status", "Notes"):
            check(label in header, f"CSV header contains '{label}'")

        # Every real claim row should be in the CSV — find our tool names.
        csv_joined = "\n".join(csv_lines)
        check("Retest Impact Wrench" in csv_joined, "CSV contains 'Retest Impact Wrench' row")
        check("Retest Socket Set" in csv_joined, "CSV contains 'Retest Socket Set' row")
        check("Retest Ratchet" in csv_joined, "CSV contains 'Retest Ratchet' row")
        check("Snap-on Retest" in csv_joined, "CSV contains dealer 'Snap-on Retest'")
        check("Matco Retest" in csv_joined, "CSV contains dealer 'Matco Retest'")

        # No pseudo section-header rows — these would appear as lines where most
        # columns are empty / a single cell holds the dealer name. The render_csv
        # function drops them (rows with `_section_header`). Sanity check: no
        # line should repeat ONLY a dealer name in the dealer column with empty
        # Tool/Status/Notes. We verify a tighter check: count of CSV rows ==
        # header + 3 real data rows + optional TOTAL/footer row (claims report
        # has no money/number columns → no footer expected).
        # Expected: 1 header + 3 data rows = 4 lines (no footer, no section headers)
        data_count = len(csv_lines) - 1
        # We expect exactly 3 data rows — but there may be other historical
        # claims in the DB for this user. So: at least 3, and rowcount is not
        # inflated by 2 section-header rows (which would be the case if section
        # headers leaked into CSV — PDF uses them when >1 dealer group).
        # Check: the 3 tool names each appear on exactly 1 line that ALSO
        # contains the right dealer and "Broken" status — NO line should have
        # the dealer name WITHOUT a tool name / status.
        print(f"   Total CSV data rows: {data_count}")
        section_header_like = 0
        for ln in csv_lines[1:]:
            # A section header row would be: the dealer name in ONE of the cells
            # and every other non-# cell empty. In render_csv, section-header
            # rows are dropped BEFORE building — so they shouldn't exist.
            # Heuristic: line like ',,,Snap-on Retest,,' with the dealer cell
            # occupied but most others empty.
            parts = ln.split(",")
            non_empty = [p.strip().strip('"') for p in parts if p.strip()]
            if (len(non_empty) == 1 and
                non_empty[0] in ("Snap-on Retest", "Matco Retest", "(No dealer)")):
                section_header_like += 1
                print(f"    ⚠ suspicious section-header-like row: {ln!r}")
        check(section_header_like == 0, f"No pseudo section-header rows in CSV (found {section_header_like})")

        print("\n--- TEST 4: Verify set-tool row Serial contains newline-joined serials ---")
        # We can't directly inspect _fetch_claims output via the API (renders to
        # PDF/CSV). But the CSV serial cell for the set tool should contain the
        # newline-joined list. CSV quotes fields that contain newlines.
        # Look for a quoted cell with embedded newlines containing all 3 set
        # serials.
        raw_bytes = r_csv.content  # keep raw (BOM stripped already if using .content)
        raw_text = raw_bytes.decode("utf-8-sig")
        # Naive: the CSV should contain all 3 set serials. If they are newline-
        # joined in the Serial cell, they'll appear inside a quoted field.
        all_three = all(s in raw_text for s in ("SET-RT-A", "SET-RT-B", "SET-RT-C"))
        check(all_three, "CSV contains ALL 3 set serials (SET-RT-A, SET-RT-B, SET-RT-C)")

        # Check newline-joined: the Serial cell for the set tool line should
        # be quoted and contain "\n" between serials. Parse CSV with the stdlib.
        import csv as _csv
        import io as _io
        reader = _csv.reader(_io.StringIO(raw_text))
        header_row = next(reader, [])
        try:
            serial_idx = header_row.index("Serial #")
        except ValueError:
            serial_idx = -1
        set_row_found = False
        nl_joined = False
        for row in reader:
            if len(row) <= serial_idx:
                continue
            # Identify set-tool row by Tool column.
            try:
                tool_idx = header_row.index("Tool")
            except ValueError:
                tool_idx = -1
            tool_val = row[tool_idx] if 0 <= tool_idx < len(row) else ""
            if tool_val == "Retest Socket Set":
                set_row_found = True
                serial_cell = row[serial_idx] if 0 <= serial_idx < len(row) else ""
                print(f"   Set-tool Serial cell: {serial_cell!r}")
                # The cell should contain newline-separated SET-RT-A / -B / -C
                if (
                    "SET-RT-A" in serial_cell
                    and "SET-RT-B" in serial_cell
                    and "SET-RT-C" in serial_cell
                    and "\n" in serial_cell
                ):
                    nl_joined = True
                break
        check(set_row_found, "Set-tool CSV row found by Tool name 'Retest Socket Set'")
        check(nl_joined, "Set-tool Serial cell is '\\n'-joined with all 3 set serials")

        print("\n--- TEST 2 (confirmation): PDF endpoint succeeded (already checked) ---")
        # Already asserted above. Status 200 PDF proves _fetch_claims stats
        # builder handled the set-tool row without the KeyError.

    finally:
        print("\n--- Cleanup ---")
        for cid in created_claim_ids:
            try:
                r = requests.delete(f"{API}/warranty-claims/{cid}", headers=h, timeout=20)
                print(f"  DEL claim {cid[:8]} → {r.status_code}")
            except Exception as e:
                print(f"  DEL claim {cid[:8]} error: {e}")
        for tid in created_tool_ids:
            try:
                r = requests.delete(f"{API}/tools/{tid}", headers=h, timeout=20)
                print(f"  DEL tool  {tid[:8]} → {r.status_code}")
            except Exception as e:
                print(f"  DEL tool  {tid[:8]} error: {e}")
        for did in created_dealer_ids:
            try:
                r = requests.delete(f"{API}/dealers/{did}", headers=h, timeout=20)
                print(f"  DEL dealer{did[:8]} → {r.status_code}")
            except Exception as e:
                print(f"  DEL dealer{did[:8]} error: {e}")

    print(f"\n======  {ok} PASS / {fail} FAIL  ======")
    if failures:
        print("Failures:")
        for f in failures:
            print(f"  - {f}")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
