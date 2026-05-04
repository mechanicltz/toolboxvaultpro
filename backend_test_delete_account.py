"""
Test DELETE /api/auth/account endpoint.
Tests: wrong password, empty password, unauthorized, happy path, regression.
"""
import os
import sys
import time
import json
import uuid
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://asset-locator-12.preview.emergentagent.com").rstrip("/") + "/api"
SUBTEST_EMAIL = "subtest@example.com"
SUBTEST_PW = "password123"

passed = []
failed = []

def check(cond, msg):
    if cond:
        passed.append(msg)
        print(f"  PASS: {msg}")
    else:
        failed.append(msg)
        print(f"  FAIL: {msg}")

def login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=30)
    return r

def register(email, pw, name):
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": pw, "name": name}, timeout=30)
    return r

print(f"Testing against: {BASE}")
print()

# =========================================================
# TEST 1: Wrong password
# =========================================================
print("=== TEST 1: Wrong password against subtest user ===")
r = login(SUBTEST_EMAIL, SUBTEST_PW)
check(r.status_code == 200, f"Login subtest → 200 (got {r.status_code})")
if r.status_code != 200:
    print("Cannot continue without login:", r.text)
    sys.exit(1)

sub_token = r.json()["token"]
sub_headers = {"Authorization": f"Bearer {sub_token}"}

r = requests.delete(f"{BASE}/auth/account", json={"password": "wrong"}, headers=sub_headers, timeout=30)
check(r.status_code == 401, f"DELETE /auth/account wrong pw → 401 (got {r.status_code}, body={r.text[:200]})")
try:
    detail = r.json().get("detail", "")
except Exception:
    detail = ""
check(detail == "Incorrect password", f"Detail 'Incorrect password' (got '{detail}')")

# Verify account still exists
r = requests.get(f"{BASE}/auth/me", headers=sub_headers, timeout=30)
check(r.status_code == 200, f"GET /auth/me after wrong-pw still 200 (got {r.status_code})")

# =========================================================
# TEST 2: Empty password
# =========================================================
print("\n=== TEST 2: Empty password ===")
r = requests.delete(f"{BASE}/auth/account", json={"password": ""}, headers=sub_headers, timeout=30)
check(r.status_code == 401, f"DELETE /auth/account empty pw → 401 (got {r.status_code})")

# =========================================================
# TEST 3: Unauthorized
# =========================================================
print("\n=== TEST 3: No Authorization header ===")
r = requests.delete(f"{BASE}/auth/account", json={"password": SUBTEST_PW}, timeout=30)
check(r.status_code == 401, f"DELETE /auth/account no auth → 401 (got {r.status_code})")

# =========================================================
# TEST 4: Happy path (throwaway user)
# =========================================================
print("\n=== TEST 4: Happy path with throwaway user ===")
unique = uuid.uuid4().hex[:10]
tt_email = f"delete-test-{unique}@example.com"
tt_pw = "tempPass123"
tt_name = "Delete Tester"

r = register(tt_email, tt_pw, tt_name)
check(r.status_code == 200, f"Register throwaway → 200 (got {r.status_code}, body={r.text[:200]})")
if r.status_code != 200:
    sys.exit(1)
tt_token = r.json()["token"]
tt_user_id = r.json()["user"]["id"]
tt_headers = {"Authorization": f"Bearer {tt_token}"}
print(f"  Throwaway email: {tt_email}")
print(f"  Throwaway user_id: {tt_user_id}")

# 4b: Create data
r = requests.post(f"{BASE}/locations", json={"name": "Test Loc"}, headers=tt_headers, timeout=30)
check(r.status_code == 200, f"POST /locations → 200 (got {r.status_code}, body={r.text[:200]})")
loc_id = r.json().get("id") if r.status_code == 200 else None

r = requests.post(f"{BASE}/dealers", json={"name": "Test Dealer"}, headers=tt_headers, timeout=30)
check(r.status_code == 200, f"POST /dealers → 200 (got {r.status_code}, body={r.text[:200]})")
dealer_id = r.json().get("id") if r.status_code == 200 else None

r = requests.post(f"{BASE}/tools", json={"name": "Test Tool", "quantity": 1}, headers=tt_headers, timeout=30)
check(r.status_code == 200, f"POST /tools → 200 (got {r.status_code}, body={r.text[:200]})")
tool_id = r.json().get("id") if r.status_code == 200 else None

