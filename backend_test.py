"""Pre-deployment backend QA test for Toolbox Vault.

Comprehensive smoke test of every backend endpoint that the mobile app calls.
Auth uses subtest@example.com / password123 (or registers a fresh user as fallback).
"""
import os
import sys
import time
from typing import Optional, Dict, Any, List

import requests

ENV_PATH = "/app/frontend/.env"
BASE_URL = None
with open(ENV_PATH) as f:
    for line in f:
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
if not BASE_URL:
    BASE_URL = "http://localhost:8001"
API = f"{BASE_URL}/api"
print(f"== Testing backend at {API}")

PASSED: List[str] = []
FAILED: List[Dict[str, Any]] = []


def chk(name: str, cond: bool, detail: str = "") -> bool:
    if cond:
        PASSED.append(name)
        print(f"  PASS  {name}")
    else:
        FAILED.append({"name": name, "detail": detail})
        print(f"  FAIL  {name}: {detail}")
    return cond


def H(token: Optional[str] = None) -> Dict[str, str]:
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def req(method: str, path: str, token: Optional[str] = None, json_body=None,
        params=None, expect=200, label: str = "") -> Optional[requests.Response]:
    url = f"{API}{path}"
    try:
        r = requests.request(method, url, headers=H(token), json=json_body,
                             params=params, timeout=60)
    except Exception as e:
        chk(label or f"{method} {path}", False, f"exception: {e}")
        return None
    ok = r.status_code == expect
    if not ok:
        body = ""
        try:
            body = r.text[:500]
        except Exception:
            pass
        chk(label or f"{method} {path}", False,
            f"expected {expect} got {r.status_code} body={body}")
    else:
        chk(label or f"{method} {path}", True)
    return r


# ============================================================================
# AUTH
# ============================================================================
print("\n-- AUTH --")
LOGIN_EMAIL = "subtest@example.com"
LOGIN_PASS = "password123"

r = requests.post(f"{API}/auth/login", json={"email": LOGIN_EMAIL, "password": LOGIN_PASS}, timeout=30)
TOKEN = None
USER = None
if r.status_code == 200:
    chk("POST /auth/login subtest@example.com", True)
    body = r.json()
    TOKEN = body.get("token")
    USER = body.get("user") or {}
    chk("auth/login returned token", bool(TOKEN))
    chk("auth/login returned user.email", body.get("user", {}).get("email") == LOGIN_EMAIL)
else:
    print(f"  login failed ({r.status_code}); trying fresh registration")
    fresh_email = f"qa_{int(time.time())}@test.com"
    r = requests.post(f"{API}/auth/register",
                      json={"email": fresh_email, "password": "password123", "name": "QA Tester"},
                      timeout=30)
    chk("POST /auth/register fallback", r.status_code == 200,
        f"status={r.status_code} body={r.text[:300]}")
    if r.status_code == 200:
        body = r.json()
        TOKEN = body.get("token")
        USER = body.get("user") or {}
        LOGIN_EMAIL = fresh_email

if not TOKEN:
    print("FATAL: cannot authenticate")
    sys.exit(1)

r = req("GET", "/auth/me", token=TOKEN, label="GET /auth/me")
me = r.json() if r and r.status_code == 200 else {}
chk("auth/me has email", me.get("email") == LOGIN_EMAIL)
chk("auth/me has subscription", "subscription" in me)

r = req("PUT", "/auth/me", token=TOKEN,
        json_body={"name": "QA Tester Updated"}, label="PUT /auth/me name")
if r and r.status_code == 200:
    chk("PUT /auth/me reflects name", r.json().get("name") == "QA Tester Updated")

# Make sure user has premium tier so free-tier limits don't bite during tests
req("POST", "/subscription/subscribe", token=TOKEN,
    json_body={"tier": "lifetime"}, label="POST /subscription/subscribe lifetime")


# ============================================================================
# TAXONOMY (locations / tags / categories)
# ============================================================================
print("\n-- TAXONOMY --")
created_loc = None
created_loc_child = None
created_tag = None
created_cat = None

