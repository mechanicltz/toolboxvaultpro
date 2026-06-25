#!/usr/bin/env python3
"""Re-test step 5 of CSV import after Pydantic Optional[str] fix."""
import os
import sys
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://toolbox-vault-v3.preview.emergentagent.com").rstrip("/") + "/api"

def main():
    results = []
    def check(cond, msg):
        status = "PASS" if cond else "FAIL"
        results.append((status, msg))
        print(f"  [{status}] {msg}")

    # Auth
    print("=== Login ===")
    r = requests.post(f"{BASE}/auth/login", json={"email": "subtest@example.com", "password": "password123"})
    print(f"  login -> {r.status_code}")
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    H = {"Authorization": f"Bearer {token}"}

    # Scenario 1: single row with no name
    print("\n=== Scenario 1: single row missing name ===")
    r = requests.post(f"{BASE}/tools/import", json={"rows": [{"brand": "Foo"}]}, headers=H)
    print(f"  status: {r.status_code}")
    print(f"  body: {r.text[:500]}")
    check(r.status_code == 200, f"Status 200 (not 422). Got {r.status_code}")
    if r.status_code == 200:
        body = r.json()
        check(body.get("created") == 0, f"created == 0. Got {body.get('created')}")
        check(body.get("ids") == [], f"ids == []. Got {body.get('ids')}")
        errs = body.get("errors", [])
        check(len(errs) == 1, f"errors has 1 entry. Got {len(errs)}")
        if errs:
            e = errs[0]
            check(e.get("row") == 1, f"errors[0].row == 1. Got {e.get('row')}")
            check(e.get("name") == "", f"errors[0].name == ''. Got {repr(e.get('name'))}")
            check(e.get("error") == "Name is required", f"errors[0].error == 'Name is required'. Got {repr(e.get('error'))}")

    # Scenario 2: mixed batch
    print("\n=== Scenario 2: mixed batch (3 rows; row 2 missing name) ===")
    payload = {
        "rows": [
            {"name": "Mix-Imported", "brand": "Bar"},
            {"brand": "NoName"},
            {"name": "Mix-Imported-2"},
        ]
    }
    r = requests.post(f"{BASE}/tools/import", json=payload, headers=H)
    print(f"  status: {r.status_code}")
    print(f"  body: {r.text[:500]}")
    check(r.status_code == 200, f"Status 200. Got {r.status_code}")
    created_ids = []
    if r.status_code == 200:
        body = r.json()
        check(body.get("created") == 2, f"created == 2. Got {body.get('created')}")
        errs = body.get("errors", [])
        check(len(errs) == 1, f"errors has 1 entry. Got {len(errs)}")
        if errs:
            e = errs[0]
            check(e.get("row") == 2, f"errors[0].row == 2. Got {e.get('row')}")
            check(e.get("error") == "Name is required", f"errors[0].error == 'Name is required'. Got {repr(e.get('error'))}")
        ids = body.get("ids", [])
        check(len(ids) == 2, f"ids length == 2. Got {len(ids)}")
        created_ids = ids

    # Verify the two tools exist then cleanup
    print("\n=== Cleanup ===")
    for tid in created_ids:
        # verify
        g = requests.get(f"{BASE}/tools/{tid}", headers=H)
        check(g.status_code == 200, f"GET /tools/{tid} == 200 (before delete). Got {g.status_code}")
        if g.status_code == 200:
            nm = g.json().get("name")
            check(nm and nm.startswith("Mix-Imported"), f"tool name starts with Mix-Imported. Got {repr(nm)}")
        # delete
        d = requests.delete(f"{BASE}/tools/{tid}", headers=H)
        print(f"  DELETE /tools/{tid} -> {d.status_code}")
        check(d.status_code == 200, f"DELETE /tools/{tid} == 200")

    print("\n=== Results ===")
    passed = sum(1 for s, _ in results if s == "PASS")
    failed = sum(1 for s, _ in results if s == "FAIL")
    print(f"Passed: {passed} / {len(results)}    Failed: {failed}")
    if failed:
        print("\nFailures:")
        for s, m in results:
            if s == "FAIL":
                print(f"  - {m}")
        sys.exit(1)

if __name__ == "__main__":
    main()
