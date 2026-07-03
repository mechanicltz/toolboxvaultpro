"""Iter 81 — Wishlist × Dealer filter regression.

Covers:
- GET /api/wishlist?dealer_id=<id> returns ONLY items for that dealer.
- POST /api/wishlist with dealer_id auto-fills dealer_name from the Dealer record.
- Created item appears in unfiltered GET /api/wishlist too.
- Cleanup after test class.
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://toolbox-vault-v3.preview.emergentagent.com"
).rstrip("/")


@pytest.fixture(scope="module")
def dealer_a(api: requests.Session):
    """Create a throwaway dealer for isolation."""
    name = f"TEST_wishdealer_A_{uuid.uuid4().hex[:8]}"
    r = api.post(f"{BASE_URL}/api/dealers", json={"name": name})
    assert r.status_code in (200, 201), r.text
    d = r.json()
    yield d
    api.delete(f"{BASE_URL}/api/dealers/{d['id']}")


@pytest.fixture(scope="module")
def dealer_b(api: requests.Session):
    name = f"TEST_wishdealer_B_{uuid.uuid4().hex[:8]}"
    r = api.post(f"{BASE_URL}/api/dealers", json={"name": name})
    assert r.status_code in (200, 201), r.text
    d = r.json()
    yield d
    api.delete(f"{BASE_URL}/api/dealers/{d['id']}")


@pytest.fixture(scope="module")
def created_items(api: requests.Session, dealer_a, dealer_b):
    ids: list[str] = []
    yield ids
    for iid in ids:
        try:
            api.delete(f"{BASE_URL}/api/wishlist/{iid}")
        except Exception:
            pass


class TestWishlistDealerFilter:

    def test_create_with_dealer_autofills_dealer_name(self, api, dealer_a, created_items):
        payload = {
            "name": f"TEST_wish_item_A_{uuid.uuid4().hex[:6]}",
            "dealer_id": dealer_a["id"],
            # dealer_name intentionally omitted — backend must fill it
            "priority": "high",
            "price": 42.5,
            "model_number": "MDL-A1",
            "notes": "test notes",
        }
        r = api.post(f"{BASE_URL}/api/wishlist", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == payload["name"]
        assert body["dealer_id"] == dealer_a["id"]
        assert body["dealer_name"] == dealer_a["name"], (
            f"dealer_name not auto-filled: got {body.get('dealer_name')!r}"
        )
        assert body["priority"] == "high"
        assert body["price"] == 42.5
        assert body["model_number"] == "MDL-A1"
        created_items.append(body["id"])

    def test_create_second_item_for_dealer_b(self, api, dealer_b, created_items):
        payload = {
            "name": f"TEST_wish_item_B_{uuid.uuid4().hex[:6]}",
            "dealer_id": dealer_b["id"],
        }
        r = api.post(f"{BASE_URL}/api/wishlist", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["dealer_name"] == dealer_b["name"]
        created_items.append(body["id"])

    def test_list_filtered_by_dealer_a_returns_only_a(self, api, dealer_a, dealer_b, created_items):
        assert len(created_items) >= 2, "prior create tests must have run"
        r = api.get(f"{BASE_URL}/api/wishlist", params={"dealer_id": dealer_a["id"]})
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        # Every returned item must belong to dealer A
        for it in items:
            assert it.get("dealer_id") == dealer_a["id"], (
                f"leaked non-A item into dealer_a filter: {it}"
            )
        # Our A item must be in there
        a_ids = {it["id"] for it in items}
        assert created_items[0] in a_ids, "dealer_a filter missing the item we created"
        # Our B item must NOT be in there
        assert created_items[1] not in a_ids, "dealer_a filter leaked a dealer_b item"

    def test_list_filtered_by_dealer_b_returns_only_b(self, api, dealer_a, dealer_b, created_items):
        r = api.get(f"{BASE_URL}/api/wishlist", params={"dealer_id": dealer_b["id"]})
        assert r.status_code == 200, r.text
        items = r.json()
        for it in items:
            assert it.get("dealer_id") == dealer_b["id"]
        b_ids = {it["id"] for it in items}
        assert created_items[1] in b_ids
        assert created_items[0] not in b_ids

    def test_unfiltered_list_contains_both_items(self, api, created_items):
        r = api.get(f"{BASE_URL}/api/wishlist")
        assert r.status_code == 200, r.text
        all_ids = {it["id"] for it in r.json()}
        assert created_items[0] in all_ids, "A item missing from unfiltered list"
        assert created_items[1] in all_ids, "B item missing from unfiltered list"

    def test_filter_by_bogus_dealer_returns_empty(self, api):
        r = api.get(f"{BASE_URL}/api/wishlist", params={"dealer_id": f"bogus_{uuid.uuid4().hex}"})
        assert r.status_code == 200
        assert r.json() == []

    def test_get_created_item_persists(self, api, created_items, dealer_a):
        # No direct GET-by-id endpoint on wishlist — verify via filtered list.
        r = api.get(f"{BASE_URL}/api/wishlist", params={"dealer_id": dealer_a["id"]})
        assert r.status_code == 200
        item = next((i for i in r.json() if i["id"] == created_items[0]), None)
        assert item is not None
        # Round-trip: dealer_name still present, price + model_number preserved.
        assert item["dealer_name"] == dealer_a["name"]
        assert item["price"] == 42.5
        assert item["model_number"] == "MDL-A1"
        assert item["notes"] == "test notes"
        assert item["priority"] == "high"
