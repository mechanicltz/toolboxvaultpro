"""Guard tests for routes_dealers.py — dealers, agents, balance transactions
and per-account payment schedules (god-file refactor B3).

Every test creates its own dealer and deletes it at the end, so the suite is
safe to run repeatedly against the live backend without leaving junk behind.

Run:  cd /app/backend && python -m pytest tests/test_routes_dealers.py -v
"""
from __future__ import annotations

import uuid

import pytest
import requests

from conftest import BASE_URL


def _uniq() -> str:
    return f"_guard_dealer_{uuid.uuid4().hex[:8]}"


@pytest.fixture
def dealer(api: requests.Session):
    """Create a throwaway dealer; yield it; delete it afterwards."""
    r = api.post(f"{BASE_URL}/api/dealers", json={"name": _uniq(), "phone": "555-0000"})
    assert r.status_code == 200, r.text
    d = r.json()
    yield d
    api.delete(f"{BASE_URL}/api/dealers/{d['id']}")


class TestDealerCrud:
    def test_create_get_update_list(self, api: requests.Session, dealer):
        did = dealer["id"]
        # get
        r = api.get(f"{BASE_URL}/api/dealers/{did}")
        assert r.status_code == 200, r.text
        # update
        r = api.put(f"{BASE_URL}/api/dealers/{did}", json={"phone": "555-1234"})
        assert r.status_code == 200, r.text
        assert r.json()["phone"] == "555-1234"
        # appears in list
        r = api.get(f"{BASE_URL}/api/dealers")
        assert r.status_code == 200
        assert any(x["id"] == did for x in r.json())

    def test_get_missing_dealer_404(self, api: requests.Session):
        r = api.get(f"{BASE_URL}/api/dealers/{uuid.uuid4()}")
        assert r.status_code == 404


class TestAgents:
    def test_add_set_current_remove_agent(self, api: requests.Session, dealer):
        did = dealer["id"]
        # add agent
        r = api.post(f"{BASE_URL}/api/dealers/{did}/agents",
                     json={"name": "Guard Agent", "phone": "555-0101"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["agents"]) == 1
        aid = d["agents"][0]["id"]
        # set current
        r = api.post(f"{BASE_URL}/api/dealers/{did}/current-agent/{aid}")
        assert r.status_code == 200, r.text
        assert r.json()["current_agent_id"] == aid
        # remove
        r = api.delete(f"{BASE_URL}/api/dealers/{did}/agents/{aid}")
        assert r.status_code == 200, r.text


class TestTransactions:
    def test_charge_then_payment_balance_math(self, api: requests.Session, dealer):
        did = dealer["id"]
        # a charge increases the credit balance
        r = api.post(f"{BASE_URL}/api/dealers/{did}/transactions",
                     json={"account": "credit", "type": "charge", "amount": 100,
                           "note": "guard charge"})
        assert r.status_code == 200, r.text
        assert r.json()["credit_balance"] == pytest.approx(100.0)
        # a payment decreases it
        r = api.post(f"{BASE_URL}/api/dealers/{did}/transactions",
                     json={"account": "credit", "type": "payment", "amount": 40,
                           "note": "guard payment"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["credit_balance"] == pytest.approx(60.0)
        # deleting a transaction reverses its effect on the balance
        tx_id = d["transactions"][-1]["id"]  # the payment we just made
        r = api.delete(f"{BASE_URL}/api/dealers/{did}/transactions/{tx_id}")
        assert r.status_code == 200, r.text
        assert r.json()["credit_balance"] == pytest.approx(100.0)


class TestSchedules:
    def test_set_clear_account_schedule(self, api: requests.Session, dealer):
        did = dealer["id"]
        # set a monthly schedule on the credit account
        r = api.put(
            f"{BASE_URL}/api/dealers/{did}/accounts/credit/schedule",
            json={"enabled": True, "amount": 50, "frequency": "monthly",
                  "next_due_date": "2026-07-01"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["credit_schedule"]["enabled"] is True
        # clear it
        r = api.delete(f"{BASE_URL}/api/dealers/{did}/accounts/credit/schedule")
        assert r.status_code == 200, r.text
        assert r.json()["credit_schedule"] is None

    def test_payments_upcoming_endpoint(self, api: requests.Session):
        r = api.get(f"{BASE_URL}/api/dealers/payments/upcoming?days=7")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), (list, dict))
