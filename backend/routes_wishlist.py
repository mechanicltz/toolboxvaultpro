"""Wishlist items and convert-to-tool.

Extracted from server.py (god-file refactor B3). Registered on the shared
api_router via register_wishlist_routes(); all dependencies come from core/models/helpers so this
module never imports server (no cycle).
"""
from __future__ import annotations

import logging
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends

from core import db, real_db, get_current_user, current_user_id_var
import media
from auth import User
from models import (
    now_iso, Tool,
    WishlistItem, WishlistItemCreate, WishlistItemUpdate,
)

logger = logging.getLogger("routes_wishlist")


def register_wishlist_routes(api_router: APIRouter) -> None:
    # ---------- Wishlist ----------
    @api_router.get("/wishlist", response_model=List[WishlistItem])
    async def list_wishlist(purchased: Optional[bool] = None):
        q: Dict[str, Any] = {}
        if purchased is not None:
            q["purchased"] = purchased
        items = await db.wishlist_items.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
        return [WishlistItem(**i) for i in items]


    @api_router.post("/wishlist", response_model=WishlistItem)
    async def create_wishlist(payload: WishlistItemCreate):
        item = WishlistItem(**payload.dict())
        if item.dealer_id and not item.dealer_name:
            d = await db.dealers.find_one({"id": item.dealer_id}, {"_id": 0, "name": 1})
            if d:
                item.dealer_name = d.get("name") or ""
        item.photos = (await media.offload_list(current_user_id_var.get(None) or "", item.photos)) or []
        await db.wishlist_items.insert_one(item.dict())
        return item


    @api_router.put("/wishlist/{item_id}", response_model=WishlistItem)
    async def update_wishlist(item_id: str, payload: WishlistItemUpdate):
        doc = await db.wishlist_items.find_one({"id": item_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Wishlist item not found")
        updates = {k: v for k, v in payload.dict().items() if v is not None}
        updates["updated_at"] = now_iso()
        if "dealer_id" in updates and updates["dealer_id"]:
            d = await db.dealers.find_one({"id": updates["dealer_id"]}, {"_id": 0, "name": 1})
            if d:
                updates["dealer_name"] = d.get("name") or ""
        if "photos" in updates:
            updates["photos"] = (await media.offload_list(doc.get("owner_id") or "", updates["photos"])) or []
        if updates.get("purchased") is True and not doc.get("purchased"):
            updates["purchased_at"] = now_iso()
        elif updates.get("purchased") is False:
            updates["purchased_at"] = None
            updates["converted_tool_id"] = None
        await db.wishlist_items.update_one({"id": item_id}, {"$set": updates})
        new = await db.wishlist_items.find_one({"id": item_id}, {"_id": 0})
        return WishlistItem(**new)


    @api_router.delete("/wishlist/{item_id}")
    async def delete_wishlist(item_id: str):
        res = await db.wishlist_items.delete_one({"id": item_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Wishlist item not found")
        return {"ok": True}


    @api_router.post("/wishlist/{item_id}/convert", response_model=Tool)
    async def convert_wishlist_to_tool(item_id: str, user: User = Depends(get_current_user)):
        """Convert a wishlist item into a real tool — marks as purchased."""
        item = await db.wishlist_items.find_one({"id": item_id}, {"_id": 0})
        if not item:
            raise HTTPException(404, "Wishlist item not found")
        # Free-tier 15-item limit. Pro / lifetime users always pass.
        from subscriptions import enforce_tool_limit  # local import to avoid cycles
        await enforce_tool_limit(real_db, user.id)
        tool = Tool(
            name=item.get("name", ""),
            description=item.get("description", "") or "",
            cost=item.get("price") or 0,
            dealer_id=item.get("dealer_id"),
            dealer_name=item.get("dealer_name") or "",
            # Carry through optional details captured on the wish so the
            # user doesn't have to re-enter them when finishing the tool.
            model=item.get("model_number", "") or "",
            photos=list(item.get("photos") or []),
            # Drop notes onto the description so we don't silently lose them.
            # If the user had both a description and notes, append the notes
            # on a new line. If only notes existed, that becomes the description.
            # (We do this in code rather than at the DB level so the wishlist
            # row still keeps its own notes/description fields intact.)
        )
        # Merge notes → description if both present (keep description first).
        extra_notes = (item.get("notes") or "").strip()
        if extra_notes:
            if tool.description:
                tool.description = f"{tool.description}\n\n{extra_notes}"
            else:
                tool.description = extra_notes
        await db.tools.insert_one(tool.dict())
        await db.wishlist_items.update_one(
            {"id": item_id},
            {"$set": {"purchased": True, "purchased_at": now_iso(), "converted_tool_id": tool.id, "updated_at": now_iso()}},
        )
        return tool

