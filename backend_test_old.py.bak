"""
Backend tests for newly added feature areas:
  A) Documents per tool
  B) Maintenance schedules + service events + upcoming
  C) Theft / Loss reporting
  D) Bulk operations
Targets EXPO_PUBLIC_BACKEND_URL/api as set in /app/frontend/.env
"""
import sys
import base64
import requests
from datetime import datetime
from pathlib import Path


def get_base_url():
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        if line.strip().startswith("EXPO_PUBLIC_BACKEND_URL"):
            val = line.split("=", 1)[1].strip().strip('"').strip("'")
            return val.rstrip("/") + "/api"
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found")


BASE = get_base_url()
print(f"Using BASE={BASE}")

PASSED = 0
FAILED = 0
FAILURES = []


def check(cond, label, ctx=None):
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"  PASS - {label}")
    else:
        FAILED += 1
        msg = f"  FAIL - {label}"
        if ctx is not None:
            msg += f"  | ctx={ctx}"
        print(msg)
        FAILURES.append((label, ctx))


def post(path, json_body=None):
    return requests.post(BASE + path, json=json_body or {}, timeout=30)


def put(path, json_body=None):
    return requests.put(BASE + path, json=json_body or {}, timeout=30)


def get(path):
    return requests.get(BASE + path, timeout=30)


def delete(path):
    return requests.delete(BASE + path, timeout=30)


created_tool_ids = []
created_tag_ids = []
created_category_ids = []


# ===================== A) Documents per tool =====================
print("\n========== A) Documents per tool ==========")

r = post("/tools", {"name": "TT - Test Tool"})
check(r.status_code == 200, "A1: POST /tools TT created", r.text if r.status_code != 200 else None)
TT = r.json()
created_tool_ids.append(TT["id"])

b64_short = base64.b64encode(b"hello world pdf content here").decode()
r = post(f"/tools/{TT['id']}/documents", {
    "name": "Manual.pdf",
    "data": b64_short,
    "mime_type": "application/pdf",
    "size": 12345,
})
check(r.status_code == 200, "A2: POST /tools/{id}/documents (Manual.pdf) returns 200",
      r.text if r.status_code != 200 else None)
tool = r.json()
docs = tool.get("documents") or []
check(len(docs) == 1, "A2: tool.documents has 1 entry", len(docs))
doc1 = docs[0]
check(bool(doc1.get("id")), "A2: doc.id auto-generated", doc1)
check(doc1.get("name") == "Manual.pdf", "A2: doc.name is Manual.pdf", doc1.get("name"))
check(doc1.get("mime_type") == "application/pdf", "A2: doc.mime_type", doc1.get("mime_type"))
check(doc1.get("size") == 12345, "A2: doc.size honored", doc1.get("size"))
check(bool(doc1.get("uploaded_at")), "A2: doc.uploaded_at populated", doc1.get("uploaded_at"))

r = post(f"/tools/{TT['id']}/documents", {
    "name": "Receipt.jpg",
    "data": "abcd",
    "mime_type": "image/jpeg",
})
check(r.status_code == 200, "A3: POST second doc Receipt.jpg returns 200",
      r.text if r.status_code != 200 else None)
tool = r.json()
docs = tool.get("documents") or []
check(len(docs) == 2, "A3: tool.documents has 2 entries", len(docs))
doc2 = next((d for d in docs if d.get("name") == "Receipt.jpg"), None)
check(doc2 is not None, "A3: Receipt.jpg located")
expected_size = int(len("abcd") * 3 / 4)
check(doc2.get("size") == expected_size,
      f"A3: size auto-estimated from base64 (expected {expected_size})",
      doc2.get("size") if doc2 else None)

r = delete(f"/tools/{TT['id']}/documents/{doc1['id']}")
check(r.status_code == 200, "A4: DELETE doc1 returns 200", r.text if r.status_code != 200 else None)
tool = r.json()
docs = tool.get("documents") or []
check(len(docs) == 1, "A4: tool.documents has 1 doc remaining", len(docs))
check(docs[0].get("name") == "Receipt.jpg", "A4: remaining doc is Receipt.jpg")

r = delete(f"/tools/{TT['id']}/documents/non-existent-doc-id-1234")
check(r.status_code == 200, "A5: DELETE non-existent doc returns 200 (tolerant)",
      r.text if r.status_code != 200 else None)
tool = r.json()
docs = tool.get("documents") or []
check(len(docs) == 1, "A5: tool.documents still has 1 doc", len(docs))


