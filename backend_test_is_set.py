"""
Backend regression test — Tool is_set / set_serials fields.
Verifies that Tool model persists is_set (bool) and set_serials (List[str])
across POST/PUT/GET/DELETE + list + search.
"""
import os
import sys
from pathlib import Path

import requests

FRONT_ENV = Path("/app/frontend/.env")
BASE = None
if FRONT_ENV.exists():
    for line in FRONT_ENV.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k in ("REACT_APP_BACKEND_URL", "EXPO_PUBLIC_BACKEND_URL") and v:
                BASE = v.rstrip("/")
                break

if not BASE:
    print("ERROR: REACT_APP_BACKEND_URL / EXPO_PUBLIC_BACKEND_URL not set in /app/frontend/.env")
    sys.exit(1)

API = BASE + "/api"

EMAIL = "subtest@example.com"
PASSWORD = "password123"

passes = 0
fails = 0
errors = []


def check(cond, msg):
    global passes, fails
    if cond:
        passes += 1
        print(f"  OK  {msg}")
    else:
        fails += 1
        errors.append(msg)
        print(f"  FAIL  {msg}")


def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# Login
print(f"=== Auth: login {EMAIL} at {API}")
r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
check(r.status_code == 200, f"POST /auth/login -> 200 (got {r.status_code})")
if r.status_code != 200:
    print(r.text)
    sys.exit(1)
token = r.json().get("token")
check(bool(token), "login returned token")
HDR = h(token)

created_ids = []

# ------------------------------------------------------------------
# TEST 1: Create a single-item tool (not a set)
# ------------------------------------------------------------------
print("\n=== TEST 1: POST /api/tools -- single-item tool (is_set omitted)")
payload1 = {
    "name": "Wright Ratchet WR-B-100",
    "brand": "Wright",
    "model": "B-100",
    "serial_number": "SN-SINGLE-001",
    "cost": 39.99,
}
r = requests.post(f"{API}/tools", json=payload1, headers=HDR, timeout=30)
check(r.status_code == 200, f"POST single tool -> 200 (got {r.status_code}) body={r.text[:300]}")
if r.status_code == 200:
    t1 = r.json()
    created_ids.append(t1["id"])
    check(t1.get("is_set") is False, f"single tool is_set == false (got {t1.get('is_set')!r})")
    check(t1.get("set_serials") == [], f"single tool set_serials == [] (got {t1.get('set_serials')!r})")
    check(t1.get("serial_number") == "SN-SINGLE-001", "single tool serial_number persisted")
else:
    t1 = None

# ------------------------------------------------------------------
# TEST 2: Create a set tool with 3 serials
# ------------------------------------------------------------------
print("\n=== TEST 2: POST /api/tools -- set tool with 3 serials")
payload2 = {
    "name": "Wright 3pc Wrench Set",
    "brand": "Wright",
    "model": "SET-A",
    "is_set": True,
    "set_serials": ["WR-A-001", "WR-A-002", "WR-A-003"],
    "cost": 199.50,
}
r = requests.post(f"{API}/tools", json=payload2, headers=HDR, timeout=30)
check(r.status_code == 200, f"POST set tool -> 200 (got {r.status_code}) body={r.text[:300]}")
if r.status_code == 200:
    t2 = r.json()
    created_ids.append(t2["id"])
    check(t2.get("is_set") is True, f"set tool is_set == true (got {t2.get('is_set')!r})")
    check(
        t2.get("set_serials") == ["WR-A-001", "WR-A-002", "WR-A-003"],
        f"set tool set_serials == 3 serials (got {t2.get('set_serials')!r})",
    )
else:
    t2 = None

if not t1 or not t2:
    print("\n!!! Aborting -- tool creation failed; cannot continue")
    print(f"\nSummary: {passes} passed, {fails} failed")
    sys.exit(1)

# ------------------------------------------------------------------
# TEST 3: GET both tools -- fields persist in Mongo
# ------------------------------------------------------------------
print("\n=== TEST 3: GET /api/tools/{id} -- fields persist from Mongo")

r = requests.get(f"{API}/tools/{t1['id']}", headers=HDR, timeout=30)
check(r.status_code == 200, f"GET single tool -> 200 (got {r.status_code})")
if r.status_code == 200:
    body = r.json()
    check(body.get("is_set") is False, f"GET single: is_set == false (got {body.get('is_set')!r})")
    check(body.get("set_serials") == [], f"GET single: set_serials == [] (got {body.get('set_serials')!r})")

r = requests.get(f"{API}/tools/{t2['id']}", headers=HDR, timeout=30)
check(r.status_code == 200, f"GET set tool -> 200 (got {r.status_code})")
if r.status_code == 200:
    body = r.json()
    check(body.get("is_set") is True, f"GET set: is_set == true (got {body.get('is_set')!r})")
    check(
        body.get("set_serials") == ["WR-A-001", "WR-A-002", "WR-A-003"],
        f"GET set: set_serials has 3 items (got {body.get('set_serials')!r})",
    )

