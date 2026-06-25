"""
Helper script to seed/cleanup a dealer balance + schedule for color verification.
Used by the Playwright test below.
"""
import os
import sys
import requests
from datetime import datetime, timedelta

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://toolbox-vault-v3.preview.emergentagent.com").rstrip("/")


def login(email: str, pw: str) -> str:
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def list_dealers(token: str):
    r = requests.get(f"{BASE}/api/dealers", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    return r.json()


def seed(token: str):
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    dealers = list_dealers(token)
    if not dealers:
        print("NO_DEALERS")
        return None
    d = dealers[0]
    dealer_id = d["id"]
    print(f"USING_DEALER {dealer_id} {d.get('name')}")

    # Add a charge transaction to personal account -> creates outstanding balance
    tx_payload = {
        "type": "charge",
        "account": "personal",
        "amount": 250.00,
        "note": "TEST_color_verification",
    }
    r = requests.post(f"{BASE}/api/dealers/{dealer_id}/transactions", json=tx_payload, headers=h, timeout=30)
    print(f"TX_STATUS {r.status_code} {r.text[:200]}")
    tx_id = None
    if r.status_code in (200, 201):
        body = r.json()
        # try to find tx id
        tx_id = body.get("id") or body.get("transaction", {}).get("id")
        # if not returned, fetch dealer & find latest tx
        if not tx_id:
            r2 = requests.get(f"{BASE}/api/dealers/{dealer_id}", headers=h, timeout=30)
            if r2.ok:
                dd = r2.json()
                txs = dd.get("transactions") or dd.get("personal_transactions") or []
                if txs:
                    tx_id = txs[-1].get("id")

    # Set a schedule due tomorrow on personal/Truck account
    tomorrow = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")
    sched = {
        "enabled": True,
        "amount": 50.00,
        "frequency": "weekly",
        "next_due_date": tomorrow,
        "remind_day_before": True,
        "remind_day_of": True,
    }
    r = requests.put(
        f"{BASE}/api/dealers/{dealer_id}/accounts/personal/schedule",
        json=sched, headers=h, timeout=30,
    )
    print(f"SCHED_STATUS {r.status_code} {r.text[:200]}")

    return {"dealer_id": dealer_id, "tx_id": tx_id}


def cleanup(token: str, dealer_id: str, tx_id: str | None):
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    # Clear schedule
    r = requests.delete(f"{BASE}/api/dealers/{dealer_id}/accounts/personal/schedule", headers=h, timeout=30)
    print(f"CLEAR_SCHED {r.status_code}")
    if tx_id:
        r = requests.delete(f"{BASE}/api/dealers/{dealer_id}/transactions/{tx_id}", headers=h, timeout=30)
        print(f"DEL_TX {r.status_code}")
    else:
        # find & delete any TEST_color_verification tx
        r = requests.get(f"{BASE}/api/dealers/{dealer_id}", headers=h, timeout=30)
        if r.ok:
            dd = r.json()
            for key in ("transactions", "personal_transactions"):
                for tx in dd.get(key) or []:
                    if "TEST_color_verification" in (tx.get("note") or ""):
                        r2 = requests.delete(
                            f"{BASE}/api/dealers/{dealer_id}/transactions/{tx['id']}",
                            headers=h, timeout=30,
                        )
                        print(f"DEL_TX_FOUND {tx['id']} {r2.status_code}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "seed"
    token = login("ryan@ryan.com", "ryan1234")
    print(f"LOGIN_OK token_len={len(token)}")
    if mode == "seed":
        res = seed(token)
        print(f"SEED_RESULT {res}")
    elif mode == "cleanup":
        dealer_id = sys.argv[2]
        tx_id = sys.argv[3] if len(sys.argv) > 3 else None
        cleanup(token, dealer_id, tx_id)
