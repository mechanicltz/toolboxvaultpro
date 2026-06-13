"""Bundle/Set backend regression tests (Phase 1 backend verification)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

EMAIL = "mechanicltz@gmail.com"
PASSWORD = "Blue321!"


# ---------- Session fixture (logged in) ----------
@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    r = sess.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token, "No token returned from login"
    sess.headers.update({"Authorization": f"Bearer {token}"})
    return sess


# Track created resources for module-level cleanup
_created = {"bundles": [], "tools": []}


@pytest.fixture(scope="module", autouse=True)
def _cleanup(s):
    yield
    for bid in _created["bundles"]:
        try:
            s.delete(f"{API}/bundles/{bid}")
        except Exception:
            pass
    for tid in _created["tools"]:
        try:
            s.delete(f"{API}/tools/{tid}")
        except Exception:
            pass


# ---------- Health ----------
def test_root_health(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200


# ---------- Bundle CRUD ----------
def test_create_bundle(s):
    payload = {
        "name": "TEST_Socket Set",
        "part_number": "TEST-SS-001",
        "set_price": 199.99,
        "notes": "TEST bundle for automated test",
    }
    r = s.post(f"{API}/bundles", json=payload)
    assert r.status_code == 200, r.text
    b = r.json()
    assert "_id" not in b
    assert b["id"] and b["name"] == "TEST_Socket Set"
    assert b["part_number"] == "TEST-SS-001"
    assert b["set_price"] == 199.99
    _created["bundles"].append(b["id"])


def test_list_bundles_has_item_count(s):
    # Create a bundle first
    r = s.post(f"{API}/bundles", json={"name": "TEST_List Bundle"})
    assert r.status_code == 200
    bid = r.json()["id"]
    _created["bundles"].append(bid)

    r = s.get(f"{API}/bundles")
    assert r.status_code == 200
    bundles = r.json()
    assert isinstance(bundles, list)
    match = next((b for b in bundles if b["id"] == bid), None)
    assert match is not None
    assert "item_count" in match and match["item_count"] == 0


def test_get_bundle_returns_items_array(s):
    r = s.post(f"{API}/bundles", json={"name": "TEST_Detail Bundle"})
    bid = r.json()["id"]
    _created["bundles"].append(bid)

    r = s.get(f"{API}/bundles/{bid}")
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["id"] == bid
    assert "items" in b and isinstance(b["items"], list)
    assert b["items"] == []


def test_get_bundle_404_on_missing(s):
    r = s.get(f"{API}/bundles/does-not-exist-xyz")
    assert r.status_code == 404


def test_update_bundle(s):
    r = s.post(f"{API}/bundles", json={"name": "TEST_Old Name", "set_price": 10.0})
    bid = r.json()["id"]
    _created["bundles"].append(bid)

    r = s.put(f"{API}/bundles/{bid}", json={"name": "TEST_New Name", "set_price": 250.5})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["name"] == "TEST_New Name"
    assert b["set_price"] == 250.5

    # GET to verify persistence
    r = s.get(f"{API}/bundles/{bid}")
    assert r.status_code == 200
    assert r.json()["name"] == "TEST_New Name"


# ---------- Attach / Detach tool ----------
def _create_tool(s, name="TEST_Bundle Tool", bundle_id=None):
    payload = {"name": name, "quantity": 1, "price": 19.99}
    if bundle_id:
        payload["bundle_id"] = bundle_id
    r = s.post(f"{API}/tools", json=payload)
    assert r.status_code == 200, r.text
    t = r.json()
    _created["tools"].append(t["id"])
    return t


def test_attach_tool_to_bundle(s):
    r = s.post(f"{API}/bundles", json={"name": "TEST_Attach Bundle"})
    bid = r.json()["id"]
    _created["bundles"].append(bid)

    tool = _create_tool(s, "TEST_Attachable Tool")
    tid = tool["id"]
    assert (tool.get("bundle_id") in (None, "", )) or not tool.get("bundle_id")

    r = s.post(f"{API}/bundles/{bid}/items/{tid}")
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["id"] == tid
    assert updated["bundle_id"] == bid

    # Verify in bundle detail
    r = s.get(f"{API}/bundles/{bid}")
    items = r.json()["items"]
    assert any(i["id"] == tid for i in items)

    # Verify item_count reflects this
    r = s.get(f"{API}/bundles")
    match = next((b for b in r.json() if b["id"] == bid), None)
    assert match and match["item_count"] == 1


def test_detach_tool_from_bundle(s):
    r = s.post(f"{API}/bundles", json={"name": "TEST_Detach Bundle"})
    bid = r.json()["id"]
    _created["bundles"].append(bid)
    tool = _create_tool(s, "TEST_Detachable Tool")
    tid = tool["id"]
    s.post(f"{API}/bundles/{bid}/items/{tid}")

    r = s.delete(f"{API}/bundles/{bid}/items/{tid}")
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["bundle_id"] is None or updated["bundle_id"] == ""

    # Verify removed
    r = s.get(f"{API}/bundles/{bid}")
    assert all(i["id"] != tid for i in r.json()["items"])


def test_attach_to_missing_bundle_404(s):
    tool = _create_tool(s, "TEST_Orphan Tool")
    r = s.post(f"{API}/bundles/does-not-exist/items/{tool['id']}")
    assert r.status_code == 404


def test_attach_missing_tool_404(s):
    r = s.post(f"{API}/bundles", json={"name": "TEST_Missing Tool Bundle"})
    bid = r.json()["id"]
    _created["bundles"].append(bid)
    r = s.post(f"{API}/bundles/{bid}/items/missing-tool-xyz")
    assert r.status_code == 404


# ---------- Tool with bundle_id directly ----------
def test_create_tool_with_bundle_id_persists(s):
    r = s.post(f"{API}/bundles", json={"name": "TEST_Direct Bundle"})
    bid = r.json()["id"]
    _created["bundles"].append(bid)

    r = s.post(f"{API}/tools", json={
        "name": "TEST_PreBundled Tool",
        "quantity": 1,
        "bundle_id": bid,
    })
    assert r.status_code == 200, r.text
    t = r.json()
    _created["tools"].append(t["id"])
    assert t["bundle_id"] == bid

    # GET back tool to confirm
    r = s.get(f"{API}/tools/{t['id']}")
    assert r.status_code == 200
    assert r.json()["bundle_id"] == bid


def test_update_tool_bundle_id_persists(s):
    r = s.post(f"{API}/bundles", json={"name": "TEST_Update Bundle"})
    bid = r.json()["id"]
    _created["bundles"].append(bid)

    tool = _create_tool(s, "TEST_To Be Assigned")
    tid = tool["id"]

    r = s.put(f"{API}/tools/{tid}", json={"bundle_id": bid})
    assert r.status_code == 200, r.text
    assert r.json()["bundle_id"] == bid

    r = s.get(f"{API}/tools/{tid}")
    assert r.json()["bundle_id"] == bid


# ---------- Cascade delete ----------
def test_delete_bundle_cascades_items(s):
    r = s.post(f"{API}/bundles", json={"name": "TEST_Cascade Bundle"})
    bid = r.json()["id"]

    # Create 2 tools attached to it
    t1 = _create_tool(s, "TEST_Cascade Tool 1", bundle_id=bid)
    t2 = _create_tool(s, "TEST_Cascade Tool 2", bundle_id=bid)

    r = s.delete(f"{API}/bundles/{bid}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert body.get("deleted_items") == 2

    # Verify bundle gone
    r = s.get(f"{API}/bundles/{bid}")
    assert r.status_code == 404

    # Verify items gone
    for tid in (t1["id"], t2["id"]):
        r = s.get(f"{API}/tools/{tid}")
        assert r.status_code == 404, f"Expected tool {tid} to be deleted, got {r.status_code}"
        # Remove from cleanup tracker since they're already gone
        if tid in _created["tools"]:
            _created["tools"].remove(tid)


def test_delete_missing_bundle_404(s):
    r = s.delete(f"{API}/bundles/does-not-exist-zzz")
    assert r.status_code == 404
