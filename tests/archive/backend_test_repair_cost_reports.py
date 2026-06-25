"""Backend test for repair_cost field + repair_costs / year_end reports."""
import os
import sys
import json
import requests

BASE = "http://localhost:8001/api"
EMAIL = "MechanicLTZ@gmail.com"
PASSWORD = "Blue321!"

results = []
def record(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((name, status, detail))
    print(f"[{status}] {name}{' — ' + detail if detail else ''}")

def fail(msg):
    print("FATAL:", msg)
    sys.exit(1)

# Login
r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
if r.status_code != 200:
    fail(f"login failed {r.status_code} {r.text}")
TOKEN = r.json().get("access_token") or r.json().get("token")
H = {"Authorization": f"Bearer {TOKEN}"}

created_tools = []  # for cleanup

# -------- TEST 1: POST /tools with repair_info.repair_cost --------
rc1_body = {
    "name": "RC1",
    "cost": 50,
    "purchase_date": "2026-01-10",
    "needs_repair": True,
    "repair_info": {
        "company_notified": "Acme",
        "notified_at": "2026-02-01",
        "notes": "test",
        "repair_cost": 42.99,
    },
}
r = requests.post(f"{BASE}/tools", headers=H, json=rc1_body)
if r.status_code != 200:
    fail(f"create RC1 {r.status_code} {r.text}")
rc1 = r.json()
created_tools.append(rc1["id"])
tool_rc = (rc1.get("repair_info") or {}).get("repair_cost")
record("T1a tool.repair_info.repair_cost == 42.99", tool_rc == 42.99, f"got {tool_rc}")

# GET /warranty-claims and find the one for this tool
r = requests.get(f"{BASE}/warranty-claims", headers=H, params={"tool_id": rc1["id"]})
if r.status_code != 200:
    fail(f"list claims {r.status_code} {r.text}")
claims_for_rc1 = r.json()
open_claim = next((c for c in claims_for_rc1 if c.get("claim_status") not in ("completed", "rejected")), None)
if not open_claim:
    record("T1b auto-created claim exists", False, f"claims={claims_for_rc1}")
else:
    record("T1b auto-created claim exists", True, f"id={open_claim['id']}")
    record("T1c claim.repair_cost == 42.99", open_claim.get("repair_cost") == 42.99, f"got {open_claim.get('repair_cost')}")
    record("T1d claim.claim_status == broken", open_claim.get("claim_status") == "broken", f"got {open_claim.get('claim_status')}")

claim1_id = open_claim["id"] if open_claim else None

# -------- TEST 2: PUT /tools/{id} updating repair_cost --------
put_body = {
    "name": "RC1",
    "cost": 50,
    "purchase_date": "2026-01-10",
    "needs_repair": True,
    "repair_info": {
        "company_notified": "Acme",
        "notified_at": "2026-02-01",
        "notes": "test",
        "repair_cost": 99.50,
    },
}
r = requests.put(f"{BASE}/tools/{rc1['id']}", headers=H, json=put_body)
if r.status_code != 200:
    fail(f"put RC1 {r.status_code} {r.text}")
# verify claim updated
r = requests.get(f"{BASE}/warranty-claims", headers=H, params={"tool_id": rc1["id"]})
claims_after = r.json()
open_after = next((c for c in claims_after if c.get("claim_status") not in ("completed", "rejected")), None)
record("T2 claim.repair_cost updated to 99.50 after PUT /tools",
       bool(open_after) and open_after.get("repair_cost") == 99.50,
       f"got {open_after.get('repair_cost') if open_after else 'no open claim'}")

# -------- TEST 3: Create RC2 (no broken_photo), then PUT claim repair_cost --------
rc2_body = {
    "name": "RC2",
    "needs_repair": True,
    "repair_info": {"repair_cost": 0},
}
r = requests.post(f"{BASE}/tools", headers=H, json=rc2_body)
if r.status_code != 200:
    fail(f"create RC2 {r.status_code} {r.text}")
rc2 = r.json()
created_tools.append(rc2["id"])

r = requests.get(f"{BASE}/warranty-claims", headers=H, params={"tool_id": rc2["id"]})
claims_rc2 = r.json()
claim_rc2 = next((c for c in claims_rc2 if c.get("claim_status") not in ("completed", "rejected")), None)
if not claim_rc2:
    record("T3a RC2 auto-claim created", False, f"claims={claims_rc2}")
else:
    record("T3a RC2 auto-claim created", True, f"id={claim_rc2['id']}")
    # PUT warranty-claim with repair_cost
    r = requests.put(f"{BASE}/warranty-claims/{claim_rc2['id']}", headers=H, json={"repair_cost": 25.0})
    if r.status_code != 200:
        record("T3b PUT /warranty-claims returns 200", False, f"{r.status_code} {r.text}")
    else:
        body = r.json()
        record("T3b PUT /warranty-claims returns repair_cost 25.0",
               body.get("repair_cost") == 25.0, f"got {body.get('repair_cost')}")
        # GET tool — verify mirrored
        r = requests.get(f"{BASE}/tools/{rc2['id']}", headers=H)
        tdoc = r.json()
        tool_mirror = (tdoc.get("repair_info") or {}).get("repair_cost")
        record("T3c GET /tools shows mirrored repair_cost 25.0",
               tool_mirror == 25.0, f"got {tool_mirror}")

# -------- TEST 4: GET /reports/spec --------
r = requests.get(f"{BASE}/reports/spec", headers=H)
if r.status_code != 200:
    fail(f"reports/spec {r.status_code} {r.text}")
spec = r.json()
reports_list = spec.get("reports") or []
record("T4a reports length >= 9", len(reports_list) >= 9, f"got {len(reports_list)}")
ids = {rp.get("id") for rp in reports_list}
record("T4b includes 'repair_costs'", "repair_costs" in ids, f"ids={sorted(ids)}")
record("T4c includes 'year_end'", "year_end" in ids)

year_end_spec = next((rp for rp in reports_list if rp.get("id") == "year_end"), None)
if year_end_spec:
    year_opt = next((o for o in (year_end_spec.get("options_schema") or []) if o.get("id") == "year"), None)
    if year_opt:
        choices = year_opt.get("choices") or []
        record("T4d year_end year choices non-empty", len(choices) > 0, f"len={len(choices)}")
        ok_shape = all(isinstance(c, dict) and "id" in c and "label" in c for c in choices)
        record("T4e choices are {id,label} objects", ok_shape)
        default_val = year_opt.get("default")
        record("T4f default non-empty", bool(default_val), f"default={default_val}")
        years_int = [int(c["id"]) for c in choices if str(c["id"]).isdigit()]
        record("T4g years reverse-sorted (newest first)",
               years_int == sorted(years_int, reverse=True),
               f"got {years_int}")
    else:
        record("T4d-g year option present", False)

# -------- TEST 5: POST /reports/render repair_costs CSV --------
r = requests.post(f"{BASE}/reports/render", headers=H,
                  json={"report_type": "repair_costs", "format": "csv"})
record("T5a repair_costs csv 200", r.status_code == 200, f"{r.status_code}")
if r.status_code == 200:
    ct = r.headers.get("content-type", "")
    record("T5b content-type text/csv", "text/csv" in ct, f"got {ct}")
    text = r.content.decode("utf-8-sig", errors="replace")
    record("T5c CSV body contains 'Repair Cost' header", "Repair Cost" in text)
    record("T5d CSV body contains TOTAL row", "TOTAL" in text)

# -------- TEST 6: repair_costs PDF --------
r = requests.post(f"{BASE}/reports/render", headers=H,
                  json={"report_type": "repair_costs", "format": "pdf"})
record("T6a repair_costs pdf 200", r.status_code == 200, f"{r.status_code}")
if r.status_code == 200:
    ct = r.headers.get("content-type", "")
    record("T6b content-type application/pdf", "application/pdf" in ct, f"got {ct}")
    record("T6c bytes > 1000", len(r.content) > 1000, f"len={len(r.content)}")

# -------- TEST 7: year_end CSV with all events --------
r = requests.post(f"{BASE}/reports/render", headers=H, json={
    "report_type": "year_end",
    "format": "csv",
    "options": {
        "year": "2026",
        "include_sold": True,
        "include_lost": True,
        "include_stolen": True,
        "include_repairs": True,
    },
})
record("T7a year_end csv 200", r.status_code == 200, f"{r.status_code} {r.text[:200] if r.status_code != 200 else ''}")
if r.status_code == 200:
    ct = r.headers.get("content-type", "")
    record("T7b content-type text/csv", "text/csv" in ct, f"got {ct}")
    text = r.content.decode("utf-8-sig", errors="replace")
    record("T7c CSV body contains TOTAL row", "TOTAL" in text)
    # Print head for diagnostics
    head = "\n".join(text.splitlines()[:3])
    print("    year_end CSV head:\n   ", head.replace("\n", "\n    "))

# -------- TEST 8: year_end PDF --------
r = requests.post(f"{BASE}/reports/render", headers=H, json={
    "report_type": "year_end", "format": "pdf", "options": {"year": "2026"},
})
record("T8a year_end pdf 200", r.status_code == 200, f"{r.status_code}")
if r.status_code == 200:
    ct = r.headers.get("content-type", "")
    record("T8b content-type application/pdf", "application/pdf" in ct, f"got {ct}")
    record("T8c bytes > 1000", len(r.content) > 1000, f"len={len(r.content)}")

# -------- TEST 9: year_end CSV with all toggles OFF --------
r = requests.post(f"{BASE}/reports/render", headers=H, json={
    "report_type": "year_end",
    "format": "csv",
    "options": {
        "year": "2026",
        "include_sold": False,
        "include_lost": False,
        "include_stolen": False,
        "include_repairs": False,
    },
})
record("T9a year_end csv (all off) 200", r.status_code == 200, f"{r.status_code}")
if r.status_code == 200:
    text = r.content.decode("utf-8-sig", errors="replace")
    # Find the Status column index from header
    lines = text.splitlines()
    header = lines[0] if lines else ""
    # Parse with csv
    import csv as _csv
    reader = list(_csv.reader(lines))
    if reader:
        hdr = reader[0]
        try:
            status_idx = hdr.index("Status")
        except ValueError:
            status_idx = None
        statuses_seen = set()
        if status_idx is not None:
            for row in reader[1:]:
                if not row or row[0] in ("", ) and len(row) > 1 and "TOTAL" in (row[1] if len(row) > 1 else ""):
                    continue
                # skip footer row that contains TOTAL
                if any("TOTAL" in (c or "") for c in row):
                    continue
                if len(row) > status_idx:
                    s = (row[status_idx] or "").strip()
                    if s:
                        statuses_seen.add(s)
        # Should only see Acquired (or empty if no purchase_date in 2026)
        bad = statuses_seen - {"Acquired", ""}
        record("T9b only Acquired rows (no Sold/Lost/Stolen/Repair)",
               len(bad) == 0,
               f"statuses_seen={statuses_seen}")
    else:
        record("T9b CSV parseable", False)

# -------- TEST 10: claims CSV with repair_cost column --------
r = requests.post(f"{BASE}/reports/render", headers=H, json={
    "report_type": "claims",
    "format": "csv",
    "columns": ["notified_at", "tool_name", "serial", "dealer", "status", "notes", "repair_cost"],
})
record("T10a claims csv 200", r.status_code == 200, f"{r.status_code}")
if r.status_code == 200:
    text = r.content.decode("utf-8-sig", errors="replace")
    record("T10b CSV contains 'Repair Cost' column header", "Repair Cost" in text)
    record("T10c CSV contains TOTAL row", "TOTAL" in text)

# -------- TEST 11: Cleanup --------
for tid in created_tools:
    r = requests.delete(f"{BASE}/tools/{tid}", headers=H)
    record(f"T11 DELETE tool {tid[:8]}", r.status_code == 200, f"{r.status_code}")
    # Verify claims cascade
    r = requests.get(f"{BASE}/warranty-claims", headers=H, params={"tool_id": tid})
    if r.status_code == 200:
        remaining = [c for c in r.json() if c.get("tool_id") == tid]
        record(f"T11 cascade-delete claims for {tid[:8]}", len(remaining) == 0, f"remaining={len(remaining)}")

# ---- Summary ----
print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
passes = sum(1 for _, s, _ in results if s == "PASS")
fails = sum(1 for _, s, _ in results if s == "FAIL")
print(f"PASS: {passes}  FAIL: {fails}  TOTAL: {len(results)}")
if fails:
    print("\nFAILED:")
    for n, s, d in results:
        if s == "FAIL":
            print(f"  - {n}: {d}")
sys.exit(0 if fails == 0 else 1)
