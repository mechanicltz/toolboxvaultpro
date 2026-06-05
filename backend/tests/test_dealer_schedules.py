"""Tests for per-account dealer payment schedules (iteration 6).

Covers:
- PUT /api/dealers/{id}/accounts/{account}/schedule (personal & credit)
- GET /api/dealers/payments/upcoming (route not shadowed; account_label correct)
- POST /api/dealers/{id}/accounts/{account}/confirm-payment
- DELETE /api/dealers/{id}/accounts/{account}/schedule
- Validation: invalid frequency, invalid account, confirm with no schedule
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://login-stretch-layout.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PW = "Blue321!"


def _today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _tomorrow_iso() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")


@pytest.fixture(scope="module")
def token() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PW},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def dealer(headers):
    """Create a dealer for the test module and clean up at the end."""
    r = requests.post(
        f"{BASE_URL}/api/dealers",
        json={"name": "TEST_SchedDealer", "phone": "555-9999"},
        headers=headers,
        timeout=20,
    )
    assert r.status_code in (200, 201), r.text
    d = r.json()
    # Seed balances so we can verify the decrement after confirm
    requests.post(
        f"{BASE_URL}/api/dealers/{d['id']}/transactions",
        json={"account": "personal", "type": "charge", "amount": 1000, "note": "TEST seed"},
        headers=headers,
        timeout=20,
    )
    requests.post(
        f"{BASE_URL}/api/dealers/{d['id']}/transactions",
        json={"account": "credit", "type": "charge", "amount": 1000, "note": "TEST seed"},
        headers=headers,
        timeout=20,
    )
    yield d
    requests.delete(f"{BASE_URL}/api/dealers/{d['id']}", headers=headers, timeout=20)


# 1) PUT personal schedule -------------------------------------------------
def test_put_personal_schedule(headers, dealer):
    tomorrow = _tomorrow_iso()
    body = {
        "enabled": True,
        "amount": 250,
        "frequency": "biweekly",
        "next_due_date": tomorrow,
        "remind_day_before": True,
        "remind_day_of": True,
    }
    r = requests.put(
        f"{BASE_URL}/api/dealers/{dealer['id']}/accounts/personal/schedule",
        json=body,
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("personal_schedule") is not None
    ps = d["personal_schedule"]
    assert ps["enabled"] is True
    assert float(ps["amount"]) == 250
    assert ps["frequency"] == "biweekly"
    assert ps["next_due_date"] == tomorrow


# 2) GET upcoming - includes personal with account_label 'Truck' ----------
def test_upcoming_includes_personal(headers, dealer):
    r = requests.get(
        f"{BASE_URL}/api/dealers/payments/upcoming?days=7",
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # CRITICAL: route should NOT be shadowed by /dealers/{dealer_id}
    assert isinstance(body, dict), f"upcoming should return an object, got {body!r}"
    assert "items" in body, f"missing items: {body}"
    items = body["items"]
    me = [i for i in items if i["dealer_id"] == dealer["id"] and i["account"] == "personal"]
    assert len(me) == 1, f"expected exactly one personal item, got {me}"
    it = me[0]
    assert it["account_label"] == "Truck"
    assert float(it["amount"]) == 250
    assert it["days_until"] == 1
    assert it["overdue"] is False


# 3) POST confirm-payment on personal -------------------------------------
def test_confirm_personal_payment(headers, dealer):
    # capture pre-balance
    pre = requests.get(f"{BASE_URL}/api/dealers/{dealer['id']}", headers=headers, timeout=20).json()
    pre_bal = float(pre.get("personal_balance") or 0)
    prev_due = pre["personal_schedule"]["next_due_date"]

    r = requests.post(
        f"{BASE_URL}/api/dealers/{dealer['id']}/accounts/personal/confirm-payment",
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    new_bal = float(d.get("personal_balance") or 0)
    assert round(pre_bal - new_bal, 2) == 250.00, f"balance did not drop by 250 ({pre_bal} -> {new_bal})"

    # transaction appended with type=payment, note='Scheduled payment'
    txs = d.get("transactions") or []
    payments = [t for t in txs if t.get("type") == "payment" and t.get("note") == "Scheduled payment" and t.get("account") == "personal"]
    assert len(payments) >= 1, f"no scheduled payment tx logged: {txs}"

    # schedule advanced by ~14 days (biweekly)
    ps = d["personal_schedule"]
    prev_dt = datetime.strptime(prev_due, "%Y-%m-%d").date()
    new_dt = datetime.strptime(ps["next_due_date"], "%Y-%m-%d").date()
    assert (new_dt - prev_dt).days == 14, f"biweekly advance != 14 days: {prev_due} -> {ps['next_due_date']}"
    assert ps["last_paid_date"] == _today_iso()


# 4) Credit schedule due TODAY + confirm advances ~1 month ----------------
def test_credit_schedule_and_confirm(headers, dealer):
    today = _today_iso()
    r = requests.put(
        f"{BASE_URL}/api/dealers/{dealer['id']}/accounts/credit/schedule",
        json={
            "enabled": True,
            "amount": 100,
            "frequency": "monthly",
            "next_due_date": today,
            "remind_day_before": True,
            "remind_day_of": True,
        },
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text

    up = requests.get(f"{BASE_URL}/api/dealers/payments/upcoming?days=7", headers=headers, timeout=20).json()
    cred = [i for i in up["items"] if i["dealer_id"] == dealer["id"] and i["account"] == "credit"]
    assert len(cred) == 1, cred
    assert cred[0]["account_label"] == "Credit"
    assert cred[0]["days_until"] == 0
    assert cred[0]["overdue"] is False

    pre = requests.get(f"{BASE_URL}/api/dealers/{dealer['id']}", headers=headers, timeout=20).json()
    pre_bal = float(pre.get("credit_balance") or 0)

    rc = requests.post(
        f"{BASE_URL}/api/dealers/{dealer['id']}/accounts/credit/confirm-payment",
        headers=headers,
        timeout=20,
    )
    assert rc.status_code == 200, rc.text
    d = rc.json()
    assert round(pre_bal - float(d["credit_balance"]), 2) == 100.00

    new_due = datetime.strptime(d["credit_schedule"]["next_due_date"], "%Y-%m-%d").date()
    today_d = datetime.now(timezone.utc).date()
    delta = (new_due - today_d).days
    assert 27 <= delta <= 32, f"monthly advance should be ~28-31 days, got {delta}"


# 5) Validation ------------------------------------------------------------
def test_invalid_frequency(headers, dealer):
    r = requests.put(
        f"{BASE_URL}/api/dealers/{dealer['id']}/accounts/personal/schedule",
        json={"enabled": True, "amount": 50, "frequency": "daily", "next_due_date": _tomorrow_iso()},
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 400, f"daily frequency should be rejected, got {r.status_code}"


def test_invalid_account_name(headers, dealer):
    r = requests.put(
        f"{BASE_URL}/api/dealers/{dealer['id']}/accounts/savings/schedule",
        json={"enabled": True, "amount": 50, "frequency": "monthly", "next_due_date": _tomorrow_iso()},
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 400


def test_confirm_with_no_schedule_returns_400(headers):
    # New dealer with no schedule
    cd = requests.post(
        f"{BASE_URL}/api/dealers",
        json={"name": "TEST_NoSchedDealer"},
        headers=headers,
        timeout=20,
    ).json()
    try:
        r = requests.post(
            f"{BASE_URL}/api/dealers/{cd['id']}/accounts/personal/confirm-payment",
            headers=headers,
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
    finally:
        requests.delete(f"{BASE_URL}/api/dealers/{cd['id']}", headers=headers, timeout=20)


# 6) DELETE schedule clears it and removes from upcoming -------------------
def test_delete_schedule_clears_it(headers, dealer):
    r = requests.delete(
        f"{BASE_URL}/api/dealers/{dealer['id']}/accounts/personal/schedule",
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("personal_schedule") in (None, {}), f"expected null/empty, got {d.get('personal_schedule')}"

    up = requests.get(f"{BASE_URL}/api/dealers/payments/upcoming?days=7", headers=headers, timeout=20).json()
    me = [i for i in up["items"] if i["dealer_id"] == dealer["id"] and i["account"] == "personal"]
    assert len(me) == 0, f"deleted schedule should not be in upcoming: {me}"


# 7) Route is not shadowed by /dealers/{dealer_id} -------------------------
def test_upcoming_route_not_shadowed(headers):
    r = requests.get(f"{BASE_URL}/api/dealers/payments/upcoming?days=7", headers=headers, timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body and "count" in body, f"got dealer-shaped payload? {body}"
