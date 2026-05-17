"""
RevenueCat backend integration verification.
"""
import json
import sys
import requests

BASE = "http://localhost:8001/api"
WEBHOOK_SECRET = "wh_secret_X9k2mP7nQ4vR8tL3cF6aB1jH5wE0sD2y"
SECRET_KEY = "sk_kNrBjIXJWUIYvjzqoBzIGLYwnJNeS"

ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASSWORD = "Blue321!"
ALT_EMAIL = "test@test.com"
ALT_PASSWORD = "Blue321!"

results = []

def record(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    results.append((name, status, detail))
    print(f"[{status}] {name} :: {detail[:400]}")


# Test 1: health
try:
    r = requests.get(f"{BASE}/health", timeout=10)
    body = r.json()
    ok = r.status_code == 200 and body.get("status") == "ok"
    record("1. GET /api/health", ok, f"HTTP {r.status_code} body={body}")
except Exception as e:
    record("1. GET /api/health", False, f"exception: {e}")

WH_BODY = {"event": {"type": "TEST", "app_user_id": "test_user_smoke_001", "environment": "SANDBOX"}}

# Test 2: webhook auth success
try:
    r = requests.post(f"{BASE}/revenuecat/webhook",
        headers={"Authorization": WEBHOOK_SECRET, "Content-Type": "application/json"},
        data=json.dumps(WH_BODY), timeout=10)
    ok = r.status_code in (200, 202)
    record("2. webhook (correct secret)", ok, f"HTTP {r.status_code} body={r.text[:200]}")
except Exception as e:
    record("2. webhook (correct secret)", False, f"exception: {e}")

# Test 2b: Bearer
try:
    r = requests.post(f"{BASE}/revenuecat/webhook",
        headers={"Authorization": f"Bearer {WEBHOOK_SECRET}", "Content-Type": "application/json"},
        data=json.dumps(WH_BODY), timeout=10)
    ok = r.status_code in (200, 202)
    record("2b. webhook (Bearer <secret>)", ok, f"HTTP {r.status_code} body={r.text[:200]}")
except Exception as e:
    record("2b. webhook (Bearer)", False, f"exception: {e}")

# Test 3: wrong secret
try:
    r = requests.post(f"{BASE}/revenuecat/webhook",
        headers={"Authorization": "completely_wrong_secret_xyz", "Content-Type": "application/json"},
        data=json.dumps(WH_BODY), timeout=10)
    ok = r.status_code in (401, 403)
    record("3. webhook (wrong secret) -> 401/403", ok, f"HTTP {r.status_code} body={r.text[:200]}")
except Exception as e:
    record("3. webhook (wrong secret)", False, f"exception: {e}")

# Test 4: no header
try:
    r = requests.post(f"{BASE}/revenuecat/webhook",
        headers={"Content-Type": "application/json"},
        data=json.dumps(WH_BODY), timeout=10)
    ok = r.status_code in (401, 403)
    record("4. webhook (no auth header) -> 401/403", ok, f"HTTP {r.status_code} body={r.text[:200]}")
except Exception as e:
    record("4. webhook (no auth header)", False, f"exception: {e}")

# Login
def try_login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=10)
    if r.status_code == 200:
        body = r.json()
        return body.get("access_token") or body.get("token"), body
    return None, {"status": r.status_code, "body": r.text[:200]}

token = None
used_email = None
tok, info = try_login(ADMIN_EMAIL, ADMIN_PASSWORD)
if tok:
    token, used_email = tok, ADMIN_EMAIL
else:
    print(f"  MechanicLTZ login failed: {info}")
    tok2, info2 = try_login(ALT_EMAIL, ALT_PASSWORD)
    if tok2:
        token, used_email = tok2, ALT_EMAIL
    else:
        print(f"  test@test.com login failed: {info2}")

if not token:
    record("5. login", False, "Both credentials failed")
else:
    record("5.login", True, f"logged in as {used_email}")
    auth_h = {"Authorization": f"Bearer {token}"}

    try:
        r = requests.get(f"{BASE}/subscription", headers=auth_h, timeout=10)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
        ok = r.status_code == 200 and isinstance(body, dict)
        record("5a. GET /api/subscription", ok, f"HTTP {r.status_code} body={json.dumps(body)[:300] if isinstance(body, dict) else body[:300]}")
    except Exception as e:
        record("5a. GET /api/subscription", False, f"exception: {e}")

    try:
        r = requests.post(f"{BASE}/subscription/sync", headers={**auth_h, "Content-Type": "application/json"},
            data=json.dumps({"is_active": False, "tier": "free"}), timeout=10)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
        ok = r.status_code == 200
        record("5b. POST /api/subscription/sync", ok, f"HTTP {r.status_code} body={json.dumps(body)[:300] if isinstance(body, dict) else body[:300]}")
    except Exception as e:
        record("5b. POST /api/subscription/sync", False, f"exception: {e}")

    try:
        r = requests.get(f"{BASE}/admin/user-stats", headers=auth_h, timeout=10)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
        ok = r.status_code == 200
        record("6. GET /api/admin/user-stats", ok, f"HTTP {r.status_code} body={json.dumps(body)[:300] if isinstance(body, dict) else body[:300]}")
    except Exception as e:
        record("6. GET /api/admin/user-stats", False, f"exception: {e}")

# Test 7: code inspection
try:
    with open("/app/backend/subscriptions.py", "r") as f:
        src = f.read()
    has_env_read = '_env("REVENUECAT_SECRET_KEY")' in src or "_env('REVENUECAT_SECRET_KEY')" in src
    has_promo_grant = "/v1/subscribers/" in src and "/promotional" in src
    has_webhook_env = '_env("REVENUECAT_WEBHOOK_SECRET")' in src or "_env('REVENUECAT_WEBHOOK_SECRET')" in src
    ok = has_env_read and has_promo_grant and has_webhook_env
    record("7. code: env reads + promo grant path",
           ok,
           f"_env(REVENUECAT_SECRET_KEY)={has_env_read}, RC promotional URL={has_promo_grant}, _env(REVENUECAT_WEBHOOK_SECRET)={has_webhook_env}")
except Exception as e:
    record("7. code inspection", False, f"exception: {e}")

print("\n" + "=" * 70)
print("SUMMARY")
print("=" * 70)
passed = sum(1 for _, s, _ in results if s == "PASS")
total = len(results)
for name, status, _ in results:
    print(f"  [{status}] {name}")
print(f"\n{passed}/{total} passed")
sys.exit(0 if passed == total else 1)
