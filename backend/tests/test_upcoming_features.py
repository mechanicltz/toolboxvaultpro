"""Tests for the Upcoming Features (roadmap) endpoints.

Backend exposes:
  GET    /api/upcoming-features                       (any logged-in user)
  POST   /api/admin/upcoming-features                 (admin only)
  PUT    /api/admin/upcoming-features/{id}            (admin only)
  DELETE /api/admin/upcoming-features/{id}            (admin only)

Global collection (not owner-scoped).
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
RYAN_EMAIL = "ryan@ryan.com"
RYAN_PW = "ryan1234"


def _login(email: str, password: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_session() -> requests.Session:
    tok = _login(ADMIN_EMAIL, ADMIN_PW)
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {tok}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="module")
def user_session() -> requests.Session:
    tok = _login(RYAN_EMAIL, RYAN_PW)
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {tok}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="module")
def created_releases() -> list[str]:
    return []


# -- Auth gating ------------------------------------------------------------

def test_create_requires_admin(user_session: requests.Session):
    r = user_session.post(
        f"{BASE_URL}/api/admin/upcoming-features",
        json={"release_date": "2099-01-01", "title": "TEST_unauthorized", "features": []},
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


def test_delete_requires_admin(user_session: requests.Session):
    r = user_session.delete(f"{BASE_URL}/api/admin/upcoming-features/nonexistent")
    assert r.status_code == 403


def test_update_requires_admin(user_session: requests.Session):
    r = user_session.put(
        f"{BASE_URL}/api/admin/upcoming-features/nonexistent",
        json={"title": "x"},
    )
    assert r.status_code == 403


# -- CRUD as admin ----------------------------------------------------------

def test_admin_create_release(admin_session: requests.Session, created_releases: list[str]):
    payload = {
        "release_date": "2099-06-15",
        "title": f"TEST_{uuid.uuid4().hex[:6]} release",
        "features": [
            {"title": "Dark mode", "status": "On The List"},
            {"title": "Faster sync", "status": "Work Started"},
            {"title": "Reports v2", "status": "Completed"},
        ],
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/upcoming-features", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["release_date"] == "2099-06-15"
    assert data["title"] == payload["title"]
    assert len(data["features"]) == 3
    assert {f["status"] for f in data["features"]} == {"On The List", "Work Started", "Completed"}
    assert "id" in data
    created_releases.append(data["id"])


def test_create_with_descriptions_persists(admin_session: requests.Session, user_session: requests.Session, created_releases: list[str]):
    """NEW: each feature now carries an optional description. Verify POST + GET round-trip."""
    payload = {
        "release_date": "2099-08-20",
        "title": "TEST_desc_release",
        "features": [
            {"title": "Cloud sync", "description": "Backup tools to the cloud automatically.", "status": "On The List"},
            {"title": "PDF export", "description": "", "status": "Work Started"},
            {"title": "Multi-user", "description": "Share toolboxes with crew members.", "status": "Completed"},
        ],
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/upcoming-features", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    created_releases.append(data["id"])
    by_title = {f["title"]: f for f in data["features"]}
    assert by_title["Cloud sync"]["description"] == "Backup tools to the cloud automatically."
    assert by_title["PDF export"]["description"] == ""
    assert by_title["Multi-user"]["description"] == "Share toolboxes with crew members."

    # Re-fetch through the public list to confirm DB persistence
    r2 = user_session.get(f"{BASE_URL}/api/upcoming-features")
    assert r2.status_code == 200
    match = next((x for x in r2.json() if x["id"] == data["id"]), None)
    assert match is not None
    by_title2 = {f["title"]: f for f in match["features"]}
    assert by_title2["Cloud sync"]["description"] == "Backup tools to the cloud automatically."
    assert by_title2["Multi-user"]["description"] == "Share toolboxes with crew members."


def test_update_changes_description(admin_session: requests.Session, created_releases: list[str]):
    """Editing a release must update the per-feature description in place."""
    # Find the description release we just created
    rid = None
    r = admin_session.get(f"{BASE_URL}/api/upcoming-features")
    for x in r.json():
        if x.get("title") == "TEST_desc_release":
            rid = x["id"]
            break
    assert rid, "TEST_desc_release not found; create test must run first"

    r = admin_session.put(
        f"{BASE_URL}/api/admin/upcoming-features/{rid}",
        json={
            "features": [
                {"title": "Cloud sync", "description": "UPDATED description text.", "status": "Completed"},
            ],
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["features"]) == 1
    assert data["features"][0]["description"] == "UPDATED description text."
    assert data["features"][0]["status"] == "Completed"


def test_status_validation_and_empty_titles(admin_session: requests.Session, created_releases: list[str]):
    payload = {
        "release_date": "2099-07-01",
        "title": "TEST_status_validation",
        "features": [
            {"title": "Valid feature", "status": "BogusStatus"},   # -> defaulted
            {"title": "", "status": "Completed"},                  # -> dropped
            {"title": "   ", "status": "Work Started"},            # -> dropped
            {"title": "Lowercase status", "status": "work started"},  # -> defaulted
        ],
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/upcoming-features", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    created_releases.append(data["id"])
    titles = [f["title"] for f in data["features"]]
    # Empty / whitespace-only ones dropped
    assert "" not in titles and "   " not in titles
    assert len(data["features"]) == 2
    for f in data["features"]:
        assert f["status"] == "On The List", f


def test_list_sorted_soonest_first(admin_session: requests.Session, user_session: requests.Session, created_releases: list[str]):
    # Add a third with an earlier date so we can test sort.
    r = admin_session.post(
        f"{BASE_URL}/api/admin/upcoming-features",
        json={
            "release_date": "2099-02-01",
            "title": "TEST_earliest",
            "features": [{"title": "Early feature", "status": "On The List"}],
        },
    )
    assert r.status_code == 200, r.text
    created_releases.append(r.json()["id"])

    # Any logged-in user can list. Use the non-admin to prove non-admin GET works.
    r = user_session.get(f"{BASE_URL}/api/upcoming-features")
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list)
    test_items = [x for x in items if (x.get("title") or "").startswith("TEST_")]
    assert len(test_items) >= 3
    dates = [x["release_date"] for x in items]
    assert dates == sorted(dates), f"not sorted ascending: {dates}"


def test_admin_update_release(admin_session: requests.Session, created_releases: list[str]):
    assert created_releases, "create test must run before update"
    rid = created_releases[0]
    new_title = "TEST_updated_title"
    r = admin_session.put(
        f"{BASE_URL}/api/admin/upcoming-features/{rid}",
        json={
            "title": new_title,
            "release_date": "2099-12-31",
            "features": [{"title": "Single new feature", "status": "Completed"}],
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["title"] == new_title
    assert data["release_date"] == "2099-12-31"
    assert len(data["features"]) == 1
    assert data["features"][0]["status"] == "Completed"

    # Verify persistence with a fresh GET.
    r2 = admin_session.get(f"{BASE_URL}/api/upcoming-features")
    assert r2.status_code == 200
    match = next((x for x in r2.json() if x["id"] == rid), None)
    assert match is not None
    assert match["title"] == new_title
    assert match["release_date"] == "2099-12-31"


def test_update_missing_release_404(admin_session: requests.Session):
    r = admin_session.put(
        f"{BASE_URL}/api/admin/upcoming-features/does-not-exist-{uuid.uuid4().hex}",
        json={"title": "nope"},
    )
    assert r.status_code == 404


def test_create_without_date_rejected(admin_session: requests.Session):
    r = admin_session.post(
        f"{BASE_URL}/api/admin/upcoming-features",
        json={"release_date": "", "title": "no date", "features": []},
    )
    assert r.status_code == 400


def test_zz_admin_delete_releases(admin_session: requests.Session, created_releases: list[str]):
    """Run last (zz_) to clean up everything created by this module."""
    for rid in list(created_releases):
        r = admin_session.delete(f"{BASE_URL}/api/admin/upcoming-features/{rid}")
        assert r.status_code == 200, f"delete {rid} -> {r.status_code} {r.text}"
    # Verify they're gone
    r = admin_session.get(f"{BASE_URL}/api/upcoming-features")
    remaining_ids = {x["id"] for x in r.json()}
    for rid in created_releases:
        assert rid not in remaining_ids
    # Delete again -> 404
    if created_releases:
        r2 = admin_session.delete(f"{BASE_URL}/api/admin/upcoming-features/{created_releases[0]}")
        assert r2.status_code == 404
    created_releases.clear()
