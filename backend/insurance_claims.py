"""
Insurance Claims module — documentation & reporting system (NOT direct filing).

Self-contained router factory, mirroring reports.make_reports_router so it slots
into server.py with the user-scoped db proxy + auth dependency. Reuses the
ReportLab engine helpers from reports.py for professional PDF generation.

Collections (all user-scoped via the db proxy):
  - insurance_claims : claim core + embedded items / notes / timeline
  - claim_evidence   : claim-only files (photos / documents), base64 in Mongo
  - claim_reports    : generated PDF versions, base64 in Mongo (immutable history)

Design rules honoured:
  - Claims REFERENCE inventory (tool_id) and never modify it. A light snapshot
    is kept per item so a claim stays intact even if the tool is later edited
    or deleted.
  - Generated PDFs are frozen blobs — historical reports never change.
"""
from __future__ import annotations

import base64
import io
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image as RLImage,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# Reuse the battle-tested helpers from the existing report engine.
from reports import (
    PAGE_W,
    esc,
    fmt_date_us,
    fmt_money,
    _fit_image,
    _hr,
    _para,
    _styles,
)

import email_sender

# ---------------------------------------------------------------------------
# Enums / catalog
# ---------------------------------------------------------------------------
CLAIM_TYPES = [
    "Theft", "Burglary", "Vandalism", "Fire", "Flood", "Tornado", "Hurricane",
    "Wind Damage", "Vehicle Break-In", "Shop Damage", "Lost Tools",
    "Natural Disaster", "Other",
]
CLAIM_STATUSES = [
    "Draft", "Submitted", "Under Review", "More Information Needed", "Approved",
    "Partially Approved", "Denied", "Paid", "Closed", "Reopened",
]
OPEN_STATUSES = {"Draft", "Submitted", "Under Review", "More Information Needed",
                 "Reopened", "Partially Approved"}
CLOSED_STATUSES = {"Approved", "Denied", "Paid", "Closed"}
PRE_LOSS_CONDITIONS = ["New", "Excellent", "Good", "Fair", "Poor"]
POST_LOSS_CONDITIONS = ["Missing", "Stolen", "Damaged", "Destroyed",
                        "Repairable", "Unknown"]
NOTE_CATEGORIES = ["General", "Insurance", "Agent Communication",
                   "Adjuster Communication", "Internal Notes", "Follow-Up"]
EVIDENCE_KINDS = ["Disaster Photo", "Damage Photo", "Police Report",
                  "Insurance Document", "Inspection Report", "Repair Estimate",
                  "Document", "Other"]

ACCENT = "#1F3A5F"  # professional slate-navy for insurance docs

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tl(type_: str, detail: str = "") -> "TimelineEntry":
    return TimelineEntry(type=type_, detail=detail)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class InsuranceInfo(BaseModel):
    company: Optional[str] = ""
    policy_number: Optional[str] = ""
    agent_name: Optional[str] = ""
    agent_phone: Optional[str] = ""
    agent_email: Optional[str] = ""
    adjuster_name: Optional[str] = ""
    adjuster_phone: Optional[str] = ""
    adjuster_email: Optional[str] = ""
    portal_url: Optional[str] = ""


class ClaimItem(BaseModel):
    tool_id: str
    # Per-item evidence include/exclude flags (what appears in reports).
    include_photos: bool = True
    include_receipts: bool = True
    include_serial: bool = True
    include_model: bool = True
    include_purchase_date: bool = True
    include_warranty: bool = True
    include_notes: bool = True
    include_documents: bool = True
    pre_loss_condition: str = "Good"
    post_loss_condition: str = "Unknown"
    item_notes: Optional[str] = ""
    # Optional value overrides (per line). When unset, live tool values are used.
    claimed_value: Optional[float] = None
    replacement_cost: Optional[float] = None
    # Light snapshot captured at attach time so the claim survives tool edits.
    snapshot: Dict[str, Any] = Field(default_factory=dict)
    added_at: str = Field(default_factory=_now)


