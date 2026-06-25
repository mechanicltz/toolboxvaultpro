"""V3.2 bundle refactor regression tests.

Covers the cleanup that removed the LEGACY `/api/bundles` CRUD + `db.bundles`
collection and consolidated everything onto the "a Set IS a tool with
is_bundle=True" model.

Scope:
- Legacy /api/bundles* endpoints must return 404/405 (gone).
- New set endpoints (inside-items CRUD, expansion link/unlink/list) still work.
- /api/bundles/migrate-to-tools still present and idempotent.
- Reports (inventory, insurance, year_end) generate with list_set_items=true.
- Demo seed for a fresh account creates "Master Socket Set" as is_bundle=True
  with 3 expansion items linked via expansion_of.

Uses Pro account (mechanicltz@gmail.com) for tool creation.
"""
import os
import time
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://toolbox-vault-v3.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

PRO_EMAIL, PRO_PW = "mechanicltz@gmail.com", "Blue321!"


# --------------------------- fixtures ---------------------------
@pytest.fixture(scope="module")
def pro_token():
    r = requests.post(f"{API}/auth/login", json={"email": PRO_EMAIL, "password": PRO_PW}, timeout=30)
    assert r.status_code == 200, f"pro login failed {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def H(pro_token):
    return {"Authorization": f"Bearer {pro_token}", "Content-Type": "application/json"}


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
# 1) LEGACY ENDPOINT REMOVAL — must be GONE
# ============================================================================
class TestLegacyBundleEndpointsGone:
    """Old /api/bundles CRUD + items routes must no longer be registered.

    Acceptable: 404 (route not found) or 405 (method not allowed). Anything
    else (200/201/400/422/500) means the legacy handler is still wired up.
    """

    def _is_gone(self, r):
        return r.status_code in (404, 405)

    def test_get_bundles_list_gone(self, H):
        r = requests.get(f"{API}/bundles", headers=H, timeout=15)
        assert self._is_gone(r), f"GET /api/bundles should be gone, got {r.status_code} {r.text[:200]}"

    def test_post_bundles_create_gone(self, H):
        r = requests.post(f"{API}/bundles", headers=H, json={"name": "TEST_legacy"}, timeout=15)
        assert self._is_gone(r), f"POST /api/bundles should be gone, got {r.status_code} {r.text[:200]}"

    def test_get_bundle_by_id_gone(self, H):
        r = requests.get(f"{API}/bundles/non-existent-id-12345", headers=H, timeout=15)
        assert self._is_gone(r), f"GET /api/bundles/{{id}} should be gone, got {r.status_code}"

    def test_put_bundle_by_id_gone(self, H):
        r = requests.put(f"{API}/bundles/non-existent-id-12345", headers=H, json={"name": "x"}, timeout=15)
        assert self._is_gone(r), f"PUT /api/bundles/{{id}} should be gone, got {r.status_code}"

    def test_delete_bundle_by_id_gone(self, H):
        r = requests.delete(f"{API}/bundles/non-existent-id-12345", headers=H, timeout=15)
        assert self._is_gone(r), f"DELETE /api/bundles/{{id}} should be gone, got {r.status_code}"

    def test_post_bundle_items_gone(self, H):
        r = requests.post(f"{API}/bundles/nope/items/also-nope", headers=H, timeout=15)
        assert self._is_gone(r), f"POST /api/bundles/{{id}}/items/{{tid}} should be gone, got {r.status_code}"

    def test_delete_bundle_items_gone(self, H):
        r = requests.delete(f"{API}/bundles/nope/items/also-nope", headers=H, timeout=15)
        assert self._is_gone(r), f"DELETE /api/bundles/{{id}}/items/{{tid}} should be gone, got {r.status_code}"


