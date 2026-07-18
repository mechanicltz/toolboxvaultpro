"""Iter88 — verify the 5 backend fixes:

  1. GET /api/admin/backups/config -> schedule_human = 'Every day at 03:00 (US Central time)'
  2. POST /api/admin/backups/full-snapshot returns fast (status=started or running)
     Then poll GET /api/admin/backups/full-snapshot/status until done/error.
  3. GET /api/admin/backups returns the list quickly (newest first).
  4. GET /api/admin/dashboard-stats returns 200 with integer stat fields.
  5. Backend started cleanly, scheduler-idempotency is unit-verified elsewhere;
     we regression-check that /api/admin/backups still works.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASSWORD = "Blue321!"

FULL_SNAPSHOT_POLL_TIMEOUT = 240  # sec — build+selfcheck; no drive upload
FULL_SNAPSHOT_POLL_INTERVAL = 3


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, f"No token: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- 1. Backup config ----------
class TestBackupsConfig:
    def test_config_returns_schedule_human_us_central(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/backups/config", headers=admin_headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        body = r.json()
        assert "schedule_human" in body, f"Missing schedule_human: {body}"
        assert body["schedule_human"] == "Every day at 03:00 (US Central time)", (
            f"Wrong schedule_human: {body['schedule_human']}"
        )

    def test_config_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/backups/config", timeout=20)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"


# ---------- 2. Full-snapshot background job ----------
class TestFullSnapshotBackground:
    def test_full_snapshot_starts_fast_and_completes_via_polling(self, admin_headers):
        """POST must return quickly (status=started or running) — no timeout.
        Then poll status endpoint until done/error. In dev Drive is not
        connected; the local ZIP should still build successfully."""
        t0 = time.time()
        r = requests.post(
            f"{BASE_URL}/api/admin/backups/full-snapshot",
            headers=admin_headers,
            timeout=30,  # DELIBERATELY tight — the endpoint MUST return quickly.
        )
        elapsed = time.time() - t0
        assert r.status_code == 200, f"POST full-snapshot failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("status") in ("started", "running"), (
            f"Expected status started/running, got: {body}"
        )
        assert elapsed < 15, (
            f"POST took too long ({elapsed:.1f}s) — should be near-instant. Body: {body}"
        )
        print(f"POST /full-snapshot returned in {elapsed:.2f}s with status={body.get('status')}")

        # Poll the status endpoint
        deadline = time.time() + FULL_SNAPSHOT_POLL_TIMEOUT
        final: dict = {}
        while time.time() < deadline:
            time.sleep(FULL_SNAPSHOT_POLL_INTERVAL)
            sr = requests.get(
                f"{BASE_URL}/api/admin/backups/full-snapshot/status",
                headers=admin_headers,
                timeout=20,
            )
            assert sr.status_code == 200, f"Status poll failed: {sr.status_code} {sr.text}"
            sbody = sr.json()
            status = sbody.get("status")
            print(f"  poll status={status}")
            if status in ("done", "error"):
                final = sbody
                break
        else:
            pytest.fail(f"Full-snapshot job did not finish within {FULL_SNAPSHOT_POLL_TIMEOUT}s")

        assert final.get("status") == "done", (
            f"Expected status=done, got: {final}"
        )
        result = final.get("result") or {}
        # The KEY assertion — self-check should pass, meaning ZIP built successfully.
        # (Whether Drive is connected can vary — the fix under test is that the
        # POST returns fast and the job completes without a request timeout.)
        assert result.get("selfcheck_ok") is True, (
            f"Expected selfcheck_ok=True, got: {result}"
        )
        # gdrive_uploaded may be False (dev, Drive disconnected) OR True (Drive
        # reconnected in-env). Both are acceptable — the fix is about the flow.
        assert result.get("gdrive_uploaded") in (True, False), (
            f"gdrive_uploaded must be bool: {result}"
        )
        if result.get("gdrive_uploaded") is False:
            assert result.get("gdrive_error") in (
                "auth_expired", "not_connected", "upload_failed", None,
            ), f"Unexpected gdrive_error: {result.get('gdrive_error')}"
        # Filename ends with 'FULL SNAPSHOT.zip'
        fn = result.get("filename") or ""
        assert fn.endswith("FULL SNAPSHOT.zip"), f"filename: {fn}"

    def test_full_snapshot_status_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/backups/full-snapshot/status", timeout=20)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"


# ---------- 3. Backups list ----------
class TestBackupsList:
    def test_list_returns_quickly_newest_first(self, admin_headers):
        t0 = time.time()
        r = requests.get(f"{BASE_URL}/api/admin/backups", headers=admin_headers, timeout=20)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        assert elapsed < 10, f"GET /admin/backups too slow: {elapsed:.1f}s"
        body = r.json()
        # Endpoint may return a bare list OR a dict wrapping a list.
        if isinstance(body, dict):
            backups = body.get("backups") or body.get("items") or body.get("files") or []
        else:
            backups = body
        assert isinstance(backups, list), f"backups should be list: {body}"

        # If more than one entry, verify newest-first ordering by created_at/modified fields
        def _ts(item):
            for k in ("created_at", "createdAt", "modifiedTime", "modified_time", "date", "at"):
                v = item.get(k)
                if v:
                    return str(v)
            return ""

        if len(backups) >= 2:
            timestamps = [_ts(b) for b in backups]
            # Only verify order if timestamps look present
            if all(timestamps):
                assert timestamps == sorted(timestamps, reverse=True), (
                    f"Backups not newest-first: {timestamps}"
                )


# ---------- 4. Dashboard stats ----------
class TestDashboardStats:
    def test_dashboard_stats_returns_integer_fields(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/dashboard-stats", headers=admin_headers, timeout=20
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        body = r.json()
        required = [
            "users_total", "users_today", "users_7d", "users_30d",
            "items_total", "items_today", "total_subscribers",
        ]
        for k in required:
            assert k in body, f"Missing field {k}: {body}"
            assert isinstance(body[k], int), (
                f"{k} should be int, got {type(body[k]).__name__}={body[k]}"
            )
            assert body[k] >= 0, f"{k} negative: {body[k]}"

    def test_dashboard_stats_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/dashboard-stats", timeout=20)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