r = req("POST", "/locations", token=TOKEN,
        json_body={"name": "QA Garage Workbench", "description": "QA test location"},
        label="POST /locations")
if r and r.status_code == 200:
    created_loc = r.json()

r = req("POST", "/locations", token=TOKEN,
        json_body={"name": "QA Drawer 1",
                   "parent_id": created_loc["id"] if created_loc else None},
        label="POST /locations (child)")
if r and r.status_code == 200:
    created_loc_child = r.json()

r = req("GET", "/locations", token=TOKEN, label="GET /locations")
if r and r.status_code == 200:
    chk("GET /locations is list", isinstance(r.json(), list))

r = req("POST", "/tags", token=TOKEN,
        json_body={"name": "QA-Power", "color": "#FF0000"}, label="POST /tags")
if r and r.status_code == 200:
    created_tag = r.json()
req("GET", "/tags", token=TOKEN, label="GET /tags")

r = req("POST", "/categories", token=TOKEN,
        json_body={"name": "QA Hand Tools"}, label="POST /categories")
if r and r.status_code == 200:
    created_cat = r.json()
req("GET", "/categories", token=TOKEN, label="GET /categories")


# ============================================================================
# BORROWERS
# ============================================================================
print("\n-- BORROWERS --")
created_borrower = None
r = req("POST", "/borrowers", token=TOKEN,
        json_body={"name": "QA Borrower Mike", "contact": "mike@qa.test"},
        label="POST /borrowers")
if r and r.status_code == 200:
    created_borrower = r.json()
req("GET", "/borrowers", token=TOKEN, label="GET /borrowers")

if created_borrower:
    r = req("PUT", f"/borrowers/{created_borrower['id']}", token=TOKEN,
            json_body={"name": "QA Borrower Mike Smith", "contact": "mike@qa.test"},
            label="PUT /borrowers/{id}")
    if r and r.status_code == 200:
        chk("borrower name updated", r.json().get("name") == "QA Borrower Mike Smith")


# ============================================================================
# DEALERS + AGENTS
# ============================================================================
print("\n-- DEALERS --")
created_dealer = None
created_agent = None
r = req("POST", "/dealers", token=TOKEN, json_body={
    "name": "QA Tool Dealer Inc.", "phone": "555-1234",
    "website": "https://qadealer.com", "address": "123 QA St",
    "route_frequency": "Weekly", "route_day_of_week": "Tuesday",
}, label="POST /dealers")
if r and r.status_code == 200:
    created_dealer = r.json()

req("GET", "/dealers", token=TOKEN, label="GET /dealers")

if created_dealer:
    req("GET", f"/dealers/{created_dealer['id']}", token=TOKEN, label="GET /dealers/{id}")
    req("PUT", f"/dealers/{created_dealer['id']}", token=TOKEN,
        json_body={"phone": "555-9999"}, label="PUT /dealers/{id}")

    r = req("POST", f"/dealers/{created_dealer['id']}/agents", token=TOKEN,
            json_body={"name": "QA Agent John", "phone": "555-1111", "email": "j@qa.test"},
            label="POST /dealers/{id}/agents")
    if r and r.status_code == 200:
        agents = r.json().get("agents", [])
        if agents:
            created_agent = agents[0]

    if created_agent:
        req("PUT", f"/dealers/{created_dealer['id']}/agents/{created_agent['id']}",
            token=TOKEN, json_body={"name": "QA Agent John Updated", "phone": "555-2222"},
            label="PUT /dealers/{id}/agents/{aid}")

    # Payments via transactions endpoint (account=credit / personal)
    req("POST", f"/dealers/{created_dealer['id']}/transactions", token=TOKEN,
        json_body={"account": "credit", "type": "charge", "amount": 100.0, "note": "QA charge"},
        label="POST /dealers/{id}/transactions credit charge")
    req("POST", f"/dealers/{created_dealer['id']}/transactions", token=TOKEN,
        json_body={"account": "personal", "type": "payment", "amount": 25.0, "note": "QA payment"},
        label="POST /dealers/{id}/transactions personal payment")


