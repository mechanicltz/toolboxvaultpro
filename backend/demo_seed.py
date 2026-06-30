"""
Demo / prefilled-data system.

On registration we seed a brand-new account with a rich, realistic dataset so
the user can immediately explore every part of the app. Every record we create
is tagged `is_demo: True` (or, for the shared default dealers we *enrich*,
`is_demo_enriched: True`) so it can be wiped cleanly later.

The user is shown a one-time intro popup + a persistent banner until they remove
the data from the Account screen. Removal offers two modes:
  • "everything"      — wipe demo data AND the taxonomy (dealers / locations /
                        tags / categories) to start from a blank app.
  • "keep_taxonomy"   — wipe only the demo transactional data; keep dealers,
                        locations, tags & categories (dealers reset to clean).

All writes go to `real_db` directly (bypassing the owner-scoped proxy) so we
MUST set `owner_id` ourselves on every document.
"""
from __future__ import annotations

import base64
import io
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

try:
    from PIL import Image, ImageDraw, ImageFont
    _PIL = True
except Exception:  # pragma: no cover
    _PIL = False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid() -> str:
    return str(uuid.uuid4())


_TODAY = datetime.now(timezone.utc).date()


def _days_ago(n: int) -> str:
    return (_TODAY - timedelta(days=n)).isoformat()


def _days_ahead(n: int) -> str:
    return (_TODAY + timedelta(days=n)).isoformat()


# ---------------------------------------------------------------------------
# Clipart tile generator — small, self-contained PNGs so item/photo/logo slots
# are populated and always render (no external assets / network needed).
# ---------------------------------------------------------------------------
_PALETTE = [
    (210, 73, 42), (37, 99, 110), (92, 107, 122), (181, 137, 38),
    (76, 110, 73), (120, 67, 110), (44, 62, 96), (150, 60, 60),
]


def _tile(label: str, idx: int = 0, sub: str = "") -> str:
    """Return a data-URI PNG: a coloured card with a short label — a simple
    'clipart' placeholder showing where a real photo would go."""
    if not _PIL:
        return ""
    w, h = 320, 240
    bg = _PALETTE[idx % len(_PALETTE)]
    img = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(img)
    # subtle frame
    d.rectangle([8, 8, w - 9, h - 9], outline=(255, 255, 255), width=3)
    # darker plate behind text
    d.rectangle([0, h - 84, w, h], fill=(0, 0, 0))
    try:
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26)
        sfont = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
    except Exception:
        font = ImageFont.load_default()
        sfont = ImageFont.load_default()

    text = (label or "ITEM").upper()
    if len(text) > 22:
        text = text[:21] + "…"
    tb = d.textbbox((0, 0), text, font=font)
    d.text(((w - (tb[2] - tb[0])) / 2, h - 68), text, fill=(255, 255, 255), font=font)
    if sub:
        sb = d.textbbox((0, 0), sub, font=sfont)
        d.text(((w - (sb[2] - sb[0])) / 2, h - 32), sub, fill=(200, 200, 200), font=sfont)
    # a little wrench/box glyph up top
    d.ellipse([w / 2 - 34, 50, w / 2 + 34, 118], outline=(255, 255, 255), width=5)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _warranty(provider: str, months: int = 0, lifetime: bool = False,
              start: str = "", expiry: str = "") -> Dict[str, Any]:
    return {
        "has_warranty": True,
        "provider": provider,
        "contact": "",
        "terms": "Lifetime replacement warranty" if lifetime else f"{months}-month manufacturer warranty",
        "length_months": months,
        "coverage_type": "lifetime" if lifetime else "months",
        "start_date": start,
        "expiry_date": "" if lifetime else expiry,
        "document": None,
    }


