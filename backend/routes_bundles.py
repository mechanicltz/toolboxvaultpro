"""Bundles / Sets and their item membership.

Extracted from server.py (god-file refactor B3). Registered on the shared
api_router via register_bundle_routes(); all dependencies come from core/models/helpers so this
module never imports server (no cycle).
"""
from __future__ import annotations

import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends

from core import db, real_db, get_current_user, current_user_id_var
import media
import time
from auth import User
from helpers import _validate_photo_payload
from models import (
    now_iso, Tool,
    MaintenanceSchedule, MaintenanceScheduleCreate, MaintenanceScheduleUpdate,
    ServiceEvent, ServiceEventCreate,
    Bundle, BundleCreate, BundleUpdate,
    WarrantyClaim, WarrantyClaimUpdate,
    WishlistItem, WishlistItemCreate, WishlistItemUpdate,
)

logger = logging.getLogger("routes_bundles")


def register_bundle_routes(api_router: APIRouter) -> None:
    # ---------- Bundles / Sets ----------
    @api_router.post("/bundles", response_model=Bundle)
    async def create_bundle(payload: BundleCreate, user: User = Depends(get_current_user)):
        _validate_photo_payload(payload.photos)
        b = Bundle(**payload.dict())
        b.photos = (await media.offload_list(user.id, b.photos)) or []
        await db.bundles.insert_one(b.dict())
        return b


    @api_router.get("/bundles")
    async def list_bundles(user: User = Depends(get_current_user)):
        bundles = await db.bundles.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        for b in bundles:
            b["item_count"] = await db.tools.count_documents({"bundle_id": b["id"]})
            # keep payload slim — drop heavy photo data from the list view
            _bp = (b.get("photos") or [])
            b["photos"] = [media.thumb_url(_bp[0])] if _bp else []
        return bundles


    @api_router.get("/bundles/{bundle_id}")
    async def get_bundle(bundle_id: str, user: User = Depends(get_current_user)):
        b = await db.bundles.find_one({"id": bundle_id}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Bundle not found")
        items = await db.tools.find({"bundle_id": bundle_id}, {"_id": 0}).sort("created_at", -1).to_list(2000)
        for i in items:
            photos = i.get("photos") or []
            i["photos"] = [media.thumb_url(photos[0])] if photos else []
            i["documents"] = []
            i["receipts"] = []
        b["items"] = [Tool(**i).dict() for i in items]
        return b


    @api_router.put("/bundles/{bundle_id}", response_model=Bundle)
    async def update_bundle(bundle_id: str, payload: BundleUpdate, user: User = Depends(get_current_user)):
        if payload.photos is not None:
            _validate_photo_payload(payload.photos)
        doc = await db.bundles.find_one({"id": bundle_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Bundle not found")
        updates = payload.dict(exclude_unset=True)
        updates["updated_at"] = now_iso()
        if "photos" in updates:
            updates["photos"] = (await media.offload_list(doc.get("owner_id") or "", updates["photos"])) or []
        await db.bundles.update_one({"id": bundle_id}, {"$set": updates})
        new = await db.bundles.find_one({"id": bundle_id}, {"_id": 0})
        return Bundle(**new)


    @api_router.delete("/bundles/{bundle_id}")
    async def delete_bundle(bundle_id: str, user: User = Depends(get_current_user)):
        """Delete a bundle AND every item inside it (cascade, per product spec)."""
        b = await db.bundles.find_one({"id": bundle_id}, {"_id": 0, "id": 1})
        if not b:
            raise HTTPException(404, "Bundle not found")
        item_docs = await db.tools.find({"bundle_id": bundle_id}, {"_id": 0, "id": 1}).to_list(2000)
        item_ids = [t["id"] for t in item_docs]
        if item_ids:
            await db.tools.delete_many({"bundle_id": bundle_id})
            await db.warranty_claims.delete_many({"tool_id": {"$in": item_ids}})
        await db.bundles.delete_one({"id": bundle_id})
        return {"ok": True, "deleted_items": len(item_ids)}


    @api_router.post("/bundles/{bundle_id}/items/{tool_id}", response_model=Tool)
    async def add_item_to_bundle(bundle_id: str, tool_id: str, user: User = Depends(get_current_user)):
        b = await db.bundles.find_one({"id": bundle_id}, {"_id": 0, "id": 1})
        if not b:
            raise HTTPException(404, "Bundle not found")
        res = await db.tools.update_one(
            {"id": tool_id}, {"$set": {"bundle_id": bundle_id, "updated_at": now_iso()}}
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Tool not found")
        doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        return Tool(**doc)


    @api_router.delete("/bundles/{bundle_id}/items/{tool_id}", response_model=Tool)
    async def remove_item_from_bundle(bundle_id: str, tool_id: str, user: User = Depends(get_current_user)):
        res = await db.tools.update_one(
            {"id": tool_id, "bundle_id": bundle_id}, {"$set": {"bundle_id": None, "updated_at": now_iso()}}
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Item not found in this bundle")
        doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        return Tool(**doc)

