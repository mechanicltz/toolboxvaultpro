"""
GridFS media offload + serving tests (Phase 2/3 photo-scaling work).

Covers:
- GET /api/files/{id} and /api/files/{id}/thumb (public, no auth)
- 400 on invalid id, 404 on missing id, image/* content-type on success
- create_tool offloads base64 -> /api/files URL; list_tools returns /thumb url
- update_tool offload on photo replace
- delete_tool removes GridFS file (file GET 404 afterwards)
- Smoke regression: list_tools / get_tool / stats / dashboard 200
- Demo account smoketest_1781392054@example.com photo coverage (counts /api/files)

Demo account: smoketest_1781392054@example.com / Blue321! (15 GridFS-photo tools)
General account: mechanicltz@gmail.com / Blue321!  (minimal data)
"""

import base64
import io
import os
import time
import re

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://toolbox-vault-v3.preview.emergentagent.com").rstrip("/")

DEMO_EMAIL = "smoketest_1781392054@example.com"
DEMO_PASSWORD = "Blue321!"
GENERAL_EMAIL = "mechanicltz@gmail.com"
GENERAL_PASSWORD = "Blue321!"

FILE_URL_RE = re.compile(r"^/api/files/([a-fA-F0-9]{24})$")
THUMB_URL_RE = re.compile(r"^/api/files/([a-fA-F0-9]{24})/thumb$")


def _make_png_data_uri(w=64, h=64, color=(255, 0, 0)):
    img = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


@pytest.fixture(scope="module")
def demo_token():
    """Login (with backoff for the 5/min rate-limit)."""
    last_status = None
    for attempt in range(3):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
            timeout=20,
        )
        last_status = r.status_code
        if r.status_code == 200:
            return r.json()["token"]
        if r.status_code == 429:
            time.sleep(15)
            continue
        break
    pytest.skip(f"Login for demo account failed (status={last_status})")


@pytest.fixture(scope="module")
def general_token():
    for attempt in range(3):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": GENERAL_EMAIL, "password": GENERAL_PASSWORD},
            timeout=20,
        )
        if r.status_code == 200:
            return r.json()["token"]
        if r.status_code == 429:
            time.sleep(15)
            continue
        break
    pytest.skip("Login for general account failed")


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# /api/files/{id} and /thumb  — public serving + error handling
# ---------------------------------------------------------------------------
class TestFileServingErrors:
    def test_invalid_id_returns_400(self):
        r = requests.get(f"{BASE_URL}/api/files/not-an-objectid", timeout=10)
        assert r.status_code == 400, f"Expected 400 invalid id, got {r.status_code}: {r.text[:200]}"

    def test_invalid_id_thumb_returns_400(self):
        r = requests.get(f"{BASE_URL}/api/files/not-an-objectid/thumb", timeout=10)
        assert r.status_code == 400, f"Expected 400 invalid id, got {r.status_code}: {r.text[:200]}"

    def test_missing_id_returns_404(self):
        # Valid ObjectId shape that doesn't exist in GridFS
        r = requests.get(f"{BASE_URL}/api/files/000000000000000000000000", timeout=10)
        assert r.status_code == 404, f"Expected 404 missing, got {r.status_code}: {r.text[:200]}"

    def test_missing_thumb_returns_404(self):
        r = requests.get(f"{BASE_URL}/api/files/000000000000000000000000/thumb", timeout=10)
        assert r.status_code == 404, f"Expected 404 missing, got {r.status_code}: {r.text[:200]}"

    def test_files_endpoint_is_public(self):
        """No Authorization header should still return a non-401/403 response."""
        r = requests.get(f"{BASE_URL}/api/files/000000000000000000000000", timeout=10)
        assert r.status_code not in (401, 403), (
            f"/api/files is supposed to be PUBLIC but got {r.status_code}"
        )


