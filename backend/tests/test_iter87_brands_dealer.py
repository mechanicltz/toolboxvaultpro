"""Iter87 — Verify (1) POST /api/dealers auto-adds a brand entry matching the
dealer name, (2) PUT /api/brands/{id} renames a brand and rejects duplicates
(400). All calls hit the public EXPO_PUBLIC_BACKEND_URL / EXPO_BACKEND_URL
so we're testing what the mobile client sees.
"""

import os
import time
import uuid

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
).rstrip("/")

# Pro account (no 15-tool free limit — needed if we ever touch tools)
LOGIN_EMAIL = "mechanicltz@gmail.com"
LOGIN_PASSWORD = "Blue321!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Auth once for the module — /api/auth/login is 5/min/IP
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in login response: {r.text[:200]}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ---------- (1) Dealer -> Brand auto-add ----------

class TestDealerAutoBrand:
    def test_create_dealer_auto_adds_brand(self, session):
        uniq = f"ZZITER87_{uuid.uuid4().hex[:6].upper()}"
        # Confirm not already present
        r0 = session.get(f"{BASE_URL}/api/brands", timeout=15)
        assert r0.status_code == 200
        names_before = {b["name"] for b in r0.json()}
        assert uniq not in names_before

        # Create dealer
        r1 = session.post(
            f"{BASE_URL}/api/dealers", json={"name": uniq}, timeout=15,
        )
        assert r1.status_code == 200, r1.text
        dealer = r1.json()
        assert dealer["name"] == uniq
        dealer_id = dealer["id"]

        # Brand should now include the dealer name
        r2 = session.get(f"{BASE_URL}/api/brands", timeout=15)
        assert r2.status_code == 200
        brands = r2.json()
        names_after = {b["name"] for b in brands}
        assert uniq in names_after, (
            f"Dealer '{uniq}' was NOT auto-added to /api/brands. "
            f"names_after sample={list(names_after)[:10]}"
        )

        # Cleanup: delete brand + dealer
        brand_id = next(b["id"] for b in brands if b["name"] == uniq)
        session.delete(f"{BASE_URL}/api/brands/{brand_id}", timeout=15)
        session.delete(f"{BASE_URL}/api/dealers/{dealer_id}", timeout=15)

    def test_create_dealer_idempotent_when_brand_exists(self, session):
        """If the brand already exists (case-insensitive), _ensure_brand_saved
        should be a no-op (no duplicate row)."""
        uniq = f"ZZITER87DUP_{uuid.uuid4().hex[:6].upper()}"
        # Pre-create the brand
        rb = session.post(f"{BASE_URL}/api/brands", json={"name": uniq}, timeout=15)
        assert rb.status_code == 200
        brand_id = rb.json()["id"]

        # Now create a dealer with the same name
        rd = session.post(f"{BASE_URL}/api/dealers", json={"name": uniq}, timeout=15)
        assert rd.status_code == 200
        dealer_id = rd.json()["id"]

        # Verify exactly ONE brand row still exists (case-insensitive)
        rl = session.get(f"{BASE_URL}/api/brands", timeout=15)
        assert rl.status_code == 200
        matches = [b for b in rl.json() if b["name"].lower() == uniq.lower()]
        assert len(matches) == 1, f"Expected 1 brand row, got {len(matches)}: {matches}"

        # cleanup
        session.delete(f"{BASE_URL}/api/brands/{brand_id}", timeout=15)
        session.delete(f"{BASE_URL}/api/dealers/{dealer_id}", timeout=15)


# ---------- (2) PUT /api/brands/{id} — rename + duplicate rejection ----------

class TestBrandsRename:
    def test_put_brand_rename_success(self, session):
        original = f"ZZITER87A_{uuid.uuid4().hex[:6].upper()}"
        renamed = f"ZZITER87B_{uuid.uuid4().hex[:6].upper()}"
        rc = session.post(f"{BASE_URL}/api/brands", json={"name": original}, timeout=15)
        assert rc.status_code == 200
        bid = rc.json()["id"]
        assert rc.json()["name"] == original

        # rename
        ru = session.put(
            f"{BASE_URL}/api/brands/{bid}", json={"name": renamed}, timeout=15,
        )
        assert ru.status_code == 200, ru.text
        assert ru.json()["name"] == renamed
        assert ru.json()["id"] == bid

        # GET verify persistence
        rl = session.get(f"{BASE_URL}/api/brands", timeout=15)
        names = {b["id"]: b["name"] for b in rl.json()}
        assert names.get(bid) == renamed

        # cleanup
        session.delete(f"{BASE_URL}/api/brands/{bid}", timeout=15)

    def test_put_brand_rejects_duplicate_name(self, session):
        a = f"ZZITER87X_{uuid.uuid4().hex[:6].upper()}"
        b = f"ZZITER87Y_{uuid.uuid4().hex[:6].upper()}"
        ra = session.post(f"{BASE_URL}/api/brands", json={"name": a}, timeout=15)
        rb = session.post(f"{BASE_URL}/api/brands", json={"name": b}, timeout=15)
        aid = ra.json()["id"]
        bid = rb.json()["id"]

        # attempt to rename b -> a (already exists)
        r = session.put(
            f"{BASE_URL}/api/brands/{bid}", json={"name": a}, timeout=15,
        )
        assert r.status_code == 400, (
            f"Duplicate rename should 400, got {r.status_code}: {r.text[:200]}"
        )

        # Case-insensitive duplicate check too
        r2 = session.put(
            f"{BASE_URL}/api/brands/{bid}", json={"name": a.lower()}, timeout=15,
        )
        assert r2.status_code == 400, (
            f"Case-insensitive duplicate should 400, got {r2.status_code}"
        )

        # cleanup
        session.delete(f"{BASE_URL}/api/brands/{aid}", timeout=15)
        session.delete(f"{BASE_URL}/api/brands/{bid}", timeout=15)

    def test_put_brand_404_for_missing(self, session):
        r = session.put(
            f"{BASE_URL}/api/brands/does-not-exist-{uuid.uuid4().hex}",
            json={"name": "Whatever"},
            timeout=15,
        )
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text[:200]}"

    def test_put_brand_empty_name_400(self, session):
        rc = session.post(
            f"{BASE_URL}/api/brands",
            json={"name": f"ZZITER87E_{uuid.uuid4().hex[:6]}"},
            timeout=15,
        )
        bid = rc.json()["id"]
        r = session.put(f"{BASE_URL}/api/brands/{bid}", json={"name": "   "}, timeout=15)
        assert r.status_code == 400, f"Expected 400 for empty name, got {r.status_code}"
        session.delete(f"{BASE_URL}/api/brands/{bid}", timeout=15)
