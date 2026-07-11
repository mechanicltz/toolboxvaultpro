"""Iter85 — Backend regression for:
  1) Brand typeahead: POST /api/brands upsert + GET /api/brands returns list.
  2) Tool save auto-upserts brand (_ensure_brand_saved) so it appears in list.
  3) Dealer charge transaction: POST /api/dealers/{id}/transactions
     with account='personal'|'credit', type='charge' increases the
     respective balance, verifiable via GET /api/dealers/{id}.
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://toolbox-vault-v3.preview.emergentagent.com"
).rstrip("/")
EMAIL = "mechanicltz@gmail.com"
PASSWORD = "Blue321!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --------------------- Brands ---------------------
class TestBrands:
    def test_list_brands(self, h):
        r = requests.get(f"{BASE_URL}/api/brands", headers=h, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_brand_upsert(self, h):
        name = f"TEST_Brand_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/brands", headers=h, json={"name": name}, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["name"] == name
        # Idempotent — second call returns same brand (no duplicate)
        r2 = requests.post(f"{BASE_URL}/api/brands", headers=h, json={"name": name}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["id"] == b["id"]
        # Appears in list
        lst = requests.get(f"{BASE_URL}/api/brands", headers=h, timeout=15).json()
        assert any(x["name"] == name for x in lst)

    def test_brand_autoupsert_on_tool_save(self, h):
        """When a tool is saved with a novel brand string, it should appear in
        /api/brands (via _ensure_brand_saved in tool save path)."""
        novel = f"TEST_AutoBrand_{uuid.uuid4().hex[:6]}"
        # Create bare tool
        r = requests.post(
            f"{BASE_URL}/api/tools",
            headers=h,
            json={"name": f"TEST_ToolBrand_{uuid.uuid4().hex[:4]}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        tool = r.json()
        tid = tool["id"]
        try:
            # Update with brand
            ru = requests.put(
                f"{BASE_URL}/api/tools/{tid}",
                headers=h,
                json={"brand": novel},
                timeout=15,
            )
            assert ru.status_code == 200, ru.text
            # Poll — allow small delay
            found = False
            for _ in range(3):
                lst = requests.get(f"{BASE_URL}/api/brands", headers=h, timeout=15).json()
                if any((x.get("name") or "").lower() == novel.lower() for x in lst):
                    found = True
                    break
                time.sleep(0.5)
            assert found, f"Brand {novel} not auto-created after tool save"
        finally:
            requests.delete(f"{BASE_URL}/api/tools/{tid}", headers=h, timeout=15)


# --------------------- Dealer charge transactions ---------------------
class TestDealerChargeTx:
    @pytest.fixture(scope="class")
    def dealer_id(self, h):
        payload = {"name": f"TEST_Dealer_{uuid.uuid4().hex[:6]}"}
        r = requests.post(f"{BASE_URL}/api/dealers", headers=h, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        yield did
        requests.delete(f"{BASE_URL}/api/dealers/{did}", headers=h, timeout=15)

    def test_charge_personal_increases_balance(self, h, dealer_id):
        before = requests.get(f"{BASE_URL}/api/dealers/{dealer_id}", headers=h, timeout=15).json()
        b0 = float(before.get("personal_balance") or 0)
        r = requests.post(
            f"{BASE_URL}/api/dealers/{dealer_id}/transactions",
            headers=h,
            json={"account": "personal", "type": "charge", "amount": 25.50, "note": "TEST_charge"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert float(d["personal_balance"]) == pytest.approx(b0 + 25.50, abs=0.01)
        # Verify via GET
        g = requests.get(f"{BASE_URL}/api/dealers/{dealer_id}", headers=h, timeout=15).json()
        assert float(g["personal_balance"]) == pytest.approx(b0 + 25.50, abs=0.01)
        # Transaction persisted
        assert any(t.get("type") == "charge" and t.get("account") == "personal" for t in g.get("transactions", []))

    def test_charge_credit_increases_balance(self, h, dealer_id):
        before = requests.get(f"{BASE_URL}/api/dealers/{dealer_id}", headers=h, timeout=15).json()
        b0 = float(before.get("credit_balance") or 0)
        r = requests.post(
            f"{BASE_URL}/api/dealers/{dealer_id}/transactions",
            headers=h,
            json={"account": "credit", "type": "charge", "amount": 100.00, "note": "TEST_credit_charge"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert float(d["credit_balance"]) == pytest.approx(b0 + 100.00, abs=0.01)

    def test_reject_bad_account(self, h, dealer_id):
        r = requests.post(
            f"{BASE_URL}/api/dealers/{dealer_id}/transactions",
            headers=h,
            json={"account": "bogus", "type": "charge", "amount": 5},
            timeout=15,
        )
        assert r.status_code == 400

    def test_reject_bad_type(self, h, dealer_id):
        r = requests.post(
            f"{BASE_URL}/api/dealers/{dealer_id}/transactions",
            headers=h,
            json={"account": "personal", "type": "bogus", "amount": 5},
            timeout=15,
        )
        assert r.status_code == 400

    def test_reject_nonpositive_amount(self, h, dealer_id):
        r = requests.post(
            f"{BASE_URL}/api/dealers/{dealer_id}/transactions",
            headers=h,
            json={"account": "personal", "type": "charge", "amount": 0},
            timeout=15,
        )
        assert r.status_code == 400
