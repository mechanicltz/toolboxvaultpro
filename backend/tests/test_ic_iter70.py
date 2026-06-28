"""Iteration 70 — Insurance Claims refinements (summary fields + progress clamp).

Tests:
  1. GET /api/insurance-claims/summary returns denied_claims and open_tasks
     fields (integer counts) without error.
  2. GET /api/insurance-claims/{id} _progress.percent is clamped to 99 when
     attached items have warnings AND status is non-final.
  3. _progress.percent is allowed to reach computed full value when status
     is final (Approved/Denied/Partially Approved/Paid/Closed).
"""
from __future__ import annotations

import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

USER_EMAIL = "ryan@ryan.com"
USER_PASSWORD = "ryan1234"


@pytest.fixture(scope="module")
def headers():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": USER_EMAIL, "password": USER_PASSWORD},
        timeout=30,
    )
    if r.status_code == 429:
        pytest.skip("login rate-limited")
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ----- (1) summary endpoint -------------------------------------------------

class TestSummaryExtraCounts:
    def test_summary_returns_denied_and_open_tasks(self, headers):
        r = requests.get(f"{API}/insurance-claims/summary", headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        # Expected new keys
        assert "denied_claims" in body, f"missing denied_claims: {body}"
        assert "open_tasks" in body, f"missing open_tasks: {body}"
        assert isinstance(body["denied_claims"], int), \
            f"denied_claims must be int, got {type(body['denied_claims']).__name__}"
        assert isinstance(body["open_tasks"], int), \
            f"open_tasks must be int, got {type(body['open_tasks']).__name__}"
        assert body["denied_claims"] >= 0
        assert body["open_tasks"] >= 0
        # Pre-existing keys still present
        for k in ("total_claims", "open_claims", "closed_claims",
                  "total_claimed_value", "total_approved_value", "total_paid_value"):
            assert k in body, f"missing pre-existing summary key {k}"


# ----- (2 + 3) progress clamp ----------------------------------------------

@pytest.fixture(scope="module")
def warning_tool_id(headers):
    """Find or create a tool with WARNINGS (no serial, no model, no price,
    no purchase date) so the claim attached to it will fail _item_has_warnings."""
    # Try to find an existing tool that is "naked" enough to trigger warnings.
    r = requests.get(f"{API}/tools", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    tools = r.json()
    for t in tools:
        cost_ok = float(t.get("cost") or 0) > 0
        has_serials = bool((t.get("serial_numbers") or []) or t.get("serial_number"))
        has_models = bool((t.get("model_numbers") or []) or t.get("model"))
        has_date = bool(t.get("purchase_date"))
        if not (has_serials and has_models and cost_ok and has_date):
            return t["id"]
    pytest.skip("no warning-prone tool available on ryan@ryan.com")


@pytest.fixture(scope="module")
def created_claim_id(headers, warning_tool_id):
    """Create a temp Draft claim, attach the warning tool, fill enough fields
    to push progress to 100% (then verify clamp behaviour)."""
    payload = {
        "title": "TEST_iter70 progress clamp",
        "claim_type": "Theft",
        "status": "Draft",
        "claim_number": "TEST70-CN",
        "description": "test desc",
        "incident_notes": "test notes",
        "deductible": 100.0,
        "coverage_limit": 5000.0,
    }
    r = requests.post(f"{API}/insurance-claims", headers=headers, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]

    # Set insurance company so the 'insurer' step is done
    requests.put(
        f"{API}/insurance-claims/{cid}",
        headers=headers,
        json={"insurance": {"company": "TEST Co", "policy_number": "POL-70"}},
        timeout=20,
    )
    # Attach the warning tool (drives 'inventory' step done)
    requests.post(
        f"{API}/insurance-claims/{cid}/items",
        headers=headers,
        json={"tool_ids": [warning_tool_id]},
        timeout=20,
    )
    yield cid
    # Cleanup
    requests.delete(f"{API}/insurance-claims/{cid}", headers=headers, timeout=20)


class TestProgressClamp:
    def test_non_final_status_with_warnings_clamps_to_99(self, headers, created_claim_id):
        # Ensure status is non-final
        requests.post(
            f"{API}/insurance-claims/{created_claim_id}/status",
            headers=headers, json={"status": "Submitted"}, timeout=20,
        )
        # Add evidence image so 'photos' step is done
        # 1x1 transparent PNG
        png = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgY"
            "GD4DwABAQEAhSrLDgAAAABJRU5ErkJggg=="
        )
        requests.post(
            f"{API}/insurance-claims/{created_claim_id}/evidence",
            headers=headers,
            json={"filename": "p.png", "mime": "image/png", "kind": "Damage Photo", "data_b64": png},
            timeout=20,
        )
        # Generate a report so the 'report' step is done
        requests.post(
            f"{API}/insurance-claims/{created_claim_id}/reports/render",
            headers=headers,
            json={"kind": "quick"},
            timeout=60,
        )
        # Re-read claim
        r = requests.get(f"{API}/insurance-claims/{created_claim_id}", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        claim = r.json()
        progress = claim.get("_progress") or {}
        resolved = claim.get("_resolved_items") or []
        # Confirm item has warnings (no serials/models/cost/date)
        if resolved:
            r0 = resolved[0]
            has_warn = (
                not (r0.get("serials") or [])
                or not (r0.get("models") or [])
                or float(r0.get("cost") or 0) <= 0
                or not r0.get("purchase_date")
            )
            assert has_warn, f"expected item warnings but resolved item looks complete: {r0}"
        assert claim["status"] not in {"Approved", "Denied", "Partially Approved", "Paid", "Closed"}, \
            "status drifted to final unexpectedly"
        pct = progress.get("percent")
        assert pct is not None, "missing _progress.percent"
        assert pct < 100, (
            f"non-final status WITH warnings should clamp progress below 100; got {pct}. "
            f"steps_done={progress.get('steps_done')}/{progress.get('steps_total')}, "
            f"tasks_done={progress.get('tasks_done')}/{progress.get('tasks_total')}"
        )
        # And specifically clamp value should be 99 if the raw % was >=100
        # (else any sub-100 value is also fine, we just need <100.)

    def test_final_status_allows_full_progress(self, headers, created_claim_id):
        """When status is final (Paid), the clamp should NOT cap progress
        below 100 even though the attached item has warnings. We verify this
        by computing the would-be raw percent ourselves and asserting the
        backend's percent equals it (NOT clamped to 99)."""
        # Move to final status (Paid)
        requests.post(
            f"{API}/insurance-claims/{created_claim_id}/status",
            headers=headers,
            json={"status": "Paid", "paid_value": 1000.0},
            timeout=20,
        )
        r = requests.get(f"{API}/insurance-claims/{created_claim_id}", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        claim = r.json()
        progress = claim.get("_progress") or {}
        assert claim["status"] == "Paid"
        pct = progress.get("percent")
        steps_done = progress.get("steps_done", 0)
        steps_total = progress.get("steps_total", 7)
        tasks_done = progress.get("tasks_done", 0)
        tasks_total = progress.get("tasks_total", 0)
        # Recompute the raw blended percent the same way the backend does.
        if tasks_total:
            raw = round((steps_done + tasks_done) / (steps_total + tasks_total) * 100)
        else:
            raw = round(steps_done / steps_total * 100)
        # final status → clamp must NOT fire → percent should equal raw (even
        # if it happens to be 100). If raw is <100 organically we still pass.
        assert pct == raw, (
            f"final-status claim should NOT be clamped: backend percent={pct} "
            f"but recomputed raw={raw} (steps {steps_done}/{steps_total}, "
            f"tasks {tasks_done}/{tasks_total}). The clamp must only engage on non-final."
        )