# ------------------------------------------------------------------
# TEST 4: PUT single tool to become a set with 2 serials
# ------------------------------------------------------------------
print("\n=== TEST 4: PUT /api/tools/{id} -- convert single into set with 2 serials")
r = requests.put(
    f"{API}/tools/{t1['id']}",
    json={"is_set": True, "set_serials": ["CONV-X1", "CONV-X2"]},
    headers=HDR,
    timeout=30,
)
check(r.status_code == 200, f"PUT t1 to set -> 200 (got {r.status_code}) body={r.text[:300]}")
if r.status_code == 200:
    body = r.json()
    check(body.get("is_set") is True, f"PUT t1: is_set flipped to true (got {body.get('is_set')!r})")
    check(
        body.get("set_serials") == ["CONV-X1", "CONV-X2"],
        f"PUT t1: set_serials == 2 serials (got {body.get('set_serials')!r})",
    )
    r2 = requests.get(f"{API}/tools/{t1['id']}", headers=HDR, timeout=30)
    if r2.status_code == 200:
        b2 = r2.json()
        check(b2.get("is_set") is True, "GET after PUT t1: is_set still true")
        check(
            b2.get("set_serials") == ["CONV-X1", "CONV-X2"],
            f"GET after PUT t1: set_serials persisted (got {b2.get('set_serials')!r})",
        )

# ------------------------------------------------------------------
# TEST 5: PUT set tool to replace its serials list
# ------------------------------------------------------------------
print("\n=== TEST 5: PUT /api/tools/{id} -- replace set_serials on existing set")
new_serials = ["WR-A-004", "WR-A-005", "WR-A-006", "WR-A-007"]
r = requests.put(
    f"{API}/tools/{t2['id']}",
    json={"set_serials": new_serials},
    headers=HDR,
    timeout=30,
)
check(r.status_code == 200, f"PUT t2 new serials -> 200 (got {r.status_code}) body={r.text[:300]}")
if r.status_code == 200:
    body = r.json()
    check(body.get("is_set") is True, "PUT t2: is_set stays true")
    check(
        body.get("set_serials") == new_serials,
        f"PUT t2: set_serials replaced (got {body.get('set_serials')!r})",
    )

# ------------------------------------------------------------------
# TEST 6: GET /tools list includes both with is_set/set_serials
# ------------------------------------------------------------------
print("\n=== TEST 6: GET /api/tools (list) -- both tools visible with fields")
r = requests.get(f"{API}/tools", headers=HDR, timeout=30)
check(r.status_code == 200, f"GET /tools list -> 200 (got {r.status_code})")
if r.status_code == 200:
    arr = r.json()
    check(isinstance(arr, list), "list response is an array")
    row1 = next((x for x in arr if x.get("id") == t1["id"]), None)
    row2 = next((x for x in arr if x.get("id") == t2["id"]), None)
    check(row1 is not None, "list includes t1")
    check(row2 is not None, "list includes t2")
    if row1:
        check(row1.get("is_set") is True, f"list t1 is_set == true (got {row1.get('is_set')!r})")
        check(
            row1.get("set_serials") == ["CONV-X1", "CONV-X2"],
            f"list t1 set_serials persisted (got {row1.get('set_serials')!r})",
        )
    if row2:
        check(row2.get("is_set") is True, f"list t2 is_set == true (got {row2.get('is_set')!r})")
        check(
            row2.get("set_serials") == new_serials,
            f"list t2 set_serials has 4 items (got {row2.get('set_serials')!r})",
        )

# ------------------------------------------------------------------
# TEST 7: Search by serial inside set_serials
# ------------------------------------------------------------------
print("\n=== TEST 7: GET /api/tools?search=WR-A-004 -- search finds set by inner serial")
r = requests.get(f"{API}/tools", params={"search": "WR-A-004"}, headers=HDR, timeout=30)
check(r.status_code == 200, f"GET /tools?search=WR-A-004 -> 200 (got {r.status_code})")
if r.status_code == 200:
    arr = r.json()
    check(isinstance(arr, list), "search response is an array")
    ids = [x.get("id") for x in arr]
    check(t2["id"] in ids, f"search?=WR-A-004 returns t2 (got ids: {ids})")
    check(
        t1["id"] not in ids,
        f"search?=WR-A-004 does NOT return t1 (got ids: {ids})",
    )

print("\n=== TEST 7b: search by CONV-X1 (should find t1)")
r = requests.get(f"{API}/tools", params={"search": "CONV-X1"}, headers=HDR, timeout=30)
check(r.status_code == 200, f"GET /tools?search=CONV-X1 -> 200 (got {r.status_code})")
if r.status_code == 200:
    arr = r.json()
    ids = [x.get("id") for x in arr]
    check(t1["id"] in ids, f"search?=CONV-X1 returns t1 (got ids: {ids})")

# ------------------------------------------------------------------
# TEST 8: DELETE both
# ------------------------------------------------------------------
print("\n=== TEST 8: DELETE both tools")
for tid in [t1["id"], t2["id"]]:
    r = requests.delete(f"{API}/tools/{tid}", headers=HDR, timeout=30)
    check(r.status_code == 200, f"DELETE /tools/{tid[:8]}... -> 200 (got {r.status_code})")
    g = requests.get(f"{API}/tools/{tid}", headers=HDR, timeout=30)
    check(g.status_code == 404, f"GET /tools/{tid[:8]}... after DELETE -> 404 (got {g.status_code})")

print(f"\n{'='*60}")
print(f"SUMMARY: {passes} passed, {fails} failed")
if fails:
    print("\nFailures:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
else:
    print("ALL CHECKS PASS")
    sys.exit(0)
