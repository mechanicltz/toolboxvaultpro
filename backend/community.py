"""
community.py — Community Product Database (Crowdsourced Tool Catalog), Phase 1.

Deterministic core (NO AI / photos / prices / reputation yet). See
/app/memory/FUTURE_community_product_database.md for the full design.

Key architectural note: unlike the rest of the app (owner-scoped via the `db`
proxy in core.py), the community collections are GLOBAL / cross-tenant. This
module therefore talks to `real_db` DIRECTLY and never through the scoped proxy.

Collections (global):
  - community_contributions : every user's per-field "vote" for a Brand+Model.
      { id, profile_key, brand_norm, model_norm, field, value, value_norm,
        user_id, tool_id, created_at }
  - community_profiles      : one canonical row per Brand+Model.
      { profile_key, brand, brand_norm, model, model_norm,
        contributor_count, created_at, updated_at }

Privacy: ONLY non-personal fields are contributed (name, brand, category, tags,
dealer NAME, MSRP, consumable flag). Serial #, price, dates, warranty, notes,
location, receipts, docs and photos are NEVER written here.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

# Minimum distinct users before a value/profile becomes visible to OTHERS.
CONSENSUS_THRESHOLD = 2

# Fields we distill into per-field ranked options.
_VALUE_FIELDS = ("name", "category", "tag", "dealer", "msrp", "consumable")

# Basic gibberish / profanity guard (quality layer 3). Deterministic, no AI.
_PROFANITY = {"fuck", "shit", "bitch", "asshole", "cunt", "dick", "piss"}
_MIN_LEN = 1
_MAX_LEN = 120


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def norm(s: Optional[str]) -> str:
    """Normalize a brand/model token: uppercase, strip all non-alphanumerics."""
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def norm_value(s: Optional[str]) -> str:
    """Normalize a free value for dedup: lowercase, collapse whitespace."""
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def profile_key(brand: Optional[str], model: Optional[str]) -> Optional[str]:
    """Canonical key = normalized brand + '|' + normalized model.
    Returns None when there's no usable model (v1 skips no-model items)."""
    m = norm(model)
    if not m:
        return None
    return f"{norm(brand)}|{m}"


def _is_junk(value: str) -> bool:
    v = (value or "").strip()
    if len(v) < _MIN_LEN or len(v) > _MAX_LEN:
        return True
    low = v.lower()
    for bad in _PROFANITY:
        if bad in low:
            return True
    # keyboard-mash: a long run of the same char, or no vowels in a long word
    if re.search(r"(.)\1{4,}", low):
        return True
    return False


def _tool_primary_model(tool: Dict[str, Any]) -> str:
    mns = tool.get("model_numbers") or []
    if isinstance(mns, list):
        for m in mns:
            if (m or "").strip():
                return str(m).strip()
    return str(tool.get("model") or "").strip()


def _tool_contributions(tool: Dict[str, Any]) -> List[Dict[str, str]]:
    """Extract the (field, value) pairs a tool contributes. Non-personal only."""
    out: List[Dict[str, str]] = []

    def add(field: str, value: Any):
        v = str(value or "").strip()
        if not v or _is_junk(v):
            return
        out.append({"field": field, "value": v})

    add("name", tool.get("name"))
    add("category", tool.get("category_name"))
    for t in (tool.get("tag_names") or []):
        add("tag", t)
    add("dealer", tool.get("dealer_name"))
    msrp = tool.get("msrp_price")
    if msrp and float(msrp) > 0:
        # store MSRP as a clean numeric string so identical prices collide
        add("msrp", f"{float(msrp):.2f}")
    add("consumable", "Yes" if tool.get("is_consumable") else "No")

    # De-dupe within one tool by (field, normalized value).
    seen = set()
    deduped = []
    for c in out:
        k = (c["field"], norm_value(c["value"]))
        if k in seen:
            continue
        seen.add(k)
        deduped.append(c)
    return deduped


