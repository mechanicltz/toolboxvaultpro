"""Iter 75 — TASK 2 (absorb tool into bundle) + TASK 3 (upcoming-features) tests."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://toolbox-vault-v3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PW = "Blue321!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_hdr(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# TASK 2 — absorb endpoint
# ---------------------------------------------------------------------------
class TestAbsorbToolIntoBundle:
    def test_absorb_flow(self, admin_hdr):
        # 1. create a bundle tool
        bundle_payload = {
            "name": f"TEST_set_{uuid.uuid4().hex[:6]}",
            "is_bundle": True,
            "cost": 0,
        }
        rb = requests.post(f"{API}/tools", json=bundle_payload, headers=admin_hdr, timeout=20)
        assert rb.status_code in (200, 201), rb.text
        bundle = rb.json()
        assert bundle.get("is_bundle") is True
        bundle_id = bundle["id"]

        # 2. create a standalone tool with a photo
        tool_payload = {
            "name": f"TEST_tool_{uuid.uuid4().hex[:6]}",
            "model": "MOD-XYZ",
            "cost": 19.99,
            "photos": ["https://example.com/x.jpg"],
        }
        rt = requests.post(f"{API}/tools", json=tool_payload, headers=admin_hdr, timeout=20)
        assert rt.status_code in (200, 201), rt.text
        tool = rt.json()
        tool_id = tool["id"]

        # 3. absorb
        ra = requests.post(f"{API}/tools/{bundle_id}/absorb/{tool_id}", headers=admin_hdr, timeout=20)
        assert ra.status_code == 200, ra.text
        updated = ra.json()
        # inside item present with preserved fields
        items = updated.get("inside_items") or []
        assert len(items) >= 1
        added = items[-1]
        assert added["name"] == tool_payload["name"]
        assert added["model"] == tool_payload["model"]
        assert float(added["cost"]) == tool_payload["cost"]
        assert added.get("photo") == tool_payload["photos"][0]

        # 4. verify standalone tool was deleted
        rg = requests.get(f"{API}/tools/{tool_id}", headers=admin_hdr, timeout=20)
        assert rg.status_code == 404

        # 5. verify bundle GET returns it
        rb2 = requests.get(f"{API}/tools/{bundle_id}", headers=admin_hdr, timeout=20)
        assert rb2.status_code == 200
        items2 = rb2.json().get("inside_items") or []
        assert any(i.get("name") == tool_payload["name"] for i in items2)

        # cleanup bundle
        requests.delete(f"{API}/tools/{bundle_id}", headers=admin_hdr, timeout=20)

    def test_absorb_404_missing_tool(self, admin_hdr):
        # create a bundle first
        rb = requests.post(
            f"{API}/tools",
            json={"name": f"TEST_set2_{uuid.uuid4().hex[:6]}", "is_bundle": True},
            headers=admin_hdr,
            timeout=20,
        )
        bundle_id = rb.json()["id"]
        ra = requests.post(f"{API}/tools/{bundle_id}/absorb/does-not-exist", headers=admin_hdr, timeout=20)
        assert ra.status_code == 404
        requests.delete(f"{API}/tools/{bundle_id}", headers=admin_hdr, timeout=20)

    def test_absorb_rejects_bundle(self, admin_hdr):
        # cannot absorb a bundle into a bundle
        rb1 = requests.post(
            f"{API}/tools",
            json={"name": f"TEST_set3_{uuid.uuid4().hex[:6]}", "is_bundle": True},
            headers=admin_hdr,
            timeout=20,
        )
        rb2 = requests.post(
            f"{API}/tools",
            json={"name": f"TEST_set4_{uuid.uuid4().hex[:6]}", "is_bundle": True},
            headers=admin_hdr,
            timeout=20,
        )
        bundle_id = rb1.json()["id"]
        other_bundle = rb2.json()["id"]
        ra = requests.post(f"{API}/tools/{bundle_id}/absorb/{other_bundle}", headers=admin_hdr, timeout=20)
        assert ra.status_code == 400
        requests.delete(f"{API}/tools/{bundle_id}", headers=admin_hdr, timeout=20)
        requests.delete(f"{API}/tools/{other_bundle}", headers=admin_hdr, timeout=20)


# ---------------------------------------------------------------------------
# TASK 3 — upcoming-features
# ---------------------------------------------------------------------------
class TestUpcomingFeatures:
    created_id = None

    def test_get_public_upcoming(self, admin_hdr):
        r = requests.get(f"{API}/upcoming-features", headers=admin_hdr, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # all entries have id + created_at + updated_at
        for rel in data:
            assert "id" in rel and "created_at" in rel and "updated_at" in rel

    def test_admin_create_and_update(self, admin_hdr):
        payload = {
            "release_date": "2026-12-31",
            "title": f"TEST_release_{uuid.uuid4().hex[:6]}",
            "features": [{"title": "Feature A", "description": "desc", "status": "On The List"}],
        }
        r = requests.post(f"{API}/admin/upcoming-features", json=payload, headers=admin_hdr, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["title"] == payload["title"]
        assert body["release_date"] == payload["release_date"]
        assert "id" in body and "updated_at" in body
        TestUpcomingFeatures.created_id = body["id"]
        original_updated = body["updated_at"]

        # verify GET returns it
        rg = requests.get(f"{API}/upcoming-features", headers=admin_hdr, timeout=20)
        ids = [x["id"] for x in rg.json()]
        assert body["id"] in ids

        # ensure tiny time delta so updated_at changes
        time.sleep(1.1)
        # update
        up = {"title": payload["title"] + "_v2"}
        ru = requests.put(
            f"{API}/admin/upcoming-features/{body['id']}", json=up, headers=admin_hdr, timeout=20
        )
        assert ru.status_code == 200, ru.text
        updated = ru.json()
        assert updated["title"] == up["title"]
        assert updated["updated_at"] != original_updated

    def test_zz_cleanup(self, admin_hdr):
        if TestUpcomingFeatures.created_id:
            rd = requests.delete(
                f"{API}/admin/upcoming-features/{TestUpcomingFeatures.created_id}",
                headers=admin_hdr,
                timeout=20,
            )
            assert rd.status_code == 200

    def test_non_admin_blocked(self):
        # use a non-admin account: try ryan
        r = requests.post(
            f"{API}/auth/login", json={"email": "ryan@ryan.com", "password": "ryan1234"}, timeout=20
        )
        if r.status_code != 200:
            pytest.skip("could not log in non-admin account")
        tok = r.json()["token"]
        hdr = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        rr = requests.post(
            f"{API}/admin/upcoming-features",
            json={"release_date": "2027-01-01", "title": "x", "features": []},
            headers=hdr,
            timeout=20,
        )
        assert rr.status_code in (401, 403)
