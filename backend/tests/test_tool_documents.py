"""Backend tests for per-tool document endpoints.

Covers the new PATCH /api/tools/{tool_id}/documents/{doc_id} rename endpoint
plus the existing POST (add) and DELETE document endpoints. Uses the Pro
account (mechanicltz@gmail.com) so we can create a tool without hitting the
free-tier 15-tool cap.

Run:  cd /app/backend && python -m pytest tests/test_tool_documents.py -v
"""
from __future__ import annotations

import base64
import os
import time

import pytest
import requests

from conftest import BASE_URL

PRO_EMAIL = "mechanicltz@gmail.com"
PRO_PASSWORD = "Blue321!"


@pytest.fixture(scope="module")
def pro_token() -> str:
    """One login for the Pro account (rate-limit-safe via conftest cache)."""
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": PRO_EMAIL, "password": PRO_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"pro login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, "no token in login response"
    return tok


@pytest.fixture(scope="module")
def pro_api(pro_token: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {pro_token}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="module")
def created_tool_id(pro_api: requests.Session) -> str:
    """Create a tool we own (Pro acct) and clean up at end of module."""
    payload = {
        "name": f"TEST_DOC_TOOL_{int(time.time())}",
        "brand": "TestBrand",
        "model": "DocTest",
        "quantity": 1,
    }
    r = pro_api.post(f"{BASE_URL}/api/tools", json=payload)
    assert r.status_code in (200, 201), f"create tool: {r.status_code} {r.text}"
    tid = r.json()["id"]
    yield tid
    # Teardown
    try:
        pro_api.delete(f"{BASE_URL}/api/tools/{tid}")
    except Exception:
        pass


# Helper: minimal valid base64 PDF-ish payload.
_TINY_B64 = base64.b64encode(b"%PDF-1.4 test document body").decode()


class TestDocumentLifecycle:
    """Full add -> rename -> verify -> delete -> verify-gone flow."""

    def test_add_document(self, pro_api: requests.Session, created_tool_id: str):
        payload = {
            "name": "TEST_invoice.pdf",
            "data": _TINY_B64,
            "mime_type": "application/pdf",
            "size": len(_TINY_B64),
        }
        r = pro_api.post(
            f"{BASE_URL}/api/tools/{created_tool_id}/documents", json=payload
        )
        assert r.status_code == 200, f"add doc: {r.status_code} {r.text}"
        tool = r.json()
        docs = tool.get("documents") or []
        assert len(docs) >= 1, "documents list should contain new entry"
        assert any(d.get("name") == "TEST_invoice.pdf" for d in docs)
        # Stash the new doc id on the test class for downstream tests.
        added = next(d for d in docs if d.get("name") == "TEST_invoice.pdf")
        assert added.get("id"), "added document must have an id"
        TestDocumentLifecycle.doc_id = added["id"]

    def test_rename_document(self, pro_api: requests.Session, created_tool_id: str):
        assert getattr(TestDocumentLifecycle, "doc_id", None), \
            "must run test_add_document first"
        doc_id = TestDocumentLifecycle.doc_id
        new_name = "TEST_invoice_renamed.pdf"
        r = pro_api.patch(
            f"{BASE_URL}/api/tools/{created_tool_id}/documents/{doc_id}",
            json={"name": new_name},
        )
        assert r.status_code == 200, f"rename: {r.status_code} {r.text}"
        tool = r.json()
        docs = tool.get("documents") or []
        match = next((d for d in docs if d.get("id") == doc_id), None)
        assert match is not None, "renamed doc must still exist"
        assert match.get("name") == new_name, \
            f"name should be {new_name!r}, got {match.get('name')!r}"

    def test_rename_persists_after_refetch(
        self, pro_api: requests.Session, created_tool_id: str
    ):
        """GET the tool again and verify the rename actually persisted to DB."""
        doc_id = TestDocumentLifecycle.doc_id
        r = pro_api.get(f"{BASE_URL}/api/tools/{created_tool_id}")
        assert r.status_code == 200, r.text
        docs = r.json().get("documents") or []
        match = next((d for d in docs if d.get("id") == doc_id), None)
        assert match is not None
        assert match.get("name") == "TEST_invoice_renamed.pdf"

    def test_rename_empty_name_rejected(
        self, pro_api: requests.Session, created_tool_id: str
    ):
        doc_id = TestDocumentLifecycle.doc_id
        r = pro_api.patch(
            f"{BASE_URL}/api/tools/{created_tool_id}/documents/{doc_id}",
            json={"name": "   "},
        )
        assert r.status_code == 400, f"expected 400 for empty name, got {r.status_code}"

    def test_rename_unknown_doc_404(
        self, pro_api: requests.Session, created_tool_id: str
    ):
        r = pro_api.patch(
            f"{BASE_URL}/api/tools/{created_tool_id}/documents/nonexistent-id",
            json={"name": "anything"},
        )
        assert r.status_code == 404

    def test_rename_unknown_tool_404(self, pro_api: requests.Session):
        r = pro_api.patch(
            f"{BASE_URL}/api/tools/nonexistent-tool/documents/whatever",
            json={"name": "anything"},
        )
        assert r.status_code == 404

    def test_delete_document(
        self, pro_api: requests.Session, created_tool_id: str
    ):
        doc_id = TestDocumentLifecycle.doc_id
        r = pro_api.delete(
            f"{BASE_URL}/api/tools/{created_tool_id}/documents/{doc_id}"
        )
        assert r.status_code == 200, f"delete: {r.status_code} {r.text}"
        docs = r.json().get("documents") or []
        assert not any(d.get("id") == doc_id for d in docs), \
            "doc must be gone from list"

    def test_delete_verify_gone_via_refetch(
        self, pro_api: requests.Session, created_tool_id: str
    ):
        doc_id = TestDocumentLifecycle.doc_id
        r = pro_api.get(f"{BASE_URL}/api/tools/{created_tool_id}")
        assert r.status_code == 200
        docs = r.json().get("documents") or []
        assert not any(d.get("id") == doc_id for d in docs)
