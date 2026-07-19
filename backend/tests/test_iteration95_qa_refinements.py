"""Iteration 95 backend regression tests — Quick Add refinements.

Focuses on the 3 refinements from the review request:
  (R1) Community profile now surfaces the 'dealer' field via consensus.
       MILWAUKEE|276720 (Milwaukee 2767-20) -> Home Depot count>=2
       SNAPON|SOEX710   (Snap-on SOEX710)  -> Snap-on Truck count>=2, is_bundle=true
  (R2) Community lookup surfaces is_bundle so the frontend can auto-check qa-bundle.
  (R3) POST /api/tools with is_bundle=true persists (drives the set-editor routing).
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://toolbox-vault-v3.preview.emergentagent.com",
).rstrip("/")

PRO_EMAIL = "mechanicltz@gmail.com"
PRO_PASSWORD = "Blue321!"


@pytest.fixture(scope="module")
def pro_api() -> requests.Session:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": PRO_EMAIL, "password": PRO_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("token")
    assert tok
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


# R1 — community profile surfaces the 'dealer' field with consensus ----------
class TestCommunityDealerField:
    def test_milwaukee_2767_20_dealer_is_home_depot(self, pro_api):
        r = pro_api.get(f"{BASE_URL}/api/community/profile/MILWAUKEE|276720")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["brand"] == "Milwaukee"
        assert body["model"] == "2767-20"
        dealers = body.get("fields", {}).get("dealer") or []
        assert dealers, f"no dealer field on profile: {body.get('fields')}"
        top = dealers[0]
        assert top["value"] == "Home Depot", top
        assert top["count"] >= 2, f"dealer consensus not met: {top}"

    def test_snapon_soex710_is_bundle_with_snapon_truck_dealer(self, pro_api):
        r = pro_api.get(f"{BASE_URL}/api/community/profile/SNAPON|SOEX710")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["is_bundle"] is True, "SOEX710 should be flagged is_bundle=true"
        dealers = body.get("fields", {}).get("dealer") or []
        assert dealers, "no dealer field surfaced"
        assert dealers[0]["value"] == "Snap-on Truck"
        assert dealers[0]["count"] >= 2


# R2 — community lookup surfaces is_bundle so qa-bundle can auto-check --------
class TestCommunityLookupIsBundle:
    def test_lookup_soex710_returns_is_bundle_true(self, pro_api):
        r = pro_api.get(f"{BASE_URL}/api/community/lookup", params={"model": "SOEX710"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["branch"] in ("one", "multiple")
        matches = body.get("matches") or []
        assert matches, body
        bundle_matches = [m for m in matches if m.get("brand") == "Snap-on" and m.get("model") == "SOEX710"]
        assert bundle_matches, matches
        assert bundle_matches[0]["is_bundle"] is True, bundle_matches[0]

    def test_lookup_2767_20_not_bundle(self, pro_api):
        r = pro_api.get(f"{BASE_URL}/api/community/lookup", params={"model": "2767-20"})
        assert r.status_code == 200
        body = r.json()
        matches = body.get("matches") or []
        assert matches
        m = [x for x in matches if x.get("brand") == "Milwaukee" and x.get("model") == "2767-20"]
        assert m
        assert m[0].get("is_bundle") is False


# R3 — Quick Add bundle save persists is_bundle=true --------------------------
class TestBundleQuickAddSave:
    def test_create_bundle_tool_persists_is_bundle_true(self, pro_api):
        payload = {
            "name": f"TEST_qa_bundle_{uuid.uuid4().hex[:6]}",
            "model_numbers": ["QA-BND-TEST"],
            "brand": "TestBrand",
            "is_bundle": True,
            "cost": 0,
            "purchase_date": "",
        }
        r = pro_api.post(f"{BASE_URL}/api/tools", json=payload)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        tool_id = created.get("id")
        assert tool_id
        # Verify persistence
        time.sleep(0.2)
        rg = pro_api.get(f"{BASE_URL}/api/tools/{tool_id}")
        assert rg.status_code == 200
        got = rg.json()
        assert got.get("is_bundle") is True
        # cleanup
        pro_api.delete(f"{BASE_URL}/api/tools/{tool_id}")


# Sanity: dealer CRUD used by the reconciliation Alert 'Create' path ---------
class TestDealerReconcileCreate:
    def test_create_dealer_home_depot_style(self, pro_api):
        # Mirrors the api.createDealer call the reconcileDealer Alert triggers.
        name = f"TEST_HD_{uuid.uuid4().hex[:6]}"
        r = pro_api.post(f"{BASE_URL}/api/dealers", json={"name": name})
        assert r.status_code in (200, 201), r.text
        created = r.json()
        assert created["name"] == name
        did = created["id"]
        # cleanup
        pro_api.delete(f"{BASE_URL}/api/dealers/{did}")
