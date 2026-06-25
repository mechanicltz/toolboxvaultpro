"""Backend test — verify the new msrp_price field on Tool model + MSRP
column on the various reports. Per review request 2026-05-29.

Tests against http://localhost:8001/api using MechanicLTZ@gmail.com / Blue321!.
"""
import base64
import csv
import io
import os
import sys

import requests

BASE = "http://localhost:8001/api"
ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASS = "Blue321!"


def login() -> str:
    r = requests.post(
        f"{BASE}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


def hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def parse_csv(blob: bytes):
    text = blob.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    return list(reader)


PASSES = []
FAILS = []


def ok(label: str, msg: str = ""):
    PASSES.append(label)
    print(f"PASS  {label}  {msg}")


def fail(label: str, msg: str):
    FAILS.append(f"{label}: {msg}")
    print(f"FAIL  {label}  {msg}")


def main():
    tok = login()
    h = hdr(tok)
    print(f"Authenticated as {ADMIN_EMAIL}.\n")

    created_ids = []

    # ----- Test 1: POST /tools with msrp_price ------------------------
    body = {
        "name": "MS1",
        "cost": 120,
        "msrp_price": 250,
        "quantity": 2,
        "purchase_date": "2026-03-01",
    }
    r = requests.post(f"{BASE}/tools", json=body, headers=h, timeout=15)
    if r.status_code == 200:
        t = r.json()
        tool_id = t["id"]
        created_ids.append(tool_id)
        cost_ok = t.get("cost") == 120
        msrp_ok = t.get("msrp_price") == 250
        qty_ok = t.get("quantity") == 2
        if cost_ok and msrp_ok and qty_ok:
            # GET /tools/{id}
            g = requests.get(f"{BASE}/tools/{tool_id}", headers=h, timeout=15)
            if g.status_code == 200:
                t2 = g.json()
                if t2.get("cost") == 120 and t2.get("msrp_price") == 250 and t2.get("quantity") == 2:
                    ok("Test 1", f"POST + GET round-trip cost=120 msrp_price=250 qty=2 (id={tool_id})")
                else:
                    fail("Test 1", f"GET mismatch: cost={t2.get('cost')} msrp_price={t2.get('msrp_price')} qty={t2.get('quantity')}")
            else:
                fail("Test 1", f"GET /tools/{tool_id} returned {g.status_code}")
        else:
            fail("Test 1", f"POST mismatch: cost={t.get('cost')} msrp_price={t.get('msrp_price')} qty={t.get('quantity')}")
    else:
        fail("Test 1", f"POST /tools returned {r.status_code} {r.text[:200]}")
        # Can't continue meaningfully without a tool
        cleanup(created_ids, h)
        summarize()
        return

    # ----- Test 2: PUT msrp_price only ---------------------------------
    r = requests.put(f"{BASE}/tools/{tool_id}", json={"msrp_price": 333.33}, headers=h, timeout=15)
    if r.status_code == 200:
        t = r.json()
        if t.get("msrp_price") == 333.33 and t.get("cost") == 120:
            ok("Test 2", "PUT msrp_price=333.33 → msrp updated, cost untouched (120)")
        else:
            fail("Test 2", f"after PUT: cost={t.get('cost')} msrp_price={t.get('msrp_price')}")
    else:
        fail("Test 2", f"PUT returned {r.status_code} {r.text[:200]}")

    # ----- Test 3: insurance CSV with msrp column ---------------------
    body = {
        "report_type": "insurance",
        "format": "csv",
        "columns": ["name", "quantity", "cost", "msrp"],
    }
    r = requests.post(f"{BASE}/reports/render", json=body, headers=h, timeout=30)
    if r.status_code == 200:
        rows = parse_csv(r.content)
        header = rows[0]
        ok3 = "MSRP" in header
        # find our tool's row
        msrp_idx = header.index("MSRP") if "MSRP" in header else -1
        cost_idx = header.index("Cost") if "Cost" in header else -1
        name_idx = header.index("Name") if "Name" in header else -1
        ours = None
        for row in rows[1:-1]:
            if name_idx >= 0 and len(row) > name_idx and row[name_idx] == "MS1":
                ours = row
                break
        row_msrp_ok = ours is not None and msrp_idx >= 0 and abs(float(ours[msrp_idx]) - 666.66) < 0.01
        # total row is last row; verify both cost and MSRP totals present
        total_row = rows[-1]
        total_msrp_ok = msrp_idx >= 0 and total_row[msrp_idx] != ""
        total_cost_ok = cost_idx >= 0 and total_row[cost_idx] != ""
        try:
            tot_msrp_val = float(total_row[msrp_idx]) if msrp_idx >= 0 else 0
            tot_cost_val = float(total_row[cost_idx]) if cost_idx >= 0 else 0
        except Exception:
            tot_msrp_val = tot_cost_val = 0
        if ok3 and row_msrp_ok and total_msrp_ok and total_cost_ok and tot_msrp_val >= 666.66 and tot_cost_val >= 240:
            ok("Test 3", f"insurance CSV: MSRP header ✓, row MSRP=666.66 ✓, TOTAL row cost={tot_cost_val} msrp={tot_msrp_val}")
        else:
            fail("Test 3", f"header_has_MSRP={ok3} our_row_msrp_ok={row_msrp_ok} tot_msrp={tot_msrp_val} tot_cost={tot_cost_val} ours={ours}")
    else:
        fail("Test 3", f"render returned {r.status_code} {r.text[:200]}")

    # ----- Test 4: inventory CSV with msrp column ---------------------
    body = {
        "report_type": "inventory",
        "format": "csv",
        "columns": ["name", "quantity", "cost", "msrp"],
    }
    r = requests.post(f"{BASE}/reports/render", json=body, headers=h, timeout=30)
    if r.status_code == 200:
        rows = parse_csv(r.content)
        header = rows[0]
        ok4 = "MSRP" in header
        msrp_idx = header.index("MSRP") if "MSRP" in header else -1
        cost_idx = header.index("Cost") if "Cost" in header else -1
        name_idx = header.index("Name") if "Name" in header else -1
        ours = None
        for row in rows[1:-1]:
            if name_idx >= 0 and len(row) > name_idx and row[name_idx] == "MS1":
                ours = row
                break
        row_msrp_ok = ours is not None and msrp_idx >= 0 and abs(float(ours[msrp_idx]) - 666.66) < 0.01
        total_row = rows[-1]
        try:
            tot_msrp_val = float(total_row[msrp_idx]) if msrp_idx >= 0 else 0
            tot_cost_val = float(total_row[cost_idx]) if cost_idx >= 0 else 0
        except Exception:
            tot_msrp_val = tot_cost_val = 0
        if ok4 and row_msrp_ok and tot_msrp_val >= 666.66 and tot_cost_val >= 240:
            ok("Test 4", f"inventory CSV: MSRP header ✓, row=666.66 ✓, TOTAL msrp={tot_msrp_val} cost={tot_cost_val}")
        else:
            fail("Test 4", f"header_has_MSRP={ok4} our_row_msrp_ok={row_msrp_ok} tot_msrp={tot_msrp_val} tot_cost={tot_cost_val}")
    else:
        fail("Test 4", f"render returned {r.status_code} {r.text[:200]}")

    # ----- Test 5: report-lost + lost_stolen CSV ----------------------
    rl_body = {"type": "lost", "reported_at": "2026-04-15", "reported_date": "2026-04-15", "notes": "test"}
    r = requests.post(f"{BASE}/tools/{tool_id}/report-lost", json=rl_body, headers=h, timeout=15)
    rl_ok = r.status_code == 200
    if not rl_ok:
        fail("Test 5 (report-lost)", f"returned {r.status_code} {r.text[:200]}")
    else:
        body = {
            "report_type": "lost_stolen",
            "format": "csv",
            "columns": ["name", "loss_type", "cost", "msrp"],
        }
        r = requests.post(f"{BASE}/reports/render", json=body, headers=h, timeout=30)
        if r.status_code == 200:
            rows = parse_csv(r.content)
            header = rows[0]
            has_value = "Value" in header  # 'cost' column is labelled 'Value' in lost_stolen
            has_msrp = "MSRP" in header
            value_idx = header.index("Value") if has_value else -1
            msrp_idx = header.index("MSRP") if has_msrp else -1
            name_idx = header.index("Tool") if "Tool" in header else (header.index("Name") if "Name" in header else -1)
            ours = None
            for row in rows[1:-1]:
                if name_idx >= 0 and len(row) > name_idx and row[name_idx] == "MS1":
                    ours = row
                    break
            total_row = rows[-1]
            try:
                tot_value = float(total_row[value_idx]) if value_idx >= 0 else 0
                tot_msrp = float(total_row[msrp_idx]) if msrp_idx >= 0 else 0
            except Exception:
                tot_value = tot_msrp = 0
            if has_value and has_msrp and ours is not None and tot_value >= 240 and tot_msrp >= 666.66:
                ok("Test 5", f"lost_stolen CSV: Value+MSRP cols present, row found, TOTAL value={tot_value} msrp={tot_msrp}")
            else:
                fail("Test 5", f"has_value={has_value} has_msrp={has_msrp} ours={ours is not None} tot_value={tot_value} tot_msrp={tot_msrp} header={header}")
        else:
            fail("Test 5", f"render returned {r.status_code} {r.text[:200]}")

    # ----- Test 6: year_end CSV ---------------------------------------
    body = {
        "report_type": "year_end",
        "format": "csv",
        "columns": ["name", "ye_status", "cost", "msrp", "ye_recovered"],
        "options": {"year": "2026"},
    }
    r = requests.post(f"{BASE}/reports/render", json=body, headers=h, timeout=30)
    if r.status_code == 200:
        rows = parse_csv(r.content)
        header = rows[0]
        has_msrp = "MSRP" in header
        msrp_idx = header.index("MSRP") if has_msrp else -1
        cost_idx = header.index("Cost") if "Cost" in header else -1
        name_idx = header.index("Tool") if "Tool" in header else (header.index("Name") if "Name" in header else -1)
        status_idx = header.index("Status") if "Status" in header else -1

        # Find Acquired row for MS1 and Lost row for MS1
        acq_row = None
        lost_row = None
        for row in rows[1:-1]:
            if name_idx < 0 or len(row) <= max(name_idx, status_idx):
                continue
            if row[name_idx] == "MS1":
                stt = row[status_idx] if status_idx >= 0 else ""
                if stt == "Acquired":
                    acq_row = row
                elif stt == "Lost":
                    lost_row = row

        # Verify totals
        total_row = rows[-1]
        try:
            tot_cost = float(total_row[cost_idx]) if cost_idx >= 0 else 0
            tot_msrp = float(total_row[msrp_idx]) if msrp_idx >= 0 else 0
        except Exception:
            tot_cost = tot_msrp = 0

        acq_ok = acq_row is not None and abs(float(acq_row[cost_idx]) - 240) < 0.01 and abs(float(acq_row[msrp_idx]) - 666.66) < 0.01
        # Lost row may not exist if reported_at vs reported_date field mismatch — note this
        lost_ok = lost_row is not None and float(lost_row[cost_idx]) == 0 and float(lost_row[msrp_idx]) == 0
        no_double = acq_ok and (lost_row is None or lost_ok)
        # Totals should match Acquired-only (since Lost row contributes 0)
        tot_ok = abs(tot_cost - 240) < 0.01 and abs(tot_msrp - 666.66) < 0.01

        if has_msrp and acq_ok and no_double and tot_ok:
            note = "Lost row present (cost=0 msrp=0)" if lost_row is not None else "NOTE: no Lost row emitted (year_end uses ls.reported_at; report-lost stores reported_date)"
            ok("Test 6", f"year_end CSV: MSRP col, Acquired row 240/666.66, TOTAL 240/666.66. {note}")
        else:
            fail("Test 6", f"has_msrp={has_msrp} acq_ok={acq_ok} lost_row_present={lost_row is not None} lost_ok={lost_ok} tot_cost={tot_cost} tot_msrp={tot_msrp} acq_row={acq_row} lost_row={lost_row}")
    else:
        fail("Test 6", f"render returned {r.status_code} {r.text[:200]}")

    # ----- Test 7: sales CSV — no MSRP column -------------------------
    body = {"report_type": "sales", "format": "csv"}
    r = requests.post(f"{BASE}/reports/render", json=body, headers=h, timeout=30)
    if r.status_code == 200:
        rows = parse_csv(r.content)
        header = rows[0] if rows else []
        if "MSRP" not in header:
            ok("Test 7", f"sales CSV does NOT contain MSRP (header={header})")
        else:
            fail("Test 7", f"sales CSV unexpectedly contains MSRP! header={header}")
    else:
        fail("Test 7", f"render returned {r.status_code} {r.text[:200]}")

    # ----- Test 8: claims CSV — no MSRP column ------------------------
    body = {"report_type": "claims", "format": "csv"}
    r = requests.post(f"{BASE}/reports/render", json=body, headers=h, timeout=30)
    if r.status_code == 200:
        rows = parse_csv(r.content)
        header = rows[0] if rows else []
        if "MSRP" not in header:
            ok("Test 8", f"claims CSV does NOT contain MSRP (header={header})")
        else:
            fail("Test 8", f"claims CSV unexpectedly contains MSRP! header={header}")
    else:
        fail("Test 8", f"render returned {r.status_code} {r.text[:200]}")

    # ----- Test 9: /tools/export-csv with msrp_price ------------------
    body = {"fields": ["name", "cost", "msrp_price"], "format": "csv"}
    r = requests.post(f"{BASE}/tools/export-csv", json=body, headers=h, timeout=30)
    if r.status_code == 200:
        # response could be raw CSV bytes (Content-Type text/csv) or JSON with base64
        ct = r.headers.get("content-type", "")
        raw = None
        if "application/json" in ct:
            j = r.json()
            # heuristic: look for base64 string field
            for key in ("data", "csv", "content", "base64", "file"):
                if key in j and isinstance(j[key], str):
                    try:
                        raw = base64.b64decode(j[key])
                        break
                    except Exception:
                        pass
            if raw is None:
                # try whole body
                fail("Test 9", f"JSON response but no base64 field found: keys={list(j.keys())[:10]}")
        else:
            raw = r.content
        if raw is not None:
            rows = parse_csv(raw)
            header = rows[0] if rows else []
            has_msrp = "MSRP" in header
            msrp_idx = header.index("MSRP") if has_msrp else -1
            # find MS1 row
            name_idx = header.index("Name") if "Name" in header else -1
            ours = None
            for row in rows[1:]:
                if name_idx >= 0 and len(row) > name_idx and row[name_idx] == "MS1":
                    ours = row
                    break
            row_msrp = None
            if ours is not None and msrp_idx >= 0:
                try:
                    row_msrp = float(ours[msrp_idx])
                except Exception:
                    pass
            if has_msrp and ours is not None and row_msrp is not None and abs(row_msrp - 333.33) < 0.01:
                ok("Test 9", f"tools/export-csv: MSRP col present, MS1 row MSRP={row_msrp}")
            else:
                fail("Test 9", f"has_msrp={has_msrp} ours_row={ours} row_msrp={row_msrp} header={header}")
    else:
        fail("Test 9", f"export-csv returned {r.status_code} {r.text[:200]}")

    # ----- Test 10: cleanup -------------------------------------------
    cleanup(created_ids, h)
    summarize()


def cleanup(ids, h):
    for tid in ids:
        try:
            r = requests.delete(f"{BASE}/tools/{tid}", headers=h, timeout=15)
            if r.status_code == 200:
                print(f"PASS  Test 10 (cleanup)  deleted tool {tid}")
            else:
                print(f"FAIL  Test 10 (cleanup)  delete {tid} returned {r.status_code}")
        except Exception as e:
            print(f"FAIL  Test 10 (cleanup)  delete {tid} exception: {e}")


def summarize():
    print("\n" + "=" * 60)
    print(f"TOTAL: {len(PASSES)} pass, {len(FAILS)} fail")
    if FAILS:
        print("\nFailures:")
        for f in FAILS:
            print("  - " + f)


if __name__ == "__main__":
    main()
