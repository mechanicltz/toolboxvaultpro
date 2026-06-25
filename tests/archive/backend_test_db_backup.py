"""Backend test for the Database Backup admin module (audit #17).

Tests against http://localhost:8001/api per review request.
"""
import base64
import gzip
import io
import json
import os
import re
import sys
import time
from typing import Any, Dict, List, Tuple

import requests

BASE = "http://localhost:8001/api"
ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASS = "Blue321!"
import uuid as _uuid
NONADMIN_EMAIL = f"backupnonadmin_{_uuid.uuid4().hex[:8]}@example.com"
NONADMIN_PASS = "Pass1234!"

PASS = []
FAIL = []


def check(label: str, cond: bool, detail: str = "") -> None:
    if cond:
        PASS.append(label)
        print(f"  PASS  {label}")
    else:
        FAIL.append(f"{label} :: {detail}")
        print(f"  FAIL  {label} :: {detail}")


def login(email: str, password: str) -> str:
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        raise RuntimeError(f"login failed for {email}: {r.status_code} {r.text}")
    return r.json().get("token") or r.json().get("access_token")


def register_and_login(email: str, password: str) -> str:
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": password, "name": "Backup NonAdmin"}, timeout=15)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"register failed for {email}: {r.status_code} {r.text}")
    return login(email, password)


