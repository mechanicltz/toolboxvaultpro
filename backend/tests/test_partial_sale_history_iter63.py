"""Iteration 63 — partial sale must keep a sold-split history record.

Repro of the bug: a Pro user creates a tool qty=2, marks for-sale, then marks
1-of-2 sold. The live tool must remain at qty=1 (still in inventory) AND a
SEPARATE 'sold' tool record must exist so the sold unit still appears in
Vault → Sale History.

Pro account: mechanicltz@gmail.com / Blue321!  (free-tier 15-tool limit is
bypassed so this test can safely create + clean up.)

CLEANUP: both the remaining live tool AND the sold-split record are DELETEd
at the end via the api fixture's teardown.
"""
from __future__ import annotations

import os
import time
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://toolbox-vault-v3.preview.emergentagent.com"
).rstrip("/")

PRO_EMAIL = "mechanicltz@gmail.com"
PRO_PASSWORD = "Blue321!"

TAG = f"TEST_iter63_{uuid.uuid4().hex[:6]}"


@pytest.fixture(scope="module")
def pro_api():
    """Authenticated session for the Pro account."""
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": PRO_EMAIL, "password": PRO_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"pro login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token, "no token in pro login response"
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    yield s
    s.close()


def _cleanup(api: requests.Session, ids: list[str]) -> None:
    for tid in ids:
        try:
            api.delete(f"{BASE_URL}/api/tools/{tid}", timeout=15)
        except Exception:
            pass


def test_partial_sale_creates_sold_split_record(pro_api):
    created_ids: list[str] = []
    try:
        # 1. Create tool with quantity=2, mark for sale.
        payload = {
            "name": f"{TAG}_drill",
            "brand": "TestBrand",
            "quantity": 2,
            "cost": 50.0,
        }
        r = pro_api.post(f"{BASE_URL}/api/tools", json=payload, timeout=20)
        assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
        tool = r.json()
        tool_id = tool["id"]
        created_ids.append(tool_id)
        assert int(tool.get("quantity") or 1) == 2

        # Flip for_sale on via PUT (ToolCreate doesn't accept for_sale fields).
        r = pro_api.put(
            f"{BASE_URL}/api/tools/{tool_id}",
            json={
                "for_sale": True,
                "sale_price": 80.0,
                "sale_listed_at": time.strftime("%Y-%m-%d"),
            },
            timeout=20,
        )
        assert r.status_code == 200, f"set for_sale failed: {r.status_code} {r.text}"
        assert r.json().get("for_sale") is True

        # 2. Mark 1-of-2 sold via /mark-sold with sold_quantity=1.
        sold_payload = {
            "sold_quantity": 1,
            "sold_price": 80.0,
            "sold_to": "TEST_buyer",
            "sold_at": time.strftime("%Y-%m-%d"),
            "sold_notes": f"{TAG}_split",
        }
        r = pro_api.post(
            f"{BASE_URL}/api/tools/{tool_id}/mark-sold",
            json=sold_payload,
            timeout=20,
        )
        assert r.status_code == 200, f"mark-sold failed: {r.status_code} {r.text}"
        live = r.json()
        # The response is the live remaining tool.
        assert live["id"] == tool_id
        assert int(live.get("quantity") or 0) == 1, (
            f"expected live tool qty=1 after partial sale, got {live.get('quantity')}"
        )
        # Live tool should still be eligible to keep selling or be marked
        # not-for-sale next.
        assert live.get("is_sold") is False

        # 3. List tools INCLUDING sold ones (default GET /api/tools excludes
        # is_sold=true) — the sold-split must show up here so Vault → Sale
        # History can render it.
        r = pro_api.get(f"{BASE_URL}/api/tools?is_sold=true", timeout=20)
        assert r.status_code == 200
        sold_tools = r.json()
        assert isinstance(sold_tools, list)
        # The split record carries the same name as the original.
        candidates = [
            t for t in sold_tools
            if t.get("name") == payload["name"]
            and t.get("id") != tool_id
            and t.get("is_sold") is True
        ]
        assert len(candidates) == 1, (
            f"expected exactly 1 sold-split record, found {len(candidates)} "
            f"(sold tools with matching name: {[t.get('id') for t in sold_tools if t.get('name') == payload['name']]})"
        )
        split = candidates[0]
        created_ids.append(split["id"])

        # Validate the split record fields — this is what Sale History reads.
        assert int(split.get("quantity") or 0) == 1
        assert split.get("is_sold") is True
        assert abs(float(split.get("sold_price") or 0) - 80.0) < 1e-6
        assert split.get("sold_to") == "TEST_buyer"
        assert split.get("sold_notes") == f"{TAG}_split"
        assert split.get("for_sale") is False
        # The split record carries no live checkout state.
        assert split.get("is_checked_out") in (False, None)
        assert split.get("current_checkout") in (None, {})

        # 4. Now mark the live tool not-for-sale (the bug's last step). The
        # sold split must STILL be present in the listing afterwards.
        r = pro_api.put(
            f"{BASE_URL}/api/tools/{tool_id}",
            json={"for_sale": False},
            timeout=20,
        )
        assert r.status_code == 200, f"unset for_sale failed: {r.status_code} {r.text}"

        r = pro_api.get(f"{BASE_URL}/api/tools?is_sold=true", timeout=20)
        still_there = [
            t for t in r.json()
            if t.get("id") == split["id"] and t.get("is_sold") is True
        ]
        assert len(still_there) == 1, (
            "sold-split history record disappeared after unmarking live tool for-sale"
        )
    finally:
        _cleanup(pro_api, created_ids)


def test_full_sale_still_marks_in_place(pro_api):
    """Sanity: when sold_quantity >= current qty, behave like before — mark
    the existing tool sold, do NOT create a duplicate split."""
    created_ids: list[str] = []
    try:
        payload = {
            "name": f"{TAG}_fullsale",
            "brand": "TestBrand",
            "quantity": 2,
        }
        r = pro_api.post(f"{BASE_URL}/api/tools", json=payload, timeout=20)
        assert r.status_code in (200, 201)
        tool = r.json()
        tool_id = tool["id"]
        created_ids.append(tool_id)

        # sold_quantity omitted ⇒ full sale.
        r = pro_api.post(
            f"{BASE_URL}/api/tools/{tool_id}/mark-sold",
            json={"sold_price": 100.0, "sold_to": "TEST_full"},
            timeout=20,
        )
        assert r.status_code == 200
        live = r.json()
        assert live["id"] == tool_id
        assert live.get("is_sold") is True
        # Original tool keeps its qty (it IS the sold record now).
        assert int(live.get("quantity") or 0) == 2

        # No duplicate sold-split should have been created. Need is_sold=true
        # query because default listing hides sold tools.
        r = pro_api.get(f"{BASE_URL}/api/tools?is_sold=true", timeout=20)
        names = [t for t in r.json() if t.get("name") == payload["name"]]
        assert len(names) == 1, f"expected 1 record after full sale, got {len(names)}"
    finally:
        _cleanup(pro_api, created_ids)
