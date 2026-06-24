"""Per-tool actions — sale/sold, checkout/checkin, documents, theft-loss, bulk.

Extracted from server.py (god-file refactor B3). Registered on the shared
api_router via register_tool_action_routes(); deps come from core/models/helpers so this module never
imports server (no cycle).
"""

import logging
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends, Query

from core import db, real_db, get_current_user, current_user_id_var
from auth import User
from helpers import build_tool_query, _validate_photo_payload
import media
from models import (
    now_iso, Tool, Document, CheckoutRequest, CheckoutRecord,
    ReportLostRequest, LostStatus, RepairInfo,
)

logger = logging.getLogger("routes_tool_actions")


def register_tool_action_routes(api_router: APIRouter) -> None:
    # ---------- Sale / Sold ----------
    class MarkSoldRequest(BaseModel):
        sold_price: Optional[float] = 0.0
        sold_to: Optional[str] = ""
        sold_at: Optional[str] = ""  # YYYY-MM-DD; defaults to today if empty
        sold_notes: Optional[str] = ""
        sold_quantity: Optional[int] = None  # None or >= current qty → mark fully sold;
                                             # less than current qty → just decrement.


    @api_router.post("/tools/{tool_id}/mark-sold", response_model=Tool)
    async def mark_tool_sold(tool_id: str, payload: MarkSoldRequest):
        """Mark a tool as sold. If `sold_quantity` is supplied AND less than the
        current `quantity`, the tool's quantity is simply decremented and the
        tool stays in active inventory (partial sale). Otherwise the tool is
        fully marked sold (existing behavior)."""
        doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Tool not found")

        current_qty = max(1, int(doc.get("quantity") or 1))
        sold_qty_raw = payload.sold_quantity
        sold_qty = current_qty if sold_qty_raw in (None, 0) else max(1, int(sold_qty_raw))
        if sold_qty > current_qty:
            sold_qty = current_qty

        sold_at = (payload.sold_at or "").strip()
        if not sold_at:
            from datetime import datetime as _dt
            sold_at = _dt.utcnow().strftime("%Y-%m-%d")

        # Partial sale: decrement quantity only — don't mark sold.
        if sold_qty < current_qty:
            await db.tools.update_one(
                {"id": tool_id},
                {"$set": {
                    "quantity": current_qty - sold_qty,
                    "updated_at": now_iso(),
                }},
            )
            new_doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
            return Tool(**new_doc)

        # Full sale: mark the tool as sold.
        updates = {
            "is_sold": True,
            "sold_at": sold_at,
            "sold_price": float(payload.sold_price or 0.0),
            "sold_to": (payload.sold_to or "").strip(),
            "sold_notes": (payload.sold_notes or "").strip(),
            "for_sale": False,
            "updated_at": now_iso(),
        }
        # Auto check-in if currently checked out
        if doc.get("is_checked_out"):
            record = doc.get("current_checkout") or {}
            if record:
                record = dict(record)
                record["checked_in_at"] = now_iso()
                record["notes"] = (record.get("notes") or "") + " [auto check-in: marked sold]"
                history = doc.get("checkout_history") or []
                history.append(record)
                updates["is_checked_out"] = False
                updates["current_checkout"] = None
                updates["checkout_history"] = history

        await db.tools.update_one({"id": tool_id}, {"$set": updates})
        new_doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        return Tool(**new_doc)


    @api_router.post("/tools/{tool_id}/unmark-sold", response_model=Tool)
    async def unmark_tool_sold(tool_id: str):
        """Restore a sold tool back into regular inventory (clears sold fields)."""
        doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Tool not found")
        await db.tools.update_one(
            {"id": tool_id},
            {
                "$set": {
                    "is_sold": False,
                    "sold_at": "",
                    "sold_price": 0.0,
                    "sold_to": "",
                    "sold_notes": "",
                    "updated_at": now_iso(),
                }
            },
        )
        new_doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        return Tool(**new_doc)


    @api_router.post("/tools/{tool_id}/checkout", response_model=Tool)
    async def checkout_tool(tool_id: str, payload: CheckoutRequest):
        doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Tool not found")
        if doc.get("is_checked_out"):
            raise HTTPException(status_code=400, detail="Tool already checked out")
        # Resolve borrower phone: explicit payload wins, else fetch from saved
        # borrower record. This phone fuels the in-app + notification quick-actions
        # (CALL / TEXT REMINDER) so the user doesn't need to look it up later.
        borrower_phone = (payload.borrower_phone or "").strip()
        if not borrower_phone and payload.borrower_id:
            b = await db.borrowers.find_one({"id": payload.borrower_id}, {"_id": 0, "phone": 1})
            if b and b.get("phone"):
                borrower_phone = str(b["phone"]).strip()
        record = CheckoutRecord(
            borrower_name=payload.borrower_name,
            borrower_id=payload.borrower_id,
            borrower_phone=borrower_phone,
            notes=payload.notes or "",
        )
        await db.tools.update_one(
            {"id": tool_id},
            {"$set": {"is_checked_out": True, "current_checkout": record.dict(), "updated_at": now_iso()}},
        )
        new_doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        return Tool(**new_doc)


    @api_router.post("/tools/{tool_id}/checkin", response_model=Tool)
    async def checkin_tool(tool_id: str):
        doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Tool not found")
        if not doc.get("is_checked_out"):
            raise HTTPException(status_code=400, detail="Tool is not checked out")
        record = doc.get("current_checkout") or {}
        record["checked_in_at"] = now_iso()
        history = doc.get("checkout_history") or []
        history.append(record)
        await db.tools.update_one(
            {"id": tool_id},
            {"$set": {"is_checked_out": False, "current_checkout": None, "checkout_history": history, "updated_at": now_iso()}},
        )
        new_doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        return Tool(**new_doc)


    # ---------- Documents (per tool) ----------
    @api_router.post("/tools/{tool_id}/documents", response_model=Tool)
    async def add_tool_document(tool_id: str, payload: Document):
        tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not tool:
            raise HTTPException(404, "Tool not found")
        docs = tool.get("documents") or []
        new_doc = payload.model_dump()
        if not new_doc.get("id"):
            new_doc["id"] = str(uuid.uuid4())
        if not new_doc.get("uploaded_at"):
            new_doc["uploaded_at"] = now_iso()
        if not new_doc.get("size") and new_doc.get("data"):
            # Estimate size in bytes from base64 length
            new_doc["size"] = int(len(new_doc["data"]) * 3 / 4)
        docs.append(new_doc)
        await db.tools.update_one({"id": tool_id}, {"$set": {"documents": docs, "updated_at": now_iso()}})
        return Tool(**(await db.tools.find_one({"id": tool_id}, {"_id": 0})))


    @api_router.delete("/tools/{tool_id}/documents/{doc_id}", response_model=Tool)
    async def delete_tool_document(tool_id: str, doc_id: str):
        tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not tool:
            raise HTTPException(404, "Tool not found")
        docs = [d for d in (tool.get("documents") or []) if d.get("id") != doc_id]
        await db.tools.update_one({"id": tool_id}, {"$set": {"documents": docs, "updated_at": now_iso()}})
        return Tool(**(await db.tools.find_one({"id": tool_id}, {"_id": 0})))


    class RenameDocumentRequest(BaseModel):
        name: str

    @api_router.patch("/tools/{tool_id}/documents/{doc_id}", response_model=Tool)
    async def rename_tool_document(tool_id: str, doc_id: str, payload: RenameDocumentRequest):
        tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not tool:
            raise HTTPException(404, "Tool not found")
        new_name = (payload.name or "").strip()
        if not new_name:
            raise HTTPException(400, "Name required")
        docs = tool.get("documents") or []
        found = False
        for d in docs:
            if d.get("id") == doc_id:
                d["name"] = new_name
                found = True
                break
        if not found:
            raise HTTPException(404, "Document not found")
        await db.tools.update_one({"id": tool_id}, {"$set": {"documents": docs, "updated_at": now_iso()}})
        return Tool(**(await db.tools.find_one({"id": tool_id}, {"_id": 0})))


    # Maintenance schedules/service-events -> routes_maintenance.py (god-file refactor B3).
    from routes_maintenance import register_maintenance_routes  # noqa: E402
    register_maintenance_routes(api_router)

    # ---------- Theft / Loss Reporting ----------
    @api_router.post("/tools/{tool_id}/report-lost", response_model=Tool)
    async def report_lost(tool_id: str, payload: ReportLostRequest):
        tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not tool:
            raise HTTPException(404, "Tool not found")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        lost_status = LostStatus(
            is_lost=True,
            type=payload.type if payload.type in ("lost", "stolen") else "lost",
            reported_date=payload.reported_date or today,
            police_report_number=payload.police_report_number or "",
            insurance_company=payload.insurance_company or "",
            insurance_claim_number=payload.insurance_claim_number or "",
            notes=payload.notes or "",
            reported_by=payload.reported_by or "",
            recovered_at=None,
        ).model_dump()
        await db.tools.update_one({"id": tool_id}, {"$set": {"lost_status": lost_status, "updated_at": now_iso()}})
        return Tool(**(await db.tools.find_one({"id": tool_id}, {"_id": 0})))


    @api_router.post("/tools/{tool_id}/recover", response_model=Tool)
    async def mark_recovered(tool_id: str):
        tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not tool:
            raise HTTPException(404, "Tool not found")
        lost = tool.get("lost_status") or {}
        lost["is_lost"] = False
        lost["recovered_at"] = now_iso()
        await db.tools.update_one({"id": tool_id}, {"$set": {"lost_status": lost, "updated_at": now_iso()}})
        return Tool(**(await db.tools.find_one({"id": tool_id}, {"_id": 0})))


    # ---------- Bulk Operations ----------
    class BulkRequest(BaseModel):
        tool_ids: List[str]
        action: str  # "delete" | "move_location" | "add_tag" | "remove_tag" | "set_category" | "report_lost"
        # Optional payload depending on action
        location_id: Optional[str] = None
        location_name: Optional[str] = None
        tag_id: Optional[str] = None
        tag_name: Optional[str] = None
        category_id: Optional[str] = None
        category_name: Optional[str] = None
        lost_payload: Optional[ReportLostRequest] = None


    @api_router.post("/tools/bulk")
    async def bulk_tools(payload: BulkRequest):
        if not payload.tool_ids:
            return {"ok": True, "affected": 0}
        affected = 0
        if payload.action == "delete":
            result = await db.tools.delete_many({"id": {"$in": payload.tool_ids}})
            affected = result.deleted_count
            # Cascade: drop any warranty claims that referenced the deleted tools.
            await db.warranty_claims.delete_many({"tool_id": {"$in": payload.tool_ids}})
        elif payload.action == "move_location":
            result = await db.tools.update_many(
                {"id": {"$in": payload.tool_ids}},
                {"$set": {
                    "location_id": payload.location_id,
                    "location_name": payload.location_name or "",
                    "updated_at": now_iso(),
                }},
            )
            affected = result.modified_count
        elif payload.action == "set_category":
            result = await db.tools.update_many(
                {"id": {"$in": payload.tool_ids}},
                {"$set": {
                    "category_id": payload.category_id,
                    "category_name": payload.category_name or "",
                    "updated_at": now_iso(),
                }},
            )
            affected = result.modified_count
        elif payload.action == "add_tag":
            if not payload.tag_id:
                raise HTTPException(400, "tag_id required")
            # Bulk add tag using $addToSet — single round-trip
            add_to_set: Dict[str, Any] = {"tag_ids": payload.tag_id}
            if payload.tag_name:
                add_to_set["tag_names"] = payload.tag_name
            result = await db.tools.update_many(
                {"id": {"$in": payload.tool_ids}, "tag_ids": {"$ne": payload.tag_id}},
                {"$addToSet": add_to_set, "$set": {"updated_at": now_iso()}},
            )
            affected = result.modified_count
        elif payload.action == "remove_tag":
            if not payload.tag_id:
                raise HTTPException(400, "tag_id required")
            # Bulk remove tag using $pull — single round-trip
            pull_doc: Dict[str, Any] = {"tag_ids": payload.tag_id}
            if payload.tag_name:
                pull_doc["tag_names"] = payload.tag_name
            result = await db.tools.update_many(
                {"id": {"$in": payload.tool_ids}, "tag_ids": payload.tag_id},
                {"$pull": pull_doc, "$set": {"updated_at": now_iso()}},
            )
            affected = result.modified_count
        elif payload.action == "report_lost":
            lp = payload.lost_payload or ReportLostRequest()
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            lost_status = LostStatus(
                is_lost=True,
                type=lp.type if lp.type in ("lost", "stolen") else "lost",
                reported_date=lp.reported_date or today,
                police_report_number=lp.police_report_number or "",
                insurance_company=lp.insurance_company or "",
                insurance_claim_number=lp.insurance_claim_number or "",
                notes=lp.notes or "",
                reported_by=lp.reported_by or "",
            ).model_dump()
            result = await db.tools.update_many(
                {"id": {"$in": payload.tool_ids}},
                {"$set": {"lost_status": lost_status, "updated_at": now_iso()}},
            )
            affected = result.modified_count
        else:
            raise HTTPException(400, f"Unknown action '{payload.action}'")
        return {"ok": True, "affected": affected}

