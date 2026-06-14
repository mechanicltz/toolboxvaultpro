"""Tests for the bundle/set report logic — focused on the dual sums NOT
double-counting (the core Phase 2 requirement)."""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import reports  # noqa: E402
from reports import (  # noqa: E402
    _bundle_sums,
    _group_rows_by_bundle,
    _fetch_inventory,
    _normalise_tool_row,
)


# --- Fake async Mongo ------------------------------------------------------
class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *a, **k):
        return self

    async def to_list(self, n=None):
        return list(self._docs)


class _FakeColl:
    def __init__(self, docs):
        self._docs = docs

    def find(self, query=None, proj=None):
        return _FakeCursor(self._docs)


class _FakeDB:
    def __init__(self, tools, bundles):
        self.tools = _FakeColl(tools)
        self.bundles = _FakeColl(bundles)
        self.locations = _FakeColl([])


# --- Fixtures --------------------------------------------------------------
TOOLS = [
    {"id": "t1", "name": "Ratchet", "cost": 40, "quantity": 1, "bundle_id": "b1"},
    {"id": "t2", "name": "Socket", "cost": 60, "quantity": 1, "bundle_id": "b1"},
    {"id": "t3", "name": "Hammer", "cost": 30, "quantity": 1},
    {"id": "t4", "name": "Wrench", "cost": 20, "quantity": 1},
]
BUNDLES = [
    {"id": "b1", "name": "Socket Set", "part_number": "P1", "set_price": 80},
]
# items_only           = 40 + 60 + 30 + 20 = 150
# items_and_bundles    = (30 + 20) + 80     = 130   (set counted ONCE)


def _rows():
    return [_normalise_tool_row(t) for t in TOOLS]


def _bmap():
    return {b["id"]: b for b in BUNDLES}


def test_bundle_sums_no_double_count():
    items_only, items_bundles, has = _bundle_sums(_rows(), _bmap())
    assert items_only == 150.0
    assert items_bundles == 130.0
    assert has is True


def test_bundle_sums_no_bundles():
    rows = [_normalise_tool_row(t) for t in TOOLS if not t.get("bundle_id")]
    items_only, items_bundles, has = _bundle_sums(rows, _bmap())
    assert items_only == 50.0
    assert items_bundles == 50.0  # no sets → identical
    assert has is False


def test_group_inserts_section_headers():
    grouped = _group_rows_by_bundle(_rows(), _bmap())
    headers = [r for r in grouped if r.get("_section_header")]
    labels = [h["_section_label"] for h in headers]
    assert any("Socket Set" in l and "SET PRICE" in l and "$80.00" in l for l in labels)
    assert any(l == "Individual Items" for l in labels)
    # The two bundled items appear right after the set header.
    real = [r for r in grouped if not r.get("_section_header")]
    assert len(real) == 4


def _stats_dict(result):
    return {label: value for (label, value, _is_money) in result["stats"]}


def test_fetch_inventory_both_shows_dual_sums():
    db = _FakeDB(TOOLS, BUNDLES)
    result = asyncio.get_event_loop().run_until_complete(
        _fetch_inventory(db, None, {"set_pricing": "both"})
    )
    stats = _stats_dict(result)
    assert stats.get("Items Only") == "$150.00"
    assert stats.get("Items + Bundles") == "$130.00"
    # rows are grouped
    assert any(r.get("_section_header") for r in result["rows"])


def test_fetch_inventory_bundle_mode_single_total():
    db = _FakeDB(TOOLS, BUNDLES)
    result = asyncio.get_event_loop().run_until_complete(
        _fetch_inventory(db, None, {"set_pricing": "bundle"})
    )
    stats = _stats_dict(result)
    assert stats.get("Items + Bundles") == "$130.00"
    assert "Items Only" not in stats


def test_fetch_inventory_individual_mode_unchanged():
    db = _FakeDB(TOOLS, BUNDLES)
    result = asyncio.get_event_loop().run_until_complete(
        _fetch_inventory(db, None, {"set_pricing": "individual"})
    )
    stats = _stats_dict(result)
    assert stats.get("Total Cost") == "$150.00"
    assert "Items + Bundles" not in stats
    # no grouping in individual mode
    assert not any(r.get("_section_header") for r in result["rows"])


def test_fetch_inventory_no_bundles_falls_back():
    db = _FakeDB([t for t in TOOLS if not t.get("bundle_id")], [])
    result = asyncio.get_event_loop().run_until_complete(
        _fetch_inventory(db, None, {"set_pricing": "both"})
    )
    stats = _stats_dict(result)
    assert stats.get("Total Cost") == "$50.00"
    assert "Items + Bundles" not in stats


def test_fetch_inventory_bundle_mode_sets_footer_override():
    """In bundle mode the table footer total must be the unbundled items'
    cost PLUS each set price (counted once) — NOT the sum of bundled items'
    individual prices. Exposed via footer_total_overrides['cost']."""
    db = _FakeDB(TOOLS, BUNDLES)
    result = asyncio.get_event_loop().run_until_complete(
        _fetch_inventory(db, None, {"set_pricing": "bundle"})
    )
    assert result.get("footer_total_overrides") == {"cost": 130.0}


def test_fetch_inventory_both_mode_no_footer_override():
    """Both/individual modes keep the raw per-item footer total (no override)."""
    db = _FakeDB(TOOLS, BUNDLES)
    for mode in ("both", "individual"):
        result = asyncio.get_event_loop().run_until_complete(
            _fetch_inventory(db, None, {"set_pricing": mode})
        )
        assert not result.get("footer_total_overrides")


def test_fetch_inventory_bundle_mode_no_bundles_no_override():
    db = _FakeDB([t for t in TOOLS if not t.get("bundle_id")], [])
    result = asyncio.get_event_loop().run_until_complete(
        _fetch_inventory(db, None, {"set_pricing": "bundle"})
    )
    assert not result.get("footer_total_overrides")
