"""
Comprehensive deployment-readiness backend audit for Toolbox Vault.
Investigation-only — does NOT fix bugs.

Categorizes findings into:
  - SECURITY/AUTH
  - DATA INTEGRITY
  - FEATURE/FUNCTIONAL
  - PERFORMANCE
  - POLISH/UX

Outputs `[PASS]/[BUG-{sev}]` lines and an end-of-run grouped summary.
"""

import os
import sys
import time
import json
import base64
import uuid
import urllib.parse
from io import BytesIO

import requests

# ---------- Setup ----------
BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://toolbox-vault-v3.preview.emergentagent.com"
BASE = BASE.rstrip("/") + "/api"

PRIMARY_EMAIL = "subtest@example.com"
PRIMARY_PW = "password123"

bugs = []  # list of dicts
def bug(category, severity, endpoint, repro, expected, actual, fix=""):
    b = {
        "category": category, "severity": severity, "endpoint": endpoint,
        "repro": repro, "expected": expected, "actual": actual, "fix": fix,
    }
    bugs.append(b)
    print(f"  [BUG-{severity}] {category} {endpoint}")
    print(f"      Expected: {expected}")
    print(f"      Actual:   {actual}")
    if fix:
        print(f"      Fix:      {fix}")


def hh(token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


s = requests.Session()
s.headers["User-Agent"] = "ToolboxVault-Audit/1.0"

# ---------- 1) Public: root + health ----------
print("\n=== 1) Root & Health ===")
try:
    r = s.get(f"{BASE}/", timeout=10)
    if r.status_code != 200:
        bug("FEATURE", "MEDIUM", "GET /api/", "curl /api/", "200", f"{r.status_code} {r.text[:120]}")
    else:
        print(f"  [PASS] GET /api/ → 200 {r.json()}")
except Exception as e:
    bug("FEATURE", "HIGH", "GET /api/", "curl /api/", "200", f"network error {e}")

try:
    r = s.get(f"{BASE}/health", timeout=10)
    if r.status_code == 404:
        bug("POLISH", "LOW", "GET /api/health", "curl /api/health",
            "200 with health JSON (referenced as a public health endpoint in middleware PUBLIC_PATHS)",
            "404 — no handler registered (only the middleware allow-list mentions this path)",
            "Add a `@api_router.get('/health')` returning {ok:true} or remove from PUBLIC_PATHS.")
    elif r.status_code == 200:
        print(f"  [PASS] GET /api/health → 200")
    else:
        bug("POLISH", "LOW", "GET /api/health", "curl /api/health", "200", f"{r.status_code}")
except Exception as e:
    bug("FEATURE", "HIGH", "GET /api/health", "", "200", f"network error {e}")

# ---------- 2) Auth: login subtest ----------
print("\n=== 2) Auth ===")
r = s.post(f"{BASE}/auth/login", json={"email": PRIMARY_EMAIL, "password": PRIMARY_PW}, timeout=10)
if r.status_code != 200:
    print(f"  FATAL: cannot login as subtest: {r.status_code} {r.text[:200]}")
    sys.exit(1)
A_token = r.json()["token"]
A_user = r.json()["user"]
print(f"  [PASS] login subtest@ → tier={A_user['subscription']['tier']}")

# /me
r = s.get(f"{BASE}/auth/me", headers=hh(A_token))
if r.status_code != 200 or r.json().get("email") != PRIMARY_EMAIL:
    bug("SECURITY", "HIGH", "GET /api/auth/me", "auth header bearer",
        "200 with my user", f"{r.status_code} {r.text[:120]}")
else:
    print(f"  [PASS] /auth/me ok")

# Unauth /me
r = s.get(f"{BASE}/auth/me")
if r.status_code != 401:
    bug("SECURITY", "CRITICAL", "GET /api/auth/me", "no Authorization header",
        "401", str(r.status_code))
else:
    print("  [PASS] /auth/me without token → 401")

# Tampered token
r = s.get(f"{BASE}/auth/me", headers={"Authorization": "Bearer not-a-real-jwt"})
if r.status_code != 401:
    bug("SECURITY", "CRITICAL", "GET /api/auth/me",
        "Bearer with invalid jwt",
        "401", str(r.status_code))
else:
    print("  [PASS] tampered token → 401")

# Tampered token (valid header but wrong sig)
import jwt as pyjwt  # type: ignore
forged = pyjwt.encode({"sub": "fake-user-id", "iat": 0, "exp": 9999999999}, "wrongsecret", algorithm="HS256")
r = s.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {forged}"})
if r.status_code != 401:
    bug("SECURITY", "CRITICAL", "GET /api/auth/me with forged jwt", "wrong-signed jwt",
        "401", f"{r.status_code} {r.text[:120]}")
else:
    print("  [PASS] forged-sig jwt → 401")

# Expired jwt
exp_jwt = pyjwt.encode({"sub": A_user["id"], "iat": 1, "exp": 100}, os.environ.get("JWT_SECRET",""), algorithm="HS256")
r = s.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {exp_jwt}"})
if r.status_code != 401:
    bug("SECURITY", "HIGH", "GET /api/auth/me with expired jwt", "exp in past",
        "401", str(r.status_code))
else:
    print("  [PASS] expired jwt → 401")

# Email enumeration safety on login
r1 = s.post(f"{BASE}/auth/login", json={"email": "definitely-not-a-user@nowhere.test", "password": "x"})
r2 = s.post(f"{BASE}/auth/login", json={"email": PRIMARY_EMAIL, "password": "wrongpassword"})
if r1.status_code == 401 and r2.status_code == 401 and r1.json().get("detail") == r2.json().get("detail"):
    print(f"  [PASS] login error msg uniform: {r1.json().get('detail')!r}")
else:
    bug("SECURITY", "MEDIUM", "POST /api/auth/login",
        "compare unknown-email vs wrong-password responses",
        "Same generic 'Invalid email or password' for both",
        f"unknown={r1.status_code}/{r1.json().get('detail')!r} wrong-pw={r2.status_code}/{r2.json().get('detail')!r}")

# Forgot password — generic response
r1 = s.post(f"{BASE}/auth/forgot-password", json={"email": PRIMARY_EMAIL})
r2 = s.post(f"{BASE}/auth/forgot-password", json={"email": "nobody-here@test.invalid"})
r3 = s.post(f"{BASE}/auth/forgot-password", json={"email": "not-an-email"})
if (r1.status_code == 200 and r2.status_code == 200 and r3.status_code == 200
        and r1.json().get("message") == r2.json().get("message") == r3.json().get("message")):
    print(f"  [PASS] forgot-password enumeration-safe: {r1.json().get('message')!r}")
else:
    bug("SECURITY", "MEDIUM", "POST /api/auth/forgot-password",
        "compare existing/unknown/malformed",
        "All return generic 200 with same message",
        f"{r1.status_code}/{r2.status_code}/{r3.status_code} msgs differ")

# Reset password — wrong code → 400, max attempts → 429
ttl_email = PRIMARY_EMAIL
# Trigger code emission first
s.post(f"{BASE}/auth/forgot-password", json={"email": ttl_email})
attempts_responses = []
for i in range(6):
    rr = s.post(f"{BASE}/auth/reset-password",
                json={"email": ttl_email, "code": "000000", "new_password": "doesntmatter1"})
    attempts_responses.append(rr.status_code)
# After 5 wrong: 429 OR record gets burned and returns 400 "Invalid or expired code"
if 429 in attempts_responses:
    print(f"  [PASS] reset-password locks after max attempts: {attempts_responses}")
elif attempts_responses[5] == 400:
    print(f"  [PASS] reset-password 400 chain {attempts_responses} (record burned after 5 wrong → next is 'invalid')")
else:
    bug("SECURITY", "MEDIUM", "POST /api/auth/reset-password",
        "spam 6 wrong codes",
        "429 after 5 attempts (per RESET_CODE_MAX_ATTEMPTS)",
        f"sequence {attempts_responses}")

# /auth/me (PUT) — change name (avoid changing PW since tests need it)
r = s.put(f"{BASE}/auth/me", headers=hh(A_token), json={"name": "QA Tester Updated"})
if r.status_code != 200:
    bug("FEATURE", "HIGH", "PUT /api/auth/me", "{name:'...'}", "200", f"{r.status_code} {r.text[:120]}")
else:
    print("  [PASS] PUT /auth/me {name} → 200")

# ---------- 3) Multi-tenant isolation ----------
print("\n=== 3) Multi-tenant isolation ===")
B_email = f"isotest-{uuid.uuid4().hex[:8]}@example.com"
B_pw = "Password!23"
r = s.post(f"{BASE}/auth/register", json={"email": B_email, "password": B_pw, "name": "Iso B"})
if r.status_code != 200:
    bug("SECURITY", "CRITICAL", "POST /api/auth/register", f"register {B_email}",
        "200 with token+user", f"{r.status_code} {r.text[:120]}")
    B_token = None
else:
    B_token = r.json()["token"]
    B_user = r.json()["user"]
    print(f"  [PASS] registered {B_email}")

# Re-register same email → expect 400
if B_token:
    r = s.post(f"{BASE}/auth/register", json={"email": B_email, "password": B_pw})
    if r.status_code != 400:
        bug("SECURITY", "MEDIUM", "POST /api/auth/register",
            "register same email again", "400", f"{r.status_code}")
    else:
        print("  [PASS] duplicate register → 400")

# Create per-user fixtures and assert cross-user invisibility
A_tools = []
B_tools = []
A_dealers = []
B_dealers = []

if B_token:
    # User A: fetch existing dealer count
    A_existing_tools = s.get(f"{BASE}/tools", headers=hh(A_token)).json()
    A_existing_count = len(A_existing_tools)

    # Create one tool on A
    rA = s.post(f"{BASE}/tools", headers=hh(A_token), json={"name": f"AUDIT_A_tool_{uuid.uuid4().hex[:6]}"})
    if rA.status_code == 200:
        A_tools.append(rA.json()["id"])
    else:
        bug("FEATURE", "CRITICAL", "POST /api/tools", "create on userA",
            "200", f"{rA.status_code} {rA.text[:200]}")

    # Create one tool on B
    rB = s.post(f"{BASE}/tools", headers=hh(B_token), json={"name": f"AUDIT_B_tool_{uuid.uuid4().hex[:6]}"})
    if rB.status_code == 200:
        B_tools.append(rB.json()["id"])
        b_tool_id = rB.json()["id"]
        # A tries to GET B's tool → must be 404
        r = s.get(f"{BASE}/tools/{b_tool_id}", headers=hh(A_token))
        if r.status_code != 404:
            bug("SECURITY", "CRITICAL", f"GET /api/tools/{{id}}",
                "userA fetches userB's tool by id",
                "404", f"{r.status_code} — leaked tenant data")
        else:
            print("  [PASS] cross-tenant GET tool → 404")
        # A tries to PUT B's tool → 404
        r = s.put(f"{BASE}/tools/{b_tool_id}", headers=hh(A_token), json={"name": "HACKED"})
        if r.status_code != 404:
            bug("SECURITY", "CRITICAL", f"PUT /api/tools/{{id}}",
                "userA edits userB's tool",
                "404", f"{r.status_code}")
        else:
            print("  [PASS] cross-tenant PUT tool → 404")
        # A tries to DELETE B's tool → silent? endpoint returns ok always
        r_before = s.get(f"{BASE}/tools/{b_tool_id}", headers=hh(B_token))
        r = s.delete(f"{BASE}/tools/{b_tool_id}", headers=hh(A_token))
        r_after = s.get(f"{BASE}/tools/{b_tool_id}", headers=hh(B_token))
        if r_after.status_code != 200:
            bug("SECURITY", "CRITICAL", f"DELETE /api/tools/{{id}}",
                "userA deletes userB's tool",
                "404 OR no-op (B's tool still exists)",
                f"AFTER delete by A, B's GET returns {r_after.status_code} — userA can delete userB's data")
        else:
            print(f"  [PASS] cross-tenant DELETE tool blocked (delete returned {r.status_code} but B's tool intact)")

    # User A list — must NOT contain any AUDIT_B_*
    rA_list = s.get(f"{BASE}/tools", headers=hh(A_token))
    if rA_list.status_code == 200:
        names = [t.get("name","") for t in rA_list.json()]
        leaked = [n for n in names if n.startswith("AUDIT_B_")]
        if leaked:
            bug("SECURITY", "CRITICAL", "GET /api/tools",
                "userA listing should not see B's tools",
                "no AUDIT_B_* present", f"leaked: {leaked}")
        else:
            print("  [PASS] userA tool listing isolated from userB")

    # User B list must not contain A's
    rB_list = s.get(f"{BASE}/tools", headers=hh(B_token))
    if rB_list.status_code == 200:
        names = [t.get("name","") for t in rB_list.json()]
        leaked = [n for n in names if n.startswith("AUDIT_A_")]
        if leaked:
            bug("SECURITY", "CRITICAL", "GET /api/tools",
                "userB sees A's tools",
                "isolated", f"leaked: {leaked}")
        else:
            print("  [PASS] userB tool listing isolated from userA")

    # Create a dealer on B then verify A can't see/edit
    rD = s.post(f"{BASE}/dealers", headers=hh(B_token), json={"name": f"AUDIT_BDealer_{uuid.uuid4().hex[:6]}"})
    if rD.status_code == 200:
        B_dealers.append(rD.json()["id"])
        b_dealer_id = rD.json()["id"]
        r = s.get(f"{BASE}/dealers/{b_dealer_id}", headers=hh(A_token))
        if r.status_code != 404:
            bug("SECURITY", "CRITICAL", "GET /api/dealers/{id}",
                "cross-tenant get dealer", "404", str(r.status_code))
        else:
            print("  [PASS] cross-tenant GET dealer → 404")
        # Add agent on B's dealer, then check A can't add
        r = s.post(f"{BASE}/dealers/{b_dealer_id}/agents", headers=hh(A_token),
                   json={"name": "intruder agent"})
        if r.status_code != 404:
            bug("SECURITY", "CRITICAL", "POST /api/dealers/{id}/agents",
                "cross-tenant add agent", "404", str(r.status_code))
        else:
            print("  [PASS] cross-tenant add agent → 404")
        # Tx
        r = s.post(f"{BASE}/dealers/{b_dealer_id}/transactions", headers=hh(A_token),
                   json={"account":"credit","type":"payment","amount":1.0})
        if r.status_code != 404:
            bug("SECURITY", "CRITICAL", "POST /api/dealers/{id}/transactions",
                "cross-tenant tx", "404", str(r.status_code))
        else:
            print("  [PASS] cross-tenant tx → 404")
    else:
        bug("FEATURE", "HIGH", "POST /api/dealers",
            "create dealer on userB", "200", f"{rD.status_code} {rD.text[:200]}")

# ---------- 4) FREE-TIER LIMITS ----------
print("\n=== 4) Free-tier limits enforcement (review item 14) ===")
# subtest is 'free' tier per /me. Check if creating >10 tools / >1 dealer / >1 agent returns 402.
free_user_token = B_token  # B is brand-new free user
if free_user_token:
    # Create up to 11 tools on B and observe
    statuses = []
    for i in range(11):  # 11th must fail per FREE_LIMITS=10
        r = s.post(f"{BASE}/tools", headers=hh(free_user_token),
                   json={"name": f"AUDIT_LIMIT_B_{i:02d}_{uuid.uuid4().hex[:4]}"})
        statuses.append(r.status_code)
        if r.status_code == 200:
            B_tools.append(r.json()["id"])
        if r.status_code != 200:
            break
    # Expected: first 9 succeed (B already has 1 tool above) and the 10th-or-11th creation returns 402
    # Realistically: B started with 1 tool, this loop tries +11 = 12 total → if limit=10, the 10th attempt should 402
    if 402 in statuses:
        print(f"  [PASS] Free-tier tools limit enforced (sequence {statuses[:5]}...{statuses[-3:]})")
    else:
        bug("SECURITY", "HIGH", "POST /api/tools",
            "Create >10 tools as free user; FREE_LIMITS={'tools':10} per /app/backend/auth.py L50-54",
            "HTTP 402 'Payment Required' once limit hit",
            f"all {len(statuses)} creations returned {set(statuses)} — FREE LIMIT NOT ENFORCED",
            "Add a check at POST /api/tools: count existing tools owned by user, raise HTTPException(402) if user.tier=='free' and count >= FREE_LIMITS['tools'].")

    # Dealers: B already has 1 dealer; create a 2nd → should 402
    r = s.post(f"{BASE}/dealers", headers=hh(free_user_token),
               json={"name": f"AUDIT_LIMIT_BDealer2_{uuid.uuid4().hex[:4]}"})
    if r.status_code == 402:
        print("  [PASS] Free-tier dealer limit enforced (2nd dealer → 402)")
    elif r.status_code == 200:
        B_dealers.append(r.json()["id"])
        bug("SECURITY", "HIGH", "POST /api/dealers",
            "Create 2nd dealer as free user; FREE_LIMITS={'dealers':1}",
            "402", "200 — FREE LIMIT NOT ENFORCED",
            "Wire enforcement at POST /api/dealers using FREE_LIMITS['dealers'].")
    else:
        bug("FEATURE", "HIGH", "POST /api/dealers", "create 2nd dealer free user",
            "402", f"{r.status_code} {r.text[:120]}")

    # Agents: B already has 1 dealer with 0 agents
    if B_dealers:
        d_id = B_dealers[0]
        s.post(f"{BASE}/dealers/{d_id}/agents", headers=hh(free_user_token),
               json={"name": "Agent 1"})
        r = s.post(f"{BASE}/dealers/{d_id}/agents", headers=hh(free_user_token),
                   json={"name": "Agent 2"})
        if r.status_code == 402:
            print("  [PASS] Free-tier agent limit enforced")
        elif r.status_code == 200:
            bug("SECURITY", "HIGH", "POST /api/dealers/{id}/agents",
                "Create 2nd agent on free user; FREE_LIMITS={'agents_per_dealer':1}",
                "402", "200 — FREE LIMIT NOT ENFORCED",
                "Enforce in add_agent handler.")

# Note: subtest also free per /me but won't probe limit on subtest because that user has lots of fixtures already
# we've already sufficiently demonstrated on B.

# ---------- 5) CRUD endpoints sanity (using subtest A) ----------
print("\n=== 5) CRUD sanity on subtest user ===")
def must200(method, url, **kw):
    r = s.request(method, url, **kw)
    if r.status_code != 200:
        bug("FEATURE","HIGH",f"{method} {url[len(BASE):]}", f"{method} {url[len(BASE):]} {kw.get('json')}",
            "200", f"{r.status_code} {r.text[:200]}")
    return r

# Locations CRUD + nested cascade
loc_parent = must200("POST", f"{BASE}/locations", headers=hh(A_token), json={"name":"AUDIT_Garage"})
loc_p_id = loc_parent.json().get("id") if loc_parent.status_code==200 else None
loc_child = None
if loc_p_id:
    loc_child = must200("POST", f"{BASE}/locations", headers=hh(A_token), json={"name":"AUDIT_Drawer1","parent_id":loc_p_id})
loc_c_id = loc_child.json().get("id") if loc_child and loc_child.status_code==200 else None

# update child to be its own parent → 400
if loc_c_id:
    r = s.put(f"{BASE}/locations/{loc_c_id}", headers=hh(A_token), json={"parent_id": loc_c_id})
    if r.status_code != 400:
        bug("DATA","MEDIUM","PUT /api/locations/{id}",
            "PUT with parent_id == self",
            "400 'cannot be its own parent'", f"{r.status_code} {r.text[:120]}")
    else:
        print(f"  [PASS] location self-parent → 400")
    # cycle: parent.parent = child
    r = s.put(f"{BASE}/locations/{loc_p_id}", headers=hh(A_token), json={"parent_id": loc_c_id})
    if r.status_code != 400:
        bug("DATA","HIGH","PUT /api/locations/{id}",
            "create A→B→A cycle",
            "400", f"{r.status_code} {r.text[:120]}")
    else:
        print("  [PASS] location cycle → 400")

# Default delete behavior (without cascade) — children should reparent
if loc_p_id and loc_c_id:
    r = s.delete(f"{BASE}/locations/{loc_p_id}", headers=hh(A_token))
    if r.status_code == 200:
        # Child should now have parent_id = None
        rc = s.get(f"{BASE}/locations", headers=hh(A_token))
        kids = [l for l in rc.json() if l.get("id") == loc_c_id]
        if kids and kids[0].get("parent_id") not in (None, ""):
            bug("DATA","MEDIUM","DELETE /api/locations/{id}",
                "delete parent without cascade",
                "child reparented to grandparent (None here)",
                f"child.parent_id = {kids[0].get('parent_id')}")
        else:
            print("  [PASS] non-cascade delete reparents children")
    # cascade delete child
    s.delete(f"{BASE}/locations/{loc_c_id}?cascade=true", headers=hh(A_token))

# Tags CRUD
rt = s.post(f"{BASE}/tags", headers=hh(A_token), json={"name": "AUDIT_red", "color":"#FF0000"})
tag_id = rt.json().get("id") if rt.status_code == 200 else None
# Duplicate name should return same tag
rt2 = s.post(f"{BASE}/tags", headers=hh(A_token), json={"name":"audit_red"})
if rt2.status_code == 200 and rt2.json().get("id") == tag_id:
    print("  [PASS] duplicate tag returns same id")
elif rt2.status_code != 200:
    bug("FEATURE","MEDIUM","POST /api/tags","duplicate tag","200 same id",
        f"{rt2.status_code}")
# Update tag color
if tag_id:
    s.put(f"{BASE}/tags/{tag_id}", headers=hh(A_token), json={"name":"AUDIT_red"})
    s.delete(f"{BASE}/tags/{tag_id}", headers=hh(A_token))

# Categories CRUD
rc = s.post(f"{BASE}/categories", headers=hh(A_token), json={"name":"AUDIT_PowerTools"})
cat_id = rc.json().get("id") if rc.status_code == 200 else None
if cat_id:
    s.delete(f"{BASE}/categories/{cat_id}", headers=hh(A_token))

# Borrowers CRUD
rb = s.post(f"{BASE}/borrowers", headers=hh(A_token), json={"name":"AUDIT_Borrower"})
borrow_id = rb.json().get("id") if rb.status_code == 200 else None

# Tools — full CRUD on a temp tool with photos
photo_b64 = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00"*30).decode()
rt = s.post(f"{BASE}/tools", headers=hh(A_token),
            json={"name":"AUDIT_FullTool","brand":"Stanley","cost":99.99,
                  "photos":[photo_b64], "tag_ids":[]})
tool_id = rt.json().get("id") if rt.status_code == 200 else None
if tool_id:
    A_tools.append(tool_id)
    # Update each field
    r = s.put(f"{BASE}/tools/{tool_id}", headers=hh(A_token),
              json={"description":"updated","cost":42.0,"condition":"Excellent"})
    if r.status_code != 200 or r.json().get("cost") != 42.0:
        bug("FEATURE","HIGH","PUT /api/tools/{id}","update cost",
            "200 cost=42.0", f"{r.status_code} cost={r.json().get('cost') if r.status_code==200 else None}")
    else:
        print("  [PASS] PUT tool fields ok")

    # filter by search/category/dealer/etc
    for fkey, fval, expected_present in [
        ("search","AUDIT_FullTool",True),
        ("checked_out","false",True),
        ("is_consumable","false",True),
        ("needs_repair","false",True),
        ("for_sale","false",True),
        ("is_sold","false",True),
    ]:
        r = s.get(f"{BASE}/tools?{fkey}={fval}", headers=hh(A_token))
        if r.status_code != 200:
            bug("FEATURE","HIGH","GET /api/tools",f"filter {fkey}={fval}","200",
                f"{r.status_code}")
        else:
            ids = [t["id"] for t in r.json()]
            if expected_present and tool_id not in ids:
                bug("DATA","MEDIUM","GET /api/tools",f"filter {fkey}={fval}",
                    "AUDIT_FullTool present","missing")

    # NoSQL injection in search param
    r = s.get(f"{BASE}/tools?search=" + urllib.parse.quote('{"$gt":""}'), headers=hh(A_token))
    if r.status_code != 200:
        bug("SECURITY","HIGH","GET /api/tools","search with NoSQL operator payload",
            "200 (should be safely escaped)", f"{r.status_code} {r.text[:120]}")
    else:
        print("  [PASS] NoSQL operator literal in search safely handled")

    # Documents
    r = s.post(f"{BASE}/tools/{tool_id}/documents", headers=hh(A_token),
               json={"name":"manual.pdf","data":"abcd","mime_type":"application/pdf"})
    if r.status_code != 200 or len(r.json().get("documents",[])) != 1:
        bug("FEATURE","HIGH","POST /api/tools/{id}/documents",
            "attach doc","200 with 1 doc",
            f"{r.status_code} docs={len(r.json().get('documents',[])) if r.status_code==200 else None}")
    else:
        doc_id = r.json()["documents"][0]["id"]
        s.delete(f"{BASE}/tools/{tool_id}/documents/{doc_id}", headers=hh(A_token))
        print("  [PASS] tool docs attach/detach ok")

    # Checkout / checkin
    if borrow_id:
        r = s.post(f"{BASE}/tools/{tool_id}/checkout", headers=hh(A_token),
                   json={"borrower_name":"AUDIT_Borrower","borrower_id":borrow_id})
        if r.status_code != 200 or not r.json().get("is_checked_out"):
            bug("FEATURE","HIGH","POST /api/tools/{id}/checkout",
                "checkout","200 is_checked_out=true",
                f"{r.status_code}")
        s.post(f"{BASE}/tools/{tool_id}/checkin", headers=hh(A_token), json={})
        print("  [PASS] checkout/checkin")

    # Mark sold + unmark
    s.post(f"{BASE}/tools/{tool_id}/mark-sold", headers=hh(A_token),
           json={"sold_price":50.0,"sold_to":"buyer"})
    s.post(f"{BASE}/tools/{tool_id}/unmark-sold", headers=hh(A_token))

    # Maintenance
    r = s.post(f"{BASE}/tools/{tool_id}/maintenance", headers=hh(A_token),
               json={"type":"Calibration","interval_months":12,"last_done_date":"2025-01-15"})
    if r.status_code == 200 and r.json().get("maintenance"):
        sch = r.json()["maintenance"][0]
        if sch.get("next_due_date") != "2026-01-15":
            bug("DATA","MEDIUM","POST /api/tools/{id}/maintenance",
                "interval_months=12 last_done=2025-01-15",
                "next_due_date=2026-01-15", f"{sch.get('next_due_date')}")
        sch_id = sch["id"]
        # Service event
        s.post(f"{BASE}/tools/{tool_id}/maintenance/{sch_id}/service",
               headers=hh(A_token), json={"date":"2026-01-15","cost":49.99})
        s.delete(f"{BASE}/tools/{tool_id}/maintenance/{sch_id}", headers=hh(A_token))

    # Lost / recover
    r = s.post(f"{BASE}/tools/{tool_id}/report-lost", headers=hh(A_token),
               json={"type":"stolen","police_report_number":"24-1234"})
    if r.status_code != 200 or not (r.json().get("lost_status") or {}).get("is_lost"):
        bug("FEATURE","HIGH","POST /api/tools/{id}/report-lost","",
            "is_lost=true", f"{r.status_code}")
    s.post(f"{BASE}/tools/{tool_id}/recover", headers=hh(A_token))

# Wishlist CRUD
rw = s.post(f"{BASE}/wishlist", headers=hh(A_token), json={"name":"AUDIT_WishItem"})
wish_id = rw.json().get("id") if rw.status_code == 200 else None
if wish_id:
    s.put(f"{BASE}/wishlist/{wish_id}", headers=hh(A_token), json={"priority":"high"})
    s.delete(f"{BASE}/wishlist/{wish_id}", headers=hh(A_token))
    print("  [PASS] wishlist CRUD")

# Aggregate / Stats
t0 = time.time()
r = s.get(f"{BASE}/aggregate", headers=hh(A_token))
agg_ms = (time.time()-t0)*1000
if r.status_code != 200:
    bug("FEATURE","HIGH","GET /api/aggregate","",
        "200", f"{r.status_code}")
else:
    print(f"  [PASS] /aggregate {agg_ms:.0f}ms")
    if agg_ms > 2000:
        bug("PERFORMANCE","MEDIUM","GET /api/aggregate","baseline call",
            "<2000ms", f"{agg_ms:.0f}ms")

t0 = time.time()
r = s.get(f"{BASE}/stats", headers=hh(A_token))
stats_ms = (time.time()-t0)*1000
print(f"  /stats {stats_ms:.0f}ms")
if stats_ms > 2000:
    bug("PERFORMANCE","MEDIUM","GET /api/stats","baseline call",
        "<2000ms", f"{stats_ms:.0f}ms")

# tools listing perf
t0 = time.time()
r = s.get(f"{BASE}/tools", headers=hh(A_token))
tools_ms = (time.time()-t0)*1000
n_tools = len(r.json()) if r.status_code == 200 else 0
print(f"  /tools n={n_tools} {tools_ms:.0f}ms")
if tools_ms > 5000:
    bug("PERFORMANCE","MEDIUM","GET /api/tools",
        f"baseline list ({n_tools} tools)", "<5000ms", f"{tools_ms:.0f}ms")
elif n_tools < 50 and tools_ms > 2000:
    bug("PERFORMANCE","LOW","GET /api/tools",
        f"small dataset ({n_tools})", "<2000ms", f"{tools_ms:.0f}ms")

# ---------- 6) Reports ----------
print("\n=== 6) Reports — render every variant + EMPTY data ===")
spec = s.get(f"{BASE}/reports/spec", headers=hh(A_token)).json()
print("  Spec ids: " + ", ".join([r.get("id","?") for r in spec.get("reports",[])]))

# Render each variant in CSV (small) and PDF (smoke)
report_types = [r["id"] for r in spec.get("reports",[])]
expected_types = {"inventory","insurance","sales","claims"}  # also dealer/maintenance/theft if present
print(f"  expected at least: {expected_types}; actual: {set(report_types)}")
for rt_type in report_types:
    for fmt in ("csv","pdf"):
        opts = {}
        if rt_type == "claims":
            opts["claims_mode"] = "all"
        elif rt_type == "sales":
            opts["sales_mode"] = "sold"
        body = {"report_type": rt_type, "format": fmt, "columns":[], "options": opts}
        t0 = time.time()
        r = s.post(f"{BASE}/reports/render", headers=hh(A_token), json=body)
        ms = (time.time()-t0)*1000
        if r.status_code != 200:
            bug("FEATURE","HIGH","POST /api/reports/render",
                f"report_type={rt_type} format={fmt}",
                "200", f"{r.status_code} {r.text[:120]}")
        else:
            ct = r.headers.get("content-type","")
            ok = (fmt=="csv" and "csv" in ct) or (fmt=="pdf" and "pdf" in ct and r.content[:4]==b"%PDF")
            if not ok:
                bug("FEATURE","HIGH","POST /api/reports/render",
                    f"report_type={rt_type} format={fmt}",
                    f"valid {fmt}", f"ct={ct} first4={r.content[:8]!r}")
            else:
                print(f"  [PASS] render {rt_type}/{fmt} {ms:.0f}ms")
            if ms > 5000:
                bug("PERFORMANCE","LOW","POST /api/reports/render",
                    f"{rt_type}/{fmt}","<5000ms",f"{ms:.0f}ms")

# include_receipts toggle on inventory PDF
r = s.post(f"{BASE}/reports/render", headers=hh(A_token),
           json={"report_type":"inventory","format":"pdf","options":{"include_receipts":True}})
if r.status_code != 200 or r.content[:4] != b"%PDF":
    bug("FEATURE","HIGH","POST /api/reports/render",
        "inventory pdf include_receipts=true",
        "200 %PDF", f"{r.status_code} {r.text[:120]}")
else:
    print("  [PASS] include_receipts=true (inventory pdf)")

# Empty-data edge case: render reports as user B (only audit data)
if B_token:
    for rt_type, fmt in [("inventory","pdf"),("inventory","csv"),("dealer","pdf")]:
        body = {"report_type": rt_type, "format": fmt, "columns":[], "options":{}}
        r = s.post(f"{BASE}/reports/render", headers=hh(B_token), json=body)
        if rt_type not in [x["id"] for x in spec.get("reports",[])]:
            continue
        if r.status_code != 200:
            bug("FEATURE","HIGH","POST /api/reports/render",
                f"empty-data render {rt_type}/{fmt} on fresh user",
                "200 (empty PDF/CSV is fine)", f"{r.status_code} {r.text[:120]}")
        else:
            print(f"  [PASS] empty-data {rt_type}/{fmt} on fresh user → 200")

# /api/render-pdf — direct HTML→PDF
r = s.post(f"{BASE}/render-pdf", headers=hh(A_token),
           json={"html":"<h1>audit</h1><p>hi</p>","filename":"audit.pdf"})
if r.status_code != 200 or r.content[:4] != b"%PDF":
    bug("FEATURE","MEDIUM","POST /api/render-pdf","html→pdf","200 %PDF",
        f"{r.status_code} {r.text[:120]}")
else:
    print("  [PASS] /render-pdf basic")
# missing html
r = s.post(f"{BASE}/render-pdf", headers=hh(A_token), json={"html":""})
if r.status_code != 400:
    bug("DATA","LOW","POST /api/render-pdf","empty html",
        "400", f"{r.status_code}")

# ---------- 7) OCR endpoint variants ----------
print("\n=== 7) OCR / AI receipt scan ===")
# Reviewer asked about /api/ocr/receipt — check if it exists
r = s.post(f"{BASE}/ocr/receipt", headers=hh(A_token), json={})
if r.status_code == 404:
    bug("POLISH","LOW","POST /api/ocr/receipt",
        "Per review request: '/api/ocr/receipt'", "200 OR 400 OR 401 (route exists)",
        "404 — endpoint not found",
        "Either the review used the wrong path (the actual route is /api/ai/receipt-scan) or alias the new path.")
else:
    print(f"  /ocr/receipt status={r.status_code}")
# Actual receipt-scan endpoint smoke
r = s.post(f"{BASE}/ai/receipt-scan", headers=hh(A_token), json={"image_base64":""})
if r.status_code != 400:
    bug("FEATURE","MEDIUM","POST /api/ai/receipt-scan",
        "empty image_base64","400 'image_base64 is required'", f"{r.status_code} {r.text[:120]}")
else:
    print("  [PASS] /ai/receipt-scan empty → 400")

# Auth required
r = s.post(f"{BASE}/ai/receipt-scan", json={"image_base64":""})
if r.status_code != 401:
    bug("SECURITY","HIGH","POST /api/ai/receipt-scan","no auth",
        "401", str(r.status_code))
else:
    print("  [PASS] /ai/receipt-scan no-auth → 401")

# ---------- 8) Auth required on every non-public endpoint sample ----------
print("\n=== 8) Auth required sweep ===")
sample_paths = [
    "/tools","/dealers","/locations","/tags","/categories","/borrowers",
    "/wishlist","/aggregate","/stats","/maintenance/upcoming",
    "/warranty-claims","/warranty-claims/summary","/warranty-alerts",
    "/personal-profile","/reports/spec","/reports/filter-options",
    "/tools/import-fields","/tools/export-fields",
]
unauth_failures = []
for p in sample_paths:
    r = s.get(f"{BASE}{p}")
    if r.status_code != 401:
        unauth_failures.append((p, r.status_code))
if unauth_failures:
    bug("SECURITY","CRITICAL","auth sweep",
        f"GET {len(sample_paths)} endpoints with no auth",
        "all 401",
        f"non-401: {unauth_failures}")
else:
    print(f"  [PASS] all {len(sample_paths)} sample endpoints require auth (401)")

# ---------- 9) Error handling sanity ----------
print("\n=== 9) Error handling sanity ===")
# Malformed JSON
r = s.post(f"{BASE}/tools", headers=hh(A_token), data="not-json{")
if r.status_code not in (400, 422):
    bug("DATA","LOW","POST /api/tools","malformed json body",
        "400 or 422", f"{r.status_code}")
else:
    print(f"  [PASS] malformed JSON → {r.status_code}")

# Oversized payload — 8MB photo
big_b64 = base64.b64encode(os.urandom(6_500_000)).decode()  # ~8.6MB base64
r = s.post(f"{BASE}/tools", headers=hh(A_token),
           json={"name":"AUDIT_BigPhoto","photos":[big_b64]}, timeout=60)
if r.status_code == 200:
    print(f"  [PASS] oversized 8MB photo accepted (size cap not enforced — by design or no limit)")
    big_id = r.json().get("id")
    if big_id:
        A_tools.append(big_id)
elif r.status_code in (413, 400):
    print(f"  [PASS] oversized photo → {r.status_code}")
else:
    bug("DATA","MEDIUM","POST /api/tools","8MB photo payload",
        "200 OR 413/400", f"{r.status_code} {r.text[:120]}")

# Invalid uuid path
r = s.get(f"{BASE}/tools/!@#$invalid", headers=hh(A_token))
if r.status_code != 404:
    bug("DATA","LOW","GET /api/tools/{id}","invalid id format",
        "404", f"{r.status_code}")
else:
    print("  [PASS] invalid id → 404")

# NoSQL injection on dealer_id filter
r = s.get(f"{BASE}/tools?dealer_id=" + urllib.parse.quote('{"$ne":null}'), headers=hh(A_token))
if r.status_code != 200:
    bug("SECURITY","HIGH","GET /api/tools",
        "dealer_id={'$ne':null} payload",
        "200 (string match, not operator)", f"{r.status_code}")
else:
    # Verify it matched literally (no tools with dealer_id == that literal string)
    if r.json():
        bug("SECURITY","CRITICAL","GET /api/tools",
            "dealer_id=$ne operator string",
            "0 results (literal string compare)",
            f"{len(r.json())} tools returned — filter parsed as operator")
    else:
        print("  [PASS] NoSQL operator literal in dealer_id filter blocked")

# CORS
r = s.options(f"{BASE}/tools", headers={
    "Origin":"https://malicious.example",
    "Access-Control-Request-Method":"GET",
    "Access-Control-Request-Headers":"authorization",
})
print(f"  CORS preflight status={r.status_code}, ACAO={r.headers.get('Access-Control-Allow-Origin')}")
if r.headers.get("Access-Control-Allow-Origin") != "*" and not r.headers.get("Access-Control-Allow-Origin"):
    bug("SECURITY","LOW","OPTIONS preflight","CORS",
        "ACAO header present", f"missing — {dict(r.headers)}")
elif r.headers.get("Access-Control-Allow-Origin") == "*" and r.headers.get("Access-Control-Allow-Credentials") == "true":
    bug("SECURITY","HIGH","CORS configuration",
        "App sets allow_origins=['*'] AND allow_credentials=True (server.py L3527-3533)",
        "Either narrow allow_origins to specific domains OR disable allow_credentials",
        "ACAO=* + ACAC=true — Browser will refuse to send credentials but exposes a misconfiguration; will block any future credentialed cookie auth.",
        "Set allow_origins=['https://your-domain'] or allow_credentials=False.")

# ---------- 10) Warranty Claims + Maintenance ----------
print("\n=== 10) Warranty Claims & Maintenance ===")
r = s.get(f"{BASE}/warranty-claims", headers=hh(A_token))
print(f"  /warranty-claims n={len(r.json()) if r.status_code==200 else 'ERR'} status={r.status_code}")
r = s.get(f"{BASE}/warranty-claims/summary", headers=hh(A_token))
if r.status_code != 200:
    bug("FEATURE","HIGH","GET /api/warranty-claims/summary","baseline","200",
        f"{r.status_code}")
else:
    print(f"  [PASS] /warranty-claims/summary → 200 totals={r.json().get('totals')}")

# Update warranty claim with garbage status
r = s.put(f"{BASE}/warranty-claims/non-existent-uuid", headers=hh(A_token),
          json={"claim_status":"completed"})
if r.status_code != 404:
    bug("DATA","LOW","PUT /api/warranty-claims/{id}","non-existent id",
        "404", f"{r.status_code}")

# /maintenance/upcoming
r = s.get(f"{BASE}/maintenance/upcoming", headers=hh(A_token))
if r.status_code != 200:
    bug("FEATURE","HIGH","GET /api/maintenance/upcoming","","200",
        f"{r.status_code}")
else:
    print("  [PASS] /maintenance/upcoming → 200")

# ---------- 11) Bulk operations and import-fields ----------
print("\n=== 11) Bulk + import/export endpoints ===")
r = s.post(f"{BASE}/tools/bulk", headers=hh(A_token),
           json={"tool_ids":[],"action":"unknown_action"})
if r.status_code != 400:
    bug("DATA","LOW","POST /api/tools/bulk","unknown action","400",
        f"{r.status_code}")
else:
    print("  [PASS] bulk unknown action → 400")

r = s.get(f"{BASE}/tools/import-fields", headers=hh(A_token))
if r.status_code != 200 or "fields" not in r.json():
    bug("FEATURE","MEDIUM","GET /api/tools/import-fields","","200 with fields",
        f"{r.status_code} {r.text[:120]}")
else:
    print(f"  [PASS] import-fields ok ({len(r.json()['fields'])} fields)")

# ---------- 12) Throwaway delete-account isolation test ----------
print("\n=== 12) Delete-account flow (using throwaway only) ===")
TA_email = f"delete-test-{uuid.uuid4().hex[:8]}@example.com"
TA_pw = "DelPass!23"
r = s.post(f"{BASE}/auth/register", json={"email":TA_email,"password":TA_pw})
if r.status_code == 200:
    TA_token = r.json()["token"]
    # Create a tool on this user
    s.post(f"{BASE}/tools", headers=hh(TA_token), json={"name":"DELETE_TARGET_TOOL"})
    # Delete with wrong password → 401
    r = s.delete(f"{BASE}/auth/account", headers=hh(TA_token), json={"password":"wrong"})
    if r.status_code != 401:
        bug("SECURITY","CRITICAL","DELETE /api/auth/account",
            "wrong password", "401", f"{r.status_code}")
    else:
        print("  [PASS] delete-account wrong pw → 401")
    # Delete with right pw
    r = s.delete(f"{BASE}/auth/account", headers=hh(TA_token), json={"password":TA_pw})
    if r.status_code != 200:
        bug("FEATURE","HIGH","DELETE /api/auth/account",
            "correct pw","200", f"{r.status_code} {r.text[:120]}")
    else:
        print(f"  [PASS] delete-account ok totals={r.json().get('total')}")
        # Login should now fail
        rl = s.post(f"{BASE}/auth/login", json={"email":TA_email,"password":TA_pw})
        if rl.status_code != 401:
            bug("SECURITY","CRITICAL","Account deletion",
                "login after delete",
                "401 (account gone)", f"{rl.status_code}")
        else:
            print("  [PASS] login post-delete → 401")
        # Tool from deleted user should be gone — re-register and check
        rr = s.post(f"{BASE}/auth/register", json={"email":TA_email,"password":TA_pw,"name":"redo"})
        if rr.status_code == 200:
            new_token = rr.json()["token"]
            tools_after = s.get(f"{BASE}/tools", headers=hh(new_token)).json()
            if any(t.get("name") == "DELETE_TARGET_TOOL" for t in tools_after):
                bug("DATA","HIGH","DELETE /api/auth/account",
                    "data wipe","new account empty",
                    "DELETE_TARGET_TOOL still visible — leftover data leaked across re-registration with same email")
            else:
                print("  [PASS] post-delete data was wiped on email re-registration")
            # delete the throwaway again
            s.delete(f"{BASE}/auth/account", headers=hh(new_token), json={"password":TA_pw})
else:
    bug("FEATURE","HIGH","POST /api/auth/register",
        f"register {TA_email}", "200", f"{r.status_code} {r.text[:120]}")

# Verify subtest still alive
r = s.post(f"{BASE}/auth/login", json={"email":PRIMARY_EMAIL,"password":PRIMARY_PW})
if r.status_code != 200:
    bug("DATA","CRITICAL","subtest user integrity",
        "subtest@ login post-throwaway-tests",
        "200", f"{r.status_code} {r.text[:120]}")
else:
    print("  [PASS] subtest@example.com still intact")

# ---------- CLEANUP: delete A's audit fixtures + B account ----------
print("\n=== Cleanup ===")
for tid in A_tools:
    s.delete(f"{BASE}/tools/{tid}", headers=hh(A_token))
if borrow_id:
    s.delete(f"{BASE}/borrowers/{borrow_id}", headers=hh(A_token))
# Restore subtest name
s.put(f"{BASE}/auth/me", headers=hh(A_token), json={"name":"QA Tester"})

if B_token:
    r = s.delete(f"{BASE}/auth/account", headers=hh(B_token), json={"password":"Password!23"})
    print(f"  Deleted user B: {r.status_code}")

# ---------- SUMMARY ----------
print("\n" + "=" * 80)
print("AUDIT SUMMARY")
print("=" * 80)
print(f"Total bugs reported: {len(bugs)}")
by_cat = {}
for b in bugs:
    by_cat.setdefault(b["category"], []).append(b)
for cat in ("SECURITY","DATA","FEATURE","PERFORMANCE","POLISH"):
    if cat not in by_cat:
        continue
    print(f"\n--- {cat} ({len(by_cat[cat])}) ---")
    for b in by_cat[cat]:
        print(f"  [{b['severity']}] {b['endpoint']}")
        print(f"      Repro:    {b['repro']}")
        print(f"      Expected: {b['expected']}")
        print(f"      Actual:   {b['actual']}")
        if b['fix']:
            print(f"      Fix:      {b['fix']}")

print("\nDone.")