# ===========================================================================
# SEED
# ===========================================================================
async def seed_demo_data_for_user(real_db, user_id: str) -> Dict[str, int]:
    """Seed the full demo dataset. Idempotent — skips if already seeded."""
    udoc = await real_db.users.find_one({"id": user_id}, {"_id": 0, "demo_seeded": 1})
    if udoc and udoc.get("demo_seeded"):
        return {"skipped": 1}

    counters: Dict[str, int] = {}

    # --- Resolve taxonomy seeded by seed_default_content_for_user() ---------
    dealers = await real_db.dealers.find({"owner_id": user_id}, {"_id": 0}).to_list(100)
    by_dealer = {d["name"]: d for d in dealers}
    tags = await real_db.tags.find({"owner_id": user_id}, {"_id": 0}).to_list(100)
    by_tag = {t["name"].lower(): t for t in tags}
    cats = await real_db.categories.find({"owner_id": user_id}, {"_id": 0}).to_list(100)
    by_cat = {c["name"].lower(): c for c in cats}
    locs = await real_db.locations.find({"owner_id": user_id}, {"_id": 0}).to_list(200)

    def dealer(name: str) -> Tuple[Optional[str], str]:
        d = by_dealer.get(name)
        return (d["id"], d["name"]) if d else (None, name)

    def cat(name: str) -> Tuple[Optional[str], str]:
        c = by_cat.get(name.lower())
        return (c["id"], c["name"]) if c else (None, name)

    def tagset(*names: str) -> Tuple[List[str], List[str]]:
        ids, labels = [], []
        for n in names:
            t = by_tag.get(n.lower())
            if t:
                ids.append(t["id"]); labels.append(t["name"])
        return ids, labels

    def location(parent_name: str, child_name: str) -> Tuple[Optional[str], str]:
        parent = next((l for l in locs if l["name"].lower() == parent_name.lower()
                       and not l.get("parent_id")), None)
        if not parent:
            return (None, "")
        child = next((l for l in locs if l.get("parent_id") == parent["id"]
                      and l["name"].lower() == child_name.lower()), None)
        if child:
            return (child["id"], f"{parent_name} › {child_name}")
        return (parent["id"], parent_name)

    main_drawer = location("Main Toolbox", "Drawer 1")
    home_drawer = location("Home Toolbox", "Drawer 1")

    # --- Borrowers (contacts) ----------------------------------------------
    borrowers = [
        {"id": _uid(), "name": "Mike Johnson", "contact": "(713) 555-0142",
         "notes": "Coworker — usually borrows hand tools."},
        {"id": _uid(), "name": "Sarah Lee", "contact": "(713) 555-0188",
         "notes": "Neighbor, very reliable."},
        {"id": _uid(), "name": "Dave Martinez", "contact": "(281) 555-0163",
         "notes": "Bought my old cordless drill."},
    ]
    for b in borrowers:
        b.update({"owner_id": user_id, "is_demo": True, "created_at": _now()})
    await real_db.borrowers.insert_many(borrowers)
    counters["borrowers"] = len(borrowers)

    # --- Set (v3.2 model: a Set is a tool with is_bundle=True; its socket
    # items below link to it as expansion items) ----------------------------
    bundle_id = _uid()

    # --- 15 inventory items (covers every app feature) ----------------------
    sd, sm = dealer("Snap-on Tools")
    md, mm = dealer("Matco Tools")
    cd, cm = dealer("Mac Tools")
    od, om = dealer("Cornwell Tools")
    hd, hm = dealer("Harbor Freight")

    def base(name: str, **kw) -> Dict[str, Any]:
        t = {
            "id": _uid(), "owner_id": user_id, "is_demo": True, "name": name,
            "description": "", "brand": "", "model": "", "serial_number": "",
            "model_numbers": [], "serial_numbers": [], "is_set": False,
            "set_serials": [], "bundle_id": None, "cost": 0.0, "msrp_price": 0.0,
            "quantity": 1, "purchase_date": "", "condition": "Good",
            "location_id": main_drawer[0], "location_name": main_drawer[1],
            "category_id": None, "category_name": "", "tag_ids": [], "tag_names": [],
            "photos": [], "documents": [], "receipts": [],
            "is_consumable": False, "consumable_info": None, "needs_repair": False,
            "repair_info": None, "warranty": None,
            "dealer_id": None, "dealer_name": "",
            "purchased_from_agent_id": None, "purchased_from_agent_name": "",
            "is_checked_out": False, "current_checkout": None, "checkout_history": [],
            "maintenance": [], "lost_status": None,
            "for_sale": False, "sale_price": 0.0, "sale_listed_at": "", "sale_notes": "",
            "is_sold": False, "sold_at": "", "sold_price": 0.0, "sold_to": "", "sold_notes": "",
            "created_at": _now(), "updated_at": _now(),
        }
        ci, cn = kw.pop("_cat", (None, ""))
        ti, tn = kw.pop("_tags", ([], []))
        di, dn = kw.pop("_dealer", (None, ""))
        t["category_id"], t["category_name"] = ci, cn
        t["tag_ids"], t["tag_names"] = ti, tn
        t["dealer_id"], t["dealer_name"] = di, dn
        t.update(kw)
        return t

    tools: List[Dict[str, Any]] = []
    i = 0

    def add(t):
        nonlocal i
        i += 1
        tools.append(t)
        return t

    # Set container tool (is_bundle). Uses the pre-generated bundle_id so the
    # three socket items below can link to it as expansion items.
    add(base(
        "Master Socket Set", id=bundle_id, is_bundle=True, part_number="SNP-MSS-40",
        model_numbers=["SNP-MSS-40"], cost=379.0,
        notes="3/8\" drive chrome set — ratchet, sockets & extensions.",
        photos=[_tile("Master Socket Set", 1, "40-piece set")],
        _cat=cat("Hand Tools"), _tags=tagset("Hand tools"), _dealer=(sd, sm),
    ))
    counters["bundles"] = 1

    # 1-3: socket set items (linked to the set above as expansion items)
    t1 = add(base(
        "1/2\" Drive Ratchet", brand="Snap-on", model="F80",
        model_numbers=["F80"], serial_numbers=["SN-RT-10231"],
        description="72-tooth flank-drive sealed-head ratchet.",
        cost=165.0, msrp_price=189.0, purchase_date=_days_ago(420),
        condition="Excellent", expansion_of=bundle_id,
        _cat=cat("Hand Tools"), _tags=tagset("Hand tools"), _dealer=(sd, sm),
        warranty=_warranty("Snap-on Tools", lifetime=True, start=_days_ago(420)),
        photos=[_tile("Ratchet", 0)], receipts=[_tile("RECEIPT", 2, "Snap-on")],
    ))
    t2 = add(base(
        "Socket Set 6pc (3/8\")", brand="Snap-on", model="210FSET",
        model_numbers=["210FSET"], description="3/8\" drive shallow sockets, 6 pieces.",
        cost=149.0, msrp_price=170.0, purchase_date=_days_ago(420),
        expansion_of=bundle_id, _cat=cat("Hand Tools"), _tags=tagset("Hand tools"),
        _dealer=(sd, sm), warranty=_warranty("Snap-on Tools", lifetime=True),
        photos=[_tile("Socket Set", 4)],
    ))
    t3 = add(base(
        "Extension Bar Set", brand="Snap-on", model="TMX3A",
        model_numbers=["TMX3A"], description="3/8\" drive extension bars (3, 6, 11 in).",
        cost=65.0, msrp_price=78.0, purchase_date=_days_ago(420),
        expansion_of=bundle_id, _cat=cat("Hand Tools"), _tags=tagset("Hand tools"),
        _dealer=(sd, sm), warranty=_warranty("Snap-on Tools", lifetime=True),
        photos=[_tile("Extension Bars", 5)],
    ))

    # 4: checked out + warranty expiring soon
    t4 = add(base(
        "M18 FUEL Impact Driver", brand="Milwaukee", model="2953-20",
        model_numbers=["2953-20"], serial_numbers=["MW-2953-77412"],
        description="18V brushless 1/4\" hex impact driver (tool only).",
        cost=199.0, msrp_price=229.0, purchase_date=_days_ago(300),
        location_id=home_drawer[0], location_name=home_drawer[1],
        _cat=cat("Power Tools"), _tags=tagset("Power tools"), _dealer=(md, mm),
        warranty=_warranty("Milwaukee", months=60, start=_days_ago(300),
                           expiry=_days_ahead(25)),
        is_checked_out=True,
        current_checkout={
            "id": _uid(), "borrower_name": "Mike Johnson",
            "borrower_id": borrowers[0]["id"], "borrower_phone": "(713) 555-0142",
            "checked_out_at": _now(), "checked_in_at": None,
            "notes": "Borrowed for a brake job — back next week.",
        },
        photos=[_tile("Impact Driver", 1)], receipts=[_tile("RECEIPT", 2, "Matco")],
    ))

    # 5: broken + OPEN warranty claim
    t5 = add(base(
        "1/2\" Air Impact Wrench", brand="Mac Tools", model="AW434Q",
        model_numbers=["AW434Q"], serial_numbers=["MAC-AW-55810"],
        description="1/2\" drive pneumatic impact, 1200 ft-lb.",
        cost=249.0, msrp_price=289.0, purchase_date=_days_ago(210),
        condition="Needs Repair", _cat=cat("Pneumatic Tools"),
        _tags=tagset("Pneumatic tools"), _dealer=(cd, cm),
        warranty=_warranty("Mac Tools", months=24, start=_days_ago(210),
                           expiry=_days_ahead(180)),
        needs_repair=True,
        repair_info={
            "company_notified": "Mac Tools", "notified_at": _days_ago(6),
            "expected_completion": _days_ahead(10), "repair_status": "Reported",
            "contact": "", "notes": "Anvil sticking, low power. Sent to dealer.",
            "broken_photo": _tile("BROKEN", 6, "anvil stuck"), "repair_cost": 0.0,
        },
        photos=[_tile("Air Impact", 3)],
    ))

    # 6: calibration due + COMPLETED warranty claim history
    t6 = add(base(
        "Digital Multimeter", brand="Fluke", model="87V",
        model_numbers=["87V"], serial_numbers=["FLK-87V-31002"],
        description="True-RMS industrial multimeter.",
        cost=425.0, msrp_price=479.0, purchase_date=_days_ago(500),
        _cat=cat("Specialty Service"), _tags=tagset("Power tools"), _dealer=(od, om),
        warranty=_warranty("Cornwell Tools", months=36, start=_days_ago(500),
                           expiry=_days_ahead(40)),
        maintenance=[{
            "id": _uid(), "type": "Calibration", "interval_months": 12,
            "last_done_date": _days_ago(400), "next_due_date": _days_ago(35),
            "notes": "Annual NIST calibration.", "history": [{
                "id": _uid(), "date": _days_ago(400), "cost": 65.0,
                "technician": "CalLab Houston", "notes": "Passed.", "created_at": _now(),
            }], "created_at": _now(),
        }],
        photos=[_tile("Multimeter", 2)],
    ))

    # 7: for sale
    t7 = add(base(
        "3-Ton Low-Profile Floor Jack", brand="Pittsburgh", model="64552",
        model_numbers=["64552"], description="Rapid-pump 3-ton aluminum/steel jack.",
        cost=180.0, msrp_price=199.0, purchase_date=_days_ago(260),
        location_id=home_drawer[0], location_name=home_drawer[1],
        _cat=cat("Specialty Service"), _dealer=(hd, hm),
        for_sale=True, sale_price=120.0, sale_listed_at=_days_ago(12),
        sale_notes="Upgraded to a bigger jack — works perfectly.",
        photos=[_tile("Floor Jack", 7)],
    ))

    # 8: LOST
    t8 = add(base(
        "9\" Angle Grinder", brand="DeWalt", model="DWE402",
        model_numbers=["DWE402"], serial_numbers=["DW-402-90188"],
        description="11-amp 4-1/2\" angle grinder.",
        cost=99.0, msrp_price=119.0, purchase_date=_days_ago(330),
        _cat=cat("Power Tools"), _tags=tagset("Power tools"), _dealer=(md, mm),
        lost_status={
            "is_lost": True, "type": "lost", "reported_date": _days_ago(20),
            "police_report_number": "", "insurance_company": "",
            "insurance_claim_number": "", "reported_by": "Owner",
            "notes": "Left at a job site — never recovered.", "recovered_at": None,
        },
        photos=[_tile("Angle Grinder", 4)],
    ))

    # 9: STOLEN (in insurance claim)
    t9 = add(base(
        "1/2\" Torque Wrench", brand="Snap-on", model="ATECH3FR250",
        model_numbers=["ATECH3FR250"], serial_numbers=["SN-TQ-44120"],
        description="Flex-head digital torque wrench, 12.5–250 ft-lb.",
        cost=320.0, msrp_price=360.0, purchase_date=_days_ago(380),
        _cat=cat("Hand Tools"), _tags=tagset("Hand tools"), _dealer=(sd, sm),
        lost_status={
            "is_lost": True, "type": "stolen", "reported_date": _days_ago(39),
            "police_report_number": "HPD-2025-99812",
            "insurance_company": "Acme Mutual Insurance",
            "insurance_claim_number": "CLM-2025-04417", "reported_by": "Owner",
            "notes": "Stolen in truck break-in.", "recovered_at": None,
        },
        photos=[_tile("Torque Wrench", 0)],
    ))

    # 10: maintenance (inspection) due + lifetime warranty
    t10 = add(base(
        "Brake Caliper Tool Kit", brand="OEMTOOLS", model="27108",
        model_numbers=["27108"], description="Disc brake caliper wind-back kit, 24 pc.",
        cost=89.0, msrp_price=99.0, purchase_date=_days_ago(150),
        _cat=cat("Specialty Service"), _dealer=(hd, hm),
        warranty=_warranty("Harbor Freight", lifetime=True),
        maintenance=[{
            "id": _uid(), "type": "Inspection", "interval_months": 6,
            "last_done_date": _days_ago(210), "next_due_date": _days_ago(28),
            "notes": "Check adapters for wear.", "history": [], "created_at": _now(),
        }],
        photos=[_tile("Caliper Kit", 5)],
    ))

    # 11: consumable, low stock
    t11 = add(base(
        "Blue Shop Towels (200 ct)", brand="Scott", model="75130",
        description="Disposable shop towels.", cost=24.0, quantity=2,
        location_id=home_drawer[0], location_name=home_drawer[1],
        _cat=cat("Specialty Service"), _dealer=(hd, hm),
        is_consumable=True, consumable_info={
            "store_name": "Harbor Freight", "website": "www.harborfreight.com",
            "sku": "75130", "notes": "Reorder when down to 1 box.",
        },
        photos=[_tile("Shop Towels", 1)],
    ))

    # 12: normal hand/timing tool
    t12 = add(base(
        "Inductive Timing Light", brand="Innova", model="3551",
        model_numbers=["3551"], serial_numbers=["INV-3551-7741"],
        description="Pro inductive timing light w/ advance.",
        cost=75.0, msrp_price=89.0, purchase_date=_days_ago(190),
        _cat=cat("Timing"), _dealer=(od, om),
        warranty=_warranty("Cornwell Tools", months=12, start=_days_ago(190),
                           expiry=_days_ahead(160)),
        photos=[_tile("Timing Light", 7)],
    ))

    # 13: SOLD
    t13 = add(base(
        "20V Cordless Drill", brand="DeWalt", model="DCD771",
        model_numbers=["DCD771"], serial_numbers=["DW-771-22019"],
        description="Compact 1/2\" cordless drill/driver.",
        cost=129.0, msrp_price=149.0, purchase_date=_days_ago(600),
        _cat=cat("Power Tools"), _tags=tagset("Power tools"), _dealer=(md, mm),
        is_sold=True, sold_at=_days_ago(15), sold_price=95.0,
        sold_to="Dave Martinez", sold_notes="Sold to a coworker, cash.",
        photos=[_tile("Cordless Drill", 3)],
    ))

    # 14: warranty alert (expiring ~48 days)
    t14 = add(base(
        "3/8\" Air Ratchet", brand="Matco", model="MT1838",
        model_numbers=["MT1838"], serial_numbers=["MAT-1838-6620"],
        description="3/8\" drive pneumatic ratchet, 65 ft-lb.",
        cost=159.0, msrp_price=179.0, purchase_date=_days_ago(330),
        _cat=cat("Pneumatic Tools"), _tags=tagset("Pneumatic tools"), _dealer=(md, mm),
        warranty=_warranty("Matco Tools", months=12, start=_days_ago(330),
                           expiry=_days_ahead(48)),
        photos=[_tile("Air Ratchet", 6)],
    ))

    # 15: high-value scanner — STOLEN (insurance claim) + maintenance + document
    t15 = add(base(
        "OBD2 Diagnostic Scanner", brand="Autel", model="MaxiCOM MK808",
        model_numbers=["MK808"], serial_numbers=["AUT-MK808-10277"],
        description="Full-system bi-directional diagnostic scan tool.",
        cost=899.0, msrp_price=999.0, purchase_date=_days_ago(220),
        _cat=cat("Specialty Service"), _tags=tagset("Power tools"), _dealer=(od, om),
        warranty=_warranty("Cornwell Tools", months=12, start=_days_ago(220),
                           expiry=_days_ahead(120)),
        lost_status={
            "is_lost": True, "type": "stolen", "reported_date": _days_ago(39),
            "police_report_number": "HPD-2025-99812",
            "insurance_company": "Acme Mutual Insurance",
            "insurance_claim_number": "CLM-2025-04417", "reported_by": "Owner",
            "notes": "Stolen in truck break-in.", "recovered_at": None,
        },
        maintenance=[{
            "id": _uid(), "type": "Service", "interval_months": 12,
            "last_done_date": _days_ago(220), "next_due_date": _days_ahead(145),
            "notes": "Annual software subscription renewal.", "history": [],
            "created_at": _now(),
        }],
        documents=[{
            "id": _uid(), "name": "MK808 User Manual.pdf",
            "data": base64.b64encode(b"%PDF-1.4 demo manual placeholder").decode(),
            "mime_type": "application/pdf", "size": 32, "uploaded_at": _now(),
        }],
        photos=[_tile("Scan Tool", 2)],
    ))

    await real_db.tools.insert_many(tools)
    counters["tools"] = len(tools)

    # --- Warranty claims (open + completed history) -------------------------
    wclaims = [
        {  # OPEN
            "id": _uid(), "owner_id": user_id, "is_demo": True,
            "tool_id": t5["id"], "tool_name": t5["name"],
            "tool_photo": t5["photos"][0] if t5["photos"] else None,
            "broken_photo": _tile("BROKEN", 6, "anvil stuck"),
            "dealer_id": cd, "dealer_name": cm, "repair_company": "Mac Tools",
            "contact": "1-800-622-8665", "notified_at": _days_ago(6),
            "expected_completion": _days_ahead(10), "claim_status": "awaiting_approval",
            "notes": "Distributor submitted for warranty replacement.",
            "repair_cost": 0.0, "created_at": _days_ago(6), "updated_at": _now(),
            "completed_at": None,
        },
        {  # COMPLETED
            "id": _uid(), "owner_id": user_id, "is_demo": True,
            "tool_id": t6["id"], "tool_name": t6["name"],
            "tool_photo": t6["photos"][0] if t6["photos"] else None,
            "broken_photo": "", "dealer_id": od, "dealer_name": om,
            "repair_company": "Cornwell Tools", "contact": "1-800-321-8356",
            "notified_at": _days_ago(120), "expected_completion": _days_ago(95),
            "claim_status": "completed", "notes": "Replaced under warranty — no charge.",
            "repair_cost": 0.0, "created_at": _days_ago(120),
            "updated_at": _days_ago(90), "completed_at": _days_ago(90),
        },
        {  # COMPLETED (older)
            "id": _uid(), "owner_id": user_id, "is_demo": True,
            "tool_id": t1["id"], "tool_name": t1["name"],
            "tool_photo": t1["photos"][0] if t1["photos"] else None,
            "broken_photo": "", "dealer_id": sd, "dealer_name": sm,
            "repair_company": "Snap-on Tools", "contact": "1-877-762-7664",
            "notified_at": _days_ago(300), "expected_completion": _days_ago(280),
            "claim_status": "completed", "notes": "Ratchet rebuild kit — free under lifetime warranty.",
            "repair_cost": 0.0, "created_at": _days_ago(300),
            "updated_at": _days_ago(278), "completed_at": _days_ago(278),
        },
    ]
    await real_db.warranty_claims.insert_many(wclaims)
    counters["warranty_claims"] = len(wclaims)

    # --- Insurance claim (completed/Paid) + evidence ------------------------
    claim_id = _uid()
    claim = {
        "id": claim_id, "owner_id": user_id, "is_demo": True,
        "title": "Truck Break-In — Stolen Tools", "claim_type": "Theft",
        "status": "Paid",
        "insurance": {
            "company": "Acme Mutual Insurance", "policy_number": "AMI-884213",
            "agent_name": "Linda Park", "agent_phone": "(800) 555-0110",
            "agent_email": "lpark@acmemutual.example",
            "adjuster_name": "Robert Hale", "adjuster_phone": "(800) 555-0177",
            "adjuster_email": "rhale@acmemutual.example",
            "portal_url": "https://claims.acmemutual.example",
        },
        "claim_number": "CLM-2025-04417", "date_of_loss": _days_ago(40),
        "date_discovered": _days_ago(39),
        "description": "Service truck was broken into overnight; tool drawers pried open.",
        "incident_notes": "Filed police report the same morning. Two high-value tools taken.",
        "loss_location": "Job site parking lot, Houston, TX",
        "police_report_number": "HPD-2025-99812", "case_number": "",
        "additional_notes": "Receipts and photos provided to adjuster.",
        "deductible": 250.0, "coverage_limit": 5000.0, "depreciation": 120.0,
        "sales_tax": 0.0, "shipping_costs": 0.0, "labor_costs": 0.0, "repair_costs": 0.0,
        "approved_value": 1099.0, "paid_value": 849.0,
        "items": [
            {"tool_id": t9["id"], "include_photos": True, "include_receipts": True,
             "include_serial": True, "include_model": True, "include_purchase_date": True,
             "include_warranty": True, "include_notes": True, "include_documents": True,
             "pre_loss_condition": "Excellent", "post_loss_condition": "Unknown",
             "item_notes": "Stored in the locked top drawer.",
             "claimed_value": 320.0, "replacement_cost": 360.0,
             "snapshot": {"name": t9["name"], "cost": t9["cost"],
                          "photo": t9["photos"][0] if t9["photos"] else ""},
             "added_at": _now()},
            {"tool_id": t15["id"], "include_photos": True, "include_receipts": True,
             "include_serial": True, "include_model": True, "include_purchase_date": True,
             "include_warranty": True, "include_notes": True, "include_documents": True,
             "pre_loss_condition": "Good", "post_loss_condition": "Unknown",
             "item_notes": "High-value diagnostic scanner.",
             "claimed_value": 899.0, "replacement_cost": 999.0,
             "snapshot": {"name": t15["name"], "cost": t15["cost"],
                          "photo": t15["photos"][0] if t15["photos"] else ""},
             "added_at": _now()},
        ],
        "notes": [
            {"id": _uid(), "text": "Police report filed same morning (HPD-2025-99812).",
             "author": "Owner", "category": "General", "created_at": _days_ago(39)},
            {"id": _uid(), "text": "Adjuster requested receipts — uploaded to portal.",
             "author": "Owner", "category": "Adjuster", "created_at": _days_ago(30)},
        ],
        "timeline": [
            {"id": _uid(), "type": "Created", "detail": "Claim opened", "created_at": _days_ago(39)},
            {"id": _uid(), "type": "Status", "detail": "Submitted", "created_at": _days_ago(38)},
            {"id": _uid(), "type": "Status", "detail": "Under Review", "created_at": _days_ago(30)},
            {"id": _uid(), "type": "Status", "detail": "Approved", "created_at": _days_ago(14)},
            {"id": _uid(), "type": "Status", "detail": "Paid", "created_at": _days_ago(7)},
        ],
        "status_history": [
            {"status": "Submitted", "created_at": _days_ago(38), "note": ""},
            {"status": "Under Review", "created_at": _days_ago(30), "note": ""},
            {"status": "Approved", "created_at": _days_ago(14), "note": "Approved at $1,099"},
            {"status": "Paid", "created_at": _days_ago(7), "note": "Paid $849 after deductible/depreciation"},
        ],
        "archived": False, "created_at": _days_ago(39), "updated_at": _days_ago(7),
    }
    await real_db.insurance_claims.insert_one(claim)
    counters["insurance_claims"] = 1

    evidence = {
        "id": _uid(), "owner_id": user_id, "is_demo": True, "claim_id": claim_id,
        "filename": "smashed_window.png", "mime": "image/png", "kind": "Photo",
        "caption": "Smashed passenger window",
        "data_b64": _tile("EVIDENCE", 6, "Broken window"),
        "size": 0, "created_at": _days_ago(39),
    }
    await real_db.claim_evidence.insert_one(evidence)
    counters["claim_evidence"] = 1

    # --- Wishlist -----------------------------------------------------------
    wishes = [
        {"id": _uid(), "name": "Flank Drive Plus Wrench Set", "url": "",
         "description": "Combination wrench set, 10 pc.", "price": 289.0,
         "dealer_id": sd, "dealer_name": sm, "priority": "high",
         "notes": "Replace the mismatched set.", "model_number": "OEXSM710",
         "photos": [_tile("Wrench Set", 0, "Wishlist")]},
        {"id": _uid(), "name": "PACKOUT Rolling Tool Box", "url": "",
         "description": "Stackable rolling tool box.", "price": 199.0,
         "dealer_id": md, "dealer_name": mm, "priority": "normal",
         "notes": "For mobile jobs.", "model_number": "48-22-8426",
         "photos": [_tile("Tool Box", 1, "Wishlist")]},
        {"id": _uid(), "name": "Cordless 3/8\" Ratchet", "url": "",
         "description": "12V brushless cordless ratchet.", "price": 149.0,
         "dealer_id": cd, "dealer_name": cm, "priority": "low",
         "notes": "", "model_number": "BWP1238", "photos": []},
    ]
    for w in wishes:
        w.update({"owner_id": user_id, "is_demo": True, "purchased": False,
                  "purchased_at": None, "converted_tool_id": None,
                  "created_at": _now(), "updated_at": _now()})
    await real_db.wishlist.insert_many(wishes)
    counters["wishlist"] = len(wishes)

    # --- Personal / insurance profile --------------------------------------
    await real_db.personal_profile.update_one(
        {"owner_id": user_id, "id": "self"},
        {"$set": {
            "owner_id": user_id, "id": "self", "is_demo": True,
            "name": "Jake's Mobile Mechanic", "address": "1420 Gearhead Ln",
            "address2": "Unit B", "city": "Houston", "state": "TX",
            "zip_code": "77002", "country": "USA", "phone": "(713) 555-0100",
            "email": "shop@jakesmobile.example", "policy_number": "AMI-884213",
            "insurance_company": "Acme Mutual Insurance",
            "notes": "Mobile auto-repair — tools insured under business policy.",
            "is_company": True, "updated_at": _now(),
        }},
        upsert=True,
    )
    counters["profile"] = 1

    # --- Enrich the default dealers (balances / routes / agents / payments) -
    enrich = {
        "Snap-on Tools": {
            "personal_balance": 1285.50, "credit_balance": 0.0,
            "route_frequency": "Weekly", "route_day_of_week": "Tue",
            "agents": [{"id": _uid(), "name": "Tony Ramirez", "phone": "(713) 555-0201",
                        "email": "tramirez@snapon.example", "location": "Route 14 — N. Houston",
                        "notes": "", "started_at": _days_ago(500), "ended_at": None}],
            "personal_schedule": {"enabled": True, "amount": 150.0, "frequency": "monthly",
                                  "next_due_date": _days_ahead(3), "remind_day_before": True,
                                  "remind_day_of": True, "last_paid_date": _days_ago(27)},
            "transactions": [
                {"id": _uid(), "account": "personal", "type": "charge", "amount": 379.0,
                 "note": "Master Socket Set", "date": _days_ago(40), "created_at": _now()},
                {"id": _uid(), "account": "personal", "type": "payment", "amount": 150.0,
                 "note": "Monthly truck payment", "date": _days_ago(27), "created_at": _now()},
            ],
        },
        "Matco Tools": {
            "personal_balance": 640.00, "route_frequency": "Weekly", "route_day_of_week": "Thu",
            "agents": [{"id": _uid(), "name": "Dave Kim", "phone": "(713) 555-0233",
                        "email": "", "location": "Route 7", "notes": "",
                        "started_at": _days_ago(300), "ended_at": None}],
            "transactions": [
                {"id": _uid(), "account": "personal", "type": "charge", "amount": 199.0,
                 "note": "M18 Impact Driver", "date": _days_ago(300), "created_at": _now()},
            ],
        },
        "Mac Tools": {
            "personal_balance": 410.25, "route_frequency": "Bi-weekly",
            "route_day_of_week": "Wed", "route_anchor_date": _days_ago(7),
            "agents": [{"id": _uid(), "name": "Carlos Mendez", "phone": "(281) 555-0277",
                        "email": "", "location": "", "notes": "",
                        "started_at": _days_ago(210), "ended_at": None}],
            "transactions": [],
        },
        "Cornwell Tools": {
            "personal_balance": 0.0, "route_frequency": "Monthly",
            "route_anchor_date": _days_ago(10),
            "agents": [{"id": _uid(), "name": "Rick Davis", "phone": "(800) 555-0319",
                        "email": "", "location": "", "notes": "",
                        "started_at": _days_ago(500), "ended_at": None}],
            "transactions": [],
        },
    }
    for name, patch in enrich.items():
        d = by_dealer.get(name)
        if not d:
            continue
        agents = patch.get("agents", [])
        upd = dict(patch)
        upd["current_agent_id"] = agents[0]["id"] if agents else None
        upd["is_demo_enriched"] = True
        await real_db.dealers.update_one(
            {"owner_id": user_id, "id": d["id"]}, {"$set": upd})
    counters["dealers_enriched"] = len(enrich)

    # --- Flip user flags ----------------------------------------------------
    await real_db.users.update_one(
        {"id": user_id},
        {"$set": {"demo_seeded": True, "demo_present": True, "demo_intro_seen": False}},
    )
    return counters


