"""Tests for the unencrypted full-snapshot change (iteration 14).

Verifies POST /api/admin/backups/full-snapshot now:
  - Returns 200 with encrypted=false, selfcheck_ok=true, passphrase_uploaded=false
  - Produces a filename ending in 'FULL SNAPSHOT.zip'
  - The returned snapshot is a PLAIN zip (we re-verify via /api/admin/backups/verify
    WITHOUT a passphrase — must succeed and report encrypted=false)
  - gdrive_uploaded may be False with gdrive_error in {'auth_expired','not_connected'}
    (expected since Drive is currently disconnected)
  - Auth gating: 401 no token, 403 non-admin token

Regression:
  - GET /api/admin/backup-health (admin) still 200
  - GET /api/admin/gdrive/status (admin) still 200
"""
from __future__ import annotations

import io
import os
import uuid
import zipfile

import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASSWORD = "Blue321!"

FULL_SNAPSHOT_TIMEOUT = 180  # endpoint tar-gzips source trees; can take 30-90s


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert resp.status_code == 200, f"Admin login failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert "token" in data and data["token"], f"No token: {data}"
    return data["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def non_admin_token():
    email = f"testuser_{uuid.uuid4().hex[:10]}@example.com"
    password = "Test12345!"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": password, "name": "Snap Tester"},
        timeout=20,
    )
    if r.status_code != 200:
        r2 = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password},
            timeout=20,
        )
        assert r2.status_code == 200, f"non-admin register/login failed: {r.text} / {r2.text}"
        return r2.json()["token"]
    return r.json()["token"]


@pytest.fixture(scope="module")
def non_admin_headers(non_admin_token):
    return {"Authorization": f"Bearer {non_admin_token}"}


@pytest.fixture(scope="module")
def snapshot_response(admin_headers):
    """Build a snapshot ONCE per test module — it's slow."""
    r = requests.post(
        f"{BASE_URL}/api/admin/backups/full-snapshot",
        headers=admin_headers,
        timeout=FULL_SNAPSHOT_TIMEOUT,
    )
    assert r.status_code == 200, f"full-snapshot failed: {r.status_code} {r.text[:400]}"
    return r.json()


# ---------- POST /api/admin/backups/full-snapshot ----------
class TestFullSnapshotPlain:

    def test_returns_200_and_plain_zip_shape(self, snapshot_response):
        body = snapshot_response
        assert body.get("ok") is True, body
        # Plain zip (NOT encrypted)
        assert body.get("encrypted") is False, f"encrypted should be False: {body}"
        # Self-check passed without a passphrase
        assert body.get("selfcheck_ok") is True, f"selfcheck_ok should be True: {body}"
        # No passphrase generation/upload
        assert body.get("passphrase_uploaded") is False, f"passphrase_uploaded must be False: {body}"
        # Filename ends with 'FULL SNAPSHOT.zip'
        fn = body.get("filename") or ""
        assert fn.endswith("FULL SNAPSHOT.zip"), f"Filename wrong: {fn}"
        # Sanity on size + doc count
        assert isinstance(body.get("size_bytes"), int) and body["size_bytes"] > 0
        assert isinstance(body.get("document_count"), int)
        # Self-check sub-structure
        sc = body.get("selfcheck") or {}
        assert sc.get("ok") is True, f"selfcheck.ok: {sc}"
        assert sc.get("has_code") is True, f"snapshot should include code/: {sc}"

    def test_gdrive_status_field_is_expected(self, snapshot_response):
        """Drive is disconnected/expired — gdrive_uploaded=false with a known error code."""
        body = snapshot_response
        # gdrive_uploaded may be False — that's fine and expected per E1's note
        if body.get("gdrive_uploaded") is False:
            assert body.get("gdrive_error") in (
                "auth_expired", "not_connected", "upload_failed",
            ), f"Unexpected gdrive_error: {body.get('gdrive_error')}"
            assert body.get("gdrive_id") in (None, ""), body
        else:
            # If by some chance Drive is now connected, gdrive_id should be set
            assert body.get("gdrive_id"), body

    def test_unauthenticated_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/admin/backups/full-snapshot", timeout=20)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"

    def test_non_admin_returns_403(self, non_admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/admin/backups/full-snapshot",
            headers=non_admin_headers,
            timeout=20,
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ---------- POST /api/admin/backups/verify (with a fresh in-process plain zip) ----------
class TestVerifyPlainZip:
    """We can't easily download the just-built snapshot (the endpoint returns
    metadata, not bytes). Instead, build a MINIMAL plain ZIP inline that
    matches the parser's contract (db.json with at least the 'users' coll)
    and POST it to /verify with no passphrase → must succeed + encrypted=False.
    """

    def _make_plain_zip(self) -> bytes:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("db.json", '{"users": [{"id":"u1","email":"a@b.com"}]}')
            zf.writestr("manifest.json", '{"schema_version":4,"kind":"full_snapshot"}')
        return buf.getvalue()

    def test_verify_plain_zip_no_passphrase(self, admin_headers):
        data = self._make_plain_zip()
        files = {"file": ("test_plain.zip", data, "application/zip")}
        # passphrase intentionally omitted
        r = requests.post(
            f"{BASE_URL}/api/admin/backups/verify",
            headers=admin_headers,
            files=files,
            timeout=60,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        body = r.json()
        assert body.get("ok") is True and body.get("valid") is True, body
        assert body.get("encrypted") is False, f"plain zip should report encrypted=False: {body}"
        assert body.get("total_documents") == 1, body
        assert "users" in (body.get("summary") or {}), body


# ---------- Regression ----------
class TestRegression:

    def test_backup_health_still_200(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/backup-health", headers=admin_headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        body = r.json()
        assert "health" in body and "recipients" in body, body

    def test_gdrive_status_still_200(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/gdrive/status", headers=admin_headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        body = r.json()
        assert "connected" in body, body
