"""One-shot B3f: extract stats/aggregate + per-tool-action route groups."""

p = "server.py"
content = open(p).read()

# IMPORTANT: no `from __future__ import annotations` here — the tool-action
# group defines inline Pydantic request-body models (MarkSold/Bulk) and FastAPI
# must see the real class objects (not lazy string annotations) to treat them
# as request bodies.
HEADER = '''"""{doc}

Extracted from server.py (god-file refactor B3). Registered on the shared
api_router via {fn}(); deps come from core/models/helpers so this module never
imports server (no cycle).
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends, Query

from core import db, real_db, get_current_user, current_user_id_var
from auth import User
from helpers import build_tool_query, _validate_photo_payload
import media
from models import (
    now_iso, Tool, Document, CheckoutRequest, ReportLostRequest, LostStatus,
    RepairInfo,
)

logger = logging.getLogger("{module}")


def {fn}(api_router: APIRouter) -> None:
'''

SECTIONS = [
    {
        "module": "routes_tool_actions",
        "fn": "register_tool_action_routes",
        "doc": "Per-tool actions — sale/sold, checkout/checkin, documents, theft-loss, bulk.",
        "desc": "Per-tool actions (sale/checkout/documents/theft/bulk)",
        "start": "# ---------- Sale / Sold ----------",
        "end": "\n\n# ---------- Aggregate / Stats ----------",
    },
    {
        "module": "routes_stats",
        "fn": "register_stats_routes",
        "doc": "Aggregate, stats and warranty-alert summaries.",
        "desc": "Aggregate / stats / warranty-alerts",
        "start": "# ---------- Aggregate / Stats ----------",
        "end": "\n\n# ---------- Personal Profile (singleton) ----------",
    },
]

for sec in SECTIONS:
    i = content.index(sec["start"])
    j = content.index(sec["end"], i)
    block = content[i:j]
    indented = "\n".join(
        (("    " + ln) if ln.strip() else ln) for ln in block.split("\n")
    )
    module_src = HEADER.format(doc=sec["doc"], fn=sec["fn"], module=sec["module"]) + indented + "\n"
    open(sec["module"] + ".py", "w").write(module_src)

    replacement = (
        f"# {sec['desc']} -> {sec['module']}.py (god-file refactor B3).\n"
        f"from {sec['module']} import {sec['fn']}  # noqa: E402\n"
        f"{sec['fn']}(api_router)"
    )
    content = content[:i] + replacement + content[j:]
    print(f"wrote {sec['module']}.py ({module_src.count(chr(10))} lines)")

open(p, "w").write(content)
print("server.py lines:", content.count("\n"))
