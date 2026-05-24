"""
Backend regression test for the POST /api/tools/import bug fix:
"rows.0.cost: Input should be a valid number, unable to parse string as a number"

Validates that ImportRow.cost / ImportRow.quantity now accept Optional[Any]
and the tolerant _to_float / _to_int parsers strip commas, currency symbols,
and whitespace before coercing.
"""
import os
import sys
import requests

BACKEND_URL = "https://asset-locator-12.preview.emergentagent.com"
API = f"{BACKEND_URL}/api"

EMAIL = "subtest@example.com"
PASSWORD = "password123"


def _login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def main():
    failures, passes = [], []

    def check(label, cond, detail=""):
        if cond:
            passes.append(label); print(f"  PASS  {label}")
        else:
            failures.append(f"{label}  {detail}"); print(f"  FAIL  {label}  {detail}")

    print("=" * 70)
    print("Test: POST /api/tools/import — tolerant cost/quantity parsing")
    print("=" * 70)

    print("\n[1] Login")
    tok = _login()
    h = _h(tok)
    check("login as subtest@example.com", bool(tok))

    print("\n[2] Pre-flight: ensure premium tier (free=10 tool cap)")
    sub_before = requests.get(f"{API}/subscription", headers=h, timeout=20).json()
    tier_before = (sub_before.get("subscription") or {}).get("tier", "free")
    print(f"  current tier: {tier_before}, current tool count: {sub_before.get('counts', {}).get('tools')}")
    if tier_before == "free":
        r = requests.post(f"{API}/subscription/subscribe", headers=h, json={"tier": "monthly"}, timeout=20)
        check("upgrade to monthly for test", r.status_code == 200, f"status={r.status_code}")

    pre_existing = requests.get(f"{API}/tools", headers=h, timeout=30).json()
    pre_existing_ids = {t["id"] for t in pre_existing}
    print(f"  pre-existing tool count: {len(pre_existing_ids)}")

    print("\n[3] POST /api/tools/import with 8 thorny rows (1 invalid name expected)")
    body = {
        "rows": [
            {"name": "Widget A", "cost": "13,500.00", "quantity": "5"},
            {"name": "Widget B", "cost": "$1,200.50", "quantity": 2},
            {"name": "Widget C", "cost": "1234", "quantity": "1 ea"},
            {"name": "Widget D", "cost": "", "quantity": ""},
            {"name": "Widget E", "cost": 99.99, "quantity": 3},
            {"name": "Widget F", "cost": "garbage", "quantity": "garbage"},
            {"name": "Widget G", "cost": "13.500,00", "quantity": "1"},
            {"name": "", "cost": "1.0", "quantity": "1"},
        ],
        "create_missing_categories": True,
        "create_missing_tags": True,
    }
    r = requests.post(f"{API}/tools/import", headers=h, json=body, timeout=60)
    print(f"  HTTP status: {r.status_code}")
    print(f"  body: {r.text[:600]}")

    check("POST /api/tools/import returns 200 (not 422)",
          r.status_code == 200, f"got {r.status_code}: {r.text[:200]}")

    if r.status_code != 200:
        print("\n[!] Cannot continue verification — bailing.")
        if tier_before == "free":
            requests.post(f"{API}/subscription/subscribe", headers=h, json={"tier": "free"}, timeout=20)
        sys.exit(1)

    resp = r.json()
    created = resp.get("created")
    errors = resp.get("errors") or []
    check("response.created == 7", created == 7, f"got created={created}")
    check("response.errors has at least 1 entry", len(errors) >= 1, f"errors={errors}")
    check("errors mention the empty-name row",
          any("name" in str(e).lower() or "required" in str(e).lower() for e in errors),
          f"errors={errors}")

    print("\n[4] GET /api/tools and verify each created Widget")
    after = requests.get(f"{API}/tools", headers=h, timeout=30).json()
    new_tools = [t for t in after if t["id"] not in pre_existing_ids and t.get("name", "").startswith("Widget ")]
    by_name = {t["name"]: t for t in new_tools}
    print(f"  new Widget tools: {len(new_tools)} -> {sorted(by_name.keys())}")

    check("7 new Widget tools persisted", len(new_tools) == 7, f"found {len(new_tools)}")

    expectations = [
        ("Widget A", 13500.00, 5),
        ("Widget B", 1200.50, 2),
        ("Widget C", 1234.00, 1),
        ("Widget D", 0.0, 1),
        ("Widget E", 99.99, 3),
        ("Widget F", 0.0, 1),
    ]
    for name, expected_cost, expected_qty in expectations:
        t = by_name.get(name)
        if not t:
            check(f"{name} present", False, "missing"); continue
        cost = float(t.get("cost") or 0.0)
        qty = int(t.get("quantity") or 0)
        check(f"{name}.cost == {expected_cost}", abs(cost - expected_cost) < 0.005, f"got cost={cost}")
        check(f"{name}.quantity == {expected_qty}", qty == expected_qty, f"got qty={qty}")

    if "Widget G" in by_name:
        gc = by_name["Widget G"].get("cost")
        check("Widget G created without 500 (cost numeric)",
              isinstance(gc, (int, float)), f"got cost={gc!r}")
        acceptable = (abs(float(gc) - 13.5) < 0.005 or
                      abs(float(gc) - 13500.0) < 0.005 or
                      float(gc) == 0.0)
        check("Widget G.cost in {13.5, 13500.0, 0.0} (lenient — review allows any non-500)",
              acceptable, f"got {gc}")

    print("\n[5] CLEANUP: deleting widget tools")
    deleted = 0
    for t in new_tools:
        dr = requests.delete(f"{API}/tools/{t['id']}", headers=h, timeout=20)
        if dr.status_code == 200:
            deleted += 1
    check(f"deleted all {len(new_tools)} widgets", deleted == len(new_tools), f"deleted={deleted}")

    print("\n[6] SMOKE: GET /api/tools/export-fields")
    r = requests.get(f"{API}/tools/export-fields", headers=h, timeout=20)
    check("GET /api/tools/export-fields → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        fields = (r.json() or {}).get("fields") or []
        ids = [f.get("id") for f in fields]
        check("export-fields contains expected ids",
              all(x in ids for x in ["name", "brand", "cost", "quantity"]), f"ids={ids}")

    print("\n[7] SMOKE: POST /api/tools (normal creation flow)")
    smoke_payload = {"name": "Smoke Test Hammer", "brand": "Estwing", "cost": 45.50, "quantity": 1}
    r = requests.post(f"{API}/tools", headers=h, json=smoke_payload, timeout=20)
    check("POST /api/tools (normal) → 200", r.status_code == 200, f"status={r.status_code}: {r.text[:200]}")
    if r.status_code == 200:
        smoke_tool = r.json()
        check("smoke tool has matching name + cost",
              smoke_tool.get("name") == "Smoke Test Hammer" and smoke_tool.get("cost") == 45.5,
              str(smoke_tool)[:200])
        requests.delete(f"{API}/tools/{smoke_tool['id']}", headers=h, timeout=20)

    print("\n[8] Restore subtest tier")
    if tier_before == "free":
        rr = requests.post(f"{API}/subscription/subscribe", headers=h, json={"tier": "free"}, timeout=20)
        check("revert to free tier", rr.status_code == 200, f"status={rr.status_code}")

    print("\n" + "=" * 70)
    print(f"RESULTS: {len(passes)} passed, {len(failures)} failed")
    print("=" * 70)
    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("\nAll checks PASSED.")


if __name__ == "__main__":
    main()