class ClaimNote(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    author: Optional[str] = ""
    category: str = "General"
    created_at: str = Field(default_factory=_now)


class TimelineEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str               # Created / Status / Evidence / Note / Report / Email / Items
    detail: Optional[str] = ""
    created_at: str = Field(default_factory=_now)


class StatusChange(BaseModel):
    status: str
    created_at: str = Field(default_factory=_now)
    note: Optional[str] = ""


class InsuranceClaim(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    claim_type: str = "Other"
    status: str = "Draft"
    insurance: InsuranceInfo = Field(default_factory=InsuranceInfo)
    claim_number: Optional[str] = ""
    date_of_loss: Optional[str] = ""
    date_discovered: Optional[str] = ""
    description: Optional[str] = ""
    incident_notes: Optional[str] = ""
    loss_location: Optional[str] = ""
    police_report_number: Optional[str] = ""
    case_number: Optional[str] = ""
    additional_notes: Optional[str] = ""
    # Financials (all user-entered amounts)
    deductible: Optional[float] = 0.0
    coverage_limit: Optional[float] = 0.0
    depreciation: Optional[float] = 0.0
    sales_tax: Optional[float] = 0.0
    shipping_costs: Optional[float] = 0.0
    labor_costs: Optional[float] = 0.0
    repair_costs: Optional[float] = 0.0
    # Outcome values entered by the user as the claim progresses (dashboard).
    approved_value: Optional[float] = 0.0
    paid_value: Optional[float] = 0.0
    items: List[ClaimItem] = []
    notes: List[ClaimNote] = []
    timeline: List[TimelineEntry] = []
    status_history: List[StatusChange] = []
    archived: bool = False
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class ClaimCreate(BaseModel):
    title: str
    claim_type: str = "Other"
    status: str = "Draft"
    insurance: Optional[InsuranceInfo] = None
    claim_number: Optional[str] = ""
    date_of_loss: Optional[str] = ""
    date_discovered: Optional[str] = ""
    description: Optional[str] = ""
    incident_notes: Optional[str] = ""
    loss_location: Optional[str] = ""
    police_report_number: Optional[str] = ""
    case_number: Optional[str] = ""
    additional_notes: Optional[str] = ""
    deductible: Optional[float] = 0.0
    coverage_limit: Optional[float] = 0.0
    depreciation: Optional[float] = 0.0
    sales_tax: Optional[float] = 0.0
    shipping_costs: Optional[float] = 0.0
    labor_costs: Optional[float] = 0.0
    repair_costs: Optional[float] = 0.0


class ClaimUpdate(BaseModel):
    title: Optional[str] = None
    claim_type: Optional[str] = None
    insurance: Optional[InsuranceInfo] = None
    claim_number: Optional[str] = None
    date_of_loss: Optional[str] = None
    date_discovered: Optional[str] = None
    description: Optional[str] = None
    incident_notes: Optional[str] = None
    loss_location: Optional[str] = None
    police_report_number: Optional[str] = None
    case_number: Optional[str] = None
    additional_notes: Optional[str] = None
    deductible: Optional[float] = None
    coverage_limit: Optional[float] = None
    depreciation: Optional[float] = None
    sales_tax: Optional[float] = None
    shipping_costs: Optional[float] = None
    labor_costs: Optional[float] = None
    repair_costs: Optional[float] = None
    approved_value: Optional[float] = None
    paid_value: Optional[float] = None


class StatusChangeRequest(BaseModel):
    status: str
    note: Optional[str] = ""
    approved_value: Optional[float] = None
    paid_value: Optional[float] = None


class AttachItemsRequest(BaseModel):
    tool_ids: List[str]


class ItemPatch(BaseModel):
    include_photos: Optional[bool] = None
    include_receipts: Optional[bool] = None
    include_serial: Optional[bool] = None
    include_model: Optional[bool] = None
    include_purchase_date: Optional[bool] = None
    include_warranty: Optional[bool] = None
    include_notes: Optional[bool] = None
    include_documents: Optional[bool] = None
    pre_loss_condition: Optional[str] = None
    post_loss_condition: Optional[str] = None
    item_notes: Optional[str] = None
    claimed_value: Optional[float] = None
    replacement_cost: Optional[float] = None


class NoteCreate(BaseModel):
    text: str
    category: str = "General"
    author: Optional[str] = ""


class EvidenceCreate(BaseModel):
    filename: str
    mime: str
    kind: str = "Document"
    data_b64: str           # data-URI or raw base64
    caption: Optional[str] = ""


class ReportOptions(BaseModel):
    kind: str = "detailed"               # "quick" | "detailed"
    include_cover: bool = True
    include_insurance: bool = True
    include_incident: bool = True
    include_timeline: bool = True
    include_items: bool = True
    include_photos: bool = True
    include_receipts: bool = True
    include_financials: bool = True
    include_notes: bool = True
    include_evidence: bool = True
    section_order: List[str] = []        # optional override of section order


class EmailReportRequest(BaseModel):
    to: str
    cc: Optional[str] = ""
    subject: Optional[str] = ""
    body: Optional[str] = ""


# ---------------------------------------------------------------------------
# Financial calculation
# ---------------------------------------------------------------------------

def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _resolve_item(item: Dict[str, Any], tool: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Merge a ClaimItem with the live tool (or its snapshot fallback)."""
    snap = item.get("snapshot") or {}
    src = tool or snap
    qty = int(src.get("quantity") or snap.get("quantity") or 1) or 1
    cost = _num(src.get("cost", snap.get("cost")))
    msrp = _num(src.get("msrp_price", snap.get("msrp_price")))
    repl_override = item.get("replacement_cost")
    replacement_unit = _num(repl_override) if repl_override not in (None, "") else (msrp or cost)
    claimed_override = item.get("claimed_value")
    line_replacement = replacement_unit * qty
    line_purchase = cost * qty
    if claimed_override not in (None, ""):
        line_claimed = _num(claimed_override)
    else:
        line_claimed = line_replacement or line_purchase
    serials = src.get("serial_numbers") or ([src.get("serial_number")] if src.get("serial_number") else [])
    models = src.get("model_numbers") or ([src.get("model")] if src.get("model") else [])
    return {
        "tool_id": item.get("tool_id"),
        "name": src.get("name") or snap.get("name") or "(removed item)",
        "brand": src.get("brand") or snap.get("brand") or "",
        "models": [m for m in models if m],
        "serials": [s for s in serials if s],
        "quantity": qty,
        "cost": cost,
        "msrp_price": msrp,
        "purchase_date": src.get("purchase_date") or snap.get("purchase_date") or "",
        "location_name": src.get("location_name") or snap.get("location_name") or "",
        "category_name": src.get("category_name") or snap.get("category_name") or "",
        "photos": (src.get("photos") or []) if item.get("include_photos", True) else [],
        "receipts": (src.get("receipts") or []) if item.get("include_receipts", True) else [],
        "warranty": src.get("warranty") if item.get("include_warranty", True) else None,
        "pre_loss_condition": item.get("pre_loss_condition") or "",
        "post_loss_condition": item.get("post_loss_condition") or "",
        "item_notes": item.get("item_notes") or "",
        "line_purchase": line_purchase,
        "line_replacement": line_replacement,
        "line_claimed": line_claimed,
        "missing_tool": tool is None,
        "flags": {k: item.get(k, True) for k in (
            "include_photos", "include_receipts", "include_serial", "include_model",
            "include_purchase_date", "include_warranty", "include_notes", "include_documents")},
    }


def _compute_financials(resolved: List[Dict[str, Any]], claim: Dict[str, Any]) -> Dict[str, Any]:
    total_purchase = sum(r["line_purchase"] for r in resolved)
    total_replacement = sum(r["line_replacement"] for r in resolved)
    total_claimed = sum(r["line_claimed"] for r in resolved)
    extras = (_num(claim.get("sales_tax")) + _num(claim.get("shipping_costs"))
              + _num(claim.get("labor_costs")) + _num(claim.get("repair_costs")))
    deductions = _num(claim.get("depreciation")) + _num(claim.get("deductible"))
    net = total_claimed + extras - deductions
    limit = _num(claim.get("coverage_limit"))
    if limit > 0:
        net = min(net, limit)
    return {
        "item_count": len(resolved),
        "total_quantity": sum(r["quantity"] for r in resolved),
        "total_purchase": round(total_purchase, 2),
        "total_replacement": round(total_replacement, 2),
        "total_claimed": round(total_claimed, 2),
        "sales_tax": _num(claim.get("sales_tax")),
        "shipping_costs": _num(claim.get("shipping_costs")),
        "labor_costs": _num(claim.get("labor_costs")),
        "repair_costs": _num(claim.get("repair_costs")),
        "depreciation": _num(claim.get("depreciation")),
        "deductible": _num(claim.get("deductible")),
        "coverage_limit": limit,
        "net_claimed": round(max(net, 0), 2),
    }


# ---------------------------------------------------------------------------
# PDF rendering
# ---------------------------------------------------------------------------

def _footer_factory(claim: Dict[str, Any], version: int):
    cnum = claim.get("claim_number") or "—"
    pnum = (claim.get("insurance") or {}).get("policy_number") or "—"
    stamp = datetime.now(timezone.utc).strftime("%m/%d/%Y %H:%M UTC")

    def _painter(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#888888"))
        canvas.drawString(0.5 * inch, 0.32 * inch,
                          f"Claim #{cnum}  ·  Policy #{pnum}  ·  Report v{version}")
        canvas.drawCentredString(letter[0] / 2, 0.32 * inch,
                                 "Generated by Toolbox Vault")
        canvas.drawRightString(letter[0] - 0.5 * inch, 0.32 * inch,
                               f"{stamp}  ·  Page {doc.page}")
        canvas.restoreState()
    return _painter


def _kv_table(pairs: List[tuple], st: Dict[str, ParagraphStyle]) -> Table:
    """Two-column label/value grid. pairs = [(label, value), ...]."""
    rows = []
    for label, value in pairs:
        if value in (None, "", 0, 0.0):
            continue
        rows.append([_para(esc(str(label)), st["spec_l"]),
                     _para(esc(str(value)), st["spec_v"])])
    if not rows:
        rows = [[_para("—", st["spec_l"]), _para("", st["spec_v"])]]
    t = Table(rows, colWidths=[PAGE_W * 0.28, PAGE_W * 0.72])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, colors.HexColor("#eeeeee")),
    ]))
    return t


def _section(title: str, st: Dict[str, ParagraphStyle]) -> Paragraph:
    return Paragraph(esc(title.upper()), st["section"])


def _money_summary(fin: Dict[str, Any], st: Dict[str, ParagraphStyle]) -> Table:
    rows = [
        ("Total Purchase Value", fmt_money(fin["total_purchase"])),
        ("Total Replacement Value", fmt_money(fin["total_replacement"])),
        ("Total Claimed Value", fmt_money(fin["total_claimed"])),
    ]
    for label, key in (("Sales Tax", "sales_tax"), ("Shipping", "shipping_costs"),
                       ("Labor", "labor_costs"), ("Repair", "repair_costs"),
                       ("Depreciation", "depreciation"), ("Deductible", "deductible"),
                       ("Coverage Limit", "coverage_limit")):
        if fin.get(key):
            rows.append((label, fmt_money(fin[key])))
    rows.append(("NET CLAIMED", fmt_money(fin["net_claimed"])))
    data = [[_para(l, st["spec_l"]), _para(v, st["small_bold_right"])] for l, v in rows]
    t = Table(data, colWidths=[PAGE_W * 0.7, PAGE_W * 0.3])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, colors.HexColor("#eeeeee")),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor(ACCENT)),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f3f6fb")),
        ("TOPPADDING", (0, -1), (-1, -1), 6),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
    ]))
    return t


def _items_table(resolved: List[Dict[str, Any]], st: Dict[str, ParagraphStyle],
                 detailed: bool) -> Table:
    header = ["#", "Item", "Brand", "Serial / Model", "Qty", "Condition", "Claimed"]
    widths = [0.04, 0.26, 0.13, 0.20, 0.05, 0.16, 0.16]
    data = [[_para(h, st["th"] if i < 6 else st["th_right"]) for i, h in enumerate(header)]]
    for idx, r in enumerate(resolved, 1):
        sm = []
        if r["flags"].get("include_serial") and r["serials"]:
            sm.append("S/N " + ", ".join(r["serials"]))
        if r["flags"].get("include_model") and r["models"]:
            sm.append("M# " + ", ".join(r["models"]))
        cond = r["post_loss_condition"] or ""
        if r["pre_loss_condition"]:
            cond = f"{r['pre_loss_condition']} → {cond}"
        data.append([
            _para(str(idx), st["small"]),
            _para(esc(r["name"]), st["small"]),
            _para(esc(r["brand"]), st["small"]),
            _para(esc(" · ".join(sm)), st["small"]),
            _para(str(r["quantity"]), st["small"]),
            _para(esc(cond), st["small"]),
            _para(fmt_money(r["line_claimed"]), st["small_right"]),
        ])
    total = sum(r["line_claimed"] for r in resolved)
    data.append([_para("", st["small"]), _para("TOTAL", st["small_bold_right"]),
                 _para("", st["small"]), _para("", st["small"]), _para("", st["small"]),
                 _para("", st["small"]), _para(fmt_money(total), st["small_bold_right"])])
    t = Table(data, colWidths=[PAGE_W * w for w in widths], repeatRows=1)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111111")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#dddddd")),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor(ACCENT)),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f7f9fc")]),
    ]))
    return t


def _photo_pages(resolved: List[Dict[str, Any]], st: Dict[str, ParagraphStyle],
                 want_photos: bool, want_receipts: bool) -> List[Any]:
    flow: List[Any] = []
    pairs: List[tuple] = []
    for r in resolved:
        if want_photos and r["flags"].get("include_photos"):
            for p in (r["photos"] or [])[:6]:
                pairs.append((r["name"], "Photo", p))
        if want_receipts and r["flags"].get("include_receipts"):
            for p in (r["receipts"] or [])[:4]:
                pairs.append((r["name"], "Receipt", p))
    if not pairs:
        return flow
    flow.append(PageBreak())
    flow.append(_section("Photos & Receipts", st))
    cells: List[Any] = []
    for name, label, src in pairs:
        img = _fit_image(src, PAGE_W * 0.46, 2.6 * inch, max_px=520)
        if not img:
            continue
        cap = _para(f"<b>{esc(name)}</b> — {label}", st["small"])
        inner = Table([[img], [cap]], colWidths=[PAGE_W * 0.46])
        inner.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        cells.append(inner)
    grid: List[List[Any]] = []
    for i in range(0, len(cells), 2):
        row = cells[i:i + 2]
        if len(row) == 1:
            row.append("")
        grid.append(row)
    if grid:
        g = Table(grid, colWidths=[PAGE_W * 0.5, PAGE_W * 0.5])
        g.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        flow.append(g)
    return flow


def _evidence_pages(evidence: List[Dict[str, Any]], st: Dict[str, ParagraphStyle]) -> List[Any]:
    flow: List[Any] = []
    imgs = [e for e in evidence if (e.get("mime") or "").startswith("image")]
    docs = [e for e in evidence if not (e.get("mime") or "").startswith("image")]
    if not imgs and not docs:
        return flow
    flow.append(PageBreak())
    flow.append(_section("Claim Evidence", st))
    for e in imgs:
        img = _fit_image(e.get("data_b64"), PAGE_W, 7.2 * inch, max_px=900)
        if img:
            flow.append(_para(f"<b>{esc(e.get('kind',''))}</b> — {esc(e.get('filename',''))}", st["small"]))
            if e.get("caption"):
                flow.append(_para(esc(e["caption"]), st["muted"]))
            flow.append(Spacer(1, 4))
            flow.append(img)
            flow.append(Spacer(1, 10))
    if docs:
        flow.append(Spacer(1, 6))
        flow.append(_para("Attached documents (included with this claim):", st["small"]))
        rows = [[_para(esc(e.get("kind", "")), st["small"]),
                 _para(esc(e.get("filename", "")), st["small"]),
                 _para(esc(e.get("caption", "")), st["muted"])] for e in docs]
        t = Table(rows, colWidths=[PAGE_W * 0.25, PAGE_W * 0.4, PAGE_W * 0.35])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#eeeeee")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
        ]))
        flow.append(t)
    return flow


def build_claim_pdf(claim: Dict[str, Any], resolved: List[Dict[str, Any]],
                    fin: Dict[str, Any], profile: Dict[str, Any],
                    evidence: List[Dict[str, Any]], opts: ReportOptions,
                    version: int) -> bytes:
    st = _styles(ACCENT)
    detailed = opts.kind == "detailed"
    ins = claim.get("insurance") or {}
    story: List[Any] = []

    # ---- Cover / title ----
    story.append(Paragraph("TOOLBOX VAULT", ParagraphStyle(
        "brand", fontName="Helvetica-Bold", fontSize=13, alignment=TA_CENTER,
        textColor=colors.HexColor(ACCENT), spaceAfter=2)))
    story.append(Paragraph(
        "INSURANCE CLAIM REPORT" if detailed else "INSURANCE CLAIM SUMMARY",
        st["title"]))
    story.append(Paragraph(esc(claim.get("title", "")), st["title_sub"]))
    story.append(Spacer(1, 4))
    story.append(_hr(ACCENT, 1.4))
    story.append(Spacer(1, 8))

    # ---- Header info: claimant + claim meta side by side ----
    claimant_pairs = [
        ("Claimant", profile.get("name") or ""),
        ("Address", profile.get("address") or ""),
        ("City/State/ZIP", ", ".join(filter(None, [profile.get("city"),
            profile.get("state"), profile.get("zip_code")]))),
        ("Phone", profile.get("phone") or ""),
        ("Email", profile.get("email") or ""),
    ]
    claim_meta = [
        ("Claim Title", claim.get("title")),
        ("Claim Type", claim.get("claim_type")),
        ("Status", claim.get("status")),
        ("Claim #", claim.get("claim_number")),
        ("Date of Loss", fmt_date_us(claim.get("date_of_loss")) if claim.get("date_of_loss") else ""),
        ("Date Discovered", fmt_date_us(claim.get("date_discovered")) if claim.get("date_discovered") else ""),
        ("Loss Location", claim.get("loss_location")),
    ]
    hdr = Table([[_kv_table(claimant_pairs, st), _kv_table(claim_meta, st)]],
                colWidths=[PAGE_W * 0.5, PAGE_W * 0.5])
    hdr.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                             ("LEFTPADDING", (1, 0), (1, 0), 12)]))
    story.append(hdr)
    story.append(Spacer(1, 8))

    section_funcs: Dict[str, Callable[[], None]] = {}

    def add_insurance():
        if not opts.include_insurance:
            return
        story.append(_section("Insurance & Policy Information", st))
        story.append(_kv_table([
            ("Insurance Company", ins.get("company")),
            ("Policy Number", ins.get("policy_number")),
            ("Agent", ins.get("agent_name")),
            ("Agent Phone", ins.get("agent_phone")),
            ("Agent Email", ins.get("agent_email")),
            ("Adjuster", ins.get("adjuster_name")),
            ("Adjuster Phone", ins.get("adjuster_phone")),
            ("Adjuster Email", ins.get("adjuster_email")),
            ("Claim Portal", ins.get("portal_url")),
            ("Police Report #", claim.get("police_report_number")),
            ("Case #", claim.get("case_number")),
        ], st))

    def add_incident():
        if not opts.include_incident:
            return
        if claim.get("description") or claim.get("incident_notes") or claim.get("additional_notes"):
            story.append(_section("Incident Description", st))
            for label, key in (("Description", "description"),
                               ("Incident Notes", "incident_notes"),
                               ("Additional Notes", "additional_notes")):
                if claim.get(key):
                    story.append(_para(f"<b>{label}:</b> {esc(claim[key])}", st["small"]))
                    story.append(Spacer(1, 3))

    def add_items():
        if not opts.include_items or not resolved:
            return
        story.append(_section(f"Itemized Asset List ({len(resolved)} items)", st))
        story.append(_items_table(resolved, st, detailed))

    def add_financials():
        if not opts.include_financials:
            return
        story.append(_section("Claim Totals", st))
        story.append(_money_summary(fin, st))

    def add_notes():
        if not opts.include_notes:
            return
        notes = claim.get("notes") or []
        if not notes:
            return
        story.append(_section("Notes", st))
        for n in notes:
            meta = f"{fmt_date_us(n.get('created_at'))} · {n.get('category','')}"
            story.append(_para(f"<b>{esc(meta)}</b>", st["muted"]))
            story.append(_para(esc(n.get("text", "")), st["small"]))
            story.append(Spacer(1, 3))

    def add_timeline():
        if not opts.include_timeline:
            return
        tl = claim.get("timeline") or []
        if not tl:
            return
        story.append(_section("Claim Timeline", st))
        rows = [[_para(fmt_date_us(t.get("created_at")), st["small"]),
                 _para(esc(t.get("type", "")), st["small"]),
                 _para(esc(t.get("detail", "")), st["muted"])] for t in tl]
        t = Table(rows, colWidths=[PAGE_W * 0.22, PAGE_W * 0.22, PAGE_W * 0.56])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#eeeeee")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("TOPPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t)

    section_funcs = {
        "insurance": add_insurance,
        "incident": add_incident,
        "items": add_items,
        "financials": add_financials,
        "notes": add_notes,
        "timeline": add_timeline,
    }
    default_order = ["insurance", "incident", "items", "financials"]
    if detailed:
        default_order = ["insurance", "incident", "timeline", "items", "financials", "notes"]
    order = [s for s in (opts.section_order or default_order) if s in section_funcs]
    for s in order:
        section_funcs[s]()
        story.append(Spacer(1, 6))

    # Photos / receipts (detailed only, or when explicitly requested)
    if detailed and (opts.include_photos or opts.include_receipts):
        story.extend(_photo_pages(resolved, st, opts.include_photos, opts.include_receipts))
    if detailed and opts.include_evidence and evidence:
        story.extend(_evidence_pages(evidence, st))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=0.5 * inch, rightMargin=0.5 * inch,
        topMargin=0.55 * inch, bottomMargin=0.55 * inch,
        title=f"Insurance Claim — {claim.get('title','')}",
    )
    painter = _footer_factory(claim, version)
    doc.build(story, onFirstPage=painter, onLaterPages=painter)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Router factory
# ---------------------------------------------------------------------------

def make_insurance_claims_router(api_router: APIRouter, get_db, get_current_user) -> None:

    async def _get_claim(db, claim_id: str) -> Dict[str, Any]:
        doc = await db.insurance_claims.find_one({"id": claim_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Claim not found")
        return doc

    async def _save(db, claim: Dict[str, Any]):
        claim["updated_at"] = _now()
        await db.insurance_claims.update_one({"id": claim["id"]}, {"$set": claim})

    # ---- catalog ----
    @api_router.get("/insurance-claims/spec")
    async def insurance_spec():
        return {
            "claim_types": CLAIM_TYPES,
            "statuses": CLAIM_STATUSES,
            "pre_loss_conditions": PRE_LOSS_CONDITIONS,
            "post_loss_conditions": POST_LOSS_CONDITIONS,
            "note_categories": NOTE_CATEGORIES,
            "evidence_kinds": EVIDENCE_KINDS,
            "report_sections": ["insurance", "incident", "timeline", "items",
                                "financials", "notes"],
        }

    # ---- dashboard summary ----
    @api_router.get("/insurance-claims/summary")
    async def insurance_summary():
        db = get_db()
        claims = await db.insurance_claims.find({"archived": {"$ne": True}}, {"_id": 0}).to_list(5000)
        total = len(claims)
        open_n = sum(1 for c in claims if c.get("status") in OPEN_STATUSES)
        closed_n = sum(1 for c in claims if c.get("status") in CLOSED_STATUSES)
        claimed_val = 0.0
        approved_val = sum(_num(c.get("approved_value")) for c in claims)
        paid_val = sum(_num(c.get("paid_value")) for c in claims)
        # claimed value uses live computation per claim
        for c in claims:
            resolved = await _resolve_claim_items(db, c)
            claimed_val += _compute_financials(resolved, c)["total_claimed"]
        return {
            "total_claims": total,
            "open_claims": open_n,
            "closed_claims": closed_n,
            "total_claimed_value": round(claimed_val, 2),
            "total_approved_value": round(approved_val, 2),
            "total_paid_value": round(paid_val, 2),
        }

    async def _resolve_claim_items(db, claim: Dict[str, Any]) -> List[Dict[str, Any]]:
        items = claim.get("items") or []
        if not items:
            return []
        ids = [i["tool_id"] for i in items]
        tools = await db.tools.find({"id": {"$in": ids}}, {"_id": 0}).to_list(5000)
        by_id = {t["id"]: t for t in tools}
        return [_resolve_item(i, by_id.get(i["tool_id"])) for i in items]

    # ---- list ----
    @api_router.get("/insurance-claims")
    async def list_claims(q: Optional[str] = None, status: Optional[str] = None,
                          claim_type: Optional[str] = None, archived: bool = False,
                          sort: str = "-updated_at"):
        db = get_db()
        query: Dict[str, Any] = {"archived": True} if archived else {"archived": {"$ne": True}}
        if status:
            query["status"] = status
        if claim_type:
            query["claim_type"] = claim_type
        docs = await db.insurance_claims.find(query, {"_id": 0}).to_list(5000)
        if q:
            ql = q.lower()
            def _match(c):
                ins = c.get("insurance") or {}
                hay = " ".join(str(x or "") for x in [
                    c.get("title"), c.get("claim_number"), c.get("claim_type"),
                    c.get("status"), ins.get("company"), ins.get("policy_number"),
                    ins.get("agent_name"), c.get("date_of_loss")]).lower()
                return ql in hay
            docs = [c for c in docs if _match(c)]
        reverse = sort.startswith("-")
        key = sort.lstrip("-")
        docs.sort(key=lambda c: str(c.get(key) or ""), reverse=reverse)
        # attach a lightweight claimed-total for list cards
        out = []
        for c in docs:
            resolved = await _resolve_claim_items(db, c)
            fin = _compute_financials(resolved, c)
            c["_item_count"] = len(resolved)
            c["_total_claimed"] = fin["total_claimed"]
            out.append(c)
        return out

    # ---- create ----
    @api_router.post("/insurance-claims", response_model=InsuranceClaim)
    async def create_claim(payload: ClaimCreate):
        db = get_db()
        data = payload.dict()
        if data.get("insurance") is None:
            data["insurance"] = InsuranceInfo().dict()
        claim = InsuranceClaim(**data)
        claim.timeline.append(_tl("Created", f"Claim created — {claim.title}"))
        claim.status_history.append(StatusChange(status=claim.status))
        await db.insurance_claims.insert_one(claim.dict())
        return claim

    # ---- read ----
    @api_router.get("/insurance-claims/{claim_id}")
    async def get_claim(claim_id: str):
        db = get_db()
        claim = await _get_claim(db, claim_id)
        resolved = await _resolve_claim_items(db, claim)
        claim["_resolved_items"] = resolved
        claim["_financials"] = _compute_financials(resolved, claim)
        return claim

    # ---- update ----
    @api_router.put("/insurance-claims/{claim_id}")
    async def update_claim(claim_id: str, payload: ClaimUpdate):
        db = get_db()
        claim = await _get_claim(db, claim_id)
        updates = payload.dict(exclude_unset=True)
        if "insurance" in updates and updates["insurance"] is not None:
            claim["insurance"] = {**(claim.get("insurance") or {}), **updates.pop("insurance")}
        elif "insurance" in updates:
            updates.pop("insurance")
        claim.update(updates)
        await _save(db, claim)
        return claim

    # ---- delete ----
    @api_router.delete("/insurance-claims/{claim_id}")
    async def delete_claim(claim_id: str):
        db = get_db()
        await _get_claim(db, claim_id)
        await db.insurance_claims.delete_one({"id": claim_id})
        await db.claim_evidence.delete_many({"claim_id": claim_id})
        await db.claim_reports.delete_many({"claim_id": claim_id})
        return {"ok": True}

    # ---- status ----
    @api_router.post("/insurance-claims/{claim_id}/status")
    async def change_status(claim_id: str, payload: StatusChangeRequest):
        db = get_db()
        if payload.status not in CLAIM_STATUSES:
            raise HTTPException(400, "Invalid status")
        claim = await _get_claim(db, claim_id)
        prev = claim.get("status")
        claim["status"] = payload.status
        if payload.approved_value is not None:
            claim["approved_value"] = payload.approved_value
        if payload.paid_value is not None:
            claim["paid_value"] = payload.paid_value
        claim.setdefault("status_history", []).append(
            StatusChange(status=payload.status, note=payload.note or "").dict())
        claim.setdefault("timeline", []).append(
            _tl("Status", f"{prev} → {payload.status}" +
                (f" — {payload.note}" if payload.note else "")).dict())
        await _save(db, claim)
        return claim

    # ---- attach items (bulk) ----
    @api_router.post("/insurance-claims/{claim_id}/items")
    async def attach_items(claim_id: str, payload: AttachItemsRequest):
        db = get_db()
        claim = await _get_claim(db, claim_id)
        existing = {i["tool_id"] for i in (claim.get("items") or [])}
        tools = await db.tools.find({"id": {"$in": payload.tool_ids}}, {"_id": 0}).to_list(5000)
        by_id = {t["id"]: t for t in tools}
        added = 0
        for tid in payload.tool_ids:
            if tid in existing or tid not in by_id:
                continue
            t = by_id[tid]
            snap = {k: t.get(k) for k in ("name", "brand", "model", "serial_number",
                    "model_numbers", "serial_numbers", "cost", "msrp_price", "quantity",
                    "purchase_date", "location_name", "category_name")}
            claim.setdefault("items", []).append(ClaimItem(tool_id=tid, snapshot=snap).dict())
            existing.add(tid)
            added += 1
        if added:
            claim.setdefault("timeline", []).append(
                _tl("Items", f"Attached {added} item(s)").dict())
        await _save(db, claim)
        resolved = await _resolve_claim_items(db, claim)
        return {"added": added, "items": resolved}

    # ---- bulk remove ----
    @api_router.post("/insurance-claims/{claim_id}/items/bulk-remove")
    async def bulk_remove(claim_id: str, payload: AttachItemsRequest):
        db = get_db()
        claim = await _get_claim(db, claim_id)
        remove = set(payload.tool_ids)
        before = len(claim.get("items") or [])
        claim["items"] = [i for i in (claim.get("items") or []) if i["tool_id"] not in remove]
        removed = before - len(claim["items"])
        if removed:
            claim.setdefault("timeline", []).append(
                _tl("Items", f"Removed {removed} item(s)").dict())
        await _save(db, claim)
        return {"removed": removed}

    # ---- detach single (never deletes the tool) ----
    @api_router.delete("/insurance-claims/{claim_id}/items/{tool_id}")
    async def detach_item(claim_id: str, tool_id: str):
        db = get_db()
        claim = await _get_claim(db, claim_id)
        claim["items"] = [i for i in (claim.get("items") or []) if i["tool_id"] != tool_id]
        await _save(db, claim)
        return {"ok": True}

    # ---- patch per-item ----
    @api_router.patch("/insurance-claims/{claim_id}/items/{tool_id}")
    async def patch_item(claim_id: str, tool_id: str, payload: ItemPatch):
        db = get_db()
        claim = await _get_claim(db, claim_id)
        updates = payload.dict(exclude_unset=True)
        found = False
        for i in claim.get("items") or []:
            if i["tool_id"] == tool_id:
                i.update(updates)
                found = True
                break
        if not found:
            raise HTTPException(404, "Item not attached to claim")
        await _save(db, claim)
        return {"ok": True}

    # ---- notes ----
    @api_router.post("/insurance-claims/{claim_id}/notes")
    async def add_note(claim_id: str, payload: NoteCreate):
        db = get_db()
        claim = await _get_claim(db, claim_id)
        note = ClaimNote(text=payload.text, category=payload.category, author=payload.author or "")
        claim.setdefault("notes", []).append(note.dict())
        claim.setdefault("timeline", []).append(
            _tl("Note", f"{payload.category} note added").dict())
        await _save(db, claim)
        return note

    @api_router.delete("/insurance-claims/{claim_id}/notes/{note_id}")
    async def delete_note(claim_id: str, note_id: str):
        db = get_db()
        claim = await _get_claim(db, claim_id)
        claim["notes"] = [n for n in (claim.get("notes") or []) if n["id"] != note_id]
        await _save(db, claim)
        return {"ok": True}

    # ---- evidence ----
    @api_router.post("/insurance-claims/{claim_id}/evidence")
    async def add_evidence(claim_id: str, payload: EvidenceCreate):
        db = get_db()
        await _get_claim(db, claim_id)
        ev = {
            "id": str(uuid.uuid4()),
            "claim_id": claim_id,
            "filename": payload.filename,
            "mime": payload.mime,
            "kind": payload.kind,
            "caption": payload.caption or "",
            "data_b64": payload.data_b64,
            "size": len(payload.data_b64 or ""),
            "created_at": _now(),
        }
        await db.claim_evidence.insert_one(ev)
        claim = await _get_claim(db, claim_id)
        claim.setdefault("timeline", []).append(
            _tl("Evidence", f"{payload.kind}: {payload.filename}").dict())
        await _save(db, claim)
        ev.pop("data_b64", None)
        return ev

    @api_router.get("/insurance-claims/{claim_id}/evidence")
    async def list_evidence(claim_id: str):
        db = get_db()
        await _get_claim(db, claim_id)
        evs = await db.claim_evidence.find({"claim_id": claim_id}, {"_id": 0}).to_list(2000)
        for e in evs:
            e.pop("data_b64", None)  # metadata only for the list view
        return evs

    @api_router.get("/insurance-claims/{claim_id}/evidence/{ev_id}")
    async def get_evidence(claim_id: str, ev_id: str):
        db = get_db()
        ev = await db.claim_evidence.find_one({"claim_id": claim_id, "id": ev_id}, {"_id": 0})
        if not ev:
            raise HTTPException(404, "Evidence not found")
        return ev

    @api_router.delete("/insurance-claims/{claim_id}/evidence/{ev_id}")
    async def delete_evidence(claim_id: str, ev_id: str):
        db = get_db()
        await db.claim_evidence.delete_one({"claim_id": claim_id, "id": ev_id})
        return {"ok": True}

    # ---- duplicate ----
    @api_router.post("/insurance-claims/{claim_id}/duplicate")
    async def duplicate_claim(claim_id: str):
        db = get_db()
        claim = await _get_claim(db, claim_id)
        new = dict(claim)
        new.pop("_id", None)
        new["id"] = str(uuid.uuid4())
        new["title"] = (claim.get("title") or "Claim") + " (Copy)"
        new["status"] = "Draft"
        new["claim_number"] = ""
        new["archived"] = False
        new["created_at"] = _now()
        new["updated_at"] = _now()
        new["notes"] = []
        new["status_history"] = [StatusChange(status="Draft").dict()]
        new["timeline"] = [_tl("Created", f"Duplicated from {claim.get('title','')}").dict()]
        new["approved_value"] = 0.0
        new["paid_value"] = 0.0
        await db.insurance_claims.insert_one(new)
        new.pop("_id", None)
        return new

    # ---- archive toggle ----
    @api_router.post("/insurance-claims/{claim_id}/archive")
    async def archive_claim(claim_id: str, archived: bool = True):
        db = get_db()
        claim = await _get_claim(db, claim_id)
        claim["archived"] = archived
        await _save(db, claim)
        return {"archived": archived}

    # ---- reports ----
    async def _gen_report(db, claim_id: str, opts: ReportOptions):
        claim = await _get_claim(db, claim_id)
        resolved = await _resolve_claim_items(db, claim)
        fin = _compute_financials(resolved, claim)
        profile = await db.personal_profile.find_one({"id": "self"}, {"_id": 0}) or {}
        evidence = []
        if opts.include_evidence:
            evidence = await db.claim_evidence.find({"claim_id": claim_id}, {"_id": 0}).to_list(500)
        prev = await db.claim_reports.find({"claim_id": claim_id}, {"version": 1, "_id": 0}).to_list(1000)
        version = (max([p.get("version", 0) for p in prev], default=0)) + 1
        pdf = build_claim_pdf(claim, resolved, fin, profile, evidence, opts, version)
        b64 = base64.b64encode(pdf).decode()
        rec = {
            "id": str(uuid.uuid4()),
            "claim_id": claim_id,
            "version": version,
            "kind": opts.kind,
            "filename": f"insurance-claim-{(claim.get('claim_number') or claim_id)[:16]}-v{version}.pdf",
            "format": "pdf",
            "size": len(pdf),
            "options": opts.dict(),
            "data_b64": b64,
            "generated_at": _now(),
        }
        await db.claim_reports.insert_one(dict(rec))
        claim = await _get_claim(db, claim_id)
        claim.setdefault("timeline", []).append(
            _tl("Report", f"{opts.kind.title()} report v{version} generated").dict())
        await _save(db, claim)
        return rec, pdf

    @api_router.post("/insurance-claims/{claim_id}/reports/render")
    async def render_report(claim_id: str, opts: ReportOptions):
        db = get_db()
        rec, pdf = await _gen_report(db, claim_id, opts)
        return Response(
            content=pdf, media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="{rec["filename"]}"',
                "X-Report-Id": rec["id"], "X-Report-Version": str(rec["version"]),
            })

    @api_router.get("/insurance-claims/{claim_id}/reports")
    async def list_reports(claim_id: str):
        db = get_db()
        recs = await db.claim_reports.find({"claim_id": claim_id}, {"_id": 0, "data_b64": 0}).to_list(1000)
        recs.sort(key=lambda r: r.get("version", 0), reverse=True)
        return recs

    @api_router.get("/insurance-claims/{claim_id}/reports/{report_id}")
    async def download_report(claim_id: str, report_id: str):
        db = get_db()
        rec = await db.claim_reports.find_one({"claim_id": claim_id, "id": report_id}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "Report not found")
        pdf = base64.b64decode(rec["data_b64"])
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{rec["filename"]}"'})

    @api_router.post("/insurance-claims/{claim_id}/reports/{report_id}/email")
    async def email_report(claim_id: str, report_id: str, payload: EmailReportRequest,
                           user=Depends(get_current_user)):
        db = get_db()
        claim = await _get_claim(db, claim_id)
        rec = await db.claim_reports.find_one({"claim_id": claim_id, "id": report_id}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "Report not found")
        subject = payload.subject or f"Insurance Claim — {claim.get('title','')} (Claim #{claim.get('claim_number') or '—'})"
        body = payload.body or (
            f"Please find attached the insurance claim report for "
            f"\"{claim.get('title','')}\".\n\n"
            f"Claim #: {claim.get('claim_number') or '—'}\n"
            f"Policy #: {(claim.get('insurance') or {}).get('policy_number') or '—'}\n"
            f"Date of Loss: {claim.get('date_of_loss') or '—'}\n\n"
            f"Generated by Toolbox Vault.")
        ok = email_sender.send_email(
            to_address=payload.to, subject=subject, body_plain=body,
            reply_to=getattr(user, "email", None), cc=payload.cc or None,
            attachment_base64=rec["data_b64"], attachment_filename=rec["filename"],
            attachment_mime="application/pdf")
        if not ok:
            raise HTTPException(502, "Email could not be sent. Check email settings.")
        claim.setdefault("timeline", []).append(
            _tl("Email", f"Report v{rec['version']} emailed to {payload.to}").dict())
        await _save(db, claim)
        return {"sent": True, "to": payload.to}
