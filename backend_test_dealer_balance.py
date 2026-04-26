"""
Backend tests for:
  A) Dealer Balance Transactions: POST/DELETE /api/dealers/{id}/transactions
  B) RepairInfo updates including broken_photo persistence
  C) Toolbox/AI removal sanity check (404 expected)
"""
import os
import sys
import json
import requests
from pathlib import Path

# Read EXPO_PUBLIC_BACKEND_URL
ENV_PATH = Path("/app/frontend/.env")
BACKEND_URL = None
for line in ENV_PATH.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BACKEND_URL = line.split("=", 1)[1].strip().strip('"')
        break

assert BACKEND_URL, "EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env"
API = f"{BACKEND_URL}/api"
print(f"API base: {API}")

PASS = 0
FAIL = 0
errors = []

def check(cond, msg):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS: {msg}")
    else:
        FAIL += 1
        errors.append(msg)
        print(f"  FAIL: {msg}")


def section(t):
    print(f"\n=== {t} ===")


# --- Section A: Dealer balance transactions ---
section("A) Dealer Balance Transactions")

# A1: Create dealer
r = requests.post(f"{API}/dealers", json={"name": "BalTest"})
check(r.status_code == 200, f"POST /dealers status=200 (got {r.status_code})")
D1 = r.json()
D1_id = D1["id"]
print(f"  D1.id={D1_id}")

# A2: Verify initial state
check(D1.get("credit_balance") == 0.0, f"credit_balance==0.0 (got {D1.get('credit_balance')})")
check(D1.get("personal_balance") == 0.0, f"personal_balance==0.0 (got {D1.get('personal_balance')})")
check(D1.get("transactions") == [], f"transactions==[] (got {D1.get('transactions')})")

# A3: First credit charge 250.50
r = requests.post(f"{API}/dealers/{D1_id}/transactions", json={
    "account": "credit", "type": "charge", "amount": 250.50, "note": "Tool order"
})
check(r.status_code == 200, f"POST tx (charge 250.50) status=200 (got {r.status_code} body={r.text[:200]})")
D = r.json()
check(abs(D.get("credit_balance", 0) - 250.50) < 1e-6, f"credit_balance==250.50 (got {D.get('credit_balance')})")
check(len(D.get("transactions", [])) == 1, f"transactions count==1 (got {len(D.get('transactions', []))})")
tx1 = D["transactions"][0]
check(tx1.get("type") == "charge", f"tx1.type=='charge' (got {tx1.get('type')})")
check(tx1.get("account") == "credit", f"tx1.account=='credit' (got {tx1.get('account')})")
check(abs(tx1.get("amount", 0) - 250.50) < 1e-6, f"tx1.amount==250.50 (got {tx1.get('amount')})")
check(tx1.get("note") == "Tool order", f"tx1.note=='Tool order' (got {tx1.get('note')})")
check(bool(tx1.get("id")), f"tx1.id auto-generated (got {tx1.get('id')})")
import datetime as dt
today = dt.datetime.utcnow().strftime("%Y-%m-%d")
check(tx1.get("date") == today, f"tx1.date defaulted to today {today} (got {tx1.get('date')})")

# A4: Second credit charge 100
r = requests.post(f"{API}/dealers/{D1_id}/transactions", json={
    "account": "credit", "type": "charge", "amount": 100, "note": "More tools"
})
check(r.status_code == 200, f"POST tx (charge 100) status=200 (got {r.status_code})")
D = r.json()
check(abs(D.get("credit_balance", 0) - 350.50) < 1e-6, f"credit_balance==350.50 (got {D.get('credit_balance')})")
check(len(D.get("transactions", [])) == 2, f"transactions count==2 (got {len(D.get('transactions', []))})")

