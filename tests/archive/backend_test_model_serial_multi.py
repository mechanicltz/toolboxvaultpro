"""
Test multi-value model_numbers[] / serial_numbers[] feature on /api/tools.
Per review request scenarios 1-6.
"""
import os
import sys
import requests

BASE = "http://localhost:8001/api"
ADMIN_EMAIL = "MechanicLTZ@gmail.com"
ADMIN_PASS = "Blue321!"

results = []

def record(name, passed, detail=""):
    mark = "PASS" if passed else "FAIL"
    results.append((name, passed, detail))
    print(f"[{mark}] {name}: {detail}")

def main():
    # Login
    r = requests.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    if r.status_code != 200:
        record("admin-login", False, f"status={r.status_code} body={r.text[:200]}")
        return
    token = r.json().get("token") or r.json().get("access_token")
    hdrs = {"Authorization": f"Bearer {token}"}
    record("admin-login", True, "got token")

    tool1_id = None
    tool2_id = None

    # ---------- Scenario 1: POST with model_numbers + serial_numbers ----------
    payload1 = {
        "name": "TestMV",
        "model_numbers": ["MN-1", "MN-2"],
        "serial_numbers": ["SN-A"],
    }
    r = requests.post(f"{BASE}/tools", json=payload1, headers=hdrs, timeout=15)
    if r.status_code != 200:
        record("1.POST create with arrays", False, f"status={r.status_code} body={r.text[:300]}")
    else:
        t = r.json()
        tool1_id = t["id"]
        checks = []
        checks.append(("model_numbers==['MN-1','MN-2']", t.get("model_numbers") == ["MN-1", "MN-2"]))
        checks.append(("serial_numbers==['SN-A']", t.get("serial_numbers") == ["SN-A"]))
        checks.append(("serial_number=='MN-1'", t.get("serial_number") == "MN-1"))
        checks.append(("set_serials==['MN-1','MN-2']", t.get("set_serials") == ["MN-1", "MN-2"]))
        checks.append(("is_set==True", t.get("is_set") is True))
        for label, ok in checks:
            record(f"1.{label}", ok, f"got={t.get(label.split('==')[0])}" if not ok else "OK")

    # ---------- Scenario 4 (PART A — initial state): search 'MN-1' should hit tool1 ----------
    if tool1_id:
        r = requests.get(f"{BASE}/tools", params={"search": "MN-1"}, headers=hdrs, timeout=15)
        if r.status_code != 200:
            record("4a.search MN-1", False, f"status={r.status_code}")
        else:
            arr = r.json()
            found = any(it.get("id") == tool1_id for it in arr)
            record("4a.search MN-1 finds tool1 (model_numbers)", found, f"results={len(arr)}")

        r = requests.get(f"{BASE}/tools", params={"search": "SN-A"}, headers=hdrs, timeout=15)
        if r.status_code != 200:
            record("4b.search SN-A", False, f"status={r.status_code}")
        else:
            arr = r.json()
            found = any(it.get("id") == tool1_id for it in arr)
            record("4b.search SN-A finds tool1 (serial_numbers)", found, f"results={len(arr)}")

    # ---------- Scenario 2: PUT model_numbers=['X-ONLY'] on tool1 ----------
    if tool1_id:
        r = requests.put(f"{BASE}/tools/{tool1_id}", json={"model_numbers": ["X-ONLY"]}, headers=hdrs, timeout=15)
        if r.status_code != 200:
            record("2.PUT update model_numbers", False, f"status={r.status_code} body={r.text[:300]}")
        else:
            t = r.json()
            checks = []
            checks.append(("model_numbers==['X-ONLY']", t.get("model_numbers") == ["X-ONLY"]))
            checks.append(("serial_numbers untouched==['SN-A']", t.get("serial_numbers") == ["SN-A"]))
            checks.append(("serial_number=='X-ONLY'", t.get("serial_number") == "X-ONLY"))
            checks.append(("is_set==False (1 model)", t.get("is_set") is False))
            for label, ok in checks:
                record(f"2.{label}", ok, "OK" if ok else f"got={t.get(label.split('==')[0].split(' ')[0])}")

    # ---------- Scenario 3: POST legacy-only shape ----------
    payload3 = {"name": "LegacyOld", "serial_number": "LEG-42"}
    r = requests.post(f"{BASE}/tools", json=payload3, headers=hdrs, timeout=15)
    if r.status_code != 200:
        record("3.POST legacy create", False, f"status={r.status_code} body={r.text[:300]}")
    else:
        t = r.json()
        tool2_id = t["id"]
        checks = []
        checks.append(("model_numbers==['LEG-42']", t.get("model_numbers") == ["LEG-42"]))
        checks.append(("serial_numbers==[]", t.get("serial_numbers") == []))
        checks.append(("serial_number=='LEG-42'", t.get("serial_number") == "LEG-42"))
        for label, ok in checks:
            record(f"3.{label}", ok, "OK" if ok else f"got={t}")

    # ---------- Scenario 5: migrate endpoint idempotency ----------
    r = requests.post(f"{BASE}/admin/migrate-model-serial", headers=hdrs, timeout=60)
    if r.status_code != 200:
        record("5a.migrate first call", False, f"status={r.status_code} body={r.text[:300]}")
    else:
        body = r.json()
        record("5a.migrate first call returns total_tools+migrated",
               "total_tools" in body and "migrated" in body,
               f"body={body}")
        first_migrated = body.get("migrated")
        # Second call
        r2 = requests.post(f"{BASE}/admin/migrate-model-serial", headers=hdrs, timeout=60)
        if r2.status_code != 200:
            record("5b.migrate second call", False, f"status={r2.status_code}")
        else:
            body2 = r2.json()
            record("5b.migrate second call migrated==0 (idempotent)",
                   body2.get("migrated") == 0,
                   f"body={body2}")

        # Verify every tool that had a legacy serial_number/set_serials now has model_numbers populated
        r3 = requests.get(f"{BASE}/tools", headers=hdrs, timeout=30)
        if r3.status_code != 200:
            record("5c.GET /tools after migrate", False, f"status={r3.status_code}")
        else:
            arr = r3.json()
            offenders = []
            for it in arr:
                legacy_sn = it.get("serial_number")
                legacy_set = it.get("set_serials") or []
                mns = it.get("model_numbers") or []
                if (legacy_sn or legacy_set) and not mns:
                    offenders.append({"id": it.get("id"), "name": it.get("name"),
                                      "serial_number": legacy_sn, "set_serials": legacy_set,
                                      "model_numbers": mns})
            record("5c.every tool with legacy serial_number/set_serials has model_numbers",
                   len(offenders) == 0,
                   f"tools_total={len(arr)}, offenders={len(offenders)}: {offenders[:3]}")

    # ---------- Scenario 6: Cleanup ----------
    for tid, lbl in [(tool1_id, "TestMV"), (tool2_id, "LegacyOld")]:
        if not tid:
            continue
        r = requests.delete(f"{BASE}/tools/{tid}", headers=hdrs, timeout=15)
        record(f"6.DELETE {lbl}", r.status_code == 200, f"status={r.status_code}")

    # ---------- Summary ----------
    print("\n========== SUMMARY ==========")
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"PASSED: {passed}  FAILED: {failed}  TOTAL: {len(results)}")
    if failed:
        print("\nFailures:")
        for name, ok, detail in results:
            if not ok:
                print(f"  - {name}: {detail}")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
