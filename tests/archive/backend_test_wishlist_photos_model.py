"""
Test wishlist photos + model_number + convert-flow changes.
Targets: POST /api/wishlist, PUT /api/wishlist/{id}, POST /api/wishlist/{id}/convert.
"""
import os
import sys
import uuid
import requests

BACKEND_URL = "https://toolbox-vault-v3.preview.emergentagent.com"
API = f"{BACKEND_URL}/api"

ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASSWORD = "Blue321!"

results = []

def check(name, cond, info=""):
    status = "PASS" if cond else "FAIL"
    results.append((status, name, info))
    print(f"[{status}] {name} {info if info else ''}")
    return cond

def fail(name, info):
    results.append(("FAIL", name, info))
    print(f"[FAIL] {name} {info}")

def main():
    # ---- LOGIN ----
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    if r.status_code != 200:
        print(f"Cannot login: {r.status_code} {r.text}")
        sys.exit(1)
    token = r.json()["token"]
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    print("Login OK")

    # ---- need a dealer for the convert flow ----
    dealer_name = f"WishlistConvDealer_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/dealers", headers=h, json={"name": dealer_name, "phone": "555-0100"}, timeout=30)
    if r.status_code != 200:
        fail("Create dealer", f"{r.status_code} {r.text}")
        sys.exit(1)
    dealer = r.json()
    dealer_id = dealer["id"]
    print(f"Dealer created: {dealer_id}")

    tool_id_created = None
    wish_a_id = None
    wish_b_id = None
    try:
        # =========================================
        # A. Create with new fields
        # =========================================
        photo_a = "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        body = {
            "name": f"WishA_{uuid.uuid4().hex[:6]}",
            "photos": [photo_a],
            "model_number": "CTEU8810",
        }
        r = requests.post(f"{API}/wishlist", headers=h, json=body, timeout=30)
        check("A1 POST /api/wishlist status 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
        if r.status_code != 200:
            sys.exit(1)
        wish_a = r.json()
        wish_a_id = wish_a["id"]
        check("A2 response photos == request photos", wish_a.get("photos") == [photo_a], f"got {wish_a.get('photos')}")
        check("A3 response model_number == 'CTEU8810'", wish_a.get("model_number") == "CTEU8810", f"got {wish_a.get('model_number')}")
        check("A4 response name matches", wish_a.get("name") == body["name"], f"got {wish_a.get('name')}")

        # =========================================
        # B. Partial updates — only model_number, then only photos
        # =========================================
        # Step 1: Create base wish with both photos + model_number
        photo_b1 = "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABBASE1=="
        body = {
            "name": f"WishB_{uuid.uuid4().hex[:6]}",
            "photos": [photo_b1],
            "model_number": "INITIAL123",
            "description": "initial desc",
        }
        r = requests.post(f"{API}/wishlist", headers=h, json=body, timeout=30)
        if not check("B1 POST /api/wishlist (base)", r.status_code == 200, f"got {r.status_code} {r.text[:200]}"):
            sys.exit(1)
        wish_b = r.json()
        wish_b_id = wish_b["id"]
        original_name = wish_b["name"]
        original_desc = wish_b["description"]

        # Step 2: PUT with only model_number changed
        r = requests.put(f"{API}/wishlist/{wish_b_id}", headers=h,
                         json={"model_number": "UPDATED456"}, timeout=30)
        check("B2 PUT model_number only — 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
        if r.status_code == 200:
            updated = r.json()
            check("B3 model_number updated to 'UPDATED456'", updated.get("model_number") == "UPDATED456", f"got {updated.get('model_number')}")
            check("B4 photos preserved after model-only update", updated.get("photos") == [photo_b1], f"got {updated.get('photos')}")
            check("B5 name preserved after model-only update", updated.get("name") == original_name, f"got {updated.get('name')}")
            check("B6 description preserved after model-only update", updated.get("description") == original_desc, f"got {updated.get('description')}")

        # Step 3: PUT with only photos
        photo_b2 = "data:image/jpeg;base64,abc"
        r = requests.put(f"{API}/wishlist/{wish_b_id}", headers=h,
                         json={"photos": [photo_b2]}, timeout=30)
        check("B7 PUT photos only — 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
        if r.status_code == 200:
            updated = r.json()
            check("B8 photos updated to new list", updated.get("photos") == [photo_b2], f"got {updated.get('photos')}")
            check("B9 model_number NOT wiped after photos-only update (still 'UPDATED456')", updated.get("model_number") == "UPDATED456", f"got {updated.get('model_number')}")
            check("B10 name preserved", updated.get("name") == original_name, f"got {updated.get('name')}")
            check("B11 description preserved", updated.get("description") == original_desc, f"got {updated.get('description')}")

        # =========================================
        # C. Convert flow
        # =========================================
        photo_c = "data:image/jpeg;base64,xyz"
        body = {
            "name": "Test Wrench",
            "description": "Big one",
            "notes": "Bought used",
            "model_number": "TW100",
            "photos": [photo_c],
            "price": 50,
            "dealer_id": dealer_id,
        }
        r = requests.post(f"{API}/wishlist", headers=h, json=body, timeout=30)
        if not check("C1 POST /api/wishlist (convert source)", r.status_code == 200, f"got {r.status_code} {r.text[:200]}"):
            sys.exit(1)
        wish_c = r.json()
        wish_c_id = wish_c["id"]
        check("C1a wish carries model_number TW100", wish_c.get("model_number") == "TW100")
        check("C1b wish carries photos", wish_c.get("photos") == [photo_c])
        check("C1c wish carries notes", wish_c.get("notes") == "Bought used")

        # Convert
        r = requests.post(f"{API}/wishlist/{wish_c_id}/convert", headers=h, timeout=30)
        if not check("C2 POST /api/wishlist/{id}/convert — 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}"):
            # Cleanup wish + abort
            requests.delete(f"{API}/wishlist/{wish_c_id}", headers=h)
        else:
            tool = r.json()
            tool_id_created = tool.get("id")
            check("C3 tool.name == 'Test Wrench'", tool.get("name") == "Test Wrench", f"got {tool.get('name')!r}")
            check("C4 tool.model == 'TW100'", tool.get("model") == "TW100", f"got {tool.get('model')!r}")
            check("C5 tool.photos == [photo_c]", tool.get("photos") == [photo_c], f"got {tool.get('photos')}")
            check("C6 tool.description == 'Big one\\n\\nBought used'", tool.get("description") == "Big one\n\nBought used", f"got {tool.get('description')!r}")
            check("C7 tool.cost == 50", tool.get("cost") == 50, f"got {tool.get('cost')!r}")
            check("C8 tool.dealer_id == dealer_id", tool.get("dealer_id") == dealer_id, f"got {tool.get('dealer_id')}")

            # Subsequent GET wishlist item shows purchased=true + converted_tool_id
            r2 = requests.get(f"{API}/wishlist", headers=h, params={"purchased": "true"}, timeout=30)
            check("C9 GET /api/wishlist?purchased=true — 200", r2.status_code == 200, f"got {r2.status_code}")
            wish_after = None
            if r2.status_code == 200:
                for w in r2.json():
                    if w.get("id") == wish_c_id:
                        wish_after = w
                        break
            check("C10 converted wish appears with purchased=true", wish_after is not None and wish_after.get("purchased") is True, f"got {wish_after}")
            if wish_after:
                check("C11 wish.converted_tool_id == new tool id", wish_after.get("converted_tool_id") == tool_id_created, f"got {wish_after.get('converted_tool_id')} vs {tool_id_created}")
                check("C12 wish.purchased_at set (not None)", wish_after.get("purchased_at") is not None, f"got {wish_after.get('purchased_at')}")

            # =========================================
            # D. Cleanup — delete converted tool + wish
            # =========================================
            r = requests.delete(f"{API}/tools/{tool_id_created}", headers=h, timeout=30)
            check("D1 DELETE converted tool", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
            r = requests.delete(f"{API}/wishlist/{wish_c_id}", headers=h, timeout=30)
            check("D2 DELETE converted wish", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")

    finally:
        # ---- Cleanup A + B wishes + dealer ----
        if wish_a_id:
            r = requests.delete(f"{API}/wishlist/{wish_a_id}", headers=h)
            print(f"Cleanup wish A: {r.status_code}")
        if wish_b_id:
            r = requests.delete(f"{API}/wishlist/{wish_b_id}", headers=h)
            print(f"Cleanup wish B: {r.status_code}")
        r = requests.delete(f"{API}/dealers/{dealer_id}", headers=h)
        print(f"Cleanup dealer: {r.status_code}")

    # ---- summary ----
    print("\n=========== SUMMARY ===========")
    passed = sum(1 for s, _, _ in results if s == "PASS")
    failed = sum(1 for s, _, _ in results if s == "FAIL")
    print(f"PASS: {passed}/{len(results)}, FAIL: {failed}")
    if failed:
        print("\nFAILURES:")
        for s, n, info in results:
            if s == "FAIL":
                print(f"  - {n}: {info}")
        sys.exit(1)

if __name__ == "__main__":
    main()
