from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------- Models ----------
class Location(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class LocationCreate(BaseModel):
    name: str
    description: Optional[str] = ""


class Tag(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: Optional[str] = "#FFB300"
    created_at: str = Field(default_factory=now_iso)


class TagCreate(BaseModel):
    name: str
    color: Optional[str] = "#FFB300"


class Borrower(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    contact: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class BorrowerCreate(BaseModel):
    name: str
    contact: Optional[str] = ""


class Document(BaseModel):
    name: str
    data: str  # base64
    mime_type: Optional[str] = "application/octet-stream"


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
    tag_ids: List[str] = []
    tag_names: List[str] = []
    photos: List[str] = []  # base64 strings
    documents: List[Document] = []
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
    tag_ids: List[str] = []
    tag_names: List[str] = []
    photos: List[str] = []
    documents: List[Document] = []


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
    tag_ids: Optional[List[str]] = None
    tag_names: Optional[List[str]] = None
    photos: Optional[List[str]] = None
    documents: Optional[List[Document]] = None


class CheckoutRequest(BaseModel):
    borrower_name: str
    borrower_id: Optional[str] = None
    notes: Optional[str] = ""


# ---------- Helpers ----------
def clean(doc):
    if doc and "_id" in doc:
        doc.pop("_id")
    return doc


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
    items = await db.locations.find({}, {"_id": 0}).to_list(1000)
    return [Location(**i) for i in items]


@api_router.delete("/locations/{loc_id}")
async def delete_location(loc_id: str):
    await db.locations.delete_one({"id": loc_id})
    return {"ok": True}


# ---------- Tags ----------
@api_router.post("/tags", response_model=Tag)
async def create_tag(payload: TagCreate):
    t = Tag(**payload.dict())
    await db.tags.insert_one(t.dict())
    return t


@api_router.get("/tags", response_model=List[Tag])
async def list_tags():
    items = await db.tags.find({}, {"_id": 0}).to_list(1000)
    return [Tag(**i) for i in items]


@api_router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str):
    await db.tags.delete_one({"id": tag_id})
    return {"ok": True}


# ---------- Borrowers ----------
@api_router.post("/borrowers", response_model=Borrower)
async def create_borrower(payload: BorrowerCreate):
    b = Borrower(**payload.dict())
    await db.borrowers.insert_one(b.dict())
    return b


@api_router.get("/borrowers", response_model=List[Borrower])
async def list_borrowers():
    items = await db.borrowers.find({}, {"_id": 0}).to_list(1000)
    return [Borrower(**i) for i in items]


@api_router.delete("/borrowers/{borrower_id}")
async def delete_borrower(borrower_id: str):
    await db.borrowers.delete_one({"id": borrower_id})
    return {"ok": True}


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
    checked_out: Optional[bool] = None,
):
    query = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
            {"model": {"$regex": search, "$options": "i"}},
            {"serial_number": {"$regex": search, "$options": "i"}},
            {"tag_names": {"$regex": search, "$options": "i"}},
            {"location_name": {"$regex": search, "$options": "i"}},
        ]
    if location_id:
        query["location_id"] = location_id
    if tag_id:
        query["tag_ids"] = tag_id
    if checked_out is not None:
        query["is_checked_out"] = checked_out

    items = await db.tools.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
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
        {
            "$set": {
                "is_checked_out": True,
                "current_checkout": record.dict(),
                "updated_at": now_iso(),
            }
        },
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
    history = doc.get("checkout_history", [])
    history.append(record)
    await db.tools.update_one(
        {"id": tool_id},
        {
            "$set": {
                "is_checked_out": False,
                "current_checkout": None,
                "checkout_history": history,
                "updated_at": now_iso(),
            }
        },
    )
    new_doc = await db.tools.find_one({"id": tool_id}, {"_id": 0})
    return Tool(**new_doc)


@api_router.get("/stats")
async def get_stats():
    total = await db.tools.count_documents({})
    checked_out = await db.tools.count_documents({"is_checked_out": True})
    locations = await db.locations.count_documents({})
    tags = await db.tags.count_documents({})
    borrowers = await db.borrowers.count_documents({})
    pipeline = [{"$group": {"_id": None, "total_value": {"$sum": "$cost"}}}]
    agg = await db.tools.aggregate(pipeline).to_list(1)
    total_value = agg[0]["total_value"] if agg else 0
    return {
        "total_tools": total,
        "checked_out": checked_out,
        "available": total - checked_out,
        "total_value": total_value,
        "locations": locations,
        "tags": tags,
        "borrowers": borrowers,
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
