from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
import re
from datetime import datetime, timezone, timedelta

from auth import (
    User,
    UserPublic,
    RegisterRequest,
    AuthResponse,
    hash_password,
    verify_password,
    create_token,
    decode_token,
)
from email_sender import send_password_reset_code, send_feedback_email, send_email_change_code

# Core infra (env, Mongo handles, scoped DB proxy, auth dep, rate limiter)
# lives in core.py (god-file refactor B2).
from core import (  # noqa: F401,E402
    ROOT_DIR, mongo_url, client, real_db, db,
    current_user_id_var, free_visible_tool_ids_var, TOOL_REF_COLLECTIONS,
    _ScopedCollection, _DBProxy,
    get_current_user, to_public, PUBLIC_PATHS,
    _rate_limit_buckets, _client_ip, _rate_limit, _enforce_rate_limit,
)


app = FastAPI()


@app.middleware("http")
async def attach_user_to_context(request: Request, call_next):
    """Read JWT from Authorization header and set the current user id in context.
    Also enforces auth on all /api/* routes except /api/auth/* and /api/health.
    """
    path = request.url.path
    if not path.startswith("/api/"):
        return await call_next(request)
    # Public endpoints — no auth required
    if (
        path.startswith("/api/auth/")
        or path == "/api/"
        or path == "/api/health"
        or path == "/api/feedback"
        or path == "/api/guides"
        or path == "/api/revenuecat/webhook"
        or path.startswith("/api/migration/")
        or path.startswith("/api/bootstrap/")
        or path == "/api/admin/gdrive/oauth-callback"
        or path.startswith("/api/preview/")
        or path.startswith("/api/files/")
        or path.startswith("/api/panels/")
    ):
        return await call_next(request)
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    token = auth[7:].strip()
    try:
        uid = decode_token(token)
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    except Exception:
        return JSONResponse({"detail": "Invalid token"}, status_code=401)
    token_var = current_user_id_var.set(uid)
    visible_var = None
    try:
        # Free-tier visibility cap — must be computed BEFORE handlers run
        # so the _ScopedCollection proxy can read it. Skipped for fast
        # endpoints that don't touch tools to keep auth-only requests
        # snappy. Errors here are swallowed so they never break a
        # request — pessimistic mode = no filter (PRO behaviour).
        try:
            from subscriptions import is_pro as _is_pro, active_tools_query
            if not await _is_pro(real_db, uid):
                # Only ACTIVE tools (non-sold, non-lost) consume a free-tier
                # slot — sold/lost live in archives and must stay visible. So
                # the cap triggers on the ACTIVE count, and when it does we
                # keep the 15 newest active tools PLUS every archived tool
                # visible (hide only the active overflow). This matches
                # enforce_tool_limit + the GET /api/subscription hidden count.
                active_q = active_tools_query(uid)
                active_ids = [
                    doc["id"]
                    async for doc in real_db.tools.find(
                        active_q, {"id": 1, "_id": 0}
                    ).sort([("created_at", -1)])
                    if "id" in doc
                ]
                if len(active_ids) > 15:
                    hidden_ids = set(active_ids[15:])
                    all_ids = {
                        doc["id"]
                        async for doc in real_db.tools.find(
                            {"owner_id": uid}, {"id": 1, "_id": 0}
                        )
                        if "id" in doc
                    }
                    visible_var = free_visible_tool_ids_var.set(all_ids - hidden_ids)
        except Exception:
            pass
        return await call_next(request)
    finally:
        current_user_id_var.reset(token_var)
        if visible_var is not None:
            free_visible_tool_ids_var.reset(visible_var)


api_router = APIRouter(prefix="/api")


# Models, constants and now_iso() live in models.py (god-file refactor B1).
from models import (  # noqa: F401,E402
    now_iso,
    Location, LocationCreate, LocationUpdate,
    Tag, TagCreate, Category, CategoryCreate,
    Brand, BrandCreate, Borrower, BorrowerCreate,
    Agent, AgentCreate, Dealer, BalanceTransaction, TransactionCreate,
    DealerCreate, DealerUpdate, AccountSchedule, PAYMENT_FREQUENCIES,
    Document, ServiceEvent, MaintenanceSchedule, MaintenanceScheduleCreate,
    MaintenanceScheduleUpdate, ServiceEventCreate, LostStatus, ReportLostRequest,
    Warranty, RepairInfo, CLAIM_STATUSES, WarrantyClaim, WarrantyClaimUpdate,
    WishlistItem, WishlistItemCreate, WishlistItemUpdate, ConsumableInfo,
    CheckoutRecord, Tool, ToolCreate, ToolUpdate,
    Bundle, BundleCreate, BundleUpdate, CheckoutRequest,
)

# ---------- Helpers ----------
from helpers import build_tool_query, _validate_photo_payload  # noqa: E402,F401


# ---------- Root ----------
@api_router.get("/")
async def root():
    return {"message": "Toolbox Vault API"}


@api_router.get("/health")
async def health():
    """Lightweight health probe for monitoring & uptime checks. Public."""
    return {"status": "ok", "service": "toolbox-vault-api"}


# Taxonomy CRUD (locations/tags/brands/categories/borrowers) ->
# routes_taxonomy.py (god-file refactor B3).
from routes_taxonomy import (  # noqa: E402,F401
    register_taxonomy_routes, _ensure_brand_saved,
)
register_taxonomy_routes(api_router)

# Dealer routes (dealers/agents/transactions/schedules) ->
# routes_dealers.py (god-file refactor B3).
from routes_dealers import register_dealer_routes  # noqa: E402
register_dealer_routes(api_router)

# Tool routes (CRUD / CSV import-export / list-filter) ->
# routes_tools.py (god-file refactor B3).
from routes_tools import register_tools_routes  # noqa: E402
register_tools_routes(api_router)

# ---------- Prefilled Demo System ----------
class DemoClearRequest(BaseModel):
    mode: str = "keep_taxonomy"  # "everything" | "keep_taxonomy"


@api_router.get("/demo/status")
async def demo_status(user: User = Depends(get_current_user)):
    from demo_seed import demo_status_for_user
    return await demo_status_for_user(real_db, user.id)


@api_router.post("/demo/intro-seen")
async def demo_intro_seen(user: User = Depends(get_current_user)):
    from demo_seed import mark_demo_intro_seen
    await mark_demo_intro_seen(real_db, user.id)
    return {"ok": True}


@api_router.post("/demo/clear")
async def demo_clear(payload: DemoClearRequest, user: User = Depends(get_current_user)):
    from demo_seed import clear_demo_data_for_user
    keep_taxonomy = (payload.mode or "keep_taxonomy") != "everything"
    removed = await clear_demo_data_for_user(real_db, user.id, keep_taxonomy)
    return {"ok": True, "mode": payload.mode, "removed": removed}


# ---------- Data Management: bulk remove + install preloaded ----------
_DM_REMOVE_MAP = {
    "dealers": ["dealers"],
    "contacts": ["borrowers"],
    "claims": ["warranty_claims"],
    "insurance_claims": ["insurance_claims", "claim_evidence"],
    "inventory_items": ["tools", "bundles"],
    "wish_list": ["wishlist"],
    "locations": ["locations"],
    "tags": ["tags"],
    "categories": ["categories"],
    "personal_information": ["personal_profile"],
}
_DM_INSTALL_TYPES = {"categories", "tags", "dealers", "locations"}


class DataMgmtRequest(BaseModel):
    items: List[str] = []


@api_router.post("/data-management/remove")
async def data_management_remove(payload: DataMgmtRequest, user: User = Depends(get_current_user)):
    """Bulk-delete the selected owner-scoped data categories."""
    removed: Dict[str, int] = {}
    for key in payload.items or []:
        for coll in _DM_REMOVE_MAP.get(key, []):
            res = await real_db[coll].delete_many({"owner_id": user.id})
            removed[coll] = res.deleted_count
    return {"ok": True, "removed": removed}


@api_router.post("/data-management/install-preloaded")
async def data_management_install(payload: DataMgmtRequest, user: User = Depends(get_current_user)):
    """Install the standard starter content (the same data new accounts get)
    for only the selected types: categories / tags / dealers / locations."""
    only = {k for k in (payload.items or []) if k in _DM_INSTALL_TYPES}
    if not only:
        return {"ok": True, "installed": {}}
    installed = await seed_default_content_for_user(user.id, only=only)
    return {"ok": True, "installed": installed}



# Per-tool actions (sale/checkout/documents/theft/bulk) -> routes_tool_actions.py (god-file refactor B3).
from routes_tool_actions import register_tool_action_routes  # noqa: E402
register_tool_action_routes(api_router)

