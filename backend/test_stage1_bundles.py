import requests, sys

BASE = "http://localhost:8001/api"
EMAIL, PW = "mechanicltz@gmail.com", "Blue321!"

def login():
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PW})
    r.raise_for_status()
    return r.json()["token"]

def main():
    tok = login()
    H = {"Authorization": f"Bearer {tok}"}
    created = []
    try:
        # 1) Create a bundle (is_bundle=True) with all-item fields + model YELLOW333
        r = requests.post(f"{BASE}/tools", headers=H, json={
            "name": "Socket Set 10-15mm", "is_bundle": True, "cost": 199.99,
            "model_numbers": ["YELLOW333"], "brand": "TestBrand", "quantity": 1,
        })
        assert r.status_code == 200, r.text
        bundle = r.json(); created.append(bundle["id"])
        assert bundle["is_bundle"] is True, bundle
        print("PASS create bundle", bundle["id"], "is_bundle", bundle["is_bundle"])

        bid = bundle["id"]
        # 2) Add inside items
        r = requests.post(f"{BASE}/tools/{bid}/inside-items", headers=H, json={
            "name": "10mm socket", "model": "RED444", "cost": 5.0})
        assert r.status_code == 200, r.text
        b = r.json()
        assert len(b["inside_items"]) == 1 and b["inside_items"][0]["model"] == "RED444", b["inside_items"]
        item_id = b["inside_items"][0]["id"]
        print("PASS add inside item", item_id)

        # 3) Update inside item
        r = requests.put(f"{BASE}/tools/{bid}/inside-items/{item_id}", headers=H, json={"cost": 6.5})
        assert r.status_code == 200 and r.json()["inside_items"][0]["cost"] == 6.5, r.text
        print("PASS update inside item")

        # 4) Search by inside item model -> returns parent bundle
        r = requests.get(f"{BASE}/tools?search=RED444", headers=H)
        assert r.status_code == 200, r.text
        ids = [t["id"] for t in r.json()]
        assert bid in ids, f"bundle not surfaced by inside-item search: {ids}"
        print("PASS search RED444 -> bundle surfaced")

        # 4b) Search by inside item name
        r = requests.get(f"{BASE}/tools?search=10mm socket", headers=H)
        assert bid in [t["id"] for t in r.json()], "name search failed"
        print("PASS search inside name -> bundle surfaced")

        # 5) Filter bundles only
        r = requests.get(f"{BASE}/tools?is_bundle=true", headers=H)
        assert r.status_code == 200 and all(t["is_bundle"] for t in r.json()), r.text
        assert bid in [t["id"] for t in r.json()]
        print("PASS is_bundle filter")

        # 6) Create a normal item and link as expansion
        r = requests.post(f"{BASE}/tools", headers=H, json={"name": "16mm socket", "cost": 7})
        exp = r.json(); created.append(exp["id"])
        r = requests.post(f"{BASE}/tools/{bid}/expansion/{exp['id']}", headers=H)
        assert r.status_code == 200 and r.json()["expansion_of"] == bid, r.text
        print("PASS link expansion")

        # 7) list expansion items
        r = requests.get(f"{BASE}/tools/{bid}/expansion-items", headers=H)
        assert r.status_code == 200 and exp["id"] in [t["id"] for t in r.json()], r.text
        print("PASS list expansion items")

        # 7b) expansion item still appears in main inventory
        r = requests.get(f"{BASE}/tools", headers=H)
        assert exp["id"] in [t["id"] for t in r.json()], "expansion item missing from inventory"
        print("PASS expansion item still in inventory")

        # 8) unlink expansion
        r = requests.delete(f"{BASE}/tools/{bid}/expansion/{exp['id']}", headers=H)
        assert r.status_code == 200 and r.json().get("expansion_of") in (None, ""), r.text
        print("PASS unlink expansion")

        # 9) delete inside item
        r = requests.delete(f"{BASE}/tools/{bid}/inside-items/{item_id}", headers=H)
        assert r.status_code == 200 and len(r.json()["inside_items"]) == 0, r.text
        print("PASS delete inside item")

        # 10) migration idempotency (no old bundles expected -> 0)
        r = requests.post(f"{BASE}/bundles/migrate-to-tools", headers=H)
        assert r.status_code == 200, r.text
        print("PASS migrate endpoint", r.json())

        print("\nALL STAGE 1 BACKEND TESTS PASSED")
    finally:
        for tid in created:
            requests.delete(f"{BASE}/tools/{tid}", headers=H)

main()
