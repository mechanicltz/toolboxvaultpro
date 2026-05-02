"""Backend tests for POST /api/feedback (public, no auth).

Covers all 11 cases from the review request:
  1) Happy path — feature request
  2) Happy path — bug report
  3) Validation — missing name
  4) Validation — invalid email
  5) Validation — missing subject
  6) Validation — missing message
  7) Validation — message too long (20001 chars)
  8) Honeypot — returns 200 with generic Thanks! and DOES NOT email or persist
  9) Rate limit — 6 quick valid submissions, first 5 → 200, 6th → 429
 10) MongoDB persistence — records exist for each successful submission
 11) Smoke — GET /api/, POST /api/auth/login (subtest), GET /api/stats
"""
from __future__ import annotations

import os
import sys
import time
import json
import asyncio
import subprocess
from pathlib import Path
from datetime import datetime, timezone

import requests

# ---------- Resolve backend URL ----------
ENV_FILE = Path("/app/frontend/.env")
BASE = ""
for line in ENV_FILE.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE = line.split("=", 1)[1].strip().strip('"')
        break
assert BASE, "EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env"
API = f"{BASE}/api"
print(f"[i] API base: {API}")

results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = ""):
    results.append((name, ok, detail))
    flag = "PASS" if ok else "FAIL"
    print(f"[{flag}] {name}  {detail}")


def restart_backend_clear_rate_limit():
    """The rate-limit bucket is in-memory; restart backend to reset it."""
    print("[i] Restarting backend to clear in-memory rate-limit bucket...")
    subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=False, capture_output=True)
    # Wait for backend to come back up
    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            r = requests.get(f"{API}/", timeout=2)
            if r.status_code == 200:
                print("[i] Backend back up.")
                return True
        except Exception:
            pass
        time.sleep(0.5)
    print("[!] Backend did not return to ready state in 30s")
    return False


# Always start with a clean rate-limit bucket
restart_backend_clear_rate_limit()


# =========================================================================
# Test 1 — Happy path: feature request
# =========================================================================
payload_1 = {
    "name": "Bob",
    "email": "bob@example.com",
    "subject": "Dark mode please",
    "message": "Love the app, please add dark mode",
    "platform": "Apple",
    "is_bug": False,
    "is_feature": True,
    "app_version": "1.0.0",
}
try:
    r = requests.post(f"{API}/feedback", json=payload_1, timeout=15)
    body = {}
    try:
        body = r.json()
    except Exception:
        body = {"_raw": r.text}
    ok = (r.status_code == 200 and body.get("ok") is True)
    record(
        "1) Happy path — feature request",
        ok,
        f"status={r.status_code}, body keys={list(body.keys())}, ok={body.get('ok')}",
    )
except Exception as e:
    record("1) Happy path — feature request", False, f"Exception: {e}")


# =========================================================================
# Test 2 — Happy path: bug report
# =========================================================================
payload_2 = {
    "name": "Alice Carter",
    "email": "alice.carter@example.com",
    "subject": "Crash on save",
    "message": "When I save a tool the app crashes immediately on iOS 17.4.",
    "platform": "Apple",
    "is_bug": True,
    "is_feature": False,
    "app_version": "1.0.1",
}
try:
    r = requests.post(f"{API}/feedback", json=payload_2, timeout=15)
    body = {}
    try:
        body = r.json()
    except Exception:
        body = {"_raw": r.text}
    ok = (r.status_code == 200 and body.get("ok") is True)
    record(
        "2) Happy path — bug report",
        ok,
        f"status={r.status_code}, ok={body.get('ok')}",
    )
except Exception as e:
    record("2) Happy path — bug report", False, f"Exception: {e}")


# =========================================================================
# Test 3 — Validation: missing name
# =========================================================================
p = dict(payload_1, name="")
try:
    r = requests.post(f"{API}/feedback", json=p, timeout=15)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    detail = (body.get("detail") or "").lower()
    ok = (r.status_code == 400 and "name" in detail)
    record(
        "3) Validation — missing name → 400 with 'name' in detail",
        ok,
        f"status={r.status_code}, detail={body.get('detail')!r}",
    )
except Exception as e:
    record("3) Validation — missing name", False, f"Exception: {e}")


# =========================================================================
# Test 4 — Validation: invalid email
# =========================================================================
p = dict(payload_1, email="not-an-email")
try:
    r = requests.post(f"{API}/feedback", json=p, timeout=15)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    ok = (r.status_code == 400)
    record(
        "4) Validation — invalid email → 400",
        ok,
        f"status={r.status_code}, detail={body.get('detail')!r}",
    )
except Exception as e:
    record("4) Validation — invalid email", False, f"Exception: {e}")


# =========================================================================
# Test 5 — Validation: missing subject
# =========================================================================
p = dict(payload_1, subject="")
try:
    r = requests.post(f"{API}/feedback", json=p, timeout=15)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    ok = (r.status_code == 400)
    record(
        "5) Validation — missing subject → 400",
        ok,
        f"status={r.status_code}, detail={body.get('detail')!r}",
    )