# A5: Credit payment 50
r = requests.post(f"{API}/dealers/{D1_id}/transactions", json={
    "account": "credit", "type": "payment", "amount": 50, "note": "Check #123"
})
check(r.status_code == 200, f"POST tx (payment 50) status=200 (got {r.status_code})")
D = r.json()
check(abs(D.get("credit_balance", 0) - 300.50) < 1e-6, f"credit_balance==300.50 (got {D.get('credit_balance')})")
check(len(D.get("transactions", [])) == 3, f"transactions count==3 (got {len(D.get('transactions', []))})")
# remember the credit-payment tx id for deletion later
payment_tx_id = next((t["id"] for t in D["transactions"] if t.get("type") == "payment" and abs(t.get("amount", 0) - 50) < 1e-6), None)
check(payment_tx_id is not None, "found credit payment tx id")

# A6: Personal charge 80
r = requests.post(f"{API}/dealers/{D1_id}/transactions", json={
    "account": "personal", "type": "charge", "amount": 80, "note": "Personal item"
})
check(r.status_code == 200, f"POST tx (personal charge 80) status=200 (got {r.status_code})")
D = r.json()
check(abs(D.get("personal_balance", 0) - 80.0) < 1e-6, f"personal_balance==80.0 (got {D.get('personal_balance')})")
check(abs(D.get("credit_balance", 0) - 300.50) < 1e-6, f"credit_balance still 300.50 (got {D.get('credit_balance')})")
check(len(D.get("transactions", [])) == 4, f"transactions count==4 (got {len(D.get('transactions', []))})")

# A7: Personal payment 30
r = requests.post(f"{API}/dealers/{D1_id}/transactions", json={
    "account": "personal", "type": "payment", "amount": 30, "note": "Cash back"
})
check(r.status_code == 200, f"POST tx (personal payment 30) status=200 (got {r.status_code})")
D = r.json()
check(abs(D.get("personal_balance", 0) - 50.0) < 1e-6, f"personal_balance==50.0 (got {D.get('personal_balance')})")
check(len(D.get("transactions", [])) == 5, f"transactions count==5 (got {len(D.get('transactions', []))})")

# A8: Delete credit payment of 50 -> credit_balance back to 350.50
r = requests.delete(f"{API}/dealers/{D1_id}/transactions/{payment_tx_id}")
check(r.status_code == 200, f"DELETE tx status=200 (got {r.status_code})")
D = r.json()
check(abs(D.get("credit_balance", 0) - 350.50) < 1e-6, f"credit_balance reversed to 350.50 (got {D.get('credit_balance')})")
check(len(D.get("transactions", [])) == 4, f"transactions count==4 after delete (got {len(D.get('transactions', []))})")

# A9: Delete non-existent transaction
r = requests.delete(f"{API}/dealers/{D1_id}/transactions/does-not-exist-12345")
check(r.status_code == 404, f"DELETE non-existent tx status=404 (got {r.status_code})")
try:
    detail = r.json().get("detail")
except Exception:
    detail = None
check(detail == "Transaction not found", f"detail=='Transaction not found' (got {detail!r})")

# A10: Negative cases
# invalid account
r = requests.post(f"{API}/dealers/{D1_id}/transactions", json={
    "account": "invalid", "type": "charge", "amount": 10
})
check(r.status_code == 400, f"invalid account status=400 (got {r.status_code})")
try:
    d = r.json().get("detail")
except Exception:
    d = None
check(d == "account must be 'credit' or 'personal'", f"detail account msg (got {d!r})")

# invalid type
r = requests.post(f"{API}/dealers/{D1_id}/transactions", json={
    "account": "credit", "type": "invalid", "amount": 10
})
check(r.status_code == 400, f"invalid type status=400 (got {r.status_code})")
try:
    d = r.json().get("detail")
except Exception:
    d = None
check(d == "type must be 'payment' or 'charge'", f"detail type msg (got {d!r})")

# amount = 0
r = requests.post(f"{API}/dealers/{D1_id}/transactions", json={
    "account": "credit", "type": "charge", "amount": 0
})
check(r.status_code == 400, f"amount=0 status=400 (got {r.status_code})")
try:
    d = r.json().get("detail")
except Exception:
    d = None
