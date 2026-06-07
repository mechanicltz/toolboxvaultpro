"""Tests for the new offsite-backup HEALTH alert endpoints in backups.py.

Endpoints under test:
  - GET  /api/admin/backup-health                 (admin only)
  - POST /api/admin/backup-health/run-now         (admin only, optional ?test=true)

Also regression-checks:
  - GET  /api/admin/gdrive/status                 (admin only, still 200)
  - GET  /api/admin/gdrive/oauth-callback         (no auth, 400 with no code — not 404)
"""
from __future__ import annotations

import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASSWORD = "Blue321!"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    """Login the seeded admin and return a Bearer token."""
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert resp.status_code == 200, f"Admin login failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert "token" in data and data["token"], f"No token in login response: {data}"
    return data["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def non_admin_token():
    """Register a fresh, NON-admin user; return Bearer token."""
    email = f"testuser_{uuid.uuid4().hex[:10]}@example.com"
    password = "Test12345!"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": password, "name": "Backup Health Tester"},
        timeout=20,
    )
    # Account may already exist between runs (unlikely w/ uuid) — fall back to login.
    if r.status_code != 200:
        r2 = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password},
            timeout=20,
        )
        assert r2.status_code == 200, (
            f"Non-admin register+login both failed: register={r.status_code} {r.text} "
            f"login={r2.status_code} {r2.text}"
        )
        return r2.json()["token"]
    return r.json()["token"]


@pytest.fixture(scope="module")
def non_admin_headers(non_admin_token):
    return {"Authorization": f"Bearer {non_admin_token}"}


# ---------- GET /api/admin/backup-health ----------
class TestBackupHealthGet:
    """Verify the health-status endpoint shape, content, and auth gating."""

    def test_returns_200_and_correct_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/backup-health", headers=admin_headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        body = r.json()
        # Required top-level keys
        for k in ("health", "alert_state", "recipients", "reminder_days"):
            assert k in body, f"Missing key '{k}' in {body}"
        # health sub-shape
        health = body["health"]
        assert isinstance(health, dict)
        for k in ("healthy", "reason", "detail"):
            assert k in health, f"health.{k} missing in {health}"
        assert isinstance(health["healthy"], bool)
        # recipients should include admin email (case-insensitive compare)
        recipients_lower = [str(e).strip().lower() for e in body["recipients"]]
        assert ADMIN_EMAIL.lower() in recipients_lower, (
            f"Admin email not in recipients: {body['recipients']}"
        )
        # reminder_days default = 7
        assert body["reminder_days"] == 7

    def test_drive_currently_unhealthy(self, admin_headers):
        """Drive is currently expired/disconnected — health.healthy should be False
        and reason should be 'expired' or 'disconnected'."""
        r = requests.get(f"{BASE_URL}/api/admin/backup-health", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        health = r.json()["health"]
        assert health["healthy"] is False, f"Expected unhealthy, got: {health}"
        assert health["reason"] in ("expired", "disconnected", "upload_failed", "status_error"), (
            f"Unexpected reason: {health['reason']}"
        )

    def test_unauthenticated_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/backup-health", timeout=20)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"

    def test_non_admin_returns_403(self, non_admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/backup-health", headers=non_admin_headers, timeout=20
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ---------- POST /api/admin/backup-health/run-now ----------
class TestBackupHealthRunNow:
    """Verify on-demand health/alert runner — both test=true and test=false."""

    def test_test_mode_sends_sample_email(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/admin/backup-health/run-now",
            params={"test": "true"},
            headers=admin_headers,
            timeout=60,  # SMTP send can take a few seconds
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        body = r.json()
        assert body.get("test") is True, f"Expected test=True, got: {body}"
        assert isinstance(body.get("recipients"), list) and body["recipients"], (
            f"recipients missing/empty: {body}"
        )
        assert isinstance(body.get("sent_to"), list)
        assert body.get("ok") is True, f"ok should be True if SMTP works: {body}"
        sent_lower = [s.lower() for s in body["sent_to"]]
        assert ADMIN_EMAIL.lower() in sent_lower, (
            f"Admin email not in sent_to: {body['sent_to']}"
        )

    def test_real_mode_returns_health_struct(self, admin_headers):
        """test=false (default): returns {test:false, alert_sent, health, recipients}.
        Drive is currently down — health.healthy must be False.
        Note: this may actually send a real alert email to the admin (expected)."""
        r = requests.post(
            f"{BASE_URL}/api/admin/backup-health/run-now",
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        body = r.json()
        assert body.get("test") is False, f"Expected test=False, got: {body}"
        assert "alert_sent" in body and isinstance(body["alert_sent"], bool)
        assert "health" in body and isinstance(body["health"], dict)
        assert "recipients" in body and isinstance(body["recipients"], list)
        assert body["health"].get("healthy") is False, (
            f"Drive currently down — expected unhealthy. Got: {body['health']}"
        )

    def test_unauthenticated_returns_401(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/backup-health/run-now",
            params={"test": "true"},
            timeout=20,
        )
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"

    def test_non_admin_returns_403(self, non_admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/admin/backup-health/run-now",
            params={"test": "true"},
            headers=non_admin_headers,
            timeout=20,
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ---------- Regression: existing gdrive endpoints ----------
class TestGDriveRegression:

    def test_status_endpoint_still_200(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/gdrive/status", headers=admin_headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        body = r.json()
        # Should be a dict with `connected` key at minimum
        assert isinstance(body, dict)
        assert "connected" in body, f"gdrive status missing 'connected': {body}"

    def test_oauth_callback_route_is_live(self):
        """No `code` query param — should return 400 (not 404). Proves the
        redirect route exists at the configured GDRIVE_OAUTH_REDIRECT_URI."""
        r = requests.get(
            f"{BASE_URL}/api/admin/gdrive/oauth-callback", timeout=20, allow_redirects=False
        )
        assert r.status_code == 400, (
            f"Expected 400 for missing code, got {r.status_code}: {r.text[:200]}"
        )
