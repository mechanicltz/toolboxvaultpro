"""Regression test: warranty-claim cascade delete on tool deletion.

Tests:
1. Single-tool cascade: DELETE /api/tools/{id} removes warranty claim(s).
2. Bulk-delete cascade: POST /api/tools/bulk action='delete' removes claims.
3. Orphan purge helper: GET /api/warranty-claims and /summary do not surface
   stale claims after their tools were deleted.
4. Cleanup leaves no test fixtures.
5. Smoke endpoints still 200.
"""

import os
import sys
import requests

BASE = "https://asset-locator-12.preview.emergentagent.com/api"
EMAIL = "subtest@example.com"
PASSWORD = "password123"

PASS = []
FAIL = []


def check(cond, label, info=""):
    if cond:
        PASS.append(label)
        print(f"  PASS  {label}")
    else:
        FAIL.append(f"{label} :: {info}")
        print(f"  FAIL  {label}  --  {info}")


def login():
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["token"]


def main():
    token = login()
    H = {"Authorization": f"Bearer {token}"}

    print("\n[Setup] Create dealer + tool with broken flag")

    # ---- 1. Single-tool cascade ----
    r = requests.post(f"{BASE}/dealers", json={"name": "CD_TestDealer1"}, headers=H, timeout=30)
    check(r.status_code == 200, "POST /dealers CD_TestDealer1 -> 200", f"{r.status_code} {r.text[:200]}")
    if r.status_code != 200:
        return summarize()
    D1 = r.json()
    D1_id = D1["id"]

    tool1_payload = {
        "name": "CD_T1",
        "dealer_id": D1_id,
        "dealer_name": "CD_TestDealer1",
        "needs_repair": True,
        "repair_info": {
            "repair_status": "Reported",
            "company_notified": "X",
            "contact": "",
            "notes": "",
        },
    }
    r = requests.post(f"{BASE}/tools", json=tool1_payload, headers=H, timeout=30)
    check(r.status_code == 200, "POST /tools T1 (broken) -> 200", f"{r.status_code} {r.text[:200]}")
    if r.status_code != 200:
        # cleanup dealer and bail
        requests.delete(f"{BASE}/dealers/{D1_id}", headers=H, timeout=30)
        return summarize()
    T1 = r.json()
    T1_id = T1["id"]
    check(T1.get("needs_repair") is True, "T1 returned with needs_repair=true",
          f"got {T1.get('needs_repair')}")

    # Verify the auto-created claim
    r = requests.get(f"{BASE}/warranty-claims", params={"tool_id": T1_id}, headers=H, timeout=30)
    check(r.status_code == 200, "GET /warranty-claims?tool_id=T1.id -> 200", f"{r.status_code}")
    claims_before = r.json() if r.status_code == 200 else []
    check(len(claims_before) >= 1, "Exactly 1 claim auto-created for T1 (>=1 ok)",
          f"got {len(claims_before)} claims")
    C1_id = claims_before[0]["id"] if claims_before else None

    # Verify summary contains D1 with open>=1
    r = requests.get(f"{BASE}/warranty-claims/summary", headers=H, timeout=30)
    check(r.status_code == 200, "GET /warranty-claims/summary -> 200", f"{r.status_code}")
    summary_before = r.json() if r.status_code == 200 else {"dealers": [], "totals": {}}
    open_before_total = summary_before.get("totals", {}).get("open", 0)
    d1_entry_before = next(
        (d for d in summary_before.get("dealers", []) if d.get("dealer_id") == D1_id), None
    )
    check(
        d1_entry_before is not None and d1_entry_before.get("open", 0) >= 1,
        "Summary.dealers contains D1 with open>=1",
        f"d1_entry={d1_entry_before}",
    )

    # DELETE the tool
    r = requests.delete(f"{BASE}/tools/{T1_id}", headers=H, timeout=30)
    check(r.status_code == 200, "DELETE /tools/{T1.id} -> 200", f"{r.status_code} {r.text[:200]}")

    # Verify claim is gone
    r = requests.get(f"{BASE}/warranty-claims", params={"tool_id": T1_id}, headers=H, timeout=30)
    check(r.status_code == 200, "GET /warranty-claims?tool_id=T1 (post-delete) -> 200",
          f"{r.status_code}")
    after = r.json() if r.status_code == 200 else None
    check(isinstance(after, list) and len(after) == 0,
          "GET /warranty-claims?tool_id=T1 returns EMPTY after tool delete",
          f"got {after}")

    # Also verify by claim id
    if C1_id:
        r = requests.get(f"{BASE}/warranty-claims/{C1_id}", headers=H, timeout=30)
        check(r.status_code == 404, "GET /warranty-claims/{C1.id} -> 404 (cascade-deleted)",
              f"got {r.status_code}")

    # Summary should show D1 open count decreased (or D1 absent)
    r = requests.get(f"{BASE}/warranty-claims/summary", headers=H, timeout=30)
    check(r.status_code == 200, "GET /warranty-claims/summary (post-delete) -> 200",
          f"{r.status_code}")
    summary_after = r.json() if r.status_code == 200 else {"dealers": [], "totals": {}}
    open_after_total = summary_after.get("totals", {}).get("open", 0)
    check(
        open_after_total == open_before_total - 1,
        f"Summary totals.open decreased by exactly 1 (before={open_before_total}, after={open_after_total})",
        f"diff={open_before_total - open_after_total}",
    )
    d1_entry_after = next(
        (d for d in summary_after.get("dealers", []) if d.get("dealer_id") == D1_id), None
    )
    if d1_entry_after is None:
        check(True, "D1 absent from summary.dealers (had no other claims) — acceptable")
    else:
        prev_open = d1_entry_before["open"] if d1_entry_before else 0
        check(
            d1_entry_after.get("open", 0) == prev_open - 1,
            f"D1's open count decreased by 1 (was {prev_open}, now {d1_entry_after.get('open')})",
            "",
        )

    # ---- 2. Bulk-delete cascade ----
    print("\n[Bulk] Create T2, T3 each with needs_repair=true at D1")

    tool_payload_template = lambda name: {
        "name": name,
        "dealer_id": D1_id,
        "dealer_name": "CD_TestDealer1",
        "needs_repair": True,
        "repair_info": {
            "repair_status": "Reported",
            "company_notified": "Y",
            "contact": "",
            "notes": "",
        },
    }

    r2 = requests.post(f"{BASE}/tools", json=tool_payload_template("CD_T2"), headers=H, timeout=30)
    r3 = requests.post(f"{BASE}/tools", json=tool_payload_template("CD_T3"), headers=H, timeout=30)
    check(r2.status_code == 200, "POST /tools T2 -> 200", f"{r2.status_code} {r2.text[:200]}")
    check(r3.status_code == 200, "POST /tools T3 -> 200", f"{r3.status_code} {r3.text[:200]}")
    T2_id = r2.json()["id"] if r2.status_code == 200 else None
    T3_id = r3.json()["id"] if r3.status_code == 200 else None

    if T2_id and T3_id:
        r = requests.get(f"{BASE}/warranty-claims", params={"dealer_id": D1_id}, headers=H, timeout=30)
        d1_claims = r.json() if r.status_code == 200 else []
        # filter to ones for T2, T3 specifically (active)
        t2t3_claims = [c for c in d1_claims if c.get("tool_id") in (T2_id, T3_id)]
        check(
            len(t2t3_claims) >= 2,
            "GET /warranty-claims?dealer_id=D1 has >=2 claims for T2+T3",
            f"got {len(t2t3_claims)}",
        )

        # Bulk delete
        r = requests.post(
            f"{BASE}/tools/bulk",
            json={"tool_ids": [T2_id, T3_id], "action": "delete"},
            headers=H,
            timeout=30,
        )
        check(r.status_code == 200, "POST /tools/bulk delete [T2,T3] -> 200",
              f"{r.status_code} {r.text[:200]}")
        if r.status_code == 200:
            j = r.json()
            check(j.get("affected") == 2, "bulk delete affected==2",
                  f"got {j.get('affected')}")

        # Verify those 2 claims are gone
        r = requests.get(f"{BASE}/warranty-claims", params={"dealer_id": D1_id}, headers=H, timeout=30)
        d1_claims_after = r.json() if r.status_code == 200 else []
        remaining_for_t2_t3 = [c for c in d1_claims_after if c.get("tool_id") in (T2_id, T3_id)]
        check(
            len(remaining_for_t2_t3) == 0,
            "After bulk delete, no claims remain for T2 or T3",
            f"still got {len(remaining_for_t2_t3)} claims: {remaining_for_t2_t3}",
        )

    # ---- 3. Orphan purge helper verification (already covered in 1+2 since we
    # deleted via the new endpoint; helper runs on every GET /warranty-claims
    # and /summary). One more explicit check: full /warranty-claims list and
    # /summary work fine and contain no orphans for any deleted tool ids.
    print("\n[Orphan-purge] verify no stale claims surface for deleted tool ids")
    r = requests.get(f"{BASE}/warranty-claims", headers=H, timeout=30)
    check(r.status_code == 200, "GET /warranty-claims (full) -> 200", f"{r.status_code}")
    all_claims = r.json() if r.status_code == 200 else []
    deleted_tool_ids = {tid for tid in (T1_id, T2_id, T3_id) if tid}
    leaked = [c for c in all_claims if c.get("tool_id") in deleted_tool_ids]
    check(
        len(leaked) == 0,
        "No claims surface for any of the just-deleted tool ids",
        f"leaked={leaked}",
    )

    # totals match the actual list length
    r = requests.get(f"{BASE}/warranty-claims/summary", headers=H, timeout=30)
    check(r.status_code == 200, "GET /warranty-claims/summary (final) -> 200", f"{r.status_code}")
    final_summary = r.json() if r.status_code == 200 else {"totals": {}, "dealers": []}
    check(
        final_summary.get("totals", {}).get("total") == len(all_claims),
        f"summary.totals.total == len(GET /warranty-claims) "
        f"({final_summary.get('totals', {}).get('total')} vs {len(all_claims)})",
        "",
    )

    # ---- 4. Cleanup ----
    print("\n[Cleanup] delete dealer D1")
    r = requests.delete(f"{BASE}/dealers/{D1_id}", headers=H, timeout=30)
    check(r.status_code == 200, "DELETE /dealers/D1 -> 200",
          f"{r.status_code} {r.text[:200]}")

    # Confirm no test fixtures left
    r = requests.get(f"{BASE}/dealers", headers=H, timeout=30)
    if r.status_code == 200:
        names = [d.get("name") for d in r.json()]
        check(
            "CD_TestDealer1" not in names,
            "CD_TestDealer1 not in /dealers list",
            f"unexpected names contain CD_TestDealer1: {names}",
        )

    r = requests.get(f"{BASE}/tools", headers=H, timeout=30)
    if r.status_code == 200:
        cd_tools = [t for t in r.json() if str(t.get("name", "")).startswith("CD_T")]
        check(
            len(cd_tools) == 0,
            "No CD_T* test tools remain in /tools",
            f"leftover: {[t.get('name') for t in cd_tools]}",
        )

    # ---- 5. Smoke ----
    print("\n[Smoke]")
    r = requests.get(f"{BASE}/warranty-claims/summary", headers=H, timeout=30)
    check(r.status_code == 200, "Smoke: GET /warranty-claims/summary -> 200",
          f"{r.status_code}")
    r = requests.get(f"{BASE}/dealers", headers=H, timeout=30)
    check(r.status_code == 200, "Smoke: GET /dealers -> 200", f"{r.status_code}")

    return summarize()


def summarize():
    print("\n" + "=" * 60)
    print(f"PASSED: {len(PASS)}")
    print(f"FAILED: {len(FAIL)}")
    if FAIL:
        print("\nFAIL DETAILS:")
        for f in FAIL:
            print(f"  - {f}")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