# Aggregate / stats / warranty-alerts -> routes_stats.py (god-file refactor B3).
from routes_stats import register_stats_routes  # noqa: E402
register_stats_routes(api_router)

# Upcoming Features / Roadmap (global, admin-managed) -> routes_upcoming.py.
from routes_upcoming import register_upcoming_routes  # noqa: E402
register_upcoming_routes(api_router)

# ---------- Personal Profile (singleton) ----------
class PersonalProfile(BaseModel):
    name: Optional[str] = ""
    address: Optional[str] = ""
    address2: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    zip_code: Optional[str] = ""
    country: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    policy_number: Optional[str] = ""
    insurance_company: Optional[str] = ""
    notes: Optional[str] = ""
    is_company: Optional[bool] = False
    updated_at: str = Field(default_factory=now_iso)


@api_router.get("/personal-profile", response_model=PersonalProfile)
async def get_personal_profile():
    # Per-user singleton — owner_id auto-applied by the db proxy.
    doc = await db.personal_profile.find_one({"id": "self"}, {"_id": 0})
    if not doc:
        return PersonalProfile()
    return PersonalProfile(**doc)


@api_router.put("/personal-profile", response_model=PersonalProfile)
async def update_personal_profile(payload: PersonalProfile):
    data = payload.dict()
    data["id"] = "self"
    data["updated_at"] = now_iso()
    await db.personal_profile.update_one(
        {"id": "self"},
        {"$set": data},
        upsert=True,
    )
    return PersonalProfile(**data)


# ============================================================================
# Auth
# ============================================================================
auth_router = APIRouter(prefix="/api/auth")


async def _claim_orphan_data(user_id: str):
    """When the very first user registers, claim all legacy data (docs without
    an owner_id) for that user. Subsequent users get a clean slate.
    """
    user_count = await real_db.users.count_documents({})
    if user_count != 1:
        return
    collections = [
        "tools",
        "dealers",
        "borrowers",
        "locations",
        "tags",
        "categories",
        "wishlist_items",
        "warranty_claims",
        "personal_profile",
    ]
    for c in collections:
        await real_db[c].update_many(
            {"owner_id": {"$in": [None, ""]}},
            {"$set": {"owner_id": user_id}},
        )
    # personal_profile docs that used _id: "self" — make sure they have id field too
    await real_db.personal_profile.update_many(
        {"_id": "self", "owner_id": user_id, "id": {"$in": [None, ""]}},
        {"$set": {"id": "self"}},
    )


# --------------------------------------------------------------------------
# Default-content seeding for newly registered users
# --------------------------------------------------------------------------
# When a new user signs up, we seed their account with a small set of
# helpful defaults so they're not staring at an empty app on first launch:
#   • 5 well-known tool dealers, pre-populated with the publicly available
#     warranty / customer-service / tech-support contact channels
#   • A handful of tags + categories common to tool inventories
#
# The seed is fully idempotent — if the user already has a same-named
# record we skip rather than duplicate. This lets us safely re-run the
# seed against existing accounts (e.g. for the original owner) without
# creating doubles.

# Maps a (case-insensitive) dealer name to its bundled stock-logo key. Used to
# auto-assign logos to the default dealers (seed + one-time migration for
# existing accounts). Frontend resolves "stock:<key>" to a bundled image.
DEALER_STOCK_LOGO_BY_NAME: Dict[str, str] = {
    "snap-on tools": "stock:snap-on",
    "snap-on": "stock:snap-on",
    "matco tools": "stock:matco",
    "matco": "stock:matco",
    "mac tools": "stock:mac-tools",
    "cornwell tools": "stock:cornwell",
    "cornwell": "stock:cornwell",
    "harbor freight": "stock:harbor-freight",
    "harbor freight tools": "stock:harbor-freight",
    "amazon": "stock:amazon",
}

DEFAULT_DEALERS_SEED: List[Dict[str, Any]] = [
    {
        "name": "Snap-on Tools",
        "logo": "stock:snap-on",
        "phone": "1-877-762-7664",
        "website": "www.snapon.com",
        "address": "Snap-on Incorporated, 2801 80th Street, Kenosha, WI 53143",
        "warranty_contact": "1-877-762-7664",
        "customer_support_contact": "1-877-762-7664",
        "tech_support_contact": "1-800-225-5786",
        "notes": "",
    },
    {
        "name": "Matco Tools",
        "logo": "stock:matco",
        "phone": "866-289-8665",
        "website": "www.matcotools.com",
        "address": "Matco Tools Corporation, 4403 Allen Rd, Stow, OH 44224",
        "warranty_contact": "866-289-8665",
        "customer_support_contact": "866-289-8665",
        "tech_support_contact": "866-289-8665",
        "notes": "",
    },
    {
        "name": "Mac Tools",
        "logo": "stock:mac-tools",
        "phone": "1-800-622-8665",
        "website": "www.mactools.com",
        "address": "Mac Tools, 5195 Blazer Parkway, Dublin, OH 43017",
        "warranty_contact": "1-800-622-8665",
        "customer_support_contact": "1-800-622-8665",
        "tech_support_contact": "1-800-622-8665",
        "notes": "",
    },
    {
        "name": "Cornwell Tools",
        "logo": "stock:cornwell",
        "phone": "1-800-321-8356",
        "website": "www.cornwelltools.com",
        "address": "Cornwell Quality Tools, 667 Seville Road, Wadsworth, OH 44281",
        "warranty_contact": "custserv@cornwelltools.com",
        "customer_support_contact": "1-800-321-8356",
        "tech_support_contact": "1-800-321-8356",
        "notes": "",
    },
    {
        "name": "Harbor Freight",
        "logo": "stock:harbor-freight",
        "phone": "1-800-444-3353",
        "website": "www.harborfreight.com",
        "address": "Harbor Freight Tools, 26677 Agoura Road, Calabasas, CA 91302",
        "warranty_contact": "1-888-838-3421",
        "customer_support_contact": "1-800-444-3353",
        "tech_support_contact": "1-888-838-3421",
        "notes": "",
    },
]

DEFAULT_TAGS_SEED: List[str] = ["Hand tools", "Power tools", "Pneumatic tools"]

DEFAULT_CATEGORIES_SEED: List[str] = [
    "Timing",
    "Specialty Service",
    "Hand Tools",
    "Power Tools",
    "Pneumatic Tools",
]

# Default location hierarchy seeded for new users so the location picker isn't
# empty on first launch and they have a concrete "toolbox → drawer" example to
# build on. Each parent toolbox gets one starter drawer.
DEFAULT_LOCATIONS_SEED: List[Dict[str, Any]] = [
    {"name": "Main Toolbox", "children": ["Drawer 1"]},
    {"name": "Home Toolbox", "children": ["Drawer 1"]},
]