# ============================================================================
# TOOLS (CRUD + filters + checkout/checkin + mark-sold + report-lost + bulk)
# ============================================================================
print("\n-- TOOLS --")
created_tool = None
created_tool_b = None  # for bulk

tool_payload = {
    "name": "QA DeWalt Drill",
    "brand": "DeWalt",
    "model": "DCD777",
    "serial_number": "QA-12345",
    "cost": 199.99,
    "quantity": 1,
    "purchase_date": "2025-01-15",
    "condition": "Good",
    "location_id": created_loc["id"] if created_loc else None,
    "location_name": created_loc["name"] if created_loc else "",
    "category_id": created_cat["id"] if created_cat else None,
    "category_name": created_cat["name"] if created_cat else "",
    "tag_ids": [created_tag["id"]] if created_tag else [],
    "tag_names": [created_tag["name"]] if created_tag else [],
    "dealer_id": created_dealer["id"] if created_dealer else None,
    "dealer_name": created_dealer["name"] if created_dealer else "",
}
r = req("POST", "/tools", token=TOKEN, json_body=tool_payload, label="POST /tools")
if r and r.status_code == 200:
    created_tool = r.json()

r = req("POST", "/tools", token=TOKEN,
        json_body={**tool_payload, "name": "QA Bulk Tool B", "serial_number": "QA-67890"},
        label="POST /tools (B)")
if r and r.status_code == 200:
    created_tool_b = r.json()

req("GET", "/tools", token=TOKEN, label="GET /tools (list)")
req("GET", "/tools", token=TOKEN, params={"needs_repair": "true"},
    label="GET /tools?needs_repair=true")
if created_dealer:
    req("GET", "/tools", token=TOKEN, params={"dealer_id": created_dealer["id"]},
        label="GET /tools?dealer_id=…")
req("GET", "/tools", token=TOKEN, params={"checked_out": "true"},
    label="GET /tools?checked_out=true")

if created_tool:
    req("GET", f"/tools/{created_tool['id']}", token=TOKEN, label="GET /tools/{id}")
    req("PUT", f"/tools/{created_tool['id']}", token=TOKEN,
        json_body={"description": "QA test description"}, label="PUT /tools/{id}")

    # Checkout/Checkin
    req("POST", f"/tools/{created_tool['id']}/checkout", token=TOKEN,
        json_body={"borrower_name": "QA Borrower Mike Smith",
                   "borrower_id": created_borrower["id"] if created_borrower else None,
                   "notes": "QA test"},
        label="POST /tools/{id}/checkout")
    req("POST", f"/tools/{created_tool['id']}/checkin", token=TOKEN,
        label="POST /tools/{id}/checkin")

    # Mark sold / unmark sold
    req("POST", f"/tools/{created_tool['id']}/mark-sold", token=TOKEN,
        json_body={"sold_price": 100.0, "sold_to": "QA Buyer", "sold_at": "2026-04-01"},
        label="POST /tools/{id}/mark-sold")
    req("POST", f"/tools/{created_tool['id']}/unmark-sold", token=TOKEN,
        label="POST /tools/{id}/unmark-sold")

    # Report lost + recover
    req("POST", f"/tools/{created_tool['id']}/report-lost", token=TOKEN,
        json_body={"type": "lost", "police_report_number": "QA-PR-1", "reported_by": "QA"},
        label="POST /tools/{id}/report-lost")
    req("POST", f"/tools/{created_tool['id']}/recover", token=TOKEN,
        label="POST /tools/{id}/recover")

