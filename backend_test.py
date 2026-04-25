"""
Backend tests for Broken/Repair tracking and regression on tools/locations/dealers.
Targets the FastAPI backend via EXPO_PUBLIC_BACKEND_URL with /api prefix.
"""
import os
import sys
import json
import requests
from pathlib import Path

# Resolve base URL from frontend .env
FRONTEND_ENV = Path("/app/frontend/.env")
BASE = None
if FRONTEND_ENV.exists():
    for line in FRONTEND_ENV.read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip().strip('"')
            break
if not BASE:
    BASE = "http://127.0.0.1:8001"
API = BASE.rstrip("/") + "/api"

print(f"Using API base: {API}")

results = []  # list of (name, ok, details)
created_tool_ids = []
created_location_ids = []
created_dealer_ids = []


def record(name, ok, details=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}: {details}")
    results.append((name, ok, details))


def post(path, body):
    return requests.post(API + path, json=body, timeout=30)


def put(path, body):
    return requests.put(API + path, json=body, timeout=30)


def get(path, params=None):
    return requests.get(API + path, params=params, timeout=30)


def delete(path):
    return requests.delete(API + path, timeout=30)


def main():
    # 0) Sanity
    try:
        r = get("/")
        record("API root reachable", r.status_code == 200, f"status={r.status_code} body={r.text[:120]}")
    except Exception as e:
        record("API root reachable", False, f"exception: {e}")
        return

    # ---- 1) Create tool, then PUT with needs_repair + repair_info ----
    create_payload = {
        "name": "DeWalt Cordless Drill DCD791",
        "description": "20V MAX brushless drill",
        "brand": "DeWalt",
        "model": "DCD791",
        "serial_number": "SN-RPR-001",
        "cost": 199.0,
        "condition": "Good",
    }
    r = post("/tools", create_payload)
    ok = r.status_code == 200
    record("Create tool (basic)", ok, f"status={r.status_code}")
    if not ok:
        print(r.text)
        return
    tool1 = r.json()
    tool1_id = tool1["id"]
    created_tool_ids.append(tool1_id)

    repair_info = {
        "company_notified": "ACME Repair",
        "notified_at": "2025-06-10",
        "expected_completion": "2025-06-25",
        "repair_status": "In Repair",
        "contact": "555-1234",
        "notes": "Won't power on",
    }
    r = put(f"/tools/{tool1_id}", {"needs_repair": True, "repair_info": repair_info})
    ok = r.status_code == 200
    record("PUT tool with needs_repair + repair_info", ok, f"status={r.status_code}")
    if ok:
        body = r.json()
        ok2 = body.get("needs_repair") is True and body.get("repair_info") is not None
        record("Response has needs_repair=true and repair_info", ok2, f"needs_repair={body.get('needs_repair')} repair_info={body.get('repair_info')}")

    # GET and confirm
    r = get(f"/tools/{tool1_id}")
    ok = r.status_code == 200
    if ok:
        body = r.json()
        ri = body.get("repair_info") or {}
        match = (
            body.get("needs_repair") is True
            and ri.get("company_notified") == "ACME Repair"
            and ri.get("notified_at") == "2025-06-10"
            and ri.get("expected_completion") == "2025-06-25"
            and ri.get("repair_status") == "In Repair"
            and ri.get("contact") == "555-1234"
            and ri.get("notes") == "Won't power on"
        )
        record("GET tool returns full repair_info as set", match, f"repair_info={ri}")
    else:
        record("GET tool after PUT", False, f"status={r.status_code}")

    # ---- 2) AUTO-CHECKIN behavior ----
    r = post("/tools", {"name": "Milwaukee Impact Wrench M18", "brand": "Milwaukee", "model": "2767-20", "cost": 349.0})
    ok = r.status_code == 200
    record("Create tool for auto-checkin test", ok, f"status={r.status_code}")
    if not ok:
        print(r.text)
        return
    tool2 = r.json()
    tool2_id = tool2["id"]
    created_tool_ids.append(tool2_id)

    # checkout
    r = post(f"/tools/{tool2_id}/checkout", {"borrower_name": "Bob"})
    ok = r.status_code == 200
    record("Checkout tool to Bob", ok, f"status={r.status_code}")
    if ok:
        b = r.json()
        record("After checkout: is_checked_out=true", b.get("is_checked_out") is True, f"is_checked_out={b.get('is_checked_out')}")
        record("After checkout: current_checkout populated", bool(b.get("current_checkout")), f"current_checkout={b.get('current_checkout')}")

    # PUT needs_repair=true on a checked-out tool
    r = put(f"/tools/{tool2_id}", {
        "needs_repair": True,
        "repair_info": {"repair_status": "Reported", "company_notified": "Test Shop"},
    })
    ok = r.status_code == 200
    record("PUT needs_repair=true on checked-out tool", ok, f"status={r.status_code}")
    if ok:
        body = r.json()
        # Confirm via GET
        r2 = get(f"/tools/{tool2_id}")
        b = r2.json() if r2.status_code == 200 else {}
        record("Auto-checkin: is_checked_out=false", b.get("is_checked_out") is False, f"is_checked_out={b.get('is_checked_out')}")
        record("Auto-checkin: current_checkout is None", b.get("current_checkout") is None, f"current_checkout={b.get('current_checkout')}")
        history = b.get("checkout_history") or []
        record("Auto-checkin: exactly 1 entry in checkout_history", len(history) == 1, f"history len={len(history)}")
        if len(history) == 1:
            h0 = history[0]
            record("Auto-checkin: history entry has checked_in_at non-null", bool(h0.get("checked_in_at")), f"checked_in_at={h0.get('checked_in_at')}")
            notes = h0.get("notes") or ""
            record(
                "Auto-checkin: history notes contain '[auto check-in: marked for repair]'",
                "[auto check-in: marked for repair]" in notes,
                f"notes={notes!r}",
            )
        record("Auto-checkin: needs_repair=true persisted", b.get("needs_repair") is True, f"needs_repair={b.get('needs_repair')}")

    # ---- 3) Filter ----
    r = get("/tools", params={"needs_repair": "true"})
    ok = r.status_code == 200
    record("GET /tools?needs_repair=true status", ok, f"status={r.status_code}")
    if ok:
        items = r.json()
        all_broken = all(t.get("needs_repair") is True for t in items)
        ids = {t["id"] for t in items}
        contains_both = tool1_id in ids and tool2_id in ids
        record("Filter returns only needs_repair=true items", all_broken, f"count={len(items)} all_true={all_broken}")
        record("Filter includes both repaired test tools", contains_both, f"contains tool1={tool1_id in ids}, tool2={tool2_id in ids}")

    # Also check needs_repair=false excludes them
    r = get("/tools", params={"needs_repair": "false"})
    if r.status_code == 200:
        ids = {t["id"] for t in r.json()}
        record("Filter needs_repair=false excludes broken tools", tool1_id not in ids and tool2_id not in ids, f"tool1 excluded={tool1_id not in ids}, tool2 excluded={tool2_id not in ids}")

    # ---- 4) /api/aggregate and /api/stats ----
    r = get("/aggregate")
    ok = r.status_code == 200
    record("GET /aggregate status", ok, f"status={r.status_code}")
    if ok:
        body = r.json()
        record("Aggregate has needs_repair >= 2 (we created 2)", (body.get("needs_repair") or 0) >= 2, f"needs_repair={body.get('needs_repair')}")

    r = get("/stats")
    ok = r.status_code == 200
    record("GET /stats status", ok, f"status={r.status_code}")
    if ok:
        body = r.json()
        record("Stats has needs_repair >= 2", (body.get("needs_repair") or 0) >= 2, f"needs_repair={body.get('needs_repair')}")

    # ---- 5) Regression: Tools CRUD, checkout/checkin, locations, dealers ----
    # POST tool
    r = post("/tools", {"name": "Regression Test Hammer", "cost": 19.99})
    ok = r.status_code == 200
    record("Regression POST /tools", ok, f"status={r.status_code}")
    reg_tool_id = None
    if ok:
        reg_tool_id = r.json()["id"]
        created_tool_ids.append(reg_tool_id)
    # PUT
    if reg_tool_id:
        r = put(f"/tools/{reg_tool_id}", {"description": "updated desc", "cost": 24.99})
        record("Regression PUT /tools/{id}", r.status_code == 200 and r.json().get("description") == "updated desc", f"status={r.status_code}")
    # checkout & checkin
    if reg_tool_id:
        r = post(f"/tools/{reg_tool_id}/checkout", {"borrower_name": "Alice", "notes": "Loaning for weekend"})
        record("Regression checkout", r.status_code == 200 and r.json().get("is_checked_out") is True, f"status={r.status_code}")
        r = post(f"/tools/{reg_tool_id}/checkin", {})
        ok2 = r.status_code == 200
        record("Regression checkin", ok2 and r.json().get("is_checked_out") is False, f"status={r.status_code}")
        if ok2:
            body = r.json()
            hist = body.get("checkout_history") or []
            record("Regression checkin pushes to history with checked_in_at", len(hist) >= 1 and hist[-1].get("checked_in_at"), f"history len={len(hist)}")
    # DELETE
    if reg_tool_id:
        r = delete(f"/tools/{reg_tool_id}")
        record("Regression DELETE /tools/{id}", r.status_code == 200, f"status={r.status_code}")
        if r.status_code == 200:
            created_tool_ids.remove(reg_tool_id)

    # Locations
    r = post("/locations", {"name": "Garage Workshop"})
    ok = r.status_code == 200
    record("Regression POST /locations", ok, f"status={r.status_code}")
    if ok:
        loc_id = r.json()["id"]
        created_location_ids.append(loc_id)
    r = get("/locations")
    record("Regression GET /locations", r.status_code == 200 and isinstance(r.json(), list), f"status={r.status_code}")

    # Dealers
    r = post("/dealers", {"name": "Northern Tool Co", "phone": "555-9999"})
    ok = r.status_code == 200
    record("Regression POST /dealers", ok, f"status={r.status_code}")
    if ok:
        dealer_id = r.json()["id"]
        created_dealer_ids.append(dealer_id)
    r = get("/dealers")
    record("Regression GET /dealers", r.status_code == 200 and isinstance(r.json(), list), f"status={r.status_code}")

    # ---- Cleanup ----
    print("\n--- Cleanup ---")
    for tid in list(created_tool_ids):
        try:
            delete(f"/tools/{tid}")
        except Exception as e:
            print(f"cleanup tool {tid} error: {e}")
    for lid in list(created_location_ids):
        try:
            delete(f"/locations/{lid}")
        except Exception:
            pass
    for did in list(created_dealer_ids):
        try:
            delete(f"/dealers/{did}")
        except Exception:
            pass

    # Summary
    print("\n=== SUMMARY ===")
    passed = sum(1 for _, ok, _ in results if ok)
    failed = [r for r in results if not r[1]]
    print(f"Passed: {passed}/{len(results)}")
    if failed:
        print("Failed:")
        for n, _, d in failed:
            print(f"  - {n}: {d}")
        sys.exit(1)


if __name__ == "__main__":
    main()
