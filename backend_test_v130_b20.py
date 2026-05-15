"""
v1.3.0 build 20 — test two backend changes:
  1. GET /api/warranty-alerts + GET /api/stats now EXCLUDE tools where
     is_sold=true OR lost_status.is_lost=true.
  2. NEW endpoint POST /api/dev/downgrade-to-free — any authenticated user
     can forcibly downgrade their own subscription.

Runs against EXPO_PUBLIC_BACKEND_URL/api (production preview URL).
Registers a fresh disposable user — does NOT mutate subtest@ or
MechanicLTZ@gmail.com.
"""

import os
import sys
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import requests
from dotenv import load_dotenv

# Load preview URL
load_dotenv("/app/frontend/.env")
BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"

PASSED: list[str] = []
FAILED: list[str] = []


def ok(msg: str):
    PASSED.append(msg)
    print(f"  ✅ {msg}")


def bad(msg: str):
    FAILED.append(msg)
    print(f"  ❌ {msg}")


def req(method: str, path: str, *, token: str | None = None, json=None, params=None, expected_status: int | None = 200):
    url = f"{BASE}{path}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = requests.request(method, url, headers=headers, json=json, params=params, timeout=30)
    if expected_status is not None and resp.status_code != expected_status:
        print(f"     [{method} {path}] expected {expected_status}, got {resp.status_code}: {resp.text[:300]}")
    return resp


# ---------- TEST 1 — warranty alerts exclude sold/lost/stolen ----------
def test_warranty_exclusion(token: str):
    print("\n=== TEST 1 — Warranty alerts EXCLUDE sold/lost/stolen tools ===")

    today = datetime.now(timezone.utc).date()
    expiry_iso = (today + timedelta(days=30)).isoformat()

    # Create 4 tools all with warranty enabled and expiring in 30 days
    names = ["WarrantyActive_v130b20", "WarrantySold_v130b20", "WarrantyLost_v130b20", "WarrantyStolen_v130b20"]
    tool_ids: dict[str, str] = {}
    for nm in names:
        body = {
            "name": nm,
            "quantity": 1,
            "cost": 25.0,
            "warranty": {
                "has_warranty": True,
                "expiry_date": expiry_iso,
                "coverage_type": "months",
                "length_months": 12,
            },
        }
        r = req("POST", "/tools", token=token, json=body, expected_status=200)
        if r.status_code != 200:
            bad(f"Create tool {nm} failed: {r.status_code} {r.text[:200]}")
            return tool_ids
        j = r.json()
        tool_ids[nm] = j["id"]
        # confirm warranty persisted
        w = j.get("warranty") or {}
        if w.get("has_warranty") and w.get("expiry_date") == expiry_iso:
            ok(f"Created {nm} with warranty expiry {expiry_iso}")
        else:
            bad(f"Tool {nm} did not persist warranty: warranty={w}")

    # Mark Sold
    sold_id = tool_ids["WarrantySold_v130b20"]
    r = req("POST", f"/tools/{sold_id}/mark-sold", token=token,
            json={"sold_at": "2026-01-01", "sold_price": 50, "sold_to": "buyer"})
    if r.status_code == 200 and r.json().get("is_sold") is True:
        ok("Marked WarrantySold as sold (is_sold=true)")
    else:
        bad(f"mark-sold failed: {r.status_code} {r.text[:200]}")

    # Mark Lost
    lost_id = tool_ids["WarrantyLost_v130b20"]
    r = req("POST", f"/tools/{lost_id}/report-lost", token=token,
            json={"type": "lost", "reported_date": "2026-01-01", "notes": "Left at job site"})
    if r.status_code == 200:
        ls = (r.json().get("lost_status") or {})
        if ls.get("is_lost") is True and ls.get("type") == "lost":
            ok("Marked WarrantyLost as lost (lost_status.is_lost=true,type=lost)")
        else:
            bad(f"report-lost lost_status unexpected: {ls}")
    else:
        bad(f"report-lost (lost) failed: {r.status_code} {r.text[:200]}")

    # Mark Stolen
    stolen_id = tool_ids["WarrantyStolen_v130b20"]
    r = req("POST", f"/tools/{stolen_id}/report-lost", token=token,
            json={"type": "stolen", "reported_date": "2026-01-01", "notes": "Truck break-in"})
    if r.status_code == 200:
        ls = (r.json().get("lost_status") or {})
        if ls.get("is_lost") is True and ls.get("type") == "stolen":
            ok("Marked WarrantyStolen as stolen (lost_status.is_lost=true,type=stolen)")
        else:
            bad(f"report-lost stolen_status unexpected: {ls}")
    else:
        bad(f"report-lost (stolen) failed: {r.status_code} {r.text[:200]}")

    active_id = tool_ids["WarrantyActive_v130b20"]

    # GET /api/warranty-alerts → expect only Active in 'expiring'
    r = req("GET", "/warranty-alerts", token=token, expected_status=200)
    if r.status_code != 200:
        bad(f"GET /warranty-alerts failed: {r.status_code} {r.text[:200]}")
    else:
        j = r.json()
        expiring = j.get("expiring") or []
        expired = j.get("expired") or []
        our_expiring = [t for t in expiring if t.get("id") in tool_ids.values()]
        our_expired = [t for t in expired if t.get("id") in tool_ids.values()]
        if len(our_expiring) == 1 and our_expiring[0]["id"] == active_id:
            ok(f"warranty-alerts.expiring contains exactly the 1 Active tool (id={active_id})")
        else:
            bad(f"warranty-alerts.expiring expected [Active only], got ids={[t.get('id') for t in our_expiring]} (full={our_expiring})")
        # Sold/Lost/Stolen MUST NOT appear in either array
        bad_ids = {sold_id, lost_id, stolen_id}
        leaks_expiring = [t["id"] for t in expiring if t.get("id") in bad_ids]
        leaks_expired = [t["id"] for t in expired if t.get("id") in bad_ids]
        if not leaks_expiring and not leaks_expired:
            ok("Sold/Lost/Stolen tools NOT present in warranty-alerts.expiring or .expired")
        else:
            bad(f"Sold/Lost/Stolen leaked into warranty-alerts: expiring={leaks_expiring}, expired={leaks_expired}")

    # GET /api/stats
    r = req("GET", "/stats", token=token, expected_status=200)
    if r.status_code != 200:
        bad(f"GET /stats failed: {r.status_code} {r.text[:200]}")
    else:
        s = r.json()
        # We are the only tools with warranty for this fresh user so stats should be 1 / 0 globally for this user
        if s.get("warranty_expiring_soon") == 1:
            ok("stats.warranty_expiring_soon == 1")
        else:
            bad(f"stats.warranty_expiring_soon expected 1, got {s.get('warranty_expiring_soon')}")
        if s.get("warranty_expired") == 0:
            ok("stats.warranty_expired == 0")
        else:
            bad(f"stats.warranty_expired expected 0, got {s.get('warranty_expired')}")

    return tool_ids


