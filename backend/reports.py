"""
Unified report engine.

Architecture
------------
A single registry of report definitions ("specs"). Each spec declares:
  - Available columns (id, label, alignment, type, accessor)
  - Smart-preset (default-checked) column ids
  - A `fetch_data` async function that returns the rows for the report

A single PDF renderer + CSV renderer turn (rows + chosen columns) into the
final file. Adding a new report type is a one-place change: drop a new
ReportSpec into REPORTS.

Endpoints
---------
GET  /api/reports/spec     → returns the spec catalog so the frontend wizard
                             knows which columns each report exposes.
POST /api/reports/render   → returns a real PDF or CSV file for the chosen
                             report type + options + columns + format.

Notes
-----
* Photos are emitted via <img width="80"/> (width attribute, NOT CSS width)
  because xhtml2pdf only respects the HTML width attribute reliably. With
  only width set, the aspect ratio is preserved → photos NEVER stretch.
* Price / numeric columns automatically get totalled in a footer row when
  present in the chosen column set.
* Max 6 columns in a PDF (frontend enforces — backend silently truncates if
  more are passed, just to be safe).
"""

from __future__ import annotations

import csv as _csv
import io
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import Response

# xhtml2pdf is imported lazily — heavy import.
_pisa = None


def _get_pisa():
    global _pisa
    if _pisa is None:
        from xhtml2pdf import pisa as _pisa_mod
        _pisa = _pisa_mod
    return _pisa


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Column:
    id: str
    label: str
    align: str = "left"           # "left" | "right" | "center"
    type: str = "text"            # "text" | "money" | "number" | "date" | "image"
    width: Optional[str] = None   # CSS width like "1.2in" / "12%"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "align": self.align,
            "type": self.type,
        }


@dataclass
class ReportSpec:
    id: str
    title: str
    description: str
    icon: str                                    # Ionicons name (frontend hint)
    accent: str                                  # hex color for header/stripe
    columns: List[Column]
    default_columns: List[str]
    fetch: Callable[[Any, Any, Dict[str, Any]], Awaitable[Dict[str, Any]]]
    # optional render hooks
    cover_builder: Optional[Callable[[Dict[str, Any], Dict[str, Any]], str]] = None
    options_schema: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "icon": self.icon,
            "accent": self.accent,
            "columns": [c.to_dict() for c in self.columns],
            "default_columns": self.default_columns,
            "options_schema": self.options_schema,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def esc(s: Any) -> str:
    if s is None:
        return ""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def fmt_money(v: Any) -> str:
    try:
        return f"${float(v or 0):,.2f}"
    except Exception:
        return "$0.00"


def fmt_date_us(s: Any) -> str:
    """Convert any reasonable date string to MM/DD/YYYY."""
    if not s:
        return ""
    txt = str(s)
    # Handle ISO formats and bare date strings
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", txt)
    if m:
        return f"{m.group(2)}/{m.group(3)}/{m.group(1)}"
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", txt)
    if m:
        return txt
    try:
        dt = datetime.fromisoformat(txt.replace("Z", "+00:00"))
        return dt.strftime("%m/%d/%Y")
    except Exception:
        return txt


def in_range(date_str: Any, start: Optional[str], end: Optional[str]) -> bool:
    """Return True if date_str (any common format) is within [start..end].
    start/end may be empty meaning open-ended. Empty date_str → True (don't drop)."""
    if not date_str:
        return True
    txt = str(date_str)
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", txt)
    if m:
        d = txt[:10]
    else:
        m2 = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", txt)
        if m2:
            d = f"{m2.group(3)}-{m2.group(1)}-{m2.group(2)}"
        else:
            try:
                dt = datetime.fromisoformat(txt.replace("Z", "+00:00"))
                d = dt.strftime("%Y-%m-%d")
            except Exception:
                return True
    if start and d < start:
        return False
    if end and d > end:
        return False
    return True


def cell_value(col: Column, row: Dict[str, Any]) -> Any:
    raw = row.get(col.id)
    if col.type == "money":
        return fmt_money(raw)
    if col.type == "date":
        return fmt_date_us(raw)
    if raw is None:
        return ""
    return raw


def numeric_value(row: Dict[str, Any], key: str) -> float:
    try:
        return float(row.get(key) or 0)
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# CSS sanitisation for xhtml2pdf
# ---------------------------------------------------------------------------

_BAD_PROPS = [
    "object-fit", "gap", "row-gap", "column-gap",
    "grid-template-columns", "grid-template-rows", "grid-template-areas",
    "grid-area", "grid-column", "grid-row", "grid-auto-flow",
    "tab-size", "will-change", "backdrop-filter", "box-shadow",
    "transform", "transition", "animation",
    "-webkit-print-color-adjust", "print-color-adjust",
    "flex", "flex-direction", "flex-wrap", "flex-flow",
    "flex-shrink", "flex-grow", "flex-basis",
    "justify-content", "justify-items", "justify-self",
    "align-items", "align-content", "align-self",
    "place-items", "place-content", "order", "filter",
]
_BAD_RE = re.compile(
    rf"(?<![\w-])(?:{'|'.join(re.escape(p) for p in _BAD_PROPS)})\s*:[^;}}]*;?",
    re.IGNORECASE,
)


