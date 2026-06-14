"""
Unified report engine — ReportLab-backed.

Architecture
------------
A single registry of report definitions ("specs"). Each spec declares:
  - Available columns (id, label, alignment, type, accessor)
  - Default-checked column ids
  - A `fetch_data` async function returning structured data:
      { rows, stats, stats2, personal_info, body_factory }

The renderer is pure ReportLab Platypus — that gives precise column
widths, image aspect-ratio preservation and small output files
(unlike xhtml2pdf which we previously fought with).

Endpoints
---------
GET  /api/reports/spec     → catalog for the frontend wizard
POST /api/reports/render   → returns the PDF or CSV file

Key implementation notes
------------------------
* Photos are passed in as base64 / data URIs. Before embedding we
  decode + downsample with Pillow → reasonable byte-size & no
  stretching.
* Table column widths are computed in points and passed as `colWidths`
  directly to ReportLab — no CSS battles.
* Numeric / money columns get summed into a footer row automatically
  when present in the chosen column set.
* Max 6 columns enforced for the data-table reports.
"""

from __future__ import annotations

import base64
import csv as _csv
import io
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import Response

from PIL import Image as PILImage  # noqa: E402

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
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


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Column:
    id: str
    label: str
    align: str = "left"           # "left" | "right" | "center"
    type: str = "text"            # "text" | "money" | "number" | "date" | "image"
    width: Optional[str] = None   # unused now (ReportLab computes)

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
    icon: str
    accent: str
    columns: List[Column]
    default_columns: List[str]
    fetch: Callable[[Any, Any, Dict[str, Any]], Awaitable[Dict[str, Any]]]
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
# Formatting helpers
# ---------------------------------------------------------------------------

def esc(s: Any) -> str:
    """Escape for ReportLab Paragraph (uses a tiny subset of HTML)."""
    if s is None:
        return ""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def fmt_money(v: Any) -> str:
    try:
        return f"${float(v or 0):,.2f}"
    except Exception:
        return "$0.00"


def fmt_date_us(s: Any) -> str:
    if not s:
        return ""
    txt = str(s)
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
# Image utilities — base64 → ReportLab Image (downsampled, aspect kept)
# ---------------------------------------------------------------------------

def _decode_b64(src: Any) -> Optional[bytes]:
    """Accept a base64 data URI (or list of them); return raw bytes."""
    if isinstance(src, list):
        src = src[0] if src else ""
    if not src or not isinstance(src, str):
        return None
    try:
        if src.startswith("data:"):
            _, b64 = src.split(",", 1)
        else:
            b64 = src
        return base64.b64decode(b64)
    except Exception:
        return None


def _make_thumb(src: Any, max_px: int = 360, quality: int = 78) -> Optional[io.BytesIO]:
    raw = _decode_b64(src)
    if not raw:
        return None
    try:
        img = PILImage.open(io.BytesIO(raw))
        img.thumbnail((max_px, max_px))
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=quality, optimize=True)
        out.seek(0)
        # also stash dimensions for caller
        out._w, out._h = img.size  # type: ignore[attr-defined]
        return out
    except Exception:
        return None


def _fit_image(src: Any, max_w: float, max_h: float, max_px: int = 360) -> Optional[RLImage]:
    """Build a ReportLab Image flowable that fits within (max_w, max_h) points
    while preserving aspect ratio. Returns None if the image is invalid."""
    buf = _make_thumb(src, max_px=max_px)
    if buf is None:
        return None
    w, h = getattr(buf, "_w", 100), getattr(buf, "_h", 100)
    ratio = min(max_w / w, max_h / h)
    rw = w * ratio
    rh = h * ratio
    img = RLImage(buf, width=rw, height=rh)
    img.hAlign = "CENTER"
    return img


# ---------------------------------------------------------------------------
# Unified professional palette
# ---------------------------------------------------------------------------
# Applied to EVERY report regardless of the per-report accent, so all
# documents read like they come from the same system ("Fortune 500" look):
# a muted steel-blue accent over slate-gray structure on white. The
# per-spec `accent` colour is intentionally ignored for styling.

ACCENT_HEX = "#2F5D8A"      # steel blue — rules, totals, highlights, prices
HEADER_HEX = "#334155"      # slate-700 — table & section header bars
HEADER_TEXT_HEX = "#FFFFFF"  # text on slate bars
INK_HEX = "#1E293B"         # slate-800 — primary body ink / titles
MUTED_HEX = "#64748B"       # slate-500 — sub-labels, captions, footer
HAIRLINE_HEX = "#E2E8F0"    # slate-200 — grid lines, borders
ZEBRA_HEX = "#F1F5F9"       # slate-100 — alternating rows / index column
TINT_HEX = "#EAF1F8"        # light steel — totals row, highlight stat, letterhead
CARD_HEX = "#F8FAFC"        # slate-50 — plain stat-card fill


# ---------------------------------------------------------------------------
# Paragraph styles — re-used everywhere
# ---------------------------------------------------------------------------

def _styles(accent_hex: str) -> Dict[str, ParagraphStyle]:
    # Unified palette — the passed accent is ignored on purpose so every
    # report shares one cohesive identity.
    accent = colors.HexColor(ACCENT_HEX)
    base = "Helvetica"
    bold = "Helvetica-Bold"
    return {
        "title": ParagraphStyle(
            "title", fontName=bold, fontSize=22, leading=26,
            alignment=TA_CENTER, textColor=colors.HexColor(INK_HEX),
            spaceAfter=2,
        ),
        "title_sub": ParagraphStyle(
            "title_sub", fontName=base, fontSize=10, leading=12,
            alignment=TA_CENTER, textColor=colors.HexColor(MUTED_HEX),
        ),
        "section": ParagraphStyle(
            "section", fontName=bold, fontSize=11, leading=14,
            textColor=colors.HexColor(HEADER_TEXT_HEX),
            backColor=colors.HexColor(HEADER_HEX),
            leftIndent=8, rightIndent=8, spaceBefore=10, spaceAfter=4,
            borderPadding=(6, 8, 6, 8),
        ),
        "subsection": ParagraphStyle(
            "subsection", fontName=bold, fontSize=10, leading=13,
            textColor=colors.HexColor(INK_HEX),
            backColor=colors.HexColor(TINT_HEX),
            leftIndent=6, borderPadding=(4, 6, 4, 6),
            spaceBefore=6, spaceAfter=2,
        ),
        "muted": ParagraphStyle(
            "muted", fontName=base, fontSize=9, leading=12,
            textColor=colors.HexColor(MUTED_HEX),
        ),
        "small": ParagraphStyle(
            "small", fontName=base, fontSize=9, leading=11,
            textColor=colors.HexColor(INK_HEX),
        ),
        "small_right": ParagraphStyle(
            "small_right", fontName=base, fontSize=9, leading=11,
            alignment=TA_RIGHT, textColor=colors.HexColor(INK_HEX),
        ),
        "small_bold_right": ParagraphStyle(
            "small_bold_right", fontName=bold, fontSize=9, leading=11,
            alignment=TA_RIGHT, textColor=colors.HexColor(INK_HEX),
        ),
        "th": ParagraphStyle(
            "th", fontName=bold, fontSize=8, leading=10,
            textColor=colors.HexColor(HEADER_TEXT_HEX),
        ),
        "th_right": ParagraphStyle(
            "th_right", fontName=bold, fontSize=8, leading=10,
            alignment=TA_RIGHT, textColor=colors.HexColor(HEADER_TEXT_HEX),
        ),
        "stat_l": ParagraphStyle(
            "stat_l", fontName=bold, fontSize=8, leading=10,
            textColor=colors.HexColor(MUTED_HEX),
        ),
        "stat_l_dark": ParagraphStyle(
            "stat_l_dark", fontName=bold, fontSize=8, leading=10,
            textColor=accent,
        ),
        "stat_v": ParagraphStyle(
            "stat_v", fontName=bold, fontSize=18, leading=20,
            textColor=colors.HexColor(INK_HEX),
        ),
        "stat_v_accent": ParagraphStyle(
            "stat_v_accent", fontName=bold, fontSize=18, leading=20,
            textColor=accent,
        ),
        "pi_name": ParagraphStyle(
            "pi_name", fontName=bold, fontSize=12, leading=14,
            textColor=colors.HexColor(INK_HEX),
            spaceAfter=2,
        ),
        "pi_line": ParagraphStyle(
            "pi_line", fontName=base, fontSize=9.5, leading=12,
            textColor=colors.HexColor("#334155"),
        ),
        "pi_line_right": ParagraphStyle(
            "pi_line_right", fontName=base, fontSize=9.5, leading=12,
            alignment=TA_RIGHT, textColor=colors.HexColor(MUTED_HEX),
        ),
        "pi_caption": ParagraphStyle(
            "pi_caption", fontName=bold, fontSize=7.5, leading=10,
            textColor=accent,
        ),
        # Per-item flyer
        "flyer_name": ParagraphStyle(
            "flyer_name", fontName=bold, fontSize=22, leading=24,
            textColor=colors.HexColor(INK_HEX),
        ),
        "flyer_price": ParagraphStyle(
            "flyer_price", fontName=bold, fontSize=28, leading=30,
            alignment=TA_RIGHT, textColor=accent,
        ),
        "ribbon": ParagraphStyle(
            "ribbon", fontName=bold, fontSize=9, leading=12,
            textColor=colors.HexColor(HEADER_TEXT_HEX), backColor=accent,
            borderPadding=(3, 8, 3, 8),
        ),
        "spec_l": ParagraphStyle(
            "spec_l", fontName=bold, fontSize=8, leading=10,
            textColor=colors.HexColor(MUTED_HEX),
        ),
        "spec_v": ParagraphStyle(
            "spec_v", fontName=bold, fontSize=11, leading=13,
            textColor=colors.HexColor(INK_HEX),
        ),
        "footer": ParagraphStyle(
            "footer", fontName=base, fontSize=8, leading=10,
            alignment=TA_CENTER, textColor=colors.HexColor(MUTED_HEX),
        ),
    }


# ---------------------------------------------------------------------------
# Cover flowables (header, stats, personal info)
# ---------------------------------------------------------------------------

PAGE_W = 7.5 * inch  # printable width with our 0.5" side margins


def _para(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def _title_block(spec: ReportSpec, st: Dict[str, ParagraphStyle],
                 subtitle: Optional[str] = None) -> List[Any]:
    today = datetime.now(timezone.utc).strftime("%m/%d/%Y")
    out: List[Any] = [
        _para(esc(spec.title.upper()), st["title"]),
        _para(f"Prepared {today}", st["title_sub"]),
    ]
    if subtitle:
        out.append(_para(esc(subtitle), st["title_sub"]))
    out += [
        Spacer(1, 4),
        _hr(ACCENT_HEX, 2.5),
        Spacer(1, 8),
    ]
    return out


def _hr(hex_color: str, width: float = 1.0) -> Table:
    """Horizontal rule the full printable width."""
    t = Table([[" "]], colWidths=[PAGE_W], rowHeights=[width])
    t.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), width, colors.HexColor(hex_color)),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def _stats_row(stats: List[Tuple[str, str, bool]], accent_hex: str,
               st: Dict[str, ParagraphStyle]) -> Table:
    """A row of stat cards. `stats` = [(label, value, highlight)]."""
    accent = colors.HexColor(ACCENT_HEX)
    cells = []
    for label, value, hi in stats:
        l_style = st["stat_l_dark"] if hi else st["stat_l"]
        v_style = st["stat_v_accent"] if hi else st["stat_v"]
        cells.append([
            _para(esc(label.upper()), l_style),
            _para(esc(value), v_style),
        ])
    n = len(cells)
    col_w = (PAGE_W - 8 * (n - 1)) / n
    # Build table with spacing columns
    row = []
    widths = []
    for i, c in enumerate(cells):
        if i > 0:
            row.append("")
            widths.append(8)
        row.append(c)
        widths.append(col_w)
    inner_data = [row]

    style_cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]
    # Apply card backgrounds — every other column (real card columns)
    real_idx = []
    j = 0
    for i, _ in enumerate(cells):
        real_idx.append(j)
        j += 2  # skip spacer
    for k, (_, _, hi) in zip(real_idx, stats):
        if hi:
            style_cmds += [
                ("BACKGROUND", (k, 0), (k, 0), colors.HexColor(TINT_HEX)),
                ("BOX", (k, 0), (k, 0), 1, accent),
                ("LEFTPADDING", (k, 0), (k, 0), 12),
                ("RIGHTPADDING", (k, 0), (k, 0), 12),
                ("TOPPADDING", (k, 0), (k, 0), 10),
                ("BOTTOMPADDING", (k, 0), (k, 0), 10),
            ]
        else:
            style_cmds += [
                ("BACKGROUND", (k, 0), (k, 0), colors.HexColor(CARD_HEX)),
                ("BOX", (k, 0), (k, 0), 0.5, colors.HexColor(HAIRLINE_HEX)),
                ("LEFTPADDING", (k, 0), (k, 0), 12),
                ("RIGHTPADDING", (k, 0), (k, 0), 12),
                ("TOPPADDING", (k, 0), (k, 0), 10),
                ("BOTTOMPADDING", (k, 0), (k, 0), 10),
            ]

    t = Table(inner_data, colWidths=widths)
    t.setStyle(TableStyle(style_cmds))
    return t


