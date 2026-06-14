"""Guard tests for routes_tools.py (god-file refactor B3 — the tools group).

Read-only / non-destructive: these don't create tools (the account may be at
its free-tier limit) but they DO exercise the list/filter path and the inline
Pydantic request-body endpoints (CSV export & import) that were the trickiest
part of the extraction — a regression there shows up immediately as a 422/500.

Run:  cd /app/backend && python -m pytest tests/test_routes_tools.py -v
"""
from __future__ import annotations

import requests

from conftest import BASE_URL


class TestToolsRead:
    def test_list_plain(self, api: requests.Session):
        r = api.get(f"{BASE_URL}/api/tools")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_list_with_search_and_filters(self, api: requests.Session):
        r = api.get(f"{BASE_URL}/api/tools",
                    params={"search": "a", "needs_repair": "false", "is_sold": "false"})
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_get_single_tool(self, api: requests.Session):
        tools = api.get(f"{BASE_URL}/api/tools").json()
        if not tools:
            return  # nothing to fetch; list path already covered
        r = api.get(f"{BASE_URL}/api/tools/{tools[0]['id']}")
        assert r.status_code == 200, r.text
        assert r.json()["id"] == tools[0]["id"]


class TestImportExportFields:
    def test_import_and_export_field_catalogs(self, api: requests.Session):
        for path in ("/api/tools/import-fields", "/api/tools/export-fields"):
            r = api.get(f"{BASE_URL}{path}")
            assert r.status_code == 200, f"{path}: {r.text}"


class TestCsvExport:
    """These hit the inline ExportPayload body model — guards the
    future-annotations / local-model regression we fixed."""

    def test_export_csv_get(self, api: requests.Session):
        r = api.get(f"{BASE_URL}/api/tools/export-csv")
        assert r.status_code == 200, r.text

    def test_export_csv_post_empty_body(self, api: requests.Session):
        r = api.post(f"{BASE_URL}/api/tools/export-csv", json={})
        assert r.status_code == 200, r.text

    def test_export_csv_post_with_fields(self, api: requests.Session):
        r = api.post(f"{BASE_URL}/api/tools/export-csv",
                     json={"fields": ["name", "brand"], "format": "csv"})
        assert r.status_code == 200, r.text


class TestCsvImport:
    """Hits the inline ImportPayload body model."""

    def test_import_empty_rows_is_noop(self, api: requests.Session):
        r = api.post(f"{BASE_URL}/api/tools/import", json={"rows": []})
        assert r.status_code == 200, r.text
