"""Core infrastructure for Toolbox Vault — extracted from server.py (B2).

Owns: environment loading, the Mongo client/handles, the per-request user
context + owner-scoped DB proxy, the auth dependency, and the in-process
rate limiter. Imported by server.py and (indirectly) every route module.

This module deliberately depends only on `auth` (no import of server) so it
can be imported anywhere without creating a cycle.
"""

import os
from pathlib import Path
from typing import Optional, Dict, List
from contextvars import ContextVar

from dotenv import load_dotenv
from fastapi import HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient

from auth import User, UserPublic, decode_token

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
real_db = client[os.environ['DB_NAME']]


# ---------- Per-request user context ----------
current_user_id_var: ContextVar[Optional[str]] = ContextVar("current_user_id", default=None)

# When the current user is FREE-tier with > 15 tools, this is the set of
# tool ids they're allowed to see (the 15 oldest). For PRO / lifetime users
# OR free users with <= 15 tools this stays None and the proxy applies no
# extra filter. Computed once per request in the middleware after auth.
free_visible_tool_ids_var: ContextVar[Optional[set]] = ContextVar(
    "free_visible_tool_ids", default=None,
)

# Collections that store rows referencing a tool via `tool_id`. When the
# free-tier filter is active, queries against these collections are also
# narrowed so a free user never sees a claim / maintenance entry / etc.
# tied to a hidden tool. Anything not in this set falls back to the
# normal owner_id-only scope.
TOOL_REF_COLLECTIONS = {
    "claims",
    "claim_events",
    "claim_payments",
    "maintenance",
    "maintenance_logs",
    "checkouts",
    "checkout_history",
    "warranty_claims",
    "photos",
    "documents",
    "tool_history",
    "tool_changes",
}


class _ScopedCollection:
    """Wraps a Motor collection so all queries/inserts are auto-filtered by owner_id."""

    def __init__(self, base, user_id: str, name: str = ""):
        self._base = base
        self._uid = user_id
        self._name = name

    def _scope(self, q=None):
        q = dict(q or {})
        q["owner_id"] = self._uid
        # Free-tier per-request lockdown — only applied to the `tools`
        # collection itself (id-based) and to tables that reference a
        # tool via `tool_id`. PRO users always have None here so nothing
        # changes for them.
        visible = free_visible_tool_ids_var.get()
        if visible is not None:
            if self._name == "tools":
                # Merge with any existing `id` filter the caller supplied.
                if "id" in q:
                    existing = q["id"]
                    if isinstance(existing, str):
                        if existing not in visible:
                            # Force the query to return nothing — caller asked
                            # for a specific tool that's hidden.
                            q["id"] = {"$in": []}
                    elif isinstance(existing, dict) and "$in" in existing:
                        q["id"] = {"$in": [i for i in existing["$in"] if i in visible]}
                    # else: leave more complex operators alone
                else:
                    q["id"] = {"$in": list(visible)}
            elif self._name in TOOL_REF_COLLECTIONS:
                # Same merging logic but on `tool_id` field.
                if "tool_id" in q:
                    existing = q["tool_id"]
                    if isinstance(existing, str):
                        if existing not in visible:
                            q["tool_id"] = {"$in": []}
                    elif isinstance(existing, dict) and "$in" in existing:
                        q["tool_id"] = {"$in": [i for i in existing["$in"] if i in visible]}
                else:
                    q["tool_id"] = {"$in": list(visible)}
        return q

    def find(self, q=None, *args, **kw):
        return self._base.find(self._scope(q), *args, **kw)

    async def find_one(self, q, *args, **kw):
        return await self._base.find_one(self._scope(q), *args, **kw)

    async def insert_one(self, doc):
        d = dict(doc)
        d["owner_id"] = self._uid
        return await self._base.insert_one(d)

    async def insert_many(self, docs):
        docs = [{**d, "owner_id": self._uid} for d in docs]
        return await self._base.insert_many(docs)

    async def update_one(self, q, *args, **kw):
        return await self._base.update_one(self._scope(q), *args, **kw)

    async def update_many(self, q, *args, **kw):
        return await self._base.update_many(self._scope(q), *args, **kw)

    async def delete_one(self, q):
        return await self._base.delete_one(self._scope(q))

    async def delete_many(self, q):
        return await self._base.delete_many(self._scope(q))

    async def count_documents(self, q):
        return await self._base.count_documents(self._scope(q))

    def aggregate(self, pipeline):
        match = {"owner_id": self._uid}
        visible = free_visible_tool_ids_var.get()
        if visible is not None:
            if self._name == "tools":
                match["id"] = {"$in": list(visible)}
            elif self._name in TOOL_REF_COLLECTIONS:
                match["tool_id"] = {"$in": list(visible)}
        scoped = [{"$match": match}, *list(pipeline)]
        return self._base.aggregate(scoped)


class _DBProxy:
    """Drop-in replacement for `db` that auto-scopes by current user."""

    def __getattr__(self, name):
        coll = real_db[name]
        uid = current_user_id_var.get()
        if uid:
            return _ScopedCollection(coll, uid, name=name)
        return coll

    def __getitem__(self, name):
        return self.__getattr__(name)


db = _DBProxy()


# ---------- Auth dependency / helpers ----------
async def get_current_user(request: Request) -> User:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = auth[7:].strip()
    uid = decode_token(token)
    udoc = await real_db.users.find_one({"id": uid}, {"_id": 0})
    if not udoc:
        raise HTTPException(401, "User not found")
    return User(**udoc)


def to_public(u: User) -> UserPublic:
    return UserPublic(
        id=u.id,
        email=u.email,
        name=u.name or "",
        created_at=u.created_at,
    )


PUBLIC_PATHS = ("/api/auth/", "/api/health", "/api/", "/api/feedback")


# ---------------------------------------------------------------------------
# Generic in-memory rate limiter (used by auth, AI, PDF and feedback endpoints)
# ---------------------------------------------------------------------------
# We deliberately keep this in-process and dependency-free. The data is a dict
# of dicts: { "bucket_name": { "key": [timestamp, ...] } }. "key" is whichever
# identifier we want to limit on (user_id, IP, etc).
#
# Rationale for not using slowapi/redis:
#   - Single worker today; if we scale to N workers each one will allow ~N×
#     the limit. That's acceptable for our threat model (brute force, AI cost
#     protection) and avoids the operational overhead of running Redis.
#   - Trivially testable.
_rate_limit_buckets: Dict[str, Dict[str, List[float]]] = {}


def _client_ip(request: Request) -> str:
    """Best-effort client IP, honouring X-Forwarded-For from K8s ingress."""
    xff = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return xff or (request.client.host if request.client else "unknown")


def _rate_limit(
    bucket: str,
    key: str,
    *,
    max_count: int,
    window_seconds: int,
) -> bool:
    """Return True if the request is *under* the limit (allowed),
    False if rate-limited. Caller should raise HTTPException(429) on False.
    """
    import time as _time
    now = _time.time()
    cutoff = now - window_seconds
    by_key = _rate_limit_buckets.setdefault(bucket, {})
    recent = [t for t in by_key.get(key, []) if t > cutoff]
    if len(recent) >= max_count:
        by_key[key] = recent
        return False
    recent.append(now)
    by_key[key] = recent
    return True


def _enforce_rate_limit(
    bucket: str,
    key: str,
    *,
    max_count: int,
    window_seconds: int,
    message: str,
) -> None:
    """Convenience wrapper — raises HTTPException(429) if over the limit."""
    if not _rate_limit(
        bucket,
        key,
        max_count=max_count,
        window_seconds=window_seconds,
    ):
        raise HTTPException(429, message)
