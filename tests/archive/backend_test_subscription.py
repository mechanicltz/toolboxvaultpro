"""Backend test for Toolbox Tracker auth + subscription system."""
import os
import sys
import time
import requests
from pathlib import Path
from datetime import datetime, timezone

ENV_PATH = Path("/app/frontend/.env")
BASE = None
for line in ENV_PATH.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE = line.split("=", 1)[1].strip().strip('"')
        break
assert BASE, "EXPO_PUBLIC_BACKEND_URL not set"
API = BASE.rstrip("/") + "/api"
print(f"API base: {API}")

PASS = 0
FAIL = 0
FAIL_DETAILS = []


def check(label, cond, details=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        FAIL_DETAILS.append(f"{label}: {details}")
        print(f"  FAIL  {label}  ::  {details}")


def headers(token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


SUBTEST_EMAIL = "subtest@example.com"
SUBTEST_PASSWORD = "password123"

# ---------- 1. AUTH FLOW ----------
print("\n=== 1. AUTH FLOW ===")

r = requests.post(f"{API}/auth/login",
                  json={"email": SUBTEST_EMAIL, "password": SUBTEST_PASSWORD})
check("(1.e) login subtest -> 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")

if r.status_code != 200:
    rr = requests.post(f"{API}/auth/register",
                       json={"email": SUBTEST_EMAIL, "password": SUBTEST_PASSWORD,
                             "name": "Sub Test"})
    if rr.status_code == 200:
        r = requests.post(f"{API}/auth/login",
                          json={"email": SUBTEST_EMAIL, "password": SUBTEST_PASSWORD})

subtest_token = None
subtest_user = None
if r.status_code == 200:
    j = r.json()
    subtest_token = j.get("token")
    subtest_user = j.get("user")
    check("(1.e) login response has token + user",
          bool(subtest_token) and bool(subtest_user),
          f"keys={list(j.keys())}")

# 1.a
new_email = f"newuser_{int(time.time())}@test.com"
r = requests.post(f"{API}/auth/register",
                  json={"email": new_email, "password": "password123", "name": "New User"})
check("(1.a) register new email -> 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
new_user_token = None
if r.status_code == 200:
    j = r.json()
    new_user_token = j.get("token")
    user = j.get("user", {})
    sub = (user or {}).get("subscription", {})
    check("(1.a) returned token + user", bool(new_user_token) and bool(user))
    check("(1.a) subscription.tier == 'free'",
          sub.get("tier") == "free", f"got tier={sub.get('tier')}")

# 1.b
r2 = requests.post(f"{API}/auth/register",
                   json={"email": new_email, "password": "password123", "name": "Dup"})
check("(1.b) re-register same email -> 400",
      r2.status_code == 400, f"status={r2.status_code} body={r2.text[:200]}")

# 1.c
r3 = requests.post(f"{API}/auth/register",
                   json={"email": f"short_{int(time.time())}@test.com",
                         "password": "abc", "name": "Short"})
check("(1.c) password<6 -> 400",
      r3.status_code == 400, f"status={r3.status_code} body={r3.text[:200]}")

# 1.d
r4 = requests.post(f"{API}/auth/login",
                   json={"email": SUBTEST_EMAIL, "password": "wrongpassword"})
check("(1.d) wrong password -> 401",
      r4.status_code == 401, f"status={r4.status_code} body={r4.text[:200]}")

# 1.f
r5 = requests.get(f"{API}/auth/me")
check("(1.f) /auth/me no auth -> 401",
      r5.status_code == 401, f"status={r5.status_code}")

# 1.g
r6 = requests.get(f"{API}/auth/me", headers=headers(subtest_token))
check("(1.g) /auth/me valid token -> 200",
      r6.status_code == 200, f"status={r6.status_code}")
if r6.status_code == 200:
    me = r6.json()
    check("(1.g) email matches",
          me.get("email") == SUBTEST_EMAIL, f"got {me.get('email')}")

# 1.h
r7 = requests.get(f"{API}/tools")
check("(1.h) /tools no auth -> 401",
      r7.status_code == 401, f"status={r7.status_code}")

# 1.i
r8 = requests.get(f"{API}/tools", headers=headers(subtest_token))
check("(1.i) /tools subtest -> 200",
      r8.status_code == 200, f"status={r8.status_code}")
subtest_initial_tools = []
if r8.status_code == 200:
    subtest_initial_tools = r8.json()
    check("(1.i) tools is list",
          isinstance(subtest_initial_tools, list))
    print(f"      subtest legacy tools: {len(subtest_initial_tools)}")


# ---------- 2. PER-USER DATA ISOLATION ----------
print("\n=== 2. PER-USER DATA ISOLATION ===")

ts = int(time.time())
user2_email = f"user2_{ts}@test.com"
r = requests.post(f"{API}/auth/register",
                  json={"email": user2_email, "password": "password123",
                        "name": "User Two"})
check("(2.a) register user2 -> 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
user2_token = r.json().get("token") if r.status_code == 200 else None

r = requests.get(f"{API}/tools", headers=headers(user2_token))
check("(2.b) user2 /tools -> 200", r.status_code == 200)
if r.status_code == 200:
    arr = r.json()
    check("(2.b) user2 tools EMPTY",
          isinstance(arr, list) and len(arr) == 0,
          f"len={len(arr)} sample={arr[:1]}")

r = requests.get(f"{API}/dealers", headers=headers(user2_token))
check("(2.c) user2 /dealers -> 200", r.status_code == 200)
if r.status_code == 200:
    arr = r.json()
    check("(2.c) user2 dealers EMPTY",
          isinstance(arr, list) and len(arr) == 0,
          f"len={len(arr)}")

r = requests.post(f"{API}/tools", headers=headers(user2_token),
                  json={"name": "User2 Hammer", "brand": "Estwing", "cost": 35.0})
check("(2.d) user2 POST /tools -> 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
user2_tool_id = r.json().get("id") if r.status_code == 200 else None
r = requests.get(f"{API}/tools", headers=headers(user2_token))
if r.status_code == 200:
    arr = r.json()
    check("(2.d) user2 tools length 1",
          isinstance(arr, list) and len(arr) == 1, f"len={len(arr)}")

r = requests.get(f"{API}/tools", headers=headers(subtest_token))
if r.status_code == 200:
    arr = r.json()
    ids = [t.get("id") for t in arr]
    check("(2.e) subtest doesn't see user2's tool",
          user2_tool_id not in ids, f"user2 id leaked")
    check("(2.e) subtest tool count unchanged",
          len(arr) == len(subtest_initial_tools),
          f"before={len(subtest_initial_tools)} after={len(arr)}")


# ---------- 3. SUBSCRIPTION ENDPOINTS ----------
print("\n=== 3. SUBSCRIPTION ENDPOINTS ===")

r = requests.get(f"{API}/subscription", headers=headers(subtest_token))
check("(3.a) GET /subscription -> 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
if r.status_code == 200:
    j = r.json()
    check("(3.a) keys present",
          all(k in j for k in ["subscription", "is_premium", "tier_prices",
                               "free_limits", "counts"]),
          f"keys={list(j.keys())}")
    tp = j.get("tier_prices") or {}
    check("(3.a) tier_prices match",
          tp.get("free") == 0 and tp.get("monthly") == 9.99 and
          tp.get("yearly") == 100 and tp.get("lifetime") == 499,
          f"got {tp}")
    fl = j.get("free_limits") or {}
    check("(3.a) free_limits match",
          fl.get("tools") == 10 and fl.get("dealers") == 1 and
          fl.get("agents_per_dealer") == 1, f"got {fl}")
    counts = j.get("counts") or {}
    check("(3.a) counts.tools numeric",
          isinstance(counts.get("tools"), (int, float)), f"got {counts.get('tools')}")
    check("(3.a) counts.dealers numeric",
          isinstance(counts.get("dealers"), (int, float)),
          f"got {counts.get('dealers')}")

# 3.b monthly
r = requests.post(f"{API}/subscription/subscribe", headers=headers(subtest_token),
                  json={"tier": "monthly"})
check("(3.b) subscribe monthly -> 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
if r.status_code == 200:
    sub = r.json().get("subscription", {})
    check("(3.b) tier monthly", sub.get("tier") == "monthly")
    check("(3.b) status active", sub.get("status") == "active")
    check("(3.b) auto_renew True", sub.get("auto_renew") is True)
    exp = sub.get("expires_at")
    check("(3.b) expires_at set", bool(exp))
    if exp:
        days = (datetime.fromisoformat(exp.replace("Z", "+00:00")) -
                datetime.now(timezone.utc)).days
        check("(3.b) ~30 days", 28 <= days <= 31, f"days={days}")

# 3.c yearly
r = requests.post(f"{API}/subscription/subscribe", headers=headers(subtest_token),
                  json={"tier": "yearly"})
check("(3.c) subscribe yearly -> 200",
      r.status_code == 200, f"status={r.status_code}")
if r.status_code == 200:
    sub = r.json().get("subscription", {})
    check("(3.c) tier yearly", sub.get("tier") == "yearly")
    exp = sub.get("expires_at")
    if exp:
        days = (datetime.fromisoformat(exp.replace("Z", "+00:00")) -
                datetime.now(timezone.utc)).days
        check("(3.c) ~365 days", 363 <= days <= 366, f"days={days}")

# 3.d lifetime
r = requests.post(f"{API}/subscription/subscribe", headers=headers(subtest_token),
                  json={"tier": "lifetime"})
check("(3.d) subscribe lifetime -> 200", r.status_code == 200)
if r.status_code == 200:
    sub = r.json().get("subscription", {})
    check("(3.d) tier lifetime", sub.get("tier") == "lifetime")
    check("(3.d) expires_at None", sub.get("expires_at") is None)
    check("(3.d) auto_renew False", sub.get("auto_renew") is False)

# 3.e invalid
r = requests.post(f"{API}/subscription/subscribe", headers=headers(subtest_token),
                  json={"tier": "invalid"})
check("(3.e) subscribe invalid -> 400",
      r.status_code == 400, f"status={r.status_code}")

# 3.f cancel lifetime
r = requests.post(f"{API}/subscription/cancel", headers=headers(subtest_token))
check("(3.f) cancel on lifetime -> 400",
      r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")

# 3.g monthly + cancel
r = requests.post(f"{API}/subscription/subscribe", headers=headers(subtest_token),
                  json={"tier": "monthly"})
check("(3.g pre) monthly", r.status_code == 200)
r = requests.post(f"{API}/subscription/cancel", headers=headers(subtest_token))
check("(3.g) cancel monthly -> 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
if r.status_code == 200:
    sub = r.json().get("subscription", {})
    check("(3.g) status cancelled", sub.get("status") == "cancelled")
    check("(3.g) auto_renew False", sub.get("auto_renew") is False)
    check("(3.g) tier still monthly", sub.get("tier") == "monthly")

# 3.h reactivate
r = requests.post(f"{API}/subscription/reactivate", headers=headers(subtest_token))
check("(3.h) reactivate -> 200", r.status_code == 200)
if r.status_code == 200:
    sub = r.json().get("subscription", {})
    check("(3.h) status active", sub.get("status") == "active")
    check("(3.h) auto_renew True", sub.get("auto_renew") is True)

# 3.i free
r = requests.post(f"{API}/subscription/subscribe", headers=headers(subtest_token),
                  json={"tier": "free"})
check("(3.i) subscribe free -> 200", r.status_code == 200)
if r.status_code == 200:
    sub = r.json().get("subscription", {})
    check("(3.i) tier free", sub.get("tier") == "free")

# 3.j cancel free
r = requests.post(f"{API}/subscription/cancel", headers=headers(subtest_token))
check("(3.j) cancel on free -> 400",
      r.status_code == 400, f"status={r.status_code}")


# ---------- 4. FREE TIER LIMITS ----------
print("\n=== 4. FREE TIER LIMITS ===")

fresh_email = f"freelimits_{int(time.time())}@test.com"
r = requests.post(f"{API}/auth/register",
                  json={"email": fresh_email, "password": "password123",
                        "name": "Free Limit Tester"})
check("(4.pre) register fresh user", r.status_code == 200, f"status={r.status_code}")
fresh_token = r.json().get("token") if r.status_code == 200 else None

r = requests.get(f"{API}/subscription", headers=headers(fresh_token))
if r.status_code == 200:
    check("(4.pre) fresh user free tier",
          r.json().get("subscription", {}).get("tier") == "free")

# 4.a 10 tools
created_ids = []
all_ok = True
for i in range(10):
    r = requests.post(f"{API}/tools", headers=headers(fresh_token),
                      json={"name": f"Tool {i+1}", "cost": 10.0 + i})
    if r.status_code != 200:
        all_ok = False
        print(f"      tool #{i+1} failed: {r.status_code} {r.text[:200]}")
        break
    created_ids.append(r.json().get("id"))
check("(4.a) 10 tools created",
      all_ok and len(created_ids) == 10, f"created={len(created_ids)}")

# 4.b 11th -> 402
r = requests.post(f"{API}/tools", headers=headers(fresh_token),
                  json={"name": "Tool 11"})
check("(4.b) 11th -> 402",
      r.status_code == 402, f"status={r.status_code} body={r.text[:300]}")
if r.status_code == 402:
    detail = r.json().get("detail", "")
    check("(4.b) detail mentions limit",
          "limit" in detail.lower() or "free" in detail.lower(),
          f"detail={detail}")

# 4.c monthly + 11th
r = requests.post(f"{API}/subscription/subscribe", headers=headers(fresh_token),
                  json={"tier": "monthly"})
check("(4.c pre) monthly", r.status_code == 200)
r = requests.post(f"{API}/tools", headers=headers(fresh_token),
                  json={"name": "Tool 11 (premium)"})
check("(4.c) 11th tool monthly -> 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
if r.status_code == 200:
    created_ids.append(r.json().get("id"))

# 4.d downgrade
r = requests.post(f"{API}/subscription/subscribe", headers=headers(fresh_token),
                  json={"tier": "free"})
check("(4.d pre) downgrade", r.status_code == 200)
r = requests.post(f"{API}/tools", headers=headers(fresh_token),
                  json={"name": "Tool 12"})
check("(4.d) post-downgrade -> 402",
      r.status_code == 402, f"status={r.status_code} body={r.text[:300]}")

# 4.e 1 dealer
r = requests.post(f"{API}/dealers", headers=headers(fresh_token),
                  json={"name": "First Dealer"})
check("(4.e) 1st dealer -> 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
dealer1_id = r.json().get("id") if r.status_code == 200 else None

# 4.f 2nd dealer
r = requests.post(f"{API}/dealers", headers=headers(fresh_token),
                  json={"name": "Second Dealer"})
check("(4.f) 2nd dealer -> 402",
      r.status_code == 402, f"status={r.status_code} body={r.text[:300]}")

# 4.g 1 agent
if dealer1_id:
    r = requests.post(f"{API}/dealers/{dealer1_id}/agents",
                      headers=headers(fresh_token),
                      json={"name": "Agent One", "phone": "555-0001"})
    check("(4.g) 1st agent -> 200",
          r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")

# 4.h 2nd agent
if dealer1_id:
    r = requests.post(f"{API}/dealers/{dealer1_id}/agents",
                      headers=headers(fresh_token),
                      json={"name": "Agent Two"})
    check("(4.h) 2nd agent -> 402",
          r.status_code == 402, f"status={r.status_code} body={r.text[:300]}")

# 4.i lifetime
r = requests.post(f"{API}/subscription/subscribe", headers=headers(fresh_token),
                  json={"tier": "lifetime"})
check("(4.i pre) lifetime", r.status_code == 200)
r = requests.post(f"{API}/dealers", headers=headers(fresh_token),
                  json={"name": "Second Dealer"})
check("(4.i) 2nd dealer (lifetime) -> 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
if dealer1_id:
    r = requests.post(f"{API}/dealers/{dealer1_id}/agents",
                      headers=headers(fresh_token),
                      json={"name": "Agent Two", "phone": "555-0002"})
    check("(4.i) 2nd agent (lifetime) -> 200",
          r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")


# ---------- 5. SANITY ----------
print("\n=== 5. SANITY ===")

for path in ["/stats", "/aggregate", "/warranty-claims/summary",
             "/personal-profile"]:
    r = requests.get(f"{API}{path}", headers=headers(subtest_token))
    check(f"(5) GET {path} -> 200",
          r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")

# Cleanup
print("\n=== CLEANUP ===")
if user2_tool_id and user2_token:
    r = requests.delete(f"{API}/tools/{user2_tool_id}",
                        headers=headers(user2_token))
    print(f"  user2 tool delete -> {r.status_code}")

r = requests.post(f"{API}/subscription/subscribe",
                  headers=headers(subtest_token), json={"tier": "free"})
print(f"  subtest restored to free -> {r.status_code}")


print(f"\n========================================")
print(f"PASS: {PASS}")
print(f"FAIL: {FAIL}")
if FAIL:
    print("\nFAIL DETAILS:")
    for d in FAIL_DETAILS:
        print(f"  - {d}")
print(f"========================================")

sys.exit(0 if FAIL == 0 else 1)
