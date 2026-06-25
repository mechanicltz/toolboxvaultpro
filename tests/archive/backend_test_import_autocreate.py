"""
Regression test for POST /api/tools/import — verifies NEW auto-create behavior
for Locations and Dealers (and confirms dedup still works for Categories, Tags,
Locations, Dealers).

Run against EXPO_PUBLIC_BACKEND_URL/api with subtest@example.com / password123.
"""
import os
import sys
import time
import requests
from typing import List, Dict, Any, Optional


def _req(method: str, url: str, **kw):
    kw.setdefault("timeout", 60)
    last = None
    for i in range(4):
        try:
            r = requests.request(method, url, **kw)
            # touch .content to force full read
            _ = r.content
            return r
        except Exception as e:
            last = e
            time.sleep(1 + i)
    raise last


# monkey-patch requests.get/post/delete for retries
_orig_get = requests.get
_orig_post = requests.post
_orig_delete = requests.delete
requests.get = lambda url, **kw: _req("GET", url, **kw)
requests.post = lambda url, **kw: _req("POST", url, **kw)
requests.delete = lambda url, **kw: _req("DELETE", url, **kw)

BASE = "https://toolbox-vault-v3.preview.emergentagent.com/api"
EMAIL = "subtest@example.com"
PASSWORD = "password123"

# unique strings unlikely to already exist
CAT_NAME = "AC_TestCategory_42"
LOC_NAME = "AC_TestLocation_42"
DLR_NAME = "AC_TestDealer_42"
TAGS_EXPECTED = {"acred", "acblue", "acgreen"}

# step 2
NC_LOC = "AC_NoCreate_99"
NC_DLR = "AC_NoCreateD_99"

results: List[tuple] = []  # list of (name, passed, detail)


def check(name: str, cond: bool, detail: str = ""):
    results.append((name, bool(cond), detail))
    tag = "PASS" if cond else "FAIL"
    print(f"[{tag}] {name}" + (f" -- {detail}" if detail else ""))


def login() -> str:
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token: {r.text}"
    return tok