def _sanitize_html(html: str) -> str:
    return _BAD_RE.sub("", html)


# ---------------------------------------------------------------------------
# PDF rendering — single shared template
# ---------------------------------------------------------------------------

_BASE_CSS = """
@page { size: Letter; margin: 0.55in 0.5in 0.55in 0.5in; }
body { font-family: Helvetica, Arial, sans-serif; color: #111; margin: 0; }
.head { text-align: center; border-bottom: 4px solid {accent}; padding-bottom: 14px; margin-bottom: 14px; }
.head h1 { font-size: 24px; letter-spacing: 3px; margin: 0 0 6px; text-transform: uppercase; }
.head .date { color: #666; font-size: 11px; letter-spacing: 1px; }
.cover { margin-bottom: 14px; }

/* Personal-info mailing label — used by Insurance only */
.pi { border: 1px solid #ccc; border-left: 4px solid {accent}; padding: 8px 12px; margin-bottom: 14px; background: #fff; }
.pi-row { width: 100%; border-collapse: collapse; }
.pi-row td { vertical-align: top; padding: 0; }
.pi-name { font-size: 13px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin: 0 0 2px; color: #111; }
.pi-line { font-size: 10.5px; line-height: 1.35; color: #333; margin: 0; }
.pi-right { text-align: right; }
.pi-right .pi-line { color: #555; }

/* Stat cards (table-based — xhtml2pdf strips flex) */
.stats { width: 100%; border-collapse: separate; border-spacing: 8px 0; margin-bottom: 14px; }
.stats td { width: 50%; border: 1px solid #ddd; padding: 10px 14px; border-radius: 4px; background: #fafafa; vertical-align: top; }
.stats td.tot { background: {accent}; color: #000; border-color: {accent}; }
.stats .stat-l { font-size: 9px; letter-spacing: 1.5px; color: #666; text-transform: uppercase; font-weight: 700; }
.stats td.tot .stat-l { color: #4a3500; }
.stats .stat-v { font-size: 18px; font-weight: 800; margin-top: 2px; }

/* Data table */
table.report { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 6px; table-layout: fixed; }
table.report thead th { background: #111; color: {accent}; font-size: 9px; letter-spacing: 1.2px; text-align: left; padding: 7px 6px; text-transform: uppercase; }
table.report tbody td { padding: 6px; border-bottom: 1px solid #eee; vertical-align: middle; word-wrap: break-word; }
table.report tbody tr.alt td { background: #fafafa; }
table.report .col-right { text-align: right; }
table.report .col-center { text-align: center; }
table.report tfoot td { padding: 8px 6px; font-weight: 800; border-top: 2px solid {accent}; background: #fff8e6; font-size: 11px; }
table.report .tot-l { color: #555; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; }
table.report .photo-cell { padding: 3px; text-align: center; }
table.report .photo-cell img { display: block; margin: 0 auto; }
table.report .photo-cell .no { color: #bbb; font-size: 9px; }

/* Section headers (used by Account report) */
.sect { margin: 14px 0 6px; padding: 6px 10px; background: #111; color: {accent}; font-size: 11px; letter-spacing: 2px; font-weight: 800; text-transform: uppercase; }
.subsect { margin: 8px 0 4px; padding: 4px 8px; background: #fff8e6; color: #111; font-size: 10px; letter-spacing: 1.5px; font-weight: 800; text-transform: uppercase; border-left: 3px solid {accent}; }
.acct-summary { width: 100%; border-collapse: separate; border-spacing: 6px 0; margin-bottom: 6px; }
.acct-summary td { border: 1px solid #ddd; padding: 6px 10px; background: #fff; }
.acct-summary .lbl { font-size: 8px; color: #666; letter-spacing: 1.2px; font-weight: 700; text-transform: uppercase; }
.acct-summary .val { font-size: 14px; font-weight: 800; }

/* Per-item flyer (sales · 1 page per item) */
.item-page { padding: 0; page-break-inside: avoid; }
.item-head { width: 100%; border-collapse: collapse; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid {accent}; }
.item-head td { vertical-align: top; padding: 0; }
.ribbon { display: inline-block; background: {accent}; color: #000; padding: 3px 10px; font-size: 9px; letter-spacing: 1.5px; font-weight: 900; }
.big-name { font-size: 22px; font-weight: 900; color: #111; margin: 4px 0 0; line-height: 1.15; }
.big-price { font-size: 28px; font-weight: 900; color: {accent}; margin: 0; white-space: nowrap; }
.item-photo-wrap { width: 100%; text-align: center; margin: 0 0 12px; }
.item-photo { width: 5in; height: 3.4in; background: #f4f4f4; border: 1px solid #ddd; text-align: center; margin: 0 auto; }
.item-photo img { display: inline-block; }
.item-photo .no { color: #999; font-size: 12px; padding-top: 1.5in; display: block; }
.specs { width: 100%; border-collapse: collapse; margin-top: 4px; }
.specs td { width: 50%; padding: 5px 10px 5px 0; vertical-align: top; border-bottom: 1px solid #eee; }
.spec-lbl { font-size: 8.5px; letter-spacing: 1.2px; color: #666; font-weight: 800; text-transform: uppercase; }
.spec-val { font-size: 12px; color: #111; font-weight: 700; line-height: 1.25; margin-top: 2px; }

.footer { text-align: center; color: #999; font-size: 10px; margin-top: 18px; letter-spacing: 1px; }
.muted { color: #999; font-style: italic; font-size: 11px; }
"""


