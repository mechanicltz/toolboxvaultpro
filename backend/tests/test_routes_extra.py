"""Guard tests for the route groups extracted in god-file refactor B3:
routes_bundles.py, routes_wishlist.py, routes_maintenance.py, routes_warranty.py.

Self-cleaning: bundle/wishlist tests create & delete their own records;
maintenance attaches a schedule to an existing tool and removes it; warranty
endpoints are read-only checks. Safe to run repeatedly.

Run:  cd /app/backend && python -m pytest tests/test_routes_extra.py -v
"""
from __future__ import annotations

import uuid

import pytest
import requests

from conftest import BASE_URL


def _uniq(p: str) -> str:
    return f"_guard_{p}_{uuid.uuid4().hex[:8]}"


class TestBundles:
    """v3.2: a Set/Bundle is now a tool with is_bundle=True carrying inside_items.
    The legacy /api/bundles CRUD (db.bundles collection) was removed."""

    def test_set_tool_lifecycle(self, api: requests.Session):
        name = _uniq("set")
        # Create the Set as a tool with is_bundle=True.
        r = api.post(f"{BASE_URL}/api/tools",
                     json={"name": name, "is_bundle": True, "cost": 99.0,
                           "part_number": "PN-1"})
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        assert r.json().get("is_bundle") is True
        try:
            # Add an inside item (no inventory presence; just embedded).
            r = api.post(f"{BASE_URL}/api/tools/{tid}/inside-items",
                         json={"name": "Inner Socket", "model": "S10", "cost": 9.0})
            assert r.status_code == 200, r.text
            inside = r.json().get("inside_items") or []
            assert len(inside) == 1 and inside[0]["name"] == "Inner Socket"
            item_id = inside[0]["id"]

            # Remove the inside item.
            r = api.delete(f"{BASE_URL}/api/tools/{tid}/inside-items/{item_id}")
            assert r.status_code == 200, r.text
            assert len(r.json().get("inside_items") or []) == 0
        finally:
            r = api.delete(f"{BASE_URL}/api/tools/{tid}")
            assert r.status_code == 200, r.text

    def test_legacy_bundles_endpoints_removed(self, api: requests.Session):
        # The old collection-backed CRUD must be gone (404/405), not 200.
        r = api.post(f"{BASE_URL}/api/bundles",
                     json={"name": "x", "set_price": 1.0})
        assert r.status_code in (404, 405), f"legacy POST /bundles still live: {r.status_code}"
        r = api.get(f"{BASE_URL}/api/bundles")
        assert r.status_code in (404, 405), f"legacy GET /bundles still live: {r.status_code}"


class TestWishlist:
    def test_wishlist_crud_lifecycle(self, api: requests.Session):
        name = _uniq("wish")
        r = api.post(f"{BASE_URL}/api/wishlist",
                     json={"name": name, "price": 12.5, "priority": "normal"})
        assert r.status_code == 200, r.text
        wid = r.json()["id"]
        try:
            r = api.put(f"{BASE_URL}/api/wishlist/{wid}", json={"priority": "high"})
            assert r.status_code == 200, r.text
            assert r.json()["priority"] == "high"
            r = api.get(f"{BASE_URL}/api/wishlist")
            assert r.status_code == 200
            assert any(x["id"] == wid for x in r.json())
        finally:
            r = api.delete(f"{BASE_URL}/api/wishlist/{wid}")
            assert r.status_code == 200, r.text


class TestMaintenance:
    def test_schedule_lifecycle_on_existing_tool(self, api: requests.Session):
        tools = api.get(f"{BASE_URL}/api/tools").json()
        if not tools:
            pytest.skip("no tools available to attach a maintenance schedule")
        tid = tools[0]["id"]
        r = api.post(f"{BASE_URL}/api/tools/{tid}/maintenance",
                     json={"type": "Service", "interval_months": 6,
                           "last_done_date": "2026-01-01"})
        assert r.status_code == 200, r.text
        sched = (r.json().get("maintenance") or [])[-1]
        sid = sched["id"]
        try:
            # interval math: Jan 1 + 6 months -> Jul 1
            assert sched["next_due_date"] == "2026-07-01"
        finally:
            r = api.delete(f"{BASE_URL}/api/tools/{tid}/maintenance/{sid}")
            assert r.status_code == 200, r.text

    def test_upcoming_endpoint(self, api: requests.Session):
        r = api.get(f"{BASE_URL}/api/maintenance/upcoming?days=30")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)
        assert "items" in data and "total" in data
        assert isinstance(data["items"], list)


class TestWarranty:
    def test_summary_and_list_read(self, api: requests.Session):
        r = api.get(f"{BASE_URL}/api/warranty-claims/summary")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)
        r = api.get(f"{BASE_URL}/api/warranty-claims")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)
        r = api.get(f"{BASE_URL}/api/warranty-claims?archived=true")
        assert r.status_code == 200, r.text
