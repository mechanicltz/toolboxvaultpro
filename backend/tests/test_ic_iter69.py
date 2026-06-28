"""Iteration 69 — Insurance Claims refinements backend regression.

Focus areas:
  1. Default tasks: every claim returned by GET /api/insurance-claims/{id}
     must have a seeded default task list whose `done` flags are
     auto-derived from the claim's actual data (not stored manual state).
  2. Custom user task add → patch → delete works end-to-end and survives
     the auto-complete pass intact.
  3. Report rendering POST /api/insurance-claims/{id}/reports/render must
     return 200 + application/pdf (PDF restyle should not have broken
     generation).
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

# ryan@ryan.com is the user-supplied test account that has the seeded
# 'Truck Break-In — Stolen Tools' claim with items + notes + evidence +
# insurance info — perfect for verifying auto-complete behaviour.
USER_EMAIL = "ryan@ryan.com"
USER_PASSWORD = "ryan1234"
TARGET_CLAIM_TITLE = "Truck Break-In — Stolen Tools"

DEFAULT_TASK_TEXTS = [
    "Add your insurance company & policy info",
    "Enter the claim number from your insurer",
    "Attach the destroyed/damaged inventory items",
    "Add photos & evidence of the damage",
    "Review each item's details (serial, model, price, purchase date)",
    "Generate the claim report package",
    "Submit the claim to your insurer",
]


@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{API}/auth/login",
                      json={"email": USER_EMAIL, "password": USER_PASSWORD},
                      timeout=30)
    if r.status_code == 429:
        pytest.skip("login rate-limited (5/min); rerun in a minute")
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.text}"
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def claim_id(headers):
    r = requests.get(f"{API}/insurance-claims", headers=headers, timeout=20)
    assert r.status_code == 200, f"list claims failed: {r.status_code}"
    claims = r.json()
    match = [c for c in claims if c.get("title") == TARGET_CLAIM_TITLE]
    assert match, f"target claim '{TARGET_CLAIM_TITLE}' not found in {[c.get('title') for c in claims]}"
    return match[0]["id"]


# --- default task auto-complete ---------------------------------------------

class TestDefaultTasksAutoComplete:
    """Confirm GET claim returns the 7 default tasks and that done flags
    reflect claim data (the new spec behaviour)."""

    def test_claim_has_all_default_tasks_in_order(self, headers, claim_id):
        r = requests.get(f"{API}/insurance-claims/{claim_id}", headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        claim = r.json()
        tasks = claim.get("tasks") or []
        default_tasks = [t for t in tasks if t.get("source") == "default"]
        texts = [t["text"] for t in default_tasks]
        assert texts == DEFAULT_TASK_TEXTS, (
            "default task list/ordering changed — frontend Tasks tab "
            f"depends on this. Got: {texts}")

    def test_default_tasks_auto_completed_from_data(self, headers, claim_id):
        r = requests.get(f"{API}/insurance-claims/{claim_id}", headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        claim = r.json()
        tasks = {t["text"]: t for t in claim.get("tasks", []) if t.get("source") == "default"}
        ins = claim.get("insurance") or {}
        items = claim.get("items") or []

        # Insurance company → first default task auto-checks
        if ins.get("company"):
            assert tasks[DEFAULT_TASK_TEXTS[0]]["done"] is True, (
                "Default task 'insurance company' should be auto-checked "
                f"because claim.insurance.company={ins.get('company')!r}")
        # Claim number → 2nd default task
        if claim.get("claim_number"):
            assert tasks[DEFAULT_TASK_TEXTS[1]]["done"] is True
        # Items attached → 3rd default task
        if items:
            assert tasks[DEFAULT_TASK_TEXTS[2]]["done"] is True
        # Submitted-ish status → 7th default task auto-checks
        submitted_statuses = {"Submitted", "Under Review", "More Information Needed",
                              "Approved", "Partially Approved", "Paid", "Closed", "Denied"}
        if claim.get("status") in submitted_statuses:
            assert tasks[DEFAULT_TASK_TEXTS[6]]["done"] is True, (
                f"Status={claim.get('status')} should auto-complete 'Submit the claim'")

    def test_default_task_done_state_not_user_togglable(self, headers, claim_id):
        """PATCHing a default task's done=False should NOT persist — the next
        GET should still report done=True because the auto-derivation runs
        again on read. This proves the 'auto step' read-only spec."""
        r = requests.get(f"{API}/insurance-claims/{claim_id}", headers=headers, timeout=20)
        claim = r.json()
        # Find first default task that is auto-completed (likely insurance info)
        candidates = [t for t in (claim.get("tasks") or [])
                      if t.get("source") == "default" and t.get("done")]
        if not candidates:
            pytest.skip("no auto-completed default task to flip")
        t = candidates[0]
        # Try to flip via PATCH (simulating someone tampering)
        pr = requests.patch(f"{API}/insurance-claims/{claim_id}/tasks/{t['id']}",
                            headers=headers, json={"done": False}, timeout=20)
        assert pr.status_code == 200, pr.text
        # Re-read: auto-derivation should re-flip to True
        r2 = requests.get(f"{API}/insurance-claims/{claim_id}", headers=headers, timeout=20)
        again = [x for x in r2.json().get("tasks", []) if x["id"] == t["id"]]
        assert again, "task disappeared after patch"
        assert again[0]["done"] is True, (
            "Auto-derivation did not re-assert default-task done flag — "
            "user override would defeat the spec.")


# --- custom user task lifecycle --------------------------------------------

class TestUserTaskLifecycle:
    """User-added tasks must still add/patch/delete independently of the
    auto-complete pass on default tasks."""

    def test_add_patch_delete_user_task(self, headers, claim_id):
        # Create
        r = requests.post(f"{API}/insurance-claims/{claim_id}/tasks",
                          headers=headers,
                          json={"text": "TEST_iter69 task", "notify": False},
                          timeout=20)
        assert r.status_code == 200, r.text
        task = r.json()
        assert task["text"] == "TEST_iter69 task"
        assert task["source"] == "user"
        assert task["done"] is False
        tid = task["id"]

        try:
            # GET claim, ensure custom task present alongside the 7 defaults
            g = requests.get(f"{API}/insurance-claims/{claim_id}", headers=headers, timeout=20)
            tasks = g.json().get("tasks", [])
            defaults = [t for t in tasks if t.get("source") == "default"]
            customs = [t for t in tasks if t.get("source") == "user"]
            assert len(defaults) == 7, f"expected 7 default tasks, got {len(defaults)}"
            assert any(t["id"] == tid for t in customs), "custom task missing"

            # Patch: mark done
            p = requests.patch(f"{API}/insurance-claims/{claim_id}/tasks/{tid}",
                               headers=headers, json={"done": True}, timeout=20)
            assert p.status_code == 200, p.text

            g2 = requests.get(f"{API}/insurance-claims/{claim_id}", headers=headers, timeout=20)
            mine = [t for t in g2.json().get("tasks", []) if t["id"] == tid]
            assert mine and mine[0]["done"] is True, "user task done flag did not persist"
        finally:
            # Clean up
            d = requests.delete(f"{API}/insurance-claims/{claim_id}/tasks/{tid}",
                                headers=headers, timeout=20)
            assert d.status_code == 200, d.text


# --- report rendering -------------------------------------------------------

class TestReportRender:
    """Restyled PDF should still render successfully (no 500)."""

    def test_render_quick_pdf_returns_pdf(self, headers, claim_id):
        opts = {
            "kind": "quick",
            "item_columns": ["brand", "serial_model", "qty", "claimed"],
        }
        r = requests.post(f"{API}/insurance-claims/{claim_id}/reports/render",
                          headers=headers, json=opts, timeout=60)
        assert r.status_code == 200, f"render failed {r.status_code}: {r.text[:300]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:5] == b"%PDF-", (
            f"response is not a PDF (first bytes: {r.content[:32]!r})")
        # Reasonable size — not empty, not absurd
        assert 1000 < len(r.content) < 5_000_000, f"unexpected PDF size {len(r.content)}"

    def test_render_detailed_pdf_returns_pdf(self, headers, claim_id):
        opts = {
            "kind": "detailed",
            "item_columns": ["brand", "serial_model", "qty", "condition",
                             "purchase_date", "cost", "claimed"],
            "include_items": True,
            "include_financials": True,
            "include_notes": True,
            "include_timeline": True,
            "include_evidence": True,
            "include_insurance": True,
            "include_incident": True,
        }
        r = requests.post(f"{API}/insurance-claims/{claim_id}/reports/render",
                          headers=headers, json=opts, timeout=60)
        assert r.status_code == 200, f"render failed {r.status_code}: {r.text[:300]}"
        assert r.content[:5] == b"%PDF-"
        # The persisted record should also be retrievable
        rep_id = r.headers.get("X-Report-Id")
        assert rep_id, "missing X-Report-Id header"
        d = requests.get(f"{API}/insurance-claims/{claim_id}/reports/{rep_id}",
                         headers=headers, timeout=30)
        assert d.status_code == 200
        assert d.content[:5] == b"%PDF-"
