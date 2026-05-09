"""
Phase 2 RevenueCat Subscription Integration — Backend Tests.

Tests:
  1. GET /api/subscription
  2. POST /api/revenuecat/webhook
  3. POST /api/promo/redeem (404 path)
  4. GET /api/guides
  5. 15-item free-tier enforcement on POST /api/tools, /api/tools/import,
     /api/wishlist/{id}/convert
  6. Regression smoke for subtest@example.com
"""
import os
import sys
import time
import uuid
import json
import requests

BASE = "https://asset-locator-12.preview.emergentagent.com/api"
SUBTEST_EMAIL = "subtest@example.com"
SUBTEST_PASSWORD = "password123"
WEBHOOK_SECRET = "test-webhook-secret-12345"

PASS = 0
FAIL = 0
FAIL_DETAILS = []


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {label}")
    else:
        FAIL += 1
        FAIL_DETAILS.append(f"{label}: {detail}")
        print(f"  ❌ {label} :: {detail}")


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        raise RuntimeError(f"Login failed for {email}: {r.status_code} {r.text}")
    return r.json()["token"]


def register(email, password, name="Test User"):
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": password, "name": name})
    if r.status_code != 200:
        raise RuntimeError(f"Register failed for {email}: {r.status_code} {r.text}")
    j = r.json()
    return j["token"], j["user"]


def H(token):
    return {"Authorization": f"Bearer {token}"}


def section(title):
    print(f"\n=== {title} ===")