check(d == "amount must be > 0", f"detail amount msg (got {d!r})")

# amount negative
r = requests.post(f"{API}/dealers/{D1_id}/transactions", json={
    "account": "credit", "type": "charge", "amount": -5
})
check(r.status_code == 400, f"amount=-5 status=400 (got {r.status_code})")

# A11: Cleanup
r = requests.delete(f"{API}/dealers/{D1_id}")
check(r.status_code == 200, f"DELETE dealer status=200 (got {r.status_code})")


# --- Section B: RepairInfo updates ---
section("B) RepairInfo updates (broken_photo etc.)")

# B1: Create tool with full repair_info
b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII="
payload = {
    "name": "Test Tool",
    "needs_repair": True,
    "repair_info": {
        "repair_status": "Not Reported",
        "company_notified": "Some Dealer",
        "broken_photo": b64,
    },
}
r = requests.post(f"{API}/tools", json=payload)
check(r.status_code == 200, f"POST /tools status=200 (got {r.status_code} body={r.text[:200]})")
TX = r.json()
TX_id = TX["id"]
print(f"  TX.id={TX_id}")
check(TX.get("needs_repair") is True, f"needs_repair==True (got {TX.get('needs_repair')})")
ri = TX.get("repair_info") or {}
check(ri.get("repair_status") == "Not Reported", f"repair_status=='Not Reported' (got {ri.get('repair_status')})")
check(ri.get("company_notified") == "Some Dealer", f"company_notified=='Some Dealer' (got {ri.get('company_notified')})")
check(ri.get("broken_photo") == b64, f"broken_photo persisted (got {len(ri.get('broken_photo') or '')} chars vs {len(b64)})")

# B2: PUT update
new_b64 = "bmV3YmFzZTY0ZGF0YQ=="
r = requests.put(f"{API}/tools/{TX_id}", json={
    "repair_info": {
        "repair_status": "Reported",
        "company_notified": "Snap-on",
        "contact": "John",
        "broken_photo": new_b64,
    }
})
check(r.status_code == 200, f"PUT /tools/{{id}} status=200 (got {r.status_code} body={r.text[:200]})")
T = r.json()
ri = T.get("repair_info") or {}
check(ri.get("repair_status") == "Reported", f"updated repair_status=='Reported' (got {ri.get('repair_status')})")
check(ri.get("company_notified") == "Snap-on", f"updated company_notified=='Snap-on' (got {ri.get('company_notified')})")
check(ri.get("contact") == "John", f"updated contact=='John' (got {ri.get('contact')})")
check(ri.get("broken_photo") == new_b64, f"updated broken_photo (got {ri.get('broken_photo')})")

# B3: PUT to clear: needs_repair=false, repair_info=null
r = requests.put(f"{API}/tools/{TX_id}", json={"needs_repair": False, "repair_info": None})
check(r.status_code == 200, f"PUT clear status=200 (got {r.status_code})")
T = r.json()
check(T.get("needs_repair") is False, f"needs_repair==False after clear (got {T.get('needs_repair')})")

# B4: Cleanup
r = requests.delete(f"{API}/tools/{TX_id}")
check(r.status_code == 200, f"DELETE tool status=200 (got {r.status_code})")


# --- Section C: Toolbox/AI removal sanity check ---
section("C) Toolbox / AI removal sanity check")

r = requests.get(f"{API}/toolbox-layouts")
check(r.status_code == 404, f"GET /toolbox-layouts returns 404 (got {r.status_code})")

r = requests.post(f"{API}/toolbox/analyze", json={"image": "x"})
check(r.status_code == 404, f"POST /toolbox/analyze returns 404 (got {r.status_code})")


# --- Summary ---
print(f"\n===== SUMMARY =====")
print(f"PASS: {PASS}")
print(f"FAIL: {FAIL}")
if errors:
    print("\nFailed checks:")
    for e in errors:
        print(f"  - {e}")
sys.exit(0 if FAIL == 0 else 1)