# BULK ops
if created_tool and created_tool_b:
    ids = [created_tool["id"], created_tool_b["id"]]
    if created_tag:
        req("POST", "/tools/bulk", token=TOKEN, json_body={
            "tool_ids": ids, "action": "add_tag",
            "tag_id": created_tag["id"], "tag_name": created_tag["name"]},
            label="POST /tools/bulk add_tag")
        req("POST", "/tools/bulk", token=TOKEN, json_body={
            "tool_ids": ids, "action": "remove_tag",
            "tag_id": created_tag["id"], "tag_name": created_tag["name"]},
            label="POST /tools/bulk remove_tag")
    if created_loc:
        req("POST", "/tools/bulk", token=TOKEN, json_body={
            "tool_ids": ids, "action": "move_location",
            "location_id": created_loc["id"], "location_name": created_loc["name"]},
            label="POST /tools/bulk move_location")
    if created_cat:
        req("POST", "/tools/bulk", token=TOKEN, json_body={
            "tool_ids": ids, "action": "set_category",
            "category_id": created_cat["id"], "category_name": created_cat["name"]},
            label="POST /tools/bulk set_category")
    req("POST", "/tools/bulk", token=TOKEN, json_body={
        "tool_ids": ids, "action": "report_lost",
        "lost_payload": {"type": "stolen", "reported_by": "QA"}},
        label="POST /tools/bulk report_lost")


# ============================================================================
# WISHLIST
# ============================================================================
print("\n-- WISHLIST --")
created_wish = None
r = req("POST", "/wishlist", token=TOKEN, json_body={
    "name": "QA Wish Tool", "url": "https://example.com",
    "price": 250.0, "priority": "high",
    "dealer_id": created_dealer["id"] if created_dealer else None,
}, label="POST /wishlist")
if r and r.status_code == 200:
    created_wish = r.json()
req("GET", "/wishlist", token=TOKEN, label="GET /wishlist")
converted_tool = None
if created_wish:
    req("PUT", f"/wishlist/{created_wish['id']}", token=TOKEN,
        json_body={"priority": "normal"}, label="PUT /wishlist/{id}")
    r = req("POST", f"/wishlist/{created_wish['id']}/convert", token=TOKEN,
            label="POST /wishlist/{id}/convert")
    if r and r.status_code == 200:
        converted_tool = r.json()
    req("DELETE", f"/wishlist/{created_wish['id']}", token=TOKEN,
        label="DELETE /wishlist/{id}")


# ============================================================================
# WARRANTY CLAIMS
# ============================================================================
print("\n-- WARRANTY CLAIMS --")
broken_tool = None
broken_payload = {
    **tool_payload, "name": "QA Broken Tool",
    "serial_number": "QA-BROKEN-1",
    "needs_repair": True,
    "repair_info": {
        "repair_status": "Reported",
        "company_notified": "QA Repair Co",
        "contact": "555-0000",
        "notified_at": "2026-04-20",
        "expected_completion": "2026-05-15",
        "notes": "Won't power on",
    },
}
r = req("POST", "/tools", token=TOKEN, json_body=broken_payload, label="POST /tools (broken)")
if r and r.status_code == 200:
    broken_tool = r.json()

req("GET", "/warranty-claims", token=TOKEN, label="GET /warranty-claims")
req("GET", "/warranty-claims", token=TOKEN, params={"archived": "true"},
    label="GET /warranty-claims?archived=true")
if created_dealer:
    req("GET", "/warranty-claims", token=TOKEN, params={"dealer_id": created_dealer["id"]},
        label="GET /warranty-claims?dealer_id=…")
req("GET", "/warranty-claims/summary", token=TOKEN, label="GET /warranty-claims/summary")

created_claim = None
if broken_tool:
    r = req("GET", "/warranty-claims", token=TOKEN, params={"tool_id": broken_tool["id"]},
            label="GET /warranty-claims?tool_id=…")
    if r and r.status_code == 200 and r.json():
        created_claim = r.json()[0]

if created_claim:
    req("GET", f"/warranty-claims/{created_claim['id']}", token=TOKEN,
        label="GET /warranty-claims/{id}")
    req("PUT", f"/warranty-claims/{created_claim['id']}", token=TOKEN,
        json_body={"claim_status": "awaiting_approval"}, label="PUT /warranty-claims/{id}")


# ============================================================================
# MAINTENANCE
# ============================================================================
print("\n-- MAINTENANCE --")
req("GET", "/maintenance/upcoming", token=TOKEN, params={"days": 30},
    label="GET /maintenance/upcoming?days=30")
