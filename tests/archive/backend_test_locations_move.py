"""
Backend test — PUT /api/locations/{id} move-to-root support.

Verifies review request:
1) Login
2) POST /api/locations {name:"TestGarage_MoveRoot"} -> G
3) POST /api/locations {name:"TestToolbox_MoveRoot", parent_id:G} -> T
4) GET /api/locations -> T.parent_id == G
5) PUT /api/locations/T {parent_id:null} -> 200; GET -> T.parent_id null/missing
6) PUT /api/locations/T {parent_id:G} -> 200; GET -> T.parent_id == G
7) Cycle guard: POST D with parent_id=T; PUT G {parent_id:D} -> 400 'cycle'
8) Rename-only: PUT T {name:'...Renamed'} -> name changed AND parent_id stays G
9) Cleanup DELETE T (cascade? default non-cascade reparents children)
   — but we need to drop D too. Use DELETE with cascade=true.
10) Smoke: GET /api/tools 200, GET /api/stats 200, GET /api/dealers 200
"""
import os
import sys
import requests

BASE = "https://toolbox-vault-v3.preview.emergentagent.com/api"
EMAIL = "subtest@example.com"
PASSWORD = "password123"

results = []


def rec(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}: {name}" + (f"  [{detail}]" if detail else ""))


def main():
    # 1) Login
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    rec("1. Login", r.status_code == 200 and "token" in r.json(), f"status={r.status_code}")
    if r.status_code != 200:
        return summary()
    token = r.json()["token"]
    H = {"Authorization": f"Bearer {token}"}

    # Cleanup any leftover test locations first
    r0 = requests.get(f"{BASE}/locations", headers=H, timeout=30)
    leftover_names = {"TestGarage_MoveRoot", "TestToolbox_MoveRoot", "TestToolbox_MoveRoot_Renamed", "TestDrawer_MoveRoot"}
    if r0.status_code == 200:
        for loc in r0.json():
            if loc.get("name") in leftover_names:
                requests.delete(f"{BASE}/locations/{loc['id']}?cascade=true", headers=H, timeout=30)

    # 2) POST G
    r = requests.post(f"{BASE}/locations", headers=H, json={"name": "TestGarage_MoveRoot"}, timeout=30)
    rec("2. POST Garage G", r.status_code == 200 and r.json().get("name") == "TestGarage_MoveRoot", f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return summary()
    G = r.json()["id"]

    # 3) POST T with parent=G
    r = requests.post(f"{BASE}/locations", headers=H, json={"name": "TestToolbox_MoveRoot", "parent_id": G}, timeout=30)
    ok = r.status_code == 200 and r.json().get("parent_id") == G
    rec("3. POST Toolbox T (parent=G)", ok, f"status={r.status_code} parent_id={r.json().get('parent_id') if r.status_code==200 else r.text[:200]}")
    if not ok:
        return cleanup_and_summary(H, [G])
    T = r.json()["id"]

    # 4) GET list; confirm T.parent_id == G
    r = requests.get(f"{BASE}/locations", headers=H, timeout=30)
    t_row = next((x for x in r.json() if x.get("id") == T), None) if r.status_code == 200 else None
    rec("4. GET confirms T.parent_id == G", bool(t_row) and t_row.get("parent_id") == G, f"t_row_parent={(t_row or {}).get('parent_id')}")

    # 5) PUT T {parent_id: null} -> 200, then GET -> T.parent_id null or missing
    r = requests.put(f"{BASE}/locations/{T}", headers=H, json={"parent_id": None}, timeout=30)
    rec("5a. PUT T parent_id=null returns 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    body5 = r.json() if r.status_code == 200 else {}
    rec("5b. PUT response has parent_id null/absent", body5.get("parent_id") in (None, ""), f"parent_id={body5.get('parent_id')!r}")

    r = requests.get(f"{BASE}/locations", headers=H, timeout=30)
    t_row = next((x for x in r.json() if x.get("id") == T), None) if r.status_code == 200 else None
    rec("5c. GET confirms T at root (parent_id null or missing)", bool(t_row) and t_row.get("parent_id") in (None, ""), f"t_row_parent={(t_row or {}).get('parent_id')!r}")

    # 6) PUT T {parent_id: G} -> 200; GET confirms parent=G
    r = requests.put(f"{BASE}/locations/{T}", headers=H, json={"parent_id": G}, timeout=30)
    rec("6a. PUT T parent_id=G returns 200", r.status_code == 200 and r.json().get("parent_id") == G, f"status={r.status_code} parent={r.json().get('parent_id') if r.status_code==200 else r.text[:200]}")
    r = requests.get(f"{BASE}/locations", headers=H, timeout=30)
    t_row = next((x for x in r.json() if x.get("id") == T), None) if r.status_code == 200 else None
    rec("6b. GET confirms T.parent_id == G", bool(t_row) and t_row.get("parent_id") == G, f"t_row_parent={(t_row or {}).get('parent_id')}")

    # 7) Cycle guard: Create D with parent=T; PUT G {parent_id:D} -> 400 w/ 'cycle'
    r = requests.post(f"{BASE}/locations", headers=H, json={"name": "TestDrawer_MoveRoot", "parent_id": T}, timeout=30)
    ok = r.status_code == 200 and r.json().get("parent_id") == T
    rec("7a. POST Drawer D (parent=T)", ok, f"status={r.status_code}")
    D = r.json()["id"] if ok else None

    if D:
        r = requests.put(f"{BASE}/locations/{G}", headers=H, json={"parent_id": D}, timeout=30)
        body_txt = r.text
        cycle_detected = r.status_code == 400 and "cycle" in body_txt.lower()
        rec("7b. PUT G parent_id=D -> 400 with 'cycle'", cycle_detected, f"status={r.status_code} body={body_txt[:300]}")

    # 8) Rename-only: PUT T {name:'..._Renamed'} -> 200; name changed AND parent_id still G
    r = requests.put(f"{BASE}/locations/{T}", headers=H, json={"name": "TestToolbox_MoveRoot_Renamed"}, timeout=30)
    ok = r.status_code == 200
    rec("8a. PUT T name-only returns 200", ok, f"status={r.status_code} body={r.text[:200]}")
    if ok:
        body8 = r.json()
        rec("8b. Response name updated", body8.get("name") == "TestToolbox_MoveRoot_Renamed", f"name={body8.get('name')}")
        rec("8c. Response parent_id PRESERVED as G (rename-only must not clobber parent)", body8.get("parent_id") == G, f"parent_id={body8.get('parent_id')!r} (expected {G})")
    r = requests.get(f"{BASE}/locations", headers=H, timeout=30)
    t_row = next((x for x in r.json() if x.get("id") == T), None) if r.status_code == 200 else None
    rec("8d. GET confirms T name renamed AND parent=G", bool(t_row) and t_row.get("name") == "TestToolbox_MoveRoot_Renamed" and t_row.get("parent_id") == G, f"row={t_row}")

    # 9) Cleanup
    # Delete T with cascade so D goes too
    r = requests.delete(f"{BASE}/locations/{T}?cascade=true", headers=H, timeout=30)
    rec("9a. DELETE T (cascade) -> 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    r = requests.delete(f"{BASE}/locations/{G}", headers=H, timeout=30)
    rec("9b. DELETE G -> 200", r.status_code == 200, f"status={r.status_code}")
    r = requests.get(f"{BASE}/locations", headers=H, timeout=30)
    names = [x.get("name") for x in r.json()] if r.status_code == 200 else []
    leftovers = [n for n in names if n in leftover_names]
    rec("9c. No test locations remain", not leftovers, f"leftovers={leftovers}")

    # 10) Smoke
    r = requests.get(f"{BASE}/tools", headers=H, timeout=30)
    rec("10a. GET /api/tools 200", r.status_code == 200, f"status={r.status_code}")
    r = requests.get(f"{BASE}/stats", headers=H, timeout=30)
    rec("10b. GET /api/stats 200", r.status_code == 200, f"status={r.status_code}")
    r = requests.get(f"{BASE}/dealers", headers=H, timeout=30)
    rec("10c. GET /api/dealers 200", r.status_code == 200, f"status={r.status_code}")

    return summary()


def cleanup_and_summary(H, ids):
    for i in ids:
        try:
            requests.delete(f"{BASE}/locations/{i}?cascade=true", headers=H, timeout=30)
        except Exception:
            pass
    return summary()


def summary():
    total = len(results)
    fails = [r for r in results if not r[1]]
    print("\n" + "=" * 60)
    print(f"RESULTS: {total - len(fails)}/{total} passed, {len(fails)} failed")
    if fails:
        print("\nFAILURES:")
        for n, _, d in fails:
            print(f"  - {n}: {d}")
    return len(fails) == 0


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
