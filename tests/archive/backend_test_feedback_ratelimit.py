"""Retest rate limit on POST /api/feedback after x-forwarded-for fix.

Sends 7 consecutive valid POST requests with the SAME X-Forwarded-For header,
expects [200, 200, 200, 200, 200, 429, 429] and the 6th+ to have detail
containing 'Too many messages'.
"""
import os
import sys
import json
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://toolbox-vault-v3.preview.emergentagent.com").rstrip("/") + "/api"
TEST_IP = "203.0.113.77"  # TEST-NET-3 (RFC 5737), unmistakably synthetic

PAYLOAD = {
    "name": "RateLimit",
    "email": "rl@test.com",
    "subject": "rl",
    "message": "rl",
    "is_bug": False,
    "is_feature": True,
    "platform": "Apple",
    "app_version": "1.0.0",
}

def main():
    url = f"{BASE}/feedback"
    headers = {"Content-Type": "application/json", "X-Forwarded-For": TEST_IP}
    statuses = []
    bodies = []

    print(f"POSTing 7x to {url} with X-Forwarded-For={TEST_IP}")
    for i in range(7):
        try:
            r = requests.post(url, headers=headers, data=json.dumps(PAYLOAD), timeout=15)
            statuses.append(r.status_code)
            try:
                bodies.append(r.json())
            except Exception:
                bodies.append({"_raw": r.text[:200]})
            print(f"  req#{i+1}: status={r.status_code} body={bodies[-1]}")
        except Exception as e:
            statuses.append(None)
            bodies.append({"_error": str(e)})
            print(f"  req#{i+1}: EXCEPTION {e}")

    expected = [200, 200, 200, 200, 200, 429, 429]
    ok = statuses == expected
    print()
    print(f"statuses = {statuses}")
    print(f"expected = {expected}")

    failures = []
    if statuses[:5] != [200] * 5:
        failures.append(f"First 5 should all be 200, got {statuses[:5]}")
    for idx in (5, 6):
        if statuses[idx] != 429:
            failures.append(f"Request #{idx+1} should be 429, got {statuses[idx]}")
        else:
            detail = (bodies[idx] or {}).get("detail", "")
            if "Too many messages" not in str(detail):
                failures.append(f"Request #{idx+1} 429 detail missing 'Too many messages': {detail!r}")

    if failures:
        print("\nFAIL:")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("\nPASS — rate limit fires exactly on request #6 and continues on #7. 'Too many messages' detail confirmed.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
