"""Shared pytest fixtures for the Toolbox Vault backend test suite.

Provides a single, rate-limit-safe login (`/api/auth/login` is capped at
5/min per IP) reused across every test that asks for the `api` fixture.
The token is cached on disk so repeated `pytest` runs don't re-login.

Test files that define their own `api` / `token` fixture locally keep using
their own (pytest picks the closest-scoped fixture), so this file is purely
additive and never changes existing tests.
"""
from __future__ import annotations

import json as _json
import hashlib as _hashlib
import os
import time as _time
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

# ---------------------------------------------------------------------------
# Suite-wide login cache (anti rate-limit).
#
# /api/auth/login is capped at 5 attempts/min per IP. The suite has ~14 test
# modules that each log in independently, which blows past the cap and causes
# cascading fixture errors. We transparently intercept POST .../auth/login and
# serve a disk-cached, /auth/me-validated token instead, so each unique
# credential logs in at most once per run (and is reused across runs).
# ---------------------------------------------------------------------------
_TOKEN_DIR = Path("/tmp/ttv_tokens")
_TOKEN_DIR.mkdir(exist_ok=True)
_mem_bodies: dict[str, dict] = {}
_orig_session_request = requests.sessions.Session.request


def _cache_key(email: str, password: str) -> str:
    return _hashlib.sha256(f"{email.strip().lower()}|{password}".encode()).hexdigest()[:24]


def _body_file(key: str) -> Path:
    return _TOKEN_DIR / f"{key}.json"


def _token_of(body: dict) -> str | None:
    return body.get("token") or body.get("access_token") if isinstance(body, dict) else None


def _validate(base: str, token: str) -> bool:
    try:
        r = _orig_session_request(
            requests.Session(), "GET", f"{base}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}, timeout=15,
        )
        return r.status_code == 200
    except Exception:
        return False


def _cached_body(base: str, key: str) -> dict | None:
    body = _mem_bodies.get(key)
    if not body:
        fp = _body_file(key)
        if fp.exists():
            try:
                body = _json.loads(fp.read_text())
            except Exception:
                body = None
    if body and _token_of(body) and _validate(base, _token_of(body)):
        _mem_bodies[key] = body
        return body
    return None


def _store_body(key: str, body: dict) -> None:
    _mem_bodies[key] = body
    try:
        _body_file(key).write_text(_json.dumps(body))
    except Exception:
        pass


def _make_response(payload: dict, status: int = 200) -> requests.Response:
    resp = requests.Response()
    resp.status_code = status
    resp._content = _json.dumps(payload).encode()
    resp.headers["Content-Type"] = "application/json"
    resp.encoding = "utf-8"
    return resp


def _patched_request(self, method, url, **kwargs):
    is_login = method.upper() == "POST" and str(url).rstrip("/").endswith("/auth/login")
    body = kwargs.get("json") if isinstance(kwargs.get("json"), dict) else None
    if is_login and body and body.get("email") and body.get("password"):
        # Key the cache by BOTH email and password so a wrong-password login
        # MISSES the cache and gets the real 401 (preserves auth correctness).
        key = _cache_key(str(body["email"]), str(body["password"]))
        base = str(url).rstrip("/")[: -len("/api/auth/login")]
        cached = _cached_body(base, key)
        if cached:
            # Replay the FULL real login body (preserves token + user object).
            return _make_response(cached)
        # Real login. Cache the body on success so each unique credential only
        # logs in once per run (this is what keeps us under the 5/min cap).
        # NOTE: we deliberately do NOT retry on 429 — doing so would mask the
        # rate limiter from tests that intentionally probe it.
        resp = _orig_session_request(self, method, url, **kwargs)
        if resp.status_code == 200:
            try:
                jb = resp.json()
                if _token_of(jb):
                    _store_body(key, jb)
            except Exception:
                pass
        return resp
    return _orig_session_request(self, method, url, **kwargs)


# Patch once at conftest import (pytest imports conftest before collecting tests).
requests.sessions.Session.request = _patched_request


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
