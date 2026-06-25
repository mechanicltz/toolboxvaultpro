"""
End-to-end test for the password-reset endpoints.

Runs against the public preview URL (EXPO_PUBLIC_BACKEND_URL/api).
Needs MongoDB direct access to inject a known reset code, since we cannot
read the Gmail inbox.
"""
from __future__ import annotations

import os
import sys
import time
import asyncio
from typing import Any, Dict

import requests
import bcrypt
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# ---------- Config ----------
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("REACT_APP_BACKEND_URL")
    or "http://localhost:8001"
)
API = f"{BASE.rstrip('/')}/api"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

TEST_EMAIL = "pwreset_test@example.com"
ORIGINAL_PASSWORD = "originalpass123"
NEW_PASSWORD = "newpass123"
NAME = "Reset Tester"

PASSED = []
FAILED = []


def _log(step: str, ok: bool, detail: str = ""):
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {step}" + (f"  -- {detail}" if detail else ""))
    if ok:
        PASSED.append(step)
    else:
        FAILED.append(f"{step}: {detail}")


def _post(path: str, body: Dict[str, Any], token: str | None = None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.post(f"{API}{path}", json=body, headers=h, timeout=30)


def _get(path: str, token: str | None = None):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API}{path}", headers=h, timeout=30)


def _hash_code(code: str) -> str:
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(code.encode("utf-8"), salt).decode("utf-8")


async def _mongo():
    client = AsyncIOMotorClient(MONGO_URL)
    return client, client[DB_NAME]


async def cleanup_pre(db):
    """Make sure we start from a clean slate."""
    await db.users.delete_many({"email": TEST_EMAIL})
    await db.password_resets.delete_many({"email": TEST_EMAIL})


async def fetch_reset_doc(db):
    return await db.password_resets.find_one({"email": TEST_EMAIL}, {"_id": 0})


async def inject_code(db, code: str):
    ch = _hash_code(code)
    await db.password_resets.update_one(
        {"email": TEST_EMAIL},
        {"$set": {"code_hash": ch, "attempts": 0}},
    )


