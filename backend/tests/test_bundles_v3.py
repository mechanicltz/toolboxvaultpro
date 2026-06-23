"""V3 bundle-as-tool tests.

Re-runs Stage 1 (inside items + expansion + search + filter) and Stage 2
(claim mirror on broken inside item) in pytest form using the public
EXPO_BACKEND_URL. Uses the Pro account (mechanicltz@gmail.com) so creation
isn't blocked by the free 15-item limit.

NOTE: cleanup-as-you-go in fixtures; each created tool is hard-deleted in
teardown so re-runs stay idempotent.
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://toolbox-vault-v3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
EMAIL, PW = "mechanicltz@gmail.com", "Blue321!"


# ------------ shared fixtures ------------
@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PW}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture
def cleanup(H):
    created = []
    yield created
    for tid in created:
        try:
            requests.delete(f"{API}/tools/{tid}", headers=H, timeout=15)
        except Exception:
            pass


# ============================================================================
# STAGE 1 — Inventory / search / inside items / expansion items
# ============================================================================
class TestStage1Bundles:
    def test_create_bundle_tool(self, H, cleanup):
        r = requests.post(f"{API}/tools", headers=H, json={
            "name": "TEST_Socket Set 10-15mm", "is_bundle": True, "cost": 199.99,
            "model_numbers": ["TEST_YELLOW333"], "brand": "TestBrand", "quantity": 1,
        }, timeout=30)
        assert r.status_code == 200, r.text
        b = r.json(); cleanup.append(b["id"])
        assert b["is_bundle"] is True
        assert b["name"] == "TEST_Socket Set 10-15mm"
        assert "TEST_YELLOW333" in b.get("model_numbers", [])

    def test_inside_items_crud_and_search(self, H, cleanup):
        # bundle
        b = requests.post(f"{API}/tools", headers=H, json={
            "name": "TEST_Wrench Set", "is_bundle": True,
            "model_numbers": ["TEST_YELLOW334"], "cost": 49,
        }, timeout=30).json()
        cleanup.append(b["id"]); bid = b["id"]

        # add
        r = requests.post(f"{API}/tools/{bid}/inside-items", headers=H,
                          json={"name": "TEST_10mm wrench", "model": "TEST_RED445", "cost": 5.0}, timeout=30)
        assert r.status_code == 200
        b = r.json()
        assert len(b["inside_items"]) == 1
        item = b["inside_items"][0]
        assert item["model"] == "TEST_RED445"

        # update
        r = requests.put(f"{API}/tools/{bid}/inside-items/{item['id']}", headers=H, json={"cost": 7.25}, timeout=30)
        assert r.status_code == 200 and r.json()["inside_items"][0]["cost"] == 7.25

        # search by inside model -> parent surfaced
        r = requests.get(f"{API}/tools?search=TEST_RED445", headers=H, timeout=30)
        assert r.status_code == 200
        assert bid in [t["id"] for t in r.json()], "bundle not surfaced by inside-model search"

        # search by inside name
        r = requests.get(f"{API}/tools?search=TEST_10mm wrench", headers=H, timeout=30)
        assert bid in [t["id"] for t in r.json()], "bundle not surfaced by inside-name search"

        # delete inside item
        r = requests.delete(f"{API}/tools/{bid}/inside-items/{item['id']}", headers=H, timeout=30)
        assert r.status_code == 200 and len(r.json()["inside_items"]) == 0

    def test_is_bundle_filter_returns_only_bundles(self, H, cleanup):
        b = requests.post(f"{API}/tools", headers=H, json={"name": "TEST_filterB", "is_bundle": True}, timeout=30).json()
        cleanup.append(b["id"])
        t = requests.post(f"{API}/tools", headers=H, json={"name": "TEST_filterT"}, timeout=30).json()
        cleanup.append(t["id"])

        r = requests.get(f"{API}/tools?is_bundle=true", headers=H, timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert all(x["is_bundle"] for x in rows)
        ids = [x["id"] for x in rows]
        assert b["id"] in ids
        assert t["id"] not in ids

    def test_expansion_link_unlink_and_inventory_visibility(self, H, cleanup):
        b = requests.post(f"{API}/tools", headers=H, json={"name": "TEST_Bundle X", "is_bundle": True}, timeout=30).json()
        cleanup.append(b["id"]); bid = b["id"]
        exp = requests.post(f"{API}/tools", headers=H, json={"name": "TEST_AddOn Y", "cost": 7}, timeout=30).json()
        cleanup.append(exp["id"])

        # link
        r = requests.post(f"{API}/tools/{bid}/expansion/{exp['id']}", headers=H, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["expansion_of"] == bid

        # expansion list
        r = requests.get(f"{API}/tools/{bid}/expansion-items", headers=H, timeout=30)
        assert r.status_code == 200
        assert exp["id"] in [t["id"] for t in r.json()]

        # expansion item still in main inventory
        r = requests.get(f"{API}/tools", headers=H, timeout=30)
        all_ids = [t["id"] for t in r.json()]
        assert exp["id"] in all_ids, "expansion item should remain visible in inventory"

        # unlink
        r = requests.delete(f"{API}/tools/{bid}/expansion/{exp['id']}", headers=H, timeout=30)
        assert r.status_code == 200
        assert r.json().get("expansion_of") in (None, "")

    def test_inside_item_not_surfaced_as_inventory_row(self, H, cleanup):
        """Inside items live ON the parent bundle doc — they must not appear
        as standalone tools in GET /api/tools."""
        b = requests.post(f"{API}/tools", headers=H, json={
            "name": "TEST_HiddenBundle", "is_bundle": True,
        }, timeout=30).json()
        cleanup.append(b["id"]); bid = b["id"]
        b = requests.post(f"{API}/tools/{bid}/inside-items", headers=H,
                          json={"name": "TEST_HiddenInside", "model": "HIDE999", "cost": 1}, timeout=30).json()
        inside_id = b["inside_items"][0]["id"]

        rows = requests.get(f"{API}/tools", headers=H, timeout=30).json()
        ids = [t["id"] for t in rows]
        assert inside_id not in ids, "inside-item id must NOT appear as separate inventory row"

    def test_migration_endpoint_idempotent(self, H):
        r = requests.post(f"{API}/bundles/migrate-to-tools", headers=H, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        # second call should also be ok and converted=0 (idempotent)
        r2 = requests.post(f"{API}/bundles/migrate-to-tools", headers=H, timeout=30)
        assert r2.status_code == 200 and r2.json().get("bundles_converted") == 0


# ============================================================================
# STAGE 2 — Claims / mark-broken on a bundle (whole set + inside item)
# ============================================================================
class TestStage2Claims:
    def test_mark_broken_inside_item_creates_claim_with_mirror_fields(self, H, cleanup):
        b = requests.post(f"{API}/tools", headers=H, json={
            "name": "TEST_ClaimBundle", "is_bundle": True,
            "model_numbers": ["TEST_YELLOW777"], "cost": 100,
        }, timeout=30).json()
        cleanup.append(b["id"]); bid = b["id"]

        b = requests.post(f"{API}/tools/{bid}/inside-items", headers=H,
                          json={"name": "TEST_10mm socket", "model": "TEST_RED777", "cost": 5}, timeout=30).json()
        item = b["inside_items"][0]

        # mark broken targeting inside item
        r = requests.put(f"{API}/tools/{bid}", headers=H, json={
            "needs_repair": True,
            "repair_info": {
                "repair_status": "Reported",
                "company_notified": "TEST_Dealer",
                "inside_item_id": item["id"],
                "inside_item_name": "TEST_10mm socket",
                "inside_item_model": "TEST_RED777",
            },
        }, timeout=30)
        assert r.status_code == 200, r.text

        # claim mirror fields populated
        claims = requests.get(f"{API}/warranty-claims", headers=H, timeout=30).json()
        mine = [c for c in claims if c.get("tool_id") == bid]
        assert mine, "no warranty claim mirrored for bundle"
        c = mine[0]
        assert c.get("inside_item_model") == "TEST_RED777", c
        assert c.get("inside_item_name") == "TEST_10mm socket", c
        assert c.get("bundle_model") == "TEST_YELLOW777", c

    def test_mark_broken_whole_set_no_inside_fields(self, H, cleanup):
        b = requests.post(f"{API}/tools", headers=H, json={
            "name": "TEST_WholeSetBundle", "is_bundle": True,
            "model_numbers": ["TEST_YELLOW888"], "cost": 50,
        }, timeout=30).json()
        cleanup.append(b["id"]); bid = b["id"]

        r = requests.put(f"{API}/tools/{bid}", headers=H, json={
            "needs_repair": True,
            "repair_info": {"repair_status": "Reported", "company_notified": "TEST_Dealer"},
        }, timeout=30)
        assert r.status_code == 200, r.text
        claims = requests.get(f"{API}/warranty-claims", headers=H, timeout=30).json()
        mine = [c for c in claims if c.get("tool_id") == bid]
        assert mine, "no claim created for whole-set break"
        c = mine[0]
        # whole-set claim should NOT carry inside item fields
        assert not c.get("inside_item_model")
        assert not c.get("inside_item_name")
