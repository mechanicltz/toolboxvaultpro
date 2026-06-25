"""
Backend Performance Phase A regression tests.

Tests the rewritten /stats, /aggregate, and /warranty-claims/summary endpoints
against http://localhost:8001/api with admin MechanicLTZ@gmail.com / Blue321!.

See /app/test_result.md → backend_perf_phase_a.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

import requests

BASE = "http://localhost:8001/api"
ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASS = "Blue321!"

results: List[Tuple[str, bool, str]] = []


def record(name: str, passed: bool, detail: str = "") -> bool:
    results.append((name, passed, detail))
    icon = "PASS" if passed else "FAIL"
    print(f"[{icon}] {name}" + (f" — {detail}" if detail else ""))
    return passed


def login() -> str:
    r = requests.post(
        f"{BASE}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("token") or body.get("access_token")
    assert tok, f"No token in login response: {body}"
    return tok


def hdr(tok: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {tok}"}


def main() -> int:
    tok = login()
    record("login admin", True, "200 + JWT")

    # G — Smoke checks first to catch any boot regression
    print("\n=== G) Smoke health check ===")
    me = requests.get(f"{BASE}/auth/me", headers=hdr(tok), timeout=10)
    record("GET /auth/me", me.status_code == 200, f"status={me.status_code}")

    tools = requests.get(f"{BASE}/tools", headers=hdr(tok), timeout=10)
    record("GET /tools", tools.status_code == 200, f"count={len(tools.json()) if tools.ok else 'n/a'}")

    for path in ("dealers", "brands", "wishlist", "locations", "tags", "categories", "subscription"):
        r = requests.get(f"{BASE}/{path}", headers=hdr(tok), timeout=10)
        record(f"GET /{path}", r.status_code == 200, f"status={r.status_code}")

    r = requests.get(f"{BASE}/maintenance/upcoming?days=30", headers=hdr(tok), timeout=10)
    record("GET /maintenance/upcoming?days=30", r.status_code == 200, f"status={r.status_code}")

    r = requests.post(
        f"{BASE}/reports/render",
        headers=hdr(tok),
        json={"report_type": "inventory", "format": "pdf", "options": {}},
        timeout=30,
    )
    ok = r.status_code == 200 and r.headers.get("content-type", "").startswith("application/pdf") and len(r.content) > 500
    record("POST /reports/render inventory PDF", ok,
           f"status={r.status_code} ct={r.headers.get('content-type')} bytes={len(r.content)}")

    # CRUD roundtrip on tools
    payload = {"name": "PerfPhaseA Smoke Tool", "cost": 9.99, "quantity": 1}
    cr = requests.post(f"{BASE}/tools", headers=hdr(tok), json=payload, timeout=10)
    if cr.status_code == 200:
        tid = cr.json().get("id")
        record("POST /tools (create)", True, f"id={tid}")
        dr = requests.delete(f"{BASE}/tools/{tid}", headers=hdr(tok), timeout=10)
        record("DELETE /tools/{id}", dr.status_code == 200, f"status={dr.status_code}")
    else:
        record("POST /tools (create)", False, f"status={cr.status_code} body={cr.text[:200]}")

    # Fetch stats + aggregate
    print("\n=== A) Cross-endpoint consistency stats vs aggregate ===")
    stats_r = requests.get(f"{BASE}/stats", headers=hdr(tok), timeout=15)
    record("GET /stats", stats_r.status_code == 200, f"status={stats_r.status_code}")
    agg_r = requests.get(f"{BASE}/aggregate", headers=hdr(tok), timeout=15)
    record("GET /aggregate", agg_r.status_code == 200, f"status={agg_r.status_code}")

    if not (stats_r.ok and agg_r.ok):
        print("Cannot continue — stats/aggregate failed.")
        return 1

    stats = stats_r.json()
    agg = agg_r.json()
    print("STATS:", json.dumps(stats, indent=2))
    print("AGGREGATE:", json.dumps(agg, indent=2))

    # Cross-checks. Note: aggregate by default excludes is_sold==true, but
    # /stats counts ALL tools (no is_sold filter). For the admin account
    # which has 1 tool needing repair and not sold, these should match.
    record("stats.total_tools == aggregate.count",
           stats["total_tools"] == agg["count"],
           f"{stats['total_tools']} vs {agg['count']}")
    record("stats.checked_out == aggregate.checked_out",
           stats["checked_out"] == agg["checked_out"],
           f"{stats['checked_out']} vs {agg['checked_out']}")
    record("stats.available == aggregate.available",
           stats["available"] == agg["available"],
           f"{stats['available']} vs {agg['available']}")
    record("stats.consumables == aggregate.consumables",
           stats["consumables"] == agg["consumables"],
           f"{stats['consumables']} vs {agg['consumables']}")
    record("stats.needs_repair == aggregate.needs_repair",
           stats["needs_repair"] == agg["needs_repair"],
           f"{stats['needs_repair']} vs {agg['needs_repair']}")
    record("stats.total_value == aggregate.total_value (±0.01)",
           abs(float(stats["total_value"]) - float(agg["total_value"])) <= 0.01,
           f"{stats['total_value']} vs {agg['total_value']}")

    # B — new fields
    print("\n=== B) New /aggregate fields for_sale + lost ===")
    has_for_sale = "for_sale" in agg and isinstance(agg["for_sale"], int)
    has_lost = "lost" in agg and isinstance(agg["lost"], int)
    record("aggregate has int for_sale", has_for_sale, f"value={agg.get('for_sale')!r}")
    record("aggregate has int lost", has_lost, f"value={agg.get('lost')!r}")
    record("aggregate.for_sale == 0 (admin has 1 tool, not for sale)",
           agg.get("for_sale") == 0, f"value={agg.get('for_sale')}")
    record("aggregate.lost == 0 (admin has 1 tool, not lost)",
           agg.get("lost") == 0, f"value={agg.get('lost')}")

    # C — em-dash bucketing
    print("\n=== C) Em-dash bucketing in breakdowns ===")
    em = "\u2014"
    for key in ("location_breakdown", "category_breakdown", "dealer_breakdown"):
        bd = agg.get(key) or {}
        keys = list(bd.keys())
        # admin has 1 tool with no location/category/dealer => should have '—': 1
        # If total==1 and no other keys, expected exactly {em: 1}
        ok = em in keys and bd.get(em, 0) >= 1
        record(f"{key} has '—' key", ok, f"keys={keys} value@em={bd.get(em)}")

    # D — Filter params on /aggregate
    print("\n=== D) /aggregate filter params still work ===")
    r1 = requests.get(f"{BASE}/aggregate?needs_repair=true", headers=hdr(tok), timeout=10)
    if r1.ok:
        d1 = r1.json()
        record("needs_repair=true count==1", d1.get("count") == 1, f"count={d1.get('count')}")
        # cost*qty: fetch the broken tool to verify total_value
        ttools = tools.json() if tools.ok else []
        broken = [t for t in ttools if t.get("needs_repair")]
        if broken:
            t = broken[0]
            expected = float(t.get("cost") or 0) * float(t.get("quantity") or 1)
            record(
                "needs_repair=true total_value == cost*qty",
                abs(float(d1.get("total_value") or 0) - expected) <= 0.01,
                f"got={d1.get('total_value')} expected={expected}",
            )
    else:
        record("GET /aggregate?needs_repair=true", False, f"status={r1.status_code}")

    r2 = requests.get(f"{BASE}/aggregate?needs_repair=false", headers=hdr(tok), timeout=10)
    if r2.ok:
        d2 = r2.json()
        record("needs_repair=false count==0", d2.get("count") == 0, f"count={d2.get('count')}")
    else:
        record("GET /aggregate?needs_repair=false", False, f"status={r2.status_code}")

    r3 = requests.get(f"{BASE}/aggregate?search=nonexistent_string_xyz_zzz", headers=hdr(tok), timeout=10)
    if r3.ok:
        d3 = r3.json()
        record(
            "search nonexistent count==0 & empty breakdowns",
            d3.get("count") == 0 and not d3.get("location_breakdown") and not d3.get("category_breakdown") and not d3.get("dealer_breakdown"),
            f"count={d3.get('count')} loc={d3.get('location_breakdown')} cat={d3.get('category_breakdown')} deal={d3.get('dealer_breakdown')}",
        )
    else:
        record("GET /aggregate?search=...", False, f"status={r3.status_code}")

    # E — Warranty claims summary stability
    print("\n=== E) /warranty-claims/summary stability + sum check ===")
    sums = []
    for i in range(3):
        rs = requests.get(f"{BASE}/warranty-claims/summary", headers=hdr(tok), timeout=10)
        if rs.ok:
            sums.append(rs.json())
        else:
            record(f"GET /warranty-claims/summary call {i+1}", False, f"status={rs.status_code}")
            break
        time.sleep(0.05)
    if len(sums) == 3:
        all_equal = sums[0] == sums[1] == sums[2]
        record("3x /warranty-claims/summary identical responses", all_equal,
               f"all_equal={all_equal}")
        # Sum check: totals.total == archived false + archived true counts
        active = requests.get(f"{BASE}/warranty-claims?archived=false", headers=hdr(tok), timeout=10)
        archived = requests.get(f"{BASE}/warranty-claims?archived=true", headers=hdr(tok), timeout=10)
        if active.ok and archived.ok:
            n_active = len(active.json())
            n_archived = len(archived.json())
            totals = sums[0].get("totals") or {}
            record(
                "summary.totals.total == active + archived",
                totals.get("total") == n_active + n_archived,
                f"totals.total={totals.get('total')} active={n_active} archived={n_archived}",
            )
            record(
                "summary.totals.open == len(active)",
                totals.get("open") == n_active,
                f"open={totals.get('open')} active_len={n_active}",
            )
        else:
            record("GET /warranty-claims active+archived", False,
                   f"active={active.status_code} archived={archived.status_code}")

    # F — Free-tier visibility cap regression (run full suite)
    print("\n=== F) Free-tier visibility cap regression ===")
    import subprocess
    proc = subprocess.run(
        [sys.executable, "/app/backend_test_free_visibility_cap.py"],
        capture_output=True, text=True, timeout=180,
    )
    out = proc.stdout + proc.stderr
    # Try to parse summary line
    summary_line = ""
    for line in out.splitlines()[-20:]:
        if "PASS" in line or "FAIL" in line or "passed" in line.lower():
            summary_line += line + " | "
    # Determine pass via exit code
    cap_pass = proc.returncode == 0
    record("free-tier visibility cap suite (exit==0)", cap_pass,
           f"exit={proc.returncode} tail={summary_line[:300]}")
    if not cap_pass:
        # print full output for diagnosis
        print("---- free_visibility_cap.py output (last 2000 chars) ----")
        print(out[-2000:])

    # H — Backend log cleanliness
    print("\n=== H) Backend log cleanliness ===")
    err_log = Path("/var/log/supervisor/backend.err.log")
    out_log = Path("/var/log/supervisor/backend.out.log")
    bad_lines: List[str] = []
    for lp in (err_log, out_log):
        if not lp.exists():
            continue
        try:
            tail = lp.read_text(errors="ignore").splitlines()[-300:]
        except Exception as e:
            print(f"Could not read {lp}: {e}")
            continue
        for ln in tail:
            low = ln.lower()
            if "traceback" in low:
                bad_lines.append(f"{lp.name}: {ln}")
            elif " 500 " in ln or '"500"' in ln:
                bad_lines.append(f"{lp.name}: {ln}")
            elif "error" in low and "backup scheduler" not in low and "rate_limit" not in low:
                # ignore mongo-stub style or scheduler info
                if "ERROR" in ln:
                    bad_lines.append(f"{lp.name}: {ln}")
    record("no Traceback / 500 / ERROR in recent backend logs",
           len(bad_lines) == 0,
           f"bad_count={len(bad_lines)} first_few={bad_lines[:3]}")

    # Final summary
    print("\n" + "=" * 70)
    n_pass = sum(1 for _, p, _ in results if p)
    n_total = len(results)
    print(f"TOTAL: {n_pass}/{n_total} PASS")
    print("=" * 70)
    for name, p, det in results:
        if not p:
            print(f"  FAILED: {name} — {det}")

    return 0 if n_pass == n_total else 1


if __name__ == "__main__":
    sys.exit(main())