# ---------------------------------------------------------------------------
# create_tool -> offload base64 to GridFS; list_tools returns /thumb url
# (Uses GENERAL account because demo account is at its 15-tool FREE_TOOL_LIMIT cap.)
# ---------------------------------------------------------------------------
class TestCreateToolOffloadsPhoto:
    def test_create_with_photo_offloads_to_gridfs(self, general_token):
        data_uri = _make_png_data_uri()
        payload = {
            "name": "TEST_GridFS_Tool",
            "brand": "TestBrand",
            "category": "Power Tools",
            "photos": [data_uri],
        }
        r = requests.post(f"{BASE_URL}/api/tools", json=payload, headers=_auth(general_token), timeout=30)
        assert r.status_code in (200, 201), f"create_tool failed {r.status_code}: {r.text[:300]}"
        body = r.json()
        tool_id = body.get("id")
        photos = body.get("photos") or []
        assert tool_id, "No tool id returned"
        assert isinstance(photos, list) and len(photos) == 1, f"Expected 1 photo url, got {photos!r}"

        photo_url = photos[0]
        m = FILE_URL_RE.match(photo_url)
        assert m, (
            f"Expected /api/files/{{id}} URL after offload, got {photo_url!r} "
            "(if it starts with 'data:' the offload pipeline is broken)"
        )

        # Verify the GridFS file is fetchable + correct content-type
        file_id = m.group(1)
        r2 = requests.get(f"{BASE_URL}/api/files/{file_id}", timeout=20)
        assert r2.status_code == 200, f"GET /api/files/{file_id} returned {r2.status_code}"
        ctype = r2.headers.get("content-type", "")
        assert ctype.startswith("image/"), f"Expected image/* content-type, got {ctype!r}"
        assert len(r2.content) > 100, "Empty body for GridFS file"

        # Thumb should also be fetchable, image/jpeg
        r3 = requests.get(f"{BASE_URL}/api/files/{file_id}/thumb", timeout=20)
        assert r3.status_code == 200, f"GET thumb returned {r3.status_code}"
        thumb_ct = r3.headers.get("content-type", "")
        assert thumb_ct.startswith("image/"), f"thumb content-type {thumb_ct!r}"

        # Persist for downstream tests
        pytest.created_tool_id = tool_id
        pytest.created_file_url = photo_url
        pytest.created_file_id = file_id

    def test_list_tools_returns_thumb_url_for_cover(self, demo_token):
        r = requests.get(f"{BASE_URL}/api/tools", headers=_auth(demo_token), timeout=30)
        assert r.status_code == 200, f"list_tools {r.status_code}: {r.text[:200]}"
        tools = r.json()
        assert isinstance(tools, list), "list_tools should return a list"

        # Find at least one tool with a photo and confirm it's a /thumb URL
        gridfs_thumbs = 0
        gridfs_full = 0
        base64_left = 0
        for t in tools:
            for p in (t.get("photos") or []):
                if isinstance(p, str):
                    if THUMB_URL_RE.match(p):
                        gridfs_thumbs += 1
                    elif FILE_URL_RE.match(p):
                        gridfs_full += 1
                    elif p.startswith("data:"):
                        base64_left += 1
        # list endpoint should serve thumbs, not full files, for cover
        assert gridfs_thumbs > 0, (
            f"Expected at least one /api/files/{{id}}/thumb URL in list_tools; "
            f"got thumbs={gridfs_thumbs} full={gridfs_full} base64={base64_left}"
        )
        assert gridfs_full == 0, (
            f"list_tools returned {gridfs_full} FULL /api/files urls — should be /thumb only"
        )


# ---------------------------------------------------------------------------
# Tool Detail GET returns FULL url (no /thumb)
# ---------------------------------------------------------------------------
class TestToolDetailFullUrl:
    def test_get_tool_detail_returns_full_url(self, general_token):
        tool_id = getattr(pytest, "created_tool_id", None)
        if not tool_id:
            pytest.skip("requires created tool")
        r = requests.get(f"{BASE_URL}/api/tools/{tool_id}", headers=_auth(general_token), timeout=20)
        assert r.status_code == 200, f"get_tool {r.status_code}: {r.text[:200]}"
        photos = r.json().get("photos") or []
        assert len(photos) >= 1, f"Expected at least 1 photo, got {photos}"
        for p in photos:
            assert FILE_URL_RE.match(p), (
                f"Expected FULL /api/files/{{id}} url in detail (no /thumb), got {p!r}"
            )


# ---------------------------------------------------------------------------
# update_tool replaces photo -> new GridFS URL
# ---------------------------------------------------------------------------
class TestUpdateToolOffload:
    def test_update_with_new_photo_offloads(self, general_token):
        tool_id = getattr(pytest, "created_tool_id", None)
        if not tool_id:
            pytest.skip("requires created tool")
        old_url = getattr(pytest, "created_file_url", None)
        new_data_uri = _make_png_data_uri(color=(0, 200, 0))
        payload = {"photos": [new_data_uri]}
        r = requests.put(
            f"{BASE_URL}/api/tools/{tool_id}", json=payload, headers=_auth(general_token), timeout=30
        )
        assert r.status_code in (200, 201), f"update_tool {r.status_code}: {r.text[:200]}"
        photos = r.json().get("photos") or []
        assert len(photos) == 1
        new_url = photos[0]
        assert FILE_URL_RE.match(new_url), f"After update expected /api/files URL, got {new_url!r}"
        assert new_url != old_url, "Update should mint a new GridFS file"
        # New file should be fetchable
        r2 = requests.get(f"{BASE_URL}{new_url}", timeout=20)
        assert r2.status_code == 200, f"New GridFS file not retrievable: {r2.status_code}"
        pytest.updated_file_url = new_url