def _personal_info_block(pi: Dict[str, Any], accent_hex: str,
                         st: Dict[str, ParagraphStyle]) -> Table:
    """Compact mailing-label style block for the Insurance report."""
    addr_lines: List[str] = []
    if pi.get("address"):
        line = pi["address"]
        if pi.get("address2"):
            line += f", {pi['address2']}"
        addr_lines.append(line)
    csz = ", ".join(filter(None, [pi.get("city"), pi.get("state"), pi.get("zip_code")]))
    if csz:
        addr_lines.append(csz)
    if pi.get("country"):
        addr_lines.append(pi["country"])

    contact_lines: List[str] = []
    if pi.get("phone"):
        contact_lines.append(f"Phone: {pi['phone']}")
    if pi.get("email"):
        contact_lines.append(f"Email: {pi['email']}")
    if pi.get("insurance_company"):
        contact_lines.append(f"Insurer: {pi['insurance_company']}")
    if pi.get("policy_number"):
        contact_lines.append(f"Policy #{pi['policy_number']}")

    left_flow: List[Any] = [
        _para("PREPARED FOR", st["pi_caption"]),
        _para(esc(pi.get("name", "")), st["pi_name"]),
    ]
    for l in addr_lines:
        left_flow.append(_para(esc(l), st["pi_line"]))
    right_flow: List[Any] = [_para(esc(l), st["pi_line_right"]) for l in contact_lines]

    t = Table(
        [[left_flow, right_flow]],
        colWidths=[PAGE_W * 0.55, PAGE_W * 0.45],
    )
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(CARD_HEX)),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(HAIRLINE_HEX)),
        ("LINEBEFORE", (0, 0), (0, 0), 4, colors.HexColor(ACCENT_HEX)),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t


# ---------------------------------------------------------------------------
# Data table — the main flowable
# ---------------------------------------------------------------------------

def _column_widths_pt(cols: List[Column], with_index: bool = False) -> List[float]:
    """Allocate the printable width across columns by type. When `with_index`
    is true, the first slot is reserved for the auto-prepended row-number."""
    fixed: Dict[int, float] = {}
    offset = 1 if with_index else 0
    if with_index:
        fixed[0] = 0.32 * inch  # narrow # column
    for i, c in enumerate(cols):
        idx = i + offset
        if c.type == "image":
            fixed[idx] = 0.85 * inch
        elif c.type == "money":
            fixed[idx] = 0.85 * inch
        elif c.type == "number":
            fixed[idx] = 0.55 * inch
        elif c.type == "date":
            fixed[idx] = 0.85 * inch
    total = len(cols) + offset
    used = sum(fixed.values())
    text_idx = [i for i in range(total) if i not in fixed]
    remaining = max(0.0, PAGE_W - used)
    per_text = (remaining / len(text_idx)) if text_idx else 0.0
    return [fixed.get(i, per_text) for i in range(total)]


def _truncate_to_fit(text: str, font: str, size: float, max_w: float) -> str:
    """Hard-truncate with ellipsis if a single token can't wrap and would
    overflow. ReportLab's Paragraph wraps on whitespace, so very long
    unbroken strings (URLs, model numbers) need help."""
    if not text:
        return ""
    if stringWidth(text, font, size) <= max_w:
        return text
    # Insert zero-width-spaces between each char of any token > 14 chars
    words = text.split(" ")
    fixed = []
    for w in words:
        if len(w) > 14 and stringWidth(w, font, size) > max_w:
            fixed.append(" ".join(w[i:i + 12] for i in range(0, len(w), 12)))
        else:
            fixed.append(w)
    return " ".join(fixed)


def _data_table(cols: List[Column], rows: List[Dict[str, Any]],
                accent_hex: str, st: Dict[str, ParagraphStyle]) -> Any:
    if not rows:
        return _para("No items match the selected filters.", st["muted"])

    accent = colors.HexColor(ACCENT_HEX)
    # Auto-prepend a "#" line-number column when there's >1 row.
    show_index = len(rows) > 1
    col_w = _column_widths_pt(cols, with_index=show_index)
    idx_off = 1 if show_index else 0

    # Header row
    header: List[Any] = []
    if show_index:
        header.append(_para("#", st["th_right"]))
    for c in cols:
        style = st["th_right"] if c.align == "right" else st["th"]
        header.append(_para(esc(c.label.upper()), style))

    # Index style for body cells (small, muted, right-aligned)
    idx_body_style = ParagraphStyle(
        "idx_body", parent=st["small_right"],
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#888888"),
    )

    # Data rows. Rows with `_section_header=True` are rendered as a single
    # cell spanning all columns — used to group claims by dealer, etc.
    data: List[List[Any]] = [header]
    section_row_indices: List[int] = []
    section_label_style = ParagraphStyle(
        "section_label", parent=st["th"],
        fontName="Helvetica-Bold", fontSize=10,
        textColor=colors.HexColor(HEADER_TEXT_HEX),
        leading=12,
    )
    data_row_counter = 0
    for r in rows:
        if r.get("_section_header"):
            label = str(r.get("_section_label") or "")
            row_idx = len(data)
            section_row_indices.append(row_idx)
            cell = _para(esc(label.upper()), section_label_style)
            cells: List[Any] = [cell] + [""] * (len(header) - 1)
            data.append(cells)
            continue
        data_row_counter += 1
        cells = []
        if show_index:
            cells.append(_para(str(data_row_counter), idx_body_style))
        for i, c in enumerate(cols):
            cell_idx = i + idx_off
            if c.type == "image":
                cell_w = col_w[cell_idx] - 6
                cell_h = 0.55 * inch
                src = r.get(c.id)
                img = _fit_image(src, cell_w, cell_h, max_px=240)
                if img is None:
                    cells.append(_para("—", st["muted"]))
                else:
                    cells.append(img)
            else:
                v = str(cell_value(c, r))
                # Multi-line cells (e.g. set serials) — preserve line breaks
                # by emitting <br/> between escaped lines, no truncation.
                if "\n" in v:
                    lines = [esc(p) for p in v.split("\n")]
                    html = "<br/>".join(lines)
                    cells.append(_para(html, st["small_right"] if c.align == "right" else st["small"]))
                else:
                    v = _truncate_to_fit(v, "Helvetica", 9, col_w[cell_idx] - 6)
                    if c.align == "right":
                        cells.append(_para(esc(v), st["small_right"]))
                    else:
                        cells.append(_para(esc(v), st["small"]))
        data.append(cells)

    # Footer / totals
    has_total = any(c.type in ("money", "number") for c in cols)
    if has_total:
        foot: List[Any] = []
        if show_index:
            foot.append("")
        label_placed = False
        total_label_style = ParagraphStyle(
            "total_label", parent=st["small"],
            fontName="Helvetica-Bold", fontSize=8.5,
            textColor=colors.HexColor("#555"),
        )
        # Section-header rows are a grouping affordance, not items — exclude
        # them from the totals so the footer count matches the "Total Items"
        # stat (otherwise bundle/group headers inflate the count).
        _items = [r for r in rows if not r.get("_section_header")]
        for c in cols:
            if c.type == "money":
                t = sum(numeric_value(r, c.id) for r in _items)
                foot.append(_para(f"<b>{fmt_money(t)}</b>", st["small_bold_right"]))
            elif c.type == "number":
                t = sum(numeric_value(r, c.id) for r in _items)
                foot.append(_para(f"<b>{t:,.0f}</b>", st["small_bold_right"]))
            elif not label_placed:
                label_placed = True
                foot.append(_para(
                    f"TOTAL — {len(_items)} ITEM{'S' if len(_items) != 1 else ''}",
                    total_label_style,
                ))
            else:
                foot.append("")
        data.append(foot)

    table = Table(
        data,
        colWidths=col_w,
        repeatRows=1,
    )

    style_cmds: List[Any] = [
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(HEADER_HEX)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        # Body grid
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor(HAIRLINE_HEX)),
    ]
    if show_index:
        # Faint background to visually separate the # column
        style_cmds.append(("BACKGROUND", (0, 1), (0, -1 if not has_total else -2),
                           colors.HexColor(ZEBRA_HEX)))
    # Alternating row backgrounds (skip the # column to keep its grey)
    body_end = len(data) - (1 if has_total else 0)
    for ri in range(1, body_end):
        if ri in section_row_indices:
            continue
        if ri % 2 == 0:
            style_cmds.append((
                "BACKGROUND",
                (idx_off, ri), (-1, ri),
                colors.HexColor(ZEBRA_HEX),
            ))
    # Section header rows: span all columns + accent background
    for ri in section_row_indices:
        style_cmds += [
            ("SPAN", (0, ri), (-1, ri)),
            ("BACKGROUND", (0, ri), (-1, ri), accent),
            ("LEFTPADDING", (0, ri), (-1, ri), 8),
            ("RIGHTPADDING", (0, ri), (-1, ri), 8),
            ("TOPPADDING", (0, ri), (-1, ri), 7),
            ("BOTTOMPADDING", (0, ri), (-1, ri), 7),
            ("LINEBEFORE", (0, ri), (0, ri), 0, colors.transparent),
            ("LINEAFTER", (-1, ri), (-1, ri), 0, colors.transparent),
            ("ALIGN", (0, ri), (-1, ri), "LEFT"),
            ("VALIGN", (0, ri), (-1, ri), "MIDDLE"),
        ]
    # Totals row
    if has_total:
        style_cmds += [
            ("LINEABOVE", (0, -1), (-1, -1), 1.5, accent),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor(TINT_HEX)),
            ("TOPPADDING", (0, -1), (-1, -1), 7),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 7),
        ]
        if show_index:
            # span the # cell into the label cell visually (just keep blank)
            pass

    table.setStyle(TableStyle(style_cmds))
    return table


# ---------------------------------------------------------------------------
# Render — main entry point
# ---------------------------------------------------------------------------

