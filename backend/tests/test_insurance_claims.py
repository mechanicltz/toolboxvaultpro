"""Insurance Claims backend tests (iteration 23).

Covers every /api/insurance-claims endpoint declared in
/app/backend/insurance_claims.py plus financial-integrity & inventory-safety
invariants.
"""
import os
import base64
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "mechanicltz@gmail.com"
ADMIN_PASSWORD = "Blue321!"

# 1x1 transparent PNG for evidence uploads
PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIA"
    "AAUAAeImBZsAAAAASUVORK5CYII="
)


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_claim_ids():
    """Collect all claim ids created here so we can purge on teardown."""
    ids = []
    yield ids
    # teardown
    for cid in ids:
        try:
            tok = requests.post(f"{API}/auth/login",
                                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                                 timeout=15).json().get("token")
            requests.delete(f"{API}/insurance-claims/{cid}",
                            headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Catalog / dashboard
# ---------------------------------------------------------------------------
class TestSpecAndSummary:
    def test_spec(self, H):
        r = requests.get(f"{API}/insurance-claims/spec", headers=H, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("claim_types", "statuses", "pre_loss_conditions",
                  "post_loss_conditions", "note_categories", "evidence_kinds",
                  "report_sections"):
            assert k in d and isinstance(d[k], list) and len(d[k]) > 0
        assert "Fire" in d["claim_types"]
        assert "Draft" in d["statuses"]

    def test_summary(self, H):
        r = requests.get(f"{API}/insurance-claims/summary", headers=H, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("total_claims", "open_claims", "closed_claims",
                  "total_claimed_value", "total_approved_value",
                  "total_paid_value"):
            assert k in d
        assert d["total_claims"] >= 1  # seeded CLM-1001 exists


# ---------------------------------------------------------------------------
# CRUD core
# ---------------------------------------------------------------------------
class TestClaimCRUD:
    def test_create_get_update_persist(self, H, created_claim_ids):
        payload = {
            "title": "TEST_Backend Claim",
            "claim_type": "Theft",
            "status": "Draft",
            "coverage_limit": 10000,
            "deductible": 500,
            "sales_tax": 50,
        }
        r = requests.post(f"{API}/insurance-claims", json=payload, headers=H, timeout=30)
        assert r.status_code == 200, r.text
        c = r.json()
        cid = c["id"]
        created_claim_ids.append(cid)
        assert c["title"] == payload["title"]
        assert c["claim_type"] == "Theft"
        assert any(t["type"] == "Created" for t in c["timeline"])
        assert any(s["status"] == "Draft" for s in c["status_history"])

        # GET: must include _resolved_items + _financials
        r = requests.get(f"{API}/insurance-claims/{cid}", headers=H, timeout=30)
        assert r.status_code == 200
        full = r.json()
        assert "_resolved_items" in full
        assert "_financials" in full
        assert full["_financials"]["item_count"] == 0
        assert full["_financials"]["net_claimed"] == 0  # no items yet

        # PUT update
        r = requests.put(f"{API}/insurance-claims/{cid}", headers=H,
                         json={"description": "Edited via test", "deductible": 1000},
                         timeout=30)
        assert r.status_code == 200
        upd = r.json()
        assert upd["description"] == "Edited via test"
        assert upd["deductible"] == 1000

        # Verify persistence with GET
        r = requests.get(f"{API}/insurance-claims/{cid}", headers=H, timeout=30)
        assert r.json()["description"] == "Edited via test"

    def test_list_with_filters(self, H, created_claim_ids):
        # Plain list
        r = requests.get(f"{API}/insurance-claims", headers=H, timeout=30)
        assert r.status_code == 200
        all_claims = r.json()
        assert isinstance(all_claims, list)
        assert any(c["id"] in created_claim_ids for c in all_claims)
        # list cards have _item_count + _total_claimed
        sample = next(c for c in all_claims if c["id"] in created_claim_ids)
        assert "_item_count" in sample
        assert "_total_claimed" in sample

        # status filter
        r = requests.get(f"{API}/insurance-claims?status=Draft", headers=H, timeout=30)
        assert r.status_code == 200
        for c in r.json():
            assert c["status"] == "Draft"

        # claim_type filter
        r = requests.get(f"{API}/insurance-claims?claim_type=Theft", headers=H, timeout=30)
        assert r.status_code == 200
        for c in r.json():
            assert c["claim_type"] == "Theft"

        # q search
        r = requests.get(f"{API}/insurance-claims?q=TEST_Backend", headers=H, timeout=30)
        assert r.status_code == 200
        assert any(c["id"] in created_claim_ids for c in r.json())

        # archived=true should NOT return the unarchived claim
        r = requests.get(f"{API}/insurance-claims?archived=true", headers=H, timeout=30)
        assert r.status_code == 200
        assert all(c.get("archived") for c in r.json())


# ---------------------------------------------------------------------------
# Items + financials + inventory-safety
# ---------------------------------------------------------------------------
class TestItemsAndFinancials:
    @pytest.fixture(scope="class")
    def tool(self, H):
        # Use existing tools — fall back to creating one if needed
        r = requests.get(f"{API}/tools", headers=H, timeout=30)
        assert r.status_code == 200
        tools = r.json()
        # prefer a tool with non-zero cost or msrp so financials are exercised
        priced = [t for t in tools if (t.get("cost") or 0) > 0 or (t.get("msrp_price") or 0) > 0]
        if priced:
            return priced[0]
        if tools:
            return tools[0]
        # create a minimal tool
        r = requests.post(f"{API}/tools", headers=H, timeout=30,
                          json={"name": "TEST_Drill", "brand": "TEST", "cost": 250,
                                "quantity": 2, "msrp_price": 300})
        assert r.status_code in (200, 201), r.text
        return r.json()

    @pytest.fixture(scope="class")
    def claim(self, H, created_claim_ids):
        r = requests.post(f"{API}/insurance-claims", headers=H, timeout=30,
                          json={"title": "TEST_Items Claim", "claim_type": "Fire",
                                "coverage_limit": 5000, "deductible": 200,
                                "sales_tax": 25, "shipping_costs": 10,
                                "labor_costs": 0, "repair_costs": 0,
                                "depreciation": 100})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        created_claim_ids.append(cid)
        return r.json()

    def test_attach_items_and_financials(self, H, claim, tool):
        cid = claim["id"]
        tid = tool["id"]
        r = requests.post(f"{API}/insurance-claims/{cid}/items", headers=H,
                          json={"tool_ids": [tid]}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["added"] == 1
        assert any(it["tool_id"] == tid for it in d["items"])

        # idempotent: re-attaching the same tool adds 0
        r2 = requests.post(f"{API}/insurance-claims/{cid}/items", headers=H,
                           json={"tool_ids": [tid]}, timeout=30)
        assert r2.json()["added"] == 0

        # Force a claimed value so this test is independent of seed-data pricing.
        requests.patch(f"{API}/insurance-claims/{cid}/items/{tid}", headers=H,
                       json={"claimed_value": 1000.00}, timeout=30)

        # GET: financials must be > 0 now
        r = requests.get(f"{API}/insurance-claims/{cid}", headers=H, timeout=30)
        full = r.json()
        fin = full["_financials"]
        assert fin["item_count"] == 1
        assert fin["total_claimed"] >= 1000.00
        # net_claimed = total_claimed + extras - deductions, clamped to coverage_limit
        expected_net = (fin["total_claimed"]
                        + fin["sales_tax"] + fin["shipping_costs"]
                        + fin["labor_costs"] + fin["repair_costs"]
                        - fin["depreciation"] - fin["deductible"])
        expected_net = max(0, min(expected_net, fin["coverage_limit"] or expected_net))
        assert abs(fin["net_claimed"] - round(expected_net, 2)) < 0.01

    def test_patch_item(self, H, claim, tool):
        cid, tid = claim["id"], tool["id"]
        r = requests.patch(f"{API}/insurance-claims/{cid}/items/{tid}",
                           headers=H, timeout=30,
                           json={"pre_loss_condition": "Excellent",
                                 "post_loss_condition": "Destroyed",
                                 "claimed_value": 999.50})
        assert r.status_code == 200, r.text
        # verify
        r = requests.get(f"{API}/insurance-claims/{cid}", headers=H, timeout=30)
        items = r.json()["_resolved_items"]
        it = next(i for i in items if i["tool_id"] == tid)
        assert it["pre_loss_condition"] == "Excellent"
        assert it["post_loss_condition"] == "Destroyed"
        assert abs(it["line_claimed"] - 999.50) < 0.01

    def test_coverage_limit_clamp(self, H, created_claim_ids, tool):
        # Create claim with tiny coverage_limit and a big claimed item
        r = requests.post(f"{API}/insurance-claims", headers=H, timeout=30,
                          json={"title": "TEST_Clamp", "claim_type": "Other",
                                "coverage_limit": 100, "deductible": 0,
                                "depreciation": 0})
        cid = r.json()["id"]
        created_claim_ids.append(cid)
        requests.post(f"{API}/insurance-claims/{cid}/items", headers=H,
                      json={"tool_ids": [tool["id"]]}, timeout=30)
        requests.patch(f"{API}/insurance-claims/{cid}/items/{tool['id']}",
                       headers=H, json={"claimed_value": 99999}, timeout=30)
        full = requests.get(f"{API}/insurance-claims/{cid}", headers=H, timeout=30).json()
        assert full["_financials"]["net_claimed"] == 100  # clamped

    def test_negative_net_clamped_to_zero(self, H, created_claim_ids, tool):
        # Huge deductible should NOT produce a negative net
        r = requests.post(f"{API}/insurance-claims", headers=H, timeout=30,
                          json={"title": "TEST_NegClamp", "claim_type": "Other",
                                "coverage_limit": 0, "deductible": 100000,
                                "depreciation": 100000})
        cid = r.json()["id"]
        created_claim_ids.append(cid)
        requests.post(f"{API}/insurance-claims/{cid}/items", headers=H,
                      json={"tool_ids": [tool["id"]]}, timeout=30)
        full = requests.get(f"{API}/insurance-claims/{cid}", headers=H, timeout=30).json()
        assert full["_financials"]["net_claimed"] >= 0

    def test_detach_does_not_delete_tool(self, H, claim, tool):
        """CRITICAL invariant: detaching an item must NOT delete the inventory tool."""
        cid, tid = claim["id"], tool["id"]
        # Snapshot the tool before
        before = requests.get(f"{API}/tools/{tid}", headers=H, timeout=30)
        assert before.status_code == 200, before.text
        before_name = before.json().get("name")

        r = requests.delete(f"{API}/insurance-claims/{cid}/items/{tid}",
                            headers=H, timeout=30)
        assert r.status_code == 200, r.text

        # Tool MUST still exist with same name
        after = requests.get(f"{API}/tools/{tid}", headers=H, timeout=30)
        assert after.status_code == 200, "Tool was deleted from inventory!"
        assert after.json().get("name") == before_name

        # And the claim no longer has this item
        full = requests.get(f"{API}/insurance-claims/{cid}", headers=H, timeout=30).json()
        assert all(i["tool_id"] != tid for i in full["_resolved_items"])

    def test_bulk_remove_does_not_delete_tools(self, H, created_claim_ids, tool):
        r = requests.post(f"{API}/insurance-claims", headers=H, timeout=30,
                          json={"title": "TEST_Bulk", "claim_type": "Other"})
        cid = r.json()["id"]
        created_claim_ids.append(cid)
        tid = tool["id"]
        requests.post(f"{API}/insurance-claims/{cid}/items", headers=H,
                      json={"tool_ids": [tid]}, timeout=30)
        r = requests.post(f"{API}/insurance-claims/{cid}/items/bulk-remove",
                         headers=H, json={"tool_ids": [tid]}, timeout=30)
        assert r.status_code == 200
        assert r.json()["removed"] == 1
        # Tool still exists in inventory
        assert requests.get(f"{API}/tools/{tid}", headers=H, timeout=30).status_code == 200


# ---------------------------------------------------------------------------
# Status, notes, evidence
# ---------------------------------------------------------------------------
class TestStatusNotesEvidence:
    @pytest.fixture(scope="class")
    def cid(self, H, created_claim_ids):
        r = requests.post(f"{API}/insurance-claims", headers=H, timeout=30,
                          json={"title": "TEST_SNE", "claim_type": "Vandalism"})
        cid = r.json()["id"]
        created_claim_ids.append(cid)
        return cid

    def test_status_change_logs_timeline(self, H, cid):
        r = requests.post(f"{API}/insurance-claims/{cid}/status", headers=H, timeout=30,
                          json={"status": "Submitted", "note": "Filed"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Submitted"
        assert any(t["type"] == "Status" for t in d["timeline"])
        assert any(s["status"] == "Submitted" for s in d["status_history"])

    def test_invalid_status_rejected(self, H, cid):
        r = requests.post(f"{API}/insurance-claims/{cid}/status", headers=H, timeout=30,
                          json={"status": "Bogus"})
        assert r.status_code == 400

    def test_notes_add_and_delete(self, H, cid):
        r = requests.post(f"{API}/insurance-claims/{cid}/notes", headers=H, timeout=30,
                          json={"text": "TEST note", "category": "Insurance"})
        assert r.status_code == 200, r.text
        nid = r.json()["id"]
        full = requests.get(f"{API}/insurance-claims/{cid}", headers=H, timeout=30).json()
        assert any(n["id"] == nid for n in full["notes"])
        r = requests.delete(f"{API}/insurance-claims/{cid}/notes/{nid}", headers=H, timeout=30)
        assert r.status_code == 200
        full = requests.get(f"{API}/insurance-claims/{cid}", headers=H, timeout=30).json()
        assert all(n["id"] != nid for n in full["notes"])

    def test_evidence_lifecycle(self, H, cid):
        r = requests.post(f"{API}/insurance-claims/{cid}/evidence", headers=H, timeout=30,
                          json={"filename": "test.png", "mime": "image/png",
                                "kind": "Damage Photo",
                                "data_b64": f"data:image/png;base64,{PNG_B64}"})
        assert r.status_code == 200, r.text
        ev = r.json()
        # data_b64 must NOT come back in the list endpoint
        assert "data_b64" not in ev
        eid = ev["id"]

        r = requests.get(f"{API}/insurance-claims/{cid}/evidence", headers=H, timeout=30)
        assert r.status_code == 200
        evs = r.json()
        assert any(e["id"] == eid for e in evs)
        assert all("data_b64" not in e for e in evs)

        # individual GET should include data
        r = requests.get(f"{API}/insurance-claims/{cid}/evidence/{eid}", headers=H, timeout=30)
        assert r.status_code == 200
        assert "data_b64" in r.json()

        # delete
        r = requests.delete(f"{API}/insurance-claims/{cid}/evidence/{eid}", headers=H, timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/insurance-claims/{cid}/evidence", headers=H, timeout=30)
        assert all(e["id"] != eid for e in r.json())


# ---------------------------------------------------------------------------
# Reports (render + history + email)
# ---------------------------------------------------------------------------
class TestReports:
    @pytest.fixture(scope="class")
    def cid(self, H, created_claim_ids):
        # use a fresh claim with at least one item if possible
        tools = requests.get(f"{API}/tools", headers=H, timeout=30).json()
        r = requests.post(f"{API}/insurance-claims", headers=H, timeout=30,
                          json={"title": "TEST_Reports", "claim_type": "Theft",
                                "claim_number": "TST-9001"})
        cid = r.json()["id"]
        created_claim_ids.append(cid)
        if tools:
            requests.post(f"{API}/insurance-claims/{cid}/items", headers=H,
                          json={"tool_ids": [tools[0]["id"]]}, timeout=30)
        return cid

    def test_render_quick_and_detailed(self, H, cid):
        for kind in ("quick", "detailed"):
            r = requests.post(f"{API}/insurance-claims/{cid}/reports/render",
                              headers=H, json={"kind": kind}, timeout=60)
            assert r.status_code == 200, r.text
            assert r.headers.get("content-type", "").startswith("application/pdf")
            assert r.content[:4] == b"%PDF"
            assert "X-Report-Id" in r.headers
            assert "X-Report-Version" in r.headers
            assert int(r.headers["X-Report-Version"]) >= 1

    def test_list_and_download(self, H, cid):
        r = requests.get(f"{API}/insurance-claims/{cid}/reports", headers=H, timeout=30)
        assert r.status_code == 200
        recs = r.json()
        assert len(recs) >= 2  # quick + detailed from previous test
        # versions strictly increasing as we sorted desc
        versions = [r["version"] for r in recs]
        assert versions == sorted(versions, reverse=True)
        # data_b64 stripped on list
        assert all("data_b64" not in r for r in recs)
        # download a specific version
        first = recs[0]
        r = requests.get(f"{API}/insurance-claims/{cid}/reports/{first['id']}",
                         headers=H, timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
        assert r.headers.get("content-type", "").startswith("application/pdf")

    def test_email_report_does_not_500(self, H, cid):
        recs = requests.get(f"{API}/insurance-claims/{cid}/reports",
                            headers=H, timeout=30).json()
        rid = recs[0]["id"]
        r = requests.post(f"{API}/insurance-claims/{cid}/reports/{rid}/email",
                          headers=H,
                          json={"to": "noone@example.com",
                                "subject": "TEST", "body": "test"},
                          timeout=60)
        # 200 if SMTP configured, 502 if not — both acceptable per request spec.
        assert r.status_code in (200, 502), \
            f"email endpoint crashed: {r.status_code} {r.text}"


# ---------------------------------------------------------------------------
# Duplicate / archive / delete cascade
# ---------------------------------------------------------------------------
class TestLifecycle:
    def test_duplicate(self, H, created_claim_ids):
        r = requests.post(f"{API}/insurance-claims", headers=H, timeout=30,
                          json={"title": "TEST_Dup Source", "claim_type": "Flood",
                                "claim_number": "ORIG-1"})
        src = r.json()
        created_claim_ids.append(src["id"])
        r = requests.post(f"{API}/insurance-claims/{src['id']}/duplicate",
                          headers=H, timeout=30)
        assert r.status_code == 200, r.text
        dup = r.json()
        created_claim_ids.append(dup["id"])
        assert dup["id"] != src["id"]
        assert dup["status"] == "Draft"
        assert dup["claim_number"] == ""
        assert dup["title"].endswith("(Copy)")

    def test_archive_toggle(self, H, created_claim_ids):
        r = requests.post(f"{API}/insurance-claims", headers=H, timeout=30,
                          json={"title": "TEST_Archive", "claim_type": "Other"})
        cid = r.json()["id"]
        created_claim_ids.append(cid)
        r = requests.post(f"{API}/insurance-claims/{cid}/archive?archived=true",
                          headers=H, timeout=30)
        assert r.status_code == 200
        assert r.json()["archived"] is True
        # Should now appear in archived list
        archived = requests.get(f"{API}/insurance-claims?archived=true", headers=H, timeout=30).json()
        assert any(c["id"] == cid for c in archived)
        # And NOT in default list
        live = requests.get(f"{API}/insurance-claims", headers=H, timeout=30).json()
        assert all(c["id"] != cid for c in live)

    def test_delete_cascades_evidence_and_reports(self, H):
        # standalone — not added to created_claim_ids since we'll delete inside
        r = requests.post(f"{API}/insurance-claims", headers=H, timeout=30,
                          json={"title": "TEST_DelCascade", "claim_type": "Other"})
        cid = r.json()["id"]
        requests.post(f"{API}/insurance-claims/{cid}/evidence", headers=H, timeout=30,
                      json={"filename": "x.png", "mime": "image/png", "kind": "Other",
                            "data_b64": PNG_B64})
        requests.post(f"{API}/insurance-claims/{cid}/reports/render", headers=H,
                      json={"kind": "quick"}, timeout=60)
        # DELETE
        r = requests.delete(f"{API}/insurance-claims/{cid}", headers=H, timeout=30)
        assert r.status_code == 200
        # GET should now 404
        r = requests.get(f"{API}/insurance-claims/{cid}", headers=H, timeout=30)
        assert r.status_code == 404
        # Evidence + reports must 404 / 200-empty
        r = requests.get(f"{API}/insurance-claims/{cid}/evidence", headers=H, timeout=30)
        assert r.status_code == 404  # parent gone
        r = requests.get(f"{API}/insurance-claims/{cid}/reports", headers=H, timeout=30)
        # reports list is parent-agnostic: should be empty
        if r.status_code == 200:
            assert r.json() == []
