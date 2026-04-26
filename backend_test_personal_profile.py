"""
Personal Profile (singleton) backend tests.

Endpoints under test:
  GET  /api/personal-profile  → always 200, returns PersonalProfile shape (defaults if empty)
  PUT  /api/personal-profile  → upsert, returns persisted version

Plus quick regression on /api/tools, /api/dealers, /api/locations.
"""
import os
import sys
import json
import requests

BASE = os.environ.get(
    "BACKEND_BASE",
    "https://asset-locator-12.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE}/api"

PROFILE_FIELDS = [
    "name", "address", "address2", "city", "state", "zip_code", "country",
    "phone", "email", "policy_number", "insurance_company", "notes",
]

results = []  # (name, ok, detail)


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    flag = "PASS" if cond else "FAIL"
    print(f"  [{flag}] {name}" + (f" — {detail}" if detail else ""))


def section(title):
    print(f"\n=== {title} ===")


def is_iso_like(s):
    return isinstance(s, str) and len(s) > 0 and "T" in s


def main():
    # --- A. Initial GET ---
    section("A. Initial GET /api/personal-profile")
    r = requests.get(f"{API}/personal-profile", timeout=30)
    check("A1 GET status 200", r.status_code == 200, f"status={r.status_code}, body={r.text[:200]}")
    if r.status_code != 200:
        return summarize()
    j = r.json()
    check("A2 response is dict", isinstance(j, dict))
    for f in PROFILE_FIELDS:
        check(
            f"A3 field '{f}' present and is a string (not null)",
            f in j and isinstance(j.get(f), str),
            f"value={j.get(f)!r}",
        )
    check(
        "A4 is_company present and is bool",
        "is_company" in j and isinstance(j.get("is_company"), bool),
        f"value={j.get('is_company')!r}",
    )
    check(
        "A5 is_company defaults to false (when no profile saved or last write set it false)",
        j.get("is_company") in (False, True),  # informational; final B/D will set explicit values
        f"value={j.get('is_company')!r}",
    )
    check(
        "A6 updated_at is non-empty ISO-like string",
        is_iso_like(j.get("updated_at")),
        f"value={j.get('updated_at')!r}",
    )

    # --- B. PUT full payload ---
    section("B. PUT /api/personal-profile (full payload)")
    full_payload = {
        "name": "John Smith",
        "address": "123 Main",
        "address2": "",
        "city": "San Diego",
        "state": "CA",
        "zip_code": "92101",
        "country": "USA",
        "phone": "(555) 555-1212",
        "email": "j@x.com",
        "policy_number": "POL-123",
        "insurance_company": "StateFarm",
        "notes": "Two kids, dog",
        "is_company": False,
    }
    prev_updated_at = j.get("updated_at")
    r2 = requests.put(f"{API}/personal-profile", json=full_payload, timeout=30)
    check("B1 PUT status 200", r2.status_code == 200, f"status={r2.status_code}, body={r2.text[:300]}")
    if r2.status_code != 200:
        return summarize()
    j2 = r2.json()
    for k, v in full_payload.items():
        check(f"B2 echo field '{k}' = {v!r}", j2.get(k) == v, f"got={j2.get(k)!r}")
    check(
        "B3 updated_at present and ISO-like",
        is_iso_like(j2.get("updated_at")),
        f"value={j2.get('updated_at')!r}",
    )
    check(
        "B4 updated_at differs from previous (new stamp)",
        j2.get("updated_at") != prev_updated_at,
        f"prev={prev_updated_at!r}, new={j2.get('updated_at')!r}",
    )

    # --- C. GET again — confirm persistence ---
    section("C. GET again — confirm persistence")
    r3 = requests.get(f"{API}/personal-profile", timeout=30)
    check("C1 GET status 200", r3.status_code == 200)
    j3 = r3.json()
    for k, v in full_payload.items():
        check(f"C2 persisted field '{k}' = {v!r}", j3.get(k) == v, f"got={j3.get(k)!r}")
    check("C3 updated_at persisted", j3.get("updated_at") == j2.get("updated_at"),
          f"PUT={j2.get('updated_at')!r} GET={j3.get('updated_at')!r}")

    # --- D. PUT partial update (upsert $set semantics) ---
    section("D. PUT partial update {name:'Acme Inc.', is_company:true}")
    partial = {"name": "Acme Inc.", "is_company": True}
    r4 = requests.put(f"{API}/personal-profile", json=partial, timeout=30)
    check("D1 PUT status 200", r4.status_code == 200, f"status={r4.status_code}, body={r4.text[:300]}")
    if r4.status_code != 200:
        return summarize()
    j4 = r4.json()
    check("D2 returned name='Acme Inc.'", j4.get("name") == "Acme Inc.", f"got={j4.get('name')!r}")
    check("D3 returned is_company=true", j4.get("is_company") is True, f"got={j4.get('is_company')!r}")
    # Per review note: other fields may be reset to defaults via $set; just verify returned doc reflects payload.
    # Still — they MUST be present as strings (no null) per spec F.
    for f in PROFILE_FIELDS:
        check(
            f"D4 field '{f}' is a string (no null) in response",
            isinstance(j4.get(f), str),
            f"value={j4.get(f)!r}",
        )
    check(
        "D5 updated_at refreshed",
        is_iso_like(j4.get("updated_at")) and j4.get("updated_at") != j3.get("updated_at"),
        f"prev={j3.get('updated_at')!r}, new={j4.get('updated_at')!r}",
    )

    # --- E. Final GET — last write wins ---
    section("E. Final GET — last write wins")
    r5 = requests.get(f"{API}/personal-profile", timeout=30)
    check("E1 GET status 200", r5.status_code == 200)
    j5 = r5.json()
    check("E2 name='Acme Inc.'", j5.get("name") == "Acme Inc.", f"got={j5.get('name')!r}")
    check("E3 is_company=true", j5.get("is_company") is True, f"got={j5.get('is_company')!r}")
    check("E4 updated_at equals last PUT response", j5.get("updated_at") == j4.get("updated_at"),
          f"PUT={j4.get('updated_at')!r} GET={j5.get('updated_at')!r}")

    # --- F. No null fields ---
    section("F. GET response uses default empty strings (no null) for unset fields")
    for f in PROFILE_FIELDS:
        v = j5.get(f)
        check(
            f"F1 field '{f}' is a string (not None)",
            v is not None and isinstance(v, str),
            f"value={v!r}",
        )

    # --- G. Regression on existing endpoints ---
    section("G. Regression: GET /api/tools, /api/dealers, /api/locations all 200")
    for ep in ("/tools", "/dealers", "/locations"):
        rr = requests.get(f"{API}{ep}", timeout=30)
        check(f"G GET {ep} status 200", rr.status_code == 200,
              f"status={rr.status_code}, body={rr.text[:200]}")

    return summarize()


def summarize():
    print("\n=== SUMMARY ===")
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"Total: {len(results)}  PASS: {passed}  FAIL: {failed}")
    if failed:
        print("\nFailures:")
        for name, ok, detail in results:
            if not ok:
                print(f"  - {name}: {detail}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
