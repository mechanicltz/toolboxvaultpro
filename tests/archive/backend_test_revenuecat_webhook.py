"""
Focused retest: ONLY the RevenueCat webhook (section 2 from prior test).
After main agent's middleware fix exempting /api/webhooks/* from JWT auth.
"""
import os
import sys
import requests

# Use the public preview backend URL from /app/frontend/.env (REACT_APP_BACKEND_URL / EXPO_PUBLIC_BACKEND_URL).
BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://toolbox-vault-v3.preview.emergentagent.com").rstrip("/")
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
        failures.append(f"{label} :: {extra}")
        print(f"  FAIL  {label}  :: {extra}")


def login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    return body["token"], body["user"]


def authed(tok):
    return {"Authorization": f"Bearer {tok}"}


def me(tok):
    r = requests.get(f"{API}/auth/me", headers=authed(tok), timeout=30)
    assert r.status_code == 200, f"/auth/me failed: {r.status_code} {r.text}"
    return r.json()


def get_sub(tok):
    r = requests.get(f"{API}/subscription", headers=authed(tok), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["subscription"]


def main():
    print(f"\n=== RevenueCat WEBHOOK retest against {API} ===\n")

    tok, _ = login()
    user = me(tok)
    uid = user["id"]
    print(f"Logged in as {EMAIL} (id={uid})")

    WH = f"{API}/webhooks/revenuecat"

    # Pre-set subscription to a known state by hitting sync (to make CANCELLATION/EXPIRATION verifiable).
    # Not strictly required — webhook 2a will overwrite it.

    # (a) INITIAL_PURCHASE monthly
    print("\n--- 2a INITIAL_PURCHASE → tier=monthly ---")
    body = {"event": {"type": "INITIAL_PURCHASE", "app_user_id": uid,
                      "product_id": "rc_premium_monthly", "expiration_at_ms": 4070908800000}}
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2a INITIAL_PURCHASE → 200", f"status={r.status_code} body={r.text[:400]}")
    if r.status_code == 200:
        j = r.json()
        check(j.get("ok") is True, "2a body.ok=true", f"body={j}")
        check(j.get("event") == "INITIAL_PURCHASE", "2a body.event=INITIAL_PURCHASE", f"body={j}")
        check(j.get("tier") == "monthly", "2a body.tier=monthly", f"body={j}")
        s = get_sub(tok)
        check(s["tier"] == "monthly", "2a GET /subscription tier=monthly", f"s={s}")
        check(s["status"] == "active", "2a GET status=active", f"s={s}")

    # (b) RENEWAL yearly
    print("\n--- 2b RENEWAL with year product → tier=yearly ---")
    body = {"event": {"type": "RENEWAL", "app_user_id": uid,
                      "product_id": "rc_premium_yearly", "expiration_at_ms": 4070908800000}}
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2b RENEWAL 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        check(j.get("ok") is True, "2b body.ok=true", f"body={j}")
        check(j.get("tier") == "yearly", "2b body.tier=yearly", f"body={j}")
        s = get_sub(tok)
        check(s["tier"] == "yearly", "2b GET tier=yearly", f"s={s}")

    # (c) CANCELLATION with future expiration → keeps tier, sets auto_renew=false, status=cancelled
    print("\n--- 2c CANCELLATION (future expiry) → keep tier, auto_renew=false, status=cancelled ---")
    body = {"event": {"type": "CANCELLATION", "app_user_id": uid,
                      "product_id": "rc_premium_yearly", "expiration_at_ms": 4070908800000}}
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2c CANCELLATION 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        check(j.get("ok") is True, "2c body.ok=true", f"body={j}")
        s = get_sub(tok)
        # Should keep yearly tier (since expiry is far future)
        check(s["tier"] == "yearly", "2c GET tier=yearly (kept)", f"s={s}")
        check(s["auto_renew"] is False, "2c auto_renew=false", f"s={s}")
        check(s["status"] == "cancelled", "2c status=cancelled", f"s={s}")

    # (d) EXPIRATION → tier=free, status=expired
    print("\n--- 2d EXPIRATION → tier=free, status=expired ---")
    body = {"event": {"type": "EXPIRATION", "app_user_id": uid,
                      "product_id": "rc_premium_yearly"}}
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2d EXPIRATION 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        check(j.get("ok") is True, "2d body.ok=true", f"body={j}")
        s = get_sub(tok)
        check(s["tier"] == "free", "2d GET tier=free", f"s={s}")
        check(s["status"] == "expired", "2d GET status=expired", f"s={s}")

    # (e) Unknown event_type → 200 {ok:true, ignored}
    print("\n--- 2e Unknown event_type → 200 {ok, ignored} ---")
    pre = get_sub(tok)
    body = {"event": {"type": "SOMETHING_NEW", "app_user_id": uid,
                      "product_id": "rc_premium_monthly"}}
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2e unknown event 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        check(j.get("ok") is True, "2e body.ok=true", f"body={j}")
        check(j.get("ignored") == "SOMETHING_NEW", "2e body.ignored=SOMETHING_NEW", f"body={j}")
        post = get_sub(tok)
        check(pre == post, "2e subscription unchanged", f"pre={pre} post={post}")

    # (f) Missing app_user_id → 200 {ok:true, skipped:true}
    print("\n--- 2f Missing app_user_id → 200 {ok, skipped} ---")
    body = {"event": {"type": "INITIAL_PURCHASE", "product_id": "rc_premium_monthly"}}
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2f missing app_user_id 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        check(j.get("ok") is True, "2f body.ok=true", f"body={j}")
        check(j.get("skipped") is True, "2f body.skipped=true", f"body={j}")

    # (g) Unknown app_user_id → 200 {ok:true, user_not_found:true}
    print("\n--- 2g Unknown app_user_id → 200 {ok, user_not_found} ---")
    body = {"event": {"type": "INITIAL_PURCHASE", "app_user_id": "does_not_exist_zzz",
                      "product_id": "rc_premium_monthly"}}
    r = requests.post(WH, json=body, timeout=30)
    check(r.status_code == 200, "2g unknown user 200", f"body={r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        check(j.get("ok") is True, "2g body.ok=true", f"body={j}")
        check(j.get("user_not_found") is True, "2g body.user_not_found=true", f"body={j}")

    # Restore user to free for cleanliness
    requests.post(f"{API}/subscription/subscribe", headers=authed(tok), json={"tier": "free"}, timeout=30)

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
