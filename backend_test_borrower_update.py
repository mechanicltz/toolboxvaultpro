"""
Focused backend test for the new PUT /api/borrowers/{borrower_id} endpoint.

Validates:
- name + contact updates
- propagation of new name into tool.current_checkout (matched by borrower_id)
- propagation of new name into tool.checkout_history[el.borrower_id == id]
- safe propagation when no tools reference the borrower (legacy-only borrower)
- 404 on non-existent borrower
"""

import os
import sys
import requests

# Use the public preview URL exactly as the frontend does
BASE_URL = "https://toolbox-vault-v3.preview.emergentagent.com"
API = f"{BASE_URL}/api"

results = []
created = {"borrowers": [], "tools": []}


def record(label, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    line = f"[{status}] {label}" + (f" — {detail}" if detail else "")
    print(line)
    results.append((ok, label, detail))


def cleanup():
    for tid in created["tools"]:
        try:
            requests.delete(f"{API}/tools/{tid}", timeout=15)
        except Exception:
            pass
    for bid in created["borrowers"]:
        try:
            requests.delete(f"{API}/borrowers/{bid}", timeout=15)
        except Exception:
            pass


def main():
    # 1. Create borrower B1
    r = requests.post(
        f"{API}/borrowers",
        json={"name": "OldNameTest", "contact": "old@example.com"},
        timeout=20,
    )
    record("POST /api/borrowers (create B1=OldNameTest)", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return
    b1 = r.json()
    b1_id = b1["id"]
    created["borrowers"].append(b1_id)
    record("B1 fields name+contact echo", b1.get("name") == "OldNameTest" and b1.get("contact") == "old@example.com")

    # 2. Create a tool
    r = requests.post(
        f"{API}/tools",
        json={
            "name": "Borrower Rename Test Drill",
            "brand": "DeWalt",
            "cost": 149.99,
        },
        timeout=20,
    )
    record("POST /api/tools (create test tool)", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        return
    tool = r.json()
    tool_id = tool["id"]
    created["tools"].append(tool_id)

    # 3. Checkout via OldNameTest with borrower_id=B1
    r = requests.post(
        f"{API}/tools/{tool_id}/checkout",
        json={"borrower_name": "OldNameTest", "borrower_id": b1_id, "notes": "first checkout"},
        timeout=20,
    )
    record("POST /tools/{id}/checkout #1 (OldNameTest, id=B1)", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        t = r.json()
        cur = t.get("current_checkout") or {}
        record(
            "Tool current_checkout stamped with id+name",
            cur.get("borrower_id") == b1_id and cur.get("borrower_name") == "OldNameTest",
            f"current_checkout={cur}",
        )

    # 4. Checkin to push into history
    r = requests.post(f"{API}/tools/{tool_id}/checkin", timeout=20)
    record("POST /tools/{id}/checkin (push to history)", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        t = r.json()
        hist = t.get("checkout_history") or []
        record(
            "checkout_history has 1 entry referencing B1.id",
            len(hist) == 1 and hist[0].get("borrower_id") == b1_id and hist[0].get("borrower_name") == "OldNameTest",
            f"history={hist}",
        )
        record("is_checked_out=False after checkin", t.get("is_checked_out") is False)

    # 5. Checkout AGAIN with same borrower so we have ACTIVE current + history both referencing B1.id
    r = requests.post(
        f"{API}/tools/{tool_id}/checkout",
        json={"borrower_name": "OldNameTest", "borrower_id": b1_id, "notes": "second checkout (active)"},
        timeout=20,
    )
    record("POST /tools/{id}/checkout #2 (active, OldNameTest)", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        t = r.json()
        cur = t.get("current_checkout") or {}
        record(
            "Active current_checkout has borrower_id=B1, name=OldNameTest",
            cur.get("borrower_id") == b1_id and cur.get("borrower_name") == "OldNameTest",
            f"current_checkout={cur}",
        )

    # 6. PUT /api/borrowers/{B1.id} → rename to NewNameTest + new contact
    r = requests.put(
        f"{API}/borrowers/{b1_id}",
        json={"name": "NewNameTest", "contact": "new@example.com"},
        timeout=20,
    )
    record("PUT /api/borrowers/{B1.id} → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        body = r.json()
        record(
            "Response Borrower has new name + contact",
            body.get("name") == "NewNameTest" and body.get("contact") == "new@example.com",
            f"body={body}",
        )

    # 7. GET /api/borrowers — confirm B1 was updated
    r = requests.get(f"{API}/borrowers", timeout=20)
    record("GET /api/borrowers", r.status_code == 200)
    if r.status_code == 200:
        rows = r.json()
        b1_now = next((x for x in rows if x.get("id") == b1_id), None)
        record(
            "B1 in list has name=NewNameTest contact=new@example.com",
            bool(b1_now) and b1_now.get("name") == "NewNameTest" and b1_now.get("contact") == "new@example.com",
            f"b1_now={b1_now}",
        )

    # 8. GET /api/tools/{id} — current_checkout.borrower_name propagated
    r = requests.get(f"{API}/tools/{tool_id}", timeout=20)
    record("GET /api/tools/{id} (post-rename)", r.status_code == 200)
    if r.status_code == 200:
        t = r.json()
        cur = t.get("current_checkout") or {}
        record(
            "current_checkout.borrower_name propagated to NewNameTest",
            cur.get("borrower_name") == "NewNameTest" and cur.get("borrower_id") == b1_id,
            f"current_checkout={cur}",
        )
        # 9. checkout_history propagation
        hist = t.get("checkout_history") or []
        match = [h for h in hist if h.get("borrower_id") == b1_id]
        record(
            "checkout_history has >=1 entry with borrower_id=B1 and borrower_name=NewNameTest",
            len(match) >= 1 and all(h.get("borrower_name") == "NewNameTest" for h in match),
            f"history={hist}",
        )

    # 10. Edge case — legacy-only borrower (no tools)
    r = requests.post(
        f"{API}/borrowers",
        json={"name": "LegacyOnly", "contact": ""},
        timeout=20,
    )
    record("POST /api/borrowers (B2=LegacyOnly)", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        b2 = r.json()
        b2_id = b2["id"]
        created["borrowers"].append(b2_id)
        r2 = requests.put(
            f"{API}/borrowers/{b2_id}",
            json={"name": "LegacyRenamed", "contact": ""},
            timeout=20,
        )
        record(
            "PUT /api/borrowers/{B2.id} legacy-only → 200 + name updated",
            r2.status_code == 200 and r2.json().get("name") == "LegacyRenamed",
            f"status={r2.status_code} body={r2.text[:200]}",
        )

    # 11. Negative — 404 on non-existent borrower
    r = requests.put(
        f"{API}/borrowers/non-existent-id-1234",
        json={"name": "X"},
        timeout=20,
    )
    detail = ""
    try:
        detail = (r.json() or {}).get("detail", "")
    except Exception:
        pass
    record(
        "PUT /api/borrowers/non-existent-id-1234 → 404 with detail 'Borrower not found'",
        r.status_code == 404 and detail == "Borrower not found",
        f"status={r.status_code} detail={detail!r}",
    )


if __name__ == "__main__":
    try:
        main()
    finally:
        cleanup()
        passes = sum(1 for ok, *_ in results if ok)
        fails = [r for r in results if not r[0]]
        print("\n========== SUMMARY ==========")
        print(f"PASS: {passes}/{len(results)}")
        if fails:
            print(f"FAIL: {len(fails)}")
            for ok, label, detail in fails:
                print(f"  - {label} :: {detail}")
            sys.exit(1)
        sys.exit(0)
