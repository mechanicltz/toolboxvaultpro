"""Iteration 94 backend tests — Quick Add restructure.

Covers:
 - /api/community/lookup: no-match vs. match branches for seeded catalog models
 - /api/community/profile/{key}: returns ranked per-field options
 - /api/community/browse: seeded catalog reachable
 - /api/dealers: list + create dealer (used by the qa-dealer picker)
 - /api/tools: create with dealer_id + is_bundle + community-imported fields, then GET verifies persistence
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://toolbox-vault-v3.preview.emergentagent.com").rstrip("/")

PRO_EMAIL = "mechanicltz@gmail.com"
PRO_PASSWORD = "Blue321!"


@pytest.fixture(scope="module")
def pro_api() -> requests.Session:
    """Authenticated session for the Pro account (bypasses 15-tool free limit)."""
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


# ---------- community lookup ---------------------------------------------------
class TestCommunityLookup:
    def test_lookup_gibberish_returns_none(self, pro_api):
        r = pro_api.get(f"{BASE_URL}/api/community/lookup", params={"model": "ZZZQQQXXX9999"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("branch") == "none"
        assert body.get("matches") == []

    def test_lookup_seeded_model_returns_match(self, pro_api):
        # Iteration 93 verified '2767-20' (Milwaukee M18 FUEL) is seeded.
        r = pro_api.get(f"{BASE_URL}/api/community/lookup", params={"model": "2767-20"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("branch") in ("one", "multiple"), body
        matches = body.get("matches") or []
        assert len(matches) >= 1
        m = matches[0]
        for k in ("profile_key", "brand", "model", "official_name", "contributor_count"):
            assert k in m, f"missing key {k} in match: {m}"
        assert m["contributor_count"] >= 2  # consensus threshold

    def test_lookup_short_query_returns_none(self, pro_api):
        r = pro_api.get(f"{BASE_URL}/api/community/lookup", params={"model": ""})
        assert r.status_code == 200
        assert r.json().get("branch") == "none"


# ---------- community profile --------------------------------------------------
class TestCommunityProfile:
    def test_profile_returns_ranked_fields(self, pro_api):
        # Find any seeded profile via browse then fetch its detail
        r = pro_api.get(f"{BASE_URL}/api/community/browse", params={"limit": 5})
        assert r.status_code == 200
        items = r.json().get("items") or []
        assert items, "no seeded community profiles found — seed_community.py may not have run"
        key = items[0]["profile_key"]
        r2 = pro_api.get(f"{BASE_URL}/api/community/profile/{key}")
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("profile_key") == key
        fields = body.get("fields") or {}
        # Should surface at least name / category / brand-ish fields
        assert isinstance(fields, dict)
        # Each field must be a list of {value, count}
        for f, opts in fields.items():
            assert isinstance(opts, list)
            for o in opts:
                assert "value" in o and "count" in o
                assert o["count"] >= 1


# ---------- dealer picker CRUD -------------------------------------------------
class TestDealerPicker:
    def test_list_dealers_ok(self, pro_api):
        r = pro_api.get(f"{BASE_URL}/api/dealers")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create_dealer_and_verify_persistence(self, pro_api):
        name = f"TEST_dealer_{uuid.uuid4().hex[:8]}"
        r = pro_api.post(f"{BASE_URL}/api/dealers", json={"name": name})
        assert r.status_code in (200, 201), r.text
        created = r.json()
        assert created.get("name") == name
        dealer_id = created.get("id")
        assert dealer_id

        # GET verifies persistence
        r2 = pro_api.get(f"{BASE_URL}/api/dealers")
        assert r2.status_code == 200
        names = [d.get("name") for d in r2.json()]
        assert name in names
        # cleanup
        pro_api.delete(f"{BASE_URL}/api/dealers/{dealer_id}")


# ---------- full Quick Add save flow ------------------------------------------
class TestQuickAddSave:
    def test_create_tool_with_dealer_and_bundle_and_community_fields(self, pro_api):
        # 1) create a dealer to use as dealer_id
        dname = f"TEST_qa_dealer_{uuid.uuid4().hex[:6]}"
        rd = pro_api.post(f"{BASE_URL}/api/dealers", json={"name": dname})
        assert rd.status_code in (200, 201), rd.text
        dealer = rd.json()
        dealer_id = dealer["id"]

        # 2) grab a seeded profile to import from
        rb = pro_api.get(f"{BASE_URL}/api/community/browse", params={"limit": 1})
        seeded = (rb.json().get("items") or [])
        assert seeded, "no seeded profiles"
        prof = seeded[0]
        rp = pro_api.get(f"{BASE_URL}/api/community/profile/{prof['profile_key']}")
        assert rp.status_code == 200
        p = rp.json()
        top_name = (p["fields"].get("name") or [{"value": prof["official_name"]}])[0]["value"] or "TEST_qa_item"
        top_cat = ((p["fields"].get("category") or [{"value": ""}])[0]["value"]) or ""

        tool_name = f"TEST_qa_{uuid.uuid4().hex[:6]}_{top_name[:20]}"
        payload = {
            "name": tool_name,
            "model_numbers": [prof.get("model") or "TESTMOD"],
            "brand": prof.get("brand") or "",
            "dealer_id": dealer_id,
            "dealer_name": dname,
            "is_bundle": True,
            "category_name": top_cat,
            "cost": 0,
            "purchase_date": "",
        }
        rc = pro_api.post(f"{BASE_URL}/api/tools", json=payload)
        assert rc.status_code in (200, 201), f"create failed: {rc.status_code} {rc.text[:400]}"
        created = rc.json()
        tool_id = created.get("id")
        assert tool_id, created

        # GET verifies persistence: dealer_id, is_bundle, community fields
        time.sleep(0.3)
        rg = pro_api.get(f"{BASE_URL}/api/tools/{tool_id}")
        assert rg.status_code == 200, rg.text
        got = rg.json()
        assert got["name"] == tool_name
        assert got.get("is_bundle") is True, f"is_bundle not persisted: {got.get('is_bundle')}"
        assert got.get("dealer_id") == dealer_id, f"dealer_id not persisted: {got.get('dealer_id')}"
        assert got.get("dealer_name") == dname
        if top_cat:
            assert got.get("category_name") == top_cat or got.get("category_id"), got

        # cleanup
        pro_api.delete(f"{BASE_URL}/api/tools/{tool_id}")
        pro_api.delete(f"{BASE_URL}/api/dealers/{dealer_id}")
