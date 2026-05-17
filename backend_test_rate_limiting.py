"""
Backend rate-limit verification.
Run against http://localhost:8001/api.

Tests:
  1. Login: 5/min per IP
  2. Restart -> legitimate login still works
  3. Forgot-password: 3/hr per IP
  4. /api/auth/me NOT rate limited
  5. AI receipt scan: 30/hr per user
  6. /api/render-pdf: 20/hr per user
  7. /api/reports/render: 20/hr per user
  8. RevenueCat webhook NOT rate limited
  9. /api/health and /api/tools NOT rate limited
"""

import json
import subprocess
import sys
import time

import requests

BASE = "http://localhost:8001/api"
ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASSWORD = "Blue321!"
RC_SECRET = "wh_secret_X9k2mP7nQ4vR8tL3cF6aB1jH5wE0sD2y"

passes = 0
fails = 0
fail_msgs = []


def check(name, cond, details=""):
    global passes, fails
    if cond:
        passes += 1
        print(f"  ✓ {name}")
    else:
        fails += 1
        msg = f"  ✗ {name}: {details}"
        print(msg)
        fail_msgs.append(msg)


def restart_backend():
    print("\n[restart] sudo supervisorctl restart backend ...")
    subprocess.run(
        ["sudo", "supervisorctl", "restart", "backend"],
        check=False,
        capture_output=True,
    )
    # Wait for it to come up
    for _ in range(30):
        time.sleep(1)
        try:
            r = requests.get(f"{BASE}/health", timeout=2)
            if r.status_code == 200:
                print(f"[restart] backend up after wait")
                # tiny extra grace
                time.sleep(0.5)
                return
        except Exception:
            pass
    print("[restart] WARNING: backend health never returned 200")


def login(email, password):
    return requests.post(
        f"{BASE}/auth/login",
        json={"email": email, "password": password},
        timeout=10,
    )


def test_1_login_rate_limit():
    print("\n=== TEST 1: Login rate limit (5/min per IP) ===")
    restart_backend()
    statuses = []
    for i in range(5):
        r = login(ADMIN_EMAIL, "WRONG_PASSWORD_XYZ")
        statuses.append(r.status_code)
    check(
        "First 5 wrong-password attempts return 401",
        all(s == 401 for s in statuses),
        f"got statuses={statuses}",
    )
    r6 = login(ADMIN_EMAIL, "WRONG_PASSWORD_XYZ")
    check(
        "6th wrong-password attempt returns 429",
        r6.status_code == 429,
        f"got {r6.status_code} body={r6.text[:200]}",
    )
    try:
        body = r6.json()
        msg = (body.get("detail") or "").lower()
        check(
            "429 message mentions login attempts / try again",
            ("login" in msg or "try again" in msg or "attempt" in msg or "wait" in msg),
            f"detail={body.get('detail')}",
        )
    except Exception as e:
        check("429 body is JSON", False, str(e))

    # Even with CORRECT password we should still get 429 because IP is locked
    r_correct = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    check(
        "7th attempt with CORRECT password still returns 429 (IP-locked)",
        r_correct.status_code == 429,
        f"got {r_correct.status_code} body={r_correct.text[:200]}",
    )


def test_2_legitimate_login_after_restart():
    print("\n=== TEST 2: Legitimate login works after restart ===")
    restart_backend()
    r = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    check(
        "POST /auth/login with correct credentials returns 200",
        r.status_code == 200,
        f"got {r.status_code} body={r.text[:200]}",
    )
    token = None
    if r.status_code == 200:
        token = r.json().get("token")
        check("Response has token", bool(token))
    return token


def test_3_forgot_password_rate_limit():
    print("\n=== TEST 3: Forgot-password rate limit (3/hr per IP) ===")
    restart_backend()
    statuses = []
    bodies = []
    for i in range(3):
        r = requests.post(
            f"{BASE}/auth/forgot-password",
            json={"email": "nobody-doesnotexist-1234@example.com"},
            timeout=10,
        )
        statuses.append(r.status_code)
        try:
            bodies.append(r.json())
        except Exception:
            bodies.append({})
    check(
        "First 3 forgot-password calls return 200",
        all(s == 200 for s in statuses),
        f"statuses={statuses}",
    )
    # Generic message (does not reveal whether email exists)
    msgs = [(b.get("message") or "").lower() for b in bodies]
    check(
        "Forgot-password returns generic message (no email enumeration)",
        all(("if that email" in m or "code has been sent" in m or "registered" in m) for m in msgs),
        f"messages={msgs}",
    )
    r4 = requests.post(
        f"{BASE}/auth/forgot-password",
        json={"email": "nobody-doesnotexist-1234@example.com"},
        timeout=10,
    )
    check(
        "4th forgot-password call returns 429",
        r4.status_code == 429,
        f"got {r4.status_code} body={r4.text[:200]}",
    )


