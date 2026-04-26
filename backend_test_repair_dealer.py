"""
Backend tests for:
  1) Auto-checkout to dealer on repair_status='Sent in for Repairs' (PUT /api/tools/{id})
  2) tool_id filter on GET /api/warranty-claims

Runs against EXPO_PUBLIC_BACKEND_URL/api as defined in /app/frontend/.env.
"""
import os
import json
import sys
import requests
from typing import Any, Dict, List

# Resolve backend base URL from frontend env
def _load_backend_url() -> str:
    env_path = "/app/frontend/.env"
    base = None
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    base = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not base:
        raise SystemExit("EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env")
    return base.rstrip("/") + "/api"


API = _load_backend_url()
print(f"[setup] API base = {API}")

passed = 0
failed = 0
failures: List[str] = []


def check(cond: bool, label: str, extra: Any = ""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        msg = f"  FAIL  {label}  {extra}"
        print(msg)
        failures.append(label + (f" :: {extra}" if extra else ""))


def http(method: str, path: str, **kw) -> requests.Response:
    url = f"{API}{path}"
    r = requests.request(method, url, timeout=30, **kw)
    return r


def jget(r: requests.Response):
    try:
        return r.json()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# SETUP - Create dealer D1
# ---------------------------------------------------------------------------
print("\n=== SETUP: Create dealer D1 ===")
created_tool_ids: List[str] = []
created_dealer_ids: List[str] = []
created_claim_ids: List[str] = []

r = http("POST", "/dealers", json={"name": "Test Dealer"})
check(r.status_code == 200, "POST /api/dealers Test Dealer = 200", r.status_code)
D1 = jget(r) or {}
D1_id = D1.get("id")
check(bool(D1_id), "D1 has id", D1)
created_dealer_ids.append(D1_id)

# ---------------------------------------------------------------------------
# TEST 1: Auto-checkout to dealer
# ---------------------------------------------------------------------------
print("\n=== TEST 1.1: Create tool with dealer + needs_repair=true, status='Reported' ===")
tool_payload = {
    "name": "Rachet Wrench A",
    "dealer_id": D1_id,
    "dealer_name": "Test Dealer",
    "needs_repair": True,
    "repair_info": {
        "repair_status": "Reported",
        "company_notified": "Snap-on Service",
        "contact": "555-1111",
        "notified_at": "2026-04-26",
        "expected_completion": "2026-05-30",
        "notes": "Stripped gear",
    },
}
r = http("POST", "/tools", json=tool_payload)
check(r.status_code == 200, "POST /api/tools T1 = 200", r.status_code)
T1 = jget(r) or {}
T1_id = T1.get("id")
check(bool(T1_id), "T1 has id")
created_tool_ids.append(T1_id)
check(T1.get("is_checked_out") is False, "T1 initial is_checked_out=false")
check(T1.get("needs_repair") is True, "T1 initial needs_repair=true")
check((T1.get("repair_info") or {}).get("repair_status") == "Reported", "T1 initial repair_status=Reported")

print("\n=== TEST 1.2: PUT repair_status='Sent in for Repairs' → auto-checkout to dealer ===")
upd1 = {
    "repair_info": {
        "repair_status": "Sent in for Repairs",
        "company_notified": "Snap-on Service",
        "contact": "555-1111",
        "notified_at": "2026-04-26",
        "expected_completion": "2026-05-30",
        "notes": "Stripped gear",
    }
}
r = http("PUT", f"/tools/{T1_id}", json=upd1)
check(r.status_code == 200, "PUT T1 → Sent in for Repairs = 200", r.status_code)
t1a = jget(r) or {}
check(t1a.get("is_checked_out") is True, "T1 is_checked_out=true after Sent in for Repairs", t1a.get("is_checked_out"))
cc = t1a.get("current_checkout") or {}
check(isinstance(cc, dict) and bool(cc), "T1 has current_checkout dict")
check(str(cc.get("borrower_id", "")).startswith(f"dealer:{D1_id}"),
      "current_checkout.borrower_id startswith dealer:D1_id",
      cc.get("borrower_id"))
check(cc.get("borrower_name") == "Test Dealer",
      "current_checkout.borrower_name == 'Test Dealer'",
      cc.get("borrower_name"))
check("Sent in for repairs" in (cc.get("notes") or ""),
      "current_checkout.notes contains 'Sent in for repairs'",
      cc.get("notes"))
check(cc.get("checked_in_at") is None, "current_checkout.checked_in_at is None")

print("\n=== TEST 1.3: PUT repair_status='Repaired', needs_repair=false → auto-checkin ===")
upd2 = {
    "needs_repair": False,
    "repair_info": {
        "repair_status": "Repaired",
        "company_notified": "Snap-on Service",
        "contact": "555-1111",
        "notified_at": "2026-04-26",
        "expected_completion": "2026-05-30",
        "notes": "Stripped gear",
    },
}
r = http("PUT", f"/tools/{T1_id}", json=upd2)
check(r.status_code == 200, "PUT T1 → Repaired/needs_repair=false = 200", r.status_code)
t1b = jget(r) or {}
check(t1b.get("is_checked_out") is False, "T1 is_checked_out=false after Repaired", t1b.get("is_checked_out"))
check(t1b.get("current_checkout") is None, "T1 current_checkout is None after Repaired", t1b.get("current_checkout"))
hist = t1b.get("checkout_history") or []
check(len(hist) >= 1, "T1 checkout_history has >=1 entry", len(hist))
last = hist[-1] if hist else {}
check(str(last.get("borrower_id", "")).startswith("dealer:"),
      "last history.borrower_id startswith 'dealer:'",
      last.get("borrower_id"))
check(bool(last.get("checked_in_at")),
      "last history.checked_in_at is populated",
      last.get("checked_in_at"))

print("\n=== TEST 1.4: New tool, transition Reported → Sent in for Repairs → In Repair ===")
t2_payload = {
    "name": "Drill B",
    "dealer_id": D1_id,
    "dealer_name": "Test Dealer",
    "needs_repair": True,
    "repair_info": {
        "repair_status": "Reported",
        "company_notified": "Snap-on Service",
        "contact": "555-2222",
    },
}
r = http("POST", "/tools", json=t2_payload)
check(r.status_code == 200, "POST T2 with Reported = 200", r.status_code)
T2 = jget(r) or {}
T2_id = T2.get("id")
created_tool_ids.append(T2_id)
check(T2.get("is_checked_out") is False, "T2 initial is_checked_out=false")

# Reported → Sent in for Repairs
r = http("PUT", f"/tools/{T2_id}", json={
    "repair_info": {**(T2.get("repair_info") or {}), "repair_status": "Sent in for Repairs"}
})
check(r.status_code == 200, "PUT T2 → Sent in for Repairs = 200", r.status_code)
t2a = jget(r) or {}
check(t2a.get("is_checked_out") is True, "T2 is_checked_out=true after Sent in for Repairs")
check(str(((t2a.get("current_checkout") or {}).get("borrower_id") or "")).startswith(f"dealer:{D1_id}"),
      "T2 current_checkout.borrower_id startswith dealer:D1_id")

# Sent in for Repairs → In Repair (without marking repaired)
r = http("PUT", f"/tools/{T2_id}", json={
    "repair_info": {**(t2a.get("repair_info") or {}), "repair_status": "In Repair"}
})
check(r.status_code == 200, "PUT T2 → In Repair = 200", r.status_code)
t2b = jget(r) or {}
check(t2b.get("is_checked_out") is False,
      "T2 is_checked_out=false after transitioning from Sent in for Repairs to In Repair (auto check-in)",
      t2b.get("is_checked_out"))
check(t2b.get("current_checkout") is None, "T2 current_checkout is None after In Repair")
hist2 = t2b.get("checkout_history") or []
check(len(hist2) >= 1, "T2 checkout_history has >=1 entry after auto-checkin", len(hist2))
if hist2:
    last2 = hist2[-1]
    check(str(last2.get("borrower_id", "")).startswith("dealer:"),
          "T2 last history.borrower_id startswith 'dealer:'")
    check(bool(last2.get("checked_in_at")),
          "T2 last history.checked_in_at is populated")
check((t2b.get("repair_info") or {}).get("repair_status") == "In Repair",
      "T2 repair_status now 'In Repair'",
      (t2b.get("repair_info") or {}).get("repair_status"))

print("\n=== TEST 1.5: EDGE - Tool with NO dealer_id, set Sent in for Repairs ===")
t3_payload = {
    "name": "Orphan Hammer",
    "needs_repair": True,
    "repair_info": {"repair_status": "Reported"},
}
r = http("POST", "/tools", json=t3_payload)
check(r.status_code == 200, "POST T3 (no dealer) = 200", r.status_code)
T3 = jget(r) or {}
T3_id = T3.get("id")
created_tool_ids.append(T3_id)
check(not T3.get("dealer_id"), "T3 has no dealer_id")

r = http("PUT", f"/tools/{T3_id}", json={"repair_info": {"repair_status": "Sent in for Repairs"}})
check(r.status_code == 200, "PUT T3 → Sent in for Repairs (no dealer) = 200 (no crash)", r.status_code)
t3a = jget(r) or {}
check((t3a.get("repair_info") or {}).get("repair_status") == "Sent in for Repairs",
      "T3 repair_status updated to 'Sent in for Repairs' even without dealer",
      (t3a.get("repair_info") or {}).get("repair_status"))
check(t3a.get("is_checked_out") is False,
      "T3 is_checked_out remains false (auto-checkout silently skipped without dealer)",
      t3a.get("is_checked_out"))
check(t3a.get("current_checkout") is None, "T3 current_checkout is None")

print("\n=== TEST 1.6: EDGE - Tool already manually checked out to real borrower, set Sent in for Repairs ===")
t4_payload = {
    "name": "Loaned Wrench",
    "dealer_id": D1_id,
    "dealer_name": "Test Dealer",
    "needs_repair": True,
    "repair_info": {"repair_status": "Reported"},
}
r = http("POST", "/tools", json=t4_payload)
check(r.status_code == 200, "POST T4 = 200", r.status_code)
T4 = jget(r) or {}
T4_id = T4.get("id")
created_tool_ids.append(T4_id)

# Manually check it out to a real borrower
r = http("POST", f"/tools/{T4_id}/checkout",
         json={"borrower_id": "borrower-real-1", "borrower_name": "Real Person", "notes": "Borrowed for job"})
check(r.status_code == 200, "POST T4 manual checkout to real borrower = 200", r.status_code)
t4ck = jget(r) or {}
check(t4ck.get("is_checked_out") is True, "T4 is_checked_out=true after manual checkout")
real_cc = t4ck.get("current_checkout") or {}
check(real_cc.get("borrower_id") == "borrower-real-1",
      "T4 current_checkout.borrower_id == real borrower")

# Now PUT Sent in for Repairs — should NOT overwrite checkout
r = http("PUT", f"/tools/{T4_id}", json={"repair_info": {"repair_status": "Sent in for Repairs"}})
check(r.status_code == 200, "PUT T4 → Sent in for Repairs = 200", r.status_code)
t4a = jget(r) or {}
check(t4a.get("is_checked_out") is True,
      "T4 still is_checked_out=true (existing checkout preserved)",
      t4a.get("is_checked_out"))
cc4 = t4a.get("current_checkout") or {}
check(cc4.get("borrower_id") == "borrower-real-1",
      "T4 current_checkout still belongs to real borrower (not overwritten by dealer)",
      cc4.get("borrower_id"))
check(cc4.get("borrower_name") == "Real Person",
      "T4 current_checkout.borrower_name still 'Real Person'")
check(not str(cc4.get("borrower_id", "")).startswith("dealer:"),
      "T4 current_checkout.borrower_id does NOT start with 'dealer:'")

# ---------------------------------------------------------------------------
# TEST 2: tool_id filter on GET /api/warranty-claims
# ---------------------------------------------------------------------------
print("\n=== TEST 2: tool_id filter on GET /api/warranty-claims ===")
# Create 2 tools and flip them to broken via PUT to trigger auto-claim creation
print("\n  -- Setup: create T1c, T2c (not broken), then flip needs_repair=true via PUT")
r = http("POST", "/tools", json={"name": "Claim Tool A", "dealer_id": D1_id, "dealer_name": "Test Dealer"})
check(r.status_code == 200, "POST T1c = 200", r.status_code)
T1c = jget(r) or {}
T1c_id = T1c.get("id")
created_tool_ids.append(T1c_id)

r = http("POST", "/tools", json={"name": "Claim Tool B", "dealer_id": D1_id, "dealer_name": "Test Dealer"})
check(r.status_code == 200, "POST T2c = 200", r.status_code)
T2c = jget(r) or {}
T2c_id = T2c.get("id")
created_tool_ids.append(T2c_id)

# Flip T1c → broken (auto-creates claim)
r = http("PUT", f"/tools/{T1c_id}", json={
    "needs_repair": True,
    "repair_info": {
        "repair_status": "Reported",
        "company_notified": "Mac Tools",
        "contact": "555-A",
        "notified_at": "2026-04-26",
    },
})
check(r.status_code == 200, "PUT T1c → broken = 200", r.status_code)

# Flip T2c → broken (auto-creates claim)
r = http("PUT", f"/tools/{T2c_id}", json={
    "needs_repair": True,
    "repair_info": {
        "repair_status": "Reported",
        "company_notified": "Cornwell",
        "contact": "555-B",
        "notified_at": "2026-04-26",
    },
})
check(r.status_code == 200, "PUT T2c → broken = 200", r.status_code)

# GET /api/warranty-claims?tool_id=T1c.id → returns ONLY T1c's claim
r = http("GET", "/warranty-claims", params={"tool_id": T1c_id})
check(r.status_code == 200, "GET /warranty-claims?tool_id=T1c = 200", r.status_code)
items_t1 = jget(r) or []
check(isinstance(items_t1, list), "Response is a list")
check(len(items_t1) == 1, f"len(items_t1) == 1 (got {len(items_t1)})")
all_t1 = all(it.get("tool_id") == T1c_id for it in items_t1)
check(all_t1, "Every item has tool_id == T1c.id")

# GET /api/warranty-claims?tool_id=T1c.id&archived=false → still only T1c's open claim
r = http("GET", "/warranty-claims", params={"tool_id": T1c_id, "archived": "false"})
check(r.status_code == 200, "GET /warranty-claims?tool_id=T1c&archived=false = 200", r.status_code)
items_t1f = jget(r) or []
check(len(items_t1f) == 1, f"len(items with archived=false) == 1 (got {len(items_t1f)})")
check(all(it.get("tool_id") == T1c_id and it.get("claim_status") not in ("completed", "rejected") for it in items_t1f),
      "Every item belongs to T1c and is not completed/rejected")

# GET /api/warranty-claims (no tool_id) → returns all claims (>=2)
r = http("GET", "/warranty-claims")
check(r.status_code == 200, "GET /warranty-claims (no filter) = 200", r.status_code)
items_all = jget(r) or []
check(len(items_all) >= 2, f"len(all claims) >= 2 (got {len(items_all)})")
tool_ids_in_all = {it.get("tool_id") for it in items_all}
check(T1c_id in tool_ids_in_all, "All claims include T1c")
check(T2c_id in tool_ids_in_all, "All claims include T2c")

# Track claims for cleanup
for it in items_all:
    if it.get("tool_id") in (T1c_id, T2c_id, T1_id, T2_id, T3_id, T4_id):
        cid = it.get("id")
        if cid:
            created_claim_ids.append(cid)

# ---------------------------------------------------------------------------
# CLEANUP
# ---------------------------------------------------------------------------
print("\n=== CLEANUP ===")
for cid in set(created_claim_ids):
    try:
        r = http("DELETE", f"/warranty-claims/{cid}")
        print(f"  DELETE /warranty-claims/{cid} -> {r.status_code}")
    except Exception as e:
        print(f"  DELETE claim {cid} failed: {e}")

for tid in created_tool_ids:
    if tid:
        try:
            r = http("DELETE", f"/tools/{tid}")
            print(f"  DELETE /tools/{tid} -> {r.status_code}")
        except Exception as e:
            print(f"  DELETE tool {tid} failed: {e}")

for did in created_dealer_ids:
    if did:
        try:
            r = http("DELETE", f"/dealers/{did}")
            print(f"  DELETE /dealers/{did} -> {r.status_code}")
        except Exception as e:
            print(f"  DELETE dealer {did} failed: {e}")

# ---------------------------------------------------------------------------
# SUMMARY
# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
print(f"PASSED: {passed}")
print(f"FAILED: {failed}")
if failures:
    print("\nFAILURES:")
    for f in failures:
        print(f"  - {f}")
sys.exit(0 if failed == 0 else 1)