async def _top_value(rdb, key: str, field: str) -> str:
    """Return the single value for `field` with the most distinct-user backing
    (the 'official'/consensus value). Empty string when there are none."""
    pipeline = [
        {"$match": {"profile_key": key, "field": field}},
        {"$group": {"_id": "$value_norm", "users": {"$addToSet": "$user_id"},
                     "sample": {"$first": "$value"}}},
    ]
    best = ""
    best_n = -1
    async for row in rdb.community_contributions.aggregate(pipeline):
        n = len(row.get("users") or [])
        if n > best_n:
            best_n = n
            best = row.get("sample") or ""
    return best


async def _recompute_profile(rdb, key: str, *, brand: str = "", model: str = "") -> None:
    """Recompute a profile's distinct-contributor count + cached display fields
    (official_name, category, search_text) so browse/lookup stay cheap. Deletes
    the profile when it has zero contributions left."""
    users = await rdb.community_contributions.distinct("user_id", {"profile_key": key})
    count = len(users)
    if count == 0:
        await rdb.community_profiles.delete_one({"profile_key": key})
        return
    b_norm, m_norm = (key.split("|", 1) + [""])[:2]
    existing = await rdb.community_profiles.find_one({"profile_key": key}, {"_id": 0}) or {}
    disp_brand = brand or existing.get("brand") or ""
    disp_model = model or existing.get("model") or ""
    official_name = await _top_value(rdb, key, "name")
    category = await _top_value(rdb, key, "category")
    search_text = " ".join([disp_brand, disp_model, official_name]).lower().strip()
    set_fields = {
        "profile_key": key,
        "brand": disp_brand,
        "brand_norm": b_norm,
        "model": disp_model,
        "model_norm": m_norm,
        "official_name": official_name,
        "category": category,
        "search_text": search_text,
        "contributor_count": count,
        "updated_at": _now(),
    }
    await rdb.community_profiles.update_one(
        {"profile_key": key},
        {"$set": set_fields, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )


async def contribute_tool(rdb, user_id: str, tool: Dict[str, Any]) -> None:
    """DUAL-WRITE: merge a tool's non-personal fields into the community catalog.
    Idempotent per (user, tool): wipes this user+tool's prior votes and re-adds
    the current ones, so edits stay in sync. Safe to call on every save."""
    tool_id = tool.get("id")
    if not tool_id:
        return
    key = profile_key(tool.get("brand"), _tool_primary_model(tool))

    # Which profiles did this tool previously touch? (so we can recompute them
    # if the brand/model changed and the key moved.)
    prev_keys = await rdb.community_contributions.distinct(
        "profile_key", {"user_id": user_id, "tool_id": tool_id}
    )
    await rdb.community_contributions.delete_many({"user_id": user_id, "tool_id": tool_id})

    affected = set(prev_keys)
    if key:
        brand = str(tool.get("brand") or "").strip()
        model = _tool_primary_model(tool)
        b_norm, m_norm = key.split("|", 1)
        rows = []
        for c in _tool_contributions(tool):
            rows.append({
                "id": str(uuid.uuid4()),
                "profile_key": key,
                "brand_norm": b_norm,
                "model_norm": m_norm,
                "field": c["field"],
                "value": c["value"],
                "value_norm": norm_value(c["value"]),
                "user_id": user_id,
                "tool_id": tool_id,
                "created_at": _now(),
            })
        if rows:
            await rdb.community_contributions.insert_many(rows)
            affected.add(key)
        # Recompute the CURRENT key with fresh display brand/model.
        await _recompute_profile(rdb, key, brand=brand, model=model)
        affected.discard(key)

    for k in affected:
        await _recompute_profile(rdb, k)


async def retract_tool(rdb, user_id: str, tool_id: str) -> None:
    """Remove a tool's contributions (on delete) and recompute affected profiles."""
    keys = await rdb.community_contributions.distinct(
        "profile_key", {"user_id": user_id, "tool_id": tool_id}
    )
    await rdb.community_contributions.delete_many({"user_id": user_id, "tool_id": tool_id})
    for k in keys:
        await _recompute_profile(rdb, k)


async def retract_all_for_user(rdb, user_id: str) -> int:
    """Remove ALL of a user's contributions (on opt-out)."""
    keys = await rdb.community_contributions.distinct("profile_key", {"user_id": user_id})
    res = await rdb.community_contributions.delete_many({"user_id": user_id})
    for k in keys:
        await _recompute_profile(rdb, k)
    return res.deleted_count


async def recontribute_all_for_user(rdb, user_id: str) -> int:
    """(Re)contribute all of a user's current tools — used on opt-in and bootstrap."""
    n = 0
    async for tool in rdb.tools.find({"owner_id": user_id}):
        await contribute_tool(rdb, user_id, tool)
        n += 1
    return n


async def _ranked_fields(rdb, key: str, *, requester_id: Optional[str]) -> Dict[str, Any]:
    """Per-field ranked options for a profile. Values are counted by DISTINCT
    users and only those meeting the consensus threshold are returned — except
    the requester always sees values they themselves contributed."""
    pipeline = [
        {"$match": {"profile_key": key}},
        {"$group": {
            "_id": {"field": "$field", "value_norm": "$value_norm"},
            "users": {"$addToSet": "$user_id"},
            "sample": {"$first": "$value"},
        }},
    ]
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    async for row in rdb.community_contributions.aggregate(pipeline):
        field = row["_id"]["field"]
        users = row.get("users") or []
        count = len(users)
        visible = count >= CONSENSUS_THRESHOLD or (requester_id in users)
        if not visible:
            continue
        grouped.setdefault(field, []).append({
            "value": row.get("sample") or "",
            "count": count,
        })
    for field in grouped:
        grouped[field].sort(key=lambda x: (-x["count"], x["value"].lower()))
    return grouped


class ToggleBody(BaseModel):
    opt_in: bool


def register_community_routes(api_router: APIRouter) -> None:
    # Imported here to avoid any import cycle at module load.
    from core import real_db, get_current_user
    from auth import User

    def _require_admin(user: "User"):
        import os
        admins = [e.strip().lower() for e in (os.getenv("ADMIN_EMAILS", "") or "").split(",") if e.strip()]
        if (user.email or "").lower() not in admins:
            raise HTTPException(403, "Admin only")

    @api_router.get("/community/settings")
    async def community_settings(user: "User" = Depends(get_current_user)):
        return {"opt_in": bool(getattr(user, "community_opt_in", True))}

    @api_router.put("/community/settings")
    async def set_community_settings(body: ToggleBody, user: "User" = Depends(get_current_user)):
        await real_db.users.update_one(
            {"id": user.id},
            {"$set": {"community_opt_in": bool(body.opt_in), "updated_at": _now()}},
        )
        if body.opt_in:
            n = await recontribute_all_for_user(real_db, user.id)
            return {"opt_in": True, "contributed_items": n}
        removed = await retract_all_for_user(real_db, user.id)
        return {"opt_in": False, "retracted_contributions": removed}

    @api_router.get("/community/lookup")
    async def community_lookup(
        model: str = "", brand: str = "", user: "User" = Depends(get_current_user)
    ):
        """Look up a model number in the shared catalog. Returns one of three
        branches: none | one | multiple, plus the candidate profile cards."""
        m_norm = norm(model)
        if not m_norm:
            return {"branch": "none", "matches": []}
        q: Dict[str, Any] = {"model_norm": m_norm}
        if brand.strip():
            q["brand_norm"] = norm(brand)
        matches: List[Dict[str, Any]] = []
        async for p in real_db.community_profiles.find(q, {"_id": 0}):
            # Visible if it has cross-user consensus OR the requester contributed.
            visible = (p.get("contributor_count", 0) >= CONSENSUS_THRESHOLD)
            if not visible:
                mine = await real_db.community_contributions.find_one(
                    {"profile_key": p["profile_key"], "user_id": user.id}, {"_id": 0, "id": 1}
                )
                visible = bool(mine)
            if not visible:
                continue
            matches.append({
                "profile_key": p["profile_key"],
                "brand": p.get("brand") or "",
                "model": p.get("model") or "",
                "official_name": p.get("official_name") or "",
                "contributor_count": p.get("contributor_count", 0),
            })
        matches.sort(key=lambda x: -x["contributor_count"])
        branch = "none" if not matches else ("one" if len(matches) == 1 else "multiple")
        return {"branch": branch, "matches": matches}

    @api_router.get("/community/browse")
    async def community_browse(
        q: str = "", category: str = "", limit: int = 40, skip: int = 0,
        user: "User" = Depends(get_current_user),
    ):
        """Browse/search the shared catalog. Only profiles with cross-user
        consensus (>= threshold contributors) are listed."""
        query: Dict[str, Any] = {"contributor_count": {"$gte": CONSENSUS_THRESHOLD}}
        if q.strip():
            query["search_text"] = {"$regex": re.escape(q.strip().lower())}
        if category.strip():
            query["category"] = {"$regex": f"^{re.escape(category.strip())}$", "$options": "i"}
        limit = max(1, min(limit, 100))
        cursor = (
            real_db.community_profiles.find(query, {"_id": 0})
            .sort([("contributor_count", -1), ("official_name", 1)])
            .skip(max(0, skip))
            .limit(limit)
        )
        items = []
        async for p in cursor:
            items.append({
                "profile_key": p["profile_key"],
                "brand": p.get("brand") or "",
                "model": p.get("model") or "",
                "official_name": p.get("official_name") or "",
                "category": p.get("category") or "",
                "contributor_count": p.get("contributor_count", 0),
            })
        total = await real_db.community_profiles.count_documents(query)
        return {"items": items, "total": total, "skip": skip, "limit": limit}

    @api_router.get("/community/categories")
    async def community_categories(user: "User" = Depends(get_current_user)):
        """Distinct categories among visible catalog profiles (for the filter)."""
        cats = await real_db.community_profiles.distinct(
            "category", {"contributor_count": {"$gte": CONSENSUS_THRESHOLD}, "category": {"$ne": ""}}
        )
        return {"categories": sorted([c for c in cats if c], key=lambda s: s.lower())}

    @api_router.get("/community/profile/{profile_key:path}")
    async def community_profile(profile_key: str, user: "User" = Depends(get_current_user)):
        """Full profile: per-field ranked options + counts (for the import popup)."""
        p = await real_db.community_profiles.find_one({"profile_key": profile_key}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Product not found")
        fields = await _ranked_fields(real_db, profile_key, requester_id=user.id)
        return {
            "profile_key": profile_key,
            "brand": p.get("brand") or "",
            "model": p.get("model") or "",
            "contributor_count": p.get("contributor_count", 0),
            "fields": fields,
        }

    @api_router.post("/community/admin/bootstrap")
    async def community_bootstrap(user: "User" = Depends(get_current_user)):
        """ADMIN: roll ALL existing opted-in users' items into the catalog.
        Wire-up only in dev — run this after deploying to production."""
        _require_admin(user)
        users = await real_db.users.find(
            {"$or": [{"community_opt_in": {"$ne": False}}]}, {"_id": 0, "id": 1}
        ).to_list(100000)
        total_users = 0
        total_items = 0
        for u in users:
            uid = u.get("id")
            if not uid:
                continue
            n = await recontribute_all_for_user(real_db, uid)
            if n:
                total_users += 1
                total_items += n
        profiles = await real_db.community_profiles.count_documents({})
        visible = await real_db.community_profiles.count_documents(
            {"contributor_count": {"$gte": CONSENSUS_THRESHOLD}}
        )
        return {
            "ok": True,
            "users_processed": total_users,
            "items_contributed": total_items,
            "profiles_total": profiles,
            "profiles_visible": visible,
        }
