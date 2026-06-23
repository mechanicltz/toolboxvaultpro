"""Tests for POST /api/dealers/{id}/accounts/{account}/skip-payment (#27).

Verifies:
- skip-payment advances next_due_date by one cycle for personal & credit
- balance is UNCHANGED
- NO new 'payment' transaction is appended
- returns the updated Dealer
- Invalid account -> 400
- Missing schedule -> 400
- Regression: confirm-payment still records a payment (decreases balance)
  and advances next_due_date.
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://toolbox-vault-v3.preview.emergentagent.com",
).rstrip("/")
ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PW = "Blue321!"


def _today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _past_iso(days: int = 5) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")


@pytest.fixture(scope="module")
def headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PW},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in {r.json()}"
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture
def dealer(headers):
    """Fresh dealer per-test with seeded balances on personal+credit."""
    r = requests.post(
        f"{BASE_URL}/api/dealers",
        json={"name": "TEST_SkipDealer", "phone": "555-2701"},
        headers=headers,
        timeout=20,
    )
    assert r.status_code in (200, 201), r.text
    d = r.json()
    # Seed balances
    for acct in ("personal", "credit"):
        requests.post(
            f"{BASE_URL}/api/dealers/{d['id']}/transactions",
            json={"account": acct, "type": "charge", "amount": 500,
                  "note": "TEST seed"},
            headers=headers,
            timeout=20,
        )
    yield d
    requests.delete(f"{BASE_URL}/api/dealers/{d['id']}", headers=headers, timeout=20)


def _put_schedule(headers, dealer_id, account, frequency, next_due_date, amount=100):
    body = {
        "enabled": True,
        "amount": amount,
        "frequency": frequency,
        "next_due_date": next_due_date,
        "remind_day_before": True,
        "remind_day_of": True,
    }
    r = requests.put(
        f"{BASE_URL}/api/dealers/{dealer_id}/accounts/{account}/schedule",
        json=body,
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return r.json()


# -- 1) skip-payment on personal (monthly) ----------------------------------
def test_skip_personal_advances_and_does_not_charge(headers, dealer):
    past = _past_iso(days=3)
    _put_schedule(headers, dealer["id"], "personal", "monthly", past, amount=100)

    pre = requests.get(f"{BASE_URL}/api/dealers/{dealer['id']}", headers=headers, timeout=20).json()
    pre_bal = float(pre.get("personal_balance") or 0)
    pre_txs = list(pre.get("transactions") or [])

    r = requests.post(
        f"{BASE_URL}/api/dealers/{dealer['id']}/accounts/personal/skip-payment",
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    d = r.json()

    # (b) balance unchanged
    assert float(d.get("personal_balance") or 0) == pre_bal, \
        f"balance changed on skip: {pre_bal} -> {d.get('personal_balance')}"

    # (c) no new payment transaction
    new_txs = list(d.get("transactions") or [])
    new_payments = [t for t in new_txs if t.get("type") == "payment"]
    pre_payments = [t for t in pre_txs if t.get("type") == "payment"]
    assert len(new_payments) == len(pre_payments), \
        f"skip should not log a payment tx (pre={len(pre_payments)}, new={len(new_payments)})"
    # Also confirm overall tx count is unchanged
    assert len(new_txs) == len(pre_txs), f"transactions appended on skip: {pre_txs} -> {new_txs}"

    # (a) next_due_date advanced by ~30 days from the previous due date
    ps = d.get("personal_schedule") or {}
    prev_dt = datetime.strptime(past, "%Y-%m-%d").date()
    new_dt = datetime.strptime(ps["next_due_date"], "%Y-%m-%d").date()
    delta = (new_dt - prev_dt).days
    assert 27 <= delta <= 32, f"monthly advance should be ~28-31 days from prev_due, got {delta}"

    # (d) the returned object is a Dealer (has id matching)
    assert d.get("id") == dealer["id"]
    assert ps.get("last_skipped_date") == _today_iso()


# -- 2) skip-payment on credit (weekly) -------------------------------------
def test_skip_credit_advances_weekly(headers, dealer):
    past = _past_iso(days=2)
    _put_schedule(headers, dealer["id"], "credit", "weekly", past, amount=75)

    pre = requests.get(f"{BASE_URL}/api/dealers/{dealer['id']}", headers=headers, timeout=20).json()
    pre_bal = float(pre.get("credit_balance") or 0)

    r = requests.post(
        f"{BASE_URL}/api/dealers/{dealer['id']}/accounts/credit/skip-payment",
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert float(d.get("credit_balance") or 0) == pre_bal, "credit balance must not change"

    cs = d.get("credit_schedule") or {}
    prev_dt = datetime.strptime(past, "%Y-%m-%d").date()
    new_dt = datetime.strptime(cs["next_due_date"], "%Y-%m-%d").date()
    assert (new_dt - prev_dt).days == 7, f"weekly advance should be 7 days, got {(new_dt - prev_dt).days}"

    # no payment tx logged for skip
    payments = [t for t in (d.get("transactions") or []) if t.get("type") == "payment"]
    assert len(payments) == 0, f"skip should not log payment tx: {payments}"


# -- 3) Validation: invalid account -----------------------------------------
def test_skip_invalid_account_returns_400(headers, dealer):
    r = requests.post(
        f"{BASE_URL}/api/dealers/{dealer['id']}/accounts/savings/skip-payment",
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"


# -- 4) Validation: missing schedule ----------------------------------------
def test_skip_no_schedule_returns_400(headers, dealer):
    # No schedule set on personal for this fresh dealer
    r = requests.post(
        f"{BASE_URL}/api/dealers/{dealer['id']}/accounts/personal/skip-payment",
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"


# -- 5) Regression: confirm-payment still works (records payment, decrements)
def test_confirm_payment_regression(headers, dealer):
    today = _today_iso()
    _put_schedule(headers, dealer["id"], "personal", "monthly", today, amount=120)

    pre = requests.get(f"{BASE_URL}/api/dealers/{dealer['id']}", headers=headers, timeout=20).json()
    pre_bal = float(pre.get("personal_balance") or 0)

    r = requests.post(
        f"{BASE_URL}/api/dealers/{dealer['id']}/accounts/personal/confirm-payment",
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    new_bal = float(d.get("personal_balance") or 0)
    assert round(pre_bal - new_bal, 2) == 120.00, \
        f"confirm-payment should decrease balance by 120: {pre_bal} -> {new_bal}"

    payments = [t for t in (d.get("transactions") or [])
                if t.get("type") == "payment" and t.get("account") == "personal"]
    assert len(payments) >= 1, "expected a payment transaction"

    ps = d.get("personal_schedule") or {}
    new_dt = datetime.strptime(ps["next_due_date"], "%Y-%m-%d").date()
    today_d = datetime.now(timezone.utc).date()
    delta = (new_dt - today_d).days
    assert 27 <= delta <= 32, f"monthly advance expected ~28-31 days, got {delta}"