def h(tok: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def find_ci(items: List[Dict[str, Any]], name: str) -> List[Dict[str, Any]]:
    low = name.lower()
    return [it for it in items if (it.get("name") or "").lower() == low]


def delete_tools_named(tok: str, prefix_names: List[str]):
    r = requests.get(f"{BASE}/tools", headers=h(tok), timeout=30)
    if r.status_code != 200:
        return
    deleted = 0
    for t in r.json():
        tn = t.get("name") or ""
        if tn in prefix_names:
            dr = requests.delete(f"{BASE}/tools/{t.get('id')}", headers=h(tok), timeout=30)
            if dr.status_code == 200:
                deleted += 1
    print(f"  cleanup: deleted {deleted} tools")


def delete_entity_ci(tok: str, endpoint: str, name: str) -> int:
    r = requests.get(f"{BASE}/{endpoint}", headers=h(tok), timeout=30)
    if r.status_code != 200:
        return 0
    hits = find_ci(r.json(), name)
    deleted = 0
    for e in hits:
        eid = e.get("id")
        if not eid:
            continue
        dr = requests.delete(f"{BASE}/{endpoint}/{eid}", headers=h(tok), timeout=30)
        if dr.status_code == 200:
            deleted += 1
    return deleted


def full_cleanup(tok: str):
    print("\n=== CLEANUP ===")
    delete_tools_named(tok, [
        "AC1 Hammer", "AC2 Drill", "AC3 Saw",  # step 1 and step 3
        "AC4 Wrench",                          # step 2
    ])
    c = delete_entity_ci(tok, "categories", CAT_NAME)
    print(f"  deleted categories matching {CAT_NAME}: {c}")
    for tname in TAGS_EXPECTED:
        dt = delete_entity_ci(tok, "tags", tname)
        print(f"  deleted tags matching {tname}: {dt}")
    # also clean 3rd-row "AcRed" variant just in case
    l = delete_entity_ci(tok, "locations", LOC_NAME)
    print(f"  deleted locations matching {LOC_NAME}: {l}")
    d = delete_entity_ci(tok, "dealers", DLR_NAME)
    print(f"  deleted dealers matching {DLR_NAME}: {d}")


def ensure_baseline_absent(tok: str):
    """Make sure the unique names we will create don't already exist."""
    for ep, nm in [
        ("categories", CAT_NAME),
        ("locations", LOC_NAME),
        ("dealers", DLR_NAME),
        ("locations", NC_LOC),
        ("dealers", NC_DLR),
    ]:
        r = requests.get(f"{BASE}/{ep}", headers=h(tok), timeout=30)
        if r.status_code == 200:
            hits = find_ci(r.json(), nm)
            if hits:
                print(f"  WARN: pre-existing {ep} '{nm}' found ({len(hits)}). Deleting for clean start...")
                for hit in hits:
                    requests.delete(f"{BASE}/{ep}/{hit.get('id')}", headers=h(tok), timeout=30)
    # tags
    r = requests.get(f"{BASE}/tags", headers=h(tok), timeout=30)
    if r.status_code == 200:
        for tname in TAGS_EXPECTED:
            hits = find_ci(r.json(), tname)
            if hits:
                print(f"  WARN: pre-existing tag '{tname}' found. Deleting for clean start...")
                for hit in hits:
                    requests.delete(f"{BASE}/tags/{hit.get('id')}", headers=h(tok), timeout=30)


def step1(tok: str) -> Dict[str, Any]:
    print("\n=== STEP 1: Auto-create test ===")
    body = {
        "rows": [
            {"name": "AC1 Hammer", "category": CAT_NAME, "tags": "acred,acblue",
             "location": LOC_NAME, "dealer": DLR_NAME},
            {"name": "AC2 Drill", "category": CAT_NAME, "tags": "acred,acgreen",
             "location": LOC_NAME, "dealer": DLR_NAME},
            {"name": "AC3 Saw", "category": CAT_NAME.lower(), "tags": "AcRed",
             "location": LOC_NAME.lower(), "dealer": DLR_NAME.upper()},
        ],
        "create_missing_categories": True,
        "create_missing_tags": True,
        "create_missing_locations": True,
        "create_missing_dealers": True,
    }
    r = requests.post(f"{BASE}/tools/import", headers=h(tok), json=body, timeout=60)
    check("STEP1: import returned 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code != 200:
        return {}
    resp = r.json()
    check("STEP1: response.created == 3", resp.get("created") == 3, f"created={resp.get('created')} errors={resp.get('errors')}")
    ac = resp.get("auto_created") or {}
    check("STEP1: response has 'auto_created' key", isinstance(ac, dict), f"got={type(ac)}")

    cats = ac.get("categories") or []
    check("STEP1: auto_created.categories == 1 entry", len(cats) == 1, f"count={len(cats)} items={cats}")
    if cats:
        check(f"STEP1: auto_created.categories[0].name == {CAT_NAME!r}",
              (cats[0].get("name") or "") == CAT_NAME,
              f"got={cats[0].get('name')}")

    locs = ac.get("locations") or []
    check("STEP1: auto_created.locations == 1 entry", len(locs) == 1, f"count={len(locs)} items={locs}")
    if locs:
        check(f"STEP1: auto_created.locations[0].name == {LOC_NAME!r}",
              (locs[0].get("name") or "") == LOC_NAME,
              f"got={locs[0].get('name')}")

    dlrs = ac.get("dealers") or []
    check("STEP1: auto_created.dealers == 1 entry", len(dlrs) == 1, f"count={len(dlrs)} items={dlrs}")
    if dlrs:
        check(f"STEP1: auto_created.dealers[0].name == {DLR_NAME!r}",
              (dlrs[0].get("name") or "") == DLR_NAME,
              f"got={dlrs[0].get('name')}")

    tag_entries = ac.get("tags") or []
    check("STEP1: auto_created.tags == 3 entries (case-insensitive dedup)",
          len(tag_entries) == 3,
          f"count={len(tag_entries)} items={tag_entries}")
    got_tag_names_ci = {(t.get("name") or "").lower() for t in tag_entries}
    check("STEP1: auto_created.tags names == {acred, acblue, acgreen} (case-insensitive)",
          got_tag_names_ci == TAGS_EXPECTED,
          f"got={got_tag_names_ci}")

    # Verify 3 tools point at the same category_id, location_id, dealer_id
    r = requests.get(f"{BASE}/tools", headers=h(tok), timeout=30)
    assert r.status_code == 200
    all_tools = r.json()
    ours = {t["name"]: t for t in all_tools if t.get("name") in ("AC1 Hammer", "AC2 Drill", "AC3 Saw")}
    check("STEP1: 3 tools found via GET /api/tools", len(ours) == 3, f"found={list(ours.keys())}")

    if len(ours) == 3:
        t1, t2, t3 = ours["AC1 Hammer"], ours["AC2 Drill"], ours["AC3 Saw"]
        check("STEP1: all 3 tools share same category_id",
              t1.get("category_id") == t2.get("category_id") == t3.get("category_id") and t1.get("category_id"),
              f"ids={[t1.get('category_id'), t2.get('category_id'), t3.get('category_id')]}")
        check("STEP1: all 3 tools share same location_id",
              t1.get("location_id") == t2.get("location_id") == t3.get("location_id") and t1.get("location_id"),
              f"ids={[t1.get('location_id'), t2.get('location_id'), t3.get('location_id')]}")
        check("STEP1: all 3 tools share same dealer_id",
              t1.get("dealer_id") == t2.get("dealer_id") == t3.get("dealer_id") and t1.get("dealer_id"),
              f"ids={[t1.get('dealer_id'), t2.get('dealer_id'), t3.get('dealer_id')]}")

        t1tags = t1.get("tag_ids") or []
        t2tags = t2.get("tag_ids") or []
        t3tags = t3.get("tag_ids") or []
        check("STEP1: AC1 has 2 tag_ids (acred, acblue)", len(t1tags) == 2, f"len={len(t1tags)} ids={t1tags}")
        check("STEP1: AC2 has 2 tag_ids (acred, acgreen)", len(t2tags) == 2, f"len={len(t2tags)} ids={t2tags}")
        check("STEP1: AC3 has 1 tag_id (AcRed -> acred)", len(t3tags) == 1, f"len={len(t3tags)} ids={t3tags}")
        union = set(t1tags) | set(t2tags) | set(t3tags)
        check("STEP1: union of all tag_ids has exactly 3 distinct tag ids",
              len(union) == 3, f"distinct_count={len(union)} ids={union}")
        # AC3's AcRed should be the same id as one of AC1's/AC2's acred
        if t3tags:
            check("STEP1: AC3 single tag id is a subset of AC1+AC2 tag ids (case-insensitive dedup)",
                  set(t3tags).issubset(set(t1tags) | set(t2tags)),
                  f"AC3={t3tags} union(AC1,AC2)={set(t1tags)|set(t2tags)}")

    # Verify via GET /api/categories exactly ONE category with name CAT_NAME (ci)
    rcat = requests.get(f"{BASE}/categories", headers=h(tok), timeout=30)
    check("STEP1: GET /api/categories returns 200", rcat.status_code == 200)
    if rcat.status_code == 200:
        hits = find_ci(rcat.json(), CAT_NAME)
        check(f"STEP1: exactly ONE category with name matching {CAT_NAME!r} (case-insensitive)",
              len(hits) == 1, f"count={len(hits)} hits={[c.get('name') for c in hits]}")

    rloc = requests.get(f"{BASE}/locations", headers=h(tok), timeout=30)
    check("STEP1: GET /api/locations returns 200", rloc.status_code == 200)
    if rloc.status_code == 200:
        hits = find_ci(rloc.json(), LOC_NAME)
        check(f"STEP1: exactly ONE location with name matching {LOC_NAME!r} (case-insensitive)",
              len(hits) == 1, f"count={len(hits)} hits={[c.get('name') for c in hits]}")

    rdlr = requests.get(f"{BASE}/dealers", headers=h(tok), timeout=30)
    check("STEP1: GET /api/dealers returns 200", rdlr.status_code == 200)
    if rdlr.status_code == 200:
        hits = find_ci(rdlr.json(), DLR_NAME)
        check(f"STEP1: exactly ONE dealer with name matching {DLR_NAME!r} (case-insensitive)",
              len(hits) == 1, f"count={len(hits)} hits={[c.get('name') for c in hits]}")

    # capture ids for step 3 comparison
    step1_state = {
        "category_id": cats[0].get("id") if cats else None,
        "location_id": locs[0].get("id") if locs else None,
        "dealer_id": dlrs[0].get("id") if dlrs else None,
        "tag_ids": sorted([t.get("id") for t in tag_entries]),
    }
    return step1_state


def step2(tok: str):
    print("\n=== STEP 2: Skip flag test (no auto-create) ===")
    body = {
        "rows": [
            {"name": "AC4 Wrench", "location": NC_LOC, "dealer": NC_DLR},
        ],
        "create_missing_locations": False,
        "create_missing_dealers": False,
    }
    r = requests.post(f"{BASE}/tools/import", headers=h(tok), json=body, timeout=30)
    check("STEP2: import returned 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code != 200:
        return
    resp = r.json()
    check("STEP2: response.created == 1", resp.get("created") == 1, f"got={resp.get('created')} errors={resp.get('errors')}")
    ac = resp.get("auto_created") or {}
    check("STEP2: auto_created.locations == [] (empty)",
          ac.get("locations") == [], f"got={ac.get('locations')}")
    check("STEP2: auto_created.dealers == [] (empty)",
          ac.get("dealers") == [], f"got={ac.get('dealers')}")

    # Tool should exist with location_id=None, dealer_id=None
    rt = requests.get(f"{BASE}/tools", headers=h(tok), timeout=30)
    tool = None
    if rt.status_code == 200:
        for t in rt.json():
            if t.get("name") == "AC4 Wrench":
                tool = t
                break
    check("STEP2: AC4 Wrench tool exists", tool is not None)
    if tool:
        check("STEP2: AC4 Wrench location_id is null/None",
              tool.get("location_id") in (None, ""),
              f"got={tool.get('location_id')!r}")
        check("STEP2: AC4 Wrench dealer_id is null/None",
              tool.get("dealer_id") in (None, ""),
              f"got={tool.get('dealer_id')!r}")

    # GET /api/locations does NOT contain NC_LOC (case-insensitive)
    rloc = requests.get(f"{BASE}/locations", headers=h(tok), timeout=30)
    if rloc.status_code == 200:
        hits = find_ci(rloc.json(), NC_LOC)
        check(f"STEP2: GET /api/locations does NOT contain {NC_LOC!r}",
              len(hits) == 0, f"unexpected hits={[l.get('name') for l in hits]}")

    rdlr = requests.get(f"{BASE}/dealers", headers=h(tok), timeout=30)
    if rdlr.status_code == 200:
        hits = find_ci(rdlr.json(), NC_DLR)
        check(f"STEP2: GET /api/dealers does NOT contain {NC_DLR!r}",
              len(hits) == 0, f"unexpected hits={[d.get('name') for d in hits]}")


def step3(tok: str, step1_state: Dict[str, Any]):
    print("\n=== STEP 3: Dedup with existing test (re-run step 1) ===")
    body = {
        "rows": [
            {"name": "AC1 Hammer", "category": CAT_NAME, "tags": "acred,acblue",
             "location": LOC_NAME, "dealer": DLR_NAME},
            {"name": "AC2 Drill", "category": CAT_NAME, "tags": "acred,acgreen",
             "location": LOC_NAME, "dealer": DLR_NAME},
            {"name": "AC3 Saw", "category": CAT_NAME.lower(), "tags": "AcRed",
             "location": LOC_NAME.lower(), "dealer": DLR_NAME.upper()},
        ],
        "create_missing_categories": True,
        "create_missing_tags": True,
        "create_missing_locations": True,
        "create_missing_dealers": True,
    }
    r = requests.post(f"{BASE}/tools/import", headers=h(tok), json=body, timeout=60)
    check("STEP3: import returned 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code != 200:
        return
    resp = r.json()
    check("STEP3: response.created == 3 (new tools)", resp.get("created") == 3, f"got={resp.get('created')}")
    ac = resp.get("auto_created") or {}
    check("STEP3: auto_created.categories == [] (dedup hit)", ac.get("categories") == [], f"got={ac.get('categories')}")
    check("STEP3: auto_created.tags == [] (dedup hit)", ac.get("tags") == [], f"got={ac.get('tags')}")
    check("STEP3: auto_created.locations == [] (dedup hit)", ac.get("locations") == [], f"got={ac.get('locations')}")
    check("STEP3: auto_created.dealers == [] (dedup hit)", ac.get("dealers") == [], f"got={ac.get('dealers')}")

    # Verify the 3 new tools (second set) point at same ids as step 1
    rt = requests.get(f"{BASE}/tools", headers=h(tok), timeout=30)
    if rt.status_code != 200:
        check("STEP3: could list tools", False, f"status={rt.status_code}")
        return
    all_tools = rt.json()
    ours = [t for t in all_tools if t.get("name") in ("AC1 Hammer", "AC2 Drill", "AC3 Saw")]
    # there should be 6 tools named these now (3 from step 1 + 3 from step 3)
    check("STEP3: total tools with AC1/AC2/AC3 names == 6 (3 from step1 + 3 from step3)",
          len(ours) == 6, f"count={len(ours)}")

    # All should share the same ids as step 1
    s1_cat = step1_state.get("category_id")
    s1_loc = step1_state.get("location_id")
    s1_dlr = step1_state.get("dealer_id")
    s1_tag_ids_set = set(step1_state.get("tag_ids") or [])

    all_same_cat = all(t.get("category_id") == s1_cat for t in ours)
    all_same_loc = all(t.get("location_id") == s1_loc for t in ours)
    all_same_dlr = all(t.get("dealer_id") == s1_dlr for t in ours)
    check("STEP3: all 6 tools share step1 category_id", all_same_cat,
          f"s1={s1_cat} actual={[t.get('category_id') for t in ours]}")
    check("STEP3: all 6 tools share step1 location_id", all_same_loc,
          f"s1={s1_loc} actual={[t.get('location_id') for t in ours]}")
    check("STEP3: all 6 tools share step1 dealer_id", all_same_dlr,
          f"s1={s1_dlr} actual={[t.get('dealer_id') for t in ours]}")

    # Tag ids: every tag_id on these tools must be in step1's set
    union_tags = set()
    for t in ours:
        for tid in (t.get("tag_ids") or []):
            union_tags.add(tid)
    check("STEP3: tag_ids across all 6 tools are a subset of step1 tag ids (no new tags)",
          union_tags.issubset(s1_tag_ids_set) and len(union_tags) == 3,
          f"union={union_tags} s1_set={s1_tag_ids_set}")


def main():
    print(f"BASE: {BASE}")
    print(f"Login as {EMAIL}...")
    try:
        tok = login()
    except Exception as e:
        print(f"FATAL: login failed: {e}")
        sys.exit(2)
    print("Login ok.")

    try:
        ensure_baseline_absent(tok)
        s1 = step1(tok)
        step2(tok)
        step3(tok, s1)
    finally:
        full_cleanup(tok)

    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print("\n================ SUMMARY ================")
    print(f"PASS: {passed}")
    print(f"FAIL: {failed}")
    if failed:
        print("\nFailed checks:")
        for name, ok, detail in results:
            if not ok:
                print(f"  - {name} :: {detail}")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
