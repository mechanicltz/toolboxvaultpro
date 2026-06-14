"""Guard tests for routes_taxonomy.py — locations, tags, brands, categories,
borrowers (god-file refactor B3).

Each test runs a full create -> read -> (update) -> delete lifecycle on its own
uniquely-named records and cleans up after itself, so the suite is safe to run
repeatedly against the live backend without polluting real data.

Run:  cd /app/backend && python -m pytest tests/test_routes_taxonomy.py -v
"""
from __future__ import annotations

import uuid

import requests

from conftest import BASE_URL


def _uniq(prefix: str) -> str:
    return f"_guard_{prefix}_{uuid.uuid4().hex[:8]}"


class TestLocations:
    def test_location_crud_lifecycle(self, api: requests.Session):
        name = _uniq("loc")
        # create
        r = api.post(f"{BASE_URL}/api/locations", json={"name": name})
        assert r.status_code == 200, r.text
        loc = r.json()
        lid = loc["id"]
        assert loc["name"] == name
        try:
            # list contains it
            r = api.get(f"{BASE_URL}/api/locations")
            assert r.status_code == 200
            assert any(x["id"] == lid for x in r.json())
            # rename
            new_name = name + "_renamed"
            r = api.put(f"{BASE_URL}/api/locations/{lid}", json={"name": new_name})
            assert r.status_code == 200, r.text
            assert r.json()["name"] == new_name
        finally:
            r = api.delete(f"{BASE_URL}/api/locations/{lid}")
            assert r.status_code == 200, r.text

    def test_update_missing_location_404(self, api: requests.Session):
        r = api.put(f"{BASE_URL}/api/locations/{uuid.uuid4()}", json={"name": "x"})
        assert r.status_code == 404


class TestTags:
    def test_tag_crud_lifecycle(self, api: requests.Session):
        name = _uniq("tag")
        r = api.post(f"{BASE_URL}/api/tags", json={"name": name, "color": "#123456"})
        assert r.status_code == 200, r.text
        tag = r.json()
        tid = tag["id"]
        assert tag["name"] == name and tag["color"] == "#123456"
        try:
            # creating the same name again is idempotent (returns existing)
            r2 = api.post(f"{BASE_URL}/api/tags", json={"name": name})
            assert r2.status_code == 200
            assert r2.json()["id"] == tid, "duplicate tag name should reuse the same id"
            # rename
            r = api.put(f"{BASE_URL}/api/tags/{tid}", json={"name": name + "_v2"})
            assert r.status_code == 200, r.text
            assert r.json()["name"] == name + "_v2"
        finally:
            r = api.delete(f"{BASE_URL}/api/tags/{tid}")
            assert r.status_code == 200, r.text

    def test_delete_missing_tag_404(self, api: requests.Session):
        r = api.delete(f"{BASE_URL}/api/tags/{uuid.uuid4()}")
        assert r.status_code == 404


class TestCategories:
    def test_category_crud_lifecycle(self, api: requests.Session):
        name = _uniq("cat")
        r = api.post(f"{BASE_URL}/api/categories", json={"name": name})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        try:
            r = api.put(f"{BASE_URL}/api/categories/{cid}", json={"name": name + "_v2"})
            assert r.status_code == 200, r.text
            assert r.json()["name"] == name + "_v2"
        finally:
            r = api.delete(f"{BASE_URL}/api/categories/{cid}")
            assert r.status_code == 200, r.text


class TestBrands:
    def test_brand_create_list_delete(self, api: requests.Session):
        name = _uniq("brand")
        r = api.post(f"{BASE_URL}/api/brands", json={"name": name})
        assert r.status_code == 200, r.text
        bid = r.json()["id"]
        try:
            r = api.get(f"{BASE_URL}/api/brands")
            assert r.status_code == 200
            assert any(x["id"] == bid for x in r.json())
        finally:
            r = api.delete(f"{BASE_URL}/api/brands/{bid}")
            assert r.status_code == 200, r.text


class TestBorrowers:
    def test_borrower_crud_and_history(self, api: requests.Session):
        name = _uniq("borrower")
        r = api.post(f"{BASE_URL}/api/borrowers",
                     json={"name": name, "contact": "555-0100"})
        assert r.status_code == 200, r.text
        bid = r.json()["id"]
        try:
            # update
            r = api.put(f"{BASE_URL}/api/borrowers/{bid}",
                        json={"name": name + "_v2", "contact": "555-0199"})
            assert r.status_code == 200, r.text
            assert r.json()["name"] == name + "_v2"
            # history works even with no checkouts yet
            r = api.get(f"{BASE_URL}/api/borrowers/{bid}/history")
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["total_checkouts"] == 0
            assert data["unique_tools"] == 0
        finally:
            r = api.delete(f"{BASE_URL}/api/borrowers/{bid}")
            assert r.status_code == 200, r.text