# ---------- TEST 2 — dev self-downgrade endpoint ----------
async def promote_user_to_lifetime_pro(user_id: str):
    """Bypass: write directly to mongo to grant lifetime PRO."""
    from motor.motor_asyncio import AsyncIOMotorClient
    load_dotenv("/app/backend/.env")
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    d = cli[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc).isoformat()
    sub = {
        "user_id": user_id,
        "entitlement": "pro",
        "is_active": True,
        "is_lifetime": True,
        "will_renew": False,
        "product_id": "promo_lifetime",
        "promo_code": "TEST_HARNESS",
        "purchased_at": now,
        "expires_at": "2099-12-31T00:00:00+00:00",
        "raw": {},
        "updated_at": now,
    }
    await d.subscriptions.update_one(
        {"user_id": user_id}, {"$set": sub}, upsert=True
    )
    cli.close()


def test_dev_downgrade(token: str, user_id: str):
    print("\n=== TEST 2 — POST /api/dev/downgrade-to-free ===")

    # Step 1: promote to lifetime PRO via direct mongo write
    asyncio.run(promote_user_to_lifetime_pro(user_id))

    # Verify GET /subscription shows is_active=true
    r = req("GET", "/subscription", token=token, expected_status=200)
    if r.status_code != 200:
        bad(f"GET /subscription failed: {r.status_code} {r.text[:200]}")
        return
    sub = r.json()
    if sub.get("entitlement") == "pro" and sub.get("is_active") is True and sub.get("is_lifetime") is True:
        ok("After mongo-promote: GET /subscription shows entitlement=pro, is_active=true, is_lifetime=true")
    else:
        bad(f"Promotion didn't stick: {sub}")

    # Step 2: POST /api/dev/downgrade-to-free
    r = req("POST", "/dev/downgrade-to-free", token=token, json=None, expected_status=200)
    if r.status_code != 200:
        bad(f"POST /dev/downgrade-to-free failed: {r.status_code} {r.text[:300]}")
        return
    body = r.json()
    print(f"     response body: {body}")
    checks = {
        "ok": True,
        "entitlement": "free",
        "is_active": False,
        "is_lifetime": False,
    }
    for k, expected in checks.items():
        if body.get(k) == expected:
            ok(f"downgrade response body[{k}] == {expected}")
        else:
            bad(f"downgrade response body[{k}] expected {expected}, got {body.get(k)!r}")

    # Step 3: GET /api/subscription → verify
    r = req("GET", "/subscription", token=token, expected_status=200)
    if r.status_code != 200:
        bad(f"GET /subscription after downgrade failed: {r.status_code} {r.text[:200]}")
        return
    sub = r.json()
    print(f"     subscription after downgrade: entitlement={sub.get('entitlement')} is_active={sub.get('is_active')} "
          f"is_lifetime={sub.get('is_lifetime')} expires_at={sub.get('expires_at')}")
    if sub.get("entitlement") == "free":
        ok("GET /subscription.entitlement == 'free'")
    else:
        bad(f"GET /subscription.entitlement expected 'free', got {sub.get('entitlement')!r}")
    if sub.get("is_active") is False:
        ok("GET /subscription.is_active == false")
    else:
        bad(f"GET /subscription.is_active expected false, got {sub.get('is_active')!r}")
    if sub.get("is_lifetime") is False:
        ok("GET /subscription.is_lifetime == false")
    else:
        bad(f"GET /subscription.is_lifetime expected false, got {sub.get('is_lifetime')!r}")
    expires = sub.get("expires_at") or ""
    if isinstance(expires, str) and expires.startswith("2020"):
        ok(f"GET /subscription.expires_at is in the past (starts with 2020): {expires!r}")
    else:
        bad(f"GET /subscription.expires_at expected to start with '2020', got {expires!r}")


