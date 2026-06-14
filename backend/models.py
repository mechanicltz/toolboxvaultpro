"""Pydantic request/response & document models for Toolbox Vault.

Extracted verbatim from server.py (2026-06 god-file refactor, phase B1).
Pure data definitions — no DB or FastAPI dependencies — so they can be shared
freely across route modules without import cycles.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Locations ----------
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


# ---------- Brands ----------
# Brands work like Tags / Categories — each user-entered brand string is
# saved once and re-suggested as a typeahead option when filling future
# tools (per user 2026-05-27).
class Brand(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_at: str = Field(default_factory=now_iso)


class BrandCreate(BaseModel):
    name: str


class Borrower(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    contact: Optional[str] = ""
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class BorrowerCreate(BaseModel):
    name: str
    contact: Optional[str] = ""
    notes: Optional[str] = ""


# Dealer & Agents
class Agent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    location: Optional[str] = ""  # e.g. "North Houston", "Route 12", etc.
    notes: Optional[str] = ""
    started_at: str = Field(default_factory=now_iso)
    ended_at: Optional[str] = None  # when this agent stopped being current


class AgentCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    location: Optional[str] = ""
    notes: Optional[str] = ""


class Dealer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: Optional[str] = ""
    website: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""
    # Dealer logo. Either a stock key ("stock:snap-on"), a data-URI / base64
    # custom upload, or "" / "default" to fall back to the app icon.
    logo: Optional[str] = ""
    # Additional company contact channels (free-form: phone, email, URL, or note)
    warranty_contact: Optional[str] = ""
    tech_support_contact: Optional[str] = ""
    customer_support_contact: Optional[str] = ""
    route_frequency: Optional[str] = "N/A"  # Weekly | Bi-weekly | Monthly | N/A
    route_day_of_week: Optional[str] = ""  # Mon | Tue | Wed | Thu | Fri | Sat | Sun (when frequency is Weekly/Bi-weekly)
    route_anchor_date: Optional[str] = ""  # YYYY-MM-DD anchor used to compute next visit (mainly for Bi-weekly/Monthly)
    agents: List[Agent] = []
    current_agent_id: Optional[str] = None
    credit_balance: float = 0.0
    personal_balance: float = 0.0
    # Optional recurring-payment schedule attached directly to each account.
    # Shape = AccountSchedule. None means "no schedule set" for that account.
    credit_schedule: Optional[Dict[str, Any]] = None
    personal_schedule: Optional[Dict[str, Any]] = None
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
    logo: Optional[str] = ""
    warranty_contact: Optional[str] = ""
    tech_support_contact: Optional[str] = ""
    customer_support_contact: Optional[str] = ""
    route_frequency: Optional[str] = "N/A"
    route_day_of_week: Optional[str] = ""
    route_anchor_date: Optional[str] = ""


class DealerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    logo: Optional[str] = None
    warranty_contact: Optional[str] = None
    tech_support_contact: Optional[str] = None
    customer_support_contact: Optional[str] = None
    route_frequency: Optional[str] = None
    route_day_of_week: Optional[str] = None
    route_anchor_date: Optional[str] = None


class AccountSchedule(BaseModel):
    """A recurring-payment schedule attached to ONE dealer account (the Truck/
    personal account or the Credit account). Drives reminders + the in-app
    'was it processed?' confirmation flow."""
    enabled: bool = False
    amount: float = 0.0
    frequency: str = "monthly"          # weekly | biweekly | monthly
    next_due_date: Optional[str] = ""   # YYYY-MM-DD
    remind_day_before: bool = True
    remind_day_of: bool = True
    last_paid_date: Optional[str] = ""


# ---------- Dealer payment schedule frequency (used by per-account schedules) ----------
PAYMENT_FREQUENCIES = ("weekly", "biweekly", "monthly")


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
    # Repair / replacement cost — defaults to 0; user enters dollar amount if
    # they paid for the repair / replacement out of pocket. Feeds into the
    # Repair Cost Report and Year End Report.
    repair_cost: Optional[float] = 0.0


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
    # Cost the user paid out of pocket for this repair / replacement.
    # 0 = free (e.g., under warranty). Persisted on the claim so it survives
    # after the tool is marked Repaired and repair_info is cleared.
    repair_cost: Optional[float] = 0.0
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
    repair_cost: Optional[float] = None


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
    # Optional product details — used when converting to a Tool so the user
    # doesn't have to re-enter info they already saved on the wish.
    model_number: Optional[str] = ""
    photos: List[str] = []  # base64 data-URI strings (same format as Tool.photos)
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
    model_number: Optional[str] = ""
    photos: List[str] = []


class WishlistItemUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    dealer_id: Optional[str] = None
    dealer_name: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    model_number: Optional[str] = None
    photos: Optional[List[str]] = None
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
    # Phone number for the borrower — captured so the in-app & notification
    # quick-actions (CALL / TEXT REMINDER) can dial without forcing the user
    # to look up the contact. Auto-resolved from the borrowers collection
    # when borrower_id is provided; otherwise can come from the payload.
    borrower_phone: Optional[str] = ""
    checked_out_at: str = Field(default_factory=now_iso)
    checked_in_at: Optional[str] = None
    notes: Optional[str] = ""


class Tool(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = ""
    brand: Optional[str] = ""
    # Legacy single-value fields (kept for backward compat with older app
    # builds and CSV import). New code reads/writes model_numbers / serial_numbers
    # arrays. See _resolve_model_serial_arrays() for the migration glue.
    model: Optional[str] = ""
    serial_number: Optional[str] = ""
    # New multi-value fields — users can stack any number of model #s and
    # serial #s per tool (e.g., for kits, replacement parts, etc).
    model_numbers: List[str] = []
    serial_numbers: List[str] = []
    is_set: bool = False
    set_serials: List[str] = []
    bundle_id: Optional[str] = None  # set when this item belongs to a Bundle/Set
    cost: Optional[float] = 0.0
    # Manufacturer's Suggested Retail Price — informational, used as an
    # optional column on Insurance / Inventory / Lost-Stolen / Year End
    # reports (alongside or instead of the user's actual purchase cost).
    # 0 = not set; user fills this in if they want MSRP totals in reports.
    msrp_price: Optional[float] = 0.0
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
    receipts: List[str] = []  # base64 receipt photos auto-saved by AI scanner

    is_consumable: bool = False
    consumable_info: Optional[ConsumableInfo] = None
    needs_repair: bool = False
    repair_info: Optional[RepairInfo] = None
    warranty: Optional[Warranty] = None
    dealer_id: Optional[str] = None
    dealer_name: Optional[str] = ""
    purchased_from_agent_id: Optional[str] = None  # snapshot at purchase
    purchased_from_agent_name: Optional[str] = ""
    is_checked_out: bool = False
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
    model_numbers: Optional[List[str]] = None
    serial_numbers: Optional[List[str]] = None
    is_set: bool = False
    set_serials: List[str] = []
    bundle_id: Optional[str] = None
    cost: Optional[float] = 0.0
    msrp_price: Optional[float] = 0.0
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
    receipts: List[str] = []

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
    model_numbers: Optional[List[str]] = None
    serial_numbers: Optional[List[str]] = None
    is_set: Optional[bool] = None
    set_serials: Optional[List[str]] = None
    bundle_id: Optional[str] = None
    cost: Optional[float] = None
    msrp_price: Optional[float] = None
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
    receipts: Optional[List[str]] = None
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


# ---------- Bundles / Sets ----------
class Bundle(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    part_number: Optional[str] = ""   # the set/bundle part number
    set_price: Optional[float] = 0.0  # what the whole set costs (separate from item prices)
    photos: List[str] = []            # bundle/set photo(s)
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class BundleCreate(BaseModel):
    name: str
    part_number: Optional[str] = ""
    set_price: Optional[float] = 0.0
    photos: List[str] = []
    notes: Optional[str] = ""


class BundleUpdate(BaseModel):
    name: Optional[str] = None
    part_number: Optional[str] = None
    set_price: Optional[float] = None
    photos: Optional[List[str]] = None
    notes: Optional[str] = None


class CheckoutRequest(BaseModel):
    borrower_name: str
    borrower_id: Optional[str] = None
    # Optional phone — if not given but borrower_id is, the endpoint will
    # look it up from the borrowers collection.
    borrower_phone: Optional[str] = ""
    notes: Optional[str] = ""
