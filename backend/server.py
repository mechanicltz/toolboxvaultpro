from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
import json
import re
from contextvars import ContextVar
from datetime import datetime, timezone, timedelta

from auth import (
    User,
    UserPublic,
    Subscription,
    RegisterRequest,
    LoginRequest,
    AuthResponse,
    hash_password,
    verify_password,
    create_token,
    decode_token,
    make_subscription_for_tier,
    evaluate_subscription_status,
    TIER_FREE,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
real_db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# ---------- Per-request user context ----------
current_user_id_var: ContextVar[Optional[str]] = ContextVar("current_user_id", default=None)


class _ScopedCollection:
    """Wraps a Motor collection so all queries/inserts are auto-filtered by owner_id."""

    def __init__(self, base, user_id: str):
        self._base = base
        self._uid = user_id

    def _scope(self, q=None):
        q = dict(q or {})
        q["owner_id"] = self._uid
        return q

    def find(self, q=None, *args, **kw):
        return self._base.find(self._scope(q), *args, **kw)

    async def find_one(self, q, *args, **kw):
        return await self._base.find_one(self._scope(q), *args, **kw)

    async def insert_one(self, doc):
        d = dict(doc)
        d["owner_id"] = self._uid
        return await self._base.insert_one(d)

    async def insert_many(self, docs):
        docs = [{**d, "owner_id": self._uid} for d in docs]
        return await self._base.insert_many(docs)

    async def update_one(self, q, *args, **kw):
        return await self._base.update_one(self._scope(q), *args, **kw)

    async def update_many(self, q, *args, **kw):
        return await self._base.update_many(self._scope(q), *args, **kw)

    async def delete_one(self, q):
        return await self._base.delete_one(self._scope(q))

    async def delete_many(self, q):
        return await self._base.delete_many(self._scope(q))

    async def count_documents(self, q):
        return await self._base.count_documents(self._scope(q))

    def aggregate(self, pipeline):
        scoped = [{"$match": {"owner_id": self._uid}}, *list(pipeline)]
        return self._base.aggregate(scoped)


class _DBProxy:
    """Drop-in replacement for `db` that auto-scopes by current user."""

    def __getattr__(self, name):
        coll = real_db[name]
        uid = current_user_id_var.get()
        if uid:
            return _ScopedCollection(coll, uid)
        return coll

    def __getitem__(self, name):
        return self.__getattr__(name)


db = _DBProxy()


# ---------- Auth dependency / helpers ----------
async def get_current_user(request: Request) -> User:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = auth[7:].strip()
    uid = decode_token(token)
    udoc = await real_db.users.find_one({"id": uid}, {"_id": 0})
    if not udoc:
        raise HTTPException(401, "User not found")
    user = User(**udoc)
    # Refresh sub status (may downgrade to free if expired)
    sub = evaluate_subscription_status(user.subscription.dict())
    if sub != user.subscription.dict():
        await real_db.users.update_one({"id": uid}, {"$set": {"subscription": sub, "updated_at": datetime.now(timezone.utc).isoformat()}})
        user.subscription = Subscription(**sub)
    return user


def to_public(u: User) -> UserPublic:
    return UserPublic(
        id=u.id,
        email=u.email,
        name=u.name or "",
        subscription=u.subscription,
        discount_pct=getattr(u, "discount_pct", 0) or 0,
        promo_codes_used=getattr(u, "promo_codes_used", []) or [],
        created_at=u.created_at,
    )


PUBLIC_PATHS = ("/api/auth/", "/api/health", "/api/")


app = FastAPI()


@app.middleware("http")
async def attach_user_to_context(request: Request, call_next):
    """Read JWT from Authorization header and set the current user id in context.
    Also enforces auth on all /api/* routes except /api/auth/* and /api/health.
    """
    path = request.url.path
    if not path.startswith("/api/"):
        return await call_next(request)
    # Public auth endpoints
    if path.startswith("/api/auth/") or path == "/api/" or path == "/api/health":
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
    try:
        return await call_next(request)
    finally:
        current_user_id_var.reset(token_var)


api_router = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------- Models ----------
class Location(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = ""
    parent_id: Optional[str] = None  # for nested locations
    parent_layout_id: Optional[str] = None  # if this location is a drawer in a toolbox
    drawer_index: Optional[int] = None
    created_at: str = Field(default_factory=now_iso)


class LocationCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    parent_id: Optional[str] = None
    parent_layout_id: Optional[str] = None
    drawer_index: Optional[int] = None


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[str] = None


class Tag(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: Optional[str] = "#FFB300"
    created_at: str = Field(default_factory=now_iso)


class TagCreate(BaseModel):
    name: str
    color: Optional[str] = "#FFB300"


class Category(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_at: str = Field(default_factory=now_iso)


class CategoryCreate(BaseModel):
    name: str


class Borrower(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    contact: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class BorrowerCreate(BaseModel):
    name: str
    contact: Optional[str] = ""


# Dealer & Agents
class Agent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    notes: Optional[str] = ""
    started_at: str = Field(default_factory=now_iso)
    ended_at: Optional[str] = None  # when this agent stopped being current


class AgentCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    notes: Optional[str] = ""


class Dealer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: Optional[str] = ""
    website: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""
    route_frequency: Optional[str] = "N/A"  # Weekly | Bi-weekly | Monthly | N/A
    route_day_of_week: Optional[str] = ""  # Mon | Tue | Wed | Thu | Fri | Sat | Sun (when frequency is Weekly/Bi-weekly)
    route_anchor_date: Optional[str] = ""  # YYYY-MM-DD anchor used to compute next visit (mainly for Bi-weekly/Monthly)
    agents: List[Agent] = []
    current_agent_id: Optional[str] = None
    credit_balance: float = 0.0
    personal_balance: float = 0.0
    transactions: List[Dict[str, Any]] = []  # list of BalanceTransaction
    created_at: str = Field(default_factory=now_iso)


class BalanceTransaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    account: str  # "credit" or "personal"
    type: str  # "payment" (decreases balance) or "charge" (increases balance)
    amount: float
    note: Optional[str] = ""
    date: str = Field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    created_at: str = Field(default_factory=now_iso)


class TransactionCreate(BaseModel):
    account: str  # "credit" | "personal"
    type: str  # "payment" | "charge"
    amount: float
    note: Optional[str] = ""
    date: Optional[str] = None


class DealerCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    website: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""
    route_frequency: Optional[str] = "N/A"
    route_day_of_week: Optional[str] = ""
    route_anchor_date: Optional[str] = ""


class DealerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    route_frequency: Optional[str] = None
    route_day_of_week: Optional[str] = None
    route_anchor_date: Optional[str] = None


# Documents
class Document(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    data: str  # base64
    mime_type: Optional[str] = "application/octet-stream"
    size: Optional[int] = 0  # bytes
    uploaded_at: str = Field(default_factory=now_iso)


# Maintenance / Calibration tracking
class ServiceEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # YYYY-MM-DD
    cost: Optional[float] = 0.0
    technician: Optional[str] = ""
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class MaintenanceSchedule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = "Service"  # "Calibration" / "Service" / "Inspection" / custom
    interval_months: int = 12
    last_done_date: Optional[str] = None  # YYYY-MM-DD
    next_due_date: Optional[str] = None  # auto-calculated
    notes: Optional[str] = ""
    history: List[ServiceEvent] = []
    created_at: str = Field(default_factory=now_iso)


class MaintenanceScheduleCreate(BaseModel):
    type: str = "Service"
    interval_months: int = 12
    last_done_date: Optional[str] = None
    notes: Optional[str] = ""


class MaintenanceScheduleUpdate(BaseModel):
    type: Optional[str] = None
    interval_months: Optional[int] = None
    last_done_date: Optional[str] = None
    notes: Optional[str] = None


class ServiceEventCreate(BaseModel):
    date: Optional[str] = None  # default today
    cost: Optional[float] = 0.0
    technician: Optional[str] = ""
    notes: Optional[str] = ""


# Theft / Loss reporting
class LostStatus(BaseModel):
    is_lost: bool = False
    type: str = "lost"  # "lost" or "stolen"
    reported_date: Optional[str] = None  # YYYY-MM-DD
    police_report_number: Optional[str] = ""
    insurance_company: Optional[str] = ""
    insurance_claim_number: Optional[str] = ""
    notes: Optional[str] = ""
    reported_by: Optional[str] = ""
    recovered_at: Optional[str] = None  # if recovered, set to ISO


class ReportLostRequest(BaseModel):
    type: str = "lost"  # lost or stolen
    reported_date: Optional[str] = None
    police_report_number: Optional[str] = ""
    insurance_company: Optional[str] = ""
    insurance_claim_number: Optional[str] = ""
    notes: Optional[str] = ""
    reported_by: Optional[str] = ""


# Warranty
class Warranty(BaseModel):
    has_warranty: bool = False
    provider: Optional[str] = ""
    contact: Optional[str] = ""
    terms: Optional[str] = ""
    length_months: Optional[int] = 0
    coverage_type: Optional[str] = "months"  # "months" | "limited" | "lifetime"
    start_date: Optional[str] = ""  # YYYY-MM-DD
    expiry_date: Optional[str] = ""  # YYYY-MM-DD
    document: Optional[Document] = None


# Repair info
class RepairInfo(BaseModel):
    company_notified: Optional[str] = ""  # legacy — auto-derived from dealer now
    notified_at: Optional[str] = ""  # date or ISO
    expected_completion: Optional[str] = ""  # date
    repair_status: Optional[str] = "Not Reported"  # Not Reported / Reported / In Repair / Awaiting Parts / Repaired
    contact: Optional[str] = ""  # legacy — auto-derived from agent now
    notes: Optional[str] = ""
    broken_photo: Optional[str] = ""  # extra photo, only shown on broken-item view


# Warranty claim — long-lived record that survives "Mark Repaired"
CLAIM_STATUSES = ["broken", "awaiting_approval", "waiting_replacement", "completed", "rejected"]


class WarrantyClaim(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tool_id: str
    tool_name: str = ""
    tool_photo: Optional[str] = None
    broken_photo: Optional[str] = ""
    dealer_id: Optional[str] = None
    dealer_name: str = ""
    repair_company: Optional[str] = ""
    contact: Optional[str] = ""
    notified_at: Optional[str] = ""
    expected_completion: Optional[str] = ""
    claim_status: str = "broken"
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    completed_at: Optional[str] = None


class WarrantyClaimUpdate(BaseModel):
    claim_status: Optional[str] = None
    repair_company: Optional[str] = None
    contact: Optional[str] = None
    notified_at: Optional[str] = None
    expected_completion: Optional[str] = None
    notes: Optional[str] = None


# Wish list — tools the user wants to buy
class WishlistItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    url: Optional[str] = ""
    description: Optional[str] = ""
    price: Optional[float] = None
    dealer_id: Optional[str] = None
    dealer_name: Optional[str] = ""
    priority: Optional[str] = "normal"  # low / normal / high
    notes: Optional[str] = ""
    purchased: bool = False
    purchased_at: Optional[str] = None
    converted_tool_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class WishlistItemCreate(BaseModel):
    name: str
    url: Optional[str] = ""
    description: Optional[str] = ""
    price: Optional[float] = None
    dealer_id: Optional[str] = None
    dealer_name: Optional[str] = ""
    priority: Optional[str] = "normal"
    notes: Optional[str] = ""


class WishlistItemUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    dealer_id: Optional[str] = None
    dealer_name: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    purchased: Optional[bool] = None


# Consumable
class ConsumableInfo(BaseModel):
    store_name: Optional[str] = ""
    website: Optional[str] = ""
    sku: Optional[str] = ""
    notes: Optional[str] = ""


# Checkout
class CheckoutRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    borrower_name: str
    borrower_id: Optional[str] = None
    checked_out_at: str = Field(default_factory=now_iso)
    checked_in_at: Optional[str] = None
    notes: Optional[str] = ""


class Tool(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = ""
    brand: Optional[str] = ""
    model: Optional[str] = ""
    serial_number: Optional[str] = ""
    is_set: bool = False
    set_serials: List[str] = []
    cost: Optional[float] = 0.0
    current_checkout: Optional[CheckoutRecord] = None
    checkout_history: List[CheckoutRecord] = []
    maintenance: List[MaintenanceSchedule] = []
    lost_status: Optional[LostStatus] = None
    # Sale tracking
    for_sale: bool = False
    sale_price: Optional[float] = 0.0
    sale_listed_at: Optional[str] = ""
    sale_notes: Optional[str] = ""
    is_sold: bool = False
    sold_at: Optional[str] = ""
    sold_price: Optional[float] = 0.0
    sold_to: Optional[str] = ""
    sold_notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class ToolCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    brand: Optional[str] = ""
    model: Optional[str] = ""
    serial_number: Optional[str] = ""
    is_set: bool = False
    set_serials: List[str] = []
    cost: Optional[float] = 0.0
    quantity: Optional[int] = 1
    purchase_date: Optional[str] = ""
    condition: Optional[str] = "Good"
    location_id: Optional[str] = None
    location_name: Optional[str] = ""
    category_id: Optional[str] = None
    category_name: Optional[str] = ""
    tag_ids: List[str] = []
    tag_names: List[str] = []
    photos: List[str] = []
    documents: List[Document] = []
    is_consumable: bool = False
    consumable_info: Optional[ConsumableInfo] = None
    needs_repair: bool = False
    repair_info: Optional[RepairInfo] = None
    warranty: Optional[Warranty] = None
    dealer_id: Optional[str] = None
    dealer_name: Optional[str] = ""
    purchased_from_agent_id: Optional[str] = None
    purchased_from_agent_name: Optional[str] = ""


class ToolUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    is_set: Optional[bool] = None
    set_serials: Optional[List[str]] = None
    cost: Optional[float] = None
    quantity: Optional[int] = None
    purchase_date: Optional[str] = None
    condition: Optional[str] = None
    location_id: Optional[str] = None
    location_name: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    tag_ids: Optional[List[str]] = None
    tag_names: Optional[List[str]] = None
    photos: Optional[List[str]] = None
    documents: Optional[List[Document]] = None
    is_consumable: Optional[bool] = None
    consumable_info: Optional[ConsumableInfo] = None
    needs_repair: Optional[bool] = None
    repair_info: Optional[RepairInfo] = None
    warranty: Optional[Warranty] = None
    dealer_id: Optional[str] = None
    dealer_name: Optional[str] = None
    purchased_from_agent_id: Optional[str] = None
    purchased_from_agent_name: Optional[str] = None
    # Sale tracking — included so PUT /tools/{id} can edit these fields
    for_sale: Optional[bool] = None
    sale_price: Optional[float] = None
    sale_listed_at: Optional[str] = None
    sale_notes: Optional[str] = None
    is_sold: Optional[bool] = None
    sold_at: Optional[str] = None
    sold_price: Optional[float] = None
    sold_to: Optional[str] = None
    sold_notes: Optional[str] = None


class CheckoutRequest(BaseModel):
    borrower_name: str
    borrower_id: Optional[str] = None
    notes: Optional[str] = ""


# ---------- Helpers ----------
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
            {"tag_names": rx},
            {"location_name": rx},
            {"category_name": rx},
            {"dealer_name": rx},
            {"purchased_from_agent_name": rx},
            {"sold_to": rx},
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
    # By default, exclude sold items from regular tool listings unless
    # explicitly asked for them. They live in the "sold" archive instead.
    if is_sold is None:
        query["is_sold"] = {"$ne": True}
    return query


# ---------- Root ----------
@api_router.get("/")
async def root():
    return {"message": "Toolbox Vault API"}


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
    updates = {k: v for k, v in payload.dict().items() if v is not None}
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
        return {"ok": True}
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
    await db.tags.delete_one({"id": tag_id})
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
        # Rename references on tools (category is a single string)
        await db.tools.update_many({"category": old_name}, {"$set": {"category": new_name}})
    new = await db.categories.find_one({"id": cat_id}, {"_id": 0})
    return Category(**new)


@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str):
    await db.categories.delete_one({"id": cat_id})
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
    old_name = existing.get("name", "")
    update_doc = {"name": new_name, "contact": new_contact}
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
    await db.borrowers.delete_one({"id": borrower_id})
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


# ---------- Dealers ----------
@api_router.post("/dealers", response_model=Dealer)
async def create_dealer(payload: DealerCreate, user: User = Depends(get_current_user)):
    d = Dealer(**payload.dict())
    await db.dealers.insert_one(d.dict())
    return d


@api_router.get("/dealers", response_model=List[Dealer])
async def list_dealers():
    items = await db.dealers.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
    return [Dealer(**i) for i in items]


@api_router.get("/dealers/{dealer_id}", response_model=Dealer)
async def get_dealer(dealer_id: str):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dealer not found")
    return Dealer(**d)


@api_router.put("/dealers/{dealer_id}", response_model=Dealer)
async def update_dealer(dealer_id: str, payload: DealerUpdate):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dealer not found")
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    await db.dealers.update_one({"id": dealer_id}, {"$set": updates})
    new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    return Dealer(**new)


@api_router.delete("/dealers/{dealer_id}")
async def delete_dealer(dealer_id: str):
    await db.dealers.delete_one({"id": dealer_id})
    return {"ok": True}


@api_router.post("/dealers/{dealer_id}/agents", response_model=Dealer)
async def add_agent(dealer_id: str, payload: AgentCreate, user: User = Depends(get_current_user)):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dealer not found")
    agent = Agent(**payload.dict())
    agents = d.get("agents") or []
    agents.append(agent.dict())
    update = {"agents": agents}
    if not d.get("current_agent_id"):
        update["current_agent_id"] = agent.id
    await db.dealers.update_one({"id": dealer_id}, {"$set": update})
    new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    return Dealer(**new)


@api_router.put("/dealers/{dealer_id}/agents/{agent_id}", response_model=Dealer)
async def update_agent(dealer_id: str, agent_id: str, payload: AgentCreate):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dealer not found")
    agents = d.get("agents") or []
    found = False
    for a in agents:
        if a.get("id") == agent_id:
            a["name"] = payload.name
            a["phone"] = payload.phone or ""
            a["email"] = payload.email or ""
            a["notes"] = payload.notes or ""
            found = True
            break
    if not found:
        raise HTTPException(404, "Agent not found")
    await db.dealers.update_one({"id": dealer_id}, {"$set": {"agents": agents}})
    new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    return Dealer(**new)


@api_router.delete("/dealers/{dealer_id}/agents/{agent_id}", response_model=Dealer)
async def remove_agent(dealer_id: str, agent_id: str):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dealer not found")
    agents = [a for a in (d.get("agents") or []) if a.get("id") != agent_id]
    update = {"agents": agents}
    if d.get("current_agent_id") == agent_id:
        update["current_agent_id"] = agents[0]["id"] if agents else None
    await db.dealers.update_one({"id": dealer_id}, {"$set": update})
    new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    return Dealer(**new)


@api_router.post("/dealers/{dealer_id}/current-agent/{agent_id}", response_model=Dealer)
async def set_current_agent(dealer_id: str, agent_id: str):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dealer not found")
    agents = d.get("agents") or []
    if not any(a.get("id") == agent_id for a in agents):
        raise HTTPException(400, "Agent not found in dealer")
    # Mark previous current's ended_at, mark this one's started_at if needed
    now = now_iso()
    for a in agents:
        if a.get("id") == d.get("current_agent_id") and a.get("id") != agent_id:
            if not a.get("ended_at"):
                a["ended_at"] = now
        if a.get("id") == agent_id:
            a["ended_at"] = None
            if not a.get("started_at"):
                a["started_at"] = now
    await db.dealers.update_one(
        {"id": dealer_id},
        {"$set": {"current_agent_id": agent_id, "agents": agents}},
    )
    new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    return Dealer(**new)


# ---------- Dealer Balance Transactions ----------
@api_router.post("/dealers/{dealer_id}/transactions", response_model=Dealer)
async def add_dealer_transaction(dealer_id: str, payload: TransactionCreate):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dealer not found")
    if payload.account not in ("credit", "personal"):
        raise HTTPException(400, "account must be 'credit' or 'personal'")
    if payload.type not in ("payment", "charge"):
        raise HTTPException(400, "type must be 'payment' or 'charge'")
    amount = float(payload.amount or 0)
    if amount <= 0:
        raise HTTPException(400, "amount must be > 0")
    tx = BalanceTransaction(
        account=payload.account,
        type=payload.type,
        amount=amount,
        note=payload.note or "",
        date=payload.date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    ).model_dump()
    txs = list(d.get("transactions") or [])
    txs.append(tx)
    # Update balance: payment decreases, charge increases
    delta = -amount if payload.type == "payment" else amount
    field = "credit_balance" if payload.account == "credit" else "personal_balance"
    new_balance = float(d.get(field) or 0.0) + delta
    await db.dealers.update_one(
        {"id": dealer_id},
        {"$set": {field: new_balance, "transactions": txs}},
    )
    new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    return Dealer(**new)


@api_router.delete("/dealers/{dealer_id}/transactions/{tx_id}", response_model=Dealer)
async def delete_dealer_transaction(dealer_id: str, tx_id: str):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dealer not found")
    txs = list(d.get("transactions") or [])
    target = next((t for t in txs if t.get("id") == tx_id), None)
    if not target:
        raise HTTPException(404, "Transaction not found")
    # Reverse the balance impact
    amount = float(target.get("amount") or 0)
    delta = amount if target.get("type") == "payment" else -amount
    field = "credit_balance" if target.get("account") == "credit" else "personal_balance"
    new_balance = float(d.get(field) or 0.0) + delta
    txs = [t for t in txs if t.get("id") != tx_id]
    await db.dealers.update_one(
        {"id": dealer_id},
        {"$set": {field: new_balance, "transactions": txs}},
    )
    new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    return Dealer(**new)


# ---------- Tools ----------
@api_router.post("/tools", response_model=Tool)
async def create_tool(payload: ToolCreate, user: User = Depends(get_current_user)):
    tool = Tool(**payload.dict())
    await db.tools.insert_one(tool.dict())
    # If created already broken, also create a warranty claim mirror with broken_photo
    if tool.needs_repair:
        ri = (tool.repair_info or RepairInfo()).dict() if hasattr(tool.repair_info, "dict") else (tool.repair_info or {})
        if isinstance(ri, dict):
            claim = WarrantyClaim(
                tool_id=tool.id,
                tool_name=tool.name,
                tool_photo=(tool.photos or [None])[0] if tool.photos else None,
                broken_photo=ri.get("broken_photo") or "",
                dealer_id=tool.dealer_id,
                dealer_name=tool.dealer_name or "",
                repair_company=ri.get("company_notified") or "",
                contact=ri.get("contact") or "",
                notified_at=ri.get("notified_at") or "",
                expected_completion=ri.get("expected_completion") or "",
                claim_status="broken",
                notes=ri.get("notes") or "",
            )
            await db.warranty_claims.insert_one(claim.dict())
    return tool


@api_router.get("/tools", response_model=List[Tool])
async def list_tools(
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
):
    query = build_tool_query(
        search, location_id, tag_id, category_id, dealer_id,
        checked_out, is_consumable, needs_repair, for_sale, is_sold,
    )
    items = await db.tools.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return [Tool(**i) for i in items]


@api_router.get("/tools/{tool_id}", response_model=Tool)
async def get_tool(tool_id: str):
    doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Tool not found")
    return Tool(**doc)


@api_router.put("/tools/{tool_id}", response_model=Tool)
async def update_tool(tool_id: str, payload: ToolUpdate):
    doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Tool not found")
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    updates["updated_at"] = now_iso()

    # When the caller marks the tool as Repaired (needs_repair: false, repair_info: null),
    # Pydantic's None values get filtered out above. Restore the null so the tool's
    # repair_info (including broken_photo) is actually cleared — otherwise the next claim
    # would inherit the previous claim's photo and notes.
    if payload.needs_repair is False and doc.get("needs_repair"):
        updates["repair_info"] = None

    # Auto-checkin when a tool is being newly flagged as broken / needing repair
    becomes_broken = (
        updates.get("needs_repair") is True
        and not doc.get("needs_repair")
        and doc.get("is_checked_out")
    )
    if becomes_broken:
        record = doc.get("current_checkout") or {}
        if record:
            record = dict(record)
            record["checked_in_at"] = now_iso()
            note_extra = " [auto check-in: marked for repair]"
            record["notes"] = (record.get("notes") or "") + note_extra
            history = doc.get("checkout_history") or []
            history.append(record)
            updates["is_checked_out"] = False
            updates["current_checkout"] = None
            updates["checkout_history"] = history

    await db.tools.update_one({"id": tool_id}, {"$set": updates})
    new_doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})

    # Sync warranty claim record:
    # Newly broken → create a new open claim (if no open claim already exists for this tool)
    just_flagged = updates.get("needs_repair") is True and not doc.get("needs_repair")
    just_unflagged = updates.get("needs_repair") is False and doc.get("needs_repair")
    if just_flagged:
        existing_open = await db.warranty_claims.find_one(
            {"tool_id": tool_id, "claim_status": {"$nin": ["completed", "rejected"]}},
            {"_id": 0, "id": 1},
        )
        if not existing_open:
            ri = (new_doc.get("repair_info") or {})
            claim = WarrantyClaim(
                tool_id=tool_id,
                tool_name=new_doc.get("name", ""),
                tool_photo=(new_doc.get("photos") or [None])[0],
                broken_photo=ri.get("broken_photo") or "",
                dealer_id=new_doc.get("dealer_id"),
                dealer_name=new_doc.get("dealer_name") or "",
                repair_company=ri.get("company_notified") or "",
                contact=ri.get("contact") or "",
                notified_at=ri.get("notified_at") or "",
                expected_completion=ri.get("expected_completion") or "",
                claim_status="broken",
                notes=ri.get("notes") or "",
            )
            await db.warranty_claims.insert_one(claim.dict())
    elif "repair_info" in updates and new_doc.get("needs_repair"):
        # Repair info edited while still broken → keep open claim in sync
        ri = updates.get("repair_info") or {}
        await db.warranty_claims.update_many(
            {"tool_id": tool_id, "claim_status": {"$nin": ["completed", "rejected"]}},
            {
                "$set": {
                    "repair_company": ri.get("company_notified") or "",
                    "contact": ri.get("contact") or "",
                    "notified_at": ri.get("notified_at") or "",
                    "expected_completion": ri.get("expected_completion") or "",
                    "notes": ri.get("notes") or "",
                    "broken_photo": ri.get("broken_photo") or "",
                    "updated_at": now_iso(),
                }
            },
        )
    if just_unflagged:
        # User hit "Mark Repaired" — close any still-open claim as completed
        await db.warranty_claims.update_many(
            {"tool_id": tool_id, "claim_status": {"$nin": ["completed", "rejected"]}},
            {
                "$set": {
                    "claim_status": "completed",
                    "completed_at": now_iso(),
                    "updated_at": now_iso(),
                }
            },
        )

    return Tool(**new_doc)


@api_router.delete("/tools/{tool_id}")
async def delete_tool(tool_id: str):
    await db.tools.delete_one({"id": tool_id})
    return {"ok": True}


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
    record = CheckoutRecord(
        borrower_name=payload.borrower_name,
        borrower_id=payload.borrower_id,
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


# ---------- Maintenance Schedules ----------
def _calc_next_due(last: Optional[str], months: int) -> Optional[str]:
    if not last or not months:
        return None
    try:
        d = datetime.strptime(last, "%Y-%m-%d")
        # Approximate by adding months * 30.4 days; simpler than dateutil
        new_month = d.month + months
        new_year = d.year + (new_month - 1) // 12
        new_month = ((new_month - 1) % 12) + 1
        # Clamp day
        try:
            nd = d.replace(year=new_year, month=new_month)
        except ValueError:
            # Day overflow (e.g., Feb 30) — back off
            nd = d.replace(year=new_year, month=new_month, day=28)
        return nd.strftime("%Y-%m-%d")
    except Exception:
        return None


@api_router.post("/tools/{tool_id}/maintenance", response_model=Tool)
async def add_maintenance(tool_id: str, payload: MaintenanceScheduleCreate):
    tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
    if not tool:
        raise HTTPException(404, "Tool not found")
    schedules = tool.get("maintenance") or []
    new_sch = MaintenanceSchedule(
        type=payload.type or "Service",
        interval_months=payload.interval_months or 12,
        last_done_date=payload.last_done_date,
        next_due_date=_calc_next_due(payload.last_done_date, payload.interval_months or 12),
        notes=payload.notes or "",
    ).model_dump()
    schedules.append(new_sch)
    await db.tools.update_one({"id": tool_id}, {"$set": {"maintenance": schedules, "updated_at": now_iso()}})
    return Tool(**(await db.tools.find_one({"id": tool_id}, {"_id": 0})))


@api_router.put("/tools/{tool_id}/maintenance/{sch_id}", response_model=Tool)
async def update_maintenance(tool_id: str, sch_id: str, payload: MaintenanceScheduleUpdate):
    tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
    if not tool:
        raise HTTPException(404, "Tool not found")
    schedules = tool.get("maintenance") or []
    found = False
    for sch in schedules:
        if sch.get("id") == sch_id:
            found = True
            if payload.type is not None:
                sch["type"] = payload.type
            if payload.interval_months is not None:
                sch["interval_months"] = payload.interval_months
            if payload.last_done_date is not None:
                sch["last_done_date"] = payload.last_done_date
            if payload.notes is not None:
                sch["notes"] = payload.notes
            sch["next_due_date"] = _calc_next_due(sch.get("last_done_date"), sch.get("interval_months", 12))
            break
    if not found:
        raise HTTPException(404, "Schedule not found")
    await db.tools.update_one({"id": tool_id}, {"$set": {"maintenance": schedules, "updated_at": now_iso()}})
    return Tool(**(await db.tools.find_one({"id": tool_id}, {"_id": 0})))


@api_router.delete("/tools/{tool_id}/maintenance/{sch_id}", response_model=Tool)
async def delete_maintenance(tool_id: str, sch_id: str):
    tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
    if not tool:
        raise HTTPException(404, "Tool not found")
    schedules = [s for s in (tool.get("maintenance") or []) if s.get("id") != sch_id]
    await db.tools.update_one({"id": tool_id}, {"$set": {"maintenance": schedules, "updated_at": now_iso()}})
    return Tool(**(await db.tools.find_one({"id": tool_id}, {"_id": 0})))


@api_router.post("/tools/{tool_id}/maintenance/{sch_id}/service", response_model=Tool)
async def log_service_event(tool_id: str, sch_id: str, payload: ServiceEventCreate):
    tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
    if not tool:
        raise HTTPException(404, "Tool not found")
    schedules = tool.get("maintenance") or []
    found = False
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for sch in schedules:
        if sch.get("id") == sch_id:
            found = True
            event = ServiceEvent(
                date=payload.date or today,
                cost=payload.cost or 0.0,
                technician=payload.technician or "",
                notes=payload.notes or "",
            ).model_dump()
            sch.setdefault("history", []).append(event)
            sch["last_done_date"] = event["date"]
            sch["next_due_date"] = _calc_next_due(sch["last_done_date"], sch.get("interval_months", 12))
            break
    if not found:
        raise HTTPException(404, "Schedule not found")
    await db.tools.update_one({"id": tool_id}, {"$set": {"maintenance": schedules, "updated_at": now_iso()}})
    return Tool(**(await db.tools.find_one({"id": tool_id}, {"_id": 0})))


@api_router.get("/maintenance/upcoming")
async def upcoming_maintenance(days: int = 30):
    """Return all maintenance schedules with next_due in [today, today+days] OR overdue."""
    now = datetime.now(timezone.utc)
    horizon = (now + timedelta(days=days)).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")
    out: List[Dict[str, Any]] = []
    overdue_count = 0
    due_soon_count = 0
    async for tool in db.tools.find(
        {"maintenance": {"$exists": True, "$ne": []}},
        {"_id": 0, "id": 1, "name": 1, "photos": 1, "maintenance": 1},
    ):
        for sch in (tool.get("maintenance") or []):
            nd = sch.get("next_due_date") or ""
            if not nd:
                continue
            if nd <= horizon:  # overdue or within horizon
                is_overdue = nd < today
                if is_overdue:
                    overdue_count += 1
                else:
                    due_soon_count += 1
                out.append({
                    "tool_id": tool.get("id"),
                    "tool_name": tool.get("name"),
                    "tool_photo": (tool.get("photos") or [None])[0] if tool.get("photos") else None,
                    "schedule_id": sch.get("id"),
                    "type": sch.get("type"),
                    "interval_months": sch.get("interval_months"),
                    "last_done_date": sch.get("last_done_date"),
                    "next_due_date": nd,
                    "is_overdue": is_overdue,
                    "notes": sch.get("notes", ""),
                })
    out.sort(key=lambda x: x["next_due_date"] or "9999-12-31")
    return {
        "items": out,
        "total": len(out),
        "overdue": overdue_count,
        "due_soon": due_soon_count,
    }


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
    query = build_tool_query(search, location_id, tag_id, category_id, dealer_id, checked_out, is_consumable, needs_repair)
    items = await db.tools.find(query, {"_id": 0}).to_list(5000)

    def _num(v: Any, default: float = 0.0) -> float:
        """Robust numeric coercion — handles ints, floats, strings like
        "1,234.56", "$300", "  5  ", as well as None / missing values."""
        if v is None:
            return default
        if isinstance(v, (int, float)):
            return float(v)
        try:
            s = str(v).strip().replace(",", "").replace("$", "")
            return float(s) if s else default
        except Exception:
            return default

    def _qty(v: Any) -> int:
        n = int(_num(v, 1) or 1)
        return n if n >= 1 else 1

    total_value = sum(_num(i.get("cost")) * _qty(i.get("quantity")) for i in items)
    checked_out_n = sum(1 for i in items if i.get("is_checked_out"))
    consumables_n = sum(1 for i in items if i.get("is_consumable"))
    needs_repair_n = sum(1 for i in items if i.get("needs_repair"))
    locations: Dict[str, int] = {}
    categories: Dict[str, int] = {}
    dealers: Dict[str, int] = {}
    tag_set: set = set()
    for i in items:
        ln = i.get("location_name") or "—"
        cn = i.get("category_name") or "—"
        dn = i.get("dealer_name") or "—"
        locations[ln] = locations.get(ln, 0) + 1
        categories[cn] = categories.get(cn, 0) + 1
        dealers[dn] = dealers.get(dn, 0) + 1
        for t in (i.get("tag_names") or []):
            tag_set.add(t)
    return {
        "count": len(items),
        "total_value": round(total_value, 2),
        "checked_out": checked_out_n,
        "available": len(items) - checked_out_n,
        "consumables": consumables_n,
        "needs_repair": needs_repair_n,
        "location_breakdown": locations,
        "category_breakdown": categories,
        "dealer_breakdown": dealers,
        "tag_count": len(tag_set),
        "unique_tags": sorted(tag_set),
    }


@api_router.get("/stats")
async def get_stats():
    total = await db.tools.count_documents({})
    checked_out = await db.tools.count_documents({"is_checked_out": True})
    consumables = await db.tools.count_documents({"is_consumable": True})
    needs_repair = await db.tools.count_documents({"needs_repair": True})
    locations = await db.locations.count_documents({})
    tags = await db.tags.count_documents({})
    categories = await db.categories.count_documents({})
    borrowers = await db.borrowers.count_documents({})
    dealers = await db.dealers.count_documents({})
    pipeline = [{"$group": {"_id": None, "total_value": {
        "$sum": {"$multiply": ["$cost", {"$ifNull": ["$quantity", 1]}]}
    }}}]
    agg = await db.tools.aggregate(pipeline).to_list(1)
    total_value = agg[0]["total_value"] if agg else 0
    # Warranty expiring within 60 days
    soon = (datetime.now(timezone.utc) + timedelta(days=60)).date().isoformat()
    today = datetime.now(timezone.utc).date().isoformat()
    expiring = await db.tools.count_documents({
        "warranty.has_warranty": True,
        "warranty.expiry_date": {"$gte": today, "$lte": soon},
    })
    expired = await db.tools.count_documents({
        "warranty.has_warranty": True,
        "warranty.expiry_date": {"$lt": today, "$ne": ""},
    })
    return {
        "total_tools": total,
        "checked_out": checked_out,
        "available": total - checked_out,
        "consumables": consumables,
        "needs_repair": needs_repair,
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
    items = await db.tools.find(
        {"warranty.has_warranty": True, "warranty.expiry_date": {"$ne": ""}},
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


# ---------- Warranty Claims ----------
@api_router.get("/warranty-claims", response_model=List[WarrantyClaim])
async def list_warranty_claims(
    dealer_id: Optional[str] = None,
    tool_id: Optional[str] = None,
    status: Optional[str] = None,
    archived: Optional[bool] = None,  # true -> completed/rejected only; false -> active only
):
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

    new = await db.warranty_claims.find_one({"id": claim_id}, {"_id": 0})
    return WarrantyClaim(**new)


@api_router.delete("/warranty-claims/{claim_id}")
async def delete_warranty_claim(claim_id: str):
    await db.warranty_claims.delete_one({"id": claim_id})
    return {"ok": True}


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
    await db.wishlist_items.delete_one({"id": item_id})
    return {"ok": True}


@api_router.post("/wishlist/{item_id}/convert", response_model=Tool)
async def convert_wishlist_to_tool(item_id: str, user: User = Depends(get_current_user)):
    """Convert a wishlist item into a real tool — marks as purchased."""
    item = await db.wishlist_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Wishlist item not found")
    tool = Tool(
        name=item.get("name", ""),
        description=item.get("description", "") or "",
        cost=item.get("price") or 0,
        dealer_id=item.get("dealer_id"),
        dealer_name=item.get("dealer_name") or "",
    )
    await db.tools.insert_one(tool.dict())
    await db.wishlist_items.update_one(
        {"id": item_id},
        {"$set": {"purchased": True, "purchased_at": now_iso(), "converted_tool_id": tool.id, "updated_at": now_iso()}},
    )
    return tool


# ---------- AI Toolbox Analysis (REMOVED) ----------


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
# Auth + Subscription
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


@auth_router.post("/register", response_model=AuthResponse)
async def register(payload: RegisterRequest):
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
    token = create_token(user.id)
    return AuthResponse(token=token, user=to_public(user))


@auth_router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest):
    email = payload.email.strip().lower()
    udoc = await real_db.users.find_one({"email": email}, {"_id": 0})
    if not udoc:
        raise HTTPException(401, "Invalid email or password")
    if not verify_password(payload.password, udoc.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password")
    user = User(**udoc)
    # Refresh subscription status
    sub = evaluate_subscription_status(user.subscription.dict())
    if sub != user.subscription.dict():
        await real_db.users.update_one({"id": user.id}, {"$set": {"subscription": sub}})
        user.subscription = Subscription(**sub)
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


app.include_router(api_router)
app.include_router(auth_router)

# ---------------------------------------------------------------------------
# Unified report engine (HTML→PDF + CSV) — see /app/backend/reports.py
# ---------------------------------------------------------------------------
from reports import make_reports_router as _make_reports_router  # noqa: E402

_reports_api_router = APIRouter(prefix="/api")
_make_reports_router(_reports_api_router, lambda: db, get_current_user)
app.include_router(_reports_api_router)

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
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