# Verify 3 items exist
r = requests.get(f"{BASE}/tools", headers=tt_headers, timeout=30)
n_tools = len(r.json()) if r.status_code == 200 else 0
r = requests.get(f"{BASE}/dealers", headers=tt_headers, timeout=30)
n_dealers = len(r.json()) if r.status_code == 200 else 0
r = requests.get(f"{BASE}/locations", headers=tt_headers, timeout=30)
n_locs = len(r.json()) if r.status_code == 200 else 0
print(f"  Pre-delete counts: tools={n_tools}, dealers={n_dealers}, locations={n_locs}")

# 4c: DELETE account
r = requests.delete(f"{BASE}/auth/account", json={"password": tt_pw}, headers=tt_headers, timeout=30)
check(r.status_code == 200, f"DELETE /auth/account happy → 200 (got {r.status_code}, body={r.text[:500]})")
if r.status_code == 200:
    body = r.json()
    print(f"  Response: {json.dumps(body, indent=2)[:600]}")
    check(body.get("ok") is True, f"ok==true (got {body.get('ok')})")
    deleted = body.get("deleted", {})
    total = deleted.get("total", 0)
    check(total >= 3, f"deleted.total >= 3 (got {total})")
    colls = deleted.get("collections", {})
    check("tools" in colls, f"deleted.collections contains 'tools' (got keys: {list(colls.keys())})")
    check("dealers" in colls, f"deleted.collections contains 'dealers'")
    check("locations" in colls, f"deleted.collections contains 'locations'")
    check(colls.get("tools", 0) >= 1, f"tools count >= 1 (got {colls.get('tools')})")
    check(colls.get("dealers", 0) >= 1, f"dealers count >= 1 (got {colls.get('dealers')})")
    check(colls.get("locations", 0) >= 1, f"locations count >= 1 (got {colls.get('locations')})")
    check(deleted.get("user_id") == tt_user_id, f"deleted.user_id matches (got {deleted.get('user_id')})")

# 4d: GET /auth/me with same token → 401
r = requests.get(f"{BASE}/auth/me", headers=tt_headers, timeout=30)
check(r.status_code == 401, f"GET /auth/me after delete → 401 (got {r.status_code})")

# 4e: Login with same email → 401
r = login(tt_email, tt_pw)
check(r.status_code == 401, f"Login after delete → 401 (got {r.status_code})")

# 4f: Re-register with same email + fresh password
r = register(tt_email, "freshPass456", "Take Two")
check(r.status_code == 200, f"Re-register same email → 200 (got {r.status_code}, body={r.text[:200]})")
if r.status_code == 200:
    tt2_token = r.json()["token"]
    tt2_headers = {"Authorization": f"Bearer {tt2_token}"}

    # 4g: GET /tools → empty
    r = requests.get(f"{BASE}/tools", headers=tt2_headers, timeout=30)
    check(r.status_code == 200, f"GET /tools new user → 200 (got {r.status_code})")
    tools_list = r.json() if r.status_code == 200 else None
    check(isinstance(tools_list, list) and len(tools_list) == 0, f"Tools list empty (got {len(tools_list) if isinstance(tools_list, list) else 'not a list'})")

    # Clean up: delete the re-registered user
    r = requests.delete(f"{BASE}/auth/account", json={"password": "freshPass456"}, headers=tt2_headers, timeout=30)
    check(r.status_code == 200, f"Cleanup DELETE re-registered user → 200 (got {r.status_code})")

# =========================================================
# TEST 5: Smoke regression — subtest user still works
# =========================================================
print("\n=== TEST 5: Subtest user smoke regression ===")
r = login(SUBTEST_EMAIL, SUBTEST_PW)
check(r.status_code == 200, f"Subtest login still works → 200 (got {r.status_code})")
if r.status_code == 200:
    tok = r.json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.get(f"{BASE}/auth/me", headers=h, timeout=30)
    check(r.status_code == 200, f"GET /auth/me → 200 (got {r.status_code})")
    r = requests.get(f"{BASE}/tools", headers=h, timeout=30)
    check(r.status_code == 200, f"GET /tools → 200 (got {r.status_code})")
    r = requests.get(f"{BASE}/dealers", headers=h, timeout=30)
    check(r.status_code == 200, f"GET /dealers → 200 (got {r.status_code})")

print("\n" + "="*60)
print(f"RESULTS: {len(passed)}/{len(passed)+len(failed)} PASS, {len(failed)} FAIL")
print("="*60)
if failed:
    print("\nFAILURES:")
    for f in failed:
        print(f"  - {f}")
    sys.exit(1)
else:
    print("ALL CHECKS PASSED")
    sys.exit(0)