req("GET", "/maintenance/upcoming", token=TOKEN, params={"days": 60},
    label="GET /maintenance/upcoming?days=60")

if created_tool:
    r = req("POST", f"/tools/{created_tool['id']}/maintenance", token=TOKEN,
            json_body={"type": "Service", "interval_months": 6, "last_done_date": "2026-01-15"},
            label="POST /tools/{id}/maintenance")
    sch_id = None
    if r and r.status_code == 200:
        sched = r.json().get("maintenance") or []
        if sched:
            sch_id = sched[-1]["id"]
    if sch_id:
        req("POST", f"/tools/{created_tool['id']}/maintenance/{sch_id}/service", token=TOKEN,
            json_body={"date": "2026-04-01", "cost": 50.0, "technician": "QA Tech"},
            label="POST /tools/{id}/maintenance/{sch_id}/service (event log)")
        req("DELETE", f"/tools/{created_tool['id']}/maintenance/{sch_id}", token=TOKEN,
            label="DELETE /tools/{id}/maintenance/{sch_id}")


# ============================================================================
# DASHBOARD / AGGREGATE
# ============================================================================
print("\n-- DASHBOARD / AGGREGATE --")
r = req("GET", "/stats", token=TOKEN, label="GET /stats")
if r and r.status_code == 200:
    s = r.json()
    chk("/stats has total_tools", "total_tools" in s)
    chk("/stats has total_value", "total_value" in s)

r = req("GET", "/aggregate", token=TOKEN, label="GET /aggregate")
if r and r.status_code == 200:
    a = r.json()
    chk("/aggregate has count", "count" in a)
    chk("/aggregate has total_value", "total_value" in a)

if created_dealer:
    req("GET", "/aggregate", token=TOKEN, params={"dealer_id": created_dealer["id"]},
        label="GET /aggregate?dealer_id=…")


# ============================================================================
# REPORTS (CRITICAL)
# ============================================================================
print("\n-- REPORTS --")
r = req("GET", "/reports/spec", token=TOKEN, label="GET /reports/spec")
spec_data = None
if r and r.status_code == 200:
    spec_data = r.json()
    reports_list = spec_data.get("reports", [])
    chk("reports/spec has reports[]", isinstance(reports_list, list) and len(reports_list) > 0)
    report_ids = [s.get("id") for s in reports_list]
    print(f"  Available reports: {report_ids}")
    chk("reports has inventory", "inventory" in report_ids)
    chk("reports has account (=dealer)", "account" in report_ids)
    chk("reports has claims (=warranty)", "claims" in report_ids)
    if "maintenance" not in report_ids:
        FAILED.append({"name": "reports has maintenance",
                       "detail": f"No 'maintenance' report id in spec catalog (user expected one). "
                                 f"Found: {report_ids}"})
    else:
        PASSED.append("reports has maintenance")


def is_pdf(content: bytes) -> bool:
    return content[:5] == b"%PDF-"


def is_csv_with_header(content: bytes) -> bool:
    text = content.decode("utf-8-sig", errors="replace")
    return "\n" in text and "," in text


