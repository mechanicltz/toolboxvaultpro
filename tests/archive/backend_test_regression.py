#!/usr/bin/env python3
"""Regression test for recently-changed/added backend endpoints.

Focus areas:
1. Dealer Route fields (route_frequency, route_day_of_week, route_anchor_date)
2. broken_photo on warranty claims
3. GET /api/warranty-claims/{claim_id} (single)
4. Existing endpoints regression
"""
import os
import sys
import json
import requests

BASE = "https://toolbox-vault-v3.preview.emergentagent.com/api"

PASS = 0
FAIL = 0
FAILS = []


def check(label, cond, info=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        FAILS.append(f"{label} :: {info}")
        print(f"  FAIL  {label}  {info}")


def section(title):
    print(f"\n=== {title} ===")


def main():
    cleanup_dealer_ids = []
    cleanup_tool_ids = []

    PNG_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    PNG_UPDATED = "data:image/png;base64,UPDATEDxxxxxxxx"

    # =========================================================
    # 1. Dealer Route fields
    # =========================================================
    section("1. Dealer Route fields")

    # 1.a GET /api/dealers — verify shape on existing dealers
    r = requests.get(f"{BASE}/dealers")
    check("GET /api/dealers 200", r.status_code == 200, f"status={r.status_code}")
    dealers = r.json() if r.ok else []
    if dealers:
        d0 = dealers[0]
        check(
            "Existing dealer has route_frequency field",
            "route_frequency" in d0,
            f"keys={list(d0.keys())}",
        )
        check("Existing dealer has route_day_of_week field", "route_day_of_week" in d0)
        check("Existing dealer has route_anchor_date field", "route_anchor_date" in d0)
        # Verify defaults for tested existing dealers (defaults at field level)
        # Some pre-existing rows may not have these set; the response model
        # auto-populates defaults: 'N/A', '', ''
        check(
            "route_frequency default 'N/A' for existing dealer",
            d0.get("route_frequency") in ("N/A", "Weekly", "Bi-weekly", "Monthly"),
            f"got={d0.get('route_frequency')!r}",
        )
        check(
            "route_day_of_week default '' (or set value) for existing dealer",
            isinstance(d0.get("route_day_of_week"), str),
            f"got={d0.get('route_day_of_week')!r}",
        )
        check(
            "route_anchor_date default '' (or set value) for existing dealer",
            isinstance(d0.get("route_anchor_date"), str),
            f"got={d0.get('route_anchor_date')!r}",
        )

    # 1.b POST /api/dealers with route_frequency + route_day_of_week
    body = {
        "name": "Test Route Dealer",
        "route_frequency": "Weekly",
        "route_day_of_week": "Wednesday",
    }
    r = requests.post(f"{BASE}/dealers", json=body)
    check("POST /api/dealers (Weekly/Wednesday) 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    dealer = r.json()
    cleanup_dealer_ids.append(dealer["id"])
    check(
        "POST result name persisted",
        dealer.get("name") == "Test Route Dealer",
        f"got={dealer.get('name')!r}",
    )
    check(
        "POST result route_frequency='Weekly' persisted",
        dealer.get("route_frequency") == "Weekly",
        f"got={dealer.get('route_frequency')!r}",
    )
    check(
        "POST result route_day_of_week='Wednesday' persisted",
        dealer.get("route_day_of_week") == "Wednesday",
        f"got={dealer.get('route_day_of_week')!r}",
    )
    check(
        "POST result route_anchor_date '' default",
        dealer.get("route_anchor_date") == "",
        f"got={dealer.get('route_anchor_date')!r}",
    )

    # GET single to confirm DB persistence
    did = dealer["id"]
    r = requests.get(f"{BASE}/dealers/{did}")
    check("GET /api/dealers/{id} 200", r.status_code == 200)
    g = r.json()
    check(
        "GET single: route_frequency='Weekly'",
        g.get("route_frequency") == "Weekly",
        f"got={g.get('route_frequency')!r}",
    )
    check(
        "GET single: route_day_of_week='Wednesday'",
        g.get("route_day_of_week") == "Wednesday",
        f"got={g.get('route_day_of_week')!r}",
    )

    # 1.c PUT update to Bi-weekly/Friday
    body = {"route_frequency": "Bi-weekly", "route_day_of_week": "Friday"}
    r = requests.put(f"{BASE}/dealers/{did}", json=body)
    check("PUT /api/dealers/{id} (Bi-weekly/Friday) 200", r.status_code == 200, f"status={r.status_code}")
    upd = r.json()
    check(
        "PUT result route_frequency='Bi-weekly'",
        upd.get("route_frequency") == "Bi-weekly",
        f"got={upd.get('route_frequency')!r}",
    )
    check(
        "PUT result route_day_of_week='Friday'",
        upd.get("route_day_of_week") == "Friday",
        f"got={upd.get('route_day_of_week')!r}",
    )

    # 1.d PUT reset with N/A
    body = {"route_frequency": "N/A"}
    r = requests.put(f"{BASE}/dealers/{did}", json=body)
    check("PUT /api/dealers/{id} (N/A reset) 200", r.status_code == 200)
    upd = r.json()
    check(
        "PUT result route_frequency='N/A' resets cleanly",
        upd.get("route_frequency") == "N/A",
        f"got={upd.get('route_frequency')!r}",
    )
    # Day of week not changed by this call
    check(
        "PUT N/A didn't crash (route_day_of_week still string)",
        isinstance(upd.get("route_day_of_week"), str),
    )

    # 1.e DELETE the test dealer (cleanup happens later but we test DELETE response)
    r = requests.delete(f"{BASE}/dealers/{did}")
    check("DELETE /api/dealers/{id} 200", r.status_code == 200, f"status={r.status_code}")
    cleanup_dealer_ids.remove(did)
    # Confirm gone
    r = requests.get(f"{BASE}/dealers/{did}")
    check("GET deleted dealer returns 404", r.status_code == 404, f"status={r.status_code}")

    # =========================================================
    # 2. broken_photo on warranty claims
    # =========================================================
    section("2. broken_photo on warranty claims")

    # Create a fresh dealer for tool linkage
    dealer_body = {"name": "Broken Photo Dealer"}
    r = requests.post(f"{BASE}/dealers", json=dealer_body)
    bp_dealer = r.json() if r.ok else None
    if bp_dealer:
        cleanup_dealer_ids.append(bp_dealer["id"])

    # 2.a Create a tool that is already broken with broken_photo.
    tool_body = {
        "name": "Test Broken",
        "needs_repair": True,
        "repair_info": {
            "repair_status": "Reported",
            "broken_photo": PNG_BASE64,
        },
        "dealer_name": "Test Dealer",
    }
    if bp_dealer:
        tool_body["dealer_id"] = bp_dealer["id"]

    r = requests.post(f"{BASE}/tools", json=tool_body)
    check("POST /api/tools (broken w/ photo) 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    tool = r.json()
    cleanup_tool_ids.append(tool["id"])
    tid = tool["id"]
    check("Tool persisted needs_repair=true", tool.get("needs_repair") is True)
    check(
        "Tool repair_info.broken_photo persisted",
        (tool.get("repair_info") or {}).get("broken_photo") == PNG_BASE64,
        f"got len={len(((tool.get('repair_info') or {}).get('broken_photo') or ''))}",
    )

    # 2.b GET /api/warranty-claims?tool_id={tool.id} — should auto-create an open claim
    r = requests.get(f"{BASE}/warranty-claims", params={"tool_id": tid})
    check("GET /api/warranty-claims?tool_id={id} 200", r.status_code == 200)
    claims = r.json()
    check("Auto-claim exists for newly-created broken tool", len(claims) >= 1, f"count={len(claims)}")
    if claims:
        claim = claims[0]
        claim_id = claim["id"]
        check(
            "Claim broken_photo equals data URL we sent",
            claim.get("broken_photo") == PNG_BASE64,
            f"got len={len(claim.get('broken_photo') or '')} expected len={len(PNG_BASE64)}",
        )
        check(
            "Claim tool_id matches",
            claim.get("tool_id") == tid,
            f"got={claim.get('tool_id')}",
        )
        check(
            "Claim claim_status='broken'",
            claim.get("claim_status") == "broken",
            f"got={claim.get('claim_status')}",
        )

        # 2.c PUT /api/tools/{id} to update broken_photo
        upd_body = {
            "repair_info": {
                "repair_status": "Reported",
                "broken_photo": PNG_UPDATED,
            }
        }
        r = requests.put(f"{BASE}/tools/{tid}", json=upd_body)
        check("PUT /api/tools/{id} update broken_photo 200", r.status_code == 200, f"status={r.status_code}")
        utool = r.json()
        check(
            "Tool repair_info.broken_photo updated",
            (utool.get("repair_info") or {}).get("broken_photo") == PNG_UPDATED,
        )

        # Verify claim is mirrored
        r = requests.get(f"{BASE}/warranty-claims/{claim_id}")
        check("GET /api/warranty-claims/{claim_id} 200", r.status_code == 200, f"status={r.status_code}")
        c1 = r.json()
        check(
            "Claim broken_photo mirrored to UPDATED string",
            c1.get("broken_photo") == PNG_UPDATED,
            f"got={(c1.get('broken_photo') or '')[:50]}",
        )

        # 2.d Single GET should also include broken_photo
        check("Single claim GET includes broken_photo field", "broken_photo" in c1)

    else:
        check("Skipping rest of broken_photo tests (no claim auto-created)", False, "no claims found")
        claim_id = None

    # =========================================================
    # 3. GET /api/warranty-claims/{claim_id} (single)
    # =========================================================
    section("3. GET /api/warranty-claims/{claim_id}")

    # Get a real claim id from listWarrantyClaims
    r = requests.get(f"{BASE}/warranty-claims")
    check("GET /api/warranty-claims (all) 200", r.status_code == 200)
    all_claims = r.json() if r.ok else []
    if all_claims:
        sample_id = all_claims[0]["id"]
        r = requests.get(f"{BASE}/warranty-claims/{sample_id}")
        check("GET single claim by real id 200", r.status_code == 200, f"status={r.status_code}")
        c = r.json()
        # Verify required fields exist
        required = ["id", "tool_id", "tool_name", "dealer_id", "dealer_name", "claim_status", "broken_photo", "created_at", "updated_at"]
        missing = [f for f in required if f not in c]
        check(
            "Single claim has all required fields including broken_photo",
            not missing,
            f"missing={missing}",
        )
        check("Single claim id matches requested", c.get("id") == sample_id)

    # 3.b 404 for non-existent
    r = requests.get(f"{BASE}/warranty-claims/non-existent-id-zzzzz")
    check("GET /warranty-claims/non-existent-id → 404", r.status_code == 404, f"status={r.status_code}")

    # =========================================================
    # 4. Existing endpoints regression
    # =========================================================
    section("4. Existing endpoints regression")

    endpoints = [
        ("GET /api/tools", "/tools"),
        ("GET /api/dealers", "/dealers"),
        ("GET /api/locations", "/locations"),
        ("GET /api/tags", "/tags"),
        ("GET /api/categories", "/categories"),
        ("GET /api/borrowers", "/borrowers"),
        ("GET /api/aggregate", "/aggregate"),
        ("GET /api/stats", "/stats"),
        ("GET /api/maintenance/upcoming", "/maintenance/upcoming"),
        ("GET /api/warranty-alerts", "/warranty-alerts"),
        ("GET /api/warranty-claims/summary", "/warranty-claims/summary"),
    ]
    for label, path in endpoints:
        r = requests.get(f"{BASE}{path}")
        check(f"{label} returns 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
        # Sanity: should be valid JSON
        try:
            r.json()
            check(f"{label} returns valid JSON", True)
        except Exception as e:
            check(f"{label} returns valid JSON", False, str(e))

    # =========================================================
    # Cleanup
    # =========================================================
    section("Cleanup")
    for tid in cleanup_tool_ids:
        r = requests.delete(f"{BASE}/tools/{tid}")
        check(f"DELETE tool {tid[:8]}", r.status_code == 200, f"status={r.status_code}")
    for did in cleanup_dealer_ids:
        r = requests.delete(f"{BASE}/dealers/{did}")
        check(f"DELETE dealer {did[:8]}", r.status_code == 200, f"status={r.status_code}")

    # =========================================================
    # Summary
    # =========================================================
    print("\n" + "=" * 60)
    print(f"TOTAL: {PASS + FAIL}    PASS: {PASS}    FAIL: {FAIL}")
    if FAILS:
        print("\nFAILURES:")
        for f in FAILS:
            print(f"  - {f}")
    print("=" * 60)
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