# ===================== B) Maintenance schedules =====================
print("\n========== B) Maintenance schedules ==========")

r = post(f"/tools/{TT['id']}/maintenance", {
    "type": "Calibration",
    "interval_months": 12,
    "last_done_date": "2025-01-15",
    "notes": "Annual cal",
})
check(r.status_code == 200, "B1: POST /maintenance sch1 returns 200",
      r.text if r.status_code != 200 else None)
tool = r.json()
maints = tool.get("maintenance") or []
check(len(maints) == 1, "B1: tool.maintenance has 1 entry", len(maints))
sch1 = maints[0]
check(bool(sch1.get("id")), "B1: sch1.id auto-generated")
check(sch1.get("type") == "Calibration", "B1: sch1.type==Calibration", sch1.get("type"))
check(sch1.get("interval_months") == 12, "B1: sch1.interval_months==12", sch1.get("interval_months"))
check(sch1.get("last_done_date") == "2025-01-15", "B1: sch1.last_done_date==2025-01-15",
      sch1.get("last_done_date"))
check(sch1.get("next_due_date") == "2026-01-15", "B1: sch1.next_due_date==2026-01-15",
      sch1.get("next_due_date"))
check(sch1.get("notes") == "Annual cal", "B1: sch1.notes")
check(sch1.get("history") == [], "B1: sch1.history is []", sch1.get("history"))

r = post(f"/tools/{TT['id']}/maintenance", {"type": "Service", "interval_months": 6})
check(r.status_code == 200, "B2: POST /maintenance sch2 returns 200")
tool = r.json()
maints = tool.get("maintenance") or []
check(len(maints) == 2, "B2: tool.maintenance has 2 entries", len(maints))
sch2 = next((s for s in maints if s.get("type") == "Service"), None)
check(sch2 is not None, "B2: sch2 located")
check(sch2.get("last_done_date") is None, "B2: sch2.last_done_date is None", sch2.get("last_done_date"))
check(sch2.get("next_due_date") is None, "B2: sch2.next_due_date is None", sch2.get("next_due_date"))
check(sch2.get("history") == [], "B2: sch2.history is []", sch2.get("history"))

r = put(f"/tools/{TT['id']}/maintenance/{sch1['id']}", {"interval_months": 24})
check(r.status_code == 200, "B3: PUT sch1 interval_months=24 returns 200")
tool = r.json()
sch1_updated = next((s for s in (tool.get("maintenance") or []) if s.get("id") == sch1["id"]), None)
check(sch1_updated is not None, "B3: sch1 still present")
check(sch1_updated.get("interval_months") == 24, "B3: sch1.interval_months==24",
      sch1_updated.get("interval_months"))
check(sch1_updated.get("next_due_date") == "2027-01-15", "B3: sch1.next_due_date==2027-01-15",
      sch1_updated.get("next_due_date"))

r = post(f"/tools/{TT['id']}/maintenance/{sch1['id']}/service", {
    "date": "2026-01-15",
    "cost": 49.99,
    "technician": "CalLab",
    "notes": "OK",
})
check(r.status_code == 200, "B4: POST service event returns 200",
      r.text if r.status_code != 200 else None)
tool = r.json()
sch1_updated = next((s for s in (tool.get("maintenance") or []) if s.get("id") == sch1["id"]), None)
hist = sch1_updated.get("history") or []
check(len(hist) == 1, "B4: history has 1 event", len(hist))
ev = hist[0]
check(ev.get("date") == "2026-01-15", "B4: event.date", ev.get("date"))
check(abs((ev.get("cost") or 0) - 49.99) < 0.01, "B4: event.cost==49.99", ev.get("cost"))
check(ev.get("technician") == "CalLab", "B4: event.technician", ev.get("technician"))
check(ev.get("notes") == "OK", "B4: event.notes", ev.get("notes"))
check(sch1_updated.get("last_done_date") == "2026-01-15", "B4: sch1.last_done_date==2026-01-15",
      sch1_updated.get("last_done_date"))
check(sch1_updated.get("next_due_date") == "2028-01-15",
      "B4: sch1.next_due_date==2028-01-15 (24mo after)",
      sch1_updated.get("next_due_date"))

r = post(f"/tools/{TT['id']}/maintenance/{sch1['id']}/service", {})
check(r.status_code == 200, "B5: POST service event no date returns 200")
tool = r.json()
sch1_updated = next((s for s in (tool.get("maintenance") or []) if s.get("id") == sch1["id"]), None)
today_str = datetime.utcnow().strftime("%Y-%m-%d")
check(sch1_updated.get("last_done_date") == today_str,
      f"B5: last_done_date is today ({today_str})",
      sch1_updated.get("last_done_date"))


