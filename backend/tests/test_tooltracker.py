"""Tool Tracker backend regression tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://asset-locator-12.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Health ----------
def test_root_health(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("message") == "Tool Tracker API"


# ---------- Locations ----------
def test_location_crud(s):
    r = s.post(f"{API}/locations", json={"name": "TEST_Garage", "description": "main garage"})
    assert r.status_code == 200, r.text
    loc = r.json()
    assert "_id" not in loc and loc["name"] == "TEST_Garage"
    lid = loc["id"]

    r = s.get(f"{API}/locations")
    assert r.status_code == 200
    assert any(l["id"] == lid for l in r.json())

    r = s.delete(f"{API}/locations/{lid}")
    assert r.status_code == 200 and r.json().get("ok") is True


# ---------- Tags ----------
def test_tag_crud(s):
    r = s.post(f"{API}/tags", json={"name": "TEST_Power", "color": "#FF8800"})
    assert r.status_code == 200, r.text
    tag = r.json()
    assert "_id" not in tag
    tid = tag["id"]

    r = s.get(f"{API}/tags")
    assert r.status_code == 200
    assert any(t["id"] == tid for t in r.json())

    r = s.delete(f"{API}/tags/{tid}")
    assert r.status_code == 200


# ---------- Borrowers ----------
def test_borrower_crud(s):
    r = s.post(f"{API}/borrowers", json={"name": "TEST_Mike", "contact": "555"})
    assert r.status_code == 200
    b = r.json()
    assert "_id" not in b
    bid = b["id"]
    r = s.get(f"{API}/borrowers")
    assert any(x["id"] == bid for x in r.json())
    r = s.delete(f"{API}/borrowers/{bid}")
    assert r.status_code == 200


# ---------- Tools full flow ----------
@pytest.fixture(scope="module")
def context(s):
    loc = s.post(f"{API}/locations", json={"name": "TEST_Bench"}).json()
    tag = s.post(f"{API}/tags", json={"name": "TEST_Hand"}).json()
    bor = s.post(f"{API}/borrowers", json={"name": "TEST_Bob"}).json()
    yield {"loc": loc, "tag": tag, "bor": bor}
    s.delete(f"{API}/locations/{loc['id']}")
    s.delete(f"{API}/tags/{tag['id']}")
    s.delete(f"{API}/borrowers/{bor['id']}")


def test_tool_create_and_persist(s, context):
    payload = {
        "name": "TEST_Hammer",
        "description": "claw hammer",
        "brand": "Stanley",
        "model": "X1",
        "cost": 19.99,
        "location_id": context["loc"]["id"],
        "location_name": context["loc"]["name"],
        "tag_ids": [context["tag"]["id"]],
        "tag_names": [context["tag"]["name"]],
        "photos": ["data:image/png;base64,iVBORw0KGgo="],
        "documents": [{"name": "manual.pdf", "data": "JVBERi0=", "mime_type": "application/pdf"}],
    }
    r = s.post(f"{API}/tools", json=payload)
    assert r.status_code == 200, r.text
    tool = r.json()
    assert "_id" not in tool
    assert tool["name"] == "TEST_Hammer"
    assert tool["cost"] == 19.99
    assert len(tool["photos"]) == 1
    assert len(tool["documents"]) == 1
    assert tool["is_checked_out"] is False
    pytest.tool_id = tool["id"]

    # GET verify
    g = s.get(f"{API}/tools/{tool['id']}")
    assert g.status_code == 200 and g.json()["name"] == "TEST_Hammer"


def test_tool_list_and_filters(s, context):
    r = s.get(f"{API}/tools", params={"search": "TEST_Hammer"})
    assert r.status_code == 200
    items = r.json()
    assert any(t["id"] == pytest.tool_id for t in items)

    r = s.get(f"{API}/tools", params={"location_id": context["loc"]["id"]})
    assert any(t["id"] == pytest.tool_id for t in r.json())

    r = s.get(f"{API}/tools", params={"tag_id": context["tag"]["id"]})
    assert any(t["id"] == pytest.tool_id for t in r.json())

    r = s.get(f"{API}/tools", params={"checked_out": "false"})
    assert any(t["id"] == pytest.tool_id for t in r.json())


def test_tool_update(s):
    r = s.put(f"{API}/tools/{pytest.tool_id}", json={"cost": 25.5, "condition": "Excellent"})
    assert r.status_code == 200
    t = r.json()
    assert t["cost"] == 25.5 and t["condition"] == "Excellent"


def test_checkout_flow(s, context):
    r = s.post(
        f"{API}/tools/{pytest.tool_id}/checkout",
        json={"borrower_name": "TEST_Bob", "borrower_id": context["bor"]["id"], "notes": "need it"},
    )
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["is_checked_out"] is True
    assert t["current_checkout"]["borrower_name"] == "TEST_Bob"

    # double-checkout -> 400
    r2 = s.post(f"{API}/tools/{pytest.tool_id}/checkout", json={"borrower_name": "X"})
    assert r2.status_code == 400


def test_checkin_flow(s):
    r = s.post(f"{API}/tools/{pytest.tool_id}/checkin")
    assert r.status_code == 200
    t = r.json()
    assert t["is_checked_out"] is False
    assert t["current_checkout"] is None
    assert len(t["checkout_history"]) >= 1
    assert t["checkout_history"][-1].get("checked_in_at")

    # checkin again -> 400
    r2 = s.post(f"{API}/tools/{pytest.tool_id}/checkin")
    assert r2.status_code == 400


def test_stats(s):
    r = s.get(f"{API}/stats")
    assert r.status_code == 200
    d = r.json()
    for k in ["total_tools", "checked_out", "available", "total_value", "locations", "tags", "borrowers"]:
        assert k in d


def test_tool_delete(s):
    r = s.delete(f"{API}/tools/{pytest.tool_id}")
    assert r.status_code == 200
    g = s.get(f"{API}/tools/{pytest.tool_id}")
    assert g.status_code == 404
