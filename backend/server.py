from fastapi import FastAPI, APIRouter, HTTPException
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
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI()
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
    agents: List[Agent] = []
    current_agent_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class DealerCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    website: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""


class DealerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


# Documents
class Document(BaseModel):
    name: str
    data: str
    mime_type: Optional[str] = "application/octet-stream"


# Warranty
class Warranty(BaseModel):
    has_warranty: bool = False
    provider: Optional[str] = ""
    contact: Optional[str] = ""
    terms: Optional[str] = ""
    length_months: Optional[int] = 0
    start_date: Optional[str] = ""  # YYYY-MM-DD
    expiry_date: Optional[str] = ""  # YYYY-MM-DD
    document: Optional[Document] = None


# Repair info
class RepairInfo(BaseModel):
    company_notified: Optional[str] = ""
    notified_at: Optional[str] = ""  # date or ISO
    expected_completion: Optional[str] = ""  # date
    repair_status: Optional[str] = "Reported"  # Reported / In Repair / Awaiting Parts / Repaired
    contact: Optional[str] = ""
    notes: Optional[str] = ""


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
    cost: Optional[float] = 0.0
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
    warranty: Optional[Warranty] = None
    dealer_id: Optional[str] = None
    dealer_name: Optional[str] = ""
    purchased_from_agent_id: Optional[str] = None  # snapshot at purchase
    purchased_from_agent_name: Optional[str] = ""
    is_checked_out: bool = False
    current_checkout: Optional[CheckoutRecord] = None
    checkout_history: List[CheckoutRecord] = []
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class ToolCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    brand: Optional[str] = ""
    model: Optional[str] = ""
    serial_number: Optional[str] = ""
    cost: Optional[float] = 0.0
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
    cost: Optional[float] = None
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


class CheckoutRequest(BaseModel):
    borrower_name: str
    borrower_id: Optional[str] = None
    notes: Optional[str] = ""