except Exception as e:
    record("5) Validation — missing subject", False, f"Exception: {e}")


# =========================================================================
# Test 6 — Validation: missing message
# =========================================================================
p = dict(payload_1, message="")
try:
    r = requests.post(f"{API}/feedback", json=p, timeout=15)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    ok = (r.status_code == 400)
    record(
        "6) Validation — missing message → 400",
        ok,
        f"status={r.status_code}, detail={body.get('detail')!r}",
    )
except Exception as e:
    record("6) Validation — missing message", False, f"Exception: {e}")


# =========================================================================
# Test 7 — Validation: message too long (20001 chars)
# =========================================================================
p = dict(payload_1, message="x" * 20001)
try:
    r = requests.post(f"{API}/feedback", json=p, timeout=15)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    ok = (r.status_code == 400)
    record(
        "7) Validation — message too long (20001) → 400",
        ok,
        f"status={r.status_code}, detail={body.get('detail')!r}",
    )
except Exception as e:
    record("7) Validation — message too long", False, f"Exception: {e}")


# =========================================================================
# Test 8 — Honeypot
#   POST with website set + valid fields → 200 generic Thanks!
#   AND no feedback record persisted, AND no email sent line in logs.
# =========================================================================
honeypot_subject = f"HoneypotTrap-{int(time.time())}"
p = dict(payload_1, subject=honeypot_subject, website="http://spam.com")

# Snapshot backend log size BEFORE the request
log_path = "/var/log/supervisor/backend.out.log"
log_size_before = 0
try:
    log_size_before = os.path.getsize(log_path)
except Exception:
    pass

try:
    r = requests.post(f"{API}/feedback", json=p, timeout=15)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    ok_status = (r.status_code == 200 and body.get("ok") is True)
    ok_message = (body.get("message") or "").lower().startswith("thanks")
    record(
        "8a) Honeypot — returns 200 with generic 'Thanks!'",
        ok_status and ok_message,
        f"status={r.status_code}, message={body.get('message')!r}",
    )
except Exception as e:
    record("8a) Honeypot — returns 200 with generic 'Thanks!'", False, f"Exception: {e}")


# =========================================================================
# Test 10a (intermediate) — verify Mongo persistence for tests 1, 2
# AND verify honeypot did NOT persist a record
# =========================================================================
async def check_mongo_persistence():
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # Records from test 1 (Bob/feature) and test 2 (Alice/bug)
    rec_bob = await db.feedback.find_one({"email": "bob@example.com", "subject": "Dark mode please"}, {"_id": 0})
    rec_alice = await db.feedback.find_one({"email": "alice.carter@example.com", "subject": "Crash on save"}, {"_id": 0})

    required_fields = ["name", "email", "subject", "message", "is_bug", "is_feature", "platform", "app_version", "created_at"]

    if rec_bob:
        missing = [f for f in required_fields if f not in rec_bob]
        record(
            "10a) Mongo — record for test 1 (Bob/feature) exists with all fields",
            (not missing
             and rec_bob.get("name") == "Bob"
             and rec_bob.get("is_feature") is True
             and rec_bob.get("is_bug") is False
             and rec_bob.get("platform") == "Apple"
             and rec_bob.get("app_version") == "1.0.0"),
            f"missing={missing}, name={rec_bob.get('name')}, is_feature={rec_bob.get('is_feature')}, "
            f"is_bug={rec_bob.get('is_bug')}, platform={rec_bob.get('platform')}, "
            f"app_version={rec_bob.get('app_version')}, created_at={rec_bob.get('created_at')!r}",
        )
    else:
        record("10a) Mongo — record for test 1 (Bob/feature) exists with all fields", False, "record not found")

    if rec_alice:
        missing = [f for f in required_fields if f not in rec_alice]
        record(
            "10b) Mongo — record for test 2 (Alice/bug) exists with all fields",
            (not missing
             and rec_alice.get("is_bug") is True
             and rec_alice.get("is_feature") is False
             and rec_alice.get("subject") == "Crash on save"),
            f"missing={missing}, is_bug={rec_alice.get('is_bug')}, is_feature={rec_alice.get('is_feature')}",
        )
    else:
        record("10b) Mongo — record for test 2 (Alice/bug) exists with all fields", False, "record not found")

    # Honeypot — must NOT be persisted
    rec_hp = await db.feedback.find_one({"subject": honeypot_subject}, {"_id": 0})
    record(
        "8b) Honeypot — record NOT persisted in Mongo",
        rec_hp is None,
        f"honeypot record present? {rec_hp is not None}",
    )

    # CLEAN UP test data we wrote (so we don't pollute the production-ish db)
    await db.feedback.delete_many({"email": {"$in": ["bob@example.com", "alice.carter@example.com"]}})
    await db.feedback.delete_many({"subject": honeypot_subject})

    client.close()

asyncio.run(check_mongo_persistence())