def _footer_painter(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#999999"))
    today = datetime.now(timezone.utc).strftime("%m/%d/%Y")
    canvas.drawCentredString(
        letter[0] / 2, 0.3 * inch,
        f"Generated by Toolbox Vault  ·  {today}  ·  Page {doc.page}",
    )
    canvas.restoreState()


def _build_receipt_pages(
    receipts_meta: List[Dict[str, Any]],
    spec: ReportSpec,
    st: Dict[str, ParagraphStyle],
) -> List[Any]:
    """Build flowable list for the appended receipt pages.

    Each page has:
      - A header line: "RECEIPT #<i> · <ITEM-NO> — <TOOL NAME> · Model: <MODEL>"
      - The receipt image, fitted to the available page area.

    receipts_meta: list of {item_no, tool_name, serial, image_b64}.
    """
    if not receipts_meta:
        return []
    flow: List[Any] = []
    # A new page after the main report content
    flow.append(PageBreak())

    # Section opener
    cover_title = ParagraphStyle(
        "ReceiptCoverTitle",
        parent=st["title"],
        fontSize=20,
        textColor=colors.HexColor(ACCENT_HEX),
        alignment=TA_CENTER,
        spaceAfter=10,
    )
    cover_sub = ParagraphStyle(
        "ReceiptCoverSub",
        parent=st["small"],
        fontSize=10,
        textColor=colors.HexColor("#666666"),
        alignment=TA_CENTER,
        spaceAfter=24,
    )
    flow.append(Paragraph("RECEIPTS APPENDIX", cover_title))
    flow.append(
        Paragraph(
            f"{len(receipts_meta)} receipt"
            f"{'s' if len(receipts_meta) != 1 else ''} attached",
            cover_sub,
        )
    )

    # Header style for each receipt page
    header_style = ParagraphStyle(
        "ReceiptHeader",
        parent=st["small"],
        fontSize=11,
        leading=14,
        textColor=colors.HexColor(INK_HEX),
        spaceAfter=6,
    )
    sub_style = ParagraphStyle(
        "ReceiptSub",
        parent=st["small"],
        fontSize=9,
        textColor=colors.HexColor("#666666"),
        spaceAfter=10,
    )

    # Available area on letter page minus margins (0.5" each side)
    page_w_pt = letter[0] - 1.0 * inch
    img_max_h = letter[1] - 1.5 * inch  # leave room for the header

    for i, m in enumerate(receipts_meta):
        if i > 0:
            flow.append(PageBreak())
        title_html = (
            f"<b>RECEIPT #{i + 1}</b> &nbsp;&middot;&nbsp; Item <b>#{m.get('item_no', '?')}</b>"
            f" &mdash; {esc(m.get('tool_name') or '(unnamed)')}"
        )
        sub_html = (
            f"Model: <b>{esc(m.get('serial') or '—')}</b>"
            f"&nbsp;&nbsp;|&nbsp;&nbsp;Receipt {m.get('receipt_idx', 1)} of {m.get('receipt_total', 1)} for this item"
        )
        flow.append(Paragraph(title_html, header_style))
        flow.append(Paragraph(sub_html, sub_style))
        img = _fit_image(m.get("image_b64") or "", page_w_pt, img_max_h, max_px=1600)
        if img is not None:
            flow.append(img)
        else:
            flow.append(
                Paragraph(
                    "<i>(receipt image could not be rendered — corrupt or unsupported format)</i>",
                    sub_style,
                )
            )
    return flow


def render_pdf(spec: ReportSpec, cols: List[Column],
               fetch_result: Dict[str, Any]) -> bytes:
    """Render a PDF for the given spec + chosen columns + fetch_result."""
    rows = fetch_result.get("rows") or []
    stats: List[Tuple[str, str, bool]] = fetch_result.get("stats") or []
    stats2: List[Tuple[str, str, bool]] = fetch_result.get("stats2") or []
    personal_info = fetch_result.get("personal_info")
    body_factory: Optional[Callable[[Dict[str, ParagraphStyle]], List[Any]]] = (
        fetch_result.get("body_factory")
    )

    st = _styles(spec.accent)
    story: List[Any] = []
    story.extend(_title_block(spec, st, subtitle=fetch_result.get("subtitle")))

    if personal_info:
        story.append(_personal_info_block(personal_info, spec.accent, st))
        story.append(Spacer(1, 8))

    if stats:
        story.append(_stats_row(stats, spec.accent, st))
        story.append(Spacer(1, 6))
    if stats2:
        story.append(_stats_row(stats2, spec.accent, st))
        story.append(Spacer(1, 8))
    elif stats:
        story.append(Spacer(1, 4))

    if body_factory is not None:
        story.extend(body_factory(st))
    elif fetch_result.get("page_break_per_group"):
        # Render one table per group with a PageBreak between groups — used
        # for the dealer report so each dealer starts on a fresh page.
        group_key = fetch_result.get("group_by") or "_dealer_group"
        ordered_groups = fetch_result.get("ordered_groups") or []
        rows_by_group: Dict[str, List[Dict[str, Any]]] = {}
        for r in rows:
            if r.get("_section_header"):
                continue
            rows_by_group.setdefault(r.get(group_key, ""), []).append(r)
        # Group names not in ordered_groups: append at the end.
        all_groups = list(ordered_groups) + [
            g for g in rows_by_group.keys() if g not in ordered_groups
        ]
        first = True
        for g in all_groups:
            grows = rows_by_group.get(g) or []
            if not grows:
                continue
            if not first:
                story.append(PageBreak())
            first = False
            # Group label header in the unified accent color
            story.append(
                Paragraph(
                    esc(str(g).upper()),
                    ParagraphStyle(
                        "group_header",
                        fontName="Helvetica-Bold",
                        fontSize=14,
                        leading=18,
                        spaceAfter=6,
                        textColor=colors.HexColor(ACCENT_HEX),
                    ),
                )
            )
            story.append(_data_table(cols, grows, spec.accent, st))
    else:
        story.append(_data_table(cols, rows, spec.accent, st))

    # Append receipt pages if requested (one page per receipt photo)
    receipts_meta = fetch_result.get("receipts_meta") or []
    if receipts_meta:
        story.extend(_build_receipt_pages(receipts_meta, spec, st))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=0.5 * inch, rightMargin=0.5 * inch,
        topMargin=0.55 * inch, bottomMargin=0.55 * inch,
        title=spec.title,
    )
    doc.build(story, onFirstPage=_footer_painter, onLaterPages=_footer_painter)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# CSV rendering
# ---------------------------------------------------------------------------

def render_csv(cols: List[Column], rows: List[Dict[str, Any]]) -> bytes:
    buf = io.StringIO()
    w = _csv.writer(buf)
    # Drop pseudo section-header rows — they are a PDF-only grouping affordance
    # and would clutter a spreadsheet. The "Dealer" column already carries the
    # grouping in CSV form.
    data_rows = [r for r in rows if not r.get("_section_header")]
    show_idx = len(data_rows) > 1
    header = (["#"] if show_idx else []) + [c.label for c in cols]
    w.writerow(header)
    for ri, r in enumerate(data_rows):
        out: List[str] = [str(ri + 1)] if show_idx else []
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
    has_total = any(c.type in ("money", "number") for c in cols)
    if has_total:
        foot: List[str] = [""] if show_idx else []
        first_label_placed = False
        for c in cols:
            if c.type in ("money", "number"):
                tot = sum(numeric_value(r, c.id) for r in data_rows)
                foot.append(f"{tot:.2f}" if c.type == "money" else f"{tot:.0f}")
            elif not first_label_placed:
                first_label_placed = True
                foot.append(f"TOTAL ({len(data_rows)} items)")
            else:
                foot.append("")
        w.writerow(foot)
    return buf.getvalue().encode("utf-8-sig")  # BOM for Excel


# ---------------------------------------------------------------------------
# Tool row normalisation
# ---------------------------------------------------------------------------

def _normalise_tool_row(t: Dict[str, Any]) -> Dict[str, Any]:
    photos = t.get("photos") or []
    photo = photos[0] if photos else ""
    qty_raw = t.get("quantity")
    try:
        qty = int(qty_raw) if qty_raw not in (None, "") else 1
    except Exception:
        qty = 1
    qty = max(1, qty)
    unit_cost = float(t.get("cost") or 0)
    unit_msrp = float(t.get("msrp_price") or 0)
    # Multi-value model_numbers — every value on its own line in the Model
    # column. Falls back through legacy set_serials and serial_number for
    # tools that haven't migrated yet.
    mns = t.get("model_numbers") or []
    if isinstance(mns, list) and mns:
        serial_str = "\n".join([str(s) for s in mns if s])
    elif t.get("is_set") and (t.get("set_serials") or []):
        serial_str = "\n".join(
            [s for s in (t.get("set_serials") or []) if s]
        )
    else:
        serial_str = t.get("serial_number") or ""
    # Multi-value serial_numbers (the NEW field, separate from model #)
    sns = t.get("serial_numbers") or []
    serial_numbers_str = "\n".join([str(s) for s in sns if s]) if isinstance(sns, list) else ""
    return {
        "id": t.get("id"),
        "name": t.get("name") or "",
        "brand": t.get("brand") or "",
        "model": t.get("model") or "",
        "serial": serial_str,
        "serial_numbers": serial_numbers_str,
        "category": t.get("category_name") or "",
        "location": t.get("location_name") or "",
        "dealer": t.get("dealer_name") or "",
        "condition": t.get("condition") or "",
        "purchase_date": t.get("purchase_date"),
        "warranty_until": t.get("warranty_expiry"),
        "tags": ", ".join(t.get("tag_names") or []),
        "notes": t.get("description") or "",
        "unit_cost": unit_cost,
        "cost": round(unit_cost * qty, 2),  # EXTENDED cost (qty × unit)
        # MSRP — same shape as cost. unit_msrp is informational; the "msrp"
        # field is extended (qty × unit) so totals add up correctly.
        "unit_msrp": unit_msrp,
        "msrp": round(unit_msrp * qty, 2),
        "quantity": qty,
        "photo": photo,
        "receipts": t.get("receipts") or [],
        "bundle_id": t.get("bundle_id"),
    }


# ---- BUNDLES / SETS (report grouping + dual sums) ----------------------------
#
# A "Set" (bundle) groups several items that each keep their own price, while the
# set itself has a single "set price". Reports must never double-count: the
# "Items Only" total sums every item's individual price; the "Items + Bundles"
# total sums UNBUNDLED items' individual prices PLUS each represented set's set
# price counted exactly once.

# Segmented option offered on inventory/insurance/year-end reports.
SET_PRICING_OPTION = {
    "id": "set_pricing",
    "type": "segmented",
    "label": "Set Pricing",
    "choices": [
        {"id": "individual", "label": "Individual"},
        {"id": "bundle", "label": "Bundle"},
        {"id": "both", "label": "Both"},
    ],
    "default": "both",
}


async def _load_bundles_map(db) -> Dict[str, Dict[str, Any]]:
    """Map of bundle_id -> bundle document for the current dataset."""
    bundles = await db.bundles.find({}, {"_id": 0}).to_list(5000)
    return {b.get("id"): b for b in bundles if b.get("id")}


def _bundle_sums(
    rows: List[Dict[str, Any]],
    bundles_map: Dict[str, Dict[str, Any]],
) -> Tuple[float, float, bool]:
    """Returns (items_only_sum, items_and_bundles_sum, has_bundles).

    items_only_sum            — every row's extended individual cost.
    items_and_bundles_sum     — unbundled rows' individual cost + each
                                represented set's set_price (counted ONCE).
    has_bundles               — whether any row belongs to a known set.
    """
    items_only = 0.0
    unbundled_cost = 0.0
    seen_bundles: set = set()
    for r in rows:
        if r.get("_section_header"):
            continue
        c = float(r.get("cost") or 0)
        items_only += c
        bid = r.get("bundle_id")
        if bid and bid in bundles_map:
            seen_bundles.add(bid)
        else:
            unbundled_cost += c
    bundle_total = sum(
        float(bundles_map[b].get("set_price") or 0) for b in seen_bundles
    )
    return (
        round(items_only, 2),
        round(unbundled_cost + bundle_total, 2),
        len(seen_bundles) > 0,
    )