async def main():
    print(f"Base URL: {API}")
    print(f"Mongo   : {MONGO_URL}  DB={DB_NAME}")

    client, db = await _mongo()
    try:
        await cleanup_pre(db)

        # -------------------- 1) Register ---------------------
        r = _post(
            "/auth/register",
            {"email": TEST_EMAIL, "password": ORIGINAL_PASSWORD, "name": NAME},
        )
        ok = r.status_code == 200 and "token" in r.json()
        _log("1) POST /auth/register", ok, f"HTTP={r.status_code} body={r.text[:200]}")
        if not ok:
            return
        token = r.json().get("token")

        # -------------------- 2) Login with original password --
        r = _post("/auth/login", {"email": TEST_EMAIL, "password": ORIGINAL_PASSWORD})
        _log(
            "2) POST /auth/login (original password)",
            r.status_code == 200,
            f"HTTP={r.status_code}",
        )

        # -------------------- 3) Forgot password --------------
        r = _post("/auth/forgot-password", {"email": TEST_EMAIL})
        body = r.json() if r.ok else {}
        ok = (
            r.status_code == 200
            and body.get("ok") is True
            and isinstance(body.get("message"), str)
        )
        _log(
            "3) POST /auth/forgot-password",
            ok,
            f"HTTP={r.status_code} body={body}",
        )

        # -------------------- 4) Look up code in Mongo + inject
        # Allow fire-and-forget email to settle
        time.sleep(0.5)
        doc = await fetch_reset_doc(db)
        ok = doc is not None
        _log("4a) password_resets doc exists", ok, f"doc keys={list(doc.keys()) if doc else None}")
        if doc:
            ch = doc.get("code_hash", "")
            ok = isinstance(ch, str) and ch.startswith("$2")  # bcrypt $2a/$2b/$2y
            _log(
                "4b) code_hash is bcrypt", ok, f"prefix={ch[:4]!r}"
            )
            # expires_at ~15 min future
            try:
                from datetime import datetime, timezone, timedelta
                exp = datetime.fromisoformat(doc["expires_at"])
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                delta = exp - datetime.now(timezone.utc)
                ok = timedelta(minutes=10) < delta < timedelta(minutes=20)
                _log(
                    "4c) expires_at ~15 min in future",
                    ok,
                    f"delta={delta}",
                )
            except Exception as e:
                _log("4c) expires_at parse", False, f"err={e}")
            _log(
                "4d) attempts == 0",
                doc.get("attempts", None) == 0,
                f"attempts={doc.get('attempts')}",
            )

        await inject_code(db, "123456")
        doc2 = await fetch_reset_doc(db)
        injected = doc2 and doc2.get("code_hash", "").startswith("$2") and doc2.get("attempts") == 0
        _log("4e) inject known code 123456", bool(injected))

        # -------------------- 5) Wrong code -------------------
        r = _post(
            "/auth/reset-password",
            {"email": TEST_EMAIL, "code": "000000", "new_password": NEW_PASSWORD},
        )
        ok = r.status_code == 400 and "Invalid" in r.text
        _log(
            "5a) wrong code -> 400",
            ok,
            f"HTTP={r.status_code} body={r.text[:200]}",
        )
        doc3 = await fetch_reset_doc(db)
        _log(
            "5b) attempts incremented to 1",
            doc3 and doc3.get("attempts") == 1,
            f"attempts={doc3.get('attempts') if doc3 else None}",
        )

        # -------------------- 6) Correct code -----------------
        r = _post(
            "/auth/reset-password",
            {"email": TEST_EMAIL, "code": "123456", "new_password": NEW_PASSWORD},
        )
        ok = r.status_code == 200
        body = r.json() if r.ok else {}
        ok = ok and "token" in body and "user" in body
        _log(
            "6) correct code -> 200 {token,user}",
            ok,
            f"HTTP={r.status_code} body_keys={list(body.keys())}",
        )

        # -------------------- 7) Reset record deleted --------
        doc4 = await fetch_reset_doc(db)
        _log("7) password_resets doc deleted", doc4 is None, f"doc={doc4}")

        # -------------------- 8) Old password rejected -------
        r = _post("/auth/login", {"email": TEST_EMAIL, "password": ORIGINAL_PASSWORD})
        _log(
            "8) old password rejected -> 401",
            r.status_code == 401,
            f"HTTP={r.status_code}",
        )

        # -------------------- 9) New password works ----------
        r = _post("/auth/login", {"email": TEST_EMAIL, "password": NEW_PASSWORD})
        ok = r.status_code == 200 and "token" in r.json()
        _log(
            "9) new password works -> 200",
            ok,
            f"HTTP={r.status_code}",
        )

        # -------------------- 10) Rate limit — 6 wrong codes --
        r = _post("/auth/forgot-password", {"email": TEST_EMAIL})
        time.sleep(0.3)
        # inject known code again
        await inject_code(db, "123456")

        rl_status = []
        for i in range(6):
            r = _post(
                "/auth/reset-password",
                {"email": TEST_EMAIL, "code": "999999", "new_password": "anothernewpass1"},
            )
            rl_status.append(r.status_code)

        # First 5 should be 400, the 6th should be 429 (either the 6th call itself OR
        # the 6th returns 429 because attempts>=5 guard fires BEFORE the checkpw call).
        # Implementation in server.py: on the 6th call the guard "if attempts >= 5"
        # returns 429 AND deletes the record. After that subsequent calls return 400
        # "Invalid or expired code." because the doc is gone.
        ok_first5 = all(s == 400 for s in rl_status[:5])
        saw_429 = 429 in rl_status
        _log(
            "10a) first 5 wrong-code calls -> 400",
            ok_first5,
            f"statuses={rl_status[:5]}",
        )
        _log(
            "10b) 6th call triggers 429",
            saw_429 and rl_status[5] == 429,
            f"statuses={rl_status}",
        )

        # -------------------- 11) Email enumeration -----------
        r = _post(
            "/auth/forgot-password",
            {"email": "does-not-exist-asdfqwer@example.com"},
        )
        body = r.json() if r.ok else {}
        ok = (
            r.status_code == 200
            and body.get("ok") is True
            and "registered" in (body.get("message") or "").lower()
        )
        _log(
            "11) forgot-password for unknown email returns generic 200",
            ok,
            f"HTTP={r.status_code} body={body}",
        )

        # -------------------- 12) Short password --------------
        # Need a fresh reset token first because rate limiting burned the last one.
        _post("/auth/forgot-password", {"email": TEST_EMAIL})
        time.sleep(0.3)
        await inject_code(db, "123456")
        r = _post(
            "/auth/reset-password",
            {"email": TEST_EMAIL, "code": "123456", "new_password": "abc"},
        )
        ok = r.status_code == 400 and "6" in r.text
        _log(
            "12) short password rejected -> 400",
            ok,
            f"HTTP={r.status_code} body={r.text[:200]}",
        )

        # -------------------- SMOKE: subtest still works ------
        r = _post(
            "/auth/login",
            {"email": "subtest@example.com", "password": "password123"},
        )
        ok = r.status_code == 200 and "token" in r.json()
        _log(
            "S1) subtest login still works",
            ok,
            f"HTTP={r.status_code}",
        )
        sub_token = r.json().get("token") if ok else None

        if sub_token:
            r = _get("/tools", token=sub_token)
            _log(
                "S2) GET /tools with subtest token",
                r.status_code == 200 and isinstance(r.json(), list),
                f"HTTP={r.status_code}",
            )
            r = _get("/stats", token=sub_token)
            _log(
                "S3) GET /stats with subtest token",
                r.status_code == 200,
                f"HTTP={r.status_code}",
            )

    finally:
        # -------------------- 13) Cleanup ----------------------
        try:
            res1 = await db.users.delete_many({"email": TEST_EMAIL})
            res2 = await db.password_resets.delete_many({"email": TEST_EMAIL})
            _log(
                "13) cleanup test user + reset docs",
                True,
                f"deleted users={res1.deleted_count} resets={res2.deleted_count}",
            )
        except Exception as e:
            _log("13) cleanup", False, f"err={e}")
        client.close()

    print()
    print(f"PASSED: {len(PASSED)}")
    print(f"FAILED: {len(FAILED)}")
    for f in FAILED:
        print(f"  - {f}")
    return 0 if not FAILED else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
