"""
Phase A — RevenueCat Promo Code Admin CRUD backend tests.

Targets:
  GET    /api/admin/me
  GET    /api/admin/promo-codes
  POST   /api/admin/promo-codes
  PATCH  /api/admin/promo-codes/{id}
  DELETE /api/admin/promo-codes/{id}
  POST   /api/promo/redeem
  GET    /api/subscription
  POST   /api/tools (>15 enforcement bypass after promo)

Admin user: MechanicLTZ@gmail.com / Test12345!  (created if missing)
Non-admin user: subtest@example.com / password123
"""
from __future__ import annotations
import os
import sys
import json
import time
import uuid
from typing import Any, Dict, List, Optional

import requests

BASE = os.environ.get("BACKEND_URL", "https://toolbox-vault-v3.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASS = "Test12345!"

NON_ADMIN_EMAIL = "subtest@example.com"
NON_ADMIN_PASS = "password123"

PASS = 0
FAIL = 0
FAILURES: List[str] = []


def check(cond: bool, label: str, extra: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {label}")
    else:
        FAIL += 1
        msg = f"❌ {label}" + (f" — {extra}" if extra else "")
        FAILURES.append(msg)
        print(f"  {msg}")


def post(path: str, body: Any = None, token: Optional[str] = None, expect: Optional[int] = None) -> requests.Response:
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    r = requests.post(f"{API}{path}", json=body, headers=h, timeout=30)
    return r


def patch(path: str, body: Any = None, token: Optional[str] = None) -> requests.Response:
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    r = requests.patch(f"{API}{path}", json=body, headers=h, timeout=30)
    return r


def get(path: str, token: Optional[str] = None) -> requests.Response:
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    r = requests.get(f"{API}{path}", headers=h, timeout=30)
    return r


def delete(path: str, token: Optional[str] = None) -> requests.Response:
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    r = requests.delete(f"{API}{path}", headers=h, timeout=30)
    return r


def ensure_user(email: str, password: str, name: str = "") -> str:
    """Register if missing, then log in. Returns JWT token."""
    # Try login first
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code == 200:
        return r.json().get("token") or r.json().get("access_token")
    # Try register
    r2 = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": name or email.split("@")[0]}, timeout=30)
    if r2.status_code in (200, 201):
        tok = r2.json().get("token") or r2.json().get("access_token")
        if tok:
            return tok
    # Try login again
    r3 = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r3.status_code == 200:
        return r3.json().get("token") or r3.json().get("access_token")
    raise RuntimeError(f"Cannot auth {email}: login={r.status_code} register={r2.status_code} {r2.text[:200]}")


def main() -> int:
    print(f"=== Phase A Admin Promo Code Tests — {API} ===\n")

    print("[setup] Authenticate admin + non-admin")
    admin_token = ensure_user(ADMIN_EMAIL, ADMIN_PASS, name="Admin Mechanic")
    nonadmin_token = ensure_user(NON_ADMIN_EMAIL, NON_ADMIN_PASS, name="Subtest")
    check(bool(admin_token), "Admin token obtained")
    check(bool(nonadmin_token), "Non-admin token obtained")

    # ============================================================
    # 1) GET /api/admin/me
    # ============================================================
    print("\n[1] GET /api/admin/me")
    r = get("/admin/me", token=admin_token)
    check(r.status_code == 200, "admin/me as admin → 200", f"got {r.status_code} {r.text[:200]}")
    j = r.json() if r.status_code == 200 else {}
    check(j.get("is_admin") is True, "admin/me as admin → is_admin=true", f"got {j}")
    check(j.get("email", "").lower() == ADMIN_EMAIL.lower(), "admin/me as admin → email matches", f"got {j}")

    r = get("/admin/me", token=nonadmin_token)
    check(r.status_code == 200, "admin/me as non-admin → 200 (allowed for any user)", f"got {r.status_code}")
    j = r.json() if r.status_code == 200 else {}
    check(j.get("is_admin") is False, "admin/me as non-admin → is_admin=false", f"got {j}")
    check(j.get("email", "").lower() == NON_ADMIN_EMAIL.lower(), "admin/me as non-admin → email matches", f"got {j}")

    # ============================================================
    # 2) GET /api/admin/promo-codes
    # ============================================================
    print("\n[2] GET /api/admin/promo-codes")
    r = get("/admin/promo-codes", token=admin_token)
    check(r.status_code == 200, "admin list codes as admin → 200", f"got {r.status_code} {r.text[:200]}")
    initial_codes = r.json() if r.status_code == 200 else []
    check(isinstance(initial_codes, list), "admin list → list", f"got {type(initial_codes)}")

    r = get("/admin/promo-codes", token=nonadmin_token)
    check(r.status_code == 403, "admin list as non-admin → 403", f"got {r.status_code} {r.text[:200]}")

    # ============================================================
    # 3) POST /api/admin/promo-codes — create
    # ============================================================
    print("\n[3] POST /api/admin/promo-codes — create")

    # 3a — Lifetime with custom code name
    lifetime_code_name = f"PHASE_A_LIFETIME_{uuid.uuid4().hex[:6].upper()}"
    r = post("/admin/promo-codes", body={
        "code": lifetime_code_name,
        "grant_type": "lifetime",
        "max_redemptions": 3,
        "is_active": True,
        "notes": "Phase A test — lifetime",
    }, token=admin_token)
    check(r.status_code == 200, "create lifetime → 200", f"got {r.status_code} {r.text[:200]}")
    lifetime_doc = r.json() if r.status_code == 200 else {}
    check(lifetime_doc.get("code") == lifetime_code_name, "lifetime code name persisted (upper)", f"got {lifetime_doc.get('code')}")
    check(lifetime_doc.get("grant_type") == "lifetime", "lifetime grant_type", f"got {lifetime_doc.get('grant_type')}")
    check(lifetime_doc.get("max_redemptions") == 3, "lifetime max_redemptions=3", f"got {lifetime_doc.get('max_redemptions')}")
    check(lifetime_doc.get("is_active") is True, "lifetime is_active=true", f"got {lifetime_doc.get('is_active')}")
    check(lifetime_doc.get("redeemed_count") == 0, "lifetime redeemed_count=0", f"got {lifetime_doc.get('redeemed_count')}")
    check(bool(lifetime_doc.get("id")), "lifetime id assigned", f"got {lifetime_doc}")
    lifetime_id = lifetime_doc.get("id")

    # 3b — Months variant
    months_code_name = f"PHASE_A_MONTHS_{uuid.uuid4().hex[:6].upper()}"
    r = post("/admin/promo-codes", body={
        "code": months_code_name,
        "grant_type": "months",
        "months": 6,
        "max_redemptions": 1,
        "notes": "Phase A test — months",
    }, token=admin_token)
    check(r.status_code == 200, "create months → 200", f"got {r.status_code} {r.text[:200]}")
    months_doc = r.json() if r.status_code == 200 else {}
    check(months_doc.get("grant_type") == "months", "months grant_type", f"got {months_doc.get('grant_type')}")
    check(months_doc.get("months") == 6, "months value=6", f"got {months_doc.get('months')}")
    months_id = months_doc.get("id")

    # 3c — Auto-generated code (no code field)
    r = post("/admin/promo-codes", body={
        "grant_type": "lifetime",
    }, token=admin_token)
    check(r.status_code == 200, "create auto-gen code → 200", f"got {r.status_code} {r.text[:200]}")
    auto_doc = r.json() if r.status_code == 200 else {}
    auto_code_name = auto_doc.get("code", "")
    check(auto_code_name.startswith("PROMO-") and len(auto_code_name) > 6, "auto-gen code looks like PROMO-XXXX-XXXX", f"got '{auto_code_name}'")
    auto_id = auto_doc.get("id")

    # 3d — Conflict on duplicate name
    r = post("/admin/promo-codes", body={
        "code": lifetime_code_name,
        "grant_type": "lifetime",
    }, token=admin_token)
    check(r.status_code == 409, "duplicate code → 409", f"got {r.status_code} {r.text[:200]}")

    # 3e — months grant_type with months=0 → 400
    r = post("/admin/promo-codes", body={
        "grant_type": "months",
        "months": 0,
    }, token=admin_token)
    check(r.status_code == 400, "months grant_type with months=0 → 400", f"got {r.status_code}")

    # 3f — max_redemptions < 1 → 400
    r = post("/admin/promo-codes", body={
        "grant_type": "lifetime",
        "max_redemptions": 0,
    }, token=admin_token)
    check(r.status_code == 400, "max_redemptions=0 → 400", f"got {r.status_code}")

    # 3g — Non-admin create → 403
    r = post("/admin/promo-codes", body={
        "grant_type": "lifetime",
    }, token=nonadmin_token)
    check(r.status_code == 403, "non-admin create → 403", f"got {r.status_code}")

    # Verify list now includes our codes
    r = get("/admin/promo-codes", token=admin_token)
    all_codes = r.json() if r.status_code == 200 else []
    names = {c.get("code") for c in all_codes}
    check(lifetime_code_name in names, "list contains created lifetime code", f"names sample={list(names)[:6]}")
    check(months_code_name in names, "list contains created months code")
    check(auto_code_name in names, "list contains auto-gen code")

    # ============================================================
    # 4) PATCH /api/admin/promo-codes/{id}
    # ============================================================
    print("\n[4] PATCH /api/admin/promo-codes/{id}")

    # 4a — toggle is_active off
    r = patch(f"/admin/promo-codes/{lifetime_id}", body={"is_active": False}, token=admin_token)
    check(r.status_code == 200, "patch is_active=false → 200", f"got {r.status_code} {r.text[:200]}")
    check(r.json().get("is_active") is False if r.status_code == 200 else False, "is_active toggled false")

    # 4b — change max_redemptions
    r = patch(f"/admin/promo-codes/{lifetime_id}", body={"max_redemptions": 10}, token=admin_token)
    check(r.status_code == 200, "patch max_redemptions=10 → 200", f"got {r.status_code}")
    check(r.json().get("max_redemptions") == 10 if r.status_code == 200 else False, "max_redemptions=10 persisted")

    # 4c — change notes
    r = patch(f"/admin/promo-codes/{lifetime_id}", body={"notes": "Updated notes"}, token=admin_token)
    check(r.status_code == 200, "patch notes → 200", f"got {r.status_code}")
    check(r.json().get("notes") == "Updated notes" if r.status_code == 200 else False, "notes updated")

    # 4d — toggle is_active back on (needed for redeem test)
    r = patch(f"/admin/promo-codes/{lifetime_id}", body={"is_active": True}, token=admin_token)
    check(r.status_code == 200, "patch is_active=true → 200", f"got {r.status_code}")

    # 4e — patch non-existent id → 404
    r = patch("/admin/promo-codes/nonexistent-id-1234", body={"notes": "x"}, token=admin_token)
    check(r.status_code == 404, "patch missing id → 404", f"got {r.status_code} {r.text[:200]}")

    # 4f — rename to existing code → 409
    r = patch(f"/admin/promo-codes/{lifetime_id}", body={"code": months_code_name}, token=admin_token)
    check(r.status_code == 409, "rename to existing → 409", f"got {r.status_code} {r.text[:200]}")

    # 4g — non-admin patch → 403
    r = patch(f"/admin/promo-codes/{lifetime_id}", body={"notes": "x"}, token=nonadmin_token)
    check(r.status_code == 403, "non-admin patch → 403", f"got {r.status_code}")

    # ============================================================
    # 5) POST /api/promo/redeem — flow + 6+7
    # ============================================================
    print("\n[5/6/7] /api/promo/redeem + /api/subscription + tool-limit bypass")
    # Use a fresh user to test free-limit bypass — subtest is already lifetime PRO.
    fresh_email = f"phasea_{uuid.uuid4().hex[:8]}@example.com"
    fresh_pass = "TestPass123!"
    fresh_token = ensure_user(fresh_email, fresh_pass, name="PhaseA Fresh")
    check(bool(fresh_token), "fresh user registered/logged in")

    # Confirm initial subscription is free
    r = get("/subscription", token=fresh_token)
    check(r.status_code == 200, "GET /subscription (fresh) → 200", f"got {r.status_code}")
    sub_before = r.json() if r.status_code == 200 else {}
    check(sub_before.get("entitlement") == "free", "fresh user entitlement=free", f"got {sub_before.get('entitlement')}")
    check(sub_before.get("free_limit") == 15, "free_limit=15", f"got {sub_before.get('free_limit')}")

    # Redeem the lifetime code as fresh user
    r = post("/promo/redeem", body={"code": lifetime_code_name}, token=fresh_token)
    check(r.status_code == 200, "redeem lifetime code → 200", f"got {r.status_code} {r.text[:300]}")
    redeem_resp = r.json() if r.status_code == 200 else {}
    check(redeem_resp.get("ok") is True, "redeem ok=true", f"got {redeem_resp}")
    check(redeem_resp.get("entitlement") == "pro", "redeem entitlement=pro", f"got {redeem_resp}")
    check(redeem_resp.get("is_lifetime") is True, "redeem is_lifetime=true", f"got {redeem_resp}")

    # 7) GET /api/subscription reflects promo grant
    r = get("/subscription", token=fresh_token)
    check(r.status_code == 200, "GET /subscription after redeem → 200")
    sub_after = r.json() if r.status_code == 200 else {}
    check(sub_after.get("entitlement") == "pro", "after redeem entitlement=pro", f"got {sub_after}")
    check(sub_after.get("is_lifetime") is True, "after redeem is_lifetime=true", f"got {sub_after}")
    check(sub_after.get("is_active") is True, "after redeem is_active=true", f"got {sub_after}")
    check(sub_after.get("promo_code") == lifetime_code_name, "after redeem promo_code matches", f"got {sub_after.get('promo_code')}")

    # Re-redeem by same user → 400 (already redeemed)
    r = post("/promo/redeem", body={"code": lifetime_code_name}, token=fresh_token)
    check(r.status_code == 400, "re-redeem same code by same user → 400", f"got {r.status_code} {r.text[:200]}")

    # Invalid code → 404
    r = post("/promo/redeem", body={"code": "NONEXISTENT_CODE_12345"}, token=fresh_token)
    check(r.status_code == 404, "redeem unknown code → 404", f"got {r.status_code}")

    # 6) Now create > 15 tools as fresh (promo) user — limit should be bypassed
    print("\n[6] Tool create limit bypass after promo")
    created_tool_ids: List[str] = []
    try:
        for i in range(18):  # > 15
            r = post("/tools", body={"name": f"PhaseA_PromoTool_{i:02d}", "quantity": 1}, token=fresh_token)
            if r.status_code != 200:
                check(False, f"create tool #{i+1} → 200", f"got {r.status_code} {r.text[:200]}")
                break
            tid = r.json().get("id")
            if tid:
                created_tool_ids.append(tid)
        check(len(created_tool_ids) >= 16, f"created at least 16 tools (above free limit of 15)", f"actually created {len(created_tool_ids)}")
    finally:
        # cleanup tools
        for tid in created_tool_ids:
            try:
                delete(f"/tools/{tid}", token=fresh_token)
            except Exception:
                pass

    # ============================================================
    # 8) DELETE /api/admin/promo-codes/{id}
    # ============================================================
    print("\n[8] DELETE /api/admin/promo-codes/{id}")

    # 8a — non-admin delete → 403
    r = delete(f"/admin/promo-codes/{months_id}", token=nonadmin_token)
    check(r.status_code == 403, "non-admin delete → 403", f"got {r.status_code}")

    # 8b — admin delete → 200 + ok body
    r = delete(f"/admin/promo-codes/{months_id}", token=admin_token)
    check(r.status_code == 200, "admin delete months → 200", f"got {r.status_code} {r.text[:200]}")
    j = r.json() if r.status_code == 200 else {}
    check(j.get("ok") is True, "delete response ok=true", f"got {j}")
    check(j.get("deleted") == months_id, "delete response deleted=id", f"got {j}")

    # 8c — delete already-gone → 404
    r = delete(f"/admin/promo-codes/{months_id}", token=admin_token)
    check(r.status_code == 404, "delete missing → 404", f"got {r.status_code}")

    # 8d — delete the others (cleanup)
    r = delete(f"/admin/promo-codes/{lifetime_id}", token=admin_token)
    check(r.status_code == 200, "cleanup delete lifetime code → 200", f"got {r.status_code}")
    r = delete(f"/admin/promo-codes/{auto_id}", token=admin_token)
    check(r.status_code == 200, "cleanup delete auto-gen code → 200", f"got {r.status_code}")

    # Verify cleanup
    r = get("/admin/promo-codes", token=admin_token)
    after_codes = r.json() if r.status_code == 200 else []
    after_names = {c.get("code") for c in after_codes}
    check(lifetime_code_name not in after_names, "lifetime code removed from list")
    check(months_code_name not in after_names, "months code removed from list")
    check(auto_code_name not in after_names, "auto-gen code removed from list")

    # ============================================================
    print("\n=== SUMMARY ===")
    print(f"PASS = {PASS}")
    print(f"FAIL = {FAIL}")
    if FAILURES:
        print("\nFailures:")
        for f in FAILURES:
            print(f"  {f}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