# ---------------------------------------------------------------------------
# 1. GET /api/subscription — pro user (subtest)
# ---------------------------------------------------------------------------
def test_subscription_pro():
    section("1a. GET /api/subscription — Pro user (subtest)")
    tok = login(SUBTEST_EMAIL, SUBTEST_PASSWORD)
    r = requests.get(f"{BASE}/subscription", headers=H(tok))
    check("status=200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    if r.status_code != 200:
        return tok
    j = r.json()
    check("entitlement=='pro'", j.get("entitlement") == "pro", f"got {j.get('entitlement')!r}")
    check("is_lifetime==True", j.get("is_lifetime") is True, f"got {j.get('is_lifetime')!r}")
    check("is_active==True", j.get("is_active") is True, f"got {j.get('is_active')!r}")
    check("free_limit==15", j.get("free_limit") == 15, f"got {j.get('free_limit')!r}")
    return tok


def test_subscription_free(fresh_token):
    section("1b. GET /api/subscription — Fresh free user")
    r = requests.get(f"{BASE}/subscription", headers=H(fresh_token))
    check("status=200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    if r.status_code != 200:
        return
    j = r.json()
    check("entitlement=='free'", j.get("entitlement") == "free", f"got {j.get('entitlement')!r}")
    check("is_active==False", j.get("is_active") is False, f"got {j.get('is_active')!r}")
    check("free_limit==15", j.get("free_limit") == 15, f"got {j.get('free_limit')!r}")


# ---------------------------------------------------------------------------
# 2. POST /api/revenuecat/webhook — auth + lifecycle
# ---------------------------------------------------------------------------
def webhook_post(headers_extra, body):
    h = {}
    h.update(headers_extra or {})
    return requests.post(f"{BASE}/revenuecat/webhook", headers=h, json=body)


def test_webhook_auth_paths():
    section("2a. Webhook auth paths")
    body = {"event": {"type": "INITIAL_PURCHASE", "app_user_id": "x"}}
    r = webhook_post(None, body)
    check("no header → 401", r.status_code == 401, f"got {r.status_code}")
    r = webhook_post({"Authorization": "Bearer wrong-secret"}, body)
    check("wrong secret → 401", r.status_code == 401, f"got {r.status_code}")
    r = webhook_post({"Authorization": f"Bearer {WEBHOOK_SECRET}"},
                     {"event": {"type": "INITIAL_PURCHASE", "app_user_id": "noop-test-user-zzz"}})
    check("correct secret → 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")


def test_webhook_lifecycle(fresh_user_id, fresh_token):
    section("2b. Webhook lifecycle on a fresh user")
    H_W = {"Authorization": f"Bearer {WEBHOOK_SECRET}"}
    future_ms = int((time.time() + 30 * 24 * 3600) * 1000)
    past_ms = int((time.time() - 1 * 24 * 3600) * 1000)

    # (a) INITIAL_PURCHASE
    r = webhook_post(H_W, {"event": {
        "type": "INITIAL_PURCHASE",
        "app_user_id": fresh_user_id,
        "product_id": "pro_monthly",
        "period_type": "NORMAL",
        "store": "APP_STORE",
        "purchased_at_ms": int(time.time() * 1000),
        "expiration_at_ms": future_ms,
    }})
    check("INITIAL_PURCHASE 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    sub = requests.get(f"{BASE}/subscription", headers=H(fresh_token)).json()
    check("after INITIAL_PURCHASE entitlement='pro'", sub.get("entitlement") == "pro", f"got {sub.get('entitlement')!r}")
    check("after INITIAL_PURCHASE is_active=True", sub.get("is_active") is True, f"got {sub.get('is_active')!r}")
    check("after INITIAL_PURCHASE will_renew=True", sub.get("will_renew") is True, f"got {sub.get('will_renew')!r}")

    # (b) RENEWAL
    r = webhook_post(H_W, {"event": {
        "type": "RENEWAL",
        "app_user_id": fresh_user_id,
        "product_id": "pro_monthly",
        "expiration_at_ms": future_ms + 30 * 24 * 3600 * 1000,
    }})
    check("RENEWAL 200", r.status_code == 200)
    sub = requests.get(f"{BASE}/subscription", headers=H(fresh_token)).json()
    check("after RENEWAL entitlement='pro'", sub.get("entitlement") == "pro")
    check("after RENEWAL will_renew=True", sub.get("will_renew") is True)

    # (c) CANCELLATION
    r = webhook_post(H_W, {"event": {
        "type": "CANCELLATION",
        "app_user_id": fresh_user_id,
        "product_id": "pro_monthly",
        "expiration_at_ms": future_ms + 30 * 24 * 3600 * 1000,
    }})
    check("CANCELLATION 200", r.status_code == 200)
    sub = requests.get(f"{BASE}/subscription", headers=H(fresh_token)).json()
    check("after CANCELLATION will_renew=False", sub.get("will_renew") is False, f"got {sub.get('will_renew')!r}")
    check("after CANCELLATION is_active still True (future expires)", sub.get("is_active") is True, f"got {sub.get('is_active')!r}")

    # (d) EXPIRATION with past expiration → is_active=False
    r = webhook_post(H_W, {"event": {
        "type": "EXPIRATION",
        "app_user_id": fresh_user_id,
        "product_id": "pro_monthly",
        "expiration_at_ms": past_ms,
    }})
    check("EXPIRATION 200", r.status_code == 200)
    sub = requests.get(f"{BASE}/subscription", headers=H(fresh_token)).json()
    check("after EXPIRATION is_active=False", sub.get("is_active") is False, f"got {sub.get('is_active')!r}")

    # (e) REFUND → entitlement free, is_active false
    # First reset to pro:
    r = webhook_post(H_W, {"event": {
        "type": "INITIAL_PURCHASE",
        "app_user_id": fresh_user_id,
        "product_id": "pro_monthly",
        "expiration_at_ms": future_ms,
    }})
    check("re-PURCHASE for refund test 200", r.status_code == 200)
    r = webhook_post(H_W, {"event": {
        "type": "REFUND",
        "app_user_id": fresh_user_id,
        "product_id": "pro_monthly",
    }})
    check("REFUND 200", r.status_code == 200)
    sub = requests.get(f"{BASE}/subscription", headers=H(fresh_token)).json()
    check("after REFUND entitlement='free'", sub.get("entitlement") == "free", f"got {sub.get('entitlement')!r}")
    check("after REFUND is_active=False", sub.get("is_active") is False, f"got {sub.get('is_active')!r}")


# ---------------------------------------------------------------------------
# 3. POST /api/promo/redeem — 404 path
# ---------------------------------------------------------------------------
def test_promo_redeem_404(token):
    section("3. POST /api/promo/redeem (404 path — no codes seeded)")
    r = requests.post(f"{BASE}/promo/redeem", headers=H(token), json={"code": "DEFINITELY_NOT_A_REAL_CODE_XYZ"})
    check("status=404", r.status_code == 404, f"got {r.status_code} {r.text[:200]}")


# ---------------------------------------------------------------------------
# 4. GET /api/guides — public, html, ≥30KB
# ---------------------------------------------------------------------------
def test_guides_public():
    section("4. GET /api/guides — public HTML")
    r = requests.get(f"{BASE}/guides")
    check("status=200", r.status_code == 200, f"got {r.status_code}")
    ct = r.headers.get("content-type", "")
    check("content-type contains text/html", "text/html" in ct, f"got {ct!r}")
    size = len(r.content)
    check("size >= 30KB", size >= 30 * 1024, f"got {size} bytes")


# ---------------------------------------------------------------------------
# 5. 15-item limit enforcement
# ---------------------------------------------------------------------------
def test_tool_create_limit():
    section("5a. POST /api/tools — 15-item free limit on a fresh user")
    email = f"limit_{uuid.uuid4().hex[:10]}@example.com"
    tok, user = register(email, "password123", name="Limit Test")
    uid = user["id"]
    created_ids = []
    for i in range(15):
        r = requests.post(f"{BASE}/tools", headers=H(tok), json={"name": f"T{i+1}", "quantity": 1})
        if r.status_code != 200:
            check(f"create tool #{i+1} (200)", False, f"got {r.status_code} {r.text[:200]}")
            return uid, tok, created_ids
        created_ids.append(r.json()["id"])
    check("15 tools created (200 each)", len(created_ids) == 15)

    # 16th
    r = requests.post(f"{BASE}/tools", headers=H(tok), json={"name": "T16", "quantity": 1})
    check("16th tool → 402", r.status_code == 402, f"got {r.status_code} {r.text[:200]}")
    if r.status_code == 402:
        try:
            body = r.json()
            d = body.get("detail")
            if isinstance(d, dict):
                check("body.detail.error=='free_limit_exceeded'", d.get("error") == "free_limit_exceeded", f"got {d.get('error')!r}")
                check("body.detail.limit==15", d.get("limit") == 15, f"got {d.get('limit')!r}")
                check("body.detail.current==15", d.get("current") == 15, f"got {d.get('current')!r}")
                check("body.detail has 'message'", isinstance(d.get("message"), str) and len(d.get("message")) > 0, f"got {d.get('message')!r}")
            else:
                check("body.detail is dict", False, f"got {type(d).__name__}")
        except Exception as e:
            check("body parsable as JSON", False, str(e))

    # 17th too
    r = requests.post(f"{BASE}/tools", headers=H(tok), json={"name": "T17", "quantity": 1})
    check("17th tool → 402", r.status_code == 402, f"got {r.status_code}")

    return uid, tok, created_ids


def test_upgrade_via_webhook_unblocks(uid, tok):
    section("5b. After webhook upgrade, further tool creates succeed")
    H_W = {"Authorization": f"Bearer {WEBHOOK_SECRET}"}
    future_ms = int((time.time() + 365 * 24 * 3600) * 1000)
    r = webhook_post(H_W, {"event": {
        "type": "INITIAL_PURCHASE",
        "app_user_id": uid,
        "product_id": "pro_yearly",
        "period_type": "NORMAL",
        "store": "APP_STORE",
        "purchased_at_ms": int(time.time() * 1000),
        "expiration_at_ms": future_ms,
    }})
    check("upgrade webhook 200", r.status_code == 200)
    # Confirm via /subscription
    sub = requests.get(f"{BASE}/subscription", headers=H(tok)).json()
    check("entitlement now pro", sub.get("entitlement") == "pro")
    check("is_active True", sub.get("is_active") is True)
    # Create 3 more tools
    new_ids = []
    for i in range(3):
        r = requests.post(f"{BASE}/tools", headers=H(tok), json={"name": f"PostUpgrade-{i}", "quantity": 1})
        if r.status_code == 200:
            new_ids.append(r.json()["id"])
    check("3 more tools created post-upgrade", len(new_ids) == 3, f"got {len(new_ids)} created")
    return new_ids


def test_import_limit():
    section("5c. POST /api/tools/import with 17 rows on fresh user → 402")
    email = f"import_{uuid.uuid4().hex[:10]}@example.com"
    tok, user = register(email, "password123", name="Import Test")
    rows = [{"name": f"I{i}", "quantity": 1} for i in range(17)]
    r = requests.post(f"{BASE}/tools/import", headers=H(tok), json={"rows": rows})
    check("import 17 rows on free user → 402", r.status_code == 402, f"got {r.status_code} {r.text[:300]}")
    if r.status_code == 402:
        try:
            d = r.json().get("detail")
            if isinstance(d, dict):
                check("import.detail.error=='free_limit_exceeded'", d.get("error") == "free_limit_exceeded", f"got {d.get('error')!r}")
                check("import.detail.limit==15", d.get("limit") == 15)
        except Exception:
            pass
    return user["id"], tok


def test_wishlist_convert_limit():
    section("5d. POST /api/wishlist/{id}/convert by free user at 15 → 402")
    email = f"wlconv_{uuid.uuid4().hex[:10]}@example.com"
    tok, user = register(email, "password123", name="WL Convert Test")
    # Create 15 tools to fill the limit
    for i in range(15):
        r = requests.post(f"{BASE}/tools", headers=H(tok), json={"name": f"FF{i}", "quantity": 1})
        if r.status_code != 200:
            check(f"setup tool #{i+1}", False, f"got {r.status_code}")
            return
    # Create wishlist item
    r = requests.post(f"{BASE}/wishlist", headers=H(tok), json={"name": "Cordless Drill", "price": 199.0})
    if r.status_code != 200:
        check("create wishlist item (200)", False, f"got {r.status_code} {r.text[:200]}")
        return
    wl_id = r.json()["id"]
    r = requests.post(f"{BASE}/wishlist/{wl_id}/convert", headers=H(tok))
    check("convert at limit → 402", r.status_code == 402, f"got {r.status_code} {r.text[:300]}")
    if r.status_code == 402:
        try:
            d = r.json().get("detail")
            if isinstance(d, dict):
                check("convert.detail.error=='free_limit_exceeded'", d.get("error") == "free_limit_exceeded", f"got {d.get('error')!r}")
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 6. Regression smoke on subtest
# ---------------------------------------------------------------------------
def test_regression_smoke(token):
    section("6. Regression smoke — subtest@example.com")
    endpoints = [
        ("/tools", 200),
        ("/locations", 200),
        ("/dealers", 200),
        ("/categories", 200),
        ("/tags", 200),
        ("/borrowers", 200),
        ("/wishlist", 200),
        ("/maintenance/upcoming", 200),
        ("/warranty-claims/summary", 200),
        ("/aggregate", 200),
        ("/stats", 200),
    ]
    for path, expected in endpoints:
        r = requests.get(f"{BASE}{path}", headers=H(token))
        check(f"GET {path} → {expected}", r.status_code == expected, f"got {r.status_code} {r.text[:150]}")

    # POST /api/tools as subtest (lifetime pro) — must not be blocked
    r = requests.post(f"{BASE}/tools", headers=H(token), json={"name": f"SubtestPro-{uuid.uuid4().hex[:6]}", "quantity": 1})
    check("subtest can create tool (lifetime pro)", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        # Cleanup
        try:
            tid = r.json()["id"]
            requests.delete(f"{BASE}/tools/{tid}", headers=H(token))
        except Exception:
            pass

    # /api/health
    r = requests.get(f"{BASE}/health")
    check("GET /health → 200", r.status_code == 200)
    if r.status_code == 200:
        try:
            check("/health body status=='ok'", r.json().get("status") == "ok", f"got {r.json()}")
        except Exception as e:
            check("/health body parsable", False, str(e))

    # /api/auth/login
    r = requests.post(f"{BASE}/auth/login", json={"email": SUBTEST_EMAIL, "password": SUBTEST_PASSWORD})
    check("/auth/login → 200", r.status_code == 200, f"got {r.status_code}")
    # /api/auth/register with random
    eml = f"reg_{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(f"{BASE}/auth/register", json={"email": eml, "password": "password123", "name": "Reg test"})
    check("/auth/register fresh → 200", r.status_code == 200, f"got {r.status_code}")
    # /api/auth/forgot-password
    r = requests.post(f"{BASE}/auth/forgot-password", json={"email": "nobody-test@example.com"})
    check("/auth/forgot-password → 200", r.status_code == 200, f"got {r.status_code}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print(f"Phase 2 RevenueCat test against {BASE}")
    # Subscription endpoint — pro
    subtest_token = test_subscription_pro()

    # Register fresh user for free-tier subscription test
    fresh_email = f"free_{uuid.uuid4().hex[:10]}@example.com"
    fresh_tok, fresh_user = register(fresh_email, "password123", name="Fresh Free")
    fresh_uid = fresh_user["id"]
    test_subscription_free(fresh_tok)

    # Webhook auth + lifecycle
    test_webhook_auth_paths()
    test_webhook_lifecycle(fresh_uid, fresh_tok)

    # promo/redeem 404
    test_promo_redeem_404(subtest_token)

    # guides
    test_guides_public()

    # 15-item limit
    uid, tok, _ = test_tool_create_limit()
    test_upgrade_via_webhook_unblocks(uid, tok)
    test_import_limit()
    test_wishlist_convert_limit()

    # Regression
    test_regression_smoke(subtest_token)

    print(f"\n=== RESULT: {PASS} PASS / {FAIL} FAIL ===")
    if FAIL:
        print("\nFailures:")
        for f in FAIL_DETAILS:
            print(f"  - {f}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