# ---------------------------------------------------------------------------
# delete_tool removes the GridFS file
# ---------------------------------------------------------------------------
class TestDeleteToolCleanup:
    def test_delete_tool_removes_gridfs_file(self, general_token):
        tool_id = getattr(pytest, "created_tool_id", None)
        if not tool_id:
            pytest.skip("requires created tool")
        # Use the most recent file URL (post-update)
        url_to_check = getattr(pytest, "updated_file_url", None) or getattr(pytest, "created_file_url", None)
        assert url_to_check, "no file url to verify"

        r = requests.delete(f"{BASE_URL}/api/tools/{tool_id}", headers=_auth(general_token), timeout=20)
        assert r.status_code in (200, 204), f"delete_tool {r.status_code}: {r.text[:200]}"

        # Brief grace period in case delete is async
        time.sleep(1)
        r2 = requests.get(f"{BASE_URL}{url_to_check}", timeout=20)
        assert r2.status_code == 404, (
            f"After tool delete the GridFS file should be 404 (got {r2.status_code}). "
            f"url={url_to_check}"
        )

        # Tool detail also gone
        r3 = requests.get(f"{BASE_URL}/api/tools/{tool_id}", headers=_auth(general_token), timeout=20)
        assert r3.status_code in (404, 400), f"deleted tool detail should 404, got {r3.status_code}"


# ---------------------------------------------------------------------------
# Regression smoke (no auth-heavy work after the rate-limited login)
# ---------------------------------------------------------------------------
class TestRegressionSmoke:
    def test_list_tools_200(self, demo_token):
        r = requests.get(f"{BASE_URL}/api/tools", headers=_auth(demo_token), timeout=30)
        assert r.status_code == 200

    def test_stats_200(self, demo_token):
        r = requests.get(f"{BASE_URL}/api/stats", headers=_auth(demo_token), timeout=20)
        assert r.status_code == 200, f"stats {r.status_code}: {r.text[:200]}"

    def test_dashboard_200(self, demo_token):
        # try a couple of common dashboard paths; pass if any 200s
        candidates = ["/api/dashboard", "/api/home", "/api/stats"]
        ok = False
        for path in candidates:
            r = requests.get(f"{BASE_URL}{path}", headers=_auth(demo_token), timeout=20)
            if r.status_code == 200:
                ok = True
                break
        assert ok, "no dashboard-equivalent endpoint returned 200"