def _row_html(cols: List[Column], row: Dict[str, Any], alt: bool) -> str:
    cells = []
    for c in cols:
        cls = "col-right" if c.align == "right" else ("col-center" if c.align == "center" else "")
        if c.type == "image":
            src = row.get(c.id) or ""
            if isinstance(src, list):
                src = src[0] if src else ""
            inner = (
                f'<img src="{esc(src)}" width="80" />'
                if src
                else '<span class="no">—</span>'
            )
            cells.append(f'<td class="photo-cell">{inner}</td>')
        else:
            v = cell_value(c, row)
            cells.append(f'<td class="{cls}">{esc(v)}</td>')
    cls = " class=\"alt\"" if alt else ""
    return f"<tr{cls}>{''.join(cells)}</tr>"


def _column_widths(cols: List[Column]) -> List[str]:
    """Pre-compute column widths in POINTS that sum to the printable
    page width (~540pt = 7.5in × 72pt/in). xhtml2pdf interprets bare
    numbers in the `width` attribute as points, which it honours strictly."""
    PAGE_PT = 540.0
    fixed: Dict[int, float] = {}
    for i, c in enumerate(cols):
        if c.type == "image":
            fixed[i] = 70.0
        elif c.type == "money":
            fixed[i] = 60.0
        elif c.type == "number":
            fixed[i] = 50.0
        elif c.type == "date":
            fixed[i] = 60.0
    used = sum(fixed.values())
    text_idx = [i for i in range(len(cols)) if i not in fixed]
    remaining = max(0.0, PAGE_PT - used)
    per_text = (remaining / len(text_idx)) if text_idx else 0.0
    out = []
    for i in range(len(cols)):
        w = fixed.get(i, per_text)
        out.append(f"{int(w)}")
    return out


def _table_html(cols: List[Column], rows: List[Dict[str, Any]]) -> str:
    if not rows:
        return '<p class="muted">No items match the selected filters.</p>'

    widths = _column_widths(cols)
    # xhtml2pdf needs BOTH a <colgroup> with widths AND inline width on
    # <th>. Bare integer values are interpreted as POINTS by xhtml2pdf.
    colgroup = "<colgroup>" + "".join(
        f'<col width="{w}"/>' for w in widths
    ) + "</colgroup>"

    head_cells = []
    for c, w in zip(cols, widths):
        cls = "col-right" if c.align == "right" else ""
        head_cells.append(
            f'<th class="{cls}" width="{w}">{esc(c.label)}</th>'
        )
    head = "".join(head_cells)
    body = "".join(_row_html(cols, r, i % 2 == 1) for i, r in enumerate(rows))

    # Totals (sum money/number columns)
    totals = []
    has_total = False
    for c in cols:
        if c.type in ("money", "number"):
            total = sum(numeric_value(r, c.id) for r in rows)
            has_total = True
            totals.append(
                f'<td class="col-right">{fmt_money(total) if c.type == "money" else f"{total:,.0f}"}</td>'
            )
        else:
            totals.append("<td></td>")
    if has_total:
        # First non-total cell shows the "TOTAL" label
        for i, c in enumerate(cols):
            if c.type not in ("money", "number"):
                totals[i] = (
                    f'<td><span class="tot-l">Total — {len(rows)} item{"s" if len(rows) != 1 else ""}</span></td>'
                )
                break
        foot = f"<tfoot><tr>{''.join(totals)}</tr></tfoot>"
    else:
        foot = ""

    return f'<table class="report" width="540">{colgroup}<thead><tr>{head}</tr></thead><tbody>{body}</tbody>{foot}</table>'