def _group_rows_by_bundle(
    rows: List[Dict[str, Any]],
    bundles_map: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Insert a section header for each set (showing its set price) followed by
    that set's item rows; unbundled items fall under an 'Individual Items'
    header. Returns rows unchanged when there are no represented sets."""
    bundled: Dict[str, List[Dict[str, Any]]] = {}
    unbundled: List[Dict[str, Any]] = []
    for r in rows:
        bid = r.get("bundle_id")
        if bid and bid in bundles_map:
            bundled.setdefault(bid, []).append(r)
        else:
            unbundled.append(r)
    if not bundled:
        return rows

    out: List[Dict[str, Any]] = []
    for bid in sorted(
        bundled, key=lambda b: (bundles_map[b].get("name") or "").lower()
    ):
        b = bundles_map[bid]
        name = b.get("name") or "Set"
        sp = float(b.get("set_price") or 0)
        part = b.get("part_number") or ""
        n = len(bundled[bid])
        bits = [name]
        if part:
            bits.append(f"#{part}")
        bits.append(f"SET PRICE {fmt_money(sp)}")
        bits.append(f"{n} item" + ("" if n == 1 else "s"))
        out.append({
            "_section_header": True,
            "_section_label": "  ·  ".join(bits),
        })
        out.extend(bundled[bid])
    if unbundled:
        out.append({"_section_header": True, "_section_label": "Individual Items"})
        out.extend(unbundled)
    return out


def _bundle_value_stats(
    rows: List[Dict[str, Any]],
    bundles_map: Dict[str, Dict[str, Any]],
    mode: str,
    plain_label: str,
) -> Tuple[List[Tuple[str, str, bool]], bool]:
    """Build the money stat tuple(s) for a tool-list report based on the chosen
    set-pricing mode. Returns (stats, should_group).

    When there are no sets in the data we always fall back to the single
    `plain_label` total, regardless of mode.
    """
    items_only, items_bundles, has_bundles = _bundle_sums(rows, bundles_map)
    if not has_bundles or mode == "individual":
        return [(plain_label, fmt_money(items_only), True)], False
    if mode == "bundle":
        return [("Items + Bundles", fmt_money(items_bundles), True)], True
    # both
    return (
        [
            ("Items Only", fmt_money(items_only), True),
            ("Items + Bundles", fmt_money(items_bundles), True),
        ],
        True,
    )




# ---------------------------------------------------------------------------
# Fetchers
# ---------------------------------------------------------------------------

def _build_receipts_meta(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Helper for fetchers — extract per-receipt metadata for the appendix.

    Returns a list of {item_no, tool_name, serial, image_b64, receipt_idx,
    receipt_total} entries, one per receipt photo across all rows that have
    receipts. item_no is the 1-based index of the tool in the report.
    """
    out: List[Dict[str, Any]] = []
    for row_idx, r in enumerate(rows, start=1):
        photos = r.get("receipts") or []
        if not isinstance(photos, list) or not photos:
            continue
        for j, img in enumerate(photos, start=1):
            if not img:
                continue
            out.append({
                "item_no": row_idx,
                "tool_name": r.get("name") or "(unnamed)",
                "serial": r.get("serial") or "",
                "image_b64": img,
                "receipt_idx": j,
                "receipt_total": len(photos),
            })
    return out


def _date_range_subtitle(start: str, end: str) -> str:
    """Returns a human-readable date-range string for a report subtitle.
    'Complete History' when both ends are blank."""
    if not start and not end:
        return "Complete History"
    if start and end:
        return f"{fmt_date_us(start)} – {fmt_date_us(end)}"
    if start:
        return f"From {fmt_date_us(start)}"
    return f"Through {fmt_date_us(end)}"


# ---- CLAIMS (warranty / repair claims) -----------------------------------

async def _fetch_claims(db, user, options: Dict[str, Any]) -> Dict[str, Any]:
    mode = options.get("claims_mode") or "current"  # "current" | "history" | "all"
    # Backwards compat: support both legacy single dealer_id and new multi.
    dealer_ids = options.get("dealer_ids") or []
    if not dealer_ids and options.get("dealer_id"):
        dealer_ids = [options.get("dealer_id")]
    start = options.get("date_from") or ""
    end = options.get("date_to") or ""

    q: Dict[str, Any] = {}
    if mode == "current":
        q["claim_status"] = {"$nin": ["completed", "rejected"]}
    elif mode == "history":
        q["claim_status"] = {"$in": ["completed", "rejected"]}
    if dealer_ids:
        none_only = [d for d in dealer_ids if d == "_none_"]
        real_ids = [d for d in dealer_ids if d and d != "_none_"]
        ors: List[Dict[str, Any]] = []
        if real_ids:
            ors.append({"dealer_id": {"$in": real_ids}})
        if none_only:
            ors.append({"dealer_id": None})
            ors.append({"dealer_id": ""})
        if ors:
            q["$or"] = ors

    items = await db.warranty_claims.find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)
    if start or end:
        items = [
            i for i in items
            if in_range(i.get("created_at") or i.get("notified_at"), start, end)
        ]

    # Build a tool-id → tool lookup so we can resolve serial / set serials
    # without N+1 round-trips.
    tool_ids = list({i.get("tool_id") for i in items if i.get("tool_id")})
    tool_lookup: Dict[str, Dict[str, Any]] = {}
    if tool_ids:
        tools = await db.tools.find(
            {"id": {"$in": tool_ids}},
            {"_id": 0, "id": 1, "serial_number": 1, "set_serials": 1, "is_set": 1},
        ).to_list(len(tool_ids))
        tool_lookup = {t["id"]: t for t in tools}

    # Map status values → readable labels
    label_map = {
        "broken": "Broken",
        "awaiting_approval": "Awaiting Approval",
        "waiting_replacement": "Waiting Replacement",
        "completed": "Completed",
        "rejected": "Rejected",
    }
    rows = []
    for it in items:
        t = tool_lookup.get(it.get("tool_id") or "") or {}
        # When the underlying tool is a set, list every serial on its own
        # line in the same column. Falls back to the single serial otherwise.
        if t.get("is_set") and (t.get("set_serials") or []):
            serial_str = "\n".join([s for s in (t.get("set_serials") or []) if s])
        else:
            serial_str = t.get("serial_number") or ""

        # Photo selection for the report:
        #   * "history" mode → prefer the photo that was attached *to the claim*
        #     (i.e. the picture of the broken / completed repair). This is what
        #     the user wants to see on past-claim PDFs. Falls back to the item
        #     photo if no claim photo was uploaded.
        #   * "current" / "all" modes → keep the existing behaviour (tool photo
        #     first, fall back to whichever claim photo exists).
        tool_photo_val = it.get("tool_photo") or ""
        broken_photo_val = it.get("broken_photo") or ""
        if mode == "history":
            claim_photo_val = broken_photo_val or tool_photo_val
        else:
            claim_photo_val = tool_photo_val or broken_photo_val

        rows.append({
            "id": it.get("id"),
            "tool_name": it.get("tool_name") or "",
            "tool_photo": tool_photo_val,
            "broken_photo": broken_photo_val,
            "claim_photo": claim_photo_val,
            "dealer": it.get("dealer_name") or "—",
            "_dealer_group": it.get("dealer_name") or "(No dealer)",
            "_dealer_id": it.get("dealer_id") or "",
            "_notified_at_iso": it.get("notified_at") or it.get("created_at") or "",
            "serial": serial_str,
            "status": label_map.get(it.get("claim_status") or "broken",
                                    it.get("claim_status") or "—"),
            "repair_company": it.get("repair_company") or "",
            "contact": it.get("contact") or "",
            "notified_at": it.get("notified_at") or "",
            "expected_completion": it.get("expected_completion") or "",
            "completed_at": it.get("completed_at") or "",
            "notes": it.get("notes") or "",
            "created_at": (it.get("created_at") or "")[:10],
            # Out-of-pocket repair / replacement cost (0 if covered by warranty)
            "repair_cost": float(it.get("repair_cost") or 0),
        })

    # Group rows by dealer; within each group keep newest claim first.
    def _row_key(r: Dict[str, Any]) -> str:
        # Use notified_at when present, else created_at. Empty strings sort last.
        return r.get("_notified_at_iso") or ""

    groups: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        groups.setdefault(r["_dealer_group"], []).append(r)
    for k in groups:
        groups[k].sort(key=_row_key, reverse=True)

    # Ordered list of dealer names: dealers with claims, alphabetically.
    ordered_dealers = sorted(groups.keys(), key=lambda s: s.lower())

    sorted_rows: List[Dict[str, Any]] = []
    for d in ordered_dealers:
        # Insert a section header row only when there's more than one dealer
        # group (otherwise the regular header is enough).
        if len(ordered_dealers) > 1:
            sorted_rows.append({"_section_header": True, "_section_label": d})
        sorted_rows.extend(groups[d])

    title_word = (
        "Open Claims" if mode == "current"
        else ("Past Claims" if mode == "history" else "All Claims")
    )
    only_real = [r for r in sorted_rows if not r.get("_section_header")]
    stats = [
        (title_word, str(len(only_real)), False),
        (
            "Open" if mode != "history" else "Closed",
            str(sum(
                1 for r in only_real
                if (mode == "history" and r["status"] in ("Completed", "Rejected"))
                or (mode != "history" and r["status"] not in ("Completed", "Rejected"))
            )),
            True,
        ),
    ]
    sub = _date_range_subtitle(start, end)
    if mode == "current":
        sub = f"Open / Current  ·  {sub}"
    elif mode == "history":
        sub = f"History (Closed)  ·  {sub}"
    else:
        sub = f"All Claims  ·  {sub}"
    return {
        "rows": sorted_rows,
        "stats": stats,
        "subtitle": sub,
        "group_by": "_dealer_group",
        "group_label": "Dealer",
        "ordered_groups": ordered_dealers,
        "page_break_per_group": True,
    }


# ---- INSURANCE -----------------------------------------------------------------

async def _fetch_insurance(db, user, options: Dict[str, Any]) -> Dict[str, Any]:
    tools = await db.tools.find({}, {"_id": 0}).to_list(10000)
    rows = [_normalise_tool_row(t) for t in tools]
    profile = await db.personal_profile.find_one({"id": "self"}, {"_id": 0}) or {}

    pi = None
    if options.get("include_personal", True) and profile.get("name"):
        pi = profile

    total_units = sum(int(r.get("quantity") or 1) for r in rows)
    items_label = (
        f"{len(rows)}" if total_units == len(rows)
        else f"{len(rows)} · {total_units} units"
    )
    receipts_meta = (
        _build_receipts_meta(rows) if options.get("include_receipts") else None
    )
    # Set pricing: dual sums + grouping under each set's header.
    bundles_map = await _load_bundles_map(db)
    mode = (options.get("set_pricing") or "both").strip().lower()
    value_stats, should_group = _bundle_value_stats(rows, bundles_map, mode, "Total Value")
    if should_group:
        rows = _group_rows_by_bundle(rows, bundles_map)
    stats = [("Total Items", items_label, False), *value_stats]
    out: Dict[str, Any] = {"rows": rows, "stats": stats, "personal_info": pi}
    if receipts_meta is not None:
        out["receipts_meta"] = receipts_meta
    return out


# ---- INVENTORY ----------------------------------------------------------------

async def _fetch_inventory(db, user, options: Dict[str, Any]) -> Dict[str, Any]:
    q: Dict[str, Any] = {"is_sold": {"$ne": True}}
    location_id = options.get("location_id") or ""
    if location_id:
        all_ids = [location_id]
        children = await db.locations.find(
            {"parent_id": location_id}, {"_id": 0, "id": 1}
        ).to_list(5000)
        all_ids += [c["id"] for c in children]
        q["location_id"] = {"$in": all_ids}

    tag_ids = options.get("tag_ids") or []
    if tag_ids:
        q["tag_ids"] = {"$in": tag_ids}
    # Multi-select brand filter (preferred). Falls back to legacy single text.
    brands_raw = options.get("brands")
    if isinstance(brands_raw, list) and brands_raw:
        clean = [b.strip() for b in brands_raw if isinstance(b, str) and b.strip()]
        if clean:
            q["brand"] = {"$in": clean}
    else:
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
    total_units = sum(int(r.get("quantity") or 1) for r in rows)
    items_label = (
        f"{len(rows)}" if total_units == len(rows)
        else f"{len(rows)} · {total_units} units"
    )
    # Receipts appendix is built from the flat (ungrouped) row order.
    receipts_meta = (
        _build_receipts_meta(rows) if options.get("include_receipts") else None
    )
    # Set pricing: dual sums + grouping under each set's header.
    bundles_map = await _load_bundles_map(db)
    mode = (options.get("set_pricing") or "both").strip().lower()
    value_stats, should_group = _bundle_value_stats(rows, bundles_map, mode, "Total Cost")
    if should_group:
        rows = _group_rows_by_bundle(rows, bundles_map)
    stats = [("Total Items", items_label, False), *value_stats]
    out: Dict[str, Any] = {"rows": rows, "stats": stats}
    if receipts_meta is not None:
        out["receipts_meta"] = receipts_meta
    return out


# ---- SALES --------------------------------------------------------------------

async def _fetch_sales(db, user, options: Dict[str, Any]) -> Dict[str, Any]:
    mode = options.get("sales_mode") or "listed"
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
        unit_price = (t.get("sold_price") or 0) if mode == "sold" else (t.get("sale_price") or 0)
        qty = row["quantity"]
        ext_price = round(float(unit_price or 0) * qty, 2)
        ext_buy = row["cost"]  # already extended by _normalise_tool_row
        row["unit_price"] = float(unit_price or 0)
        row["price"] = ext_price
        row["profit"] = round(ext_price - ext_buy, 2)
        row["sale_date"] = t.get(date_field)
        row["sold_to"] = t.get("sold_to") or ""
        rows.append(row)

    total = sum(numeric_value(r, "price") for r in rows)
    total_units = sum(int(r.get("quantity") or 1) for r in rows)
    items_label = (
        f"{len(rows)}" if total_units == len(rows)
        else f"{len(rows)} · {total_units} units"
    )
    stats = [
        (
            ("Sold Items" if mode == "sold" else "Listed Items"),
            items_label,
            False,
        ),
        (
            ("Sold Total" if mode == "sold" else "Asking Total"),
            fmt_money(total),
            True,
        ),
    ]

    layout = options.get("sales_layout") or "table"
    body_factory = None
    if layout == "per_item":
        body_factory = _make_sales_per_item_factory(rows, mode, options)

    out: Dict[str, Any] = {"rows": rows, "stats": stats, "body_factory": body_factory}
    if options.get("include_receipts"):
        out["receipts_meta"] = _build_receipts_meta(rows)
    return out


