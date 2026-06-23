import requests

BASE = "http://localhost:8001/api"
EMAIL, PW = "mechanicltz@gmail.com", "Blue321!"

tok = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PW}).json()["token"]
H = {"Authorization": f"Bearer {tok}"}
created = []
try:
    # Bundle YELLOW333 with inside item RED444
    b = requests.post(f"{BASE}/tools", headers=H, json={
        "name": "Socket Set", "is_bundle": True, "model_numbers": ["YELLOW333"], "cost": 100}).json()
    created.append(b["id"]); bid = b["id"]
    b = requests.post(f"{BASE}/tools/{bid}/inside-items", headers=H,
                      json={"name": "10mm socket", "model": "RED444", "cost": 5}).json()
    item = b["inside_items"][0]

    # Mark bundle broken for the inside item
    r = requests.put(f"{BASE}/tools/{bid}", headers=H, json={
        "needs_repair": True,
        "repair_info": {
            "repair_status": "Reported", "company_notified": "Test Dealer",
            "inside_item_id": item["id"], "inside_item_name": "10mm socket", "inside_item_model": "RED444",
        }})
    assert r.status_code == 200, r.text
    print("PASS mark broken (inside item)")

    # Claim mirror should carry inside item + bundle model
    claims = requests.get(f"{BASE}/warranty-claims", headers=H).json()
    mine = [c for c in claims if c.get("tool_id") == bid]
    assert mine, "no claim created"
    c = mine[0]
    assert c.get("inside_item_model") == "RED444", c
    assert c.get("inside_item_name") == "10mm socket", c
    assert c.get("bundle_model") == "YELLOW333", c
    print("PASS claim mirror has inside item + bundle model:", c.get("inside_item_model"), c.get("bundle_model"))

    print("\nALL STAGE 2 BACKEND TESTS PASSED")
finally:
    for tid in created:
        requests.delete(f"{BASE}/tools/{tid}", headers=H)
