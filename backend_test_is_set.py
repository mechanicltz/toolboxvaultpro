"""
Verification test for new is_set + set_serials fields on the Tool model.
"""
import os
import sys
import json
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://asset-locator-12.preview.emergentagent.com").rstrip("/") + "/api"
EMAIL = "subtest@example.com"
PASSWORD = "password123"

passes = 0
fails = []


def check(cond, label):
    global passes
    if cond:
        passes += 1
        print(f"  PASS  {label}")
    else:
        fails.append(label)
        print(f"  FAIL  {label}")


def login():
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def main():
    token = login()
    H = {"Authorization": f"Bearer {token}"}

    # Step 1: single tool
    print("\n[1] Create single tool (no set)")
    r = requests.post(f"{BASE}/tools", headers=H, json={
        "name": "Test Hammer Single",
        "brand": "Acme",
        "serial_number": "HAM-001",
    }, timeout=30)
    check(r.status_code == 200, f"POST /tools (single) -> 200 (got {r.status_code}: {r.text[:200]})")
    t_single = r.json()
    single_id = t_single.get("id")
    check(t_single.get("is_set") is False, f"single.is_set == False (got {t_single.get('is_set')!r})")
    check(t_single.get("set_serials") == [], f"single.set_serials == [] (got {t_single.get('set_serials')!r})")
    check(t_single.get("serial_number") == "HAM-001", f"single.serial_number == 'HAM-001' (got {t_single.get('serial_number')!r})")

    # Step 2: set tool with 3 serials
    print("\n[2] Create tool marked as set with 3 serials")
    r = requests.post(f"{BASE}/tools", headers=H, json={
        "name": "Test Wrench Set",
        "brand": "Acme",
        "is_set": True,
        "set_serials": ["WR-A-001", "WR-A-002", "WR-A-003"],
    }, timeout=30)
    check(r.status_code == 200, f"POST /tools (set) -> 200 (got {r.status_code}: {r.text[:200]})")
    t_set = r.json()
    set_id = t_set.get("id")
    check(t_set.get("is_set") is True, f"set.is_set == True (got {t_set.get('is_set')!r})")
    check(t_set.get("set_serials") == ["WR-A-001", "WR-A-002", "WR-A-003"],
          f"set.set_serials == expected (got {t_set.get('set_serials')!r})")

    # Step 3: GET each
    print("\n[3] GET /api/tools/{id} for both")
    r = requests.get(f"{BASE}/tools/{single_id}", headers=H, timeout=30)
    check(r.status_code == 200, f"GET /tools/{single_id[:8]} -> 200")
    s = r.json()
    check(s.get("is_set") is False, "GET single.is_set == False")
    check(s.get("set_serials") == [], "GET single.set_serials == []")
    check(s.get("serial_number") == "HAM-001", "GET single.serial_number persists")

    r = requests.get(f"{BASE}/tools/{set_id}", headers=H, timeout=30)
    check(r.status_code == 200, f"GET /tools/{set_id[:8]} -> 200")
    s = r.json()
    check(s.get("is_set") is True, "GET set.is_set == True")
    check(s.get("set_serials") == ["WR-A-001", "WR-A-002", "WR-A-003"], "GET set.set_serials persists")

    # Step 4: update single to become a set
    print("\n[4] PUT single tool -> is_set=true + set_serials")
    r = requests.put(f"{BASE}/tools/{single_id}", headers=H, json={
        "is_set": True,
        "set_serials": ["ABC-1", "ABC-2"],
    }, timeout=30)
    check(r.status_code == 200, f"PUT single -> 200 (got {r.status_code}: {r.text[:200]})")
    u = r.json()
    check(u.get("is_set") is True, f"PUT single.is_set == True (got {u.get('is_set')!r})")
    check(u.get("set_serials") == ["ABC-1", "ABC-2"], f"PUT single.set_serials == expected (got {u.get('set_serials')!r})")

    # Step 5: update set tool — new list
    print("\n[5] PUT set tool — new set_serials list")
    new_list = ["WR-A-001", "WR-A-003", "WR-A-004", "WR-A-005"]
    r = requests.put(f"{BASE}/tools/{set_id}", headers=H, json={"set_serials": new_list}, timeout=30)
    check(r.status_code == 200, f"PUT set -> 200 (got {r.status_code}: {r.text[:200]})")
    u = r.json()
    check(u.get("set_serials") == new_list, f"PUT set.set_serials == expected (got {u.get('set_serials')!r})")
    check(u.get("is_set") is True, "PUT set.is_set still True")

    # Step 6: list endpoint
    print("\n[6] GET /api/tools — list")
    r = requests.get(f"{BASE}/tools", headers=H, timeout=30)
    check(r.status_code == 200, f"GET /tools -> 200")
    tools = r.json()
    tool_by_id = {t["id"]: t for t in tools}
    check(single_id in tool_by_id, "single tool present in list")
    check(set_id in tool_by_id, "set tool present in list")
    if single_id in tool_by_id:
        ts = tool_by_id[single_id]
        check(ts.get("is_set") is True, "list[single].is_set reflects update (True)")
        check(ts.get("set_serials") == ["ABC-1", "ABC-2"], "list[single].set_serials correct")
    if set_id in tool_by_id:
        ts = tool_by_id[set_id]
        check(ts.get("is_set") is True, "list[set].is_set == True")
        check(ts.get("set_serials") == new_list, "list[set].set_serials correct")

    # Step 7: search by set serial
    print("\n[7] GET /api/tools?search=WR-A-004 — should find the set")
    r = requests.get(f"{BASE}/tools", headers=H, params={"search": "WR-A-004"}, timeout=30)
    check(r.status_code == 200, "GET /tools?search=WR-A-004 -> 200")
    results = r.json()
    ids_found = [t["id"] for t in results]
    check(set_id in ids_found, f"search WR-A-004 finds set tool (found {len(ids_found)} tools, ids: {[i[:8] for i in ids_found]})")
    check(single_id not in ids_found, "search WR-A-004 does NOT match single tool (which has ABC-1/ABC-2)")

    # bonus: search ABC-1 should find updated single
    r2 = requests.get(f"{BASE}/tools", headers=H, params={"search": "ABC-1"}, timeout=30)
    if r2.status_code == 200:
        ids2 = [t["id"] for t in r2.json()]
        check(single_id in ids2, "search ABC-1 finds updated single (now a set)")

    # Step 8: cleanup
    print("\n[8] DELETE both test tools")
    r = requests.delete(f"{BASE}/tools/{single_id}", headers=H, timeout=30)
    check(r.status_code == 200, f"DELETE single -> 200 (got {r.status_code})")
    r = requests.delete(f"{BASE}/tools/{set_id}", headers=H, timeout=30)
    check(r.status_code == 200, f"DELETE set -> 200 (got {r.status_code})")

    # verify 404
    r = requests.get(f"{BASE}/tools/{single_id}", headers=H, timeout=30)
    check(r.status_code == 404, f"GET deleted single -> 404 (got {r.status_code})")
    r = requests.get(f"{BASE}/tools/{set_id}", headers=H, timeout=30)
    check(r.status_code == 404, f"GET deleted set -> 404 (got {r.status_code})")

    print(f"\n===== RESULT: {passes} PASS, {len(fails)} FAIL =====")
    if fails:
        print("\nFailures:")
        for f in fails:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    main()
