"""
Backend tests for Phase-3 Disaster Recovery endpoints:
- /api/bootstrap/status (non-destructive)
- /api/admin/backups/verify (plain + encrypted + missing/wrong pass)
- /api/admin/backups/test-sandbox (throwaway DB)
- Production /api/stats counts UNCHANGED before & after sandbox test
- 401 enforcement on /api/admin/backups/* without token
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL/EXPO_BACKEND_URL missing"

ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASS = "Blue321!"
PLAIN_ZIP = "/app/backend/test_artifacts/test_plain.zip"
ENC_ZIP = "/app/backend/test_artifacts/test_encrypted.zip"
ENC_PASS = "TestPass1234567890"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# --- bootstrap/status (public, non-destructive) ----------------------------
class TestBootstrap:
    def test_status_not_fresh(self):
        r = requests.get(f"{BASE_URL}/api/bootstrap/status", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["fresh"] is False
        assert body["user_count"] > 0


# --- auth gate -------------------------------------------------------------
class TestAuthGate:
    def test_verify_requires_auth(self):
        with open(PLAIN_ZIP, "rb") as f:
            r = requests.post(
                f"{BASE_URL}/api/admin/backups/verify",
                files={"file": ("test_plain.zip", f, "application/zip")},
                timeout=30,
            )
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_sandbox_requires_auth(self):
        with open(PLAIN_ZIP, "rb") as f:
            r = requests.post(
                f"{BASE_URL}/api/admin/backups/test-sandbox",
                files={"file": ("test_plain.zip", f, "application/zip")},
                timeout=30,
            )
        assert r.status_code in (401, 403)


# --- verify (no DB writes) -------------------------------------------------
class TestVerify:
    def test_verify_plain(self, admin_headers):
        with open(PLAIN_ZIP, "rb") as f:
            r = requests.post(
                f"{BASE_URL}/api/admin/backups/verify",
                headers=admin_headers,
                files={"file": ("test_plain.zip", f, "application/zip")},
                timeout=60,
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["valid"] is True
        assert body["encrypted"] is False
        assert body["total_documents"] == 3
        assert body["has_code"] is True
        assert body["has_env"] is True

    def test_verify_encrypted_with_pass(self, admin_headers):
        with open(ENC_ZIP, "rb") as f:
            r = requests.post(
                f"{BASE_URL}/api/admin/backups/verify",
                headers=admin_headers,
                files={"file": ("test_encrypted.zip", f, "application/zip")},
                data={"passphrase": ENC_PASS},
                timeout=60,
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["valid"] is True
        assert body["encrypted"] is True
        assert body["total_documents"] == 3

    def test_verify_encrypted_no_pass(self, admin_headers):
        with open(ENC_ZIP, "rb") as f:
            r = requests.post(
                f"{BASE_URL}/api/admin/backups/verify",
                headers=admin_headers,
                files={"file": ("test_encrypted.zip", f, "application/zip")},
                timeout=60,
            )
        assert r.status_code == 400, r.text
        msg = (r.json().get("detail") or "").lower()
        assert "encrypted" in msg or "passphrase" in msg

    def test_verify_encrypted_wrong_pass(self, admin_headers):
        with open(ENC_ZIP, "rb") as f:
            r = requests.post(
                f"{BASE_URL}/api/admin/backups/verify",
                headers=admin_headers,
                files={"file": ("test_encrypted.zip", f, "application/zip")},
                data={"passphrase": "wrong"},
                timeout=60,
            )
        assert r.status_code == 400, r.text
        msg = (r.json().get("detail") or "").lower()
        assert "wrong passphrase" in msg or "decrypt" in msg


# --- sandbox restore: production must remain UNCHANGED ---------------------
class TestSandboxNoProdImpact:
    def _stats(self, headers):
        r = requests.get(f"{BASE_URL}/api/stats", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()

    def test_sandbox_does_not_touch_prod(self, admin_headers):
        before = self._stats(admin_headers)
        with open(ENC_ZIP, "rb") as f:
            r = requests.post(
                f"{BASE_URL}/api/admin/backups/test-sandbox",
                headers=admin_headers,
                files={"file": ("test_encrypted.zip", f, "application/zip")},
                data={"passphrase": ENC_PASS},
                timeout=120,
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert "restored" in body and isinstance(body["restored"], dict)
        assert "comparison" in body and isinstance(body["comparison"], dict)
        # Production stats must be identical (tool / dealer counts at minimum)
        after = self._stats(admin_headers)
        for k in ("total_tools", "total_dealers"):
            if k in before and k in after:
                assert before[k] == after[k], f"prod stat '{k}' changed: {before[k]} -> {after[k]}"
        # Generic structural sanity: same top-level keys
        assert set(before.keys()) == set(after.keys())
