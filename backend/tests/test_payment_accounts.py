"""Tests for the Dealer Payment Accounts feature (iteration_4).

Covers create/list/upcoming/update/delete/confirm + autopay catch-up + owner
scoping + auth gating.
"""
import os
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://login-stretch-layout.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASS = "Blue321!"
SECOND_EMAIL = f"TEST_payacct_{int(time.time())}@example.com"
SECOND_PASS = "Test12345!"


# ---------- shared helpers / fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"] if "access_token" in r.json() else r.json().get("token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def second_user_headers():
    # Register fresh user (idempotent skip if exists)
    requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": SECOND_EMAIL, "password": SECOND_PASS, "name": "Second Tester"},
        timeout=15,
    )
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SECOND_EMAIL, "password": SECOND_PASS},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"could not provision secondary user: {r.text}")
    tok = r.json().get("access_token") or r.json().get("token")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def dealer_id(admin_headers):
    r = requests.get(f"{BASE_URL}/api/dealers", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    dealers = r.json()
    if not dealers:
        # Create a throwaway dealer
        cr = requests.post(
            f"{BASE_URL}/api/dealers",
            json={"name": f"TEST_PayAcct_Dealer_{int(time.time())}"},
            headers=admin_headers, timeout=15,
        )
        assert cr.status_code == 200, cr.text
        return cr.json()["id"]
    return dealers[0]["id"]


_created_ids: list[str] = []


def _create(dealer_id, headers, **overrides):
    body = {
        "label": "TEST_TruckLoan",
        "amount": 450.50,
        "frequency": "monthly",
        "next_due_date": "2026-06-20",
        "autopay": False,
        "remind_day_before": True,
        "remind_day_of": True,
    }
    body.update(overrides)
    r = requests.post(
        f"{BASE_URL}/api/dealers/{dealer_id}/payment-accounts",
        json=body, headers=headers, timeout=15,
    )
    if r.status_code == 200:
        _created_ids.append(r.json()["id"])
    return r


# ---------- AUTH ----------
class TestAuth:
    def test_create_requires_bearer(self, dealer_id):
        r = requests.post(
            f"{BASE_URL}/api/dealers/{dealer_id}/payment-accounts",
            json={"label": "x", "amount": 1.0, "frequency": "monthly", "next_due_date": "2026-06-20"},
            timeout=15,
        )
        assert r.status_code in (401, 403), f"expected auth-required, got {r.status_code}: {r.text}"

    def test_list_requires_bearer(self, dealer_id):
        r = requests.get(f"{BASE_URL}/api/dealers/{dealer_id}/payment-accounts", timeout=15)
        assert r.status_code in (401, 403), f"GET list should require auth — got {r.status_code}"

    def test_upcoming_requires_bearer(self):
        r = requests.get(f"{BASE_URL}/api/payment-accounts/upcoming?days=7", timeout=15)
        assert r.status_code in (401, 403), f"GET upcoming should require auth — got {r.status_code}"

    def test_update_requires_bearer(self):
        r = requests.put(f"{BASE_URL}/api/payment-accounts/bogus", json={"label": "x"}, timeout=15)
        assert r.status_code in (401, 403), f"PUT should require auth — got {r.status_code}"

    def test_delete_requires_bearer(self):
        r = requests.delete(f"{BASE_URL}/api/payment-accounts/bogus", timeout=15)
        assert r.status_code in (401, 403), f"DELETE should require auth — got {r.status_code}"

    def test_confirm_requires_bearer(self):
        r = requests.post(f"{BASE_URL}/api/payment-accounts/bogus/confirm", timeout=15)
        assert r.status_code in (401, 403)


# ---------- Create / Validation ----------
class TestCreate:
    def test_create_account_returns_id_and_dealer_name(self, dealer_id, admin_headers):
        r = _create(dealer_id, admin_headers, label="TEST_TruckLoan", amount=450.50)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"]
        assert body["dealer_id"] == dealer_id
        assert body["dealer_name"]
        assert body["label"] == "TEST_TruckLoan"
        assert body["amount"] == 450.50
        assert body["frequency"] == "monthly"
        assert body["next_due_date"] == "2026-06-20"

    def test_invalid_frequency_400(self, dealer_id, admin_headers):
        r = _create(dealer_id, admin_headers, frequency="yearly")
        assert r.status_code == 400, r.text

    def test_empty_label_400(self, dealer_id, admin_headers):
        r = _create(dealer_id, admin_headers, label="   ")
        assert r.status_code == 400, r.text

    def test_bogus_dealer_404(self, admin_headers):
        r = _create("dealer-does-not-exist", admin_headers)
        assert r.status_code == 404, r.text


# ---------- List ----------
class TestList:
    def test_list_sorted_by_due_date(self, dealer_id, admin_headers):
        # Create two accounts on different dates
        a = _create(dealer_id, admin_headers, label="TEST_Later", next_due_date="2026-08-15")
        b = _create(dealer_id, admin_headers, label="TEST_Earlier", next_due_date="2026-06-30")
        assert a.status_code == 200 and b.status_code == 200
        r = requests.get(f"{BASE_URL}/api/dealers/{dealer_id}/payment-accounts",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        dates = [it["next_due_date"] for it in items]
        assert dates == sorted(dates), f"not sorted: {dates}"


# ---------- Confirm / Date math ----------
class TestConfirm:
    def test_confirm_monthly_advances_by_one_month(self, dealer_id, admin_headers):
        r = _create(dealer_id, admin_headers, label="TEST_ConfirmMonth",
                    next_due_date="2026-03-31", frequency="monthly")
        assert r.status_code == 200
        aid = r.json()["id"]
        prev_payments = len(r.json().get("payments") or [])
        c = requests.post(f"{BASE_URL}/api/payment-accounts/{aid}/confirm",
                          headers=admin_headers, timeout=15)
        assert c.status_code == 200, c.text
        body = c.json()
        # Day-clamp: 2026-03-31 + 1 month → 2026-04-30
        assert body["next_due_date"] == "2026-04-30", body
        assert len(body["payments"]) == prev_payments + 1
        assert body["payments"][-1]["auto"] is False

    def test_confirm_weekly_advances_by_7d(self, dealer_id, admin_headers):
        r = _create(dealer_id, admin_headers, label="TEST_ConfirmWeekly",
                    next_due_date="2026-06-10", frequency="weekly")
        aid = r.json()["id"]
        c = requests.post(f"{BASE_URL}/api/payment-accounts/{aid}/confirm",
                          headers=admin_headers, timeout=15)
        assert c.status_code == 200
        assert c.json()["next_due_date"] == "2026-06-17"


# ---------- Autopay catch-up ----------
class TestAutopay:
    def test_autopay_catch_up_advances_past_due(self, dealer_id, admin_headers):
        # Far in the past so autopay must catch up multiple cycles
        r = _create(dealer_id, admin_headers, label="TEST_AutoCatchUp",
                    next_due_date="2026-05-01", frequency="monthly", autopay=True)
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        # Trigger catch-up via list
        r2 = requests.get(f"{BASE_URL}/api/dealers/{dealer_id}/payment-accounts",
                          headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        acct = next(a for a in r2.json() if a["id"] == aid)
        today = datetime.now(timezone.utc).date()
        future_due = datetime.strptime(acct["next_due_date"], "%Y-%m-%d").date()
        assert future_due > today, f"next_due_date {acct['next_due_date']} is not in future (today={today})"
        auto_payments = [p for p in acct["payments"] if p.get("auto") is True]
        assert len(auto_payments) >= 1, "autopay should have recorded at least one auto payment"


# ---------- Upcoming ----------
class TestUpcoming:
    def test_upcoming_within_7d_present_far_future_absent(self, dealer_id, admin_headers):
        today = datetime.now(timezone.utc).date()
        soon = (today + timedelta(days=3)).isoformat()
        far = (today + timedelta(days=60)).isoformat()
        a = _create(dealer_id, admin_headers, label="TEST_UpSoon", next_due_date=soon)
        b = _create(dealer_id, admin_headers, label="TEST_UpFar", next_due_date=far)
        assert a.status_code == 200 and b.status_code == 200
        sid, fid = a.json()["id"], b.json()["id"]
        r = requests.get(f"{BASE_URL}/api/payment-accounts/upcoming?days=7",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        ids = [it["id"] for it in body["items"]]
        assert sid in ids, "near-due account missing from upcoming"
        assert fid not in ids, "far-future account leaked into upcoming"
        soon_item = next(it for it in body["items"] if it["id"] == sid)
        for k in ("days_until", "overdue", "autopay", "remind_day_before", "remind_day_of"):
            assert k in soon_item, f"missing key {k}"


# ---------- Update / Delete ----------
class TestUpdateDelete:
    def test_update_then_persisted(self, dealer_id, admin_headers):
        r = _create(dealer_id, admin_headers, label="TEST_Update")
        aid = r.json()["id"]
        u = requests.put(
            f"{BASE_URL}/api/payment-accounts/{aid}",
            json={"label": "TEST_Update_v2", "amount": 999.99, "frequency": "weekly"},
            headers=admin_headers, timeout=15,
        )
        assert u.status_code == 200, u.text
        body = u.json()
        assert body["label"] == "TEST_Update_v2"
        assert body["amount"] == 999.99
        assert body["frequency"] == "weekly"

    def test_update_invalid_frequency_400(self, dealer_id, admin_headers):
        r = _create(dealer_id, admin_headers, label="TEST_BadFreq")
        aid = r.json()["id"]
        u = requests.put(
            f"{BASE_URL}/api/payment-accounts/{aid}",
            json={"frequency": "yearly"},
            headers=admin_headers, timeout=15,
        )
        assert u.status_code == 400, u.text

    def test_delete_404_on_bogus(self, admin_headers):
        r = requests.delete(f"{BASE_URL}/api/payment-accounts/does-not-exist",
                            headers=admin_headers, timeout=15)
        assert r.status_code == 404, r.text


# ---------- Owner scoping ----------
class TestOwnerScoping:
    def test_second_user_cannot_see_admin_accounts(self, dealer_id, admin_headers, second_user_headers):
        # Create account as admin
        r = _create(dealer_id, admin_headers, label="TEST_OwnerScoping",
                    next_due_date="2026-09-15")
        assert r.status_code == 200, r.text
        admin_acct_id = r.json()["id"]
        # As 2nd user, list payment accounts under same dealer_id
        r2 = requests.get(
            f"{BASE_URL}/api/dealers/{dealer_id}/payment-accounts",
            headers=second_user_headers, timeout=15,
        )
        # 2nd user shouldn't see admin's data; either dealer is also scoped (404 ok)
        if r2.status_code == 200:
            ids = [a["id"] for a in r2.json()]
            assert admin_acct_id not in ids, "owner scoping broken: 2nd user sees admin's payment accounts"

    def test_second_user_upcoming_isolated(self, admin_headers, second_user_headers, dealer_id):
        # admin upcoming
        a = requests.get(f"{BASE_URL}/api/payment-accounts/upcoming?days=365",
                        headers=admin_headers, timeout=15)
        s = requests.get(f"{BASE_URL}/api/payment-accounts/upcoming?days=365",
                        headers=second_user_headers, timeout=15)
        if a.status_code == 200 and s.status_code == 200:
            admin_ids = {it["id"] for it in a.json().get("items", [])}
            second_ids = {it["id"] for it in s.json().get("items", [])}
            shared = admin_ids & second_ids
            assert not shared, f"owner scoping broken in upcoming: {shared}"


# ---------- Backup collection inclusion ----------
class TestBackupCollections:
    def test_dealer_payment_accounts_in_backup_collections(self):
        from importlib import import_module
        import sys, os
        sys.path.insert(0, "/app/backend")
        backups = import_module("backups")
        assert "dealer_payment_accounts" in backups.BACKUP_COLLECTIONS


# ---------- teardown ----------
def teardown_module(module):
    """Best-effort cleanup of created test accounts."""
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=15,
    )
    if r.status_code != 200:
        return
    tok = r.json().get("access_token") or r.json().get("token")
    h = {"Authorization": f"Bearer {tok}"}
    for aid in _created_ids:
        try:
            requests.delete(f"{BASE_URL}/api/payment-accounts/{aid}", headers=h, timeout=10)
        except Exception:
            pass