def add_months(date_str, months):
    d = datetime.strptime(date_str, "%Y-%m-%d")
    new_month = d.month + months
    new_year = d.year + (new_month - 1) // 12
    new_month = ((new_month - 1) % 12) + 1
    try:
        return d.replace(year=new_year, month=new_month).strftime("%Y-%m-%d")
    except ValueError:
        return d.replace(year=new_year, month=new_month, day=28).strftime("%Y-%m-%d")


expected_next = add_months(today_str, 24)
check(sch1_updated.get("next_due_date") == expected_next,
      f"B5: next_due_date recalc to {expected_next}",
      sch1_updated.get("next_due_date"))

# Set sch2 last_done_date so it has a next_due_date for upcoming test
r = put(f"/tools/{TT['id']}/maintenance/{sch2['id']}", {"last_done_date": today_str})
check(r.status_code == 200, "B6-pre: PUT sch2 last_done_date=today")
sch2_after = next((s for s in (r.json().get("maintenance") or []) if s.get("id") == sch2["id"]), None)
check(sch2_after.get("next_due_date") is not None, "B6-pre: sch2.next_due_date populated",
      sch2_after.get("next_due_date"))

r = get("/maintenance/upcoming?days=400")
check(r.status_code == 200, "B6: GET /maintenance/upcoming?days=400 returns 200")
data = r.json()
items = data.get("items") or []
our_items = [it for it in items if it.get("tool_id") == TT["id"]]
check(len(our_items) == 2, "B6: items contain both our schedules", len(our_items))
for it in our_items:
    fields_ok = all(k in it for k in ("tool_id", "tool_name", "schedule_id", "type",
                                       "next_due_date", "is_overdue"))
    check(fields_ok, f"B6: item has required fields ({it.get('type')})", it)
nds = [it.get("next_due_date") for it in items if it.get("next_due_date")]
check(nds == sorted(nds), "B6: items sorted by next_due_date asc", nds[:5])
overdue_in_items = sum(1 for it in items if it.get("is_overdue"))
due_soon_in_items = sum(1 for it in items if not it.get("is_overdue"))
check(data.get("overdue") == overdue_in_items,
      f"B6: overdue counter matches items (got {data.get('overdue')} vs {overdue_in_items})")
check(data.get("due_soon") == due_soon_in_items,
      f"B6: due_soon counter matches items (got {data.get('due_soon')} vs {due_soon_in_items})")

r = delete(f"/tools/{TT['id']}/maintenance/{sch2['id']}")
check(r.status_code == 200, "B7: DELETE sch2 returns 200")
tool = r.json()
maints = tool.get("maintenance") or []
check(len(maints) == 1, "B7: tool now has 1 schedule", len(maints))
check(maints[0].get("id") == sch1["id"], "B7: remaining schedule is sch1")

r = delete(f"/tools/non-existent-tool-id-1234/maintenance/{sch1['id']}")
check(r.status_code == 404,
      f"B8: DELETE on non-existent tool returns 404 (got {r.status_code})", r.text)


# ===================== C) Theft / Loss reporting =====================
print("\n========== C) Theft / Loss ==========")

r = post(f"/tools/{TT['id']}/report-lost", {
    "type": "stolen",
    "police_report_number": "24-1234",
    "insurance_company": "AllState",
    "insurance_claim_number": "IC-7",
    "reported_by": "Mike",
    "notes": "From van",
})
check(r.status_code == 200, "C1: POST /report-lost stolen returns 200",
      r.text if r.status_code != 200 else None)
tool = r.json()
ls = tool.get("lost_status") or {}
today_str = datetime.utcnow().strftime("%Y-%m-%d")
check(ls.get("is_lost") is True, "C1: is_lost==true", ls.get("is_lost"))
check(ls.get("type") == "stolen", "C1: type==stolen", ls.get("type"))
check(ls.get("reported_date") == today_str,
      f"C1: reported_date defaults to today ({today_str})", ls.get("reported_date"))
check(ls.get("police_report_number") == "24-1234", "C1: police_report_number")
check(ls.get("insurance_company") == "AllState", "C1: insurance_company")
check(ls.get("insurance_claim_number") == "IC-7", "C1: insurance_claim_number")
check(ls.get("reported_by") == "Mike", "C1: reported_by")
check(ls.get("notes") == "From van", "C1: notes")

