"""Iteration 15 backend tests.

Covers:
- #18 Feedback: POST /api/feedback returns 200; email send (with CC of submitter)
  is attempted by the backend. Validation 400s on missing fields.
- #14 Dealer/Agent: PUT and DELETE agent endpoints (used by Edit/Delete buttons).
- Sanity: warranty-alerts endpoint shape (drives the order swap on #15).
"""
import os
import uuid
import time
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASSWORD = "Blue321!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in login response: {data}"
    return tok


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# #18 Feedback endpoint
# ---------------------------------------------------------------------------
class TestFeedback:
    def test_feedback_success(self):
        """Submitting valid feedback returns 200 and ok=true. Backend will
        attempt to email MechanicVault@gmail.com with the submitter as CC
        (success/failure of SMTP itself is tolerated; the endpoint returns
        200 regardless to avoid leaking SMTP state)."""
        unique = uuid.uuid4().hex[:8]
        payload = {
            "name": f"TEST_Tester_{unique}",
            "email": f"test_{unique}@example.com",
            "subject": f"TEST_iter15_{unique}",
            "message": "Automated test feedback from iteration 15 testing.",
            "platform": "iOS",
            "is_bug": True,
            "is_feature": False,
            "app_version": "1.0.0",
        }
        r = requests.post(f"{API}/feedback", json=payload, timeout=60)
        assert r.status_code == 200, f"feedback failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("ok") is True
        assert "message" in body

    def test_feedback_missing_name(self):
        r = requests.post(
            f"{API}/feedback",
            json={"name": "", "email": "x@y.com", "subject": "s", "message": "m"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_feedback_invalid_email(self):
        r = requests.post(
            f"{API}/feedback",
            json={"name": "N", "email": "not-an-email", "subject": "s", "message": "m"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_feedback_missing_subject(self):
        r = requests.post(
            f"{API}/feedback",
            json={"name": "N", "email": "a@b.com", "subject": "", "message": "m"},
            timeout=15,
        )
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# #14 Dealer agent EDIT + DELETE
# ---------------------------------------------------------------------------
class TestDealerAgentEditDelete:
    @pytest.fixture(scope="class")
    def dealer_and_agent(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        unique = uuid.uuid4().hex[:8]
        # Create dealer
        r = requests.post(
            f"{API}/dealers",
            headers=h,
            json={"name": f"TEST_Dealer_{unique}"},
            timeout=15,
        )
        assert r.status_code in (200, 201), f"create dealer: {r.status_code} {r.text}"
        dealer = r.json()
        dealer_id = dealer.get("id") or dealer.get("_id")
        assert dealer_id

        # Add agent
        r = requests.post(
            f"{API}/dealers/{dealer_id}/agents",
            headers=h,
            json={
                "name": f"TEST_Agent_{unique}",
                "phone": "5555550100",
                "email": f"agent_{unique}@example.com",
                "location": "Office A",
                "notes": "initial notes",
            },
            timeout=15,
        )
        assert r.status_code in (200, 201), f"add agent: {r.status_code} {r.text}"
        # Get dealer to find agent id
        r = requests.get(f"{API}/dealers/{dealer_id}", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        agents = d.get("agents") or []
        assert agents, "no agents found"
        agent = next((a for a in agents if a.get("name", "").startswith(f"TEST_Agent_{unique}")), agents[-1])
        agent_id = agent.get("id")
        assert agent_id

        yield {"dealer_id": dealer_id, "agent_id": agent_id, "unique": unique, "headers": h}

        # Cleanup: delete dealer
        try:
            requests.delete(f"{API}/dealers/{dealer_id}", headers=h, timeout=15)
        except Exception:
            pass

    def test_edit_agent(self, dealer_and_agent):
        ctx = dealer_and_agent
        new_name = f"TEST_Agent_EDITED_{ctx['unique']}"
        r = requests.put(
            f"{API}/dealers/{ctx['dealer_id']}/agents/{ctx['agent_id']}",
            headers=ctx["headers"],
            json={
                "name": new_name,
                "phone": "5555550200",
                "email": f"edited_{ctx['unique']}@example.com",
                "location": "Office B",
                "notes": "edited notes",
            },
            timeout=15,
        )
        assert r.status_code in (200, 204), f"edit agent: {r.status_code} {r.text}"
        # Verify persisted
        r = requests.get(f"{API}/dealers/{ctx['dealer_id']}", headers=ctx["headers"], timeout=15)
        assert r.status_code == 200
        agents = r.json().get("agents") or []
        a = next((x for x in agents if x.get("id") == ctx["agent_id"]), None)
        assert a is not None, "agent missing after edit"
        assert a.get("name") == new_name
        assert a.get("location") == "Office B"
        assert a.get("notes") == "edited notes"

    def test_delete_agent(self, dealer_and_agent):
        ctx = dealer_and_agent
        r = requests.delete(
            f"{API}/dealers/{ctx['dealer_id']}/agents/{ctx['agent_id']}",
            headers=ctx["headers"],
            timeout=15,
        )
        assert r.status_code in (200, 204), f"delete agent: {r.status_code} {r.text}"
        # Verify gone
        r = requests.get(f"{API}/dealers/{ctx['dealer_id']}", headers=ctx["headers"], timeout=15)
        assert r.status_code == 200
        agents = r.json().get("agents") or []
        assert not any(x.get("id") == ctx["agent_id"] for x in agents), "agent still present after delete"


# ---------------------------------------------------------------------------
# #15 Warranty alerts data shape (UI swaps render order)
# ---------------------------------------------------------------------------
class TestWarrantyAlertsShape:
    def test_warranty_alerts_returns_expiring_and_expired(self, auth_headers):
        r = requests.get(f"{API}/warranty-alerts?days=60", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "expiring" in data
        assert "expired" in data
        assert isinstance(data["expiring"], list)
        assert isinstance(data["expired"], list)


# ---------------------------------------------------------------------------
# #16 Personal info shape (GET/PUT)
# ---------------------------------------------------------------------------
class TestPersonalInfo:
    def test_get_personal_profile(self, auth_headers):
        r = requests.get(f"{API}/personal-profile", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        # Should be a dict (may be empty)
        assert isinstance(r.json(), dict)

    def test_update_personal_profile(self, auth_headers):
        unique = uuid.uuid4().hex[:6]
        payload = {
            "name": f"TEST_Owner_{unique}",
            "address": "123 Test St",
            "city": "Testville",
            "state": "CA",
            "zip_code": "90001",
            "country": "USA",
            "phone": "5555550199",
            "email": f"owner_{unique}@example.com",
            "policy_number": "POL-12345",
            "insurance_company": "TEST Insurance",
            "notes": "test notes",
            "is_company": False,
            "address2": "",
        }
        r = requests.put(f"{API}/personal-profile", headers=auth_headers, json=payload, timeout=15)
        assert r.status_code in (200, 204), f"update profile: {r.status_code} {r.text}"
        # GET to verify
        r = requests.get(f"{API}/personal-profile", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        prof = r.json()
        assert prof.get("name") == payload["name"]
        assert prof.get("city") == payload["city"]