def test_4_auth_me_not_rate_limited():
    print("\n=== TEST 4: /api/auth/me NOT rate-limited ===")
    restart_backend()
    r = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if r.status_code != 200:
        check("Login for /me test", False, f"got {r.status_code}")
        return None
    token = r.json().get("token")
    headers = {"Authorization": f"Bearer {token}"}
    statuses = []
    for i in range(10):
        rr = requests.get(f"{BASE}/auth/me", headers=headers, timeout=10)
        statuses.append(rr.status_code)
    check(
        "10 consecutive /auth/me calls all return 200 (not rate-limited)",
        all(s == 200 for s in statuses),
        f"statuses={statuses}",
    )
    return token


def test_5_ai_receipt_scan_rate_limit():
    print("\n=== TEST 5: AI receipt scan rate limit (30/hr per user) ===")
    restart_backend()
    r = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if r.status_code != 200:
        check("Login for AI receipt scan test", False, f"got {r.status_code}")
        return
    token = r.json().get("token")
    headers = {"Authorization": f"Bearer {token}"}
    # Send invalid base64 -> 400 (Invalid base64 image). Verify rate-limit fires
    # AFTER 30 such calls (the 31st should 429), and crucially BEFORE OpenAI.
    statuses = []
    for i in range(30):
        rr = requests.post(
            f"{BASE}/ai/receipt-scan",
            json={"image_base64": ""},  # empty -> 400 "image_base64 is required"
            headers=headers,
            timeout=10,
        )
        statuses.append(rr.status_code)
    # All 30 should be 400 (since rate limit triggers AFTER the limiter passes,
    # and validation happens before any OpenAI call)
    bad_400 = sum(1 for s in statuses if s == 400)
    too_early_429 = sum(1 for s in statuses if s == 429)
    check(
        f"First 30 ai/receipt-scan calls return 400 (validation error, not 429)",
        bad_400 == 30 and too_early_429 == 0,
        f"got 400-count={bad_400}, 429-count={too_early_429}, statuses={statuses}",
    )
    r31 = requests.post(
        f"{BASE}/ai/receipt-scan",
        json={"image_base64": ""},
        headers=headers,
        timeout=10,
    )
    check(
        "31st ai/receipt-scan call returns 429",
        r31.status_code == 429,
        f"got {r31.status_code} body={r31.text[:200]}",
    )


def test_6_render_pdf_rate_limit():
    print("\n=== TEST 6: /api/render-pdf rate limit (20/hr per user) ===")
    restart_backend()
    r = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if r.status_code != 200:
        check("Login for render-pdf test", False, f"got {r.status_code}")
        return
    token = r.json().get("token")
    headers = {"Authorization": f"Bearer {token}"}
    body = {"html": "<p>test</p>", "filename": "test.pdf"}
    statuses = []
    for i in range(20):
        rr = requests.post(
            f"{BASE}/render-pdf", json=body, headers=headers, timeout=30
        )
        statuses.append(rr.status_code)
    check(
        "First 20 /render-pdf calls return 200 (PDF bytes)",
        all(s == 200 for s in statuses),
        f"statuses={statuses}",
    )
    r21 = requests.post(
        f"{BASE}/render-pdf", json=body, headers=headers, timeout=30
    )
    check(
        "21st /render-pdf call returns 429",
        r21.status_code == 429,
        f"got {r21.status_code} body={r21.text[:200]}",
    )


