"""Backend tests for TASK 8 — Borrower notes field."""
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://login-stretch-layout.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASSWORD = "Blue321!"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_borrower_id(headers):
    payload = {
        "name": "TEST_NotesBorrower",
        "contact": "555-111-2222",
        "notes": "Initial notes from create",
    }
    r = requests.post(f"{BASE_URL}/api/borrowers", json=payload, headers=headers, timeout=15)
    assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("notes") == "Initial notes from create", f"Notes not returned on create: {data}"
    bid = data["id"]
    yield bid
    # cleanup
    requests.delete(f"{BASE_URL}/api/borrowers/{bid}", headers=headers, timeout=15)


class TestBorrowerNotes:
    def test_create_returns_notes(self, headers):
        payload = {"name": "TEST_CreateNotes", "contact": "555-000-0001", "notes": "Hello world"}
        r = requests.post(f"{BASE_URL}/api/borrowers", json=payload, headers=headers, timeout=15)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        data = r.json()
        assert data.get("notes") == "Hello world"
        # cleanup
        requests.delete(f"{BASE_URL}/api/borrowers/{data['id']}", headers=headers, timeout=15)

    def test_update_persists_notes(self, headers, created_borrower_id):
        new_notes = "Updated notes payload"
        r = requests.put(
            f"{BASE_URL}/api/borrowers/{created_borrower_id}",
            json={"name": "TEST_NotesBorrower", "contact": "555-111-2222", "notes": new_notes},
            headers=headers,
            timeout=15,
        )
        assert r.status_code == 200, f"Update failed: {r.status_code} {r.text}"

        # Verify via history endpoint
        h = requests.get(
            f"{BASE_URL}/api/borrowers/{created_borrower_id}/history",
            headers=headers,
            timeout=15,
        )
        assert h.status_code == 200, f"History failed: {h.status_code} {h.text}"
        hdata = h.json()
        assert hdata.get("borrower", {}).get("notes") == new_notes, (
            f"Notes did not persist. Got: {hdata.get('borrower')}"
        )

    def test_history_returns_notes(self, headers, created_borrower_id):
        h = requests.get(
            f"{BASE_URL}/api/borrowers/{created_borrower_id}/history",
            headers=headers,
            timeout=15,
        )
        assert h.status_code == 200
        b = h.json().get("borrower", {})
        assert "notes" in b, f"borrower.notes missing in history response. Keys: {list(b.keys())}"