if spec_data:
    for rep in spec_data.get("reports", []):
        rid = rep["id"]
        default_cols = rep.get("default_columns") or []
        all_cols = [c["id"] for c in rep.get("columns", [])]
        url = f"{API}/reports/render"

        # Add account-specific options
        opts = {}
        if rid == "account" and created_dealer:
            opts = {"dealer_ids": [created_dealer["id"]]}

        # PDF default
        try:
            rr = requests.post(url, headers=H(TOKEN), json={
                "report_type": rid, "format": "pdf",
                "columns": default_cols, "options": opts}, timeout=180)
            ct = rr.headers.get("content-type", "")
            ok_status = rr.status_code == 200
            ok_ct = "application/pdf" in ct
            ok_pdf = is_pdf(rr.content) if ok_status else False
            chk(f"POST /reports/render pdf id={rid} default cols",
                ok_status and ok_ct and ok_pdf,
                f"status={rr.status_code} ct={ct} len={len(rr.content)} body0={rr.content[:80]!r}")
        except Exception as e:
            chk(f"POST /reports/render pdf id={rid}", False, f"exception: {e}")

        # CSV default
        try:
            rr = requests.post(url, headers=H(TOKEN), json={
                "report_type": rid, "format": "csv",
                "columns": default_cols, "options": opts}, timeout=60)
            ct = rr.headers.get("content-type", "")
            ok_status = rr.status_code == 200
            ok_ct = "text/csv" in ct
            ok_csv = is_csv_with_header(rr.content) if ok_status else False
            chk(f"POST /reports/render csv id={rid} default cols",
                ok_status and ok_ct and ok_csv,
                f"status={rr.status_code} ct={ct} len={len(rr.content)} body0={rr.content[:80]!r}")
        except Exception as e:
            chk(f"POST /reports/render csv id={rid}", False, f"exception: {e}")

        # Subset of columns (3 cols if possible) — PDF only
        subset = all_cols[:3] if len(all_cols) >= 3 else default_cols
        try:
            rr = requests.post(url, headers=H(TOKEN), json={
                "report_type": rid, "format": "pdf",
                "columns": subset, "options": opts}, timeout=180)
            ok = rr.status_code == 200 and is_pdf(rr.content)
            chk(f"POST /reports/render pdf id={rid} subset cols={subset}", ok,
                f"status={rr.status_code} body0={rr.content[:80]!r}")
        except Exception as e:
            chk(f"POST /reports/render pdf id={rid} subset", False, f"exception: {e}")

# Unknown report type → 400
rr = requests.post(f"{API}/reports/render", headers=H(TOKEN), json={
    "report_type": "nonexistent_xx", "format": "pdf"}, timeout=30)
chk("POST /reports/render unknown report → 400", rr.status_code == 400,
    f"got {rr.status_code}: {rr.text[:200]}")


# ============================================================================
# CLEANUP
# ============================================================================
print("\n-- CLEANUP --")
ids_to_delete = []
if created_tool:
    ids_to_delete.append(created_tool["id"])
if created_tool_b:
    ids_to_delete.append(created_tool_b["id"])
if broken_tool:
    ids_to_delete.append(broken_tool["id"])
if converted_tool:
    ids_to_delete.append(converted_tool["id"])
for tid in ids_to_delete:
    req("DELETE", f"/tools/{tid}", token=TOKEN, label=f"DELETE /tools/{tid[:8]}")

if created_claim:
    req("DELETE", f"/warranty-claims/{created_claim['id']}", token=TOKEN,
        label="DELETE /warranty-claims")
if created_borrower:
    req("DELETE", f"/borrowers/{created_borrower['id']}", token=TOKEN, label="DELETE /borrowers")
if created_dealer:
    if created_agent:
        req("DELETE", f"/dealers/{created_dealer['id']}/agents/{created_agent['id']}",
            token=TOKEN, label="DELETE agent")
    req("DELETE", f"/dealers/{created_dealer['id']}", token=TOKEN, label="DELETE /dealers")
if created_tag:
    req("DELETE", f"/tags/{created_tag['id']}", token=TOKEN, label="DELETE /tags")
if created_cat:
    req("DELETE", f"/categories/{created_cat['id']}", token=TOKEN, label="DELETE /categories")
if created_loc_child:
    req("DELETE", f"/locations/{created_loc_child['id']}", token=TOKEN, label="DELETE child loc")
if created_loc:
    req("DELETE", f"/locations/{created_loc['id']}", token=TOKEN,
        params={"cascade": "true"}, label="DELETE /locations cascade=true")

# Restore subscription to free
req("POST", "/subscription/cancel", token=TOKEN, label="POST /subscription/cancel (restore)")


# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 70)
print(f"PASSED: {len(PASSED)}")
print(f"FAILED: {len(FAILED)}")
if FAILED:
    print("\nFailures:")
    for f in FAILED:
        print(f"  - {f['name']}: {f['detail']}")
print("=" * 70)

sys.exit(0 if not FAILED else 1)