# ===========================================================================
# STATUS + CLEAR
# ===========================================================================
async def demo_status_for_user(real_db, user_id: str) -> Dict[str, Any]:
    u = await real_db.users.find_one(
        {"id": user_id}, {"_id": 0, "demo_present": 1, "demo_intro_seen": 1})
    return {
        "present": bool(u and u.get("demo_present")),
        "intro_seen": bool(u and u.get("demo_intro_seen")),
    }


async def mark_demo_intro_seen(real_db, user_id: str) -> None:
    await real_db.users.update_one(
        {"id": user_id}, {"$set": {"demo_intro_seen": True}})


_DEMO_COLLECTIONS = [
    "tools", "borrowers", "bundles", "warranty_claims",
    "insurance_claims", "claim_evidence", "wishlist", "personal_profile",
]
_TAXONOMY_COLLECTIONS = ["dealers", "locations", "tags", "categories", "brands"]


async def clear_demo_data_for_user(real_db, user_id: str,
                                    keep_taxonomy: bool) -> Dict[str, int]:
    """Remove all demo data. When keep_taxonomy is False, also wipe dealers /
    locations / tags / categories so the app is blank. When True, keep them but
    reset the demo enrichments on the default dealers."""
    removed: Dict[str, int] = {}
    for coll in _DEMO_COLLECTIONS:
        base_q = {"owner_id": user_id, "is_demo": True}
        if coll == "tools":
            # In the v3.2 model a Set is a tool with is_bundle=True. Report
            # those under "bundles" so the count matches the user's mental
            # model (15 tools + 1 Set, not 16 tools).
            bundles_n = await real_db.tools.count_documents({**base_q, "is_bundle": True})
            res = await real_db.tools.delete_many(base_q)
            removed["tools"] = res.deleted_count - bundles_n
            removed["bundles"] = removed.get("bundles", 0) + bundles_n
        elif coll == "bundles":
            # Legacy separate collection (pre-v3.2). Fold any stragglers in.
            res = await real_db.bundles.delete_many(base_q)
            removed["bundles"] = removed.get("bundles", 0) + res.deleted_count
        else:
            res = await real_db[coll].delete_many(base_q)
            removed[coll] = res.deleted_count

    if keep_taxonomy:
        # Reset any dealer we enriched back to a clean state.
        res = await real_db.dealers.update_many(
            {"owner_id": user_id, "is_demo_enriched": True},
            {"$set": {
                "credit_balance": 0.0, "personal_balance": 0.0, "transactions": [],
                "agents": [], "current_agent_id": None,
                "credit_schedule": None, "personal_schedule": None,
                "route_frequency": "N/A", "route_day_of_week": "", "route_anchor_date": "",
            }, "$unset": {"is_demo_enriched": ""}},
        )
        removed["dealers_reset"] = res.modified_count
    else:
        for coll in _TAXONOMY_COLLECTIONS:
            res = await real_db[coll].delete_many({"owner_id": user_id})
            removed[coll] = res.deleted_count

    await real_db.users.update_one(
        {"id": user_id},
        {"$set": {"demo_present": False, "demo_intro_seen": True}},
    )
    return removed
