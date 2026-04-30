"""
Backend tests for new RevenueCat endpoints:
  - POST /api/subscription/sync-revenuecat  (auth required)
  - POST /api/webhooks/revenuecat           (public; shared-secret auth)
Plus legacy backward-compat checks on /api/subscription/* mock endpoints.
"""

import os
import sys
import json
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://asset-locator-12.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
EMAIL = "subtest@example.com"
PASSWORD = "password123"

passes = 0
fails = 0
failures = []


def check(cond, label, extra=""):
    global passes, fails
    if cond:
        passes += 1
        print(f"  PASS  {label}")
    else:
        fails += 1
        failures.append(f"{label} — {extra}")
        print(f"  FAIL  {label}  :: {extra}")


def login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    return body["token"], body["user"]


def authed(tok):
    return {"Authorization": f"Bearer {tok}"}


def get_sub(tok):
    r = requests.get(f"{API}/subscription", headers=authed(tok), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["subscription"]


def main():
    print(f"\n=== RevenueCat backend tests against {API} ===\n")

    # Sanity: login
    tok, user = login()
    uid = user["id"]
    print(f"Logged in as {EMAIL} (id={uid})")

    # ========================================================================
    # 1) POST /api/subscription/sync-revenuecat
    # ========================================================================
    print("\n--- 1) /api/subscription/sync-revenuecat ---")

    # (auth) — no token
    r = requests.post(f"{API}/subscription/sync-revenuecat", json={"is_active": True}, timeout=30)
    check(r.status_code in (401, 403), "sync-revenuecat without auth → 401/403", f"got {r.status_code} body={r.text[:200]}")

    # (a) monthly
    body = {
        "is_active": True,
        "product_identifier": "rc_premium_monthly",
        "expires_at": "2099-01-01T00:00:00+00:00",
        "will_renew": True,
    }
    r = requests.post(f"{API}/subscription/sync-revenuecat", headers=authed(tok), json=body, timeout=30)
    check(r.status_code == 200, "1a sync monthly 200", f"status={r.status_code} body={r.text[:300]}")
    if r.status_code == 200:
        sub = r.json()["subscription"]
        check(sub["tier"] == "monthly", "1a tier=monthly", f"tier={sub['tier']}")
        check(sub["status"] == "active", "1a status=active", f"status={sub['status']}")
        check(sub["auto_renew"] is True, "1a auto_renew=true", f"auto_renew={sub['auto_renew']}")
        # verify via GET
        s = get_sub(tok)
        check(s["tier"] == "monthly" and s["status"] == "active" and s["auto_renew"] is True,
              "1a GET /subscription reflects monthly/active/auto_renew", f"s={s}")

    # (b) yearly
    body = {
        "is_active": True,
        "product_identifier": "rc_premium_yearly_50pct",
        "expires_at": "2099-01-01T00:00:00+00:00",
        "will_renew": True,
    }
    r = requests.post(f"{API}/subscription/sync-revenuecat", headers=authed(tok), json=body, timeout=30)
    check(r.status_code == 200, "1b sync yearly 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        sub = r.json()["subscription"]
        check(sub["tier"] == "yearly", "1b tier=yearly", f"tier={sub['tier']}")
        s = get_sub(tok)
        check(s["tier"] == "yearly", "1b GET /subscription yearly", f"s={s}")

    # (c) lifetime
    body = {"is_active": True, "product_identifier": "lifetime_unlock_v1", "will_renew": False}
    r = requests.post(f"{API}/subscription/sync-revenuecat", headers=authed(tok), json=body, timeout=30)
    check(r.status_code == 200, "1c sync lifetime 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        sub = r.json()["subscription"]
        check(sub["tier"] == "lifetime", "1c tier=lifetime", f"tier={sub['tier']}")
        check(sub["expires_at"] is None, "1c expires_at is null", f"expires_at={sub['expires_at']}")
        check(sub["auto_renew"] is False, "1c auto_renew=false", f"auto_renew={sub['auto_renew']}")
        s = get_sub(tok)
        check(s["tier"] == "lifetime" and s["expires_at"] is None and s["auto_renew"] is False,
              "1c GET confirms lifetime", f"s={s}")

    # (d) unknown product id → defaults to monthly
    body = {"is_active": True, "product_identifier": "some_random_id"}
    r = requests.post(f"{API}/subscription/sync-revenuecat", headers=authed(tok), json=body, timeout=30)
    check(r.status_code == 200, "1d sync unknown 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        sub = r.json()["subscription"]
        check(sub["tier"] == "monthly", "1d unknown → tier=monthly (fallback)", f"tier={sub['tier']}")

    # (e) is_active=false → downgrade
    body = {"is_active": False}
    r = requests.post(f"{API}/subscription/sync-revenuecat", headers=authed(tok), json=body, timeout=30)
    check(r.status_code == 200, "1e sync inactive 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        sub = r.json()["subscription"]
        check(sub["tier"] == "free", "1e tier=free", f"tier={sub['tier']}")
        check(sub["status"] == "expired", "1e status=expired", f"status={sub['status']}")
        s = get_sub(tok)
        # auth.evaluate_subscription_status may normalise further, but tier should stay free
        check(s["tier"] == "free", "1e GET confirms free", f"s={s}")

    # ========================================================================
    # 2) POST /api/webhooks/revenuecat
    # ========================================================================
    print("\n--- 2) /api/webhooks/revenuecat ---")

    WH = f"{API}/webhooks/revenuecat"

    # (a) INITIAL_PURCHASE monthly
    body = {"event": {"type": "INITIAL_PURCHASE", "app_user_id": uid,
                      "product_id": "rc_premium_monthly", "expiration_at_ms": 4070908800000}}
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2a INITIAL_PURCHASE → 200", f"status={r.status_code} body={r.text[:400]}")
    if r.status_code == 200:
        j = r.json()
        check(j.get("ok") is True and j.get("event") == "INITIAL_PURCHASE" and j.get("tier") == "monthly",
              "2a body {ok,event,tier}", f"body={j}")
        s = get_sub(tok)
        check(s["tier"] == "monthly", "2a GET /subscription shows monthly", f"s={s}")

    # (b) RENEWAL yearly
    body = {"event": {"type": "RENEWAL", "app_user_id": uid,
                      "product_id": "rc_premium_yearly", "expiration_at_ms": 4070908800000}}
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2b RENEWAL 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        check(j.get("tier") == "yearly", "2b tier=yearly", f"body={j}")
        s = get_sub(tok)
        check(s["tier"] == "yearly", "2b GET yearly", f"s={s}")

    # (c) CANCELLATION monthly (future expiry) → keeps access, auto_renew=false, status=cancelled
    body = {"event": {"type": "CANCELLATION", "app_user_id": uid,
                      "product_id": "rc_premium_monthly", "expiration_at_ms": 4070908800000}}
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2c CANCELLATION 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        check(j.get("tier") == "monthly", "2c tier=monthly", f"body={j}")
        s = get_sub(tok)
        check(s["tier"] == "monthly", "2c GET tier=monthly (kept)", f"s={s}")
        check(s["auto_renew"] is False, "2c auto_renew=false", f"s={s}")
        check(s["status"] == "cancelled", "2c status=cancelled", f"s={s}")

    # (d) EXPIRATION → downgrade to free
    body = {"event": {"type": "EXPIRATION", "app_user_id": uid,
                      "product_id": "rc_premium_monthly"}}
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2d EXPIRATION 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        s = get_sub(tok)
        check(s["tier"] == "free", "2d GET tier=free", f"s={s}")
        check(s["status"] == "expired", "2d status=expired", f"s={s}")

    # (e) unknown event → ignored
    body = {"event": {"type": "SOMETHING_NEW", "app_user_id": uid,
                      "product_id": "rc_premium_monthly"}}
    # Pre-snapshot subscription to verify no change
    pre = get_sub(tok)
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2e unknown event 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        check(j.get("ok") is True and j.get("ignored") == "SOMETHING_NEW",
              "2e body {ok, ignored: SOMETHING_NEW}", f"body={j}")
        post = get_sub(tok)
        check(pre == post, "2e subscription unchanged", f"pre={pre} post={post}")

    # (f) missing app_user_id
    body = {"event": {"type": "INITIAL_PURCHASE", "product_id": "rc_premium_monthly"}}
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2f missing app_user_id 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        check(j.get("ok") is True and j.get("skipped") is True,
              "2f body {ok, skipped:true}", f"body={j}")

    # (g) unknown app_user_id
    body = {"event": {"type": "INITIAL_PURCHASE", "app_user_id": "does_not_exist",
                      "product_id": "rc_premium_monthly"}}
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2g unknown user 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        check(j.get("ok") is True and j.get("user_not_found") is True,
              "2g body {ok, user_not_found:true}", f"body={j}")

    # ========================================================================
    # 3) Backwards-compat legacy endpoints
    # ========================================================================
    print("\n--- 3) Legacy mock subscription endpoints ---")

    # Make sure we start on free (set by 2d). Subscribe monthly.
    r = requests.post(f"{API}/subscription/subscribe", headers=authed(tok), json={"tier": "monthly"}, timeout=30)
    check(r.status_code == 200, "3a POST /subscribe monthly 200", f"status={r.status_code} body={r.text[:300]}")
    if r.status_code == 200:
        sub = r.json()["subscription"]
        check(sub["tier"] == "monthly" and sub["status"] == "active" and sub["auto_renew"] is True,
              "3a monthly active auto_renew", f"sub={sub}")

    # cancel
    r = requests.post(f"{API}/subscription/cancel", headers=authed(tok), timeout=30)
    check(r.status_code == 200, "3b POST /cancel 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        sub = r.json()["subscription"]
        check(sub["status"] == "cancelled" and sub["auto_renew"] is False,
              "3b cancelled + auto_renew=false", f"sub={sub}")

    # reactivate
    r = requests.post(f"{API}/subscription/reactivate", headers=authed(tok), timeout=30)
    check(r.status_code == 200, "3c POST /reactivate 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        sub = r.json()["subscription"]
        check(sub["status"] == "active" and sub["auto_renew"] is True,
              "3c active+auto_renew", f"sub={sub}")

    # redeem-code invalid
    r = requests.post(f"{API}/subscription/redeem-code", headers=authed(tok), json={"code": "not-a-real-code"}, timeout=30)
    check(r.status_code == 400, "3d POST /redeem-code invalid → 400", f"status={r.status_code} body={r.text[:300]}")

    # Put user back to free for cleanliness
    requests.post(f"{API}/subscription/subscribe", headers=authed(tok), json={"tier": "free"}, timeout=30)

    # ----- Summary -----
    print("\n=== RESULTS ===")
    print(f"PASS: {passes}  FAIL: {fails}")
    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(f"  - {f}")
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"FATAL: {e}")
        sys.exit(2)
