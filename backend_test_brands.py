"""Backend tests for /api/brands endpoints + automatic brand persistence on tool save.

Per review request:
  1. GET /api/brands (initially returns existing brand list, may be empty)
  2. POST /api/brands {"name":"Test Brand"} -> 200 + {id,name,created_at}
  3. POST same name (different case) -> EXISTING brand, no duplicate
  4. POST /api/tools with brand -> auto-saved to /api/brands
  5. PUT /api/tools with new brand -> auto-saved to /api/brands
  6. DELETE /api/brands/{id} -> removed from GET
  7. No regressions on /api/auth/login, /api/tools
"""
import os
import sys
import requests

BACKEND_URL = "https://toolbox-vault-v3.preview.emergentagent.com"
API = f"{BACKEND_URL}/api"
EMAIL = "MechanicLTZ@gmail.com"
PASSWORD = "Blue321!"

results = []

def log(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}: {name}{(' — ' + detail) if detail else ''}")


def main():
    # ---- Step 7a — login (existing endpoint regression) ----
    r = requests.post(
        f"{API}/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    if r.status_code != 200:
        log("login", False, f"status={r.status_code} body={r.text[:200]}")
        return finish()
    body = r.json()
    token = body.get("token")
    if not token:
        log("login", False, f"no token field in response: {body}")
        return finish()
    log("login (Step 7)", True, f"token len={len(token)}")
    H = {"Authorization": f"Bearer {token}"}

    # ---- Step 1 — GET /api/brands (initial) ----
    r = requests.get(f"{API}/brands", headers=H, timeout=30)
    if r.status_code != 200:
        log("Step 1: GET /api/brands initial", False, f"status={r.status_code} body={r.text[:200]}")
        return finish()
    initial_brands = r.json()
    if not isinstance(initial_brands, list):
        log("Step 1: GET /api/brands initial", False, f"expected list, got {type(initial_brands)}")
        return finish()
    initial_names = {b.get("name", "").lower() for b in initial_brands}
    log("Step 1: GET /api/brands initial", True, f"count={len(initial_brands)}")

    # ---- Cleanup: if a leftover "Test Brand" or "AutoBrand Special" or
    # "YetAnotherBrand" exists from a previous run, delete first so tests
    # are reproducible. We re-add them as part of the test.
    leftover_ids = []
    for b in initial_brands:
        nm = (b.get("name") or "").lower()
        if nm in {"test brand", "autobrand special", "yetanotherbrand"}:
            leftover_ids.append(b.get("id"))
    for bid in leftover_ids:
        requests.delete(f"{API}/brands/{bid}", headers=H, timeout=15)
    if leftover_ids:
        print(f"  (pre-cleanup: deleted {len(leftover_ids)} leftover brand(s))")
        # Re-fetch
        r = requests.get(f"{API}/brands", headers=H, timeout=30)
        initial_brands = r.json()
        initial_names = {b.get("name", "").lower() for b in initial_brands}

    # ---- Step 2 — POST /api/brands {"name":"Test Brand"} ----
    r = requests.post(f"{API}/brands", headers=H, json={"name": "Test Brand"}, timeout=30)
    if r.status_code != 200:
        log("Step 2: POST /api/brands", False, f"status={r.status_code} body={r.text[:200]}")
        return finish()
    created = r.json()
    missing = [k for k in ("id", "name", "created_at") if k not in created]
    if missing:
        log("Step 2: POST /api/brands schema", False, f"missing fields: {missing}; body={created}")
        return finish()
    if created.get("name") != "Test Brand":
        log("Step 2: POST /api/brands name echo", False, f"got name={created.get('name')!r}")
        return finish()
    test_brand_id = created["id"]
    log("Step 2: POST /api/brands", True, f"id={test_brand_id} name={created['name']!r} created_at={created['created_at']}")

    # ---- Step 3 — POST same name different case -> EXISTING brand ----
    r = requests.post(f"{API}/brands", headers=H, json={"name": "test brand"}, timeout=30)
    if r.status_code != 200:
        log("Step 3: POST duplicate case", False, f"status={r.status_code} body={r.text[:200]}")
        return finish()
    dup = r.json()
    if dup.get("id") != test_brand_id:
        log("Step 3: POST duplicate (case-insensitive)", False,
            f"expected same id={test_brand_id}, got id={dup.get('id')} (NEW brand created — case-insensitive upsert NOT working)")
        return finish()
    log("Step 3: POST duplicate (case-insensitive)", True, f"reused id={dup['id']}, original name preserved={dup['name']!r}")

    # Also confirm GET /api/brands shows only ONE 'test brand' entry
    r = requests.get(f"{API}/brands", headers=H, timeout=30)
    brands = r.json()
    matching = [b for b in brands if b.get("name", "").lower() == "test brand"]
    if len(matching) != 1:
        log("Step 3b: only one 'Test Brand' in list", False, f"found {len(matching)} matches: {matching}")
        return finish()
    log("Step 3b: only one 'Test Brand' in list", True, "no duplicate row")

    # ---- Step 4 — Create tool with brand 'AutoBrand Special', confirm auto-saved ----
    tool_payload = {
        "name": "AutoBrand Tool",
        "brand": "AutoBrand Special",
        "cost": 10,
        "location_id": None,
    }
    r = requests.post(f"{API}/tools", headers=H, json=tool_payload, timeout=30)
    if r.status_code != 200:
        log("Step 4: POST /api/tools", False, f"status={r.status_code} body={r.text[:200]}")
        return finish()
    tool_obj = r.json()
    tool_id = tool_obj.get("id")
    if not tool_id:
        log("Step 4: POST /api/tools id", False, f"no id in body: {tool_obj}")
        return finish()
    if tool_obj.get("brand") != "AutoBrand Special":
        log("Step 4: POST /api/tools brand echo", False, f"got brand={tool_obj.get('brand')!r}")
        return finish()
    log("Step 4a: POST /api/tools with brand", True, f"tool_id={tool_id}")

    # Now GET /api/brands → should contain 'AutoBrand Special'
    r = requests.get(f"{API}/brands", headers=H, timeout=30)
    brands = r.json()
    auto_brand = next((b for b in brands if b.get("name") == "AutoBrand Special"), None)
    if not auto_brand:
        names = [b.get("name") for b in brands]
        log("Step 4b: AutoBrand Special appears in GET /api/brands", False,
            f"NOT found. Current brands: {names}")
        return finish()
    log("Step 4b: AutoBrand Special auto-saved on tool create", True,
        f"id={auto_brand['id']} created_at={auto_brand.get('created_at')}")

    # ---- Step 5 — PUT tool with new brand 'YetAnotherBrand', confirm auto-saved ----
    r = requests.put(
        f"{API}/tools/{tool_id}",
        headers=H,
        json={"brand": "YetAnotherBrand"},
        timeout=30,
    )
    if r.status_code != 200:
        log("Step 5: PUT /api/tools/{id}", False, f"status={r.status_code} body={r.text[:200]}")
        return finish()
    upd = r.json()
    if upd.get("brand") != "YetAnotherBrand":
        log("Step 5: PUT /api/tools brand echo", False, f"got brand={upd.get('brand')!r}")
        return finish()
    log("Step 5a: PUT /api/tools with new brand", True, "200 OK, brand updated")

    r = requests.get(f"{API}/brands", headers=H, timeout=30)
    brands = r.json()
    yab = next((b for b in brands if b.get("name") == "YetAnotherBrand"), None)
    if not yab:
        names = [b.get("name") for b in brands]
        log("Step 5b: YetAnotherBrand appears in GET /api/brands", False,
            f"NOT found. Current brands: {names}")
        return finish()
    log("Step 5b: YetAnotherBrand auto-saved on tool update", True,
        f"id={yab['id']} created_at={yab.get('created_at')}")

    # ---- Step 6 — DELETE /api/brands/{id} ----
    r = requests.delete(f"{API}/brands/{test_brand_id}", headers=H, timeout=30)
    if r.status_code != 200:
        log("Step 6: DELETE /api/brands/{id}", False, f"status={r.status_code} body={r.text[:200]}")
        return finish()
    log("Step 6a: DELETE /api/brands/{id}", True, f"deleted Test Brand id={test_brand_id}")

    r = requests.get(f"{API}/brands", headers=H, timeout=30)
    brands = r.json()
    still_there = next((b for b in brands if b.get("id") == test_brand_id), None)
    if still_there:
        log("Step 6b: Test Brand gone from GET /api/brands", False, f"still present: {still_there}")
        return finish()
    log("Step 6b: Test Brand gone from GET /api/brands", True, "deleted brand absent from list")

    # Double-delete -> should be 404
    r = requests.delete(f"{API}/brands/{test_brand_id}", headers=H, timeout=15)
    if r.status_code != 404:
        log("Step 6c: double-DELETE returns 404", False, f"got {r.status_code} body={r.text[:200]}")
    else:
        log("Step 6c: double-DELETE returns 404", True, "")

    # ---- Step 7 — Existing endpoints still work ----
    # 7a login already done above.
    # 7b GET /api/tools
    r = requests.get(f"{API}/tools", headers=H, timeout=30)
    if r.status_code != 200:
        log("Step 7b: GET /api/tools", False, f"status={r.status_code} body={r.text[:200]}")
    else:
        tools_list = r.json()
        # find our newly created tool
        our = next((t for t in tools_list if t.get("id") == tool_id), None)
        if not our:
            log("Step 7b: GET /api/tools (contains AutoBrand Tool)", False,
                f"created tool {tool_id} not in list of {len(tools_list)}")
        else:
            log("Step 7b: GET /api/tools (regression)", True,
                f"200 OK, {len(tools_list)} tool(s), AutoBrand Tool present with brand={our.get('brand')!r}")

    # ---- Cleanup ----
    # Delete the AutoBrand Tool and the brands we created (AutoBrand Special, YetAnotherBrand)
    try:
        requests.delete(f"{API}/tools/{tool_id}", headers=H, timeout=15)
    except Exception:
        pass
    try:
        if auto_brand:
            requests.delete(f"{API}/brands/{auto_brand['id']}", headers=H, timeout=15)
    except Exception:
        pass
    try:
        if yab:
            requests.delete(f"{API}/brands/{yab['id']}", headers=H, timeout=15)
    except Exception:
        pass
    print("  (cleanup done)")

    finish()


def finish():
    print()
    print("=" * 70)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"TOTAL: {passed} pass / {failed} fail / {len(results)} total")
    if failed:
        print("FAILED:")
        for n, ok, d in results:
            if not ok:
                print(f"  - {n}: {d}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