r = post(f"/tools/{TT['id']}/recover", {})
check(r.status_code == 200, "C2: POST /recover returns 200")
tool = r.json()
ls = tool.get("lost_status") or {}
check(ls.get("is_lost") is False, "C2: is_lost==false", ls.get("is_lost"))
check(isinstance(ls.get("recovered_at"), str) and "T" in (ls.get("recovered_at") or ""),
      "C2: recovered_at is ISO timestamp", ls.get("recovered_at"))

r = post(f"/tools/{TT['id']}/report-lost", {"type": "lost", "reported_date": "2025-06-01"})
check(r.status_code == 200, "C3: POST /report-lost lost 2025-06-01 returns 200")
tool = r.json()
ls = tool.get("lost_status") or {}
check(ls.get("is_lost") is True, "C3: is_lost==true")
check(ls.get("type") == "lost", "C3: type==lost", ls.get("type"))
check(ls.get("reported_date") == "2025-06-01", "C3: reported_date==2025-06-01",
      ls.get("reported_date"))
check(ls.get("recovered_at") is None, "C3: recovered_at==null", ls.get("recovered_at"))

r = post("/tools/non-existent-tool-id-zzz/report-lost", {"type": "lost"})
check(r.status_code == 404,
      f"C4: report-lost non-existent tool returns 404 (got {r.status_code})", r.text)

r = post(f"/tools/{TT['id']}/report-lost", {"type": "missing"})
check(r.status_code == 200, "C5: report-lost invalid type returns 200")
tool = r.json()
ls = tool.get("lost_status") or {}
check(ls.get("type") == "lost", "C5: invalid type 'missing' falls back to 'lost'", ls.get("type"))


# ===================== D) Bulk operations =====================
print("\n========== D) Bulk operations ==========")

r = post("/tools", {"name": "T2 - Bulk Test 2"})
check(r.status_code == 200, "D1: POST /tools T2 created")
T2 = r.json()
created_tool_ids.append(T2["id"])

r = post("/tools", {"name": "T3 - Bulk Test 3"})
check(r.status_code == 200, "D1: POST /tools T3 created")
T3 = r.json()
created_tool_ids.append(T3["id"])

r = post("/tools/bulk", {
    "tool_ids": [T2["id"], T3["id"]],
    "action": "move_location",
    "location_id": None,
    "location_name": "",
})
check(r.status_code == 200, "D2: POST /tools/bulk move_location returns 200",
      r.text if r.status_code != 200 else None)
data = r.json()
check(data.get("ok") is True, "D2: ok==true", data)
check(data.get("affected") == 2, "D2: affected==2", data.get("affected"))
for tid in [T2["id"], T3["id"]]:
    rr = get(f"/tools/{tid}")
    check(rr.status_code == 200, f"D2: GET tool {tid}")
    t = rr.json()
    check(t.get("location_name") == "",
          f"D2: tool {tid} location_name=='' (got {t.get('location_name')!r})")

r = post("/tags", {"name": "BulkTagX"})
check(r.status_code == 200, "D3: POST /tags X created")
X = r.json()
created_tag_ids.append(X["id"])

r = post("/tools/bulk", {
    "tool_ids": [T2["id"], T3["id"]],
    "action": "add_tag",
    "tag_id": X["id"],
    "tag_name": X["name"],
})
check(r.status_code == 200, "D3: bulk add_tag returns 200")
data = r.json()
check(data.get("ok") is True, "D3: ok==true")
check(data.get("affected") == 2, "D3: affected==2", data.get("affected"))
for tid in [T2["id"], T3["id"]]:
    t = get(f"/tools/{tid}").json()
    check(X["id"] in (t.get("tag_ids") or []), f"D3: tool {tid} has X.id in tag_ids")
    check(X["name"] in (t.get("tag_names") or []), f"D3: tool {tid} has X.name in tag_names")

r = post("/tools/bulk", {
    "tool_ids": [T2["id"], T3["id"]],
    "action": "add_tag",
    "tag_id": X["id"],
    "tag_name": X["name"],
})
check(r.status_code == 200, "D4: bulk add_tag again returns 200")
for tid in [T2["id"], T3["id"]]:
    t = get(f"/tools/{tid}").json()
    tag_ids = t.get("tag_ids") or []
    tag_names = t.get("tag_names") or []
    check(tag_ids.count(X["id"]) == 1,
          f"D4: tool {tid} tag_ids has X.id exactly once", tag_ids)
    check(tag_names.count(X["name"]) == 1,
          f"D4: tool {tid} tag_names has X.name exactly once", tag_names)

