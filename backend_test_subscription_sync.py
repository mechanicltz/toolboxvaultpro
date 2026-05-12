"""
Backend test for the NEW POST /api/subscription/sync endpoint.

NOTE: subtest@example.com has been granted LIFETIME PRO (per
/app/memory/test_credentials.md). The sync endpoint hard-blocks any sync
attempts for a lifetime user (returns skipped: lifetime_promo_already_active).
The review request says "use subtest" for case 1 but that contradicts the
endpoint logic — so for cases 1-4, 6, 7, 8 we register a fresh non-lifetime
user. Case 5 uses a *second* fresh user + admin-minted lifetime promo to
verify the safeguard.
"""
import os
import sys
import json
import uuid
import time
import requests

BASE = "https://asset-locator-12.preview.emergentagent.com/api"

SUBTEST_EMAIL = "subtest@example.com"
SUBTEST_PASS = "password123"
ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASS = "Test12345!"

results = []  # list of (id, ok, msg)


def record(case_id, ok, msg=""):
    results.append((case_id, ok, msg))
    icon = "PASS" if ok else "FAIL"
    print(f"  [{icon}] {case_id}: {msg}")


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        return None
    return r.json().get("token")


def register(email, password, name="Test User"):
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": password, "name": name}, timeout=20)
    if r.status_code != 200:
        return None
    return r.json().get("token")


