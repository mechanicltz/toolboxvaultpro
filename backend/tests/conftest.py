"""Shared pytest fixtures for the Toolbox Vault backend test suite.

Provides a single, rate-limit-safe login (`/api/auth/login` is capped at
5/min per IP) reused across every test that asks for the `api` fixture.
The token is cached on disk so repeated `pytest` runs don't re-login.

Test files that define their own `api` / `token` fixture locally keep using
their own (pytest picks the closest-scoped fixture), so this file is purely
additive and never changes existing tests.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://login-stretch-layout.preview.emergentagent.com"
).rstrip("/")

EMAIL = "ryan@ryan.com"
PASSWORD = "ryan1234"
TOKEN_CACHE = Path("/tmp/ryan_token.txt")


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session")
def token() -> str:
    """One login per session, cached on disk to dodge the 5/min login cap."""
    if TOKEN_CACHE.exists():
        cached = TOKEN_CACHE.read_text().strip()
        if cached:
            r = requests.get(
                f"{BASE_URL}/api/auth/me",
                headers={"Authorization": f"Bearer {cached}"},
                timeout=15,
            )
            if r.status_code == 200:
                return cached
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, "no token in login response"
    TOKEN_CACHE.write_text(tok)
    return tok


@pytest.fixture(scope="session")
def api(token: str) -> requests.Session:
    """An authenticated requests.Session pointed at the live backend."""
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    return s