r = post("/tools/bulk", {
    "tool_ids": [T2["id"]],
    "action": "remove_tag",
    "tag_id": X["id"],
    "tag_name": X["name"],
})
check(r.status_code == 200, "D5: bulk remove_tag returns 200")
t2 = get(f"/tools/{T2['id']}").json()
t3 = get(f"/tools/{T3['id']}").json()
check(X["id"] not in (t2.get("tag_ids") or []), "D5: T2 no longer has X.id", t2.get("tag_ids"))
check(X["name"] not in (t2.get("tag_names") or []), "D5: T2 no longer has X.name",
      t2.get("tag_names"))
check(X["id"] in (t3.get("tag_ids") or []), "D5: T3 still has X.id", t3.get("tag_ids"))

r = post("/categories", {"name": "BulkCatC"})
check(r.status_code == 200, "D6: POST /categories C created")
C = r.json()
created_category_ids.append(C["id"])

r = post("/tools/bulk", {
    "tool_ids": [T2["id"]],
    "action": "set_category",
    "category_id": C["id"],
    "category_name": C["name"],
})
check(r.status_code == 200, "D6: bulk set_category returns 200")
t2 = get(f"/tools/{T2['id']}").json()
check(t2.get("category_id") == C["id"], "D6: T2.category_id==C.id", t2.get("category_id"))
check(t2.get("category_name") == C["name"], "D6: T2.category_name==C.name",
      t2.get("category_name"))

r = post("/tools/bulk", {
    "tool_ids": [T2["id"], T3["id"]],
    "action": "report_lost",
    "lost_payload": {"type": "stolen", "police_report_number": "BULK-1"},
})
check(r.status_code == 200, "D7: bulk report_lost returns 200",
      r.text if r.status_code != 200 else None)
data = r.json()
check(data.get("ok") is True, "D7: ok==true")
check(data.get("affected") == 2, "D7: affected==2", data.get("affected"))
for tid in [T2["id"], T3["id"]]:
    t = get(f"/tools/{tid}").json()
    ls = t.get("lost_status") or {}
    check(ls.get("is_lost") is True, f"D7: tool {tid} lost_status.is_lost==true")
    check(ls.get("type") == "stolen", f"D7: tool {tid} lost_status.type==stolen",
          ls.get("type"))
    check(ls.get("police_report_number") == "BULK-1",
          f"D7: tool {tid} police_report_number==BULK-1", ls.get("police_report_number"))

r = post("/tools/bulk", {"tool_ids": [T2["id"], T3["id"]], "action": "delete"})
check(r.status_code == 200, "D8: bulk delete returns 200")
data = r.json()
check(data.get("ok") is True, "D8: ok==true")
check(data.get("affected") == 2, "D8: affected==2", data.get("affected"))
for tid in [T2["id"], T3["id"]]:
    rr = get(f"/tools/{tid}")
    check(rr.status_code == 404,
          f"D8: GET tool {tid} returns 404 after delete (got {rr.status_code})")
created_tool_ids = [tid for tid in created_tool_ids if tid not in (T2["id"], T3["id"])]

r = post("/tools/bulk", {"tool_ids": [TT["id"]], "action": "unknown"})
check(r.status_code == 400, f"D9: unknown action returns 400 (got {r.status_code})", r.text)

r = post("/tools/bulk", {"tool_ids": [TT["id"]], "action": "add_tag"})
check(r.status_code == 400,
      f"D10: add_tag missing tag_id returns 400 (got {r.status_code})", r.text)


# ===================== Cleanup =====================
print("\n========== Cleanup ==========")
for tid in created_tool_ids:
    r = delete(f"/tools/{tid}")
    check(r.status_code == 200, f"Cleanup: DELETE tool {tid}")
for tagid in created_tag_ids:
    r = delete(f"/tags/{tagid}")
    check(r.status_code == 200, f"Cleanup: DELETE tag {tagid}")
for cid in created_category_ids:
    r = delete(f"/categories/{cid}")
    check(r.status_code == 200, f"Cleanup: DELETE category {cid}")


print("\n" + "=" * 60)
print(f"RESULTS: {PASSED} PASSED, {FAILED} FAILED")
print("=" * 60)
if FAILURES:
    print("\nFAILURES:")
    for label, ctx in FAILURES:
        print(f"  - {label}")
        if ctx is not None:
            print(f"    ctx={ctx}")
sys.exit(0 if FAILED == 0 else 1)
