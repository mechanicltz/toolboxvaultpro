# Tests for punch-list #17 — Dealer Logos
# Verifies:
#   - GET /api/dealers exposes a `logo` field
#   - Default-named dealers have correct stock:* values (via migration)
#   - POST persists `logo` (incl. empty default)
#   - PUT updates logo to stock / data-URI / "default"
#   - Auth is required on GET/POST/PUT

import os
import uuid
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path("/app/frontend/.env"))
BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE, "EXPO_PUBLIC_BACKEND_URL must be set"

ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASSWORD = "Blue321!"

EXPECTED_STOCK = {
    "Snap-on Tools": "stock:snap-on",
    "Matco Tools": "stock:matco",
    "Mac Tools": "stock:mac-tools",
    "Cornwell Tools": "stock:cornwell",
    "Harbor Freight": "stock:harbor-freight",
}

TINY_PNG_DATA_URI = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Auth required ----------------
class TestAuthRequired:
    def test_get_dealers_requires_auth(self):
        r = requests.get(f"{BASE}/api/dealers", timeout=15)
        assert r.status_code in (401, 403), f"got {r.status_code}"

    def test_post_dealers_requires_auth(self):
        r = requests.post(
            f"{BASE}/api/dealers",
            json={"name": "TEST_unauth"},
            timeout=15,
        )
        assert r.status_code in (401, 403)

    def test_put_dealers_requires_auth(self):
        r = requests.put(
            f"{BASE}/api/dealers/nonexistent-id",
            json={"name": "x"},
            timeout=15,
        )
        assert r.status_code in (401, 403)


# ---------------- GET returns logo + defaults ----------------
class TestDealerListLogos:
    def test_list_has_logo_field(self, auth_headers):
        r = requests.get(f"{BASE}/api/dealers", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        dealers = r.json()
        assert isinstance(dealers, list) and len(dealers) > 0
        for d in dealers:
            assert "logo" in d, f"dealer {d.get('name')} missing logo field"

    def test_default_dealers_have_stock_logos(self, auth_headers):
        r = requests.get(f"{BASE}/api/dealers", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        dealers = r.json()
        by_name = {d["name"]: d for d in dealers}
        missing = []
        for name, expected in EXPECTED_STOCK.items():
            if name not in by_name:
                missing.append(f"{name} not found")
                continue
            got = by_name[name].get("logo")
            if got != expected:
                missing.append(f"{name} logo={got!r} expected={expected!r}")
        assert not missing, "Default dealer logo issues: " + "; ".join(missing)


# ---------------- POST persists logo ----------------
class TestCreateDealerLogo:
    def test_create_with_stock_logo(self, auth_headers):
        name = f"TEST_LOGO_{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{BASE}/api/dealers",
            headers=auth_headers,
            json={"name": name, "logo": "stock:matco"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["logo"] == "stock:matco"
        # GET verifies persistence
        g = requests.get(
            f"{BASE}/api/dealers/{body['id']}", headers=auth_headers, timeout=20
        )
        assert g.status_code == 200
        assert g.json()["logo"] == "stock:matco"
        # cleanup
        requests.delete(
            f"{BASE}/api/dealers/{body['id']}", headers=auth_headers, timeout=15
        )

    def test_create_without_logo_defaults_empty(self, auth_headers):
        name = f"TEST_NOLOGO_{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{BASE}/api/dealers",
            headers=auth_headers,
            json={"name": name},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("logo", "") == ""
        requests.delete(
            f"{BASE}/api/dealers/{body['id']}", headers=auth_headers, timeout=15
        )


# ---------------- PUT updates logo ----------------
class TestUpdateDealerLogo:
    @pytest.fixture
    def temp_dealer(self, auth_headers):
        name = f"TEST_PUT_{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{BASE}/api/dealers",
            headers=auth_headers,
            json={"name": name, "phone": "555-0100"},
            timeout=20,
        )
        assert r.status_code == 200
        d = r.json()
        yield d
        requests.delete(
            f"{BASE}/api/dealers/{d['id']}", headers=auth_headers, timeout=15
        )

    def test_put_logo_stock(self, auth_headers, temp_dealer):
        did = temp_dealer["id"]
        original_name = temp_dealer["name"]
        r = requests.put(
            f"{BASE}/api/dealers/{did}",
            headers=auth_headers,
            json={"logo": "stock:snap-on"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["logo"] == "stock:snap-on", f"PUT did not persist logo: {body.get('logo')!r}"
        # Other fields preserved
        assert body["name"] == original_name
        assert body["phone"] == "555-0100"

    def test_put_logo_data_uri(self, auth_headers, temp_dealer):
        did = temp_dealer["id"]
        r = requests.put(
            f"{BASE}/api/dealers/{did}",
            headers=auth_headers,
            json={"logo": TINY_PNG_DATA_URI},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json()["logo"] == TINY_PNG_DATA_URI
        g = requests.get(
            f"{BASE}/api/dealers/{did}", headers=auth_headers, timeout=15
        )
        assert g.json()["logo"] == TINY_PNG_DATA_URI

    def test_put_logo_default(self, auth_headers, temp_dealer):
        did = temp_dealer["id"]
        # first set to stock then to default
        requests.put(
            f"{BASE}/api/dealers/{did}",
            headers=auth_headers,
            json={"logo": "stock:cornwell"},
            timeout=20,
        )
        r = requests.put(
            f"{BASE}/api/dealers/{did}",
            headers=auth_headers,
            json={"logo": "default"},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["logo"] == "default", r.text

    def test_put_name_only_preserves_logo(self, auth_headers, temp_dealer):
        did = temp_dealer["id"]
        # set logo first
        requests.put(
            f"{BASE}/api/dealers/{did}",
            headers=auth_headers,
            json={"logo": "stock:matco"},
            timeout=20,
        )
        # Now update only name
        new_name = temp_dealer["name"] + "_renamed"
        r = requests.put(
            f"{BASE}/api/dealers/{did}",
            headers=auth_headers,
            json={"name": new_name},
            timeout=20,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == new_name
        assert body["logo"] == "stock:matco", f"logo lost on name-only PUT: {body.get('logo')!r}"