def _make_sales_per_item_factory(rows: List[Dict[str, Any]], mode: str,
                                 options: Dict[str, Any]):
    def build(st: Dict[str, ParagraphStyle]) -> List[Any]:
        if not rows:
            return [_para("No items.", st["muted"])]
        out: List[Any] = []
        accent_label = "SOLD" if mode == "sold" else "FOR SALE"
        total = len(rows)
        for i, r in enumerate(rows):
            if i > 0:
                out.append(PageBreak())
            page_flow: List[Any] = []
            # Tiny "Item N of M" pill above the ribbon
            if total > 1:
                page_flow.append(_para(
                    f"ITEM {i + 1} OF {total}",
                    ParagraphStyle(
                        "item_n", fontName="Helvetica-Bold", fontSize=8,
                        leading=10, textColor=colors.HexColor("#888888"),
                    ),
                ))
                page_flow.append(Spacer(1, 4))
            # Header row: ribbon + name on left, price on right
            head = Table([[
                [
                    _para(accent_label, st["ribbon"]),
                    Spacer(1, 4),
                    _para(esc(r.get("name") or ""), st["flyer_name"]),
                ],
                _para(fmt_money(r.get("price")), st["flyer_price"]),
            ]], colWidths=[PAGE_W * 0.62, PAGE_W * 0.38])
            head.setStyle(TableStyle([
                ("VALIGN", (0, 0), (0, 0), "TOP"),
                ("VALIGN", (1, 0), (1, 0), "BOTTOM"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]))
            page_flow.append(head)
            page_flow.append(Spacer(1, 6))
            page_flow.append(_hr(ACCENT_HEX, 1.5))
            page_flow.append(Spacer(1, 10))

            # Photo
            photo_box_w = 5.5 * inch
            photo_box_h = 3.4 * inch
            img = _fit_image(r.get("photo"), photo_box_w, photo_box_h, max_px=720)
            if img is not None:
                photo_t = Table([[img]], colWidths=[PAGE_W])
                photo_t.setStyle(TableStyle([
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ]))
                page_flow.append(photo_t)
            else:
                placeholder = Table([[_para("No photo", st["muted"])]],
                                    colWidths=[PAGE_W],
                                    rowHeights=[photo_box_h])
                placeholder.setStyle(TableStyle([
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f4f4f4")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
                ]))
                page_flow.append(placeholder)
            page_flow.append(Spacer(1, 12))

            # Notes (if any)
            notes = r.get("notes") or ""
            if notes:
                page_flow.append(_para(esc(notes), st["muted"]))
                page_flow.append(Spacer(1, 8))

            # Specs grid (2-col). "Model" (brand-product-model) pair
            # removed — every tool uses the consolidated "Model #"
            # identifier below.
            pairs = [
                ("Brand", r.get("brand")),
                ("Model #", r.get("serial")),
                ("Condition", r.get("condition")),
                ("Original Cost", fmt_money(r.get("cost")) if r.get("cost") else ""),
                ("Purchased", fmt_date_us(r.get("purchase_date"))),
                ("Dealer", r.get("dealer")),
                ("Location", r.get("location")),
            ]
            if mode == "sold":
                pairs.append(("Sold To", r.get("sold_to")))
                pairs.append(("Sold On", fmt_date_us(r.get("sale_date"))))
            else:
                pairs.append(("Listed", fmt_date_us(r.get("sale_date"))))
            pairs = [(l, v) for l, v in pairs if v]

            spec_rows: List[List[Any]] = []
            for j in range(0, len(pairs), 2):
                left_cell = [
                    _para(esc(pairs[j][0].upper()), st["spec_l"]),
                    _para(esc(str(pairs[j][1])), st["spec_v"]),
                ]
                if j + 1 < len(pairs):
                    right_cell = [
                        _para(esc(pairs[j + 1][0].upper()), st["spec_l"]),
                        _para(esc(str(pairs[j + 1][1])), st["spec_v"]),
                    ]
                else:
                    right_cell = ""
                spec_rows.append([left_cell, right_cell])

            specs_t = Table(spec_rows, colWidths=[PAGE_W / 2, PAGE_W / 2])
            specs_t.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#eeeeee")),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            page_flow.append(specs_t)
            out.append(KeepTogether(page_flow))
        return out

    return build


# ---- ACCOUNT (DEALER) --------------------------------------------------------

async def _fetch_account(db, user, options: Dict[str, Any]) -> Dict[str, Any]:
    dealer_ids = options.get("dealer_ids") or []
    start = options.get("date_from") or ""
    end = options.get("date_to") or ""

    q = {"id": {"$in": dealer_ids}} if dealer_ids else {}
    dealers = await db.dealers.find(q, {"_id": 0}).sort("name", 1).to_list(1000)

    grand_credit_open = 0.0
    grand_truck_open = 0.0
    grand_payments = 0.0
    grand_charges = 0.0

    # Pre-compute per-dealer data so we can build flowables AND stats
    per_dealer = []
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
        grand_payments += sum(float(t.get("amount") or 0) for t in tx_in_range
                              if t.get("type") == "payment")
        grand_charges += sum(float(t.get("amount") or 0) for t in tx_in_range
                             if t.get("type") == "charge")
        per_dealer.append({
            "name": d.get("name", ""),
            "credit_balance": credit_balance,
            "truck_balance": truck_balance,
            "credit_tx": credit_tx,
            "truck_tx": truck_tx,
        })

    stats = [
        ("Dealers", str(len(dealers)), False),
        ("Total Open Balance", fmt_money(grand_credit_open + grand_truck_open), True),
    ]
    stats2 = [
        ("Payments", fmt_money(grand_payments), False),
        ("New Charges", fmt_money(grand_charges), False),
    ]

    body_factory = _make_account_factory(per_dealer)

    return {
        "rows": [],
        "stats": stats,
        "stats2": stats2,
        "body_factory": body_factory,
        "subtitle": _date_range_subtitle(start, end),
    }


def _make_account_factory(per_dealer: List[Dict[str, Any]]):
    def build(st: Dict[str, ParagraphStyle]) -> List[Any]:
        if not per_dealer:
            return [_para("No dealers selected.", st["muted"])]

        out: List[Any] = []

        green = colors.HexColor("#16a34a")
        red = colors.HexColor("#dc2626")

        green_v = ParagraphStyle("g", parent=st["stat_v"], textColor=green)
        red_v = ParagraphStyle("r", parent=st["stat_v"], textColor=red)
        green_amount = ParagraphStyle(
            "gA", parent=st["small_bold_right"], textColor=green,
        )
        red_amount = ParagraphStyle(
            "rA", parent=st["small_bold_right"], textColor=red,
        )

        for idx, d in enumerate(per_dealer):
            # User request: each dealer starts on its own page so reports
            # can be printed and handed out per-dealer.
            if idx > 0:
                out.append(PageBreak())
            out.append(Spacer(1, 4))
            # Section header
            sect = Table([[_para(esc(d["name"].upper()), ParagraphStyle(
                "sect_inner", fontName="Helvetica-Bold", fontSize=11,
                leading=13, textColor=colors.HexColor(HEADER_TEXT_HEX),
            ))]], colWidths=[PAGE_W])
            sect.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(HEADER_HEX)),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            out.append(sect)

            for label, balance, tx_list in [
                ("Credit Account", d["credit_balance"], d["credit_tx"]),
                ("Truck Account", d["truck_balance"], d["truck_tx"]),
            ]:
                # Subsection header
                sub = Table([[_para(esc(label.upper()), ParagraphStyle(
                    "sub_inner", fontName="Helvetica-Bold", fontSize=10,
                    leading=12, textColor=colors.HexColor(INK_HEX),
                ))]], colWidths=[PAGE_W])
                sub.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(TINT_HEX)),
                    ("LINEBEFORE", (0, 0), (0, 0), 3, colors.HexColor(ACCENT_HEX)),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]))
                out.append(sub)
                out.append(Spacer(1, 4))

                payments = sum(float(t.get("amount") or 0) for t in tx_list
                               if t.get("type") == "payment")
                charges = sum(float(t.get("amount") or 0) for t in tx_list
                              if t.get("type") == "charge")

                # Mini summary (3 cards)
                summary = Table([[
                    [_para("OPEN BALANCE", st["stat_l"]),
                     _para(fmt_money(balance), st["stat_v"])],
                    [_para("PAYMENTS", st["stat_l"]),
                     _para(fmt_money(payments), green_v)],
                    [_para("NEW CHARGES", st["stat_l"]),
                     _para(fmt_money(charges), red_v)],
                ]], colWidths=[PAGE_W / 3, PAGE_W / 3, PAGE_W / 3])
                summary.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("BOX", (0, 0), (0, 0), 0.5, colors.HexColor(HAIRLINE_HEX)),
                    ("BOX", (1, 0), (1, 0), 0.5, colors.HexColor(HAIRLINE_HEX)),
                    ("BOX", (2, 0), (2, 0), 0.5, colors.HexColor(HAIRLINE_HEX)),
                    ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]))
                out.append(summary)
                out.append(Spacer(1, 4))

                # Transaction table
                if not tx_list:
                    out.append(_para("No transactions in this range.", st["muted"]))
                    out.append(Spacer(1, 6))
                    continue
                col_w = [
                    0.32 * inch,  # #
                    0.95 * inch,  # date
                    0.85 * inch,  # type
                    PAGE_W - 0.32 * inch - 0.95 * inch - 0.85 * inch - 1.0 * inch,  # note
                    1.0 * inch,   # amount
                ]
                idx_body_style = ParagraphStyle(
                    "idx_acct", parent=st["small_right"],
                    fontName="Helvetica-Bold",
                    textColor=colors.HexColor("#888888"),
                )
                data = [[
                    _para("#", st["th_right"]),
                    _para("DATE", st["th"]),
                    _para("TYPE", st["th"]),
                    _para("NOTE", st["th"]),
                    _para("AMOUNT", st["th_right"]),
                ]]
                for ti, t in enumerate(tx_list):
                    is_pay = t.get("type") == "payment"
                    sign = "-" if is_pay else "+"
                    amt_style = green_amount if is_pay else red_amount
                    data.append([
                        _para(str(ti + 1), idx_body_style),
                        _para(esc(fmt_date_us(t.get("date"))), st["small"]),
                        _para("Payment" if is_pay else "Charge", st["small"]),
                        _para(esc(t.get("note") or ""), st["small"]),
                        _para(f"{sign}{fmt_money(t.get('amount'))}", amt_style),
                    ])
                # Footer row
                data.append([
                    "",
                    _para("Totals", ParagraphStyle(
                        "_", parent=st["small"], fontName="Helvetica-Bold",
                        textColor=colors.HexColor("#555"),
                    )),
                    "",
                    "",
                    _para(
                        f"Pay {fmt_money(payments)} · Chg {fmt_money(charges)}",
                        st["small_bold_right"],
                    ),
                ])

                tx_table = Table(data, colWidths=col_w, repeatRows=1)
                tx_style: List[Any] = [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(HEADER_HEX)),
                    ("BACKGROUND", (0, 1), (0, -2), colors.HexColor(ZEBRA_HEX)),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor(HAIRLINE_HEX)),
                ]
                # alternating
                for ri in range(1, len(data) - 1):
                    if ri % 2 == 0:
                        tx_style.append((
                            "BACKGROUND", (1, ri), (-1, ri),
                            colors.HexColor(ZEBRA_HEX),
                        ))
                # footer
                tx_style += [
                    ("LINEABOVE", (0, -1), (-1, -1), 1.2, colors.HexColor(ACCENT_HEX)),
                    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor(TINT_HEX)),
                    ("SPAN", (1, -1), (3, -1)),
                ]
                tx_table.setStyle(TableStyle(tx_style))
                out.append(tx_table)
                out.append(Spacer(1, 8))

        return out

    return build


# ---------------------------------------------------------------------------
# Column catalogs + report registry
# ---------------------------------------------------------------------------