def _build_pdf_html(
    spec: ReportSpec,
    cols: List[Column],
    rows: List[Dict[str, Any]],
    cover_html: str = "",
    body_override: Optional[str] = None,
) -> str:
    today = datetime.now(timezone.utc).strftime("%m/%d/%Y")
    css = _BASE_CSS.replace("{accent}", spec.accent)
    body = body_override if body_override is not None else _table_html(cols, rows)
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><style>{css}</style></head>
<body>
<div class="head">
  <h1>{esc(spec.title)}</h1>
  <div class="date">Prepared {today}</div>
</div>
{cover_html}
{body}
<div class="footer">Generated by Toolbox &middot; {today}</div>
</body></html>"""


def render_pdf(
    spec: ReportSpec,
    cols: List[Column],
    rows: List[Dict[str, Any]],
    cover_html: str = "",
    body_override: Optional[str] = None,
) -> bytes:
    html = _build_pdf_html(spec, cols, rows, cover_html=cover_html, body_override=body_override)
    safe = _sanitize_html(html)
    pisa = _get_pisa()
    buf = io.BytesIO()
    result = pisa.CreatePDF(safe, dest=buf, encoding="utf-8")
    if result.err:
        raise HTTPException(500, f"PDF generation failed (errors={result.err})")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# CSV rendering
# ---------------------------------------------------------------------------

def render_csv(
    cols: List[Column],
    rows: List[Dict[str, Any]],
) -> bytes:
    buf = io.StringIO()
    w = _csv.writer(buf)
    w.writerow([c.label for c in cols])
    for r in rows:
        out: List[str] = []
        for c in cols:
            if c.type == "image":
                out.append("")
            elif c.type == "money":
                out.append(f"{numeric_value(r, c.id):.2f}")
            elif c.type == "date":
                out.append(fmt_date_us(r.get(c.id)))
            else:
                out.append(str(r.get(c.id) or ""))
        w.writerow(out)
    # Footer total
    has_total = any(c.type in ("money", "number") for c in cols)
    if has_total:
        foot = []
        for i, c in enumerate(cols):
            if c.type in ("money", "number"):
                total = sum(numeric_value(r, c.id) for r in rows)
                foot.append(f"{total:.2f}" if c.type == "money" else f"{total:.0f}")
            elif i == 0:
                foot.append(f"TOTAL ({len(rows)} items)")
            else:
                foot.append("")
        w.writerow(foot)
    return buf.getvalue().encode("utf-8-sig")  # BOM for Excel


# ---------------------------------------------------------------------------
# Per-report fetchers + cover/body customisation
# ---------------------------------------------------------------------------

# These functions are wired below in the REPORTS registry. Each receives:
#   db        — the per-user wrapped Mongo db
#   user      — the authed user object
#   options   — the user's wizard choices (dict)
# and returns:
#   { "rows": [...row dicts...], "cover_html": "...", "body_override": "..." or None }


# ---- INSURANCE -----------------------------------------------------------------

async def _fetch_insurance(db, user, options: Dict[str, Any]) -> Dict[str, Any]:
    tools = await db.tools.find({}, {"_id": 0}).to_list(10000)
    rows = [_normalise_tool_row(t) for t in tools]
    profile = await db.personal_profile.find_one({"id": "self"}, {"_id": 0}) or {}

    addr_lines: List[str] = []
    if profile.get("address"):
        line = profile["address"]
        if profile.get("address2"):
            line += f", {profile['address2']}"
        addr_lines.append(line)
    csz = ", ".join(filter(None, [profile.get("city"), profile.get("state"), profile.get("zip_code")]))
    if csz:
        addr_lines.append(csz)
    if profile.get("country"):
        addr_lines.append(profile["country"])

    contact_lines: List[str] = []
    if profile.get("phone"):
        contact_lines.append(f"☏ {profile['phone']}")
    if profile.get("email"):
        contact_lines.append(f"✉ {profile['email']}")
    if profile.get("insurance_company"):
        contact_lines.append(f"Ins: {profile['insurance_company']}")
    if profile.get("policy_number"):
        contact_lines.append(f"Policy #{profile['policy_number']}")

    cover = ""
    if options.get("include_personal", True) and profile.get("name"):
        cover = f"""
        <div class="pi">
          <table class="pi-row"><tr>
            <td>
              <div class="pi-name">{esc(profile.get('name', ''))}</div>
              {''.join(f'<div class="pi-line">{esc(l)}</div>' for l in addr_lines)}
            </td>
            <td class="pi-right">
              {''.join(f'<div class="pi-line">{esc(l)}</div>' for l in contact_lines)}
            </td>
          </tr></table>
        </div>
        """

    total_value = sum(numeric_value(r, "cost") for r in rows)
    cover += f"""
    <table class="stats"><tr>
      <td><div class="stat-l">Total Items</div><div class="stat-v">{len(rows)}</div></td>
      <td class="tot"><div class="stat-l">Total Value</div><div class="stat-v">{fmt_money(total_value)}</div></td>
    </tr></table>
    """
    return {"rows": rows, "cover_html": cover, "body_override": None}


# ---- INVENTORY -----------------------------------------------------------------

async def _fetch_inventory(db, user, options: Dict[str, Any]) -> Dict[str, Any]:
    q: Dict[str, Any] = {"is_sold": {"$ne": True}}
    location_id = options.get("location_id") or ""
    if location_id:
        # Include sub-locations
        all_ids = [location_id]
        children = await db.locations.find({"parent_id": location_id}, {"_id": 0, "id": 1}).to_list(5000)
        all_ids += [c["id"] for c in children]
        q["location_id"] = {"$in": all_ids}

    tag_ids = options.get("tag_ids") or []
    if tag_ids:
        q["tag_ids"] = {"$in": tag_ids}
    brand = (options.get("brand") or "").strip()
    if brand:
        q["brand"] = {"$regex": f"^{re.escape(brand)}$", "$options": "i"}
    condition = (options.get("condition") or "").strip()
    if condition:
        q["condition"] = condition

    tools = await db.tools.find(q, {"_id": 0}).to_list(10000)
    start = options.get("date_from") or ""
    end = options.get("date_to") or ""
    if start or end:
        tools = [t for t in tools if in_range(t.get("purchase_date"), start, end)]

    rows = [_normalise_tool_row(t) for t in tools]
    total = sum(numeric_value(r, "cost") for r in rows)
    cover = f"""
    <table class="stats"><tr>
      <td><div class="stat-l">Total Items</div><div class="stat-v">{len(rows)}</div></td>
      <td class="tot"><div class="stat-l">Total Cost</div><div class="stat-v">{fmt_money(total)}</div></td>
    </tr></table>
    """
    return {"rows": rows, "cover_html": cover, "body_override": None}


# ---- SALES -----------------------------------------------------------------

async def _fetch_sales(db, user, options: Dict[str, Any]) -> Dict[str, Any]:
    mode = options.get("sales_mode") or "listed"  # "listed" | "sold"
    if mode == "sold":
        q = {"is_sold": True}
        date_field = "sold_at"
    else:
        q = {"for_sale": True, "is_sold": {"$ne": True}}
        date_field = "sale_listed_at"

    tools = await db.tools.find(q, {"_id": 0}).to_list(10000)
    start = options.get("date_from") or ""
    end = options.get("date_to") or ""
    if start or end:
        tools = [t for t in tools if in_range(t.get(date_field), start, end)]

    rows = []
    for t in tools:
        row = _normalise_tool_row(t)
        # Sales-specific aliases
        row["price"] = (t.get("sold_price") or 0) if mode == "sold" else (t.get("sale_price") or 0)
        row["sale_date"] = t.get(date_field)
        row["sold_to"] = t.get("sold_to") or ""
        rows.append(row)

    total = sum(numeric_value(r, "price") for r in rows)
    title_word = "Sold Total" if mode == "sold" else "Asking Total"
    cover = f"""
    <table class="stats"><tr>
      <td><div class="stat-l">{'Sold' if mode == 'sold' else 'Listed'} Items</div><div class="stat-v">{len(rows)}</div></td>
      <td class="tot"><div class="stat-l">{title_word}</div><div class="stat-v">{fmt_money(total)}</div></td>
    </tr></table>
    """

    body_override = None
    layout = options.get("sales_layout") or "table"  # "table" | "per_item"
    if layout == "per_item":
        body_override = _sales_per_item_html(rows, mode)

    return {"rows": rows, "cover_html": cover, "body_override": body_override}


def _sales_per_item_html(rows: List[Dict[str, Any]], mode: str) -> str:
    if not rows:
        return '<p class="muted">No items.</p>'
    accent_label = "SOLD" if mode == "sold" else "FOR SALE"
    parts: List[str] = []
    for i, r in enumerate(rows):
        pb = "" if i == 0 else "<pdf:nextpage/>"
        photo = r.get("photo") or ""
        photo_html = (
            f'<img src="{esc(photo)}" height="326" />'
            if photo
            else '<div class="no">No photo</div>'
        )
        spec_pairs = [
            ("Brand", r.get("brand")),
            ("Model", r.get("model")),
            ("Serial #", r.get("serial")),
            ("Condition", r.get("condition")),
            ("Original Cost", fmt_money(r.get("cost")) if r.get("cost") else ""),
            ("Purchased", fmt_date_us(r.get("purchase_date"))),
            ("Dealer", r.get("dealer")),
            ("Location", r.get("location")),
        ]
        if mode == "sold":
            spec_pairs.append(("Sold To", r.get("sold_to")))
            spec_pairs.append(("Sold On", fmt_date_us(r.get("sale_date"))))
        else:
            spec_pairs.append(("Listed", fmt_date_us(r.get("sale_date"))))
        spec_pairs = [(l, v) for l, v in spec_pairs if v]

        spec_rows: List[str] = []
        for j in range(0, len(spec_pairs), 2):
            l1, v1 = spec_pairs[j]
            right = (
                f'<td><div class="spec-lbl">{esc(spec_pairs[j+1][0])}</div>'
                f'<div class="spec-val">{esc(spec_pairs[j+1][1])}</div></td>'
                if j + 1 < len(spec_pairs)
                else "<td></td>"
            )
            spec_rows.append(
                f'<tr><td><div class="spec-lbl">{esc(l1)}</div>'
                f'<div class="spec-val">{esc(v1)}</div></td>{right}</tr>'
            )
        notes = r.get("notes") or ""
        parts.append(f"""
        {pb}
        <div class="item-page">
          <table class="item-head"><tr>
            <td style="width:65%">
              <span class="ribbon">{accent_label}</span>
              <div class="big-name">{esc(r.get('name', ''))}</div>
            </td>
            <td style="text-align:right;white-space:nowrap;vertical-align:bottom">
              <div class="big-price">{fmt_money(r.get('price'))}</div>
            </td>
          </tr></table>
          <div class="item-photo-wrap"><div class="item-photo">{photo_html}</div></div>
          {f'<div class="muted">{esc(notes)}</div>' if notes else ''}
          <table class="specs">{''.join(spec_rows)}</table>
        </div>
        """)
    return "".join(parts)


# ---- ACCOUNT (DEALER) ---------------------------------------------------------

async def _fetch_account(db, user, options: Dict[str, Any]) -> Dict[str, Any]:
    dealer_ids = options.get("dealer_ids") or []
    start = options.get("date_from") or ""
    end = options.get("date_to") or ""

    if dealer_ids:
        q = {"id": {"$in": dealer_ids}}
    else:
        q = {}
    dealers = await db.dealers.find(q, {"_id": 0}).sort("name", 1).to_list(1000)

    sections: List[str] = []
    grand_credit_open = 0.0
    grand_truck_open = 0.0
    grand_payments = 0.0
    grand_charges = 0.0

    for d in dealers:
        all_tx = list(d.get("transactions") or [])
        tx_in_range = [t for t in all_tx if in_range(t.get("date"), start, end)]
        tx_in_range.sort(key=lambda t: t.get("date") or "")

        credit_tx = [t for t in tx_in_range if t.get("account") == "credit"]
        truck_tx = [t for t in tx_in_range if t.get("account") == "personal"]

        credit_balance = float(d.get("credit_balance") or 0)
        truck_balance = float(d.get("personal_balance") or 0)
        grand_credit_open += credit_balance
        grand_truck_open += truck_balance

        def _acct_html(label: str, balance: float, tx_list: List[Dict[str, Any]]) -> str:
            payments = sum(float(t.get("amount") or 0) for t in tx_list if t.get("type") == "payment")
            charges = sum(float(t.get("amount") or 0) for t in tx_list if t.get("type") == "charge")

            if not tx_list:
                tx_html = '<p class="muted" style="margin:6px 0">No transactions in this range.</p>'
            else:
                rows_html = []
                for i, t in enumerate(tx_list):
                    is_pay = t.get("type") == "payment"
                    sign = "-" if is_pay else "+"
                    color = "color:#16a34a;" if is_pay else "color:#dc2626;"
                    cls = ' class="alt"' if i % 2 == 1 else ""
                    rows_html.append(
                        f'<tr{cls}>'
                        f'<td>{esc(fmt_date_us(t.get("date")))}</td>'
                        f'<td>{"Payment" if is_pay else "Charge"}</td>'
                        f'<td>{esc(t.get("note") or "")}</td>'
                        f'<td class="col-right" style="{color}font-weight:800">{sign}{fmt_money(t.get("amount"))}</td>'
                        f"</tr>"
                    )
                tx_html = (
                    '<table class="report" style="margin-top:4px">'
                    '<colgroup><col style="width:14%"/><col style="width:14%"/>'
                    '<col style="width:54%"/><col style="width:18%"/></colgroup>'
                    '<thead><tr><th>Date</th><th>Type</th><th>Note</th>'
                    '<th class="col-right">Amount</th></tr></thead>'
                    f'<tbody>{"".join(rows_html)}</tbody>'
                    f'<tfoot><tr><td colspan="3"><span class="tot-l">In-range Totals</span></td>'
                    f'<td class="col-right">Pay {fmt_money(payments)} · Chg {fmt_money(charges)}</td></tr></tfoot>'
                    '</table>'
                )

            return f"""
            <div class="subsect">{esc(label)}</div>
            <table class="acct-summary"><tr>
              <td><div class="lbl">Open Balance</div><div class="val">{fmt_money(balance)}</div></td>
              <td><div class="lbl">Payments (in range)</div><div class="val" style="color:#16a34a">{fmt_money(payments)}</div></td>
              <td><div class="lbl">New Charges (in range)</div><div class="val" style="color:#dc2626">{fmt_money(charges)}</div></td>
            </tr></table>
            {tx_html}
            """

        # totals
        c_payments = sum(float(t.get("amount") or 0) for t in credit_tx if t.get("type") == "payment")
        c_charges = sum(float(t.get("amount") or 0) for t in credit_tx if t.get("type") == "charge")
        t_payments = sum(float(t.get("amount") or 0) for t in truck_tx if t.get("type") == "payment")
        t_charges = sum(float(t.get("amount") or 0) for t in truck_tx if t.get("type") == "charge")
        grand_payments += c_payments + t_payments
        grand_charges += c_charges + t_charges

        sections.append(f"""
        <div class="sect">{esc(d.get('name', ''))}</div>
        {_acct_html("Credit Account", credit_balance, credit_tx)}
        {_acct_html("Truck Account", truck_balance, truck_tx)}
        """)

    cover = f"""
    <table class="stats"><tr>
      <td><div class="stat-l">Dealers</div><div class="stat-v">{len(dealers)}</div></td>
      <td class="tot"><div class="stat-l">Total Open Balance</div><div class="stat-v">{fmt_money(grand_credit_open + grand_truck_open)}</div></td>
    </tr></table>
    <table class="stats"><tr>
      <td><div class="stat-l">Payments (in range)</div><div class="stat-v" style="color:#16a34a">{fmt_money(grand_payments)}</div></td>
      <td><div class="stat-l">New Charges (in range)</div><div class="stat-v" style="color:#dc2626">{fmt_money(grand_charges)}</div></td>
    </tr></table>
    """

    body = "".join(sections) if sections else '<p class="muted">No dealers selected.</p>'
    return {"rows": [], "cover_html": cover, "body_override": body}


# ---------------------------------------------------------------------------
# Helpers shared by tool-based reports
# ---------------------------------------------------------------------------

def _normalise_tool_row(t: Dict[str, Any]) -> Dict[str, Any]:
    photos = t.get("photos") or []
    photo = photos[0] if photos else ""
    return {
        "id": t.get("id"),
        "name": t.get("name") or "",
        "brand": t.get("brand") or "",
        "model": t.get("model") or "",
        "serial": t.get("serial_number") or "",
        "category": t.get("category_name") or "",
        "location": t.get("location_name") or "",
        "dealer": t.get("dealer_name") or "",
        "condition": t.get("condition") or "",
        "purchase_date": t.get("purchase_date"),
        "warranty_until": t.get("warranty_expiry"),
        "tags": ", ".join(t.get("tag_names") or []),
        "notes": t.get("description") or "",
        "cost": float(t.get("cost") or 0),
        "photo": photo,
    }


# ---------------------------------------------------------------------------
# Report registry — adding a new report = adding ONE entry below + a fetcher
# ---------------------------------------------------------------------------

_TOOL_COLUMNS = [
    Column("photo", "Photo", "center", "image", width="0.85in"),
    Column("name", "Name", "left", "text"),
    Column("brand", "Brand", "left", "text"),
    Column("model", "Model", "left", "text"),
    Column("serial", "Serial #", "left", "text"),
    Column("category", "Category", "left", "text"),
    Column("location", "Location", "left", "text"),
    Column("dealer", "Dealer", "left", "text"),
    Column("condition", "Condition", "left", "text"),
    Column("purchase_date", "Purchased", "left", "date"),
    Column("warranty_until", "Warranty Until", "left", "date"),
    Column("tags", "Tags", "left", "text"),
    Column("cost", "Cost", "right", "money"),
]

_SALES_COLUMNS = [
    Column("photo", "Photo", "center", "image", width="0.85in"),
    Column("name", "Name", "left", "text"),
    Column("brand", "Brand", "left", "text"),
    Column("model", "Model", "left", "text"),
    Column("serial", "Serial #", "left", "text"),
    Column("dealer", "Dealer", "left", "text"),
    Column("location", "Location", "left", "text"),
    Column("condition", "Condition", "left", "text"),
    Column("sale_date", "Date", "left", "date"),
    Column("sold_to", "Sold To", "left", "text"),
    Column("price", "Price", "right", "money"),
]


REPORTS: Dict[str, ReportSpec] = {
    "insurance": ReportSpec(
        id="insurance",
        title="Insurance Inventory Report",
        description="A formatted inventory of every tool, with values and personal info — for insurance carriers.",
        icon="shield-checkmark",
        accent="#FFB300",
        columns=_TOOL_COLUMNS,
        default_columns=["photo", "name", "brand", "model", "serial", "cost"],
        fetch=_fetch_insurance,
        options_schema=[
            {"id": "include_personal", "type": "toggle", "label": "Include personal / address info", "default": True},
        ],
    ),
    "inventory": ReportSpec(
        id="inventory",
        title="Inventory Report",
        description="Full or filtered list of your tools, by location, tag, brand, condition, or date range.",
        icon="cube",
        accent="#FFB300",
        columns=_TOOL_COLUMNS,
        default_columns=["photo", "name", "brand", "model", "location", "cost"],
        fetch=_fetch_inventory,
        options_schema=[
            {"id": "location_id", "type": "location", "label": "Location"},
            {"id": "date_from", "type": "date", "label": "Purchased From"},
            {"id": "date_to", "type": "date", "label": "Purchased To"},
            {"id": "brand", "type": "text", "label": "Brand"},
            {"id": "condition", "type": "select", "label": "Condition",
             "choices": ["", "New", "Like New", "Good", "Fair", "Poor"]},
        ],
    ),
    "sales": ReportSpec(
        id="sales",
        title="Sales Report",
        description="Items currently for sale, or items already sold, with prices and dates.",
        icon="pricetag",
        accent="#FFB300",
        columns=_SALES_COLUMNS,
        default_columns=["photo", "name", "brand", "dealer", "sale_date", "price"],
        fetch=_fetch_sales,
        options_schema=[
            {"id": "sales_mode", "type": "segmented", "label": "Mode",
             "choices": [{"id": "listed", "label": "For Sale"}, {"id": "sold", "label": "Sold"}],
             "default": "listed"},
            {"id": "sales_layout", "type": "segmented", "label": "Layout",
             "choices": [{"id": "table", "label": "Table"}, {"id": "per_item", "label": "1 Page Per Item"}],
             "default": "table"},
            {"id": "date_from", "type": "date", "label": "From"},
            {"id": "date_to", "type": "date", "label": "To"},
        ],
    ),
    "account": ReportSpec(
        id="account",
        title="Dealer Account Report",
        description="Per-dealer balances, payments and new charges across both Credit and Truck accounts.",
        icon="wallet",
        accent="#FFB300",
        columns=[
            Column("date", "Date", "left", "date"),
            Column("type", "Type", "left", "text"),
            Column("note", "Note", "left", "text"),
            Column("amount", "Amount", "right", "money"),
        ],
        default_columns=["date", "type", "note", "amount"],
        fetch=_fetch_account,
        options_schema=[
            {"id": "dealer_ids", "type": "dealer_multi", "label": "Dealers"},
            {"id": "date_from", "type": "date", "label": "From"},
            {"id": "date_to", "type": "date", "label": "To"},
        ],
    ),
}


# ---------------------------------------------------------------------------
# FastAPI router
# ---------------------------------------------------------------------------

def make_reports_router(api_router: APIRouter, get_db, get_current_user) -> None:
    """Register report routes onto the supplied api_router.

    `get_db` is a zero-arg callable that returns the per-request, user-scoped
    Mongo db. `get_current_user` is the existing dependency from server.py.
    """

    @api_router.get("/reports/spec")
    async def reports_spec(user=Depends(get_current_user)):
        return {"reports": [spec.to_dict() for spec in REPORTS.values()]}

    @api_router.post("/reports/render")
    async def reports_render(payload: Dict[str, Any] = Body(...), user=Depends(get_current_user)):
        rt = payload.get("report_type") or ""
        spec = REPORTS.get(rt)
        if not spec:
            raise HTTPException(400, f"Unknown report type: {rt!r}")

        fmt = (payload.get("format") or "pdf").lower()
        if fmt not in ("pdf", "csv"):
            raise HTTPException(400, "format must be 'pdf' or 'csv'")

        chosen_ids = payload.get("columns") or spec.default_columns
        # Map to columns, drop unknowns, enforce 6-column max for PDF
        col_map = {c.id: c for c in spec.columns}
        cols = [col_map[i] for i in chosen_ids if i in col_map]
        if not cols:
            cols = [col_map[i] for i in spec.default_columns if i in col_map]
        if fmt == "pdf" and len(cols) > 6:
            cols = cols[:6]

        options = payload.get("options") or {}
        db = get_db()
        result = await spec.fetch(db, user, options)

        filename_base = f"{spec.id}-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        if fmt == "csv":
            data = render_csv(cols, result["rows"])
            return Response(
                content=data,
                media_type="text/csv",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename_base}.csv"',
                    "Cache-Control": "no-store",
                },
            )

        pdf_bytes = render_pdf(
            spec,
            cols,
            result["rows"],
            cover_html=result.get("cover_html") or "",
            body_override=result.get("body_override"),
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename_base}.pdf"',
                "Cache-Control": "no-store",
            },
        )