# ============================================================================
# 2) NEW SET MODEL ENDPOINTS still work
# ============================================================================
class TestNewSetModelEndpoints:
    def test_full_set_lifecycle(self, H, cleanup):
        # Create bundle tool
        r = requests.post(f"{API}/tools", headers=H, json={
            "name": "TEST_RefactorSet", "is_bundle": True, "cost": 250.0,
        }, timeout=30)
        assert r.status_code == 200, r.text
        bundle = r.json()
        cleanup.append(bundle["id"])
        bid = bundle["id"]
        assert bundle["is_bundle"] is True

        # Add inside item
        r = requests.post(f"{API}/tools/{bid}/inside-items", headers=H, json={
            "name": "TEST_inside_socket", "model": "TEST_INS001", "cost": 4.5,
        }, timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        assert len(b["inside_items"]) == 1
        item_id = b["inside_items"][0]["id"]

        # Update inside item
        r = requests.put(f"{API}/tools/{bid}/inside-items/{item_id}", headers=H,
                         json={"cost": 6.75}, timeout=30)
        assert r.status_code == 200
        assert r.json()["inside_items"][0]["cost"] == 6.75

        # Create a tool to link as expansion
        exp = requests.post(f"{API}/tools", headers=H, json={
            "name": "TEST_ExpansionItem", "cost": 12.0,
        }, timeout=30).json()
        cleanup.append(exp["id"])

        # Link as expansion
        r = requests.post(f"{API}/tools/{bid}/expansion/{exp['id']}", headers=H, timeout=30)
        assert r.status_code == 200
        assert r.json()["expansion_of"] == bid

        # List expansion items
        r = requests.get(f"{API}/tools/{bid}/expansion-items", headers=H, timeout=30)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert exp["id"] in ids

        # Unlink expansion
        r = requests.delete(f"{API}/tools/{bid}/expansion/{exp['id']}", headers=H, timeout=30)
        assert r.status_code == 200

        # Delete inside item
        r = requests.delete(f"{API}/tools/{bid}/inside-items/{item_id}", headers=H, timeout=30)
        assert r.status_code == 200
        assert len(r.json()["inside_items"]) == 0


# ============================================================================
# 3) MIGRATION ENDPOINT — present + idempotent
# ============================================================================
class TestMigrationEndpoint:
    def test_migration_ok_and_idempotent(self, H):
        r = requests.post(f"{API}/bundles/migrate-to-tools", headers=H, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        # Second call should still be 200 with bundles_converted == 0
        r2 = requests.post(f"{API}/bundles/migrate-to-tools", headers=H, timeout=30)
        assert r2.status_code == 200
        assert r2.json().get("bundles_converted") == 0


# ============================================================================
# 4) REPORTS — render with set model
# ============================================================================
class TestReportsRendering:
    @pytest.fixture(scope="class")
    def seeded_set(self, H):
        """Create a set with an inside item + an expansion item to exercise reports."""
        bundle = requests.post(f"{API}/tools", headers=H, json={
            "name": "TEST_ReportSet", "is_bundle": True, "cost": 199.99,
            "brand": "TestBrand",
        }, timeout=30).json()
        bid = bundle["id"]
        # Inside item (should NOT be a separate row in reports)
        requests.post(f"{API}/tools/{bid}/inside-items", headers=H, json={
            "name": "TEST_inside_in_report", "model": "TEST_RPT001", "cost": 9.99,
        }, timeout=30)
        # Expansion item
        exp = requests.post(f"{API}/tools", headers=H, json={
            "name": "TEST_exp_in_report", "cost": 25.0,
        }, timeout=30).json()
        requests.post(f"{API}/tools/{bid}/expansion/{exp['id']}", headers=H, timeout=30)
        yield {"bundle_id": bid, "expansion_id": exp["id"]}
        # cleanup
        for tid in (bid, exp["id"]):
            try:
                requests.delete(f"{API}/tools/{tid}", headers=H, timeout=15)
            except Exception:
                pass

    @pytest.mark.parametrize("report_type", ["inventory", "insurance", "year_end"])
    def test_report_render_with_list_set_items(self, H, seeded_set, report_type):
        payload = {
            "report_type": report_type,
            "options": {"list_set_items": True},
        }
        r = requests.post(f"{API}/reports/render", headers=H, json=payload, timeout=60)
        assert r.status_code == 200, f"{report_type} render failed {r.status_code} {r.text[:400]}"
        # PDF content-type
        ctype = r.headers.get("content-type", "")
        assert "pdf" in ctype.lower(), f"{report_type} did not return PDF (content-type={ctype})"
        # Basic body sanity — PDF magic header %PDF
        assert r.content[:4] == b"%PDF", f"{report_type} body is not a PDF"


# ============================================================================
# 5) DEMO SEED INTEGRITY — fresh registration creates Master Socket Set
# ============================================================================
class TestDemoSeedSet:
    @pytest.fixture(scope="class")
    def fresh_account(self):
        epoch = int(time.time())
        email = f"settest_{epoch}@example.com"
        password = "Blue321!"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": password, "name": "Set Tester",
        }, timeout=60)
        if r.status_code == 429:
            pytest.skip(f"register rate-limited: {r.text[:200]}")
        assert r.status_code in (200, 201), f"register failed {r.status_code} {r.text[:300]}"
        body = r.json()
        token = body.get("token") or body.get("access_token")
        assert token, f"no token in register response: {body}"
        return {"email": email, "password": password, "token": token}

    def test_seed_creates_master_socket_set_with_expansions(self, fresh_account):
        H = {"Authorization": f"Bearer {fresh_account['token']}", "Content-Type": "application/json"}
        # Seed may auto-run on register; poll up to 30s for tools to appear
        tools = []
        deadline = time.time() + 30
        while time.time() < deadline:
            r = requests.get(f"{API}/tools", headers=H, timeout=30)
            if r.status_code == 200:
                tools = r.json()
                if any(t.get("name") == "Master Socket Set" for t in tools):
                    break
            time.sleep(2)

        # Find the Master Socket Set bundle
        msets = [t for t in tools if t.get("name") == "Master Socket Set"]
        assert msets, f"Master Socket Set not found in {len(tools)} seeded tools — names: {[t.get('name') for t in tools][:20]}"
        mset = msets[0]
        assert mset.get("is_bundle") is True, "Master Socket Set must be is_bundle=True"
        bid = mset["id"]

        # Expected expansion item name prefixes per spec (the seed may suffix
        # with variant info, e.g. 'Socket Set 6pc (3/8")').
        expected_prefixes = ('1/2" Drive Ratchet', "Socket Set 6pc", "Extension Bar Set")

        # Listed via the expansion endpoint
        r = requests.get(f"{API}/tools/{bid}/expansion-items", headers=H, timeout=30)
        assert r.status_code == 200, r.text
        exp = r.json()
        found_names = [t.get("name", "") for t in exp]
        # All expected expansion items present (prefix match)
        for pref in expected_prefixes:
            assert any(n.startswith(pref) for n in found_names), (
                f"missing expansion item starting with '{pref}'; got: {found_names}"
            )
        # Exactly 3 expansion items per spec
        assert len(exp) == 3, f"expected 3 expansion items, got {len(exp)}: {found_names}"

        # And expansion_of is set correctly on each
        for t in exp:
            assert t.get("expansion_of") == bid, f"{t.get('name')} expansion_of != bundle id"

        # GET /api/tools surfaces the bundle AND the 3 expansion items
        all_ids = {t["id"] for t in tools}
        assert bid in all_ids
        for t in exp:
            assert t["id"] in all_ids, f"expansion item {t['name']} missing from /api/tools"