async def seed_default_content_for_user(user_id: str, only: "Optional[set]" = None) -> Dict[str, int]:
    """Insert the default dealers, tags and categories for *user_id*.

    Idempotent — same-named records (case-insensitive for tags / categories,
    exact match for dealer names) are skipped. Returns a small counters
    dict for logging.

    When *only* is given (a set of "dealers"/"tags"/"categories"/"locations"),
    only those content types are seeded; otherwise all are seeded.
    """
    def _want(k: str) -> bool:
        return only is None or k in only
    counters = {"dealers": 0, "tags": 0, "categories": 0, "locations": 0}

    # --- Dealers ---
    # NOTE: This function bypasses the `db` proxy (which auto-injects
    # `owner_id`) and writes to `real_db` directly. So we MUST set
    # `owner_id` ourselves — every other endpoint scopes by `owner_id`,
    # not `user_id`. Setting only `user_id` makes the seed records
    # invisible to the rest of the API, which is exactly the bug new
    # users hit ("0 dealers / tags / categories").
    for d in (DEFAULT_DEALERS_SEED if _want("dealers") else []):
        # Skip if a dealer with this name already exists for the user.
        existing = await real_db.dealers.find_one(
            {"owner_id": user_id, "name": d["name"]}, {"_id": 0, "id": 1}
        )
        if existing:
            continue
        dealer = Dealer(name=d["name"])
        record = dealer.dict()
        record.update({
            "owner_id": user_id,
            "logo": d.get("logo", ""),
            "phone": d.get("phone", ""),
            "website": d.get("website", ""),
            "address": d.get("address", ""),
            "notes": d.get("notes", ""),
            "warranty_contact": d.get("warranty_contact", ""),
            "tech_support_contact": d.get("tech_support_contact", ""),
            "customer_support_contact": d.get("customer_support_contact", ""),
        })
        await real_db.dealers.insert_one(record)
        counters["dealers"] += 1

    # --- Tags ---
    for tag_name in (DEFAULT_TAGS_SEED if _want("tags") else []):
        existing = await real_db.tags.find_one(
            {"owner_id": user_id, "name": {"$regex": f"^{re.escape(tag_name)}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        )
        if existing:
            continue
        tag = Tag(name=tag_name)
        rec = tag.dict()
        rec["owner_id"] = user_id
        await real_db.tags.insert_one(rec)
        counters["tags"] += 1

    # --- Categories ---
    for cat_name in (DEFAULT_CATEGORIES_SEED if _want("categories") else []):
        existing = await real_db.categories.find_one(
            {"owner_id": user_id, "name": {"$regex": f"^{re.escape(cat_name)}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        )
        if existing:
            continue
        cat = Category(name=cat_name)
        rec = cat.dict()
        rec["owner_id"] = user_id
        await real_db.categories.insert_one(rec)
        counters["categories"] += 1

    # --- Locations (parent toolbox → starter drawer) ---
    for loc in (DEFAULT_LOCATIONS_SEED if _want("locations") else []):
        parent_name = loc["name"]
        existing_parent = await real_db.locations.find_one(
            {"owner_id": user_id, "name": {"$regex": f"^{re.escape(parent_name)}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        )
        if existing_parent:
            parent_id = existing_parent["id"]
        else:
            parent = Location(name=parent_name)
            prec = parent.dict()
            prec["owner_id"] = user_id
            await real_db.locations.insert_one(prec)
            parent_id = parent.id
            counters["locations"] += 1
        for idx, child_name in enumerate(loc.get("children", [])):
            existing_child = await real_db.locations.find_one(
                {
                    "owner_id": user_id,
                    "parent_id": parent_id,
                    "name": {"$regex": f"^{re.escape(child_name)}$", "$options": "i"},
                },
                {"_id": 0, "id": 1},
            )
            if existing_child:
                continue
            child = Location(name=child_name, parent_id=parent_id, drawer_index=idx)
            crec = child.dict()
            crec["owner_id"] = user_id
            await real_db.locations.insert_one(crec)
            counters["locations"] += 1

    return counters


# ---------------------------------------------------------------------------
# Admin: one-shot default-content backfill
# ---------------------------------------------------------------------------
# Allows an admin to retroactively seed dealers/tags/categories for any
# user (or every user) who registered before the seed function existed,
# or before the seed-field-name bug was fixed. Idempotent — names are
# de-duped, so it's safe to run multiple times. Admin-only.

class AdminSeedDefaultsRequest(BaseModel):
    # Optional. If omitted, the endpoint seeds EVERY user in the DB.
    # If provided, seeds only that one user.
    user_id: Optional[str] = None


from subscriptions import _require_admin as _require_admin_for_seed  # noqa: E402


@api_router.post("/admin/seed-defaults")
async def admin_seed_defaults(
    payload: AdminSeedDefaultsRequest,
    user: User = Depends(get_current_user),
):
    """Backfill the 5 default dealers / 3 tags / 5 categories for one user
    (when `user_id` is given) or every user (when body is `{}`).
    Idempotent — skips any item whose name already exists for that user."""
    _require_admin_for_seed(user)

    if payload.user_id:
        # Single-user mode
        target = await real_db.users.find_one(
            {"id": payload.user_id}, {"_id": 0, "id": 1, "email": 1}
        )
        if not target:
            raise HTTPException(404, "User not found")
        added = await seed_default_content_for_user(target["id"])
        return {
            "scope": "single",
            "user_id": target["id"],
            "email": target.get("email"),
            "added": added,
        }

    # All-users mode — iterate every user in the DB and seed each.
    summary: List[Dict[str, Any]] = []
    totals = {"dealers": 0, "tags": 0, "categories": 0, "users_touched": 0}
    cursor = real_db.users.find({}, {"_id": 0, "id": 1, "email": 1})
    async for u in cursor:
        added = await seed_default_content_for_user(u["id"])
        # Only record users who actually received NEW records (skips
        # users who already had all defaults — keeps the response small).
        if any(added.values()):
            summary.append({
                "user_id": u["id"],
                "email": u.get("email"),
                "added": added,
            })
            for k in ("dealers", "tags", "categories"):
                totals[k] += added[k]
        totals["users_touched"] += 1
    return {
        "scope": "all",
        "totals": totals,
        "newly_seeded_users": summary,
    }


@api_router.post("/admin/migrate-model-serial")
async def admin_migrate_model_serial(user: User = Depends(get_current_user)):
    """Backfill `model_numbers[]` for every tool that doesn't have one yet.
    Per the user's instructions:
      - Existing `model` and `serial_number` (legacy single-string model #s)
        and `set_serials` (legacy multi-model array) all merge into
        `model_numbers[]`, deduped, order preserved.
      - `serial_numbers[]` stays empty (no real serial numbers were ever
        captured).
      - Legacy fields are left intact so older app builds keep rendering.
    Idempotent — tools that already have model_numbers populated are skipped.
    Admin only."""
    _require_admin_for_seed(user)
    total = 0
    touched = 0
    cursor = real_db.tools.find({}, {"_id": 0})
    async for t in cursor:
        total += 1
        if "model_numbers" in t:
            continue  # already migrated (presence check — empty list also counts)
        candidates: List[str] = []
        for v in (t.get("set_serials") or []):
            if v:
                candidates.append(str(v).strip())
        sn = t.get("serial_number")
        if sn:
            candidates.append(str(sn).strip())
        md = t.get("model")
        if md:
            candidates.append(str(md).strip())
        seen = set()
        mns: List[str] = []
        for v in candidates:
            if v and v not in seen:
                seen.add(v)
                mns.append(v)
        update_doc: Dict[str, Any] = {
            "model_numbers": mns,
            "serial_numbers": t.get("serial_numbers") or [],
        }
        await real_db.tools.update_one({"id": t["id"]}, {"$set": update_doc})
        touched += 1
    return {"total_tools": total, "migrated": touched}


@api_router.post("/admin/refresh-dealer-contacts")
async def admin_refresh_dealer_contacts(user: User = Depends(get_current_user)):
    """One-shot cleanup of pre-existing STOCK dealer contact data.

    New accounts get clean, single-value, tappable contact fields straight
    from DEFAULT_DEALERS_SEED. Accounts created before that seed was cleaned
    up still carry the old verbose strings (e.g. "1-800-MAC-TOOLS (622-8665)
    — select technical / product support option"). This endpoint rewrites the
    company-contact fields of every dealer whose name matches a stock default
    dealer to the clean seed values, so existing users get the same clean
    links. Only the 6 contact fields are touched — balances, agents,
    transactions, schedules and any custom dealers are left untouched.
    Idempotent (skips dealers already matching the clean values). Admin only.
    """
    _require_admin_for_seed(user)
    # Build a case-insensitive name -> clean contact-fields map from the seed.
    CONTACT_KEYS = (
        "phone", "website", "address",
        "warranty_contact", "customer_support_contact", "tech_support_contact",
    )
    seed_by_name = {
        d["name"].strip().lower(): {k: d.get(k, "") for k in CONTACT_KEYS}
        for d in DEFAULT_DEALERS_SEED
    }
    total = 0
    touched = 0
    cursor = real_db.dealers.find({}, {"_id": 0})
    async for d in cursor:
        total += 1
        clean = seed_by_name.get(str(d.get("name", "")).strip().lower())
        if not clean:
            continue  # not a stock dealer — leave the user's custom dealer alone
        # Only write fields that actually differ, so the op is idempotent.
        diff = {k: v for k, v in clean.items() if str(d.get(k, "") or "") != str(v or "")}
        if not diff:
            continue
        await real_db.dealers.update_one({"id": d["id"]}, {"$set": diff})
        touched += 1
    return {"total_dealers": total, "refreshed": touched}




@auth_router.post("/register", response_model=AuthResponse)
async def register(payload: RegisterRequest, request: Request):
    # Rate limit: 3 new accounts per IP per hour (anti-spam).
    _enforce_rate_limit(
        "auth.register",
        _client_ip(request),
        max_count=3,
        window_seconds=3600,
        message="Too many sign-up attempts from this device. Please try again later.",
    )
    email = payload.email.strip().lower()
    existing = await real_db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(400, "Email already registered")
    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        name=(payload.name or "").strip(),
    )
    await real_db.users.insert_one(user.dict())
    # First-user migration
    await _claim_orphan_data(user.id)
    # Seed helpful defaults (dealers, tags, categories) — idempotent.
    try:
        await seed_default_content_for_user(user.id)
    except Exception as e:
        # Never fail registration over seed errors — log and move on.
        logging.getLogger("server").warning(
            "Default-content seed failed for user %s: %s", user.id, e
        )
    # Seed the rich demo / prefilled dataset so the user can explore the app.
    try:
        from demo_seed import seed_demo_data_for_user
        await seed_demo_data_for_user(real_db, user.id)
    except Exception as e:
        logging.getLogger("server").warning(
            "Demo-data seed failed for user %s: %s", user.id, e
        )
    token = create_token(user.id)
    return AuthResponse(token=token, user=to_public(user))


@auth_router.post("/login", response_model=AuthResponse)
async def login(request: Request):
    """Login. Always responds with a uniform 401 for any auth failure
    (bad email format, unknown email, wrong password) so that an attacker
    cannot enumerate which emails are registered.
    """
    # Rate limit: 5 login attempts per IP per minute (anti brute-force).
    _enforce_rate_limit(
        "auth.login",
        _client_ip(request),
        max_count=5,
        window_seconds=60,
        message="Too many login attempts. Please wait a minute and try again.",
    )
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(401, "Invalid email or password")
    email = (payload.get("email") or "").strip().lower() if isinstance(payload, dict) else ""
    password = payload.get("password") or "" if isinstance(payload, dict) else ""
    if not email or "@" not in email or "." not in email or not password:
        raise HTTPException(401, "Invalid email or password")
    udoc = await real_db.users.find_one({"email": email}, {"_id": 0})
    if not udoc:
        raise HTTPException(401, "Invalid email or password")
    if not verify_password(password, udoc.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password")
    user = User(**udoc)
    token = create_token(user.id)
    return AuthResponse(token=token, user=to_public(user))


@auth_router.get("/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)):
    return to_public(user)


@auth_router.put("/me", response_model=UserPublic)
async def update_me(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    updates: Dict[str, Any] = {}
    if "name" in payload:
        updates["name"] = (payload.get("name") or "").strip()
    if "password" in payload and payload["password"]:
        updates["password_hash"] = hash_password(payload["password"])
    if updates:
        updates["updated_at"] = now_iso()
        await real_db.users.update_one({"id": user.id}, {"$set": updates})
        user_doc = await real_db.users.find_one({"id": user.id}, {"_id": 0})
        user = User(**user_doc)
    return to_public(user)


# ---------------------------------------------------------------------------
# Password reset (Forgot Password) — 6-digit code via email
# ---------------------------------------------------------------------------
import secrets

RESET_CODE_TTL_MINUTES = 15
RESET_CODE_MAX_ATTEMPTS = 5


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str


def _generate_reset_code() -> str:
    # 6-digit numeric code
    return f"{secrets.randbelow(1_000_000):06d}"


@auth_router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    """Send a 6-digit password reset code to the user's email.

    Always returns 200 with the same message regardless of whether the email
    exists in our system. This prevents email-enumeration attacks. The
    email is only sent when the user actually exists.
    """
    # Rate limit: 3 reset-code requests per IP per hour (anti email-bombing).
    _enforce_rate_limit(
        "auth.forgot",
        _client_ip(request),
        max_count=3,
        window_seconds=3600,
        message="Too many reset code requests. Please try again in an hour.",
    )
    email = (payload.email or "").strip().lower()
    generic_response = {
        "ok": True,
        "message": "If that email is registered, a 6-digit code has been sent.",
    }
    if not email or "@" not in email:
        return generic_response

    udoc = await real_db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1})
    if not udoc:
        # Silently pretend we sent it
        return generic_response

    code = _generate_reset_code()
    code_hash = hash_password(code)  # store hash, never plaintext
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=RESET_CODE_TTL_MINUTES)).isoformat()

    # Upsert reset record (only one active reset per user at a time)
    await real_db.password_resets.update_one(
        {"user_id": udoc["id"]},
        {
            "$set": {
                "user_id": udoc["id"],
                "email": email,
                "code_hash": code_hash,
                "expires_at": expires_at,
                "attempts": 0,
                "created_at": now_iso(),
            }
        },
        upsert=True,
    )

    # Fire-and-forget the email (never block the response on SMTP)
    try:
        send_password_reset_code(email, code, display_name=udoc.get("name") or "")
    except Exception as e:
        logging.error("Failed to send reset email to %s: %s", email, e)

    return generic_response


@auth_router.post("/reset-password", response_model=AuthResponse)
async def reset_password(payload: ResetPasswordRequest, request: Request):
    """Verify the 6-digit code and set a new password. On success, returns a
    fresh auth token so the user is logged in immediately.
    """
    # Rate limit: 5 reset attempts per IP per minute (anti code brute-force).
    _enforce_rate_limit(
        "auth.reset",
        _client_ip(request),
        max_count=5,
        window_seconds=60,
        message="Too many reset attempts. Please wait a minute and try again.",
    )
    email = (payload.email or "").strip().lower()
    code = (payload.code or "").strip()
    new_password = payload.new_password or ""

    if not email or not code or not new_password:
        raise HTTPException(400, "Email, code, and new password are required.")
    if len(new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters.")

    udoc = await real_db.users.find_one({"email": email}, {"_id": 0})
    if not udoc:
        # Don't leak whether the email exists — generic failure
        raise HTTPException(400, "Invalid or expired code.")

    reset_doc = await real_db.password_resets.find_one({"user_id": udoc["id"]}, {"_id": 0})
    if not reset_doc:
        raise HTTPException(400, "Invalid or expired code.")

    # Check expiry
    try:
        expires_at = datetime.fromisoformat(reset_doc["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    except Exception:
        expires_at = None
    if not expires_at or datetime.now(timezone.utc) > expires_at:
        await real_db.password_resets.delete_one({"user_id": udoc["id"]})
        raise HTTPException(400, "Invalid or expired code.")

    # Check attempts
    if (reset_doc.get("attempts", 0) or 0) >= RESET_CODE_MAX_ATTEMPTS:
        await real_db.password_resets.delete_one({"user_id": udoc["id"]})
        raise HTTPException(
            429,
            "Too many incorrect attempts. Please request a new code.",
        )

    # Verify the code
    if not verify_password(code, reset_doc.get("code_hash", "")):
        await real_db.password_resets.update_one(
            {"user_id": udoc["id"]},
            {"$inc": {"attempts": 1}},
        )
        raise HTTPException(400, "Invalid or expired code.")

    # Success — update the password and burn the reset record
    await real_db.users.update_one(
        {"id": udoc["id"]},
        {"$set": {"password_hash": hash_password(new_password), "updated_at": now_iso()}},
    )
    await real_db.password_resets.delete_one({"user_id": udoc["id"]})

    user_doc = await real_db.users.find_one({"id": udoc["id"]}, {"_id": 0})
    user = User(**user_doc)
    token = create_token(user.id)
    return AuthResponse(token=token, user=to_public(user))


# ---------------------------------------------------------------------------
# Change Login Email — re-auth with current password, then 6-digit code sent
# to the NEW address. Mirrors the forgot/reset-password flow exactly.
# ---------------------------------------------------------------------------
EMAIL_CHANGE_TTL_MINUTES = 15
EMAIL_CHANGE_MAX_ATTEMPTS = 5


class ChangeEmailRequest(BaseModel):
    current_password: str
    new_email: str


class ConfirmEmailChangeRequest(BaseModel):
    code: str


@auth_router.post("/change-email/request")
async def request_change_email(
    payload: ChangeEmailRequest,
    request: Request,
    user: User = Depends(get_current_user),
):
    """Step 1: verify current password, then email a 6-digit code to new_email."""
    _enforce_rate_limit(
        "auth.change_email_req",
        _client_ip(request),
        max_count=5,
        window_seconds=3600,
        message="Too many email-change requests. Please try again later.",
    )
    udoc = await real_db.users.find_one({"id": user.id}, {"_id": 0})
    if not udoc or not verify_password(payload.current_password, udoc.get("password_hash", "")):
        raise HTTPException(401, "Current password is incorrect.")

    new_email = (payload.new_email or "").strip().lower()
    if not new_email or "@" not in new_email or "." not in new_email:
        raise HTTPException(400, "Please enter a valid email address.")
    if new_email == (udoc.get("email") or "").strip().lower():
        raise HTTPException(400, "That is already your login email.")

    existing = await real_db.users.find_one({"email": new_email}, {"_id": 0, "id": 1})
    if existing:
        # Generic message — don't reveal that the email belongs to another account.
        raise HTTPException(400, "This email address is not available.")

    code = _generate_reset_code()
    code_hash = hash_password(code)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(minutes=EMAIL_CHANGE_TTL_MINUTES)
    ).isoformat()

    await real_db.email_changes.update_one(
        {"user_id": user.id},
        {
            "$set": {
                "user_id": user.id,
                "new_email": new_email,
                "code_hash": code_hash,
                "expires_at": expires_at,
                "attempts": 0,
                "created_at": now_iso(),
            }
        },
        upsert=True,
    )

    try:
        send_email_change_code(new_email, code, display_name=udoc.get("name") or "")
    except Exception as e:
        logging.error("Failed to send change-email code to %s: %s", new_email, e)

    return {"ok": True, "message": "A 6-digit code has been sent to your new email."}


@auth_router.post("/change-email/confirm", response_model=AuthResponse)
async def confirm_change_email(
    payload: ConfirmEmailChangeRequest,
    request: Request,
    user: User = Depends(get_current_user),
):
    """Step 2: verify the 6-digit code and apply the email change. Returns a
    fresh auth token reflecting the new email."""
    _enforce_rate_limit(
        "auth.change_email_confirm",
        _client_ip(request),
        max_count=10,
        window_seconds=60,
        message="Too many attempts. Please wait a minute and try again.",
    )
    code = (payload.code or "").strip()
    if not code:
        raise HTTPException(400, "Please enter the 6-digit code.")

    rec = await real_db.email_changes.find_one({"user_id": user.id}, {"_id": 0})
    if not rec:
        raise HTTPException(400, "No pending email change. Please start again.")

    try:
        expires_at = datetime.fromisoformat(rec["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    except Exception:
        expires_at = None
    if not expires_at or datetime.now(timezone.utc) > expires_at:
        await real_db.email_changes.delete_one({"user_id": user.id})
        raise HTTPException(400, "Code expired. Please request a new one.")

    if (rec.get("attempts", 0) or 0) >= EMAIL_CHANGE_MAX_ATTEMPTS:
        await real_db.email_changes.delete_one({"user_id": user.id})
        raise HTTPException(429, "Too many incorrect attempts. Please request a new code.")

    if not verify_password(code, rec.get("code_hash", "")):
        await real_db.email_changes.update_one(
            {"user_id": user.id}, {"$inc": {"attempts": 1}}
        )
        raise HTTPException(400, "Invalid code.")

    new_email = (rec.get("new_email") or "").strip().lower()
    # Race-guard: make sure the email is still free.
    existing = await real_db.users.find_one({"email": new_email}, {"_id": 0, "id": 1})
    if existing and existing.get("id") != user.id:
        await real_db.email_changes.delete_one({"user_id": user.id})
        raise HTTPException(400, "This email address is not available.")

    await real_db.users.update_one(
        {"id": user.id},
        {"$set": {"email": new_email, "updated_at": now_iso()}},
    )
    await real_db.email_changes.delete_one({"user_id": user.id})

    user_doc = await real_db.users.find_one({"id": user.id}, {"_id": 0})
    u = User(**user_doc)
    token = create_token(u.id)
    return AuthResponse(token=token, user=to_public(u))


# ---------- DELETE ACCOUNT (irreversible) ----------
class DeleteAccountRequest(BaseModel):
    password: str


# Every collection that holds user-owned data — must wipe each on account delete.
USER_DATA_COLLECTIONS = [
    "tools",
    "dealers",
    "borrowers",
    "locations",
    "tags",
    "categories",
    "wishlist_items",
    "warranty_claims",
    "personal_profile",
    "checkout_history",
    "feedback",
    "password_resets",
    "saved_reports",
    "saved_report_presets",
    "report_presets",
    "maintenance_log",
    "maintenance_schedules",
    "tool_documents",
    "user_prefs",
    "preferences",
    "user_preferences",
]


@auth_router.delete("/account")
async def delete_account(
    payload: DeleteAccountRequest, user: User = Depends(get_current_user)
):
    """Permanently delete the authenticated user's account and ALL associated
    data across every collection. Requires the user's password as a
    confirmation. Returns 401 on wrong password, 200 on success.

    Idempotent across collections that may not exist (motor `delete_many`
    on a non-existent collection is a no-op).
    """
    udoc = await real_db.users.find_one({"id": user.id}, {"_id": 0})
    if not udoc:
        raise HTTPException(401, "Account not found")
    if not verify_password(payload.password or "", udoc.get("password_hash", "")):
        raise HTTPException(401, "Incorrect password")

    uid = user.id
    deleted = {"user_id": uid, "collections": {}, "total": 0}
    for coll in USER_DATA_COLLECTIONS:
        try:
            res = await real_db[coll].delete_many({"owner_id": uid})
            n = int(getattr(res, "deleted_count", 0) or 0)
            if n > 0:
                deleted["collections"][coll] = n
                deleted["total"] += n
        except Exception as e:
            logging.warning("Delete-account: skip collection %s (%s)", coll, e)

    # Also wipe any password reset rows tied to this user (might have been
    # missed if owner_id wasn't set on those rows).
    try:
        await real_db.password_resets.delete_many({"user_id": uid})
    except Exception:
        pass
    try:
        await real_db.password_resets.delete_many({"email": (udoc.get("email") or "").lower()})
    except Exception:
        pass

    # Finally remove the user record itself — by id AND by email (case-
    # insensitive), so the email is GUARANTEED freed for re-registration
    # even in the unlikely case of duplicate rows or case mismatches.
    user_email_lower = (udoc.get("email") or "").strip().lower()
    try:
        await real_db.users.delete_one({"id": uid})
    except Exception as e:
        logging.error("Delete-account: failed to delete user record by id: %s", e)
        raise HTTPException(500, "Could not delete account record")
    if user_email_lower:
        try:
            # Sweep any stragglers that match the email (case-insensitive).
            email_re = {"$regex": f"^{re.escape(user_email_lower)}$", "$options": "i"}
            extra = await real_db.users.delete_many({"email": email_re})
            if getattr(extra, "deleted_count", 0):
                logging.info(
                    "Delete-account: cleaned %d stray user row(s) for email %s",
                    extra.deleted_count,
                    user_email_lower,
                )
        except Exception as e:
            logging.warning("Delete-account: email sweep failed: %s", e)

    # Sanity check — log if any user with this email survived (should be 0)
    try:
        survivors = await real_db.users.count_documents(
            {"email": {"$regex": f"^{re.escape(user_email_lower)}$", "$options": "i"}}
            if user_email_lower
            else {"id": uid}
        )
        if survivors:
            logging.warning(
                "Delete-account: %d residual user row(s) remain for %s — email may still be locked.",
                survivors,
                user_email_lower or uid,
            )
    except Exception:
        pass

    logging.info("Account deleted: %s (%s) — %d records purged", uid, user_email_lower, deleted["total"])
    return {"ok": True, "deleted": deleted, "message": "Account permanently deleted."}


# ---------------------------------------------------------------------------
# (AI Receipt Scanner section — removed 2026-05-27)
# All scanner endpoints, request/response models, and OCR plumbing have been
# deleted per user request. Only the `_normalize_date` helper is retained
# because other parts of the codebase still call it for date input cleanup.
# ---------------------------------------------------------------------------


def _normalize_date(s: str) -> str:
    """Best-effort normalise common receipt date formats to YYYY-MM-DD.
    Handles 'M/D/YYYY', 'MM/DD/YYYY', 'M-D-YYYY', 'YYYY/MM/DD', 'YYYY-MM-DD',
    'D/M/YYYY' (ambiguous — assumes US M/D when day<=12). Returns '' on failure.
    """
    if not s:
        return ""
    txt = str(s).strip()
    if not txt:
        return ""
    # Strip time-of-day if present
    txt = re.split(r"\s+", txt, maxsplit=1)[0]
    # Already ISO?
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", txt)
    if m:
        y, mo, d = m.groups()
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
    # YYYY/MM/DD
    m = re.match(r"^(\d{4})/(\d{1,2})/(\d{1,2})$", txt)
    if m:
        y, mo, d = m.groups()
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
    # M/D/YYYY or M-D-YYYY (US format — assume M first)
    m = re.match(r"^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$", txt)
    if m:
        a, b, c = m.groups()
        a_i, b_i, c_i = int(a), int(b), int(c)
        if c_i < 100:
            c_i += 2000 if c_i < 70 else 1900  # 2-digit year
        # Decide M/D vs D/M — if first part > 12 it must be a day
        if a_i > 12 and b_i <= 12:
            mo, d, y = b_i, a_i, c_i
        else:
            mo, d, y = a_i, b_i, c_i
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y:04d}-{mo:02d}-{d:02d}"
    return ""


# ---------------------------------------------------------------------------
# BACKWARDS-COMPATIBILITY STUB — old native app v2.1.1 (and any earlier
# TestFlight/Play Store build) still has a "Scan Receipt" button that POSTs
# to /api/ai/receipt-scan. After we deleted the feature, those clients
# would get a generic 404 which surfaces as an ugly error popup.
#
# These two stubs return HTTP 410 GONE with a user-friendly message asking
# them to update their app. They take ZERO LLM calls, do ZERO work — just
# raise an HTTPException with a graceful detail.
#
# Safe to remove once you're confident no users are still on v2.1.1.
# ---------------------------------------------------------------------------
_RECEIPT_SCAN_GONE_MSG = (
    "Receipt scanning has been replaced with photo upload. Please update "
    "the app to the latest version to use the new receipt feature."
)


@api_router.post("/ai/receipt-scan")
async def ai_receipt_scan_gone():
    raise HTTPException(status_code=410, detail=_RECEIPT_SCAN_GONE_MSG)


@api_router.post("/ocr/receipt")
async def ocr_receipt_gone():
    raise HTTPException(status_code=410, detail=_RECEIPT_SCAN_GONE_MSG)


app.include_router(api_router)
app.include_router(auth_router)

# ---------------------------------------------------------------------------
# GridFS-backed media storage (/api/files/*) — offloads base64 photos out of
# Mongo documents. init_media() binds the GridFS bucket to the real database.
# ---------------------------------------------------------------------------
import media  # noqa: E402

media.init_media(real_db)
app.include_router(media.router, prefix="/api")


# ---------------------------------------------------------------------------
# Subscription / Entitlement router (RevenueCat webhook + /subscription + /promo/redeem)
# ---------------------------------------------------------------------------
from subscriptions import make_router as _make_subscriptions_router  # noqa: E402

app.include_router(_make_subscriptions_router(real_db, get_current_user))

# ---------------------------------------------------------------------------
# Database backups (audit #17): admin endpoints + monthly scheduler.
# ---------------------------------------------------------------------------
from backups import (  # noqa: E402
    make_backup_router as _make_backup_router,
    start_backup_scheduler as _start_backup_scheduler,
)
from subscriptions import _require_admin as _require_admin_for_backups  # noqa: E402

app.include_router(
    _make_backup_router(
        lambda: real_db,
        get_current_user,
        _require_admin_for_backups,
    )
)

# Disaster-recovery: full snapshots (incl. code) + restore engine + bootstrap.
from recovery import make_recovery_router as _make_recovery_router  # noqa: E402

app.include_router(
    _make_recovery_router(
        lambda: real_db,
        get_current_user,
        _require_admin_for_backups,
    )
)


@app.on_event("startup")
async def _kick_off_backup_scheduler() -> None:
    """Idempotently start the monthly DB backup task on every boot."""
    _start_backup_scheduler(lambda: real_db)


# ---------------------------------------------------------------------------
# Setup-Guides viewer (/api/guides)
# Renders the markdown setup guides under /app/memory/ as a single styled
# HTML page so the user can bookmark it and reference it any time.
# ---------------------------------------------------------------------------
from fastapi.responses import HTMLResponse  # noqa: E402

_GUIDES_DIR = Path(__file__).parent.parent / "memory"
_GUIDE_FILES = [
    ("migration", "MIGRATION_GUIDE.md",              "MIGRATION — Take Everything Off This Container"),
    ("apple",      "setup_apple_subscriptions.md", "Apple App Store Connect — Subscription Setup"),
    ("google",     "setup_google_subscriptions.md", "Google Play Console — Subscription Setup"),
    ("revenuecat", "setup_revenuecat.md",           "RevenueCat — Setup"),
    ("privacy",    "PRIVACY_POLICY_TEMPLATE.md",    "Privacy Policy — Template"),
    ("terms",      "TERMS_OF_SERVICE_TEMPLATE.md",  "Terms of Service — Template"),
]


def _render_guides_html() -> str:
    try:
        import markdown as _md  # type: ignore
    except Exception:  # pragma: no cover
        _md = None

    sections = []
    toc = []
    for slug, fname, title in _GUIDE_FILES:
        fpath = _GUIDES_DIR / fname
        try:
            raw = fpath.read_text(encoding="utf-8")
        except FileNotFoundError:
            raw = f"_(file `{fname}` not found)_"
        if _md:
            html = _md.markdown(
                raw,
                extensions=["extra", "sane_lists", "toc", "tables", "fenced_code"],
            )
        else:
            # Fallback: <pre> if Python markdown isn't installed
            html = f"<pre>{raw}</pre>"
        sections.append(f'<section id="{slug}"><h1>{title}</h1>{html}</section>')
        toc.append(f'<a href="#{slug}">{title}</a>')

    css = """
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
           line-height: 1.6; max-width: 880px; margin: 0 auto; padding: 24px;
           color: #1a1a1a; background: #fff; }
    @media (prefers-color-scheme: dark) {
        body { color: #e8e8e8; background: #111; }
        a { color: #4ea1ff; }
        .nav { background: #1c1c1e; border-color: #333; }
        code, pre { background: #1c1c1e !important; }
    }
    .nav { position: sticky; top: 0; background: #fff; padding: 12px 16px; margin: -24px -24px 24px;
           border-bottom: 1px solid #e5e5e5; display: flex; flex-wrap: wrap; gap: 6px 12px;
           font-size: 13px; z-index: 10; }
    .nav strong { width: 100%; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: .04em; }
    .nav a { color: #4ea1ff; text-decoration: none; padding: 4px 10px; border: 1px solid #4ea1ff; border-radius: 6px; }
    .nav a:hover { background: rgba(78,161,255,.1); }
    section { padding: 24px 0 48px; border-bottom: 2px solid #e5e5e5; }
    section:last-child { border-bottom: none; }
    h1 { font-size: 26px; padding-bottom: 8px; border-bottom: 2px solid #4ea1ff; }
    h2 { font-size: 20px; margin-top: 28px; padding-bottom: 4px; border-bottom: 1px solid #e5e5e5; }
    h3 { font-size: 16px; margin-top: 20px; }
    code { background: #f6f6f6; padding: 2px 6px; border-radius: 4px; font-size: 90%; }
    pre { background: #f6f6f6; padding: 12px; border-radius: 6px; overflow-x: auto; }
    pre code { background: transparent; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14px; }
    th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: rgba(127,127,127,.08); }
    blockquote { margin: 12px 0; padding: 8px 14px; border-left: 4px solid #4ea1ff;
                 background: rgba(78,161,255,.05); }
    hr { border: 0; border-top: 1px solid #e5e5e5; margin: 24px 0; }
    li input[type=checkbox] { margin-right: 6px; }
    """
    body = (
        '<div class="nav">'
        '<strong>Toolbox Vault — Setup Guides</strong>'
        + "".join(toc) +
        '</div>'
        + "".join(sections)
    )
    return (
        "<!DOCTYPE html>\n<html lang='en'>\n<head>"
        "<meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        "<title>Toolbox Vault — Setup Guides</title>"
        f"<style>{css}</style>"
        "</head><body>"
        + body +
        "</body></html>"
    )


@app.get("/api/guides", response_class=HTMLResponse)
async def get_setup_guides():
    """Public bookmarkable page that renders all 5 setup guides as one HTML doc.

    No auth required — these guides contain no secrets. They are convenience
    documentation for the app owner.
    """
    return HTMLResponse(_render_guides_html())


# ---------------------------------------------------------------------------
# Migration download — token-protected endpoints to download the code +
# database tarballs created at /app/migration. Token lives in
# MIGRATION_DOWNLOAD_TOKEN env var. Used when the project owner wants to
# leave the platform and take their data with them.
# ---------------------------------------------------------------------------
from fastapi.responses import FileResponse  # noqa: E402

_MIG_DIR = Path(__file__).parent.parent / "migration"
_PANELS_DIR = Path(__file__).parent / "static" / "panels"


@app.get("/api/panels/{filename}")
async def panel_image(filename: str):
    """Public — serve temporary design-showcase panel textures over the network
    so they are NOT bundled into the app's startup JS graph."""
    if "/" in filename or ".." in filename or not filename.endswith(".png"):
        raise HTTPException(404, "Not found")
    fpath = _PANELS_DIR / filename
    if not fpath.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(path=str(fpath), media_type="image/png")


@app.get("/api/migration/{filename}")
async def migration_download(filename: str, token: str = ""):
    if not token or token != os.environ.get("MIGRATION_DOWNLOAD_TOKEN", "").strip():
        raise HTTPException(403, "Invalid or missing token")
    # Only allow the two specific tarballs
    if filename not in ("mongo-dump.tar.gz", "toolbox-vault-code.tar.gz"):
        raise HTTPException(404, "File not available")
    fpath = _MIG_DIR / filename
    if not fpath.exists():
        raise HTTPException(404, "Archive not generated")
    return FileResponse(
        path=str(fpath),
        media_type="application/gzip",
        filename=filename,
    )


# (Removed temporary design-mockup preview endpoints and backend/generated/
# folder — moved to /app/design_archive/ to keep them out of the deploy bundle.)







# ---------------------------------------------------------------------------
# Feedback endpoint — registered directly on app (api_router is already included above)
# ---------------------------------------------------------------------------
FEEDBACK_DEST_EMAIL = os.environ.get("GMAIL_FROM_ADDRESS", "MechanicVault@gmail.com")
FEEDBACK_RATE_WINDOW_SECONDS = 600  # 10 minutes
FEEDBACK_RATE_MAX = 5              # 5 submissions per IP per 10 min

# In-memory rate-limit bucket: {ip: [timestamp, ...]}
_feedback_rate_buckets: Dict[str, List[float]] = {}


class FeedbackRequest(BaseModel):
    name: str
    email: str
    subject: str
    message: str
    platform: Optional[str] = ""
    is_bug: bool = False
    is_feature: bool = False
    app_version: Optional[str] = ""
    # Honeypot — bots fill hidden fields; humans don't.
    website: Optional[str] = ""
    # Optional screenshot — user-attached PNG/JPEG image, base64-encoded.
    # Frontend caps at ~1 MB before sending to keep payload manageable.
    screenshot_base64: Optional[str] = None


def _feedback_rate_limit(ip: str) -> bool:
    """Return True if the IP is *under* the limit (allowed), False if rate-limited."""
    import time as _time
    now = _time.time()
    cutoff = now - FEEDBACK_RATE_WINDOW_SECONDS
    bucket = [t for t in _feedback_rate_buckets.get(ip, []) if t > cutoff]
    if len(bucket) >= FEEDBACK_RATE_MAX:
        _feedback_rate_buckets[ip] = bucket
        return False
    bucket.append(now)
    _feedback_rate_buckets[ip] = bucket
    return True


@app.post("/api/feedback")
async def submit_feedback(payload: FeedbackRequest, request: Request):
    """Receive feedback / bug report / feature request and email it to the
    operator (MechanicVault@gmail.com). Reply-To is set to the user's email
    so operator replies go straight to the user.
    """
    # Honeypot — silently drop bot traffic
    if (payload.website or "").strip():
        return {"ok": True, "message": "Thanks!"}

    # Basic validation
    name = (payload.name or "").strip()
    email_addr = (payload.email or "").strip()
    subject = (payload.subject or "").strip()
    message = (payload.message or "").strip()
    if not name:
        raise HTTPException(400, "Please provide your name.")
    if not email_addr or "@" not in email_addr or "." not in email_addr:
        raise HTTPException(400, "Please provide a valid email address.")
    if not subject:
        raise HTTPException(400, "Please provide a subject.")
    if not message:
        raise HTTPException(400, "Please provide a message.")
    if len(message) > 20000:
        raise HTTPException(400, "Message is too long.")

    # Rate-limit by IP. Behind K8s ingress, request.client.host is always the
    # ingress pod IP, so prefer X-Forwarded-For for the real client IP.
    xff = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    client_ip = xff or (request.client.host if request.client else "unknown")
    if not _feedback_rate_limit(client_ip):
        raise HTTPException(
            429,
            "Too many messages from this device. Please try again in a few minutes.",
        )

    # Cap screenshot at 2 MB raw (~2.7 MB base64) to keep DB and email sane.
    screenshot_b64 = payload.screenshot_base64 or None
    if screenshot_b64 and len(screenshot_b64) > 3_500_000:
        screenshot_b64 = None  # silently drop oversized; user already submitted

    # Persist a record (so operator has a searchable log even if email fails)
    record = {
        "id": str(uuid.uuid4()),
        "name": name,
        "email": email_addr,
        "subject": subject,
        "message": message,
        "platform": (payload.platform or "").strip(),
        "is_bug": bool(payload.is_bug),
        "is_feature": bool(payload.is_feature),
        "app_version": (payload.app_version or "").strip(),
        "ip": client_ip,
        "has_screenshot": bool(screenshot_b64),
        "screenshot_base64": screenshot_b64,
        "created_at": now_iso(),
    }
    try:
        await real_db.feedback.insert_one(record)
    except Exception as e:
        logging.error("Failed to persist feedback record: %s", e)

    # Send the email (non-blocking-style: log errors but return success)
    sent = False
    try:
        sent = send_feedback_email(
            to_address=FEEDBACK_DEST_EMAIL,
            from_name=name,
            from_email=email_addr,
            subject=subject,
            message=message,
            is_bug=bool(payload.is_bug),
            is_feature=bool(payload.is_feature),
            platform=(payload.platform or ""),
            app_version=(payload.app_version or ""),
            screenshot_base64=screenshot_b64,
        )
    except Exception as e:
        logging.error("send_feedback_email raised: %s", e)

    if not sent:
        # Don't fail hard — the record is saved; operator can still see it.
        logging.warning("Feedback record %s saved but email send failed.", record["id"])

    return {"ok": True, "message": "Thanks — your message has been sent."}

# ---------------------------------------------------------------------------
# Unified report engine (HTML→PDF + CSV) — see /app/backend/reports.py
# ---------------------------------------------------------------------------
from reports import make_reports_router as _make_reports_router  # noqa: E402

_reports_api_router = APIRouter(prefix="/api")
_make_reports_router(_reports_api_router, lambda: db, get_current_user)
app.include_router(_reports_api_router)

# ---------------------------------------------------------------------------
# Insurance Claims module — documentation & reporting (see insurance_claims.py)
# ---------------------------------------------------------------------------
from insurance_claims import make_insurance_claims_router as _make_ic_router  # noqa: E402

_ic_api_router = APIRouter(prefix="/api")
_make_ic_router(_ic_api_router, lambda: db, get_current_user)
app.include_router(_ic_api_router)

# ---------------------------------------------------------------------------
# HTML → PDF rendering endpoint (uses xhtml2pdf, runs entirely server-side
# so reports work reliably regardless of browser quirks / CSP restrictions).
# ---------------------------------------------------------------------------
from fastapi import Body
from fastapi.responses import Response as FastAPIResponse
from io import BytesIO
import re as _re_html

# xhtml2pdf is intentionally imported lazily (heavy import, ~1s).
_pisa = None


def _get_pisa():
    global _pisa
    if _pisa is None:
        from xhtml2pdf import pisa as _pisa_mod  # noqa: WPS433
        _pisa = _pisa_mod
    return _pisa


def _sanitize_html_for_pdf(html: str) -> str:
    """xhtml2pdf is a strict, non-browser HTML parser. It chokes on
    a handful of modern features that browsers tolerate. Sanitise so
    the parser never errors on safe-to-ignore CSS / structures.

    Note: word-boundary lookbehind/lookahead are crucial — without them,
    `transform` would also strip the value of `text-transform`, leaving
    malformed CSS like `text- display: block;`.
    """
    # The list of property NAMES (full names only — no prefix overlap).
    # Note: page-break-* IS supported by xhtml2pdf and must NOT be stripped.
    bad_props = [
        "object-fit",
        "gap",
        "row-gap",
        "column-gap",
        "grid-template-columns",
        "grid-template-rows",
        "grid-template-areas",
        "grid-area",
        "grid-column",
        "grid-row",
        "grid-auto-flow",
        "tab-size",
        "will-change",
        "backdrop-filter",
        "box-shadow",
        "transform",
        "transition",
        "animation",
        "-webkit-print-color-adjust",
        "print-color-adjust",
        "flex",
        "flex-direction",
        "flex-wrap",
        "flex-flow",
        "flex-shrink",
        "flex-grow",
        "flex-basis",
        "justify-content",
        "justify-items",
        "justify-self",
        "align-items",
        "align-content",
        "align-self",
        "place-items",
        "place-content",
        "order",
        "filter",
    ]
    # `(?<![\w-])` — must NOT be preceded by a word char or '-'  (so `text-transform`
    # won't match `transform`). `(?=\s*:)` — must be followed by a colon.
    name_alt = "|".join(_re_html.escape(p) for p in bad_props)
    bad_decl = _re_html.compile(
        rf"(?<![\w-])(?:{name_alt})\s*:[^;}}]*;?",
        _re_html.IGNORECASE,
    )
    return bad_decl.sub("", html)


@app.post("/api/render-pdf")
async def render_pdf(
    payload: dict = Body(...),
    user=Depends(get_current_user),
):
    """Convert an HTML report payload into a PDF binary.

    Body: { "html": "<...>", "filename": "report.pdf" }
    Returns: application/pdf with Content-Disposition attachment.
    """
    # Rate limit: 20 PDF renders per user per hour (protect server CPU).
    _enforce_rate_limit(
        "pdf.render",
        user.id,
        max_count=20,
        window_seconds=3600,
        message="You have generated a lot of PDFs in the last hour. "
        "Please wait a bit before generating more.",
    )
    html = payload.get("html") or ""
    filename = payload.get("filename") or "report.pdf"
    if not html:
        raise HTTPException(400, "Missing 'html'")
    if not filename.lower().endswith(".pdf"):
        filename = f"{filename}.pdf"

    safe_html = _sanitize_html_for_pdf(html)
    pisa = _get_pisa()
    buf = BytesIO()
    try:
        result = pisa.CreatePDF(safe_html, dest=buf, encoding="utf-8")
    except Exception as exc:  # pragma: no cover
        raise HTTPException(500, f"PDF generation failed: {exc!s}") from exc

    if result.err:
        raise HTTPException(500, f"PDF generation failed (errors={result.err})")

    return FastAPIResponse(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


app.add_middleware(
    CORSMiddleware,
    # We authenticate with a JWT in the Authorization header (not cookies),
    # so we do not need credentialed CORS. Disabling credentials lets us
    # safely keep allow_origins=['*'] (Starlette refuses '*' + credentials=True).
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# ---------------------------------------------------------------------------
# MongoDB indexes — ensure on startup. Idempotent: creating an existing index
# is a no-op. All indexes are non-unique (except where noted) and additive,
# so this cannot change query results — only speed them up.
# ---------------------------------------------------------------------------
INDEX_PLAN = [
    # collection,            keys,                                     options
    ("users",                [("email", 1)],                          {"unique": True, "name": "email_unique"}),
    ("users",                [("id", 1)],                              {"unique": True, "name": "id_unique"}),
    ("tools",                [("owner_id", 1)],                        {"name": "owner_id_idx"}),
    ("tools",                [("owner_id", 1), ("name", 1)],           {"name": "owner_name_idx"}),
    ("tools",                [("owner_id", 1), ("dealer_id", 1)],      {"name": "owner_dealer_idx"}),
    ("tools",                [("owner_id", 1), ("status", 1)],         {"name": "owner_status_idx"}),
    ("tools",                [("owner_id", 1), ("location_id", 1)],    {"name": "owner_location_idx"}),
    ("tools",                [("owner_id", 1), ("for_sale", 1)],       {"name": "owner_for_sale_idx"}),
    # Audit #16: hot-path compound indexes for filters/alerts that currently
    # do collection scans within owner_id partition. Each saves a partition
    # scan on lists that grow with tool count.
    ("tools",                [("owner_id", 1), ("is_sold", 1)],        {"name": "owner_is_sold_idx"}),
    ("tools",                [("owner_id", 1), ("lost_status.is_lost", 1)], {"name": "owner_lost_idx"}),
    ("tools",                [("owner_id", 1), ("is_sold", 1), ("lost_status.is_lost", 1)], {"name": "owner_active_idx"}),
    ("tools",                [("owner_id", 1), ("warranty_until", 1)], {"name": "owner_warranty_idx"}),
    ("tools",                [("owner_id", 1), ("created_at", 1)],     {"name": "owner_created_idx"}),
    ("tools",                [("owner_id", 1), ("brand", 1)],          {"name": "owner_brand_idx"}),
    ("tools",                [("owner_id", 1), ("checked_out", 1)],    {"name": "owner_checked_out_idx"}),
    ("tools",                [("id", 1)],                              {"unique": True, "name": "tool_id_unique"}),
    ("locations",            [("owner_id", 1)],                        {"name": "owner_id_idx"}),
    ("locations",            [("owner_id", 1), ("parent_id", 1)],      {"name": "owner_parent_idx"}),
    ("dealers",              [("owner_id", 1)],                        {"name": "owner_id_idx"}),
    ("dealers",              [("owner_id", 1), ("name", 1)],           {"name": "owner_name_idx"}),
    ("tags",                 [("owner_id", 1)],                        {"name": "owner_id_idx"}),
    ("categories",           [("owner_id", 1)],                        {"name": "owner_id_idx"}),
    ("borrowers",            [("owner_id", 1)],                        {"name": "owner_id_idx"}),
    ("borrowers",            [("owner_id", 1), ("name", 1)],           {"name": "owner_name_idx"}),
    ("checkouts",            [("owner_id", 1), ("tool_id", 1)],        {"name": "owner_tool_idx"}),
    ("checkouts",            [("owner_id", 1), ("borrower_id", 1)],    {"name": "owner_borrower_idx"}),
    ("checkouts",            [("owner_id", 1), ("returned_at", 1)],    {"name": "owner_returned_idx"}),
    ("wishlist_items",       [("owner_id", 1)],                        {"name": "owner_id_idx"}),
    ("transactions",         [("owner_id", 1), ("dealer_id", 1)],      {"name": "owner_dealer_idx"}),
    ("transactions",         [("owner_id", 1), ("date", -1)],          {"name": "owner_date_idx"}),
    ("warranty_claims",      [("owner_id", 1)],                        {"name": "owner_id_idx"}),
    ("warranty_claims",      [("owner_id", 1), ("status", 1)],         {"name": "owner_status_idx"}),
    ("warranty_claims",      [("owner_id", 1), ("dealer_id", 1)],      {"name": "owner_dealer_idx"}),
    ("warranty_claims",      [("tool_id", 1)],                         {"name": "tool_id_idx"}),
    ("maintenance_logs",     [("owner_id", 1), ("tool_id", 1)],        {"name": "owner_tool_idx"}),
    ("maintenance_logs",     [("owner_id", 1), ("scheduled_for", 1)],  {"name": "owner_scheduled_idx"}),
    ("activity_log",         [("owner_id", 1), ("at", -1)],            {"name": "owner_at_idx"}),
    ("activity_log",         [("owner_id", 1), ("tool_id", 1)],        {"name": "owner_tool_idx"}),
    ("subscriptions",        [("user_id", 1)],                         {"unique": True, "name": "user_id_unique"}),
    ("promo_codes",          [("code", 1)],                            {"unique": True, "name": "code_unique"}),
    ("password_reset_codes", [("email", 1)],                           {"name": "email_idx"}),
    # TTL: auto-delete expired reset codes 24h after they expire
    ("password_reset_codes", [("expires_at", 1)],                      {"name": "expires_ttl", "expireAfterSeconds": 86400}),
    ("feedback",             [("created_at", -1)],                     {"name": "created_at_idx"}),
]


@app.on_event("startup")
async def ensure_mongo_indexes():
    """Create / refresh indexes on startup. Idempotent.

    We swallow IndexOptionsConflict (raised when an index with the same name
    already exists with slightly different options) and log it — that's fine
    in dev, and we don't want to crash the API on boot for that.
    """
    created = 0
    skipped = 0
    errors: list[str] = []
    for coll_name, keys, options in INDEX_PLAN:
        try:
            await real_db[coll_name].create_index(keys, **options)
            created += 1
        except Exception as e:  # pymongo.errors.OperationFailure most often
            msg = str(e)
            # Index already exists with different options — non-fatal in dev.
            if "IndexOptionsConflict" in msg or "already exists with a different name" in msg or "already exists" in msg.lower():
                skipped += 1
                continue
            errors.append(f"{coll_name}.{options.get('name','?')}: {msg[:140]}")
    if errors:
        logger.warning("Mongo index init: %d ok, %d skipped, %d errors -> %s",
                       created, skipped, len(errors), "; ".join(errors[:3]))
    else:
        logger.info("Mongo index init: %d created/verified, %d skipped (already existed)",
                    created, skipped)



@app.on_event("startup")
async def migrate_dealer_logos():
    """One-time, idempotent: assign bundled stock logos to existing default
    dealers that don't have a logo yet. Covers accounts that were seeded
    before the dealer-logo feature existed (e.g. the current admin account).
    """
    try:
        updated = 0
        cursor = real_db.dealers.find(
            {"$or": [{"logo": {"$exists": False}}, {"logo": ""}, {"logo": None}]},
            {"_id": 0, "id": 1, "name": 1},
        )
        async for d in cursor:
            key = DEALER_STOCK_LOGO_BY_NAME.get(str(d.get("name", "")).strip().lower())
            if key:
                await real_db.dealers.update_one(
                    {"id": d["id"]}, {"$set": {"logo": key}}
                )
                updated += 1
        if updated:
            logger.info("Dealer logo migration: assigned %d stock logos", updated)
    except Exception as e:  # pragma: no cover - defensive, never crash boot
        logger.warning("Dealer logo migration failed: %s", e)
