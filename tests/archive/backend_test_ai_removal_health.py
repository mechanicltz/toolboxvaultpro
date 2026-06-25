"""
Post-AI-removal backend health smoke test.

Verifies:
A) auth/login + auth/me
B) core CRUD endpoints (tools, dealers, brands, wishlist, claims summary, stats, aggregate, maintenance upcoming)
C) removed AI endpoints (/api/ai/receipt-scan, /api/ocr/receipt) return 404
D) /api/subscription works
E) /api/reports/render works (does not 500)
"""
import os
import uuid
import json
import requests

BASE = "http://localhost:8001/api"
ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASS = "Blue321!"

results = []  # (name, passed, status, note)


def record(name, passed, status, note=""):
    results.append((name, passed, status, note))
    flag = "PASS" if passed else "FAIL"
    print(f"[{flag}] {name} → status={status} {note}")


def main():
    s = requests.Session()
    s.headers["Content-Type"] = "application/json"

    # ===== A) AUTH =====
    print("\n=== A) AUTH ===")
    r = s.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    try:
        body = r.json()
    except Exception:
        body = {}
    token = body.get("access_token") or body.get("token")
    ok = r.status_code == 200 and bool(token)
    record("POST /auth/login (admin)", ok, r.status_code,
           f"has_token={bool(token)}")
    if not ok:
        print("Cannot continue without token; body:", r.text[:300])
        return

    auth_headers = {"Authorization": f"Bearer {token}"}

    r = s.get(f"{BASE}/auth/me", headers=auth_headers)
    ok = r.status_code == 200 and isinstance(r.json(), dict) and r.json().get("email", "").lower() == ADMIN_EMAIL.lower()
    record("GET /auth/me", ok, r.status_code, f"email={r.json().get('email') if r.ok else r.text[:120]}")

    # ===== B) CORE CRUD =====
    print("\n=== B) CORE CRUD ===")

    r = s.get(f"{BASE}/tools", headers=auth_headers)
    record("GET /tools", r.status_code == 200, r.status_code,
           f"count={len(r.json()) if r.ok and isinstance(r.json(), list) else 'n/a'}")

    # Create + delete a minimal tool
    minimal_tool = {
        "name": f"SmokeTool-{uuid.uuid4().hex[:8]}",
        "cost": 1.0,
        "quantity": 1,
    }
    r = s.post(f"{BASE}/tools", headers=auth_headers, json=minimal_tool)
    tool_id = None
    if r.status_code == 200:
        try:
            tool_id = r.json().get("id")
        except Exception:
            pass
    record("POST /tools (create minimal)", r.status_code == 200 and tool_id is not None,
           r.status_code, f"id={tool_id} body={r.text[:160] if r.status_code != 200 else ''}")

    if tool_id:
        r = s.delete(f"{BASE}/tools/{tool_id}", headers=auth_headers)
        record("DELETE /tools/{id} (cleanup)", r.status_code == 200, r.status_code, r.text[:120])
    else:
        record("DELETE /tools/{id} (cleanup)", False, "SKIP", "no tool_id from create")

    r = s.get(f"{BASE}/dealers", headers=auth_headers)
    record("GET /dealers", r.status_code == 200, r.status_code,
           f"count={len(r.json()) if r.ok and isinstance(r.json(), list) else 'n/a'}")

    r = s.get(f"{BASE}/brands", headers=auth_headers)
    record("GET /brands", r.status_code == 200, r.status_code,
           f"count={len(r.json()) if r.ok and isinstance(r.json(), list) else 'n/a'}")

    r = s.get(f"{BASE}/wishlist", headers=auth_headers)
    record("GET /wishlist", r.status_code == 200, r.status_code,
           f"count={len(r.json()) if r.ok and isinstance(r.json(), list) else 'n/a'}")

    r = s.get(f"{BASE}/warranty-claims/summary", headers=auth_headers)
    record("GET /warranty-claims/summary", r.status_code == 200, r.status_code,
           r.text[:120] if r.status_code != 200 else "ok")

    r = s.get(f"{BASE}/stats", headers=auth_headers)
    record("GET /stats", r.status_code == 200, r.status_code,
           r.text[:120] if r.status_code != 200 else "ok")

    r = s.get(f"{BASE}/aggregate", headers=auth_headers)
    record("GET /aggregate", r.status_code == 200, r.status_code,
           r.text[:120] if r.status_code != 200 else "ok")

    r = s.get(f"{BASE}/maintenance/upcoming?days=30", headers=auth_headers)
    record("GET /maintenance/upcoming?days=30", r.status_code == 200, r.status_code,
           r.text[:120] if r.status_code != 200 else "ok")

    # ===== C) Removed AI endpoints — expect 404 =====
    print("\n=== C) REMOVED AI ENDPOINTS (expect 404) ===")
    r = s.post(f"{BASE}/ai/receipt-scan", headers=auth_headers, json={"image_base64": "x"})
    record("POST /ai/receipt-scan (gone)", r.status_code == 404, r.status_code,
           f"body={r.text[:160]}")

    r = s.post(f"{BASE}/ocr/receipt", headers=auth_headers, json={"image_base64": "x"})
    record("POST /ocr/receipt (gone)", r.status_code == 404, r.status_code,
           f"body={r.text[:160]}")

    # ===== D) Subscription =====
    print("\n=== D) SUBSCRIPTION ===")
    r = s.get(f"{BASE}/subscription", headers=auth_headers)
    record("GET /subscription", r.status_code == 200, r.status_code,
           r.text[:160] if r.status_code != 200 else "ok")

    # ===== E) Reports render =====
    print("\n=== E) REPORTS RENDER (inventory pdf) ===")
    r = s.post(f"{BASE}/reports/render", headers=auth_headers,
               json={"report_type": "inventory", "format": "pdf", "options": {}})
    ok = r.status_code == 200
    ctype = r.headers.get("content-type", "")
    note = f"content-type={ctype}, bytes={len(r.content)}"
    if not ok:
        note += f" body={r.text[:200]}"
    record("POST /reports/render (inventory pdf)", ok, r.status_code, note)

    # ==== SUMMARY ====
    print("\n=== SUMMARY ===")
    passed = sum(1 for _, p, _, _ in results if p)
    total = len(results)
    print(f"{passed}/{total} checks passed")
    for name, p, status, note in results:
        flag = "✅" if p else "❌"
        print(f"  {flag} {name} [{status}]  {note}")

    return passed == total


if __name__ == "__main__":
    ok = main()
    raise SystemExit(0 if ok else 1)
