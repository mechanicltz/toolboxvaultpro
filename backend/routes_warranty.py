"""Warranty claims — list/summary/get/update/delete + orphan purge.

Extracted from server.py (god-file refactor B3). Registered on the shared
api_router via register_warranty_routes(); all dependencies come from core/models/helpers so this
module never imports server (no cycle).
"""
from __future__ import annotations

import logging
import asyncio
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException

from core import db
import time
from models import (
    now_iso, WarrantyClaim,
    WarrantyClaimUpdate,
)

logger = logging.getLogger("routes_warranty")

# Throttle for the orphan-claim purge: previously this ran on EVERY
# /warranty-claims and /warranty-claims/summary read, which did 2 full
# collection scans + a possible delete_many per request. Now we keep
# the last-run timestamp here so the purge only fires once per 5 minutes
# at most. Idempotent and self-healing — same result, dramatically less
# DB pressure on the hot read path.
_LAST_ORPHAN_PURGE_TS: float = 0.0
_ORPHAN_PURGE_INTERVAL_SEC: float = 300.0  # 5 minutes


def register_warranty_routes(api_router: APIRouter) -> None:
    # ---------- Warranty Claims ----------
    async def _purge_orphan_claims() -> int:
        """Delete any warranty claim whose tool no longer exists. Heals stale
        state from before the cascade-on-tool-delete fix. Cheap (one find +
        one delete_many) and idempotent — safe to call before every list
        /summary read."""
        claim_rows = await db.warranty_claims.find(
            {}, {"_id": 0, "tool_id": 1}
        ).to_list(20000)
        tool_ids_with_claims = list({(r.get("tool_id") or "") for r in claim_rows if r.get("tool_id")})
        if not tool_ids_with_claims:
            return 0
        existing_rows = await db.tools.find(
            {"id": {"$in": tool_ids_with_claims}}, {"_id": 0, "id": 1}
        ).to_list(20000)
        existing_tool_ids = {r.get("id") for r in existing_rows}
        orphans = [tid for tid in tool_ids_with_claims if tid not in existing_tool_ids]
        if not orphans:
            return 0
        res = await db.warranty_claims.delete_many({"tool_id": {"$in": orphans}})
        return res.deleted_count


    def _maybe_purge_orphan_claims_in_background() -> None:
        """Fire the orphan-claim purge in the background, but at most once
        every _ORPHAN_PURGE_INTERVAL_SEC. Does NOT await — returns
        immediately so the calling read endpoint isn't blocked.

        Why this is safe:
          - Orphan claims are themselves a self-healing artefact; the cascade
            delete on tool removal already prevents new orphans. The purge
            is only needed for historical data created before the cascade
            was added. Running it every few minutes instead of every read
            loses nothing functionally.
          - delete_tool() ALREADY runs the targeted cascade (see
            `delete_tool` handler) so per-tool cleanup is instant.
        """
        global _LAST_ORPHAN_PURGE_TS
        now_ts = time.monotonic()
        if now_ts - _LAST_ORPHAN_PURGE_TS < _ORPHAN_PURGE_INTERVAL_SEC:
            return
        _LAST_ORPHAN_PURGE_TS = now_ts

        async def _run() -> None:
            try:
                await _purge_orphan_claims()
            except Exception as e:  # noqa: BLE001
                logger.warning("Background orphan-claims purge failed: %s", e)

        try:
            asyncio.create_task(_run())
        except RuntimeError:
            # No running loop (test/CLI context) — skip silently.
            pass


    @api_router.get("/warranty-claims", response_model=List[WarrantyClaim])
    async def list_warranty_claims(
        dealer_id: Optional[str] = None,
        tool_id: Optional[str] = None,
        status: Optional[str] = None,
        archived: Optional[bool] = None,  # true -> completed/rejected only; false -> active only
    ):
        _maybe_purge_orphan_claims_in_background()
        q: Dict[str, Any] = {}
        if tool_id:
            q["tool_id"] = tool_id
        if dealer_id:
            # Special token "_none_" matches claims without a dealer
            if dealer_id == "_none_":
                q["$or"] = [{"dealer_id": None}, {"dealer_id": ""}]
            else:
                q["dealer_id"] = dealer_id
        if status:
            q["claim_status"] = status
        elif archived is True:
            q["claim_status"] = {"$in": ["completed", "rejected"]}
        elif archived is False:
            q["claim_status"] = {"$nin": ["completed", "rejected"]}
        items = await db.warranty_claims.find(q, {"_id": 0}).sort("updated_at", -1).to_list(5000)
        return [WarrantyClaim(**i) for i in items]


    @api_router.get("/warranty-claims/summary")
    async def warranty_claims_summary():
        _maybe_purge_orphan_claims_in_background()
        items = await db.warranty_claims.find({}, {"_id": 0}).to_list(10000)
        dealers = await db.dealers.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(2000)
        dealer_name_by_id = {d["id"]: d["name"] for d in dealers}

        by_dealer: Dict[str, Dict[str, Any]] = {}
        totals = {
            "total": len(items),
            "open": 0,
            "completed": 0,
            "rejected": 0,
            "broken": 0,
            "awaiting_approval": 0,
            "waiting_replacement": 0,
        }
        for i in items:
            st = i.get("claim_status") or "broken"
            if st in totals:
                totals[st] = totals.get(st, 0) + 1
            if st not in ("completed", "rejected"):
                totals["open"] += 1
            did = i.get("dealer_id") or "_none_"
            if did not in by_dealer:
                by_dealer[did] = {
                    "dealer_id": did if did != "_none_" else None,
                    "dealer_name": dealer_name_by_id.get(did, i.get("dealer_name") or ("No Dealer" if did == "_none_" else "Unknown Dealer")),
                    "open": 0,
                    "completed": 0,
                    "rejected": 0,
                    "total": 0,
                    "broken": 0,
                    "awaiting_approval": 0,
                    "waiting_replacement": 0,
                }
            bucket = by_dealer[did]
            bucket["total"] += 1
            if st in bucket:
                bucket[st] = bucket.get(st, 0) + 1
            if st not in ("completed", "rejected"):
                bucket["open"] += 1
        dealer_list = sorted(by_dealer.values(), key=lambda d: (-d["open"], d["dealer_name"].lower()))
        return {"totals": totals, "dealers": dealer_list}


    @api_router.get("/warranty-claims/{claim_id}", response_model=WarrantyClaim)
    async def get_warranty_claim(claim_id: str):
        doc = await db.warranty_claims.find_one({"id": claim_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Claim not found")
        return WarrantyClaim(**doc)


    @api_router.put("/warranty-claims/{claim_id}", response_model=WarrantyClaim)
    async def update_warranty_claim(claim_id: str, payload: WarrantyClaimUpdate):
        doc = await db.warranty_claims.find_one({"id": claim_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Claim not found")
        updates = {k: v for k, v in payload.dict().items() if v is not None}
        if "claim_status" in updates and updates["claim_status"] not in CLAIM_STATUSES:
            raise HTTPException(400, f"Invalid claim_status. Must be one of {CLAIM_STATUSES}")
        updates["updated_at"] = now_iso()
        new_status = updates.get("claim_status")
        archiving = new_status in ("completed", "rejected") and doc.get("claim_status") not in ("completed", "rejected")
        reopening = new_status not in (None, "completed", "rejected") and doc.get("claim_status") in ("completed", "rejected")
        if archiving:
            updates["completed_at"] = now_iso()
        if reopening:
            updates["completed_at"] = None
        await db.warranty_claims.update_one({"id": claim_id}, {"$set": updates})

        # Mirror to the underlying tool
        tool_id = doc.get("tool_id")
        if tool_id:
            if archiving:
                # Tool is no longer broken once claim is closed
                await db.tools.update_one(
                    {"id": tool_id},
                    {"$set": {"needs_repair": False, "repair_info": None, "updated_at": now_iso()}},
                )
            elif reopening:
                # Reopen — flag tool broken and rebuild repair_info from the claim
                ri = {
                    "company_notified": doc.get("repair_company") or updates.get("repair_company") or "",
                    "contact": doc.get("contact") or updates.get("contact") or "",
                    "notified_at": doc.get("notified_at") or updates.get("notified_at") or "",
                    "expected_completion": doc.get("expected_completion") or updates.get("expected_completion") or "",
                    "repair_status": "Reported",
                    "notes": doc.get("notes") or updates.get("notes") or "",
                }
                await db.tools.update_one(
                    {"id": tool_id},
                    {"$set": {"needs_repair": True, "repair_info": ri, "updated_at": now_iso()}},
                )
            elif new_status and new_status not in ("completed", "rejected"):
                # Plain status change while still active — keep tool's repair_info repair_status in sync
                label_map = {
                    "broken": "Reported",
                    "awaiting_approval": "Reported",
                    "waiting_replacement": "Awaiting Parts",
                }
                tdoc = await db.tools.find_one({"id": tool_id}, {"_id": 0, "repair_info": 1, "needs_repair": 1})
                if tdoc and tdoc.get("needs_repair"):
                    ri = dict(tdoc.get("repair_info") or {})
                    ri["repair_status"] = label_map.get(new_status, ri.get("repair_status") or "Reported")
                    await db.tools.update_one({"id": tool_id}, {"$set": {"repair_info": ri, "updated_at": now_iso()}})

            # Repair-cost mirror: if the user edited repair_cost on the claim
            # AND the tool is still flagged broken, sync the value back onto
            # tool.repair_info so the edit screen reflects it.
            if "repair_cost" in updates and not archiving:
                tdoc2 = await db.tools.find_one({"id": tool_id}, {"_id": 0, "repair_info": 1, "needs_repair": 1})
                if tdoc2 and tdoc2.get("needs_repair"):
                    ri2 = dict(tdoc2.get("repair_info") or {})
                    ri2["repair_cost"] = float(updates.get("repair_cost") or 0)
                    await db.tools.update_one({"id": tool_id}, {"$set": {"repair_info": ri2, "updated_at": now_iso()}})

        new = await db.warranty_claims.find_one({"id": claim_id}, {"_id": 0})
        return WarrantyClaim(**new)


    @api_router.delete("/warranty-claims/{claim_id}")
    async def delete_warranty_claim(claim_id: str):
        res = await db.warranty_claims.delete_one({"id": claim_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Warranty claim not found")
        return {"ok": True}

