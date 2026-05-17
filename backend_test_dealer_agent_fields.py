"""Tests for new dealer + agent contact fields.

Verifies:
  A. POST /api/dealers persists warranty_contact / tech_support_contact / customer_support_contact
  B. PUT /api/dealers/{id} partial update only changes warranty_contact, others intact
  C. POST /api/dealers/{id}/agents echoes back agent.location
  D. PUT /api/dealers/{id}/agents/{agent_id} persists new location
  E. DELETE the test dealer (cleanup)
"""
import json
import os
import sys
import time
import requests

BASE_URL = "http://localhost:8001/api"
EMAIL = "MechanicLTZ@gmail.com"
PASSWORD = "Blue321!"

results = []


def check(desc, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    results.append((status, desc, detail))
    print(f"[{status}] {desc} {('— ' + detail) if detail else ''}")
    return cond


def login():
    r = requests.post(f"{BASE_URL}/auth/login",
                      json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    if r.status_code != 200:
        # Login may be rate-limited; retry once after a small wait
        if r.status_code == 429:
            print("Login rate-limited, sleeping 65s and retrying once...")
            time.sleep(65)
            r = requests.post(f"{BASE_URL}/auth/login",
                              json={"email": EMAIL, "password": PASSWORD},
                              timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token")
    assert token, f"No token in login response: {body}"
    return token


def main():
    token = login()
    H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    print(f"Logged in as {EMAIL}")

    # ----- TEST A: Create dealer with the 3 new fields -----
    create_body = {
        "name": "Field Test Tools Inc.",
        "phone": "555-0100",
        "warranty_contact": "warranty@fieldtest.com",
        "tech_support_contact": "555-TECH-911",
        "customer_support_contact": "https://fieldtest.com/support"
    }
    r = requests.post(f"{BASE_URL}/dealers", headers=H, json=create_body, timeout=15)
    check("A1 POST /api/dealers returned 200",
          r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code != 200:
        return
    dealer = r.json()
    dealer_id = dealer["id"]
    print(f"Created dealer {dealer_id}")
    check("A2 response.name matches",
          dealer.get("name") == create_body["name"],
          f"got={dealer.get('name')}")
    check("A3 response.warranty_contact matches",
          dealer.get("warranty_contact") == create_body["warranty_contact"],
          f"got={dealer.get('warranty_contact')}")
    check("A4 response.tech_support_contact matches",
          dealer.get("tech_support_contact") == create_body["tech_support_contact"],
          f"got={dealer.get('tech_support_contact')}")
    check("A5 response.customer_support_contact matches",
          dealer.get("customer_support_contact") == create_body["customer_support_contact"],
          f"got={dealer.get('customer_support_contact')}")

    # Confirm persistence via GET /dealers/{id}
    r = requests.get(f"{BASE_URL}/dealers/{dealer_id}", headers=H, timeout=15)
    check("A6 GET /api/dealers/{id} returned 200", r.status_code == 200,
          f"status={r.status_code}")
    if r.status_code == 200:
        g = r.json()
        check("A7 GET persisted warranty_contact",
              g.get("warranty_contact") == create_body["warranty_contact"])
        check("A8 GET persisted tech_support_contact",
              g.get("tech_support_contact") == create_body["tech_support_contact"])
        check("A9 GET persisted customer_support_contact",
              g.get("customer_support_contact") == create_body["customer_support_contact"])

    # ----- TEST B: Partial update only warranty_contact -----
    new_warranty = "new-warranty@fieldtest.com"
    r = requests.put(f"{BASE_URL}/dealers/{dealer_id}", headers=H,
                     json={"warranty_contact": new_warranty}, timeout=15)
    check("B1 PUT /api/dealers/{id} partial returned 200",
          r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code == 200:
        upd = r.json()
        check("B2 warranty_contact updated",
              upd.get("warranty_contact") == new_warranty,
              f"got={upd.get('warranty_contact')}")
        check("B3 tech_support_contact NOT wiped",
              upd.get("tech_support_contact") == create_body["tech_support_contact"],
              f"got={upd.get('tech_support_contact')!r}")
        check("B4 customer_support_contact NOT wiped",
              upd.get("customer_support_contact") == create_body["customer_support_contact"],
              f"got={upd.get('customer_support_contact')!r}")
        check("B5 name still intact",
              upd.get("name") == create_body["name"],
              f"got={upd.get('name')!r}")
        check("B6 phone still intact",
              upd.get("phone") == create_body["phone"],
              f"got={upd.get('phone')!r}")

    # ----- TEST C: Add an agent with location -----
    agent_body = {
        "name": "Jordan Hayes",
        "phone": "555-0200",
        "email": "jordan@fieldtest.com",
        "location": "North Houston Route",
        "notes": "Tuesdays only"
    }
    r = requests.post(f"{BASE_URL}/dealers/{dealer_id}/agents",
                      headers=H, json=agent_body, timeout=15)
    check("C1 POST agents returned 200", r.status_code == 200,
          f"status={r.status_code} body={r.text[:300]}")
    agent_id = None
    if r.status_code == 200:
        d = r.json()
        agents = d.get("agents") or []
        check("C2 dealer.agents has at least 1 entry", len(agents) >= 1,
              f"len={len(agents)}")
        # Find the agent we just added by name
        new_agent = next((a for a in agents if a.get("name") == agent_body["name"]), None)
        check("C3 new agent present in dealer.agents", new_agent is not None)
        if new_agent:
            agent_id = new_agent.get("id")
            check("C4 new agent.location echoes back",
                  new_agent.get("location") == agent_body["location"],
                  f"got={new_agent.get('location')!r}")
            check("C5 new agent.name correct",
                  new_agent.get("name") == agent_body["name"])
            check("C6 new agent.phone correct",
                  new_agent.get("phone") == agent_body["phone"])
            check("C7 new agent.email correct",
                  new_agent.get("email") == agent_body["email"])
            check("C8 new agent.notes correct",
                  new_agent.get("notes") == agent_body["notes"])

    # ----- TEST D: Update agent with a new location -----
    if agent_id:
        upd_agent = {
            "name": agent_body["name"],
            "phone": agent_body["phone"],
            "email": agent_body["email"],
            "location": "South Houston Route",
            "notes": agent_body["notes"]
        }
        r = requests.put(f"{BASE_URL}/dealers/{dealer_id}/agents/{agent_id}",
                         headers=H, json=upd_agent, timeout=15)
        check("D1 PUT agent returned 200", r.status_code == 200,
              f"status={r.status_code} body={r.text[:300]}")
        if r.status_code == 200:
            d = r.json()
            agents = d.get("agents") or []
            ag = next((a for a in agents if a.get("id") == agent_id), None)
            check("D2 updated agent still present", ag is not None)
            if ag:
                check("D3 agent.location updated to new value",
                      ag.get("location") == "South Houston Route",
                      f"got={ag.get('location')!r}")
                check("D4 agent.name preserved",
                      ag.get("name") == agent_body["name"])
                check("D5 agent.email preserved",
                      ag.get("email") == agent_body["email"])

        # Re-fetch via GET to confirm persistence
        r = requests.get(f"{BASE_URL}/dealers/{dealer_id}", headers=H, timeout=15)
        if r.status_code == 200:
            d = r.json()
            agents = d.get("agents") or []
            ag = next((a for a in agents if a.get("id") == agent_id), None)
            check("D6 GET dealer shows agent.location persisted",
                  ag is not None and ag.get("location") == "South Houston Route",
                  f"got={ag.get('location') if ag else None!r}")

    # ----- TEST E: Cleanup -----
    r = requests.delete(f"{BASE_URL}/dealers/{dealer_id}", headers=H, timeout=15)
    check("E1 DELETE /api/dealers/{id} returned 200",
          r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    # Verify it's gone
    r = requests.get(f"{BASE_URL}/dealers/{dealer_id}", headers=H, timeout=15)
    check("E2 GET dealer after delete returns 404",
          r.status_code == 404, f"status={r.status_code}")

    # Summary
    print("\n" + "=" * 60)
    n_pass = sum(1 for s, _, _ in results if s == "PASS")
    n_fail = sum(1 for s, _, _ in results if s == "FAIL")
    print(f"TOTAL: {n_pass} PASS / {n_fail} FAIL")
    if n_fail:
        print("\nFAILURES:")
        for s, d, det in results:
            if s == "FAIL":
                print(f"  - {d} :: {det}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
