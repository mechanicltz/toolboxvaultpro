"""Bundles / Sets and their item membership.

Extracted from server.py (god-file refactor B3). Registered on the shared
api_router via register_bundle_routes(); all dependencies come from core/models/helpers so this
module never imports server (no cycle).
"""
from __future__ import annotations

import logging
from typing import List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends

from core import db, get_current_user
import media
from auth import User
from models import (
    now_iso, Tool,
    InsideItem, InsideItemCreate, InsideItemUpdate,
)

logger = logging.getLogger("routes_bundles")


def register_bundle_routes(api_router: APIRouter) -> None:
    # NOTE: legacy /bundles CRUD (db.bundles collection) removed in the v3.2
    # cleanup. A Set is now simply a tool with is_bundle=True (see below).

    # ======================================================================
    # NEW bundle model (v3.2): a bundle IS a tool (is_bundle=True). It holds
    # `inside_items` (lightweight sub-items) + linked `expansion` items.
    # ======================================================================
    async def _get_bundle_tool(bundle_id: str) -> Dict[str, Any]:
        doc = await db.tools.find_one({"id": bundle_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Bundle not found")
        if not doc.get("is_bundle"):
            raise HTTPException(400, "That item is not a bundle")
        return doc

    @api_router.post("/tools/{bundle_id}/inside-items", response_model=Tool)
    async def add_inside_item(bundle_id: str, payload: InsideItemCreate, user: User = Depends(get_current_user)):
        await _get_bundle_tool(bundle_id)
        item = InsideItem(**payload.dict())
        if item.photo:
            item.photo = await media.offload_value(user.id, item.photo)
        await db.tools.update_one(
            {"id": bundle_id},
            {"$push": {"inside_items": item.dict()}, "$set": {"updated_at": now_iso()}},
        )
        doc = await db.tools.find_one({"id": bundle_id}, {"_id": 0})
        return Tool(**doc)

    @api_router.put("/tools/{bundle_id}/inside-items/{item_id}", response_model=Tool)
    async def update_inside_item(bundle_id: str, item_id: str, payload: InsideItemUpdate, user: User = Depends(get_current_user)):
        doc = await _get_bundle_tool(bundle_id)
        items = doc.get("inside_items") or []
        found = False
        for s in items:
            if s.get("id") == item_id:
                upd = payload.dict(exclude_unset=True)
                if "photo" in upd and upd["photo"]:
                    upd["photo"] = await media.offload_value(user.id, upd["photo"])
                s.update(upd)
                found = True
                break
        if not found:
            raise HTTPException(404, "Inside item not found")
        await db.tools.update_one({"id": bundle_id}, {"$set": {"inside_items": items, "updated_at": now_iso()}})
        new = await db.tools.find_one({"id": bundle_id}, {"_id": 0})
        return Tool(**new)

    @api_router.delete("/tools/{bundle_id}/inside-items/{item_id}", response_model=Tool)
    async def delete_inside_item(bundle_id: str, item_id: str, user: User = Depends(get_current_user)):
        await _get_bundle_tool(bundle_id)
        await db.tools.update_one(
            {"id": bundle_id},
            {"$pull": {"inside_items": {"id": item_id}}, "$set": {"updated_at": now_iso()}},
        )
        new = await db.tools.find_one({"id": bundle_id}, {"_id": 0})
        return Tool(**new)

    @api_router.post("/tools/{bundle_id}/absorb/{tool_id}", response_model=Tool)
    async def absorb_tool_into_bundle(bundle_id: str, tool_id: str, user: User = Depends(get_current_user)):
        """Move an existing standalone inventory tool INTO this set as an inside
        item, preserving its name / model / price / cover photo, then delete the
        standalone tool. The cover photo URL is transferred (NOT deleted) so it
        keeps rendering inside the set; the tool's extra media + warranty claims
        are cleaned up."""
        await _get_bundle_tool(bundle_id)
        if tool_id == bundle_id:
            raise HTTPException(400, "A set cannot absorb itself")
        tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not tool:
            raise HTTPException(404, "Tool not found")
        if tool.get("is_bundle"):
            raise HTTPException(400, "Cannot add a set inside another set")
        photos = tool.get("photos") or []
        model = (tool.get("model") or "").strip() or ((tool.get("model_numbers") or [None])[0] or "")
        item = InsideItem(
            name=tool.get("name") or "Item",
            model=model or "",
            cost=float(tool.get("cost") or 0),
            photo=(photos[0] if photos else "") or "",
        )
        await db.tools.update_one(
            {"id": bundle_id},
            {"$push": {"inside_items": item.dict()}, "$set": {"updated_at": now_iso()}},
        )
        res = await db.tools.delete_one({"id": tool_id})
        if res.deleted_count:
            # Keep photos[0] (now owned by the inside item); drop the rest.
            await media.delete_values(photos[1:] if len(photos) > 1 else [])
            await media.delete_values(tool.get("receipts"))
            await media.delete_values(tool.get("documents"))
            await db.warranty_claims.delete_many({"tool_id": tool_id})
        doc = await db.tools.find_one({"id": bundle_id}, {"_id": 0})
        return Tool(**doc)

    @api_router.get("/tools/{bundle_id}/expansion-items", response_model=List[Tool])
    async def list_expansion_items(bundle_id: str, user: User = Depends(get_current_user)):
        items = await db.tools.find({"expansion_of": bundle_id}, {"_id": 0}).sort("created_at", -1).to_list(2000)
        out: List[Tool] = []
        for i in items:
            photos = i.get("photos") or []
            i["photos"] = [media.thumb_url(photos[0])] if photos else []
            i["documents"] = []
            i["receipts"] = []
            out.append(Tool(**i))
        return out

    @api_router.post("/tools/{bundle_id}/expansion/{tool_id}", response_model=Tool)
    async def link_expansion_item(bundle_id: str, tool_id: str, user: User = Depends(get_current_user)):
        await _get_bundle_tool(bundle_id)
        if tool_id == bundle_id:
            raise HTTPException(400, "A bundle cannot be its own expansion item")
        res = await db.tools.update_one(
            {"id": tool_id}, {"$set": {"expansion_of": bundle_id, "updated_at": now_iso()}}
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Tool not found")
        doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        return Tool(**doc)

    @api_router.delete("/tools/{bundle_id}/expansion/{tool_id}", response_model=Tool)
    async def unlink_expansion_item(bundle_id: str, tool_id: str, user: User = Depends(get_current_user)):
        res = await db.tools.update_one(
            {"id": tool_id, "expansion_of": bundle_id}, {"$set": {"expansion_of": None, "updated_at": now_iso()}}
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Expansion item not found for this bundle")
        doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        return Tool(**doc)

    @api_router.post("/bundles/migrate-to-tools")
    async def migrate_bundles_to_tools(user: User = Depends(get_current_user)):
        """Non-destructive upgrade for users who created bundles on the OLD
        system (separate `bundles` collection + child tools via bundle_id).

        Each old bundle becomes a bundle-tool (is_bundle=True, reusing its id).
        Its old child tools are PRESERVED and re-linked as expansion items
        (expansion_of) so no inventory data is lost. Idempotent: re-running
        skips bundles already converted.
        """
        old_bundles = await db.bundles.find({}, {"_id": 0}).to_list(2000)
        converted = 0
        relinked = 0
        for b in old_bundles:
            bid = b.get("id")
            if not bid:
                continue
            existing = await db.tools.find_one({"id": bid}, {"_id": 0, "id": 1, "is_bundle": 1})
            if existing and existing.get("is_bundle"):
                continue  # already migrated
            part = (b.get("part_number") or "").strip()
            bundle_tool = Tool(
                id=bid,
                name=b.get("name") or "Bundle",
                description=b.get("notes") or "",
                model=part,
                serial_number=part,
                model_numbers=[part] if part else [],
                is_bundle=True,
                cost=float(b.get("set_price") or 0),
                photos=b.get("photos") or [],
                inside_items=[],
                created_at=b.get("created_at") or now_iso(),
            )
            await db.tools.insert_one(bundle_tool.dict())
            converted += 1
            # Re-link old child tools as expansion items (preserve their data).
            r = await db.tools.update_many(
                {"bundle_id": bid, "id": {"$ne": bid}},
                {"$set": {"expansion_of": bid, "bundle_id": None, "updated_at": now_iso()}},
            )
            relinked += r.modified_count
        return {"ok": True, "bundles_converted": converted, "items_relinked": relinked}