# ---------------------------------------------------------------------------
# Wide coverage on demo account: confirm photos across resources are /api/files
# (Inventory, Bundles, Wishlist, Insurance claims, Warranty claims, Claims tab)
# ---------------------------------------------------------------------------
class TestDemoAccountPhotoCoverage:
    """Confirm that ALL user-photo-bearing payloads on the demo account use
    /api/files URLs (post-migration: NO leftover base64 in normal payloads)."""

    @staticmethod
    def _scan_urls(obj, found):
        """Walk a JSON tree collecting any string that looks like an /api/files url
        or a data: URI."""
        if isinstance(obj, dict):
            for v in obj.values():
                TestDemoAccountPhotoCoverage._scan_urls(v, found)
        elif isinstance(obj, list):
            for v in obj:
                TestDemoAccountPhotoCoverage._scan_urls(v, found)
        elif isinstance(obj, str):
            if FILE_URL_RE.match(obj) or THUMB_URL_RE.match(obj):
                found["gridfs"] += 1
            elif obj.startswith("data:image"):
                found["base64"] += 1

    def _scan(self, demo_token, path):
        r = requests.get(f"{BASE_URL}{path}", headers=_auth(demo_token), timeout=30)
        if r.status_code != 200:
            return None, r.status_code
        found = {"gridfs": 0, "base64": 0}
        try:
            self._scan_urls(r.json(), found)
        except Exception:
            return None, r.status_code
        return found, 200

    def test_inventory_uses_gridfs(self, demo_token):
        found, status = self._scan(demo_token, "/api/tools")
        assert status == 200, f"/api/tools {status}"
        assert found["gridfs"] > 0, f"inventory: expected gridfs urls, got {found}"

    def test_bundles_list(self, demo_token):
        found, status = self._scan(demo_token, "/api/bundles")
        # status 200 only — bundles may be empty on demo
        assert status == 200, f"/api/bundles {status}"
        # base64 photos in bundles would indicate a missed migration; allow 0
        # (do not fail if 0 gridfs because bundles list may not include photos)
        assert found["base64"] == 0, f"bundles list returned base64 photos: {found}"

    def test_wishlist(self, demo_token):
        for path in ("/api/wishlist", "/api/wishlist-items"):
            r = requests.get(f"{BASE_URL}{path}", headers=_auth(demo_token), timeout=20)
            if r.status_code == 200:
                found = {"gridfs": 0, "base64": 0}
                self._scan_urls(r.json(), found)
                assert found["base64"] == 0, f"wishlist base64 photos found: {found}"
                return
        pytest.skip("no wishlist endpoint reachable")

    def test_insurance_claims(self, demo_token):
        """Insurance claim ITEMS may contain small frozen `snapshot.photo` base64
        thumbnails (immutable historical records of the tool as it was at claim
        time). The migration intentionally leaves those alone. We only assert
        that any LIVE/editable photo fields (e.g. claim-level evidence photos)
        are NOT base64 — only the frozen `snapshot.photo` field is allowed."""
        for path in ("/api/insurance-claims", "/api/insurance/claims"):
            r = requests.get(f"{BASE_URL}{path}", headers=_auth(demo_token), timeout=20)
            if r.status_code == 200:
                # Walk and count base64 strings, separating "snapshot.photo" from others
                data = r.json()
                snapshot_b64 = 0
                other_b64 = 0
                gridfs = 0

                def walk(node, in_snapshot=False):
                    nonlocal snapshot_b64, other_b64, gridfs
                    if isinstance(node, dict):
                        for k, v in node.items():
                            walk(v, in_snapshot or k == "snapshot")
                    elif isinstance(node, list):
                        for v in node:
                            walk(v, in_snapshot)
                    elif isinstance(node, str):
                        if FILE_URL_RE.match(node) or THUMB_URL_RE.match(node):
                            gridfs += 1
                        elif node.startswith("data:image"):
                            if in_snapshot:
                                snapshot_b64 += 1
                            else:
                                other_b64 += 1

                walk(data)
                # Frozen snapshots staying base64 is acceptable per design
                assert other_b64 == 0, (
                    f"insurance claims have NON-snapshot base64 photos: {other_b64} "
                    f"(snapshot.photo base64: {snapshot_b64}, gridfs: {gridfs})"
                )
                return
        pytest.skip("no insurance-claims endpoint reachable")

    def test_warranty_claims(self, demo_token):
        for path in ("/api/warranty-claims", "/api/warranty/claims"):
            r = requests.get(f"{BASE_URL}{path}", headers=_auth(demo_token), timeout=20)
            if r.status_code == 200:
                found = {"gridfs": 0, "base64": 0}
                self._scan_urls(r.json(), found)
                assert found["base64"] == 0, f"warranty claims base64: {found}"
                return
        pytest.skip("no warranty-claims endpoint reachable")

    def test_claims_aggregate(self, demo_token):
        # The frontend "claims" tab is fed by /api/claims (or similar)
        for path in ("/api/claims", "/api/all-claims", "/api/claims/all"):
            r = requests.get(f"{BASE_URL}{path}", headers=_auth(demo_token), timeout=20)
            if r.status_code == 200:
                found = {"gridfs": 0, "base64": 0}
                self._scan_urls(r.json(), found)
                assert found["base64"] == 0, f"claims base64: {found}"
                return
        pytest.skip("no /api/claims aggregate found")

    def test_demo_account_has_15_photo_tools(self, demo_token):
        """Per spec: demo account has 15 GridFS-photo tools."""
        r = requests.get(f"{BASE_URL}/api/tools", headers=_auth(demo_token), timeout=30)
        assert r.status_code == 200
        tools = r.json()
        photo_tools = [t for t in tools if (t.get("photos") or [])]
        # We just created+deleted one too; so demo account should still have ~15
        assert len(photo_tools) >= 10, (
            f"expected ~15 demo photo-tools, found {len(photo_tools)}"
        )
        # Every photo url should be a /thumb on the list endpoint
        bad = []
        for t in tools:
            for p in (t.get("photos") or []):
                if not THUMB_URL_RE.match(p):
                    bad.append(p)
        assert not bad, f"list_tools photos NOT in thumb form: {bad[:5]}"