def H(tok: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {tok}"}


def test_boot_log() -> None:
    print("\n[1] Boot log check")
    try:
        with open("/var/log/supervisor/backend.err.log") as f:
            data = f.read()
        has = "Backup scheduler started (monthly, 1st @ 03:00 UTC, keep last 12)" in data
        check("backend log shows 'Backup scheduler started ...'", has, "log line missing")
    except Exception as e:
        check("backend log readable", False, str(e))


def test_nonadmin_403(tok: str) -> None:
    print("\n[2] Non-admin gets 403 on every endpoint")
    h = H(tok)
    r = requests.get(f"{BASE}/admin/backups", headers=h, timeout=15)
    check("GET /admin/backups -> 403 (non-admin)", r.status_code == 403, f"got {r.status_code} {r.text[:200]}")
    r = requests.post(f"{BASE}/admin/backups/run", headers=h, timeout=30)
    check("POST /admin/backups/run -> 403 (non-admin)", r.status_code == 403, f"got {r.status_code} {r.text[:200]}")
    r = requests.get(f"{BASE}/admin/backups/config", headers=h, timeout=15)
    check("GET /admin/backups/config -> 403 (non-admin)", r.status_code == 403, f"got {r.status_code} {r.text[:200]}")
    r = requests.get(f"{BASE}/admin/backups/anything/download", headers=h, timeout=15)
    check("GET /admin/backups/anything/download -> 403 (non-admin)", r.status_code == 403, f"got {r.status_code} {r.text[:200]}")
    r = requests.delete(f"{BASE}/admin/backups/anything", headers=h, timeout=15)
    check("DELETE /admin/backups/anything -> 403 (non-admin)", r.status_code == 403, f"got {r.status_code} {r.text[:200]}")


def test_admin_happy(tok: str) -> str:
    print("\n[3] Admin auth happy path")
    h = H(tok)
    # config
    r = requests.get(f"{BASE}/admin/backups/config", headers=h, timeout=15)
    check("GET /admin/backups/config -> 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    cfg = r.json() if r.status_code == 200 else {}
    expected_fields = ["schedule", "schedule_human", "next_run_at", "next_run_in_seconds", "max_retained", "collections_backed_up"]
    missing = [f for f in expected_fields if f not in cfg]
    check("config has all required fields", not missing, f"missing: {missing}")
    check("config.max_retained == 12", cfg.get("max_retained") == 12, f"got {cfg.get('max_retained')}")
    cbu = cfg.get("collections_backed_up") or []
    check("config.collections_backed_up has 16 collections", isinstance(cbu, list) and len(cbu) == 16, f"got {len(cbu) if isinstance(cbu, list) else 'non-list'}")
    check("config.schedule == 'monthly'", cfg.get("schedule") == "monthly", f"got {cfg.get('schedule')}")

    # list empty
    r = requests.get(f"{BASE}/admin/backups", headers=h, timeout=15)
    check("GET /admin/backups -> 200 (initial)", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    initial = r.json() if r.status_code == 200 else None
    check("GET /admin/backups initial list is []", initial == [], f"got {initial}")

    # run
    r = requests.post(f"{BASE}/admin/backups/run", headers=h, timeout=60)
    check("POST /admin/backups/run -> 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    created = r.json() if r.status_code == 200 else {}
    for f in ["id", "created_at", "size_bytes", "size_human", "trigger", "collections", "document_count"]:
        check(f"create response has '{f}'", f in created, f"keys={list(created.keys())}")
    check("created.trigger == 'manual'", created.get("trigger") == "manual", f"got {created.get('trigger')}")
    check("created.size_bytes > 0", isinstance(created.get("size_bytes"), int) and created.get("size_bytes", 0) > 0, f"got {created.get('size_bytes')}")
    backup_id = created.get("id")

    # list shows 1
    r = requests.get(f"{BASE}/admin/backups", headers=h, timeout=15)
    check("GET /admin/backups -> 200 (after run)", r.status_code == 200, f"got {r.status_code}")
    lst = r.json() if r.status_code == 200 else []
    check("list has exactly 1 entry", len(lst) == 1, f"got {len(lst)}")
    check("list[0].id matches created.id", len(lst) >= 1 and lst[0].get("id") == backup_id, f"got {lst[0] if lst else None}")

    return backup_id


def test_download(tok: str, backup_id: str) -> None:
    print("\n[4] Download integrity test")
    h = H(tok)
    r = requests.get(f"{BASE}/admin/backups/{backup_id}/download", headers=h, timeout=60)
    check("GET /admin/backups/{id}/download -> 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    ct = r.headers.get("Content-Type", "")
    check("Content-Type == application/gzip", ct.startswith("application/gzip"), f"got '{ct}'")
    cd = r.headers.get("Content-Disposition", "")
    fn_re = re.compile(r'attachment;\s*filename="toolbox-vault-backup-.*\.json\.gz"')
    check("Content-Disposition matches attachment; filename=\"toolbox-vault-backup-*.json.gz\"", bool(fn_re.search(cd)), f"got '{cd}'")

    # decompress + parse
    try:
        decompressed = gzip.decompress(r.content)
        parsed = json.loads(decompressed.decode("utf-8"))
        check("download body decompresses + parses as JSON", isinstance(parsed, dict), f"top-level type={type(parsed).__name__}")
        for key in ["users", "tools", "locations", "dealers", "subscriptions"]:
            check(f"parsed JSON has key '{key}'", key in parsed, f"keys={list(parsed.keys())[:20]}")
    except Exception as e:
        check("download body decompresses + parses cleanly", False, str(e))


def test_delete(tok: str, backup_id: str) -> None:
    print("\n[5] Delete works")
    h = H(tok)
    r = requests.delete(f"{BASE}/admin/backups/{backup_id}", headers=h, timeout=15)
    check("DELETE /admin/backups/{id} -> 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    check("delete response ok==true", body.get("ok") is True, f"got {body}")
    check("delete response deleted_id matches", body.get("deleted_id") == backup_id, f"got {body}")

    r = requests.get(f"{BASE}/admin/backups", headers=h, timeout=15)
    check("GET /admin/backups -> 200 (after delete)", r.status_code == 200, f"got {r.status_code}")
    check("GET /admin/backups list is [] after delete", r.json() == [], f"got {r.text[:200]}")

    r = requests.delete(f"{BASE}/admin/backups/{backup_id}", headers=h, timeout=15)
    check("DELETE same id again -> 404", r.status_code == 404, f"got {r.status_code} {r.text[:200]}")


def test_retention(tok: str) -> List[str]:
    print("\n[6] Retention test (lightweight)")
    h = H(tok)
    ids = []
    timestamps = []
    for i in range(3):
        r = requests.post(f"{BASE}/admin/backups/run", headers=h, timeout=60)
        check(f"POST /admin/backups/run #{i+1} -> 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
        if r.status_code == 200:
            j = r.json()
            ids.append(j.get("id"))
            timestamps.append(j.get("created_at"))
        # tiny sleep to ensure timestamps differ (ISO with microseconds, but just to be safe)
        time.sleep(0.05)

    r = requests.get(f"{BASE}/admin/backups", headers=h, timeout=15)
    check("GET /admin/backups after 3 runs -> 200", r.status_code == 200, f"got {r.status_code}")
    lst = r.json() if r.status_code == 200 else []
    check("list has 3 entries", len(lst) == 3, f"got {len(lst)}")
    unique_ids = set(b.get("id") for b in lst)
    check("all 3 have unique IDs", len(unique_ids) == 3, f"got {unique_ids}")
    # list comes back newest-first per impl; verify monotonic decreasing
    ca = [b.get("created_at") for b in lst]
    check("created_at roughly chronological (newest first)", ca == sorted(ca, reverse=True), f"got {ca}")
    return ids


def test_existing_endpoints(admin_tok: str) -> None:
    print("\n[7] Existing endpoints still healthy")
    h = H(admin_tok)
    r = requests.get(f"{BASE}/health", timeout=15)
    check("GET /health -> 200", r.status_code == 200, f"got {r.status_code}")
    r = requests.get(f"{BASE}/admin/user-stats", headers=h, timeout=15)
    check("GET /admin/user-stats with admin JWT -> 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    r = requests.get(f"{BASE}/admin/promo-codes", headers=h, timeout=15)
    check("GET /admin/promo-codes with admin JWT -> 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    # webhook with correct auth header
    secret = "wh_secret_X9k2mP7nQ4vR8tL3cF6aB1jH5wE0sD2y"
    body = {"event": {"type": "TEST", "app_user_id": "backup_test_smoke", "environment": "SANDBOX"}}
    r = requests.post(f"{BASE}/revenuecat/webhook", headers={"Authorization": secret}, json=body, timeout=15)
    check("POST /revenuecat/webhook with correct auth -> 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")


def cleanup(admin_tok: str, ids: List[str]) -> None:
    print("\n[CLEANUP] removing test backup rows")
    h = H(admin_tok)
    # Delete known ids
    for bid in ids:
        if not bid:
            continue
        requests.delete(f"{BASE}/admin/backups/{bid}", headers=h, timeout=15)
    # Final sweep: list any remaining and delete
    r = requests.get(f"{BASE}/admin/backups", headers=h, timeout=15)
    if r.status_code == 200:
        for b in r.json():
            requests.delete(f"{BASE}/admin/backups/{b.get('id')}", headers=h, timeout=15)
    r = requests.get(f"{BASE}/admin/backups", headers=h, timeout=15)
    leftover = r.json() if r.status_code == 200 else "?"
    print(f"  Final backups list: {leftover}")
    # Cleanup the synthetic RevenueCat smoke subscription too
    try:
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        async def _clean():
            c = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
            db = c[os.environ.get("DB_NAME", "toolbox_vault")]
            await db.subscriptions.delete_many({"user_id": "backup_test_smoke"})
        asyncio.run(_clean())
    except Exception as e:
        print(f"  (note: could not clean RC smoke subscription: {e})")


def main() -> int:
    # Load env vars from backend/.env
    try:
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
    except Exception:
        pass

    test_boot_log()
    nonadmin_tok = register_and_login(NONADMIN_EMAIL, NONADMIN_PASS)
    admin_tok = login(ADMIN_EMAIL, ADMIN_PASS)

    test_nonadmin_403(nonadmin_tok)
    backup_id = test_admin_happy(admin_tok)
    test_download(admin_tok, backup_id)
    test_delete(admin_tok, backup_id)
    retention_ids = test_retention(admin_tok)
    test_existing_endpoints(admin_tok)
    cleanup(admin_tok, retention_ids + [backup_id])

    print("\n" + "=" * 60)
    print(f"PASS: {len(PASS)}    FAIL: {len(FAIL)}")
    if FAIL:
        print("\nFailures:")
        for f in FAIL:
            print(f"  - {f}")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
