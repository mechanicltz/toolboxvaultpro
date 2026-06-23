"""Shared, dependency-light helpers used across multiple route modules.

Extracted from server.py (god-file refactor B3) so route groups (tools, stats,
bundles, …) can share them without importing server.
"""

import re
from typing import Optional, Dict, Any, List

from fastapi import HTTPException

# Photo payload size guards (base64 string length in bytes).
MAX_PHOTO_BYTES = 5 * 1024 * 1024            # ~5MB per photo (raw decoded ≈ 3.7MB)
MAX_TOTAL_PHOTO_BYTES = 25 * 1024 * 1024     # ~25MB total per tool


def build_tool_query(
    search: Optional[str] = None,
    location_id: Optional[str] = None,
    tag_id: Optional[str] = None,
    category_id: Optional[str] = None,
    dealer_id: Optional[str] = None,
    checked_out: Optional[bool] = None,
    is_consumable: Optional[bool] = None,
    needs_repair: Optional[bool] = None,
    for_sale: Optional[bool] = None,
    is_sold: Optional[bool] = None,
    is_bundle: Optional[bool] = None,
    expansion_of: Optional[str] = None,
):
    query: Dict[str, Any] = {}
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        query["$or"] = [
            {"name": rx},
            {"description": rx},
            {"brand": rx},
            {"model": rx},
            {"serial_number": rx},
            {"set_serials": rx},
            {"model_numbers": rx},
            {"serial_numbers": rx},
            {"tag_names": rx},
            {"location_name": rx},
            {"category_name": rx},
            {"dealer_name": rx},
            {"purchased_from_agent_name": rx},
            {"sold_to": rx},
            # A search that matches an inside item's name or model should
            # surface the PARENT bundle in results (inside items are embedded).
            {"inside_items.name": rx},
            {"inside_items.model": rx},
        ]
    if location_id:
        query["location_id"] = location_id
    if tag_id:
        query["tag_ids"] = tag_id
    if category_id:
        query["category_id"] = category_id
    if dealer_id:
        query["dealer_id"] = dealer_id
    if checked_out is not None:
        query["is_checked_out"] = checked_out
    if is_consumable is not None:
        query["is_consumable"] = is_consumable
    if needs_repair is not None:
        query["needs_repair"] = needs_repair
    if for_sale is not None:
        query["for_sale"] = for_sale
    if is_sold is not None:
        query["is_sold"] = is_sold
    if is_bundle is not None:
        query["is_bundle"] = True if is_bundle else {"$ne": True}
    if expansion_of is not None:
        query["expansion_of"] = expansion_of
    # By default, exclude sold items from regular tool listings unless
    # explicitly asked for them. They live in the "sold" archive instead.
    if is_sold is None:
        query["is_sold"] = {"$ne": True}
    return query


def _validate_photo_payload(photos: Optional[List[str]]) -> None:
    if not photos:
        return
    total = 0
    for i, p in enumerate(photos):
        if not p:
            continue
        size = len(p)  # length in bytes of the base64 string itself
        if size > MAX_PHOTO_BYTES:
            raise HTTPException(
                413,
                f"Photo #{i + 1} is too large ({size // 1024} KB). "
                f"Maximum allowed is {MAX_PHOTO_BYTES // (1024 * 1024)} MB per photo. "
                "Please re-take or resize the photo before saving.",
            )
        total += size
    if total > MAX_TOTAL_PHOTO_BYTES:
        raise HTTPException(
            413,
            f"Total photo payload is too large ({total // (1024 * 1024)} MB). "
            f"Maximum allowed is {MAX_TOTAL_PHOTO_BYTES // (1024 * 1024)} MB across all photos for one tool.",
        )