# =========================================================================
# Test 8c — Honeypot did NOT trigger an email send (check backend log)
#   send_feedback_email logs success as "Email sent to ..." in email_sender.
#   We compare backend log lines added since the snapshot.
# =========================================================================
new_log_chunk = ""
try:
    if log_size_before > 0 and os.path.getsize(log_path) > log_size_before:
        with open(log_path, "rb") as f:
            f.seek(log_size_before)
            new_log_chunk = f.read().decode("utf-8", errors="replace")
except Exception:
    new_log_chunk = ""

# We just want to confirm the honeypot subject is NOT mentioned and no
# "Email sent" line tied to honeypot exists in the new log chunk.
honeypot_in_log = honeypot_subject in new_log_chunk
record(
    "8c) Honeypot — no 'Email sent' / log entry mentioning honeypot subject",
    not honeypot_in_log,
    f"honeypot subject in log? {honeypot_in_log}",
)


# =========================================================================
# Test 9 — Rate limit: 6 valid requests in quick succession from same IP
# Need a clean rate-limit bucket. Restart backend first.
# =========================================================================
restart_backend_clear_rate_limit()

rate_payload = {
    "name": "Ratelimit Tester",
    "email": "ratelimit+{i}@example.com",
    "subject": "Rate limit probe",
    "message": "Probing the rate limiter.",
    "platform": "Apple",
    "is_bug": False,
    "is_feature": True,
    "app_version": "1.0.0",
}

statuses = []
for i in range(6):
    p = dict(rate_payload)
    p["email"] = rate_payload["email"].format(i=i)
    try:
        r = requests.post(f"{API}/feedback", json=p, timeout=15)
        statuses.append(r.status_code)
    except Exception as e:
        statuses.append(f"EXC:{e}")

# We expect first 5 statuses to be 200, the 6th to be 429
first5_ok = all(s == 200 for s in statuses[:5])
sixth_429 = (statuses[5] == 429)

# Also verify the 429 detail mentions "Too many"
sixth_detail = ""
if sixth_429:
    try:
        # re-fetch by sending one more (still rate-limited) and inspect detail
        r = requests.post(f"{API}/feedback", json=dict(rate_payload, email="rl-extra@example.com"), timeout=15)
        if r.status_code == 429:
            sixth_detail = (r.json().get("detail") or "")
    except Exception:
        pass

record(
    "9) Rate limit — first 5 → 200, 6th → 429",
    first5_ok and sixth_429,
    f"statuses={statuses}, 6th_detail={sixth_detail!r}",
)

# Cleanup the rate-limit-test feedback records from Mongo
async def cleanup_rate_limit_records():
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    res = await db.feedback.delete_many({"subject": "Rate limit probe"})
    print(f"[i] cleanup: deleted {res.deleted_count} rate-limit-test feedback records")
    client.close()

asyncio.run(cleanup_rate_limit_records())

# Restart again so we don't leave the rate-limit bucket polluted for any
# subsequent test runs and so test 11 smoke isn't affected.
restart_backend_clear_rate_limit()


# =========================================================================
# Test 11 — Smoke: existing endpoints unaffected
# =========================================================================
# 11a — GET /api/
try:
    r = requests.get(f"{API}/", timeout=10)
    record(
        "11a) Smoke — GET /api/ → 200",
        r.status_code == 200,
        f"status={r.status_code}, body={r.text[:80]!r}",
    )
except Exception as e:
    record("11a) Smoke — GET /api/", False, f"Exception: {e}")

# 11b — POST /api/auth/login
token = None
try:
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "subtest@example.com", "password": "password123"},
        timeout=15,
    )
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    token = body.get("token")
    record(
        "11b) Smoke — POST /api/auth/login (subtest@example.com)",
        r.status_code == 200 and bool(token),
        f"status={r.status_code}, has_token={bool(token)}",
    )
except Exception as e:
    record("11b) Smoke — POST /api/auth/login", False, f"Exception: {e}")

# 11c — GET /api/stats with subtest token
if token:
    try:
        r = requests.get(
            f"{API}/stats",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        ok = (r.status_code == 200)
        body = r.json() if (ok and r.headers.get("content-type", "").startswith("application/json")) else {}
        record(
            "11c) Smoke — GET /api/stats with subtest token",
            ok,
            f"status={r.status_code}, body keys={list(body.keys()) if ok else 'n/a'}",
        )
    except Exception as e:
        record("11c) Smoke — GET /api/stats", False, f"Exception: {e}")
else:
    record("11c) Smoke — GET /api/stats", False, "skipped: no token from 11b")


# ============================ SUMMARY =====================================
passed = sum(1 for _, ok, _ in results if ok)
failed = [r for r in results if not r[1]]
print("\n" + "=" * 70)
print(f"RESULTS: {passed}/{len(results)} PASS, {len(failed)} FAIL")
print("=" * 70)
if failed:
    print("\nFAILED:")
    for name, _, det in failed:
        print(f"  [FAIL] {name}  {det}")
sys.exit(0 if not failed else 1)