def auth_headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def main():
    print("=" * 70)
    print("POST /api/subscription/sync — endpoint verification")
    print("=" * 70)

    # ---- Pre-flight: confirm subtest has lifetime (to justify using fresh user)
    sub_tok = login(SUBTEST_EMAIL, SUBTEST_PASS)
    assert sub_tok, "subtest login failed"
    r = requests.get(f"{BASE}/subscription", headers=auth_headers(sub_tok), timeout=20)
    subtest_state = r.json()
    print(f"\n[preflight] subtest is_lifetime={subtest_state.get('is_lifetime')}, entitlement={subtest_state.get('entitlement')}")
    print(f"            → using fresh user for cases 1-4,7,8 because the endpoint short-circuits when is_lifetime=true.\n")

    # ---- Create FRESH USER A (no subscription) for cases 1-4, 7, 8
    suffix_a = uuid.uuid4().hex[:8]
    user_a_email = f"sync_test_a_{suffix_a}@example.com"
    user_a_pass = "Password123!"
    tok_a = register(user_a_email, user_a_pass, "Sync Test A")
    if not tok_a:
        print(f"[fatal] could not register fresh user A: {user_a_email}")
        sys.exit(1)
    print(f"[fresh user A] {user_a_email}\n")

    # ============================================================
    # CASE 1 — Happy path activate PRO
    # ============================================================
    print("--- CASE 1: Happy path (activate PRO) ---")
    body = {
        "entitlement_active": True,
        "expires_at": "2026-06-15T12:00:00Z",
        "product_id": "pro_monthly",
        "store": "APP_STORE",
        "will_renew": True,
        "period_type": "NORMAL",
        "purchased_at": "2026-05-15T12:00:00Z",
    }
    r = requests.post(f"{BASE}/subscription/sync", headers=auth_headers(tok_a), json=body, timeout=20)
    record("1.status", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        d = r.json()
        record("1.ok", d.get("ok") is True, f"ok={d.get('ok')}")
        record("1.entitlement", d.get("entitlement") == "pro", f"entitlement={d.get('entitlement')}")
        record("1.is_active", d.get("is_active") is True, f"is_active={d.get('is_active')}")
        record("1.expires_at", bool(d.get("expires_at")), f"expires_at={d.get('expires_at')}")
    else:
        try:
            print(f"    body: {r.text}")
        except Exception:
            pass

    # ============================================================
    # CASE 2 — GET /api/subscription confirms state
    # ============================================================
    print("\n--- CASE 2: GET /api/subscription confirms state ---")
    r = requests.get(f"{BASE}/subscription", headers=auth_headers(tok_a), timeout=20)
    record("2.status", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        d = r.json()
        record("2.entitlement", d.get("entitlement") == "pro", f"entitlement={d.get('entitlement')}")
        record("2.is_active", d.get("is_active") is True, f"is_active={d.get('is_active')}")
        record("2.store", d.get("store") == "APP_STORE", f"store={d.get('store')}")
        record("2.product_id", d.get("product_id") == "pro_monthly", f"product_id={d.get('product_id')}")

    # ============================================================
    # CASE 3 — Free-limit bypass: POST 16+ tools with PRO active
    # ============================================================
    print("\n--- CASE 3: Free-limit bypass after sync (POST 16 tools) ---")
    tool_ids_a = []
    all_ok = True
    none_402 = True
    for i in range(16):
        tr = requests.post(
            f"{BASE}/tools",
            headers=auth_headers(tok_a),
            json={"name": f"SyncTest A Tool {i+1}", "quantity": 1},
            timeout=20,
        )
        if tr.status_code != 200:
            all_ok = False
            if tr.status_code == 402:
                none_402 = False
            print(f"    tool {i+1}: status={tr.status_code} body={tr.text[:150]}")
            break
        tool_ids_a.append(tr.json().get("id"))
    record("3.all_200", all_ok and len(tool_ids_a) == 16, f"created {len(tool_ids_a)}/16 tools")
    record("3.no_402", none_402, "no 402 free_limit_exceeded encountered")

    # ============================================================
    # CASE 4 — Downgrade: deactivate PRO
    # ============================================================
    print("\n--- CASE 4: Downgrade (deactivate PRO) ---")
    body = {"entitlement_active": False}
    r = requests.post(f"{BASE}/subscription/sync", headers=auth_headers(tok_a), json=body, timeout=20)
    record("4.sync.status", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        d = r.json()
        record("4.sync.entitlement", d.get("entitlement") == "free", f"entitlement={d.get('entitlement')}")
        record("4.sync.is_active", d.get("is_active") is False, f"is_active={d.get('is_active')}")

    r = requests.get(f"{BASE}/subscription", headers=auth_headers(tok_a), timeout=20)
    if r.status_code == 200:
        d = r.json()
        record("4.get.entitlement", d.get("entitlement") == "free", f"entitlement={d.get('entitlement')}")
        record("4.get.is_active", d.get("is_active") is False, f"is_active={d.get('is_active')}")
    else:
        record("4.get.status", False, f"GET status={r.status_code}")

    # Now POST 16th additional tool (already have 16 → free limit is 15)
    # The 16th tool *attempt* should 402 since we already crossed the limit
    # before downgrading. Let's try a NEW tool POST — should 402.
    tr = requests.post(
        f"{BASE}/tools",
        headers=auth_headers(tok_a),
        json={"name": "SyncTest A Post-downgrade Tool", "quantity": 1},
        timeout=20,
    )
    record("4.tool_402", tr.status_code == 402, f"post-downgrade POST /tools status={tr.status_code}")
    if tr.status_code == 402:
        try:
            detail = tr.json().get("detail", {})
            err = detail.get("error") if isinstance(detail, dict) else None
            record("4.402_error_code", err == "free_limit_exceeded", f"detail.error={err}")
        except Exception:
            pass

    # ============================================================
    # CASE 5 — Lifetime promo safeguard
    # ============================================================
    print("\n--- CASE 5: Lifetime promo safeguard ---")
    # 5a) Admin login
    admin_tok = login(ADMIN_EMAIL, ADMIN_PASS)
    if not admin_tok:
        record("5.admin_login", False, "Admin login failed — cannot mint promo")
    else:
        record("5.admin_login", True, "Admin logged in")
        # 5b) Admin mints a fresh lifetime promo
        promo_body = {
            "grant_type": "lifetime",
            "max_redemptions": 1,
            "is_active": True,
            "notes": "Test promo for /api/subscription/sync lifetime safeguard",
        }
        pr = requests.post(f"{BASE}/admin/promo-codes", headers=auth_headers(admin_tok), json=promo_body, timeout=20)
        record("5.promo_created", pr.status_code == 200, f"promo POST status={pr.status_code}")
        promo_id = None
        promo_code_str = None
        if pr.status_code == 200:
            promo_doc = pr.json()
            promo_id = promo_doc.get("id")
            promo_code_str = promo_doc.get("code")
            print(f"    minted promo: {promo_code_str} (id={promo_id})")

        if promo_code_str:
            # 5c) Register fresh user B and redeem the promo
            suffix_b = uuid.uuid4().hex[:8]
            user_b_email = f"sync_test_b_{suffix_b}@example.com"
            tok_b = register(user_b_email, "Password123!", "Sync Test B")
            record("5.user_b_register", bool(tok_b), f"user B registered: {user_b_email}")
            if tok_b:
                rr = requests.post(f"{BASE}/promo/redeem", headers=auth_headers(tok_b),
                                   json={"code": promo_code_str}, timeout=20)
                record("5.redeem", rr.status_code == 200, f"redeem status={rr.status_code}")
                if rr.status_code == 200:
                    d = rr.json()
                    record("5.redeem_lifetime", d.get("is_lifetime") is True, f"is_lifetime={d.get('is_lifetime')}")

                # 5d) POST /subscription/sync {entitlement_active: false} → should be SKIPPED
                sr = requests.post(f"{BASE}/subscription/sync",
                                   headers=auth_headers(tok_b),
                                   json={"entitlement_active": False}, timeout=20)
                record("5.sync.status", sr.status_code == 200, f"sync status={sr.status_code}")
                if sr.status_code == 200:
                    d = sr.json()
                    record("5.sync.skipped",
                           d.get("skipped") == "lifetime_promo_already_active",
                           f"skipped={d.get('skipped')}")
                    record("5.sync.is_active", d.get("is_active") is True, f"is_active={d.get('is_active')}")

                # 5e) GET /subscription confirms still lifetime + active
                gr = requests.get(f"{BASE}/subscription", headers=auth_headers(tok_b), timeout=20)
                if gr.status_code == 200:
                    d = gr.json()
                    record("5.get.is_lifetime", d.get("is_lifetime") is True, f"is_lifetime={d.get('is_lifetime')}")
                    record("5.get.is_active", d.get("is_active") is True, f"is_active={d.get('is_active')}")
                    record("5.get.entitlement", d.get("entitlement") == "pro", f"entitlement={d.get('entitlement')}")
                else:
                    record("5.get.status", False, f"GET status={gr.status_code}")

        # 5f) cleanup: delete the promo code
        if admin_tok and promo_id:
            dr = requests.delete(f"{BASE}/admin/promo-codes/{promo_id}", headers=auth_headers(admin_tok), timeout=20)
            record("5.cleanup_promo", dr.status_code == 200, f"DELETE promo status={dr.status_code}")

    # ============================================================
    # CASE 6 — Auth check
    # ============================================================
    print("\n--- CASE 6: Auth check (no Authorization header) ---")
    r = requests.post(f"{BASE}/subscription/sync", json={"entitlement_active": True}, timeout=20)
    record("6.unauthorized", r.status_code == 401, f"status={r.status_code} (expected 401)")

    # ============================================================
    # CASE 7 — Numeric expires_at (millis)
    # ============================================================
    print("\n--- CASE 7: Numeric expires_at (millis) ---")
    expires_ms = 1781875200000  # corresponds to 2026-06-19T07:20:00Z
    body = {"entitlement_active": True, "expires_at": expires_ms}
    r = requests.post(f"{BASE}/subscription/sync", headers=auth_headers(tok_a), json=body, timeout=20)
    record("7.sync.status", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        d = r.json()
        ev = d.get("expires_at") or ""
        record("7.sync.is_iso", isinstance(ev, str) and "T" in ev and not ev.isdigit(),
               f"expires_at returned as ISO: {ev}")
        record("7.sync.is_active", d.get("is_active") is True, f"is_active={d.get('is_active')}")

    # confirm via GET that it's persisted as ISO
    r = requests.get(f"{BASE}/subscription", headers=auth_headers(tok_a), timeout=20)
    if r.status_code == 200:
        d = r.json()
        ev = d.get("expires_at") or ""
        record("7.get.is_iso", isinstance(ev, str) and "T" in ev,
               f"GET expires_at: {ev}")

    # ============================================================
    # CASE 8 — Empty body
    # ============================================================
    print("\n--- CASE 8: Empty body ({}) ---")
    r = requests.post(f"{BASE}/subscription/sync", headers=auth_headers(tok_a), json={}, timeout=20)
    record("8.no_crash", r.status_code == 200, f"status={r.status_code} (no crash)")
    if r.status_code == 200:
        d = r.json()
        # default entitlement_active=False → entitlement should be free, is_active=False
        record("8.entitlement", d.get("entitlement") == "free",
               f"entitlement={d.get('entitlement')} (expected free)")
        record("8.is_active", d.get("is_active") is False,
               f"is_active={d.get('is_active')} (expected False)")

    # ============================================================
    # CLEANUP — delete the test tools created for user A
    # ============================================================
    print("\n--- CLEANUP ---")
    deleted = 0
    failed_deletes = []
    for tid in tool_ids_a:
        try:
            dr = requests.delete(f"{BASE}/tools/{tid}", headers=auth_headers(tok_a), timeout=20)
            if dr.status_code == 200:
                deleted += 1
            else:
                failed_deletes.append((tid, dr.status_code))
        except Exception as e:
            failed_deletes.append((tid, str(e)))
    print(f"  Deleted {deleted}/{len(tool_ids_a)} test tools")
    if failed_deletes:
        print(f"  Failed deletes: {failed_deletes[:5]}")

    # ============================================================
    # SUMMARY
    # ============================================================
    print("\n" + "=" * 70)
    n_pass = sum(1 for _, ok, _ in results if ok)
    n_fail = sum(1 for _, ok, _ in results if not ok)
    print(f"RESULTS: {n_pass} PASS / {n_fail} FAIL (total {len(results)})")
    if n_fail:
        print("\nFAILED:")
        for cid, ok, msg in results:
            if not ok:
                print(f"  [FAIL] {cid}: {msg}")
    print("=" * 70)
    sys.exit(0 if n_fail == 0 else 1)


if __name__ == "__main__":
    main()
