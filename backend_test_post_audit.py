"""Regression sweep for 7 backend fixes applied after the deployment audit."""
import os
import sys
import time
import uuid
import json
import base64
from typing import Any, Dict, Tuple

import requests

BASE = "https://asset-locator-12.preview.emergentagent.com/api"
SUBTEST_EMAIL = "subtest@example.com"
SUBTEST_PW = "password123"

results = []  # (group, name, ok, detail)
SESSION = requests.Session()


def add(group: str, name: str, ok: bool, detail: str = ""):
    results.append((group, name, ok, detail))
    flag = "PASS" if ok else "FAIL"
    print(f"[{flag}] {group} :: {name} :: {detail[:240]}")


def hdr(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ----- Login subtest -----
print("\n=== LOGIN subtest ===")
r = requests.post(
    f"{BASE}/auth/login",
    json={"email": SUBTEST_EMAIL, "password": SUBTEST_PW},
    timeout=30,
)
if r.status_code != 200:
    print(f"FATAL: subtest login failed {r.status_code} {r.text}")
    sys.exit(1)
SUBTEST_TOKEN = r.json()["token"]
SUBTEST_USER_ID = r.json()["user"]["id"]
print(f"subtest token OK; user_id={SUBTEST_USER_ID}")


# =============================================================================
# 1) Subscription removal
# =============================================================================
print("\n=== 1) Subscription removal ===")
g = "1.subscription_removal"

r = requests.get(f"{BASE}/auth/me", headers=hdr(SUBTEST_TOKEN), timeout=30)
add(g, "GET /auth/me 200", r.status_code == 200, f"status={r.status_code}")
me = r.json() if r.status_code == 200 else {}
expected_keys = {"id", "email", "name", "created_at"}
add(g, "/auth/me has only id/email/name/created_at",
    set(me.keys()) == expected_keys, f"keys={sorted(me.keys())}")
forbidden = {"subscription", "discount_pct", "promo_codes_used"}
leaked = forbidden & set(me.keys())
add(g, "/auth/me has no subscription/discount_pct/promo_codes_used",
    not leaked, f"leaked={leaked}")

# Register a brand-new free user
new_email = f"audit-fix-{uuid.uuid4().hex[:8]}@example.com"
new_pw = "tempPass123"
r = requests.post(
    f"{BASE}/auth/register",
    json={"email": new_email, "password": new_pw, "name": "Audit Tester"},
    timeout=30,
)
add(g, "register new free user", r.status_code == 200, f"status={r.status_code}")
NEW_TOKEN = r.json()["token"] if r.status_code == 200 else ""

# POST 11 tools — all must return 200
tool_ids_new_user = []
all_ok = True
last_status = None
for i in range(11):
    rr = requests.post(
        f"{BASE}/tools",
        json={"name": f"AuditTool{i}", "quantity": 1},
        headers=hdr(NEW_TOKEN),
        timeout=30,
    )
    last_status = rr.status_code
    if rr.status_code != 200:
        all_ok = False
        break
    tool_ids_new_user.append(rr.json()["id"])
add(g, "11 tools as free user all 200 (no 402)", all_ok and len(tool_ids_new_user) == 11,
    f"created={len(tool_ids_new_user)} last_status={last_status}")

# POST 2+ dealers — all 200
dealer_ids_new_user = []
all_ok = True
for i in range(2):
    rr = requests.post(
        f"{BASE}/dealers",
        json={"name": f"AuditDealer{i}"},
        headers=hdr(NEW_TOKEN),
        timeout=30,
    )
    if rr.status_code != 200:
        all_ok = False
        last_status = rr.status_code
        break
    dealer_ids_new_user.append(rr.json()["id"])
add(g, "2 dealers as free user all 200 (no 402)", all_ok and len(dealer_ids_new_user) == 2,
    f"created={len(dealer_ids_new_user)}")

# POST 2+ agents on one dealer — all 200
all_ok = True
agent_count = 0
if dealer_ids_new_user:
    d = dealer_ids_new_user[0]
    for i in range(2):
        rr = requests.post(
            f"{BASE}/dealers/{d}/agents",
            json={"name": f"AuditAgent{i}"},
            headers=hdr(NEW_TOKEN),
            timeout=30,
        )
        if rr.status_code != 200:
            all_ok = False
            break
        agent_count += 1
add(g, "2+ agents on one dealer all 200 (no 402)", all_ok and agent_count == 2,
    f"created={agent_count}")


# =============================================================================
# 2) Login enumeration leak
# =============================================================================
print("\n=== 2) Login enumeration leak ===")
g = "2.login_enumeration"

r = requests.post(f"{BASE}/auth/login", json={"email": "not-an-email", "password": ""}, timeout=30)
ok = r.status_code == 401
detail = ""
try:
    detail = r.json().get("detail", "")
except Exception:
    pass
add(g, 'malformed email returns 401 not 422', ok, f"status={r.status_code} body={r.text[:200]}")
add(g, 'malformed email body == "Invalid email or password"',
    detail == "Invalid email or password", f"detail={detail}")

r = requests.post(f"{BASE}/auth/login", json={"email": "nonexistent@example.com", "password": "anything"}, timeout=30)
ok = r.status_code == 401
detail = ""
try:
    detail = r.json().get("detail", "")
except Exception:
    pass
add(g, "nonexistent email returns 401", ok, f"status={r.status_code}")
add(g, "nonexistent email same generic detail",
    detail == "Invalid email or password", f"detail={detail}")

r = requests.post(f"{BASE}/auth/login", json={"email": SUBTEST_EMAIL, "password": "WRONGpw"}, timeout=30)
ok = r.status_code == 401
detail = ""
try:
    detail = r.json().get("detail", "")
except Exception:
    pass
add(g, "wrong password for known user returns 401", ok, f"status={r.status_code}")
add(g, "wrong password same generic detail",
    detail == "Invalid email or password", f"detail={detail}")

r = requests.post(f"{BASE}/auth/login", json={"email": SUBTEST_EMAIL, "password": SUBTEST_PW}, timeout=30)
add(g, "correct subtest creds still work", r.status_code == 200, f"status={r.status_code}")


# =============================================================================
# 3) /api/health
# =============================================================================
print("\n=== 3) /api/health ===")
g = "3.health"
r = requests.get(f"{BASE}/health", timeout=30)
add(g, "GET /api/health 200 (no auth)", r.status_code == 200, f"status={r.status_code}")
body = r.json() if r.status_code == 200 else {}
add(g, '/api/health body has status:"ok"', body.get("status") == "ok", f"body={body}")
add(g, '/api/health body has service:"toolbox-vault-api"',
    body.get("service") == "toolbox-vault-api", f"body={body}")


# =============================================================================
# 4) /api/ocr/receipt alias
# =============================================================================
print("\n=== 4) /api/ocr/receipt alias ===")
g = "4.ocr_alias"

# 401 without auth
r = requests.post(f"{BASE}/ocr/receipt", json={"image_base64": "abc"}, timeout=30)
add(g, "/api/ocr/receipt 401 without auth", r.status_code == 401, f"status={r.status_code}")

# Generate a tiny valid base64 placeholder (1x1 PNG)
tiny_png_b64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
r = requests.post(
    f"{BASE}/ocr/receipt",
    json={"image_base64": tiny_png_b64},
    headers=hdr(SUBTEST_TOKEN),
    timeout=120,
)
# We just need: route reachable, returns same shape as receipt-scan (or fails inside OCR)
reachable = r.status_code in (200, 400, 422, 500)  # not 404
add(g, "/api/ocr/receipt reachable with auth (not 404)", reachable, f"status={r.status_code}")
if r.status_code == 200:
    body = r.json()
    expected_keys = {"name", "brand", "model", "serial_number", "cost", "quantity",
                     "purchase_date", "dealer", "description", "raw"}
    has_keys = expected_keys.issubset(set(body.keys()))
    add(g, "/api/ocr/receipt 200 has receipt-scan shape",
        has_keys, f"missing={expected_keys - set(body.keys())}")
else:
    print(f"  /api/ocr/receipt non-200 (acceptable for receipt scan failure inside OCR): {r.status_code} {r.text[:200]}")
    # Acceptable per review: failure inside OCR is fine.


# =============================================================================
# 5) GET /api/tools — slim payload + perf
# =============================================================================
print("\n=== 5) GET /api/tools slim payload ===")
g = "5.tools_slim"

# Use subtest user (which already has tools w/ photos+docs+receipts)
t0 = time.time()
r = requests.get(f"{BASE}/tools", headers=hdr(SUBTEST_TOKEN), timeout=60)
elapsed_ms = int((time.time() - t0) * 1000)
add(g, "GET /tools 200", r.status_code == 200, f"status={r.status_code} elapsed_ms={elapsed_ms}")
tools = r.json() if r.status_code == 200 else []
print(f"  tools count={len(tools)} elapsed_ms={elapsed_ms}")

slim_ok = True
detail_msg = ""
sample_tool_id = None
for t in tools:
    photos = t.get("photos") or []
    if len(photos) > 1:
        slim_ok = False
        detail_msg = f"tool {t.get('id')} has {len(photos)} photos in list payload"
        break
    if t.get("documents") not in ([], None):
        slim_ok = False
        detail_msg = f"tool {t.get('id')} documents not stripped"
        break
    if t.get("receipts") not in ([], None):
        slim_ok = False
        detail_msg = f"tool {t.get('id')} receipts not stripped"
        break
    if not sample_tool_id and (photos or t.get("documents") or t.get("receipts") is not None):
        sample_tool_id = t.get("id")
add(g, "all list items have photos<=1, documents=[], receipts=[]", slim_ok, detail_msg)

# Pick a tool with at least one photo for detail comparison
if not sample_tool_id and tools:
    sample_tool_id = tools[0].get("id")

if sample_tool_id:
    rr = requests.get(f"{BASE}/tools/{sample_tool_id}", headers=hdr(SUBTEST_TOKEN), timeout=30)
    add(g, "GET /tools/{id} returns 200", rr.status_code == 200, f"status={rr.status_code}")
    if rr.status_code == 200:
        full = rr.json()
        # Detail endpoint should return full photos/documents/receipts (whatever is stored)
        full_photos = full.get("photos") or []
        # Just confirm the keys are present and arrays (cannot enforce >1 since test data may not have it)
        add(g, "GET /tools/{id} has photos array", isinstance(full_photos, list),
            f"photos type={type(full_photos).__name__} len={len(full_photos)}")
        add(g, "GET /tools/{id} has documents array",
            isinstance(full.get("documents"), list), f"docs={type(full.get('documents')).__name__}")
        add(g, "GET /tools/{id} has receipts array",
            isinstance(full.get("receipts"), list), f"receipts={type(full.get('receipts')).__name__}")

# Speed check (informational vs <2097ms previous)
add(g, "GET /tools is faster than 2097ms",
    elapsed_ms < 2097, f"elapsed_ms={elapsed_ms}")


# =============================================================================
# 6) DELETE → 404 on missing IDs
# =============================================================================
print("\n=== 6) DELETE 404 ===")
g = "6.delete_404"
fake = "FAKE-ID-1234"

# Use the new throwaway user so we don't risk subtest's data
endpoints = [
    ("tools", f"/tools/{fake}"),
    ("locations", f"/locations/{fake}"),
    ("tags", f"/tags/{fake}"),
    ("categories", f"/categories/{fake}"),
    ("borrowers", f"/borrowers/{fake}"),
    ("dealers", f"/dealers/{fake}"),
    ("warranty-claims", f"/warranty-claims/{fake}"),
    ("wishlist", f"/wishlist/{fake}"),
]

for name, path in endpoints:
    rr = requests.delete(f"{BASE}{path}", headers=hdr(NEW_TOKEN), timeout=30)
    add(g, f"DELETE {path} on missing id → 404",
        rr.status_code == 404, f"status={rr.status_code} body={rr.text[:120]}")

# Verify a real DELETE still returns 200 for each endpoint (real-deletes path)
# Build real fixtures using NEW_TOKEN
print("\n  Building fixtures for real-delete verification...")

real_ids: Dict[str, str] = {}
# tool
rr = requests.post(f"{BASE}/tools", json={"name": "RealDelTool"}, headers=hdr(NEW_TOKEN), timeout=30)
if rr.status_code == 200:
    real_ids["tools"] = rr.json()["id"]
# location
rr = requests.post(f"{BASE}/locations", json={"name": "RealDelLoc"}, headers=hdr(NEW_TOKEN), timeout=30)
if rr.status_code == 200:
    real_ids["locations"] = rr.json()["id"]
# tag
rr = requests.post(f"{BASE}/tags", json={"name": f"realdeltag-{uuid.uuid4().hex[:6]}"}, headers=hdr(NEW_TOKEN), timeout=30)
if rr.status_code == 200:
    real_ids["tags"] = rr.json()["id"]
# category
rr = requests.post(f"{BASE}/categories", json={"name": f"RealDelCat-{uuid.uuid4().hex[:6]}"}, headers=hdr(NEW_TOKEN), timeout=30)
if rr.status_code == 200:
    real_ids["categories"] = rr.json()["id"]
# borrower
rr = requests.post(f"{BASE}/borrowers", json={"name": "RealDelBorrower"}, headers=hdr(NEW_TOKEN), timeout=30)
if rr.status_code == 200:
    real_ids["borrowers"] = rr.json()["id"]
# dealer
rr = requests.post(f"{BASE}/dealers", json={"name": f"RealDelDealer-{uuid.uuid4().hex[:6]}"}, headers=hdr(NEW_TOKEN), timeout=30)
if rr.status_code == 200:
    real_ids["dealers"] = rr.json()["id"]
# warranty-claim — needs to be auto-created via tool with needs_repair
broken_tool_id = None
rr = requests.post(
    f"{BASE}/tools",
    json={"name": "BrokenForClaim", "needs_repair": True,
          "repair_info": {"company_notified": "X", "notified_at": "2026-01-01",
                          "repair_status": "Reported"}},
    headers=hdr(NEW_TOKEN),
    timeout=30,
)
if rr.status_code == 200:
    broken_tool_id = rr.json()["id"]
    rr = requests.get(f"{BASE}/warranty-claims?tool_id={broken_tool_id}",
                      headers=hdr(NEW_TOKEN), timeout=30)
    if rr.status_code == 200 and rr.json():
        real_ids["warranty-claims"] = rr.json()[0]["id"]
# wishlist
rr = requests.post(f"{BASE}/wishlist", json={"name": "RealDelWish"}, headers=hdr(NEW_TOKEN), timeout=30)
if rr.status_code == 200:
    real_ids["wishlist"] = rr.json()["id"]

print(f"  Real fixtures created: {list(real_ids.keys())}")

# Now verify real DELETE returns 200
for name, path_tmpl in [
    ("tools", "/tools/{}"),
    ("locations", "/locations/{}"),
    ("tags", "/tags/{}"),
    ("categories", "/categories/{}"),
    ("borrowers", "/borrowers/{}"),
    ("dealers", "/dealers/{}"),
    ("warranty-claims", "/warranty-claims/{}"),
    ("wishlist", "/wishlist/{}"),
]:
    if name in real_ids:
        rid = real_ids[name]
        rr = requests.delete(f"{BASE}{path_tmpl.format(rid)}",
                             headers=hdr(NEW_TOKEN), timeout=30)
        add(g, f"DELETE {path_tmpl.format(rid)} real id → 200",
            rr.status_code == 200, f"status={rr.status_code} body={rr.text[:160]}")
        # verify second delete returns 404 (truly removed)
        rr2 = requests.delete(f"{BASE}{path_tmpl.format(rid)}",
                              headers=hdr(NEW_TOKEN), timeout=30)
        add(g, f"second DELETE {path_tmpl.format(rid)} → 404 (actually removed)",
            rr2.status_code == 404, f"status={rr2.status_code}")
    else:
        add(g, f"real fixture for {name}", False, "missing — could not create fixture")

# Clean up the broken tool
if broken_tool_id:
    requests.delete(f"{BASE}/tools/{broken_tool_id}", headers=hdr(NEW_TOKEN), timeout=30)


# =============================================================================
# 7) CORS — credentialed flag dropped
# =============================================================================
print("\n=== 7) CORS ===")
g = "7.cors"

r = requests.options(
    f"{BASE}/tools",
    headers={
        "Origin": "https://example.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
    },
    timeout=30,
)
print(f"  OPTIONS status={r.status_code} headers={dict(r.headers)}")
acac = r.headers.get("Access-Control-Allow-Credentials", "")
acao = r.headers.get("Access-Control-Allow-Origin", "")
add(g, "OPTIONS does NOT include Access-Control-Allow-Credentials: true",
    acac.lower() != "true", f"ACAC={acac!r}")
add(g, "OPTIONS still includes Access-Control-Allow-Origin: *",
    acao == "*", f"ACAO={acao!r}")


# =============================================================================
# 8) Photo size cap
# =============================================================================
print("\n=== 8) Photo size cap ===")
g = "8.photo_cap"

# Small ~50KB photo — base64 string of ~50000 chars
small_photo_b64 = "data:image/jpeg;base64," + ("A" * 50000)  # ~50KB string
r = requests.post(
    f"{BASE}/tools",
    json={"name": "PhotoCapSmall", "photos": [small_photo_b64]},
    headers=hdr(NEW_TOKEN),
    timeout=30,
)
add(g, "POST tool with small photo (~50KB) → 200", r.status_code == 200,
    f"status={r.status_code} body={r.text[:200]}")
small_photo_tool = r.json().get("id") if r.status_code == 200 else None
if small_photo_tool:
    requests.delete(f"{BASE}/tools/{small_photo_tool}", headers=hdr(NEW_TOKEN), timeout=30)

# >6MB single photo: Per-photo cap is 5MB. Let's use ~7MB string.
big_photo_b64 = "data:image/jpeg;base64," + ("B" * (7 * 1024 * 1024))  # ~7MB
r = requests.post(
    f"{BASE}/tools",
    json={"name": "PhotoCapBig", "photos": [big_photo_b64]},
    headers=hdr(NEW_TOKEN),
    timeout=120,
)
add(g, "POST tool with >6MB single photo → 413",
    r.status_code == 413, f"status={r.status_code} body={r.text[:200]}")
detail = ""
try:
    detail = r.json().get("detail", "")
except Exception:
    pass
add(g, '413 detail mentions "Photo #1 is too large"',
    "Photo #1 is too large" in str(detail), f"detail={str(detail)[:200]}")

# >25MB total across multiple photos (each photo just under cap)
# Per-photo cap is 5MB. Use 6 photos × 4.5MB = ~27MB total
photo_4_5mb = "data:image/jpeg;base64," + ("C" * int(4.5 * 1024 * 1024))
photos_payload = [photo_4_5mb for _ in range(6)]
r = requests.post(
    f"{BASE}/tools",
    json={"name": "PhotoCapBigTotal", "photos": photos_payload},
    headers=hdr(NEW_TOKEN),
    timeout=120,
)
add(g, "POST tool with >25MB total photos → 413",
    r.status_code == 413, f"status={r.status_code} body={r.text[:240]}")
detail = ""
try:
    detail = r.json().get("detail", "")
except Exception:
    pass
add(g, '413 detail mentions "Total photo payload"',
    "Total photo payload" in str(detail), f"detail={str(detail)[:240]}")


# =============================================================================
# Smoke regression
# =============================================================================
print("\n=== Smoke regression ===")
g = "smoke"

# subtest still works
r = requests.post(f"{BASE}/auth/login",
                  json={"email": SUBTEST_EMAIL, "password": SUBTEST_PW}, timeout=30)
add(g, "subtest login still 200", r.status_code == 200, f"status={r.status_code}")

r = requests.get(f"{BASE}/auth/me", headers=hdr(SUBTEST_TOKEN), timeout=30)
add(g, "subtest /me 200", r.status_code == 200, f"status={r.status_code}")

r = requests.get(f"{BASE}/tools", headers=hdr(SUBTEST_TOKEN), timeout=60)
add(g, "subtest /tools 200", r.status_code == 200, f"status={r.status_code}")

# Multi-tenant isolation: create a tool as NEW_TOKEN, verify SUBTEST_TOKEN can't read it
r = requests.post(f"{BASE}/tools", json={"name": "ISOTestNewUser"},
                  headers=hdr(NEW_TOKEN), timeout=30)
iso_tool_id = r.json()["id"] if r.status_code == 200 else None
if iso_tool_id:
    rr = requests.get(f"{BASE}/tools/{iso_tool_id}",
                      headers=hdr(SUBTEST_TOKEN), timeout=30)
    add(g, "userA cannot GET userB's tool by id (404)",
        rr.status_code == 404, f"status={rr.status_code}")
    requests.delete(f"{BASE}/tools/{iso_tool_id}", headers=hdr(NEW_TOKEN), timeout=30)
else:
    add(g, "multi-tenant fixture creation", False, "could not create iso tool")

# PDF render still works
inventory_spec = {
    "report_type": "inventory",
    "format": "pdf",
    "options": {},
}
r = requests.post(f"{BASE}/reports/render", json=inventory_spec,
                  headers=hdr(SUBTEST_TOKEN), timeout=120)
content_ok = (
    r.status_code == 200
    and r.headers.get("content-type", "").startswith("application/pdf")
    and r.content[:4] == b"%PDF"
)
add(g, "POST /reports/render inventory pdf → 200 + valid %PDF",
    content_ok,
    f"status={r.status_code} content-type={r.headers.get('content-type')} first8={r.content[:8] if r.status_code == 200 else r.text[:200]}")


# =============================================================================
# Cleanup new throwaway user
# =============================================================================
print("\n=== Cleanup throwaway user ===")
r = requests.delete(
    f"{BASE}/auth/account",
    json={"password": new_pw},
    headers=hdr(NEW_TOKEN),
    timeout=60,
)
print(f"  delete-account status={r.status_code} body={r.text[:200]}")


# =============================================================================
# Summary
# =============================================================================
print("\n========== SUMMARY ==========")
total = len(results)
passed = sum(1 for r in results if r[2])
failed = total - passed
print(f"TOTAL: {total} | PASS: {passed} | FAIL: {failed}")

if failed > 0:
    print("\nFAILED TESTS:")
    for grp, name, ok, detail in results:
        if not ok:
            print(f"  [{grp}] {name} :: {detail}")

sys.exit(0 if failed == 0 else 1)
