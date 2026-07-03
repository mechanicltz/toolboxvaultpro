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
FEATURE_TYPES = ["feature", "fix"]


class FeatureItem(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    title: str
    description: Optional[str] = ""
    status: str = "On The List"
    type: str = "feature"  # "feature" | "fix"


class UpcomingRelease(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    release_date: str  # ISO "YYYY-MM-DD"
    title: Optional[str] = ""
    version: Optional[str] = ""      # e.g. "3.1.6" — the app version that ships these
    released: bool = False           # admin flag: this version is live & available to update to
    features: List[FeatureItem] = []
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class UpcomingReleaseCreate(BaseModel):
    release_date: str
    title: Optional[str] = ""
    version: Optional[str] = ""
    released: Optional[bool] = False
    features: List[FeatureItem] = []


class UpcomingReleaseUpdate(BaseModel):
    release_date: Optional[str] = None
    title: Optional[str] = None
    version: Optional[str] = None
    released: Optional[bool] = None
    features: Optional[List[FeatureItem]] = None


def _clean_features(features, *, force_completed: bool = False) -> List[dict]:
    out = []
    for f in features or []:
        d = f.dict() if isinstance(f, FeatureItem) else dict(f)
        status = d.get("status") or "On The List"
        if status not in FEATURE_STATUSES:
            status = "On The List"
        if force_completed:
            status = "Completed"
        ftype = d.get("type") or "feature"
        if ftype not in FEATURE_TYPES:
            ftype = "feature"
        out.append({
            "id": d.get("id") or uuid.uuid4().hex,
            "title": (d.get("title") or "").strip(),
            "description": (d.get("description") or "").strip(),
            "status": status,
            "type": ftype,
        })
    return [f for f in out if f["title"]]


def register_upcoming_routes(api_router: APIRouter) -> None:
    coll = real_db.upcoming_releases

    @api_router.get("/upcoming-features", response_model=List[UpcomingRelease])
    async def list_upcoming():
        """Public — upcoming (unreleased) soonest-first at the top, then shipped
        releases newest-first below so users can scroll back through history."""
        docs = await coll.find({}, {"_id": 0}).to_list(500)
        unreleased = [d for d in docs if not d.get("released")]
        released = [d for d in docs if d.get("released")]
        unreleased.sort(key=lambda d: d.get("release_date") or "9999-12-31")
        released.sort(key=lambda d: d.get("release_date") or "0000-01-01", reverse=True)
        return [UpcomingRelease(**d) for d in (unreleased + released)]

    @api_router.post("/admin/upcoming-features", response_model=UpcomingRelease)
    async def create_upcoming(
        payload: UpcomingReleaseCreate,
        user: User = Depends(get_current_user),
    ):
        _require_admin(user)
        released = bool(payload.released)
        rel = UpcomingRelease(
            release_date=(payload.release_date or "").strip(),
            title=(payload.title or "").strip(),
            version=(payload.version or "").strip(),
            released=released,
            features=[FeatureItem(**f) for f in _clean_features(payload.features, force_completed=released)],
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
        if payload.version is not None:
            updates["version"] = payload.version.strip()
        # Determine the effective "released" state for this update.
        released = doc.get("released", False)
        if payload.released is not None:
            released = bool(payload.released)
            updates["released"] = released
        # When a release is marked available, auto-complete all of its fixes.
        if payload.features is not None:
            updates["features"] = _clean_features(payload.features, force_completed=released)
        elif payload.released is True:
            updates["features"] = _clean_features(doc.get("features"), force_completed=True)
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
