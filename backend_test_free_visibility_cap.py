"""
Free-tier 15-item visibility cap middleware tests.

Tests the per-request middleware that, for FREE-tier users with > 15 tools,
auto-narrows EVERY query against the `tools` collection AND every collection
that joins on `tool_id` to only the 15 oldest tool ids (by created_at asc).

PRO / lifetime users see no change.

Run against the LOCAL backend at http://localhost:8001/api .
Direct mongo writes via motor (using MONGO_URL from /app/backend/.env)
are used to set up subscription state.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from motor.motor_asyncio import AsyncIOMotorClient

# Load env vars from backend/.env
ENV_PATH = Path("/app/backend/.env")
for line in ENV_PATH.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    v = v.strip()
    if v.startswith('"') and v.endswith('"'):
        v = v[1:-1]
    os.environ.setdefault(k.strip(), v)

BASE = "http://localhost:8001/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")

# Track results
RESULTS: List[Tuple[str, bool, str]] = []

def record(name: str, ok: bool, detail: str = ""):
    RESULTS.append((name, ok, detail))
    flag = "PASS" if ok else "FAIL"
    print(f"  [{flag}] {name}" + (f" — {detail}" if detail else ""))

def assert_eq(name: str, actual, expected, extra: str = ""):
    ok = actual == expected
    detail = f"expected {expected!r}, got {actual!r}"
    if extra:
        detail = f"{extra}; {detail}"
    record(name, ok, detail if not ok else f"={actual!r}")
    return ok

def assert_true(name: str, cond: bool, detail: str = ""):
    record(name, bool(cond), detail)
    return bool(cond)


# ============ HTTP helpers ============

def H(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}

def post(path: str, json: Optional[dict] = None, token: Optional[str] = None) -> requests.Response:
    headers = H(token) if token else {}
    return requests.post(f"{BASE}{path}", json=json or {}, headers=headers, timeout=30)

def get(path: str, token: Optional[str] = None, params: Optional[dict] = None) -> requests.Response:
    headers = H(token) if token else {}
    return requests.get(f"{BASE}{path}", headers=headers, params=params or {}, timeout=30)

def put(path: str, json: Optional[dict] = None, token: Optional[str] = None) -> requests.Response:
    headers = H(token) if token else {}
    return requests.put(f"{BASE}{path}", json=json or {}, headers=headers, timeout=30)


# ============ Mongo helpers (direct writes for subscription state) ============

async def grant_lifetime_pro(user_id: str):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.subscriptions.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "entitlement": "pro",
            "is_active": True,
            "is_lifetime": True,
            "product_id": "test_lifetime",
            "store": "TEST",
            "expires_at": "2099-12-31T23:59:59+00:00",
            "updated_at": now_iso,
        }},
        upsert=True,
    )
    client.close()

async def downgrade_to_free(user_id: str):
    """Downgrade by expiring subscription and clearing lifetime flag."""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.subscriptions.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "entitlement": "free",
            "is_active": False,
            "is_lifetime": False,
            "expires_at": "2020-01-01T00:00:00+00:00",
            "updated_at": now_iso,
        }},
        upsert=True,
    )
    client.close()

async def update_tools_created_at(user_id: str, tool_ids_in_order: List[str]):
    """Force created_at on tools so we have deterministic oldest-15 ordering."""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for i, tid in enumerate(tool_ids_in_order):
        ts = (base + timedelta(minutes=i)).isoformat()
        await db.tools.update_one(
            {"id": tid, "owner_id": user_id},
            {"$set": {"created_at": ts}},
        )
    client.close()

async def delete_user_data(user_id: str, email: str):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    for coll in [
        "tools", "subscriptions", "dealers", "warranty_claims",
        "claims", "claim_events", "claim_payments", "maintenance",
        "maintenance_logs", "checkouts", "checkout_history", "photos",
        "documents", "tool_history", "tool_changes", "locations",
        "categories", "tags", "borrowers",
    ]:
        try:
            await db[coll].delete_many({"owner_id": user_id})
        except Exception:
            pass
    await db.users.delete_many({"id": user_id})
    await db.users.delete_many({"email": email})
    client.close()


# ============ Test setup ============

def register_user(email: str, password: str = "Test12345!", name: str = "Cap Test") -> Tuple[str, str]:
    r = post("/auth/register", {"email": email, "password": password, "name": name})
    if r.status_code != 200:
        # Try login
        r = post("/auth/login", {"email": email, "password": password})
    assert r.status_code == 200, f"register/login failed: {r.status_code} {r.text}"
    body = r.json()
    return body["token"], body["user"]["id"]


def create_tool(token: str, idx: int, dealer_id: Optional[str] = None) -> Dict[str, Any]:
    payload = {
        "name": f"CapTest Tool {idx:02d}",
        "brand": "Snap-On",
        "cost": 100.0 + idx,
        "quantity": 1,
    }
    if dealer_id:
        payload["dealer_id"] = dealer_id
    r = post("/tools", payload, token=token)
    assert r.status_code == 200, f"create_tool {idx} failed: {r.status_code} {r.text}"
    return r.json()


def main():
    print("\n=== Free-tier 15-item visibility cap — test suite ===\n")

    # Fresh user setup
    email = f"capvis_{uuid.uuid4().hex[:8]}@example.com"
    password = "Capvis123!"
    print(f"[setup] registering fresh user {email}")
    token, uid = register_user(email, password)
    print(f"        user_id={uid}")

    # Upgrade to lifetime PRO so we can create 20 tools without hitting the free-tier limit
    print("[setup] grant lifetime PRO via direct mongo write")
    asyncio.run(grant_lifetime_pro(uid))

    # Verify subscription
    r = get("/subscription", token=token)
    assert_true(
        "subscription lookup returns pro=lifetime after grant",
        r.status_code == 200 and r.json().get("is_lifetime") is True
        and r.json().get("entitlement") == "pro",
        detail=str(r.status_code) + " " + r.text[:200],
    )

    # Create a dealer + 20 tools
    r = post("/dealers", {"name": f"CapTest Dealer {uuid.uuid4().hex[:4]}"}, token=token)
    assert r.status_code == 200, r.text
    dealer = r.json()
    dealer_id = dealer["id"]
    print(f"[setup] dealer created: {dealer_id}")

    print("[setup] creating 20 tools (PRO bypass active)…")
    tools: List[Dict[str, Any]] = []
    for i in range(20):
        tools.append(create_tool(token, i, dealer_id=dealer_id))
    assert len(tools) == 20

    # Force deterministic created_at ordering — tools[0] oldest, tools[19] newest
    tool_ids_ordered = [t["id"] for t in tools]
    asyncio.run(update_tools_created_at(uid, tool_ids_ordered))
    expected_oldest_15 = set(tool_ids_ordered[:15])
    expected_hidden_5 = set(tool_ids_ordered[15:])

    # ============ TEST 1 — DOWNGRADE TO FREE ============
    print("\n--- TEST 1 — Downgrade to FREE; expect 15-oldest visibility cap ---")
    asyncio.run(downgrade_to_free(uid))

    # Subscription confirms free
    r = get("/subscription", token=token)
    assert_true(
        "after downgrade subscription is free + not active",
        r.status_code == 200 and r.json().get("entitlement") == "free"
        and r.json().get("is_active") is False
        and r.json().get("is_lifetime") is False,
        detail=r.text[:200],
    )

    # 1a — GET /api/tools returns 15 oldest
    r = get("/tools", token=token)
    assert_true("GET /tools returns 200 (free, >15)", r.status_code == 200, r.text[:200])
    body = r.json()
    assert_eq("GET /tools returns exactly 15 items", len(body), 15)
    returned_ids = {t["id"] for t in body}
    assert_eq(
        "GET /tools returns exactly the 15 oldest ids",
        returned_ids, expected_oldest_15,
    )
    # Verify the 5 hidden ones are not present
    assert_true(
        "GET /tools does NOT include any of the 5 newest tools",
        returned_ids.isdisjoint(expected_hidden_5),
        f"overlap={returned_ids & expected_hidden_5}",
    )

    # 1b — GET /api/stats reflects only the 15
    r = get("/stats", token=token)
    if r.status_code == 200:
        s = r.json()
        assert_eq("GET /stats.total_tools == 15", s.get("total_tools"), 15)
        # Each tool was created with cost 100+i (i=0..19); oldest are 100..114
        expected_value = sum(100.0 + i for i in range(15))
        assert_eq("GET /stats.total_value reflects only 15 oldest", round(s.get("total_value", 0), 2), round(expected_value, 2))
    else:
        record("GET /stats returns 200 (free, >15)", False, f"{r.status_code} {r.text[:200]}")

    # 1c — GET /api/aggregate dashboard
    r = get("/aggregate", token=token)
    if r.status_code == 200:
        a = r.json()
        assert_eq("GET /aggregate.count == 15", a.get("count"), 15)
        expected_value = sum(100.0 + i for i in range(15))
        assert_eq("GET /aggregate.total_value reflects only 15 oldest", round(a.get("total_value", 0), 2), round(expected_value, 2))
    else:
        record("GET /aggregate returns 200 (free, >15)", False, f"{r.status_code} {r.text[:200]}")

    # 1d — warranty-claims summary + maintenance/upcoming + dealers
    r = get("/warranty-claims/summary", token=token)
    assert_true("GET /warranty-claims/summary returns 200 under cap", r.status_code == 200, r.text[:200])

    r = get("/maintenance/upcoming", token=token, params={"days": 365})
    assert_true("GET /maintenance/upcoming returns 200 under cap", r.status_code == 200, r.text[:200])

    r = get("/dealers", token=token)
    assert_true("GET /dealers returns 200 under cap", r.status_code == 200, r.text[:200])

    # Verify the 5 hidden tools' GET /tools/{id} returns 404 (cap applied to single-fetch)
    sample_hidden_id = next(iter(expected_hidden_5))
    r = get(f"/tools/{sample_hidden_id}", token=token)
    assert_true(
        "GET /tools/{hidden-id} returns 404 (single-fetch cap applies)",
        r.status_code == 404,
        f"{r.status_code} {r.text[:120]}",
    )

    # Verify a visible (oldest) tool's GET /tools/{id} still works
    sample_visible_id = tool_ids_ordered[0]
    r = get(f"/tools/{sample_visible_id}", token=token)
    assert_true(
        "GET /tools/{oldest-id} returns 200 (visible)",
        r.status_code == 200,
        f"{r.status_code} {r.text[:120]}",
    )

    # ============ TEST 2 — RE-PROMOTE TO PRO ============
    print("\n--- TEST 2 — Re-promote to lifetime PRO; cap is lifted ---")
    asyncio.run(grant_lifetime_pro(uid))

    r = get("/tools", token=token)
    assert_true("GET /tools returns 200 (pro, 20 tools)", r.status_code == 200, r.text[:200])
    body = r.json()
    assert_eq("GET /tools returns all 20 items after re-promotion", len(body), 20)

    r = get("/stats", token=token)
    if r.status_code == 200:
        s = r.json()
        assert_eq("GET /stats.total_tools == 20 (pro)", s.get("total_tools"), 20)

    r = get("/aggregate", token=token)
    if r.status_code == 200:
        a = r.json()
        assert_eq("GET /aggregate.count == 20 (pro)", a.get("count"), 20)

    # The previously-hidden tool is now visible
    r = get(f"/tools/{sample_hidden_id}", token=token)
    assert_true(
        "GET /tools/{previously-hidden-id} returns 200 once user is pro again",
        r.status_code == 200,
        f"{r.status_code} {r.text[:120]}",
    )

    # ============ TEST 3 — Free user with EXACTLY 15 — no cap ============
    print("\n--- TEST 3 — Free user with EXACTLY 15 tools should see all 15 (no filter) ---")
    # Delete tools[15..19] so we have exactly 15
    for t in tools[15:]:
        r = requests.delete(f"{BASE}/tools/{t['id']}", headers=H(token), timeout=30)
        assert_true(f"DELETE extra tool {t['name']}", r.status_code == 200, str(r.status_code))

    # Downgrade
    asyncio.run(downgrade_to_free(uid))

    r = get("/tools", token=token)
    assert_true("GET /tools returns 200 (free, exactly 15)", r.status_code == 200, r.text[:200])
    body = r.json()
    assert_eq("Free user with exactly 15 tools sees all 15 (no cap applied)", len(body), 15)

    # ============ TEST 4 — Free user creating 16th still gets 402 ============
    print("\n--- TEST 4 — Free user creating the 16th tool should still get 402 free_limit_exceeded ---")
    r = post("/tools", {"name": "16th Tool", "cost": 50, "quantity": 1}, token=token)
    assert_true(
        "POST /tools 16th returns 402",
        r.status_code == 402,
        f"{r.status_code} {r.text[:200]}",
    )
    if r.status_code == 402:
        body = r.json()
        detail = body.get("detail") if isinstance(body.get("detail"), dict) else body
        err = detail.get("error") if isinstance(detail, dict) else None
        assert_eq("402 detail.error == 'free_limit_exceeded'", err, "free_limit_exceeded")

    # ============ TEST 5 — No regression for PRO ============
    print("\n--- TEST 5 — Re-promote to PRO; verify regression-free across major endpoints ---")
    asyncio.run(grant_lifetime_pro(uid))

    # Still only 15 (because we deleted 5)
    r = get("/tools", token=token)
    assert_true("GET /tools 200 (pro, regression check)", r.status_code == 200, r.text[:200])
    assert_eq("GET /tools returns 15 (pro, after the 5 deletes)", len(r.json()), 15)

    for path in ["/stats", "/aggregate", "/dealers", "/warranty-claims/summary"]:
        r = get(path, token=token)
        assert_true(f"GET {path} 200 for pro user (no regression)", r.status_code == 200, f"{r.status_code} {r.text[:120]}")

    # Create one more tool — pro should bypass limit
    r = post("/tools", {"name": "PRO bypass tool", "cost": 10, "quantity": 1}, token=token)
    assert_true("PRO user can create 16th tool after re-upgrade", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        new_tool_id = r.json()["id"]
        # cleanup
        requests.delete(f"{BASE}/tools/{new_tool_id}", headers=H(token), timeout=30)

    # ============ CLEANUP ============
    print("\n[cleanup] deleting tools, dealer, and user data")
    for t in tools[:15]:
        try:
            requests.delete(f"{BASE}/tools/{t['id']}", headers=H(token), timeout=15)
        except Exception:
            pass
    try:
        requests.delete(f"{BASE}/dealers/{dealer_id}", headers=H(token), timeout=15)
    except Exception:
        pass
    asyncio.run(delete_user_data(uid, email))

    # ============ Summary ============
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    failed = sum(1 for _, ok, _ in RESULTS if not ok)
    total = len(RESULTS)
    print(f"\n=== RESULT: {passed}/{total} PASS, {failed} FAIL ===")
    if failed:
        print("\nFAILURES:")
        for name, ok, detail in RESULTS:
            if not ok:
                print(f"  - {name}: {detail}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