# ---- CHECKED-OUT REPORT --------------------------------------------------------

async def _fetch_checked_out(db, user, options: Dict[str, Any]) -> Dict[str, Any]:
    """Build the Checked-Out Items report.

    Filters:
      - status: "current" (still out) | "returned" | "both"
      - borrower_ids: list of borrower IDs (empty = all people)
      - location_id, tag_ids, category_ids, dealer_ids: same shape as inventory
      - date_from / date_to: filter on checkout date
    """
    status = (options.get("status") or "both").lower()
    borrower_ids = options.get("borrower_ids") or []
    location_id = options.get("location_id") or ""
    tag_ids = options.get("tag_ids") or []
    category_ids = options.get("category_ids") or []
    dealer_ids = options.get("dealer_ids") or []
    start = options.get("date_from") or ""
    end = options.get("date_to") or ""

    q: Dict[str, Any] = {}
    # Pre-filter tools by location/tags/categories/dealers to keep query light.
    if location_id:
        all_ids = [location_id]
        children = await db.locations.find(
            {"parent_id": location_id}, {"_id": 0, "id": 1}
        ).to_list(5000)
        all_ids += [c["id"] for c in children]
        q["location_id"] = {"$in": all_ids}
    if tag_ids:
        q["tag_ids"] = {"$in": tag_ids}
    if category_ids:
        q["category_id"] = {"$in": category_ids}
    if dealer_ids:
        q["dealer_id"] = {"$in": dealer_ids}

    tools = await db.tools.find(q, {"_id": 0}).to_list(20000)

    rows: List[Dict[str, Any]] = []
    for t in tools:
        base = _normalise_tool_row(t)
        records: List[Dict[str, Any]] = []
        # Active checkout (still out) lives in current_checkout
        cc = t.get("current_checkout")
        if cc and t.get("is_checked_out"):
            records.append({**cc, "_active": True})
        # Past checkouts in checkout_history
        for h in (t.get("checkout_history") or []):
            if h.get("checked_in_at"):
                records.append({**h, "_active": False})
        for rec in records:
            is_active = bool(rec.get("_active"))
            # Status filter
            if status == "current" and not is_active:
                continue
            if status == "returned" and is_active:
                continue
            # Borrower multi-select filter
            if borrower_ids and rec.get("borrower_id") not in borrower_ids:
                continue
            # Date range filter on checkout date
            if start or end:
                if not in_range(rec.get("checked_out_at"), start, end):
                    continue
            checked_out_at = rec.get("checked_out_at") or ""
            checked_in_at = rec.get("checked_in_at") or ""
            days_out = ""
            try:
                from datetime import datetime, timezone
                if checked_out_at:
                    out_dt = datetime.fromisoformat(checked_out_at.replace("Z", "+00:00"))
                    end_dt = (
                        datetime.fromisoformat(checked_in_at.replace("Z", "+00:00"))
                        if checked_in_at
                        else datetime.now(timezone.utc)
                    )
                    delta = end_dt - out_dt
                    days_out = str(max(0, int(delta.total_seconds() // 86400)))
            except Exception:
                days_out = ""
            rows.append({
                **base,
                "borrower_name": rec.get("borrower_name") or "—",
                "borrower_id": rec.get("borrower_id") or "",
                "checked_out_at": checked_out_at[:10] if checked_out_at else "",
                "checked_in_at": checked_in_at[:10] if checked_in_at else "",
                "days_out": days_out,
                "checkout_notes": rec.get("notes") or "",
                "checkout_status": "OUT" if is_active else "RETURNED",
                "_borrower_group": rec.get("borrower_name") or "(Unknown)",
            })

    # Sort: still-out first, then by checkout_out_at desc.
    rows.sort(key=lambda r: (0 if r["checkout_status"] == "OUT" else 1, r["checked_out_at"]), reverse=False)

    n_out = sum(1 for r in rows if r["checkout_status"] == "OUT")
    n_returned = sum(1 for r in rows if r["checkout_status"] == "RETURNED")
    stats = [
        ("Records", str(len(rows)), False),
        ("Still Out", str(n_out), True),
        ("Returned", str(n_returned), False),
    ]
    return {
        "rows": rows,
        "stats": stats,
        "subtitle": _date_range_subtitle(start, end),
    }


# ---- LOST / STOLEN REPORT ------------------------------------------------------

async def _fetch_lost_stolen(db, user, options: Dict[str, Any]) -> Dict[str, Any]:
    """Build the Lost/Stolen Items report.

    Per user request: recovered items are EXCLUDED by default.
    Filters:
      - type: "lost" | "stolen" | "both"
      - location_id, tag_ids, category_ids, dealer_ids
      - price_min / price_max
      - date_from / date_to (on reported_date)
      - include_recovered: bool (defaults False)
    """
    type_filter = (options.get("type") or "both").lower()
    location_id = options.get("location_id") or ""
    tag_ids = options.get("tag_ids") or []
    category_ids = options.get("category_ids") or []
    dealer_ids = options.get("dealer_ids") or []
    price_min = options.get("price_min")
    price_max = options.get("price_max")
    start = options.get("date_from") or ""
    end = options.get("date_to") or ""
    include_recovered = bool(options.get("include_recovered"))

    q: Dict[str, Any] = {"lost_status.is_lost": True} if not include_recovered \
        else {"lost_status": {"$ne": None}}
    if location_id:
        all_ids = [location_id]
        children = await db.locations.find(
            {"parent_id": location_id}, {"_id": 0, "id": 1}
        ).to_list(5000)
        all_ids += [c["id"] for c in children]
        q["location_id"] = {"$in": all_ids}
    if tag_ids:
        q["tag_ids"] = {"$in": tag_ids}
    if category_ids:
        q["category_id"] = {"$in": category_ids}
    if dealer_ids:
        q["dealer_id"] = {"$in": dealer_ids}

    tools = await db.tools.find(q, {"_id": 0}).to_list(20000)

    rows: List[Dict[str, Any]] = []
    for t in tools:
        ls = t.get("lost_status") or {}
        if not ls:
            continue
        # When including recovered items, still keep only records that were
        # ever lost/stolen (have a reported_date).
        if not include_recovered and not ls.get("is_lost"):
            continue
        rec_type = (ls.get("type") or "lost").lower()
        if type_filter != "both" and rec_type != type_filter:
            continue
        # Date filter on reported_date
        if start or end:
            if not in_range(ls.get("reported_date"), start, end):
                continue
        base = _normalise_tool_row(t)
        unit_cost = float(base.get("unit_cost") or 0)
        if price_min is not None and unit_cost < float(price_min):
            continue
        if price_max is not None and unit_cost > float(price_max):
            continue
        rows.append({
            **base,
            "loss_type": rec_type.upper(),
            "reported_date": ls.get("reported_date") or "",
            "police_report": ls.get("police_report_number") or "",
            "insurance_company": ls.get("insurance_company") or "",
            "insurance_claim": ls.get("insurance_claim_number") or "",
            "loss_notes": ls.get("notes") or "",
            "is_recovered": bool(ls.get("recovered_at")),
            "recovered_at": (ls.get("recovered_at") or "")[:10],
            "_type_group": rec_type.title(),
        })

    rows.sort(key=lambda r: (r.get("_type_group", ""), r.get("reported_date") or ""), reverse=False)

    n_lost = sum(1 for r in rows if r["loss_type"] == "LOST")
    n_stolen = sum(1 for r in rows if r["loss_type"] == "STOLEN")
    total_value = sum(float(r.get("cost") or 0) for r in rows)
    stats = [
        ("Records", str(len(rows)), False),
        ("Lost", str(n_lost), False),
        ("Stolen", str(n_stolen), True),
    ]
    stats2 = [
        ("Total Reported Value", fmt_money(total_value), True),
    ]
    return {
        "rows": rows,
        "stats": stats,
        "stats2": stats2,
        "subtitle": _date_range_subtitle(start, end),
    }


# ---------------------------------------------------------------------------
# Column catalogs (continued)
# ---------------------------------------------------------------------------

_TOOL_COLUMNS = [
    Column("photo", "Photo", "center", "image"),
    Column("name", "Name", "left", "text"),
    Column("brand", "Brand", "left", "text"),
    # Legacy "Model" column removed — the consolidated "Model #" column
    # below (key=serial) is the single identifier surface across the app
    # after the user-requested rename.
    Column("serial", "Model #", "left", "text"),
    Column("category", "Category", "left", "text"),
    Column("location", "Location", "left", "text"),
    Column("dealer", "Dealer", "left", "text"),
    Column("condition", "Condition", "left", "text"),
    Column("purchase_date", "Purchased", "left", "date"),
    Column("warranty_until", "Warranty Until", "left", "date"),
    Column("tags", "Tags", "left", "text"),
    Column("quantity", "Qty", "right", "number"),
    Column("unit_cost", "Unit Cost", "right", "money"),
    Column("cost", "Cost", "right", "money"),
    # MSRP — toggleable in the report wizard. When both Cost and MSRP are
    # included, the auto-TOTAL row renders separate column sums for each.
    Column("unit_msrp", "Unit MSRP", "right", "money"),
    Column("msrp", "MSRP", "right", "money"),
]

_SALES_COLUMNS = [
    Column("photo", "Photo", "center", "image"),
    Column("name", "Name", "left", "text"),
    Column("brand", "Brand", "left", "text"),
    # Same consolidation as _TOOL_COLUMNS — single "Model #" column.
    Column("serial", "Model #", "left", "text"),
    Column("dealer", "Dealer", "left", "text"),
    Column("location", "Location", "left", "text"),
    Column("condition", "Condition", "left", "text"),
    Column("sale_date", "Date", "left", "date"),
    Column("sold_to", "Sold To", "left", "text"),
    Column("quantity", "Qty", "right", "number"),
    Column("cost", "Buy Price", "right", "money"),
    Column("price", "Price", "right", "money"),
    Column("profit", "Profit", "right", "money"),
]

_CHECKED_OUT_COLUMNS = [
    Column("photo", "Photo", "center", "image"),
    Column("name", "Tool", "left", "text"),
    Column("brand", "Brand", "left", "text"),
    Column("serial", "Model #", "left", "text"),
    Column("location", "Location", "left", "text"),
    Column("borrower_name", "Borrower", "left", "text"),
    Column("checked_out_at", "Out On", "left", "date"),
    Column("checked_in_at", "Returned", "left", "date"),
    Column("days_out", "Days", "right", "number"),
    Column("checkout_status", "Status", "left", "text"),
    Column("checkout_notes", "Notes", "left", "text"),
    Column("cost", "Value", "right", "money"),
]

_LOST_STOLEN_COLUMNS = [
    Column("photo", "Photo", "center", "image"),
    Column("name", "Tool", "left", "text"),
    Column("brand", "Brand", "left", "text"),
    Column("serial", "Model #", "left", "text"),
    Column("category", "Category", "left", "text"),
    Column("location", "Last Location", "left", "text"),
    Column("dealer", "Dealer", "left", "text"),
    Column("loss_type", "Type", "left", "text"),
    Column("reported_date", "Reported", "left", "date"),
    Column("police_report", "Police #", "left", "text"),
    Column("insurance_company", "Insurance Co.", "left", "text"),
    Column("insurance_claim", "Claim #", "left", "text"),
    Column("loss_notes", "Notes", "left", "text"),
    Column("cost", "Value", "right", "money"),
    Column("msrp", "MSRP", "right", "money"),
]


# ---- REPAIR COSTS (new dedicated repair/replacement cost report) -----------

async def _fetch_repair_costs(db, user, options: Dict[str, Any]) -> Dict[str, Any]:
    """Same shape as _fetch_claims but oriented around money totals. Always
    rendered with the repair_cost column (and TOTAL row) included.

    Default includes ALL claims in the timeframe (whether or not a repair
    cost was logged) so the user sees the full picture. The "Only repairs
    with a cost" toggle drops $0 / warranty-covered rows for users who
    want to see ONLY out-of-pocket repair spending."""
    base = await _fetch_claims(db, user, options)
    rows = base.get("rows") or []

    only_paid = bool(options.get("only_paid"))
    if only_paid:
        rows = [
            r for r in rows
            if r.get("_section_header") or float(r.get("repair_cost") or 0) > 0
        ]

    only_real = [r for r in rows if not r.get("_section_header")]
    grand_total = sum(float(r.get("repair_cost") or 0) for r in only_real)
    stats = [
        ("Claims", str(len(only_real)), False),
        ("Total Repair Cost", fmt_money(grand_total), True),
    ]
    sub = base.get("subtitle") or ""
    return {
        "rows": rows,
        "stats": stats,
        "subtitle": f"Repair / Replacement Cost  ·  {sub}" if sub else "Repair / Replacement Cost",
        "group_by": base.get("group_by"),
        "group_label": base.get("group_label"),
        "ordered_groups": base.get("ordered_groups"),
        "page_break_per_group": base.get("page_break_per_group"),
    }


# ---- YEAR END (annual snapshot report) -------------------------------------

async def _compute_available_years(db) -> List[int]:
    """Return a descending list of years where the user has any tool /
    sale / loss / repair activity. Drives the year_end report's year picker."""
    years: set = set()
    cursor = db.tools.find(
        {},
        {"_id": 0, "purchase_date": 1, "sold_at": 1, "created_at": 1,
         "lost_status": 1, "is_sold": 1},
    )
    async for t in cursor:
        for k in ("purchase_date", "sold_at", "created_at"):
            v = t.get(k)
            if isinstance(v, str) and len(v) >= 4 and v[:4].isdigit():
                years.add(int(v[:4]))
        ls = t.get("lost_status") or {}
        if isinstance(ls, dict):
            v = ls.get("reported_at") or ""
            if isinstance(v, str) and len(v) >= 4 and v[:4].isdigit():
                years.add(int(v[:4]))
    # Also include warranty-claim years (in case a tool was acquired in
    # a prior year but had repairs this year).
    cursor2 = db.warranty_claims.find(
        {}, {"_id": 0, "notified_at": 1, "created_at": 1, "completed_at": 1},
    )
    async for c in cursor2:
        for k in ("notified_at", "created_at", "completed_at"):
            v = c.get(k)
            if isinstance(v, str) and len(v) >= 4 and v[:4].isdigit():
                years.add(int(v[:4]))
    return sorted(years, reverse=True)


async def _fetch_year_end(db, user, options: Dict[str, Any]) -> Dict[str, Any]:
    year_str = (options.get("year") or "").strip()
    try:
        year = int(year_str) if year_str else datetime.now().year
    except Exception:
        year = datetime.now().year

    # Default window = Jan 1 .. Dec 31 of selected year, but user can override.
    start = (options.get("date_from") or "").strip() or f"{year:04d}-01-01"
    end = (options.get("date_to") or "").strip() or f"{year:04d}-12-31"

    include_sold = options.get("include_sold", True)
    include_lost = options.get("include_lost", True)
    include_stolen = options.get("include_stolen", True)
    include_repairs = options.get("include_repairs", True)

    # ----- Pull all candidate tools (apply category/location/dealer/tag filters) -----
    q: Dict[str, Any] = {}
    location_id = options.get("location_id")
    if location_id:
        q["location_id"] = location_id
    cat_ids = options.get("category_ids") or []
    if isinstance(cat_ids, list) and cat_ids:
        q["category_id"] = {"$in": cat_ids}
    dealer_ids = options.get("dealer_ids") or []
    if isinstance(dealer_ids, list) and dealer_ids:
        q["dealer_id"] = {"$in": dealer_ids}
    tag_ids = options.get("tag_ids") or []
    if isinstance(tag_ids, list) and tag_ids:
        q["tag_ids"] = {"$in": tag_ids}

    tools = await db.tools.find(q, {"_id": 0}).to_list(20000)

    rows: List[Dict[str, Any]] = []
    acquired_rows: List[Dict[str, Any]] = []
    total_acquired_count = 0
    total_sold_count = 0
    total_lost_count = 0
    total_stolen_count = 0
    total_spent = 0.0
    total_recovered = 0.0

    for t in tools:
        base = _normalise_tool_row(t)
        purchase_in_range = in_range(t.get("purchase_date"), start, end)
        sold_in_range = bool(t.get("is_sold")) and in_range(t.get("sold_at"), start, end)
        ls = t.get("lost_status") or {}
        loss_type = (ls.get("type") or "").lower() if isinstance(ls, dict) else ""
        loss_reported = ls.get("reported_at") if isinstance(ls, dict) else None
        lost_in_range = loss_type == "lost" and in_range(loss_reported, start, end)
        stolen_in_range = loss_type == "stolen" and in_range(loss_reported, start, end)

        # Apply event filters
        if not include_sold and sold_in_range:
            sold_in_range = False
        if not include_lost and lost_in_range:
            lost_in_range = False
        if not include_stolen and stolen_in_range:
            stolen_in_range = False

        # A tool can have multiple events in the year — emit one row per event.
        # Acquired
        if purchase_in_range:
            r = dict(base)
            r["ye_status"] = "Acquired"
            r["ye_event_date"] = t.get("purchase_date") or ""
            r["ye_recovered"] = 0
            r["repair_cost"] = 0
            rows.append(r)
            acquired_rows.append(r)
            total_acquired_count += 1
            total_spent += float(r.get("cost") or 0)
        # Sold
        if sold_in_range:
            r = dict(base)
            r["ye_status"] = "Sold"
            r["ye_event_date"] = t.get("sold_at") or ""
            r["ye_recovered"] = float(t.get("sold_price") or 0) * max(int(t.get("quantity") or 1), 1)
            r["cost"] = 0  # don't double-count cost — acquired row handles it
            r["msrp"] = 0  # don't double-count MSRP either
            r["repair_cost"] = 0
            rows.append(r)
            total_sold_count += 1
            total_recovered += float(r.get("ye_recovered") or 0)
        # Lost
        if lost_in_range:
            r = dict(base)
            r["ye_status"] = "Lost"
            r["ye_event_date"] = loss_reported or ""
            r["ye_recovered"] = 0
            r["repair_cost"] = 0
            r["cost"] = 0
            r["msrp"] = 0
            rows.append(r)
            total_lost_count += 1
        # Stolen
        if stolen_in_range:
            r = dict(base)
            r["ye_status"] = "Stolen"
            r["ye_event_date"] = loss_reported or ""
            r["ye_recovered"] = 0
            r["repair_cost"] = 0
            r["cost"] = 0
            r["msrp"] = 0
            rows.append(r)
            total_stolen_count += 1

    # ----- Repair costs from warranty_claims -----
    total_repair_cost = 0.0
    if include_repairs:
        tool_ids = {t["id"] for t in tools if t.get("id")}
        cursor = db.warranty_claims.find(
            {}, {"_id": 0, "id": 1, "tool_id": 1, "tool_name": 1, "tool_photo": 1,
                 "broken_photo": 1, "dealer_name": 1, "repair_company": 1,
                 "repair_cost": 1, "notified_at": 1, "completed_at": 1,
                 "claim_status": 1, "created_at": 1},
        )
        async for c in cursor:
            if c.get("tool_id") and c["tool_id"] not in tool_ids:
                continue  # filtered out by category/location/etc
            event_date = c.get("completed_at") or c.get("notified_at") or c.get("created_at") or ""
            if not in_range(event_date, start, end):
                continue
            cost = float(c.get("repair_cost") or 0)
            tool_lookup = next((tt for tt in tools if tt.get("id") == c.get("tool_id")), {}) or {}
            base = _normalise_tool_row(tool_lookup) if tool_lookup else {
                "name": c.get("tool_name") or "", "photo": "",
                "brand": "", "serial": "", "category": "", "location": "",
                "dealer": c.get("dealer_name") or "", "purchase_date": "", "cost": 0,
            }
            r = dict(base)
            r["ye_status"] = "Repair / Claim"
            r["ye_event_date"] = event_date
            r["ye_recovered"] = 0
            r["repair_cost"] = cost
            r["cost"] = 0  # repairs don't re-count the acquisition cost
            r["msrp"] = 0
            rows.append(r)
            total_repair_cost += cost

    # Sort by event date (oldest first within the year)
    def _key(r: Dict[str, Any]) -> str:
        return r.get("ye_event_date") or ""
    rows.sort(key=_key)

    # Set pricing applied to "Total Spent" (acquisitions only). Year-End stays
    # chronological, so we surface dual sums in the stats rather than regrouping.
    bundles_map = await _load_bundles_map(db)
    mode = (options.get("set_pricing") or "both").strip().lower()
    spent_only, spent_bundles, spent_has_bundles = _bundle_sums(acquired_rows, bundles_map)
    if not spent_has_bundles or mode == "individual":
        spent_stats = [("Total Spent", fmt_money(spent_only), True)]
    elif mode == "bundle":
        spent_stats = [("Total Spent", fmt_money(spent_bundles), True)]
    else:
        spent_stats = [
            ("Spent · Items", fmt_money(spent_only), True),
            ("Spent · +Sets", fmt_money(spent_bundles), True),
        ]

    stats = [
        ("Year", str(year), False),
        ("Acquired", str(total_acquired_count), False),
        ("Sold", str(total_sold_count), False),
        ("Lost / Stolen", str(total_lost_count + total_stolen_count), False),
        *spent_stats,
        ("Total Recovered", fmt_money(total_recovered), True),
    ]
    if include_repairs:
        stats.append(("Repair Cost", fmt_money(total_repair_cost), True))

    return {
        "rows": rows,
        "stats": stats,
        "subtitle": f"Year End Report for {year}  ·  {_date_range_subtitle(start, end)}",
        # Override the PDF title so it includes the year prominently
        "title_override": f"Year End Report for {year}",
    }


REPORTS: Dict[str, ReportSpec] = {
    "insurance": ReportSpec(
        id="insurance",
        title="Insurance Inventory Report",
        description="A formatted inventory of every tool, with values and personal info — for insurance carriers.",
        icon="shield-checkmark",
        accent="#3B82F6",
        columns=_TOOL_COLUMNS,
        default_columns=["photo", "name", "quantity", "brand", "serial", "cost"],
        fetch=_fetch_insurance,
        options_schema=[
            SET_PRICING_OPTION,
            {"id": "include_personal", "type": "toggle",
             "label": "Include personal / address info", "default": True},
            {"id": "include_receipts", "type": "toggle",
             "label": "Append receipts (one page per receipt)",
             "default": False},
        ],
    ),
    "inventory": ReportSpec(
        id="inventory",
        title="Inventory Report",
        description="Full or filtered list of your tools, by location, tag, brand, condition, or date range.",
        icon="cube",
        accent="#F97316",
        columns=_TOOL_COLUMNS,
        default_columns=["photo", "name", "quantity", "brand", "serial", "cost"],
        fetch=_fetch_inventory,
        options_schema=[
            SET_PRICING_OPTION,
            {"id": "location_id", "type": "location", "label": "Location"},
            {"id": "tag_ids", "type": "tag_multi", "label": "Tags"},
            {"id": "brands", "type": "brand_multi", "label": "Brands"},
            {"id": "condition", "type": "select", "label": "Condition",
             "choices": ["", "New", "Like New", "Good", "Fair", "Poor"]},
            {"id": "date_from", "type": "date", "label": "Purchased From"},
            {"id": "date_to", "type": "date", "label": "Purchased To"},
            {"id": "include_receipts", "type": "toggle",
             "label": "Append receipts (one page per receipt)",
             "default": False},
        ],
    ),
    "sales": ReportSpec(
        id="sales",
        title="Sales Report",
        description="Items currently for sale, or items already sold, with prices and dates.",
        icon="pricetag",
        accent="#10B981",
        columns=_SALES_COLUMNS,
        default_columns=["sale_date", "name", "quantity", "brand", "cost", "price"],
        fetch=_fetch_sales,
        options_schema=[
            {"id": "sales_mode", "type": "segmented", "label": "Mode",
             "choices": [
                 {"id": "listed", "label": "For Sale"},
                 {"id": "sold", "label": "Sold"},
             ],
             "default": "listed"},
            {"id": "sales_layout", "type": "segmented", "label": "Layout",
             "choices": [
                 {"id": "table", "label": "Table"},
                 {"id": "per_item", "label": "1 Page Per Item"},
             ],
             "default": "table"},
            {"id": "date_from", "type": "date", "label": "From"},
            {"id": "date_to", "type": "date", "label": "To"},
            {"id": "include_receipts", "type": "toggle",
             "label": "Append receipts (one page per receipt)",
             "default": False},
        ],
    ),
    "account": ReportSpec(
        id="account",
        title="Dealer Account Report",
        description="Per-dealer balances, payments and new charges across both Credit and Truck accounts.",
        icon="wallet",
        accent="#8B5CF6",
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
    "claims": ReportSpec(
        id="claims",
        title="Warranty Claims Report",
        description="Open and historical warranty / repair claims, filterable by dealer and date range. Grouped by dealer (newest first).",
        icon="construct",
        accent="#EF4444",
        columns=[
            Column("claim_photo", "Photo", "center", "image"),
            Column("notified_at", "Notified", "left", "date"),
            Column("tool_name", "Tool", "left", "text"),
            Column("serial", "Model #", "left", "text"),
            Column("dealer", "Dealer", "left", "text"),
            Column("status", "Status", "left", "text"),
            Column("repair_company", "Repair Co.", "left", "text"),
            Column("contact", "Contact", "left", "text"),
            Column("expected_completion", "Expected", "left", "date"),
            Column("completed_at", "Completed", "left", "date"),
            Column("created_at", "Opened", "left", "date"),
            Column("notes", "Notes", "left", "text"),
            # Repair/replacement cost — money column so PDF auto-renders
            # TOTAL row. Default OFF so the column only appears when the
            # user toggles it on in the wizard.
            Column("repair_cost", "Repair Cost", "right", "money"),
        ],
        default_columns=["notified_at", "tool_name", "serial", "dealer", "status", "notes"],
        fetch=_fetch_claims,
        options_schema=[
            {"id": "claims_mode", "type": "segmented", "label": "Mode",
             "choices": [
                 {"id": "current", "label": "Current"},
                 {"id": "history", "label": "History"},
                 {"id": "all", "label": "All"},
             ],
             "default": "current"},
            {"id": "dealer_ids", "type": "dealer_multi", "label": "Dealers"},
            {"id": "date_from", "type": "date", "label": "From"},
            {"id": "date_to", "type": "date", "label": "To"},
        ],
    ),
    "repair_costs": ReportSpec(
        id="repair_costs",
        title="Repair / Replacement Cost Report",
        description="Out-of-pocket repair and replacement costs across all warranty claims. Includes a running TOTAL.",
        icon="cash",
        accent="#16A34A",
        columns=[
            Column("claim_photo", "Photo", "center", "image"),
            Column("notified_at", "Notified", "left", "date"),
            Column("tool_name", "Tool", "left", "text"),
            Column("serial", "Model #", "left", "text"),
            Column("dealer", "Dealer", "left", "text"),
            Column("repair_company", "Repair Co.", "left", "text"),
            Column("status", "Status", "left", "text"),
            Column("completed_at", "Completed", "left", "date"),
            Column("notes", "Notes", "left", "text"),
            Column("repair_cost", "Repair Cost", "right", "money"),
        ],
        default_columns=["notified_at", "tool_name", "serial", "dealer", "status", "repair_cost"],
        fetch=_fetch_repair_costs,
        options_schema=[
            {"id": "claims_mode", "type": "segmented", "label": "Mode",
             "choices": [
                 {"id": "current", "label": "Current"},
                 {"id": "history", "label": "History"},
                 {"id": "all", "label": "All"},
             ],
             "default": "all"},
            {"id": "dealer_ids", "type": "dealer_multi", "label": "Dealers"},
            {"id": "only_paid", "type": "toggle",
             "label": "Only repairs with a cost", "default": False},
            {"id": "date_from", "type": "date", "label": "From"},
            {"id": "date_to", "type": "date", "label": "To"},
        ],
    ),
    "year_end": ReportSpec(
        id="year_end",
        title="Year End Report",
        description="Annual snapshot — tools acquired, sold, lost, stolen, and repaired in the selected year. Optionally fine-tune the date range.",
        icon="calendar",
        accent="#0EA5E9",
        columns=[
            Column("photo", "Photo", "center", "image"),
            Column("name", "Tool", "left", "text"),
            Column("brand", "Brand", "left", "text"),
            Column("serial", "Model #", "left", "text"),
            Column("category", "Category", "left", "text"),
            Column("location", "Location", "left", "text"),
            Column("dealer", "Dealer", "left", "text"),
            Column("purchase_date", "Acquired", "left", "date"),
            Column("ye_status", "Status", "left", "text"),
            Column("ye_event_date", "Event Date", "left", "date"),
            Column("cost", "Cost", "right", "money"),
            Column("msrp", "MSRP", "right", "money"),
            Column("ye_recovered", "Recovered", "right", "money"),
            Column("repair_cost", "Repair Cost", "right", "money"),
        ],
        default_columns=["name", "serial", "purchase_date", "ye_status", "ye_event_date", "cost", "ye_recovered"],
        fetch=_fetch_year_end,
        options_schema=[
            SET_PRICING_OPTION,
            # The "year" choice list is injected dynamically per-user
            # (see make_reports_router → reports_spec) so users only see
            # years where they actually have data.
            {"id": "year", "type": "select", "label": "Year",
             "choices": [], "default": ""},
            {"id": "date_from", "type": "date", "label": "Custom From (optional)"},
            {"id": "date_to", "type": "date", "label": "Custom To (optional)"},
            {"id": "include_sold", "type": "toggle",
             "label": "Include sold items", "default": True},
            {"id": "include_lost", "type": "toggle",
             "label": "Include lost items", "default": True},
            {"id": "include_stolen", "type": "toggle",
             "label": "Include stolen items", "default": True},
            {"id": "include_repairs", "type": "toggle",
             "label": "Include repair costs", "default": True},
            {"id": "location_id", "type": "location", "label": "Location"},
            {"id": "category_ids", "type": "category_multi", "label": "Categories"},
            {"id": "dealer_ids", "type": "dealer_multi", "label": "Dealers"},
            {"id": "tag_ids", "type": "tag_multi", "label": "Tags"},
        ],
    ),
    "checked_out": ReportSpec(
        id="checked_out",
        title="Checked-Out Items Report",
        description="Tools that are (or were) signed out to borrowers. Filter by date range, location, tags, dealer, and one or more people.",
        icon="people",
        accent="#EAB308",
        columns=_CHECKED_OUT_COLUMNS,
        default_columns=["photo", "name", "serial", "borrower_name", "checked_out_at", "checked_in_at", "days_out", "checkout_status"],
        fetch=_fetch_checked_out,
        options_schema=[
            {"id": "status", "type": "segmented", "label": "Status",
             "choices": [
                 {"id": "current", "label": "Still Out"},
                 {"id": "returned", "label": "Returned"},
                 {"id": "both", "label": "Both"},
             ],
             "default": "current"},
            {"id": "borrower_ids", "type": "borrower_multi", "label": "People"},
            {"id": "location_id", "type": "location", "label": "Location"},
            {"id": "tag_ids", "type": "tag_multi", "label": "Tags"},
            {"id": "category_ids", "type": "category_multi", "label": "Categories"},
            {"id": "dealer_ids", "type": "dealer_multi", "label": "Dealers"},
            {"id": "date_from", "type": "date", "label": "Checked Out From"},
            {"id": "date_to", "type": "date", "label": "Checked Out To"},
        ],
    ),
    "lost_stolen": ReportSpec(
        id="lost_stolen",
        title="Lost / Stolen Items Report",
        description="Items reported lost or stolen, with police-report and insurance details. Recovered items are excluded unless you toggle them on.",
        icon="alert-circle",
        accent="#DB2777",
        columns=_LOST_STOLEN_COLUMNS,
        default_columns=["photo", "name", "serial", "loss_type", "reported_date", "police_report", "insurance_claim", "cost"],
        fetch=_fetch_lost_stolen,
        options_schema=[
            {"id": "type", "type": "segmented", "label": "Type",
             "choices": [
                 {"id": "lost", "label": "Lost"},
                 {"id": "stolen", "label": "Stolen"},
                 {"id": "both", "label": "Both"},
             ],
             "default": "both"},
            {"id": "location_id", "type": "location", "label": "Last Location"},
            {"id": "tag_ids", "type": "tag_multi", "label": "Tags"},
            {"id": "category_ids", "type": "category_multi", "label": "Categories"},
            {"id": "dealer_ids", "type": "dealer_multi", "label": "Dealers"},
            {"id": "price_min", "type": "number", "label": "Min Unit Value"},
            {"id": "price_max", "type": "number", "label": "Max Unit Value"},
            {"id": "date_from", "type": "date", "label": "Reported From"},
            {"id": "date_to", "type": "date", "label": "Reported To"},
            {"id": "include_recovered", "type": "toggle",
             "label": "Include recovered items", "default": False},
        ],
    ),
}


# ---------------------------------------------------------------------------
# FastAPI router
# ---------------------------------------------------------------------------

def make_reports_router(api_router: APIRouter, get_db, get_current_user) -> None:
    @api_router.get("/reports/spec")
    async def reports_spec(user=Depends(get_current_user)):
        # Compute available years for the year_end report's year picker so
        # users only see years where they actually have data.
        db = get_db()
        years = await _compute_available_years(db)
        out = []
        for spec in REPORTS.values():
            d = spec.to_dict()
            if spec.id == "year_end":
                for opt in d.get("options_schema") or []:
                    if opt.get("id") == "year":
                        if years:
                            opt["choices"] = [
                                {"id": str(y), "label": str(y)} for y in years
                            ]
                            opt["default"] = str(years[0])
                        else:
                            # No data yet — fall back to current year only.
                            cur = datetime.now().year
                            opt["choices"] = [{"id": str(cur), "label": str(cur)}]
                            opt["default"] = str(cur)
            out.append(d)
        return {"reports": out}

    @api_router.get("/reports/filter-options")
    async def reports_filter_options(user=Depends(get_current_user)):
        """Return dropdown choices for tag/brand filters."""
        db = get_db()
        # Distinct brand strings from existing tools (case-preserving).
        tools = await db.tools.find(
            {}, {"_id": 0, "brand": 1}
        ).to_list(20000)
        brands = sorted(
            {(t.get("brand") or "").strip() for t in tools if (t.get("brand") or "").strip()},
            key=lambda s: s.lower(),
        )
        tags = await db.tags.find({}, {"_id": 0}).to_list(2000)
        tags_min = [{"id": t.get("id"), "name": t.get("name")} for t in tags if t.get("id")]
        tags_min.sort(key=lambda x: (x.get("name") or "").lower())
        return {"brands": brands, "tags": tags_min}

    @api_router.post("/reports/render")
    async def reports_render(payload: Dict[str, Any] = Body(...),
                             user=Depends(get_current_user)):
        # Rate limit: 20 reports per user per hour (protect server CPU).
        from server import _enforce_rate_limit  # local import to avoid cycle
        _enforce_rate_limit(
            "reports.render",
            user.id,
            max_count=20,
            window_seconds=3600,
            message="You have generated a lot of reports in the last hour. "
            "Please wait a bit before generating more.",
        )
        rt = payload.get("report_type") or ""
        spec = REPORTS.get(rt)
        if not spec:
            raise HTTPException(400, f"Unknown report type: {rt!r}")

        fmt = (payload.get("format") or "pdf").lower()
        if fmt not in ("pdf", "csv"):
            raise HTTPException(400, "format must be 'pdf' or 'csv'")

        chosen_ids = payload.get("columns") or spec.default_columns
        col_map = {c.id: c for c in spec.columns}
        cols = [col_map[i] for i in chosen_ids if i in col_map]
        if not cols:
            cols = [col_map[i] for i in spec.default_columns if i in col_map]
        if fmt == "pdf" and len(cols) > 6:
            cols = cols[:6]

        options = payload.get("options") or {}
        db = get_db()
        result = await spec.fetch(db, user, options)

        # Every report carries the owner's letterhead (name/address/contact)
        # at the top when available. Fetchers that manage their own personal
        # block (e.g. insurance, with an opt-out) set the key themselves and
        # are left untouched.
        if "personal_info" not in result:
            profile = await db.personal_profile.find_one(
                {"id": "self"}, {"_id": 0}
            ) or {}
            if profile.get("name"):
                result["personal_info"] = profile

        filename_base = f"{spec.id}-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        if fmt == "csv":
            data = render_csv(cols, result.get("rows") or [])
            return Response(
                content=data, media_type="text/csv",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename_base}.csv"',
                    "Cache-Control": "no-store",
                },
            )

        try:
            pdf_bytes = render_pdf(spec, cols, result)
        except Exception as e:  # surface useful error to client
            raise HTTPException(500, f"PDF generation failed: {e}")
        return Response(
            content=pdf_bytes, media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename_base}.pdf"',
                "Cache-Control": "no-store",
            },
        )
