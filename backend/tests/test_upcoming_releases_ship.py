"""Regression tests for the new "ship a release" feature on Upcoming Features.

Covers:
  * POST /api/admin/upcoming-features with version, released, features[].type
  * released=true forces every feature to status "Completed"
  * PUT flipping released true<->false persists version + type
  * GET /api/upcoming-features ordering:
      unreleased soonest-date-first, then released newest-date-first
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

ADMIN_EMAIL = "mechanicltz@gmail.com"
ADMIN_PW = "Blue321!"


def _login(email: str, password: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_session():
    tok = _login(ADMIN_EMAIL, ADMIN_PW)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_ids():
    return []


# --- POST creates release with version + released + type -------------------

def test_create_released_forces_completed(admin_session, created_ids):
    payload = {
        "release_date": "2098-03-01",
        "title": f"TEST_ship_{uuid.uuid4().hex[:6]}",
        "version": "9.9.1",
        "released": True,
        "features": [
            {"title": "New tool graph", "type": "feature", "status": "On The List"},
            {"title": "Crash on iPad", "type": "fix", "status": "Work Started"},
            {"title": "Search speed", "type": "feature", "status": "Completed"},
        ],
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/upcoming-features", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    created_ids.append(data["id"])
    assert data["version"] == "9.9.1"
    assert data["released"] is True
    # Every feature auto-completed when released=True
    assert len(data["features"]) == 3
    for f in data["features"]:
        assert f["status"] == "Completed", f
    # type preserved
    types = {f["title"]: f["type"] for f in data["features"]}
    assert types["Crash on iPad"] == "fix"
    assert types["New tool graph"] == "feature"


def test_create_unreleased_keeps_statuses(admin_session, created_ids):
    payload = {
        "release_date": "2098-04-01",
        "title": f"TEST_upcoming_{uuid.uuid4().hex[:6]}",
        "version": "9.9.2",
        "released": False,
        "features": [
            {"title": "Coming feature", "type": "feature", "status": "On The List"},
            {"title": "Pending fix", "type": "fix", "status": "Work Started"},
        ],
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/upcoming-features", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    created_ids.append(data["id"])
    assert data["released"] is False
    assert data["version"] == "9.9.2"
    st = {f["title"]: f["status"] for f in data["features"]}
    assert st["Coming feature"] == "On The List"
    assert st["Pending fix"] == "Work Started"
    tp = {f["title"]: f["type"] for f in data["features"]}
    assert tp["Pending fix"] == "fix"


def test_invalid_type_defaults_to_feature(admin_session, created_ids):
    payload = {
        "release_date": "2098-05-01",
        "title": "TEST_bad_type",
        "version": "9.9.3",
        "released": False,
        "features": [{"title": "Weird", "type": "bogus"}],
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/upcoming-features", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    created_ids.append(data["id"])
    assert data["features"][0]["type"] == "feature"


# --- PUT flipping released --------------------------------------------------

def test_put_release_flag_auto_completes(admin_session, created_ids):
    """Create unreleased then flip released=True with only that flag -> statuses forced."""
    payload = {
        "release_date": "2098-06-01",
        "title": "TEST_flip",
        "version": "9.9.4",
        "released": False,
        "features": [
            {"title": "A", "type": "feature", "status": "On The List"},
            {"title": "B", "type": "fix", "status": "Work Started"},
        ],
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/upcoming-features", json=payload)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    created_ids.append(rid)

    # Flip released to True, without sending features
    r = admin_session.put(
        f"{BASE_URL}/api/admin/upcoming-features/{rid}",
        json={"released": True},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["released"] is True
    assert data["version"] == "9.9.4"
    for f in data["features"]:
        assert f["status"] == "Completed"
    # types preserved
    tp = {f["title"]: f["type"] for f in data["features"]}
    assert tp["A"] == "feature" and tp["B"] == "fix"

    # Flip back to False -> data stays (statuses stay Completed since we don't restore)
    r = admin_session.put(
        f"{BASE_URL}/api/admin/upcoming-features/{rid}",
        json={"released": False},
    )
    assert r.status_code == 200, r.text
    data2 = r.json()
    assert data2["released"] is False
    assert data2["version"] == "9.9.4"
    # Version + type still there
    tp2 = {f["title"]: f["type"] for f in data2["features"]}
    assert tp2["A"] == "feature" and tp2["B"] == "fix"
    assert len(data2["features"]) == 2


# --- Ordering: unreleased first (soonest), released last (newest first) -----

def test_ordering_unreleased_then_released_newest_first(admin_session, created_ids):
    # Add extra data points with distinct dates
    def _mk(title, date, released):
        r = admin_session.post(
            f"{BASE_URL}/api/admin/upcoming-features",
            json={
                "release_date": date,
                "title": title,
                "version": "1.2.3",
                "released": released,
                "features": [{"title": "x", "type": "feature", "status": "On The List"}],
            },
        )
        assert r.status_code == 200, r.text
        created_ids.append(r.json()["id"])
        return r.json()["id"]

    unrel_late = _mk("TEST_order_unrel_late", "2097-12-01", False)
    unrel_early = _mk("TEST_order_unrel_early", "2097-01-01", False)
    rel_new = _mk("TEST_order_rel_new", "2096-11-01", True)
    rel_old = _mk("TEST_order_rel_old", "2095-01-01", True)

    r = admin_session.get(f"{BASE_URL}/api/upcoming-features")
    assert r.status_code == 200, r.text
    items = r.json()
    ids_in_order = [x["id"] for x in items]
    # Filter to only our test releases we just added
    ours = [i for i in ids_in_order if i in {unrel_late, unrel_early, rel_new, rel_old}]
    assert ours == [unrel_early, unrel_late, rel_new, rel_old], f"unexpected order: {ours}"


# --- Cleanup (runs last) ----------------------------------------------------

def test_zz_cleanup(admin_session, created_ids):
    for rid in list(created_ids):
        r = admin_session.delete(f"{BASE_URL}/api/admin/upcoming-features/{rid}")
        assert r.status_code in (200, 404), f"cleanup {rid} -> {r.status_code} {r.text}"
    created_ids.clear()
