"""
Iteration 62 — verify 6 UI/UX changes described in the review_request.

#1 Dashboard DEALER ACCOUNTS: $balance NORMAL/steel color (NOT green);
   adjust chip border + '$' = GREEN (~rgb(16,185,129)).
#2 Inventory row qty pill bg = YELLOW (#FFD400).
#3 New item PRICE EACH field (testID edit-cost) starts EMPTY string,
   showing only grey '0.00' placeholder.
#7 Bundle claim row title includes inside_item_name ('test1') —
   format like 'BROKEN · test1 · <company>'.
#8 Checkout date shows DATE only (MM/DD/YYYY) — no time component.

Strategy: API-seed required data (ryan@ryan.com for #1, #2, #8;
mechanicltz Pro for #3, #7 which require new-tool creation). Inject JWT
into localStorage and inspect computed DOM. Clean up all test data.
"""
import os
import sys
import json
import time
import requests
from datetime import datetime

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                     "https://toolbox-vault-v3.preview.emergentagent.com").rstrip("/")


def login(email: str, pw: str) -> str:
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": email, "password": pw}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def H(tok): return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ------- SEED HELPERS --------------------------------------------------------
def seed_dealer_balance(tok):
    dealers = requests.get(f"{BASE}/api/dealers", headers=H(tok), timeout=30).json()
    if not dealers:
        return None
    did = dealers[0]["id"]
    r = requests.post(f"{BASE}/api/dealers/{did}/transactions",
                      json={"type": "charge", "account": "personal",
                            "amount": 250.00, "note": "TEST_iter62_color"},
                      headers=H(tok), timeout=30)
    tx_id = None
    if r.ok:
        body = r.json()
        tx_id = body.get("id") or (body.get("transaction") or {}).get("id")
        if not tx_id:
            dd = requests.get(f"{BASE}/api/dealers/{did}", headers=H(tok), timeout=30).json()
            for k in ("transactions", "personal_transactions"):
                for tx in dd.get(k) or []:
                    if "TEST_iter62" in (tx.get("note") or ""):
                        tx_id = tx.get("id")
    return {"dealer_id": did, "tx_id": tx_id, "dealer_name": dealers[0].get("name")}


def cleanup_dealer(tok, dealer_id, tx_id):
    if tx_id:
        requests.delete(f"{BASE}/api/dealers/{dealer_id}/transactions/{tx_id}",
                        headers=H(tok), timeout=30)
    else:
        dd = requests.get(f"{BASE}/api/dealers/{dealer_id}", headers=H(tok), timeout=30).json()
        for k in ("transactions", "personal_transactions"):
            for tx in dd.get(k) or []:
                if "TEST_iter62" in (tx.get("note") or ""):
                    requests.delete(
                        f"{BASE}/api/dealers/{dealer_id}/transactions/{tx['id']}",
                        headers=H(tok), timeout=30)


def set_tool_qty(tok, tool_id, qty):
    requests.put(f"{BASE}/api/tools/{tool_id}",
                 json={"quantity": qty}, headers=H(tok), timeout=30)


def create_bundle_with_broken_inside(tok):
    """Create a new bundle, add inside item 'test1', mark bundle broken with that item."""
    bundle = requests.post(f"{BASE}/api/tools",
                           json={"name": "TEST_iter62_bundle", "is_bundle": True},
                           headers=H(tok), timeout=30).json()
    bid = bundle["id"]
    inside = requests.post(f"{BASE}/api/tools/{bid}/inside-items",
                           json={"name": "test1"},
                           headers=H(tok), timeout=30).json()
    iid = inside.get("id") or None
    # If endpoint returned full tool, find inside item id
    if not iid:
        b2 = requests.get(f"{BASE}/api/tools/{bid}", headers=H(tok), timeout=30).json()
        for s in (b2.get("inside_items") or []):
            if s.get("name") == "test1":
                iid = s.get("id")
    # Mark the bundle as needs_repair with repair_info containing inside_item_name
    requests.put(f"{BASE}/api/tools/{bid}",
                 json={"needs_repair": True,
                       "repair_info": {
                           "inside_item_id": iid,
                           "inside_item_name": "test1",
                           "company_notified": "AcmeRepair",
                           "notified_at": datetime.utcnow().strftime("%Y-%m-%d"),
                           "notes": "iter62 test",
                       }},
                 headers=H(tok), timeout=30)
    return bid


def create_simple_item(tok):
    return requests.post(f"{BASE}/api/tools",
                         json={"name": "TEST_iter62_item"},
                         headers=H(tok), timeout=30).json()


def cleanup_tool(tok, tid):
    requests.delete(f"{BASE}/api/tools/{tid}", headers=H(tok), timeout=30)
    # also cleanup any warranty claim
    claims = requests.get(f"{BASE}/api/warranty-claims?tool_id={tid}",
                          headers=H(tok), timeout=30)
    if claims.ok:
        for c in claims.json():
            requests.delete(f"{BASE}/api/warranty-claims/{c['id']}",
                            headers=H(tok), timeout=30)


def checkout_tool(tok, tool_id, borrower_name="TEST_iter62_borrower"):
    return requests.post(f"{BASE}/api/tools/{tool_id}/checkout",
                         json={"borrower_name": borrower_name},
                         headers=H(tok), timeout=30)


def checkin_tool(tok, tool_id):
    return requests.post(f"{BASE}/api/tools/{tool_id}/checkin",
                         headers=H(tok), timeout=30)


def find_ryan_normal_tool(tok):
    """Find a non-bundle, currently NOT checked out, NOT broken tool from ryan."""
    tools = requests.get(f"{BASE}/api/tools", headers=H(tok), timeout=30).json()
    for t in tools:
        if (not t.get("is_bundle")) and (not t.get("is_checked_out")) \
                and (not t.get("needs_repair")):
            return t
    return None


if __name__ == "__main__":
    print("Setup helper — use via Playwright runner.")
