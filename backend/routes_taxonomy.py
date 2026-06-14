"""Taxonomy CRUD routes — locations, tags, brands, categories, borrowers.

Extracted from server.py (god-file refactor B3). Routes are registered on the
shared api_router via register_taxonomy_routes(); the module imports its
dependencies from core/models so it never imports server (no cycle).
"""

import re
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException

from core import db
from models import (
    Location, LocationCreate, LocationUpdate,
    Tag, TagCreate, Category, CategoryCreate,
    Brand, BrandCreate, Borrower, BorrowerCreate,
)


async def _ensure_brand_saved(brand_name: Optional[str]):
    """Idempotent upsert — call after a tool save so any new brand string
    is immediately available in the typeahead for future tool entries."""
    name = (brand_name or "").strip()
    if not name:
        return
    existing = await db.brands.find_one(
        {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}, {"_id": 0}
    )
    if existing:
        return
    b = Brand(name=name)
    await db.brands.insert_one(b.dict())


def register_taxonomy_routes(api_router: APIRouter) -> None:
    # ---------- Locations ----------
    @api_router.post("/locations", response_model=Location)
    async def create_location(payload: LocationCreate):
        loc = Location(**payload.dict())
        await db.locations.insert_one(loc.dict())
        return loc


    @api_router.get("/locations", response_model=List[Location])
    async def list_locations():
        items = await db.locations.find({}, {"_id": 0}).to_list(2000)
        return [Location(**i) for i in items]


    @api_router.put("/locations/{loc_id}", response_model=Location)
    async def update_location(loc_id: str, payload: LocationUpdate):
        doc = await db.locations.find_one({"id": loc_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Location not found")
        # Build updates preserving explicit null for parent_id (to move to root)
        raw = payload.dict(exclude_unset=True)
        updates = {}
        for k, v in raw.items():
            if k == "parent_id":
                updates[k] = v  # keep None for root move
            elif v is not None:
                updates[k] = v
        # Prevent cycles: ensure new parent isn't a descendant of this location
        if "parent_id" in updates and updates["parent_id"]:
            if updates["parent_id"] == loc_id:
                raise HTTPException(400, "Location cannot be its own parent")
            # Walk up the chain to ensure no cycle
            cur = updates["parent_id"]
            depth = 0
            while cur and depth < 50:
                p = await db.locations.find_one({"id": cur}, {"_id": 0, "parent_id": 1, "id": 1})
                if not p:
                    break
                if p.get("id") == loc_id:
                    raise HTTPException(400, "Cannot create a cycle in locations")
                cur = p.get("parent_id")
                depth += 1
        await db.locations.update_one({"id": loc_id}, {"$set": updates})
        new_doc = await db.locations.find_one({"id": loc_id}, {"_id": 0})

        # If the NAME changed, propagate the new name to every tool that has
        # this location_id cached. Otherwise tools keep showing the old name
        # forever (bug reported 2026-05-23: rename "test" → "test2", tool
        # description card still shows "test").
        if "name" in updates and updates["name"] != doc.get("name"):
            await db.tools.update_many(
                {"location_id": loc_id},
                {"$set": {"location_name": updates["name"]}},
            )

        return Location(**new_doc)


    @api_router.delete("/locations/{loc_id}")
    async def delete_location(loc_id: str, cascade: bool = False):
        if cascade:
            # collect this id and all descendants iteratively
            all_ids = [loc_id]
            frontier = [loc_id]
            while frontier:
                children = await db.locations.find(
                    {"parent_id": {"$in": frontier}}, {"_id": 0, "id": 1}
                ).to_list(5000)
                ids = [c["id"] for c in children]
                if not ids:
                    break
                all_ids.extend(ids)
                frontier = ids
            await db.locations.delete_many({"id": {"$in": all_ids}})
            return {"ok": True, "deleted": len(all_ids)}
        # default: only delete if no children, else reparent children to this loc's parent
        doc = await db.locations.find_one({"id": loc_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Location not found")
        parent_of_deleted = doc.get("parent_id")
        await db.locations.update_many(
            {"parent_id": loc_id}, {"$set": {"parent_id": parent_of_deleted}}
        )
        await db.locations.delete_one({"id": loc_id})
        return {"ok": True}


    # ---------- Tags ----------
    @api_router.post("/tags", response_model=Tag)
    async def create_tag(payload: TagCreate):
        name = payload.name.strip()
        existing = await db.tags.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}, {"_id": 0})
        if existing:
            return Tag(**existing)
        t = Tag(name=name, color=payload.color or "#FFB300")
        await db.tags.insert_one(t.dict())
        return t


    @api_router.get("/tags", response_model=List[Tag])
    async def list_tags():
        items = await db.tags.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
        return [Tag(**i) for i in items]


    @api_router.put("/tags/{tag_id}", response_model=Tag)
    async def update_tag(tag_id: str, payload: TagCreate):
        doc = await db.tags.find_one({"id": tag_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Tag not found")
        new_name = (payload.name or "").strip()
        if not new_name:
            raise HTTPException(400, "Name required")
        old_name = doc.get("name") or ""
        update = {"name": new_name}
        if payload.color:
            update["color"] = payload.color
        await db.tags.update_one({"id": tag_id}, {"$set": update})
        if old_name and old_name != new_name:
            # Rename references on tools (tag_names is a list of strings)
            await db.tools.update_many(
                {"tag_names": old_name},
                {"$set": {"tag_names.$[el]": new_name}},
                array_filters=[{"el": old_name}],
            )
        new = await db.tags.find_one({"id": tag_id}, {"_id": 0})
        return Tag(**new)


    @api_router.delete("/tags/{tag_id}")
    async def delete_tag(tag_id: str):
        res = await db.tags.delete_one({"id": tag_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Tag not found")
        return {"ok": True}


    # ---------- Brands (typeahead source for the Brand field on tools) ----------
    # Matches the same upsert / list / delete pattern as Tags. Brands are
    # auto-created when a tool is saved with a brand that doesn't already
    # exist in this collection (see _ensure_brand_saved in update_tool /
    # create_tool — added 2026-05-27).
    @api_router.post("/brands", response_model=Brand)
    async def create_brand(payload: BrandCreate):
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(400, "Name required")
        existing = await db.brands.find_one(
            {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}, {"_id": 0}
        )
        if existing:
            return Brand(**existing)
        b = Brand(name=name)
        await db.brands.insert_one(b.dict())
        return b


    @api_router.get("/brands", response_model=List[Brand])
    async def list_brands():
        items = await db.brands.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
        return [Brand(**i) for i in items]


    @api_router.delete("/brands/{brand_id}")
    async def delete_brand(brand_id: str):
        res = await db.brands.delete_one({"id": brand_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Brand not found")
        return {"ok": True}


    # ---------- Categories ----------
    @api_router.post("/categories", response_model=Category)
    async def create_category(payload: CategoryCreate):
        name = payload.name.strip()
        existing = await db.categories.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}, {"_id": 0})
        if existing:
            return Category(**existing)
        c = Category(name=name)
        await db.categories.insert_one(c.dict())
        return c


    @api_router.get("/categories", response_model=List[Category])
    async def list_categories():
        items = await db.categories.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
        return [Category(**i) for i in items]


    @api_router.put("/categories/{cat_id}", response_model=Category)
    async def update_category(cat_id: str, payload: CategoryCreate):
        doc = await db.categories.find_one({"id": cat_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Category not found")
        new_name = (payload.name or "").strip()
        if not new_name:
            raise HTTPException(400, "Name required")
        old_name = doc.get("name") or ""
        await db.categories.update_one({"id": cat_id}, {"$set": {"name": new_name}})
        if old_name and old_name != new_name:
            # Rename references on tools. Some tools store the category as a
            # legacy string field (`category`), others store the modern
            # `category_id` + cached `category_name` pair. Cover both.
            await db.tools.update_many({"category": old_name}, {"$set": {"category": new_name}})
            await db.tools.update_many(
                {"category_id": cat_id},
                {"$set": {"category_name": new_name}},
            )
        new = await db.categories.find_one({"id": cat_id}, {"_id": 0})
        return Category(**new)


    @api_router.delete("/categories/{cat_id}")
    async def delete_category(cat_id: str):
        res = await db.categories.delete_one({"id": cat_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Category not found")
        return {"ok": True}


    # ---------- Borrowers ----------
    @api_router.post("/borrowers", response_model=Borrower)
    async def create_borrower(payload: BorrowerCreate):
        b = Borrower(**payload.dict())
        await db.borrowers.insert_one(b.dict())
        return b


    @api_router.get("/borrowers", response_model=List[Borrower])
    async def list_borrowers():
        items = await db.borrowers.find({}, {"_id": 0}).to_list(2000)
        return [Borrower(**i) for i in items]


    @api_router.put("/borrowers/{borrower_id}", response_model=Borrower)
    async def update_borrower(borrower_id: str, payload: BorrowerCreate):
        existing = await db.borrowers.find_one({"id": borrower_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Borrower not found")
        new_name = payload.name.strip()
        new_contact = (payload.contact or "").strip()
        new_notes = (payload.notes or "").strip()
        old_name = existing.get("name", "")
        update_doc = {"name": new_name, "contact": new_contact, "notes": new_notes}
        await db.borrowers.update_one({"id": borrower_id}, {"$set": update_doc})

        # Propagate name change across tools' checkout history & current_checkout
        if new_name and new_name != old_name:
            # Update by borrower_id (preferred) — covers any record referencing this borrower
            await db.tools.update_many(
                {"current_checkout.borrower_id": borrower_id},
                {"$set": {"current_checkout.borrower_name": new_name}},
            )
            await db.tools.update_many(
                {"checkout_history.borrower_id": borrower_id},
                {"$set": {"checkout_history.$[el].borrower_name": new_name}},
                array_filters=[{"el.borrower_id": borrower_id}],
            )
            # Also update legacy records that match by name (case-insensitive) but had no id
            rx = {"$regex": f"^{re.escape(old_name)}$", "$options": "i"}
            await db.tools.update_many(
                {"current_checkout.borrower_name": rx, "current_checkout.borrower_id": {"$in": [None, ""]}},
                {"$set": {"current_checkout.borrower_name": new_name}},
            )
            await db.tools.update_many(
                {"checkout_history.borrower_name": rx},
                {"$set": {"checkout_history.$[el].borrower_name": new_name}},
                array_filters=[{"el.borrower_name": rx, "$or": [{"el.borrower_id": {"$in": [None, ""]}}, {"el.borrower_id": borrower_id}]}],
            )

        updated = await db.borrowers.find_one({"id": borrower_id}, {"_id": 0})
        return Borrower(**updated)


    @api_router.delete("/borrowers/{borrower_id}")
    async def delete_borrower(borrower_id: str):
        res = await db.borrowers.delete_one({"id": borrower_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Borrower not found")
        return {"ok": True}


    @api_router.get("/borrowers/{borrower_id}/history")
    async def borrower_history(borrower_id: str):
        b = await db.borrowers.find_one({"id": borrower_id}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Borrower not found")
        name = b.get("name", "")
        name_rx = {"$regex": f"^{re.escape(name)}$", "$options": "i"}

        # All tools that have ever been checked out by this borrower id OR name
        tools = await db.tools.find(
            {
                "$or": [
                    {"checkout_history.borrower_id": borrower_id},
                    {"checkout_history.borrower_name": name_rx},
                    {"current_checkout.borrower_id": borrower_id},
                    {"current_checkout.borrower_name": name_rx},
                ]
            },
            {"_id": 0},
        ).to_list(5000)

        per_tool: List[Dict[str, Any]] = []
        total_checkouts = 0
        currently_held: List[Dict[str, Any]] = []
        all_records: List[Dict[str, Any]] = []

        for t in tools:
            # Collect all checkouts (history + current) attributed to this borrower
            records = []
            for r in (t.get("checkout_history") or []):
                if r.get("borrower_id") == borrower_id or (
                    r.get("borrower_name", "").lower() == name.lower()
                ):
                    records.append(r)
            cur = t.get("current_checkout") or {}
            is_active = bool(t.get("is_checked_out")) and (
                cur.get("borrower_id") == borrower_id
                or (cur.get("borrower_name", "").lower() == name.lower())
            )
            if is_active:
                records.append(cur)
                currently_held.append(
                    {
                        "tool_id": t.get("id"),
                        "tool_name": t.get("name"),
                        "checked_out_at": cur.get("checked_out_at"),
                        "notes": cur.get("notes", ""),
                    }
                )
            if not records:
                continue
            last = max(records, key=lambda r: r.get("checked_out_at", ""))
            per_tool.append(
                {
                    "tool_id": t.get("id"),
                    "tool_name": t.get("name"),
                    "photo": (t.get("photos") or [None])[0],
                    "checkout_count": len(records),
                    "last_checked_out_at": last.get("checked_out_at"),
                    "currently_out": is_active,
                }
            )
            total_checkouts += len(records)
            for r in records:
                all_records.append(
                    {
                        "tool_id": t.get("id"),
                        "tool_name": t.get("name"),
                        "checked_out_at": r.get("checked_out_at"),
                        "checked_in_at": r.get("checked_in_at"),
                        "notes": r.get("notes", ""),
                    }
                )

        per_tool.sort(key=lambda x: x["checkout_count"], reverse=True)
        all_records.sort(key=lambda r: r.get("checked_out_at") or "", reverse=True)
        return {
            "borrower": Borrower(**b).dict(),
            "total_checkouts": total_checkouts,
            "unique_tools": len(per_tool),
            "currently_held": currently_held,
            "per_tool": per_tool,
            "history": all_records[:200],
        }