# ---------- Cleanup ----------
async def cleanup_user_mongo(user_id: str):
    from motor.motor_asyncio import AsyncIOMotorClient
    load_dotenv("/app/backend/.env")
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    d = cli[os.environ["DB_NAME"]]
    await d.users.delete_many({"id": user_id})
    await d.subscriptions.delete_many({"user_id": user_id})
    await d.tools.delete_many({"owner_id": user_id})
    await d.warranty_claims.delete_many({"owner_id": user_id})
    cli.close()


# ---------- Main ----------
def main():
    # Register a fresh disposable user
    email = f"wartest_{uuid.uuid4().hex[:8]}@example.com"
    password = "Pass123!"
    print(f"Registering fresh user {email} ...")
    r = req("POST", "/auth/register", json={"email": email, "password": password, "name": "WarTest"},
            expected_status=200)
    if r.status_code != 200:
        print(f"FATAL: registration failed: {r.status_code} {r.text[:300]}")
        sys.exit(2)
    auth = r.json()
    token = auth["token"]
    user_id = auth["user"]["id"]
    print(f"  Token acquired, user_id={user_id}")

    tool_ids: dict[str, str] = {}
    try:
        tool_ids = test_warranty_exclusion(token)
        test_dev_downgrade(token, user_id)
    finally:
        # Cleanup: delete tools then mongo records
        print("\n=== Cleanup ===")
        for nm, tid in tool_ids.items():
            r = req("DELETE", f"/tools/{tid}", token=token, expected_status=None)
            print(f"  DELETE /tools/{tid} [{nm}] → {r.status_code}")
        try:
            asyncio.run(cleanup_user_mongo(user_id))
            print(f"  mongo: deleted user {user_id} + subscription + leftover tools")
        except Exception as e:
            print(f"  mongo cleanup error: {e}")

    print("\n" + "=" * 60)
    print(f"SUMMARY: {len(PASSED)} PASS, {len(FAILED)} FAIL")
    print("=" * 60)
    if FAILED:
        print("\nFailures:")
        for m in FAILED:
            print(f"  ❌ {m}")
        sys.exit(1)
    print("All checks passed ✅")


if __name__ == "__main__":
    main()
