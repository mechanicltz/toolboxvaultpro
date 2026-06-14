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
    def test_bundle_crud_lifecycle(self, api: requests.Session):
        name = _uniq("bundle")
        r = api.post(f"{BASE_URL}/api/bundles",
                     json={"name": name, "set_price": 99.0, "part_number": "PN-1"})
        assert r.status_code == 200, r.text
        bid = r.json()["id"]
        try:
            r = api.get(f"{BASE_URL}/api/bundles/{bid}")
            assert r.status_code == 200, r.text
            assert r.json()["set_price"] == pytest.approx(99.0)
            r = api.put(f"{BASE_URL}/api/bundles/{bid}", json={"notes": "guard note"})
            assert r.status_code == 200, r.text
            assert r.json()["notes"] == "guard note"
            r = api.get(f"{BASE_URL}/api/bundles")
            assert r.status_code == 200
            assert any(x["id"] == bid for x in r.json())
        finally:
            r = api.delete(f"{BASE_URL}/api/bundles/{bid}")
            assert r.status_code == 200, r.text


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
