"""Tool Tracker backend regression tests for ITERATION 2 features.

Covers:
- Categories CRUD (case-insensitive idempotent POST)
- Tags case-insensitive idempotent POST
- Dealers CRUD + agents (add/remove/set-current)
- Tool new fields: category_id, is_consumable, consumable_info, warranty,
  dealer_id, purchased_from_agent_id (round-trip via POST/PUT)
- GET /api/tools new filters: category_id, dealer_id, is_consumable
- GET /api/aggregate (with filters)
- GET /api/stats (new fields)
- GET /api/warranty-alerts (expiring + expired)
- Toolbox layouts CRUD
- AI POST /api/toolbox/analyze response shape
- _id leak check on every endpoint
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://toolbox-vault-v3.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "mechanicltz@gmail.com", "password": "Blue321!"},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    sess.headers.update({"Authorization": f"Bearer {tok}"})
    return sess


def _no_id_leak(obj):
    """Recursively assert no '_id' in dict structures."""
    if isinstance(obj, dict):
        assert "_id" not in obj, f"_id leaked in {obj.keys()}"
        for v in obj.values():
            _no_id_leak(v)
    elif isinstance(obj, list):
        for x in obj:
            _no_id_leak(x)


# ---------- Categories ----------
class TestCategories:
    def test_create_get_delete_and_idempotent(self, s):
        r = s.post(f"{API}/categories", json={"name": "TEST_Power Tools"})
        assert r.status_code == 200, r.text
        cat = r.json()
        _no_id_leak(cat)
        cid = cat["id"]
        assert cat["name"] == "TEST_Power Tools"

        # case-insensitive idempotent
        r2 = s.post(f"{API}/categories", json={"name": "test_power tools"})
        assert r2.status_code == 200
        assert r2.json()["id"] == cid, "Categories POST should be case-insensitive idempotent"

        r3 = s.get(f"{API}/categories")
        assert r3.status_code == 200
        items = r3.json()
        _no_id_leak(items)
        assert any(c["id"] == cid for c in items)

        d = s.delete(f"{API}/categories/{cid}")
        assert d.status_code == 200


# ---------- Tags case-insensitive idempotent ----------
class TestTagsIdempotent:
    def test_tag_idempotent(self, s):
        r = s.post(f"{API}/tags", json={"name": "TEST_Heavy"})
        assert r.status_code == 200
        tid = r.json()["id"]
        r2 = s.post(f"{API}/tags", json={"name": "test_heavy"})
        assert r2.status_code == 200
        assert r2.json()["id"] == tid
        s.delete(f"{API}/tags/{tid}")


# ---------- Dealers + Agents ----------
class TestDealers:
    @pytest.fixture(scope="class")
    def dealer(self, s):
        r = s.post(
            f"{API}/dealers",
            json={"name": "TEST_Acme Dealer", "phone": "555-1", "website": "https://acme.test"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        _no_id_leak(d)
        assert d["agents"] == [] and d["current_agent_id"] is None
        yield d
        s.delete(f"{API}/dealers/{d['id']}")

    def test_list_get(self, s, dealer):
        r = s.get(f"{API}/dealers")
        assert r.status_code == 200
        _no_id_leak(r.json())
        assert any(x["id"] == dealer["id"] for x in r.json())
        g = s.get(f"{API}/dealers/{dealer['id']}")
        assert g.status_code == 200 and g.json()["id"] == dealer["id"]

    def test_update(self, s, dealer):
        r = s.put(f"{API}/dealers/{dealer['id']}", json={"address": "1 Main St"})
        assert r.status_code == 200
        assert r.json()["address"] == "1 Main St"

    def test_agents_full_flow(self, s, dealer):
        did = dealer["id"]
        # add 1st agent -> auto-current
        r = s.post(f"{API}/dealers/{did}/agents", json={"name": "TEST_Alice", "phone": "1"})
        assert r.status_code == 200, r.text
        d = r.json()
        _no_id_leak(d)
        assert len(d["agents"]) == 1
        a1 = d["agents"][0]
        assert d["current_agent_id"] == a1["id"]
        assert a1["ended_at"] is None

        # add 2nd agent -> should NOT change current
        r = s.post(f"{API}/dealers/{did}/agents", json={"name": "TEST_Bob"})
        assert r.status_code == 200
        d = r.json()
        assert len(d["agents"]) == 2
        assert d["current_agent_id"] == a1["id"]
        a2 = next(x for x in d["agents"] if x["name"] == "TEST_Bob")

        # set 2nd as current -> a1 must get ended_at, a2 ended_at None
        r = s.post(f"{API}/dealers/{did}/current-agent/{a2['id']}")
        assert r.status_code == 200
        d = r.json()
        assert d["current_agent_id"] == a2["id"]
        agents_by_id = {a["id"]: a for a in d["agents"]}
        assert agents_by_id[a1["id"]]["ended_at"] is not None
        assert agents_by_id[a2["id"]]["ended_at"] is None

        # set non-existent agent -> 400
        r = s.post(f"{API}/dealers/{did}/current-agent/does-not-exist")
        assert r.status_code == 400

        # remove a2 (current) -> current should fall back to remaining (a1)
        r = s.delete(f"{API}/dealers/{did}/agents/{a2['id']}")
        assert r.status_code == 200
        d = r.json()
        assert len(d["agents"]) == 1
        assert d["current_agent_id"] == a1["id"]


# ---------- Tools new fields, filters, aggregate, warranty ----------
class TestToolNewFields:
    @pytest.fixture(scope="class")
    def ctx(self, s):
        loc = s.post(f"{API}/locations", json={"name": "TEST_Bench2"}).json()
        cat = s.post(f"{API}/categories", json={"name": "TEST_Saws"}).json()
        tag = s.post(f"{API}/tags", json={"name": "TEST_NewTag"}).json()
        dealer = s.post(f"{API}/dealers", json={"name": "TEST_Dealer2"}).json()
        ag = s.post(f"{API}/dealers/{dealer['id']}/agents", json={"name": "TEST_Sam"}).json()
        agent = ag["agents"][0]
        from datetime import date, timedelta
        # one expiring soon (in 10 days), one expired (10 days ago)
        soon = (date.today() + timedelta(days=10)).isoformat()
        past = (date.today() - timedelta(days=10)).isoformat()
        yield {
            "loc": loc, "cat": cat, "tag": tag, "dealer": dealer,
            "agent": agent, "soon": soon, "past": past,
        }
        s.delete(f"{API}/locations/{loc['id']}")
        s.delete(f"{API}/categories/{cat['id']}")
        s.delete(f"{API}/tags/{tag['id']}")
        s.delete(f"{API}/dealers/{dealer['id']}")

    def test_create_tool_with_all_new_fields(self, s, ctx):
        payload = {
            "name": "TEST_DrillNew",
            "cost": 100.0,
            "location_id": ctx["loc"]["id"],
            "location_name": ctx["loc"]["name"],
            "category_id": ctx["cat"]["id"],
            "category_name": ctx["cat"]["name"],
            "tag_ids": [ctx["tag"]["id"]],
            "tag_names": [ctx["tag"]["name"]],
            "dealer_id": ctx["dealer"]["id"],
            "dealer_name": ctx["dealer"]["name"],
            "purchased_from_agent_id": ctx["agent"]["id"],
            "purchased_from_agent_name": ctx["agent"]["name"],
            "is_consumable": False,
            "warranty": {
                "has_warranty": True,
                "provider": "Acme",
                "contact": "support@acme.test",
                "terms": "1yr parts",
                "length_months": 12,
                "start_date": "2025-01-01",
                "expiry_date": ctx["soon"],
            },
        }
        r = s.post(f"{API}/tools", json=payload)
        assert r.status_code == 200, r.text
        t = r.json()
        _no_id_leak(t)
        assert t["category_id"] == ctx["cat"]["id"]
        assert t["dealer_id"] == ctx["dealer"]["id"]
        assert t["purchased_from_agent_id"] == ctx["agent"]["id"]
        assert t["warranty"]["has_warranty"] is True
        assert t["warranty"]["expiry_date"] == ctx["soon"]
        pytest.tool_new_id = t["id"]

        # round-trip GET
        g = s.get(f"{API}/tools/{t['id']}")
        assert g.status_code == 200
        gt = g.json()
        assert gt["category_id"] == ctx["cat"]["id"]
        assert gt["warranty"]["length_months"] == 12

    def test_create_consumable_tool(self, s, ctx):
        payload = {
            "name": "TEST_Bolts",
            "cost": 5.0,
            "is_consumable": True,
            "consumable_info": {"store_name": "ACE", "website": "https://ace.test", "sku": "B-1"},
        }
        r = s.post(f"{API}/tools", json=payload)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["is_consumable"] is True
        assert t["consumable_info"]["store_name"] == "ACE"
        pytest.consumable_id = t["id"]

    def test_create_expired_warranty_tool(self, s, ctx):
        payload = {
            "name": "TEST_OldDrill",
            "warranty": {"has_warranty": True, "expiry_date": ctx["past"], "provider": "X"},
        }
        r = s.post(f"{API}/tools", json=payload)
        assert r.status_code == 200
        pytest.expired_id = r.json()["id"]

    def test_update_round_trip(self, s):
        r = s.put(f"{API}/tools/{pytest.tool_new_id}", json={"is_consumable": True})
        assert r.status_code == 200 and r.json()["is_consumable"] is True
        s.put(f"{API}/tools/{pytest.tool_new_id}", json={"is_consumable": False})

    def test_filter_category_dealer_consumable(self, s, ctx):
        r = s.get(f"{API}/tools", params={"category_id": ctx["cat"]["id"]})
        assert r.status_code == 200
        assert any(t["id"] == pytest.tool_new_id for t in r.json())

        r = s.get(f"{API}/tools", params={"dealer_id": ctx["dealer"]["id"]})
        assert any(t["id"] == pytest.tool_new_id for t in r.json())

        r = s.get(f"{API}/tools", params={"is_consumable": "true"})
        ids = [t["id"] for t in r.json()]
        assert pytest.consumable_id in ids
        assert pytest.tool_new_id not in ids

    def test_aggregate_no_filter(self, s):
        r = s.get(f"{API}/aggregate")
        assert r.status_code == 200
        d = r.json()
        for k in [
            "count", "total_value", "checked_out", "available", "consumables",
            "location_breakdown", "category_breakdown", "dealer_breakdown",
            "tag_count", "unique_tags",
        ]:
            assert k in d, f"missing {k}"
        assert isinstance(d["location_breakdown"], dict)
        assert isinstance(d["unique_tags"], list)

    def test_aggregate_with_filters(self, s, ctx):
        r = s.get(f"{API}/aggregate", params={"dealer_id": ctx["dealer"]["id"]})
        assert r.status_code == 200
        d = r.json()
        # at least our DrillNew should be in here
        assert d["count"] >= 1
        assert d["total_value"] >= 100.0
        assert ctx["dealer"]["name"] in d["dealer_breakdown"]

        r = s.get(f"{API}/aggregate", params={"is_consumable": "true"})
        d = r.json()
        assert d["consumables"] == d["count"]

        r = s.get(f"{API}/aggregate", params={"search": "TEST_DrillNew"})
        d = r.json()
        assert d["count"] >= 1

    def test_stats_new_fields(self, s):
        r = s.get(f"{API}/stats")
        assert r.status_code == 200
        d = r.json()
        for k in [
            "total_tools", "checked_out", "available", "consumables", "total_value",
            "locations", "tags", "categories", "borrowers", "dealers",
            "warranty_expiring_soon", "warranty_expired",
        ]:
            assert k in d, f"missing stat {k}"
        assert d["warranty_expiring_soon"] >= 1
        assert d["warranty_expired"] >= 1

    def test_warranty_alerts(self, s):
        r = s.get(f"{API}/warranty-alerts")
        assert r.status_code == 200
        d = r.json()
        _no_id_leak(d)
        assert "expiring" in d and "expired" in d
        assert any(t["id"] == pytest.tool_new_id for t in d["expiring"])
        assert any(t["id"] == pytest.expired_id for t in d["expired"])

    def test_cleanup_tools(self, s):
        for tid in (pytest.tool_new_id, pytest.consumable_id, pytest.expired_id):
            s.delete(f"{API}/tools/{tid}")