def test_7_reports_render_rate_limit():
    print("\n=== TEST 7: /api/reports/render rate limit (20/hr per user) ===")
    restart_backend()
    r = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if r.status_code != 200:
        check("Login for reports/render test", False, f"got {r.status_code}")
        return
    token = r.json().get("token")
    headers = {"Authorization": f"Bearer {token}"}
    body = {"report_type": "inventory", "format": "pdf", "options": {}}
    statuses = []
    first_payloads = []
    for i in range(20):
        rr = requests.post(
            f"{BASE}/reports/render", json=body, headers=headers, timeout=60
        )
        statuses.append(rr.status_code)
        if i < 2:
            first_payloads.append((rr.status_code, rr.text[:200]))
    check(
        "First 20 /reports/render calls return 200",
        all(s == 200 for s in statuses),
        f"statuses={statuses} first_two={first_payloads}",
    )
    r21 = requests.post(
        f"{BASE}/reports/render", json=body, headers=headers, timeout=60
    )
    check(
        "21st /reports/render call returns 429",
        r21.status_code == 429,
        f"got {r21.status_code} body={r21.text[:200]}",
    )


def test_8_revenuecat_webhook_not_rate_limited():
    print("\n=== TEST 8: RevenueCat webhook NOT rate-limited ===")
    restart_backend()
    headers = {"Authorization": RC_SECRET, "Content-Type": "application/json"}
    body = {
        "event": {
            "type": "TEST",
            "app_user_id": "rl_test_user_smoke_001",
            "environment": "SANDBOX",
        }
    }
    statuses = []
    for i in range(20):
        rr = requests.post(
            f"{BASE}/revenuecat/webhook",
            data=json.dumps(body),
            headers=headers,
            timeout=10,
        )
        statuses.append(rr.status_code)
    check(
        "20 consecutive /revenuecat/webhook POSTs all return 200 (no rate limit)",
        all(s == 200 for s in statuses),
        f"statuses={statuses}",
    )
    # Cleanup synthetic subscription doc
    try:
        from pymongo import MongoClient
        import os
        # Read MONGO_URL from backend/.env
        mongo_url = None
        with open("/app/backend/.env") as f:
            for line in f:
                if line.startswith("MONGO_URL="):
                    mongo_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
        if mongo_url:
            mc = MongoClient(mongo_url)
            # Find the DB name from URL or default
            db_name = None
            with open("/app/backend/.env") as f:
                for line in f:
                    if line.startswith("DB_NAME=") or line.startswith("MONGO_DB="):
                        db_name = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
            if db_name:
                mc[db_name].subscriptions.delete_many(
                    {"user_id": "rl_test_user_smoke_001"}
                )
    except Exception as e:
        print(f"  (cleanup non-critical) {e}")


def test_9_health_and_tools_not_rate_limited():
    print("\n=== TEST 9: /api/health and /api/tools NOT rate-limited ===")
    statuses_health = []
    for i in range(10):
        rr = requests.get(f"{BASE}/health", timeout=5)
        statuses_health.append(rr.status_code)
    check(
        "10 /health calls all return 200",
        all(s == 200 for s in statuses_health),
        f"statuses={statuses_health}",
    )

    r = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if r.status_code != 200:
        check("Login for /tools test", False, f"got {r.status_code}")
        return
    token = r.json().get("token")
    headers = {"Authorization": f"Bearer {token}"}
    statuses_tools = []
    for i in range(10):
        rr = requests.get(f"{BASE}/tools", headers=headers, timeout=10)
        statuses_tools.append(rr.status_code)
    check(
        "10 /tools calls all return 200",
        all(s == 200 for s in statuses_tools),
        f"statuses={statuses_tools}",
    )


def main():
    print(f"Testing against {BASE}")
    print(f"Admin: {ADMIN_EMAIL}")
    test_1_login_rate_limit()
    test_2_legitimate_login_after_restart()
    test_3_forgot_password_rate_limit()
    test_4_auth_me_not_rate_limited()
    test_5_ai_receipt_scan_rate_limit()
    test_6_render_pdf_rate_limit()
    test_7_reports_render_rate_limit()
    test_8_revenuecat_webhook_not_rate_limited()
    test_9_health_and_tools_not_rate_limited()

    # Final restart to clear buckets for any subsequent tests
    print("\n[final] Restarting backend to clear rate-limit buckets ...")
    restart_backend()

    print("\n" + "=" * 60)
    print(f"RESULT: {passes} pass, {fails} fail")
    if fail_msgs:
        print("\nFailures:")
        for m in fail_msgs:
            print(m)
    print("=" * 60)
    sys.exit(0 if fails == 0 else 1)


if __name__ == "__main__":
    main()