# Toolbox layout (photo with drawers)
class DrawerRegion(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    x: float  # 0..1 normalized
    y: float
    width: float
    height: float
    location_id: Optional[str] = None  # link to a Location


class ToolboxLayout(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    photo: str  # base64 data URI
    drawers: List[DrawerRegion] = []
    created_at: str = Field(default_factory=now_iso)


class ToolboxLayoutCreate(BaseModel):
    name: str
    photo: str
    drawers: List[DrawerRegion] = []


class ToolboxLayoutUpdate(BaseModel):
    name: Optional[str] = None
    photo: Optional[str] = None
    drawers: Optional[List[DrawerRegion]] = None


class AnalyzeRequest(BaseModel):
    image_base64: str  # base64 without data: prefix


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
            {"tag_names": rx},
            {"location_name": rx},
            {"category_name": rx},
            {"dealer_name": rx},
            {"purchased_from_agent_name": rx},
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
    return query


# ---------- Root ----------
@api_router.get("/")
async def root():
    return {"message": "Tool Tracker API"}


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
async def create_dealer(payload: DealerCreate):
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
async def add_agent(dealer_id: str, payload: AgentCreate):
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


# ---------- Tools ----------
@api_router.post("/tools", response_model=Tool)
async def create_tool(payload: ToolCreate):
    tool = Tool(**payload.dict())
    await db.tools.insert_one(tool.dict())
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
):
    query = build_tool_query(search, location_id, tag_id, category_id, dealer_id, checked_out, is_consumable, needs_repair)
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
    return Tool(**new_doc)


@api_router.delete("/tools/{tool_id}")
async def delete_tool(tool_id: str):
    await db.tools.delete_one({"id": tool_id})
    return {"ok": True}


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
    total_value = sum((i.get("cost") or 0) for i in items)
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
    pipeline = [{"$group": {"_id": None, "total_value": {"$sum": "$cost"}}}]
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


# ---------- Toolbox Layouts ----------
@api_router.post("/toolbox-layouts", response_model=ToolboxLayout)
async def create_layout(payload: ToolboxLayoutCreate):
    lay = ToolboxLayout(**payload.dict())
    await db.toolbox_layouts.insert_one(lay.dict())
    return lay


@api_router.get("/toolbox-layouts", response_model=List[ToolboxLayout])
async def list_layouts():
    items = await db.toolbox_layouts.find({}, {"_id": 0}).to_list(2000)
    return [ToolboxLayout(**i) for i in items]


@api_router.get("/toolbox-layouts/{layout_id}", response_model=ToolboxLayout)
async def get_layout(layout_id: str):
    d = await db.toolbox_layouts.find_one({"id": layout_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Layout not found")
    return ToolboxLayout(**d)


@api_router.put("/toolbox-layouts/{layout_id}", response_model=ToolboxLayout)
async def update_layout(layout_id: str, payload: ToolboxLayoutUpdate):
    d = await db.toolbox_layouts.find_one({"id": layout_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Layout not found")
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    await db.toolbox_layouts.update_one({"id": layout_id}, {"$set": updates})
    new = await db.toolbox_layouts.find_one({"id": layout_id}, {"_id": 0})
    return ToolboxLayout(**new)


@api_router.delete("/toolbox-layouts/{layout_id}")
async def delete_layout(layout_id: str):
    await db.toolbox_layouts.delete_one({"id": layout_id})
    return {"ok": True}


# ---------- AI Toolbox Analysis ----------
@api_router.post("/toolbox/analyze")
async def analyze_toolbox(payload: AnalyzeRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    except Exception as e:
        raise HTTPException(500, f"Integrations library missing: {e}")

    img_b64 = payload.image_base64
    if "," in img_b64 and img_b64.startswith("data:"):
        img_b64 = img_b64.split(",", 1)[1]

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"toolbox-{uuid.uuid4()}",
        system_message=(
            "You are a vision assistant that analyzes a photograph of a tool storage "
            "unit (toolbox, cabinet, chest, shelf). Identify horizontal drawers, "
            "shelves, or compartments visible in the image. Always respond with strict "
            "JSON only, no prose, no markdown."
        ),
    ).with_model("gemini", "gemini-2.5-pro")

    prompt = (
        "Look at this tool storage photo and respond with strict JSON: "
        '{"suggested_drawers": <integer 0-30>, '
        '"labels": [<array of short string names ordered top to bottom, e.g. \"Top Drawer\", \"Drawer 2\">], '
        '"confidence": <\"low\"|\"medium\"|\"high\">, '
        '"notes": <short string explaining what you see>}. '
        "Count distinct drawers/compartments only. If unclear, give a best guess and set confidence accordingly."
    )

    msg = UserMessage(text=prompt, file_contents=[ImageContent(image_base64=img_b64)])
    try:
        response_text = await chat.send_message(msg)
    except Exception as e:
        raise HTTPException(500, f"AI request failed: {e}")

    raw = str(response_text or "").strip()
    # Strip code fences if present
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
    except Exception:
        # Try to extract JSON object
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            try:
                data = json.loads(m.group(0))
            except Exception:
                data = {"suggested_drawers": 0, "labels": [], "confidence": "low", "notes": raw[:200]}
        else:
            data = {"suggested_drawers": 0, "labels": [], "confidence": "low", "notes": raw[:200]}

    sd = int(data.get("suggested_drawers") or 0)
    sd = max(0, min(sd, 40))
    labels = data.get("labels") or []
    if not isinstance(labels, list):
        labels = []
    labels = [str(x)[:60] for x in labels][:sd]
    while len(labels) < sd:
        labels.append(f"Drawer {len(labels) + 1}")
    return {
        "suggested_drawers": sd,
        "labels": labels,
        "confidence": str(data.get("confidence") or "medium"),
        "notes": str(data.get("notes") or "")[:400],
    }


app.include_router(api_router)

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
