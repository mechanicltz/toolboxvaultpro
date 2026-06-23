"""Backend tests for #33 Change Login Email endpoints + auth/profile/feedback regression."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://toolbox-vault-v3.preview.emergentagent.com").rstrip("/")
LOGIN_EMAIL = "MechanicLTZ@gmail.com"
LOGIN_PASSWORD = "Blue321!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body
    return body["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- AUTH REGRESSION ----------
class TestAuthRegression:
    def test_login_success(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "token" in body and "user" in body
        assert body["user"]["email"].lower() == LOGIN_EMAIL.lower()

    def test_auth_me(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["email"].lower() == LOGIN_EMAIL.lower()

    def test_forgot_password_endpoint(self):
        # Should respond ok regardless of whether email exists (no leak)
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                          json={"email": "nonexistent_test@example.com"}, timeout=15)
        assert r.status_code in (200, 202)

    def test_reset_password_invalid_code(self):
        r = requests.post(f"{BASE_URL}/api/auth/reset-password",
                          json={"email": LOGIN_EMAIL, "code": "000000", "new_password": "Whatever123!"},
                          timeout=15)
        # Should reject (400/404) — we just want to ensure endpoint exists & is not 500
        assert r.status_code in (400, 404, 429)


# ---------- CHANGE-EMAIL REQUEST ----------
class TestChangeEmailRequest:
    def test_no_auth_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/change-email/request",
                          json={"current_password": "x", "new_email": "noauth@example.com"},
                          timeout=15)
        assert r.status_code == 401

    def test_wrong_password_returns_401(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/auth/change-email/request",
                          headers=auth_headers,
                          json={"current_password": "WRONG_PASSWORD!", "new_email": "freshunused_test@example.com"},
                          timeout=15)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"

    def test_same_email_returns_400(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/auth/change-email/request",
                          headers=auth_headers,
                          json={"current_password": LOGIN_PASSWORD, "new_email": LOGIN_EMAIL},
                          timeout=15)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_invalid_email_format_returns_400(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/auth/change-email/request",
                          headers=auth_headers,
                          json={"current_password": LOGIN_PASSWORD, "new_email": "not-an-email"},
                          timeout=15)
        assert r.status_code == 400

    def test_email_taken_by_another_account(self, auth_headers):
        # Create another user, then try to change to that user's email
        other_email = f"TEST_taken_{int(time.time())}@example.com"
        reg = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"email": other_email, "password": "TempPass123!", "name": "Test Taken"},
                            timeout=15)
        if reg.status_code not in (200, 201):
            pytest.skip(f"Could not create other account for taken-email test: {reg.status_code} {reg.text}")
        r = requests.post(f"{BASE_URL}/api/auth/change-email/request",
                          headers=auth_headers,
                          json={"current_password": LOGIN_PASSWORD, "new_email": other_email},
                          timeout=15)
        assert r.status_code == 400, f"Expected 400 when email is taken, got {r.status_code}: {r.text}"

    def test_valid_unused_new_email_returns_ok(self, auth_headers):
        unused = f"TEST_unused_{int(time.time())}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/change-email/request",
                          headers=auth_headers,
                          json={"current_password": LOGIN_PASSWORD, "new_email": unused},
                          timeout=20)
        assert r.status_code == 200, f"Expected 200 for valid unused email, got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("ok") is True


# ---------- CHANGE-EMAIL CONFIRM ----------
class TestChangeEmailConfirm:
    def test_no_auth_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/change-email/confirm",
                          json={"code": "123456"}, timeout=15)
        assert r.status_code == 401

    def test_wrong_code_returns_400(self, auth_headers):
        # Pending record was already set up by prior request tests; attempt confirm with wrong code.
        # If pending was cleared, endpoint returns 400 "No pending email change" — both 400 cases acceptable.
        r = requests.post(f"{BASE_URL}/api/auth/change-email/confirm",
                          headers=auth_headers, json={"code": "000000"}, timeout=15)
        assert r.status_code == 400, f"{r.status_code} {r.text}"
        assert "code" in r.text.lower() or "pending" in r.text.lower()


# ---------- PERSONAL PROFILE REGRESSION ----------
class TestPersonalProfile:
    def test_get_profile(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/personal-profile", headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"

    def test_put_profile(self, auth_headers):
        # Get current
        cur = requests.get(f"{BASE_URL}/api/personal-profile", headers=auth_headers, timeout=15).json()
        payload = {**cur, "notes": f"TEST_note_{int(time.time())}"}
        # Remove _id if present
        payload.pop("_id", None)
        r = requests.put(f"{BASE_URL}/api/personal-profile",
                         headers=auth_headers, json=payload, timeout=15)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"


# ---------- FEEDBACK REGRESSION ----------
class TestFeedback:
    def test_feedback_post(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/feedback",
                          headers=auth_headers,
                          json={"name": "Test User", "email": LOGIN_EMAIL,
                                "subject": "TEST regression", "message": "TEST_regression_feedback",
                                "is_bug": True},
                          timeout=20)
        # Accept 200/201/202
        assert r.status_code in (200, 201, 202), f"{r.status_code} {r.text}"


# ---------- CHANGE-EMAIL CONFIRM (no pending) ----------
# Run last to avoid polluting other tests; depends on no pending record.
class TestChangeEmailNoPending:
    def test_confirm_without_pending(self, auth_headers):
        # Force-clear any pending by hitting confirm with bad code until attempts exceed,
        # or just attempt — if a pending exists, we accept either 400 result.
        # Best-effort: we cannot guarantee state, so we just assert the endpoint returns
        # an error (400) and never 500.
        r = requests.post(f"{BASE_URL}/api/auth/change-email/confirm",
                          headers=auth_headers, json={"code": "000001"}, timeout=15)
        assert r.status_code in (400, 429), f"{r.status_code} {r.text}"
