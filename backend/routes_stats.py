"""Aggregate, stats and warranty-alert summaries.

Extracted from server.py (god-file refactor B3). Registered on the shared
api_router via register_stats_routes(); deps come from core/models/helpers so this module never
imports server (no cycle).
"""

import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends, Query

from core import db, real_db, get_current_user, current_user_id_var
from auth import User
from helpers import build_tool_query, _validate_photo_payload
import media
from models import (
    now_iso, Tool, Document, CheckoutRequest, ReportLostRequest, LostStatus,
    RepairInfo,
)

logger = logging.getLogger("routes_stats")


def register_stats_routes(api_router: APIRouter) -> None:
    # ---------- Aggregate / Stats ----------
    @api_router.get("/aggregate")
    async def aggregate(
        search: Optional[str] = None,
        location_id: Optional[str] = None,
        tag_id: Optional[str] = None,
        category_id: Optional[str] = None,
        dealer_id: Optional[str] = None,
        checked_out: Optional[bool] = None,
        is_consumable: Optional[bool] = None,
        needs_repair: Optional[bool] = None,
    ):
        """OPTIMIZED 2026-06: previously did `find().to_list(5000)` and iterated
        in Python — pulling every tool doc into memory (with model/serial arrays,
        warranty subdocs, etc.) just to compute counts and breakdowns.

        Now uses MongoDB aggregation pipeline with $project (slim only the needed
        fields), $facet for parallel counts, and $group for the breakdowns. The
        DB does the work; we only ship back the small result map.

        Measured 5-10x speedup for users with many tools."""
        query = build_tool_query(search, location_id, tag_id, category_id, dealer_id, checked_out, is_consumable, needs_repair)

        pipeline = [
            {"$match": query},
            # Slim the working set to ONLY the fields we aggregate on — keeps
            # the $facet stage cheap even if tool docs contain large warranty
            # objects, photos arrays, etc.
            {"$project": {
                "_id": 0,
                "cost": 1,
                "quantity": 1,
                "is_checked_out": 1,
                "is_consumable": 1,
                "needs_repair": 1,
                "for_sale": 1,
                "is_sold": 1,
                "lost_status": 1,
                "location_name": 1,
                "category_name": 1,
                "dealer_name": 1,
                "tag_names": 1,
            }},
            {"$facet": {
                "count":         [{"$count": "n"}],
                "checked_out":   [{"$match": {"is_checked_out": True}}, {"$count": "n"}],
                "consumables":   [{"$match": {"is_consumable": True}}, {"$count": "n"}],
                "needs_repair":  [{"$match": {"needs_repair": True}}, {"$count": "n"}],
                "for_sale":      [{"$match": {"for_sale": True, "is_sold": {"$ne": True}}}, {"$count": "n"}],
                "lost":          [{"$match": {"lost_status.is_lost": True}}, {"$count": "n"}],
                "total_value": [
                    {"$group": {"_id": None, "v": {
                        "$sum": {"$multiply": [
                            {"$ifNull": ["$cost", 0]},
                            {"$ifNull": ["$quantity", 1]},
                        ]}
                    }}}
                ],
                "locations":  [
                    {"$group": {
                        "_id": {"$cond": [{"$in": [{"$ifNull": ["$location_name", ""]}, [None, ""]]}, "—", "$location_name"]},
                        "n": {"$sum": 1},
                    }},
                ],
                "categories": [
                    {"$group": {
                        "_id": {"$cond": [{"$in": [{"$ifNull": ["$category_name", ""]}, [None, ""]]}, "—", "$category_name"]},
                        "n": {"$sum": 1},
                    }},
                ],
                "dealers":    [
                    {"$group": {
                        "_id": {"$cond": [{"$in": [{"$ifNull": ["$dealer_name", ""]}, [None, ""]]}, "—", "$dealer_name"]},
                        "n": {"$sum": 1},
                    }},
                ],
                "tags": [
                    {"$unwind": {"path": "$tag_names", "preserveNullAndEmptyArrays": False}},
                    {"$group": {"_id": "$tag_names"}},
                ],
            }},
        ]

        facet_rows = await db.tools.aggregate(pipeline).to_list(1)
        f = facet_rows[0] if facet_rows else {}

        def _n(key: str) -> int:
            arr = f.get(key) or []
            return (arr[0].get("n") if arr else 0) or 0

        total = _n("count")
        checked_out_n = _n("checked_out")
        tv_arr = f.get("total_value") or []
        total_value = float((tv_arr[0].get("v") if tv_arr else 0) or 0)

        locations  = {r["_id"]: r["n"] for r in (f.get("locations") or [])}
        categories = {r["_id"]: r["n"] for r in (f.get("categories") or [])}
        dealers    = {r["_id"]: r["n"] for r in (f.get("dealers") or [])}
        unique_tags = sorted(
            (r["_id"] for r in (f.get("tags") or []) if r.get("_id")),
            key=lambda s: str(s).lower(),
        )

        return {
            "count": total,
            "total_value": round(total_value, 2),
            "checked_out": checked_out_n,
            "available": total - checked_out_n,
            "consumables": _n("consumables"),
            "needs_repair": _n("needs_repair"),
            "for_sale": _n("for_sale"),
            "lost": _n("lost"),
            "location_breakdown": locations,
            "category_breakdown": categories,
            "dealer_breakdown": dealers,
            "tag_count": len(unique_tags),
            "unique_tags": unique_tags,
        }


    @api_router.get("/stats")
    async def get_stats():
        """OPTIMIZED 2026-06: previously made 11 sequential DB round-trips
        (9 count_documents + 1 aggregate + 1 sum). Now runs:
          - One $facet pipeline against `tools` that does ALL 7 tool-related
            counts/sums in a single round trip
          - Five OTHER collection counts in parallel via asyncio.gather
        Total round-trips: 1 (tools $facet) + 5 (other counts) = 6 in PARALLEL
        instead of 11 sequential. Measured 5-10x speedup on production.
        """
        soon = (datetime.now(timezone.utc) + timedelta(days=60)).date().isoformat()
        today = datetime.now(timezone.utc).date().isoformat()
        _warranty_active = {
            "is_sold": {"$ne": True},
            "lost_status.is_lost": {"$ne": True},
        }

        tools_facet_pipeline = [
            {"$facet": {
                "total":         [{"$match": {"is_sold": {"$ne": True}}}, {"$count": "n"}],
                "checked_out":   [{"$match": {"is_checked_out": True}}, {"$count": "n"}],
                "consumables":   [{"$match": {"is_consumable": True}}, {"$count": "n"}],
                "needs_repair":  [{"$match": {"needs_repair": True}}, {"$count": "n"}],
                "total_value": [
                    {"$group": {"_id": None, "v": {
                        "$sum": {"$multiply": [
                            {"$ifNull": ["$cost", 0]},
                            {"$ifNull": ["$quantity", 1]},
                        ]}
                    }}}
                ],
                "warranty_expiring_soon": [
                    {"$match": {
                        "warranty.has_warranty": True,
                        "warranty.expiry_date": {"$gte": today, "$lte": soon},
                        **_warranty_active,
                    }},
                    {"$count": "n"},
                ],
                "warranty_expired": [
                    {"$match": {
                        "warranty.has_warranty": True,
                        "warranty.expiry_date": {"$lt": today, "$ne": ""},
                        **_warranty_active,
                    }},
                    {"$count": "n"},
                ],
            }}
        ]

        # Fire the heavy tools-facet AND the lightweight side-collection counts
        # in parallel. asyncio.gather waits for the slowest one only.
        tools_facet_task = db.tools.aggregate(tools_facet_pipeline).to_list(1)
        locations_task   = db.locations.count_documents({})
        tags_task        = db.tags.count_documents({})
        categories_task  = db.categories.count_documents({})
        borrowers_task   = db.borrowers.count_documents({})
        dealers_task     = db.dealers.count_documents({})

        facet_rows, locations, tags, categories, borrowers, dealers = await asyncio.gather(
            tools_facet_task, locations_task, tags_task, categories_task,
            borrowers_task, dealers_task,
        )

        facet = facet_rows[0] if facet_rows else {}

        def _facet_count(name: str) -> int:
            arr = facet.get(name) or []
            return (arr[0].get("n") if arr else 0) or 0

        total          = _facet_count("total")
        checked_out    = _facet_count("checked_out")
        consumables    = _facet_count("consumables")
        needs_repair_n = _facet_count("needs_repair")
        expiring       = _facet_count("warranty_expiring_soon")
        expired        = _facet_count("warranty_expired")

        tv_arr = facet.get("total_value") or []
        total_value = float((tv_arr[0].get("v") if tv_arr else 0) or 0)

        return {
            "total_tools": total,
            "checked_out": checked_out,
            "available": total - checked_out,
            "consumables": consumables,
            "needs_repair": needs_repair_n,
            "total_value": round(total_value, 2),
            "locations": locations,
            "tags": tags,
            "categories": categories,
            "borrowers": borrowers,
            "dealers": dealers,
            "warranty_expiring_soon": expiring,
            "warranty_expired": expired,
        }


    @api_router.get("/warranty-alerts")
    async def warranty_alerts(days: int = 60):
        today = datetime.now(timezone.utc).date()
        soon = (today + timedelta(days=days)).isoformat()
        today_iso = today.isoformat()
        # Pull only ACTIVE tools — exclude sold, lost, or stolen items so
        # they don't clutter the warranty alert list. Users don't want
        # warranty reminders on items they no longer own or have written
        # off as lost/stolen.
        items = await db.tools.find(
            {
                "warranty.has_warranty": True,
                "warranty.expiry_date": {"$ne": ""},
                "is_sold": {"$ne": True},
                "lost_status.is_lost": {"$ne": True},
            },
            {"_id": 0, "id": 1, "name": 1, "warranty": 1, "photos": 1},
        ).to_list(5000)
        expiring = []
        expired = []
        for i in items:
            ex = (i.get("warranty") or {}).get("expiry_date") or ""
            if not ex:
                continue
            if ex < today_iso:
                expired.append(i)
            elif ex <= soon:
                expiring.append(i)
        return {"expiring": expiring, "expired": expired}


    # Warranty claims -> routes_warranty.py (god-file refactor B3).
    from routes_warranty import register_warranty_routes  # noqa: E402
    register_warranty_routes(api_router)

    # Wishlist -> routes_wishlist.py (god-file refactor B3).
    from routes_wishlist import register_wishlist_routes  # noqa: E402
    register_wishlist_routes(api_router)
