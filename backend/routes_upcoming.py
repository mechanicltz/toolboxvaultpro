"""Upcoming Features / Roadmap.

A GLOBAL (not owner-scoped) roadmap the admin publishes for ALL users. Each
release has a single target date and a list of features, every feature carrying
a status: "On The List", "Work Started" or "Completed".

- Public:  GET /api/upcoming-features  (sorted soonest date first)
- Admin:   POST/PUT/DELETE /api/admin/upcoming-features  (ADMIN_EMAILS gated)

Uses `real_db` directly (NOT the owner-scoped `db` proxy) so the roadmap is the
same for every account. Registered via register_upcoming_routes(api_router).
"""
from __future__ import annotations

import uuid
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from core import real_db, get_current_user  # type: ignore
from models import now_iso
from auth import User
from subscriptions import _require_admin

logger = logging.getLogger("routes_upcoming")

FEATURE_STATUSES = ["On The List", "Work Started", "Completed"]


class FeatureItem(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    title: str
    status: str = "On The List"


class UpcomingRelease(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    release_date: str  # ISO "YYYY-MM-DD"
    title: Optional[str] = ""
    features: List[FeatureItem] = []
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class UpcomingReleaseCreate(BaseModel):
    release_date: str
    title: Optional[str] = ""
    features: List[FeatureItem] = []


class UpcomingReleaseUpdate(BaseModel):
    release_date: Optional[str] = None
    title: Optional[str] = None
    features: Optional[List[FeatureItem]] = None


def _clean_features(features) -> List[dict]:
    out = []
    for f in features or []:
        d = f.dict() if isinstance(f, FeatureItem) else dict(f)
        status = d.get("status") or "On The List"
        if status not in FEATURE_STATUSES:
            status = "On The List"
        out.append({
            "id": d.get("id") or uuid.uuid4().hex,
            "title": (d.get("title") or "").strip(),
            "status": status,
        })
    return [f for f in out if f["title"]]


def register_upcoming_routes(api_router: APIRouter) -> None:
    coll = real_db.upcoming_releases

    @api_router.get("/upcoming-features", response_model=List[UpcomingRelease])
    async def list_upcoming():
        """Public — all releases, soonest date first."""
        docs = await coll.find({}, {"_id": 0}).to_list(500)
        docs.sort(key=lambda d: d.get("release_date") or "9999-12-31")
        return [UpcomingRelease(**d) for d in docs]

    @api_router.post("/admin/upcoming-features", response_model=UpcomingRelease)
    async def create_upcoming(
        payload: UpcomingReleaseCreate,
        user: User = Depends(get_current_user),
    ):
        _require_admin(user)
        rel = UpcomingRelease(
            release_date=(payload.release_date or "").strip(),
            title=(payload.title or "").strip(),
            features=[FeatureItem(**f) for f in _clean_features(payload.features)],
        )
        if not rel.release_date:
            raise HTTPException(400, "A release date is required")
        await coll.insert_one(rel.dict())
        return rel

    @api_router.put("/admin/upcoming-features/{rel_id}", response_model=UpcomingRelease)
    async def update_upcoming(
        rel_id: str,
        payload: UpcomingReleaseUpdate,
        user: User = Depends(get_current_user),
    ):
        _require_admin(user)
        doc = await coll.find_one({"id": rel_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Release not found")
        updates: dict = {"updated_at": now_iso()}
        if payload.release_date is not None:
            updates["release_date"] = payload.release_date.strip()
        if payload.title is not None:
            updates["title"] = payload.title.strip()
        if payload.features is not None:
            updates["features"] = _clean_features(payload.features)
        await coll.update_one({"id": rel_id}, {"$set": updates})
        new = await coll.find_one({"id": rel_id}, {"_id": 0})
        return UpcomingRelease(**new)

    @api_router.delete("/admin/upcoming-features/{rel_id}")
    async def delete_upcoming(
        rel_id: str,
        user: User = Depends(get_current_user),
    ):
        _require_admin(user)
        res = await coll.delete_one({"id": rel_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Release not found")
        return {"ok": True}
