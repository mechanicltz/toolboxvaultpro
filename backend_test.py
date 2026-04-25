"""
Backend test for Warranty Claims feature.

Tests end-to-end flow per review request:
  - Auto-creation of warranty_claim from tool needs_repair=true
  - Mirror updates to the claim while tool is still broken
  - Status transitions (broken -> awaiting_approval -> waiting_replacement -> completed)
  - Mapping to tool.repair_info.repair_status (Reported / Awaiting Parts)
  - Archiving (completed/rejected) and reopening
  - Mark Repaired auto-closes claim
  - Tool with no dealer -> _none_ bucket
  - Filters: dealer_id, archived, status
  - Validation: invalid claim_status -> 400
  - Regression: tools/dealers/locations and aggregate/stats counts
  - Cleanup of all created resources

Targets EXPO_PUBLIC_BACKEND_URL/api from /app/frontend/.env.
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from typing import Any, Dict, List, Optional

import requests


def _read_backend_url() -> str:
    p = "/app/frontend/.env"
    with open(p, "r") as f:
        for line in f:
            line = line.strip()
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                v = line.split("=", 1)[1].strip().strip('"').strip("'")
                return v
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env")


BASE_URL = _read_backend_url().rstrip("/") + "/api"
print(f"[INFO] BASE URL: {BASE_URL}")

PASS = 0
FAIL = 0
FAIL_DETAILS: List[str] = []


def _record(ok: bool, label: str, detail: str = ""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  [PASS] {label}")
    else:
        FAIL += 1
        msg = f"  [FAIL] {label}: {detail}"
        print(msg)
        FAIL_DETAILS.append(msg)


def _expect(cond: bool, label: str, detail: str = ""):
    _record(cond, label, detail)
    return cond


def _req(method: str, path: str, **kwargs) -> requests.Response:
    url = f"{BASE_URL}{path}"
    return requests.request(method, url, timeout=30, **kwargs)


# ---------- Trackers for cleanup ----------
created_dealer_ids: List[str] = []
created_tool_ids: List[str] = []
created_claim_ids: List[str] = []


def cleanup():
    print("\n[CLEANUP] removing test fixtures...")
    for cid in list(created_claim_ids):
        try:
            _req("DELETE", f"/warranty-claims/{cid}")
        except Exception:
            pass
    for tid in list(created_tool_ids):
        try:
            _req("DELETE", f"/tools/{tid}")
        except Exception:
            pass
    for did in list(created_dealer_ids):
        try:
            _req("DELETE", f"/dealers/{did}")
        except Exception:
            pass
    # Also remove any dangling claims for our test tool ids
    try:
        r = _req("GET", "/warranty-claims")
        if r.ok:
            for c in r.json():
                if c.get("tool_id") in created_tool_ids:
                    try:
                        _req("DELETE", f"/warranty-claims/{c['id']}")
                    except Exception:
                        pass
    except Exception:
        pass
    print("[CLEANUP] done")


def main():
    # Prereq baseline
    r = _req("GET", "/")
    _expect(r.status_code == 200, "GET /api/ root reachable", f"status={r.status_code}")

    # ---------- Step 1: Create dealer ----------
    dealer_payload = {
        "name": "Acme Tools Pro",
        "phone": "+1-555-0142",
        "website": "https://acme-tools.example",
        "address": "100 Workshop Ln, Springfield",
        "notes": "Primary dealer for power tools",
    }
    r = _req("POST", "/dealers", json=dealer_payload)
    if not _expect(r.status_code == 200, "POST /api/dealers", f"status={r.status_code} body={r.text[:200]}"):
        return
    dealer = r.json()
    dealer_id = dealer["id"]
    created_dealer_ids.append(dealer_id)
    _expect(dealer["name"] == "Acme Tools Pro", "Dealer fields persisted")

    # ---------- Step 2: Create a tool linked to that dealer ----------
    tool_payload = {
        "name": "DeWalt 20V Impact Driver",
        "description": "Cordless impact driver",
        "brand": "DeWalt",
        "model": "DCF887",
        "serial_number": "SN-DCF887-001",
        "cost": 199.99,
        "condition": "Good",
        "dealer_id": dealer_id,
        "dealer_name": dealer["name"],
    }
    r = _req("POST", "/tools", json=tool_payload)
    if not _expect(r.status_code == 200, "POST /api/tools (linked to dealer)", f"status={r.status_code} body={r.text[:200]}"):
        return
    tool = r.json()
    tool_id = tool["id"]
    created_tool_ids.append(tool_id)
    _expect(tool["dealer_id"] == dealer_id, "Tool dealer_id persisted")
    _expect(tool["dealer_name"] == "Acme Tools Pro", "Tool dealer_name persisted")
    _expect(tool["needs_repair"] is False, "Tool needs_repair defaults to false")

    # ---------- Step 3: PUT needs_repair=true with full repair_info ----------
    repair_info_v1 = {
        "company_notified": "Acme Repair Center",
        "notified_at": "2025-08-15",
        "expected_completion": "2025-09-01",
        "repair_status": "In Repair",
        "contact": "repairs@acme.example / 555-0199",
        "notes": "Trigger sticking, brought in for warranty repair",
    }
    r = _req("PUT", f"/tools/{tool_id}", json={"needs_repair": True, "repair_info": repair_info_v1})
    _expect(r.status_code == 200, "PUT /api/tools/{id} needs_repair=true", f"status={r.status_code} body={r.text[:200]}")
    body = r.json() if r.ok else {}
    _expect(body.get("needs_repair") is True, "Tool needs_repair=true persisted in response")
    _expect((body.get("repair_info") or {}).get("repair_status") == "In Repair", "Tool repair_status mirrors body")

    # 3a — Auto-created claim must show up via GET /api/warranty-claims?dealer_id={dealerId}
    r = _req("GET", "/warranty-claims", params={"dealer_id": dealer_id})
    _expect(r.status_code == 200, "GET /api/warranty-claims?dealer_id=", f"status={r.status_code}")
    claims = r.json() if r.ok else []
    matching = [c for c in claims if c.get("tool_id") == tool_id]
    if not _expect(len(matching) == 1, "Exactly 1 auto-created claim for the tool", f"got {len(matching)} claims for tool"):
        return
    claim = matching[0]
    claim_id = claim["id"]
    created_claim_ids.append(claim_id)
    _expect(claim.get("claim_status") == "broken", "Auto-claim claim_status=broken", f"got {claim.get('claim_status')}")
    _expect(claim.get("tool_name") == tool["name"], "Auto-claim tool_name copied")
    _expect(claim.get("dealer_id") == dealer_id, "Auto-claim dealer_id copied")
    _expect(claim.get("dealer_name") == dealer["name"], "Auto-claim dealer_name copied")
    _expect(claim.get("repair_company") == "Acme Repair Center", "Auto-claim repair_company copied from company_notified")
    _expect(claim.get("contact") == repair_info_v1["contact"], "Auto-claim contact copied")
    _expect(claim.get("notified_at") == "2025-08-15", "Auto-claim notified_at copied")
    _expect(claim.get("expected_completion") == "2025-09-01", "Auto-claim expected_completion copied")
    _expect(claim.get("notes") == repair_info_v1["notes"], "Auto-claim notes copied")

    # 3b — summary shows totals
    r = _req("GET", "/warranty-claims/summary")
    _expect(r.status_code == 200, "GET /api/warranty-claims/summary", f"status={r.status_code}")
    summary = r.json() if r.ok else {}
    totals = summary.get("totals", {})
    _expect(totals.get("total", 0) >= 1, "summary.totals.total >= 1", f"got {totals.get('total')}")
    _expect(totals.get("open", 0) >= 1, "summary.totals.open >= 1", f"got {totals.get('open')}")
    dealers_list = summary.get("dealers", [])
    dealer_entry = next((d for d in dealers_list if d.get("dealer_id") == dealer_id), None)
    _expect(dealer_entry is not None, "summary.dealers contains our dealer entry")
    if dealer_entry:
        _expect(dealer_entry.get("open", 0) >= 1, "dealer entry open >= 1", f"got {dealer_entry.get('open')}")

    # ---------- Step 4: PUT needs_repair=true again with NEW repair_info — no duplicate ----------
    repair_info_v2 = {
        "company_notified": "Bright Repair Co",
        "notified_at": "2025-08-20",
        "expected_completion": "2025-09-10",
        "repair_status": "In Repair",
        "contact": "support@bright.example",
        "notes": "Updated info — second visit",
    }
    r = _req("PUT", f"/tools/{tool_id}", json={"needs_repair": True, "repair_info": repair_info_v2})
    _expect(r.status_code == 200, "PUT /api/tools/{id} needs_repair=true (mirror update)", f"status={r.status_code}")

    r = _req("GET", "/warranty-claims", params={"dealer_id": dealer_id})
    claims_after = [c for c in r.json() if c.get("tool_id") == tool_id] if r.ok else []
    open_claims = [c for c in claims_after if c.get("claim_status") not in ("completed", "rejected")]
    _expect(len(open_claims) == 1, "Still exactly 1 open claim (no duplicate)", f"got {len(open_claims)} open claims")
    if open_claims:
        c = open_claims[0]
        _expect(c["id"] == claim_id, "Same claim id is preserved")
        _expect(c.get("repair_company") == "Bright Repair Co", "Mirror: repair_company updated", f"got {c.get('repair_company')}")
        _expect(c.get("contact") == repair_info_v2["contact"], "Mirror: contact updated")
        _expect(c.get("notified_at") == "2025-08-20", "Mirror: notified_at updated")
        _expect(c.get("expected_completion") == "2025-09-10", "Mirror: expected_completion updated")
        _expect(c.get("notes") == repair_info_v2["notes"], "Mirror: notes updated")

    # ---------- Step 5: PUT claim status -> 'awaiting_approval' ----------
    r = _req("PUT", f"/warranty-claims/{claim_id}", json={"claim_status": "awaiting_approval"})
    _expect(r.status_code == 200, "PUT /api/warranty-claims/{id} status=awaiting_approval", f"status={r.status_code} body={r.text[:200]}")
    cbody = r.json() if r.ok else {}
    _expect(cbody.get("claim_status") == "awaiting_approval", "Claim status updated to awaiting_approval")

    r = _req("GET", f"/tools/{tool_id}")
    tbody = r.json() if r.ok else {}
    _expect(tbody.get("needs_repair") is True, "Tool still needs_repair=true after awaiting_approval")
    ri = (tbody.get("repair_info") or {})
    _expect(ri.get("repair_status") == "Reported", "Tool repair_status mapped to 'Reported' for awaiting_approval", f"got {ri.get('repair_status')}")

    # ---------- Step 6: PUT claim status -> 'waiting_replacement' ----------
    r = _req("PUT", f"/warranty-claims/{claim_id}", json={"claim_status": "waiting_replacement"})
    _expect(r.status_code == 200, "PUT claim status=waiting_replacement", f"status={r.status_code}")
    r = _req("GET", f"/tools/{tool_id}")
    ri = (r.json() or {}).get("repair_info") or {}
    _expect(ri.get("repair_status") == "Awaiting Parts", "Tool repair_status mapped to 'Awaiting Parts' for waiting_replacement", f"got {ri.get('repair_status')}")

    # ---------- Step 7: PUT claim status -> 'completed' ----------
    pre_summary = _req("GET", "/warranty-claims/summary").json()
    pre_open = pre_summary.get("totals", {}).get("open", 0)
    pre_completed = pre_summary.get("totals", {}).get("completed", 0)
    pre_dealer_entry = next((d for d in pre_summary.get("dealers", []) if d.get("dealer_id") == dealer_id), {})
    pre_dealer_open = pre_dealer_entry.get("open", 0)
    pre_dealer_completed = pre_dealer_entry.get("completed", 0)

    r = _req("PUT", f"/warranty-claims/{claim_id}", json={"claim_status": "completed"})
    _expect(r.status_code == 200, "PUT claim status=completed", f"status={r.status_code}")
    cbody = r.json() if r.ok else {}
    _expect(cbody.get("claim_status") == "completed", "Claim status=completed")
    _expect(bool(cbody.get("completed_at")), "completed_at populated on completion")

    r = _req("GET", f"/tools/{tool_id}")
    tbody = r.json() if r.ok else {}
    _expect(tbody.get("needs_repair") is False, "Tool needs_repair=false after claim completed")
    _expect(tbody.get("repair_info") in (None, {}), "Tool repair_info=null after claim completed", f"got {tbody.get('repair_info')}")

    post_summary = _req("GET", "/warranty-claims/summary").json()
    post_open = post_summary.get("totals", {}).get("open", 0)
    post_completed = post_summary.get("totals", {}).get("completed", 0)
    _expect(post_open == pre_open - 1, "summary.totals.open decreased by 1", f"pre={pre_open} post={post_open}")
    _expect(post_completed == pre_completed + 1, "summary.totals.completed increased by 1", f"pre={pre_completed} post={post_completed}")
    post_dealer_entry = next((d for d in post_summary.get("dealers", []) if d.get("dealer_id") == dealer_id), {})
    _expect(post_dealer_entry.get("open", -1) == pre_dealer_open - 1, "dealer entry open decreased by 1",
            f"pre={pre_dealer_open} post={post_dealer_entry.get('open')}")
    _expect(post_dealer_entry.get("completed", -1) == pre_dealer_completed + 1, "dealer entry completed increased by 1",
            f"pre={pre_dealer_completed} post={post_dealer_entry.get('completed')}")

    # ---------- Step 8: archived filter ----------
    r = _req("GET", "/warranty-claims", params={"archived": "true"})
    archived_list = r.json() if r.ok else []
    _expect(any(c.get("id") == claim_id for c in archived_list), "archived=true contains the completed claim")

    r = _req("GET", "/warranty-claims", params={"archived": "false"})
    active_list = r.json() if r.ok else []
    _expect(not any(c.get("id") == claim_id for c in active_list), "archived=false does NOT contain the completed claim")

    # ---------- Step 9: PUT claim_status back to 'broken' ----------
    r = _req("PUT", f"/warranty-claims/{claim_id}", json={"claim_status": "broken"})
    _expect(r.status_code == 200, "PUT claim status=broken (reopen)", f"status={r.status_code}")
    cbody = r.json() if r.ok else {}
    _expect(cbody.get("claim_status") == "broken", "Claim re-opened with status=broken")
    _expect(cbody.get("completed_at") in (None, ""), "completed_at cleared on reopen", f"got {cbody.get('completed_at')}")

    r = _req("GET", f"/tools/{tool_id}")
    tbody = r.json() if r.ok else {}
    _expect(tbody.get("needs_repair") is True, "Tool flips needs_repair=true on reopen")
    ri = tbody.get("repair_info") or {}
    _expect(ri is not None and len(ri) > 0, "Tool repair_info populated on reopen")
    _expect(ri.get("company_notified") == "Bright Repair Co", "Reopened repair_info.company_notified from claim",
            f"got {ri.get('company_notified')}")
    _expect(ri.get("contact") == repair_info_v2["contact"], "Reopened repair_info.contact from claim")
    _expect(ri.get("expected_completion") == "2025-09-10", "Reopened repair_info.expected_completion from claim")

    # ---------- Step 10: Mark Repaired path on the tool ----------
    r = _req("PUT", f"/tools/{tool_id}", json={"needs_repair": False, "repair_info": None})
    _expect(r.status_code == 200, "PUT /api/tools/{id} needs_repair=false (Mark Repaired)", f"status={r.status_code}")
    tbody = r.json() if r.ok else {}
    _expect(tbody.get("needs_repair") is False, "Tool needs_repair=false after Mark Repaired")

    r = _req("GET", "/warranty-claims", params={"archived": "true"})
    archived_list = r.json() if r.ok else []
    same = next((c for c in archived_list if c.get("id") == claim_id), None)
    _expect(same is not None, "Claim auto-closed and visible under archived=true after Mark Repaired")
    if same:
        _expect(same.get("claim_status") == "completed", "Claim auto-flipped to completed", f"got {same.get('claim_status')}")
        _expect(bool(same.get("completed_at")), "completed_at stamped after auto-close")

    # ---------- Step 11: Tool with NO dealer ----------
    r = _req("POST", "/tools", json={"name": "Generic Bench Vise", "brand": "NoBrand", "cost": 49.0})
    _expect(r.status_code == 200, "POST /api/tools (no dealer)", f"status={r.status_code}")
    tool2 = r.json()
    tool2_id = tool2["id"]
    created_tool_ids.append(tool2_id)
    _expect(tool2.get("dealer_id") in (None, ""), "tool2 has no dealer_id")

    repair_info_2 = {
        "company_notified": "Local Welder Bob",
        "notified_at": "2025-08-25",
        "expected_completion": "2025-09-15",
        "repair_status": "In Repair",
        "contact": "bob@example.com",
        "notes": "Crack in jaw",
    }
    r = _req("PUT", f"/tools/{tool2_id}", json={"needs_repair": True, "repair_info": repair_info_2})
    _expect(r.status_code == 200, "PUT tool2 needs_repair=true (no dealer)", f"status={r.status_code}")

    r = _req("GET", "/warranty-claims/summary")
    summary2 = r.json() if r.ok else {}
    none_bucket = next((d for d in summary2.get("dealers", []) if d.get("dealer_id") is None), None)
    _expect(none_bucket is not None, "summary has _none_ bucket (dealer_id=None)")
    if none_bucket:
        _expect(none_bucket.get("dealer_name") == "No Dealer", "no-dealer bucket name='No Dealer'",
                f"got {none_bucket.get('dealer_name')}")
        _expect(none_bucket.get("open", 0) >= 1, "no-dealer bucket has open>=1")

    r = _req("GET", "/warranty-claims", params={"dealer_id": "_none_"})
    none_claims = r.json() if r.ok else []
    tool2_claim = next((c for c in none_claims if c.get("tool_id") == tool2_id), None)
    _expect(tool2_claim is not None, "GET ?dealer_id=_none_ returns claim for dealerless tool")
    if tool2_claim:
        created_claim_ids.append(tool2_claim["id"])
        tool2_claim_id = tool2_claim["id"]
    else:
        tool2_claim_id = None

    # ---------- Step 12: DELETE warranty claim ----------
    if tool2_claim_id:
        r = _req("DELETE", f"/warranty-claims/{tool2_claim_id}")
        _expect(r.status_code == 200, "DELETE /api/warranty-claims/{id}", f"status={r.status_code}")
        r = _req("GET", "/warranty-claims")
        all_after = r.json() if r.ok else []
        _expect(not any(c.get("id") == tool2_claim_id for c in all_after), "Deleted claim no longer returned")
        if tool2_claim_id in created_claim_ids:
            created_claim_ids.remove(tool2_claim_id)

    # ---------- Step 13: Validation ----------
    r = _req("PUT", f"/warranty-claims/{claim_id}", json={"claim_status": "garbage"})
    _expect(r.status_code == 400, "PUT claim with invalid status -> 400", f"got status={r.status_code}")

    # ---------- Step 14: Regression ----------
    r = _req("GET", "/tools")
    _expect(r.status_code == 200, "GET /api/tools regression", f"status={r.status_code}")
    r = _req("GET", "/dealers")
    _expect(r.status_code == 200, "GET /api/dealers regression", f"status={r.status_code}")
    r = _req("GET", "/locations")
    _expect(r.status_code == 200, "GET /api/locations regression", f"status={r.status_code}")

    # Compute expected broken count
    r = _req("GET", "/tools", params={"needs_repair": "true"})
    broken_tools = r.json() if r.ok else []
    expected_broken = len(broken_tools)

    r = _req("GET", "/aggregate")
    agg = r.json() if r.ok else {}
    _expect(agg.get("needs_repair") == expected_broken,
            f"/api/aggregate.needs_repair matches broken tool count",
            f"agg={agg.get('needs_repair')} expected={expected_broken}")
    r = _req("GET", "/stats")
    stats = r.json() if r.ok else {}
    _expect(stats.get("needs_repair") == expected_broken,
            f"/api/stats.needs_repair matches broken tool count",
            f"stats={stats.get('needs_repair')} expected={expected_broken}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        FAIL += 1
        FAIL_DETAILS.append(f"Unhandled exception: {traceback.format_exc()}")
    finally:
        cleanup()
        print("\n=========================================")
        print(f"RESULT: PASS={PASS}  FAIL={FAIL}")
        print("=========================================")
        if FAIL_DETAILS:
            print("\nFailures:")
            for d in FAIL_DETAILS:
                print(d)
        sys.exit(0 if FAIL == 0 else 1)
