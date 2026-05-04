"""Backend tests for CSV import/export endpoints.

Runs against EXPO_PUBLIC_BACKEND_URL/api using subtest@example.com / password123.
"""
import sys
import base64
import requests


BACKEND_URL = "https://asset-locator-12.preview.emergentagent.com"
API = f"{BACKEND_URL}/api"
EMAIL = "subtest@example.com"
PASSWORD = "password123"


results = []


def rec(name, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name}: {detail}")
    results.append((name, ok, detail))


def login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def main():
    token = login()
    H = {"Authorization": f"Bearer {token}"}

    # Step 1: GET /api/tools/import-fields
    r = requests.get(f"{API}/tools/import-fields", headers=H, timeout=30)
    rec("1.status", r.status_code == 200, f"status={r.status_code}")
    body = r.json() if r.status_code == 200 else {}
    fields = body.get("fields") or []
    rec("1.has_fields_list", isinstance(fields, list), f"type={type(fields).__name__}")
    rec("1.count==14", len(fields) == 14, f"count={len(fields)}")
    ids = [f.get("id") for f in fields]
    expected_ids = ["name", "brand", "model", "serial_number", "quantity", "cost",
                    "description", "category", "location", "dealer", "condition",
                    "purchase_date", "warranty_expiry", "tags"]
    missing = [i for i in expected_ids if i not in ids]
    rec("1.ids_complete", not missing, f"missing={missing}; got={ids}")
    name_field = next((f for f in fields if f.get("id") == "name"), None)
    rec("1.name_required_true", bool(name_field and name_field.get("required") is True),
        f"name_field={name_field}")

    # Step 2: GET /api/tools/export-csv
    r = requests.get(f"{API}/tools/export-csv", headers=H, timeout=60)
    rec("2.status", r.status_code == 200, f"status={r.status_code}")
    eb = r.json() if r.status_code == 200 else {}
    rec("2.has_filename", bool(eb.get("filename")), f"filename={eb.get('filename')}")
    rec("2.has_base64", bool(eb.get("base64")), "")
    rec("2.has_rows", isinstance(eb.get("rows"), int), f"rows={eb.get('rows')}")
    decoded = ""
    if eb.get("base64"):
        try:
            decoded = base64.b64decode(eb["base64"]).decode("utf-8")
        except Exception as e:
            rec("2.decode_base64", False, str(e))
    expected_header = ("Name,Brand,Model,Serial number,Quantity,Cost,"
                       "Category,Location,Dealer,Tags,Condition,"
                       "Purchase date,Warranty expiry,Description,"
                       "Is consumable,Is set,Set serials")
    first_line = decoded.split("\r\n", 1)[0] if "\r\n" in decoded else decoded.split("\n", 1)[0]
    rec("2.header_17col_match", first_line == expected_header,
        f"got='{first_line[:200]}'")

    r2 = requests.get(f"{API}/tools", headers=H, timeout=30)
    tools_count = len(r2.json()) if r2.status_code == 200 else -1
    rec("2.rows_matches_get_tools", eb.get("rows") == tools_count,
        f"export.rows={eb.get('rows')} vs GET/tools.len={tools_count}")

    # Step 3: POST /api/tools/import with empty rows
    r = requests.post(f"{API}/tools/import", headers=H, json={"rows": []}, timeout=30)
    rec("3.status", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    jb = r.json() if r.status_code == 200 else {}
    rec("3.created==0", jb.get("created") == 0, f"created={jb.get('created')}")
    rec("3.errors_empty", jb.get("errors") == [], f"errors={jb.get('errors')}")
    rec("3.ids_empty", jb.get("ids") == [], f"ids={jb.get('ids')}")

    # Step 4: POST /api/tools/import with one good row
    payload4 = {"rows": [{
        "name": "CSV-Imported Tool",
        "brand": "Snap-on",
        "quantity": "3",
        "cost": "49.99",
        "category": "CSV-Test-Category",
        "tags": "csv-tag-a, csv-tag-b",
    }]}
    r = requests.post(f"{API}/tools/import", headers=H, json=payload4, timeout=30)
    rec("4.status", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    jb = r.json() if r.status_code == 200 else {}
    rec("4.created==1", jb.get("created") == 1, f"created={jb.get('created')}")
    rec("4.ids_len==1", isinstance(jb.get("ids"), list) and len(jb.get("ids", [])) == 1,
        f"ids={jb.get('ids')}")
    rec("4.errors_empty", jb.get("errors") == [], f"errors={jb.get('errors')}")
    imported_tool_id = (jb.get("ids") or [None])[0]

    r = requests.get(f"{API}/tools", headers=H, timeout=30)
    tools = r.json() if r.status_code == 200 else []
    imp_tool = next((t for t in tools if t.get("name") == "CSV-Imported Tool"), None)
    rec("4.tool_in_list", imp_tool is not None, "")
    if imp_tool:
        rec("4.tool.brand==Snap-on", imp_tool.get("brand") == "Snap-on",
            f"brand={imp_tool.get('brand')}")
        rec("4.tool.quantity==3", imp_tool.get("quantity") == 3,
            f"quantity={imp_tool.get('quantity')}")
        rec("4.tool.cost==49.99", abs((imp_tool.get("cost") or 0) - 49.99) < 1e-6,
            f"cost={imp_tool.get('cost')}")
        rec("4.tool.category_id_nonempty", bool(imp_tool.get("category_id")),
            f"category_id={imp_tool.get('category_id')}")
        rec("4.tool.category_name==CSV-Test-Category",
            imp_tool.get("category_name") == "CSV-Test-Category",
            f"category_name={imp_tool.get('category_name')}")

    r = requests.get(f"{API}/categories", headers=H, timeout=30)
    cats = r.json() if r.status_code == 200 else []
    test_cat = next((c for c in cats if c.get("name") == "CSV-Test-Category"), None)
    rec("4.category_created", test_cat is not None, f"found={bool(test_cat)}")
    test_cat_id = test_cat.get("id") if test_cat else None

    r = requests.get(f"{API}/tags", headers=H, timeout=30)
    tags_list = r.json() if r.status_code == 200 else []
    tag_a = next((t for t in tags_list if t.get("name") == "csv-tag-a"), None)
    tag_b = next((t for t in tags_list if t.get("name") == "csv-tag-b"), None)
    rec("4.tag_a_created", tag_a is not None, "")
    rec("4.tag_b_created", tag_b is not None, "")
    if tag_a and tag_b and imp_tool:
        tids = imp_tool.get("tag_ids") or []
        rec("4.tool_has_both_tag_ids",
            tag_a["id"] in tids and tag_b["id"] in tids,
            f"tag_ids={tids}; a={tag_a['id']}; b={tag_b['id']}")

    # Step 5: row missing name
    r = requests.post(f"{API}/tools/import", headers=H,
                      json={"rows": [{"brand": "Foo"}]}, timeout=30)
    rec("5.status", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    jb = r.json() if r.status_code == 200 else {}
    rec("5.created==0", jb.get("created") == 0, f"created={jb.get('created')}")
    errs = jb.get("errors") or []
    rec("5.errors_len==1", len(errs) == 1, f"errors={errs}")
    if errs:
        e0 = errs[0]
        rec("5.error.row==1", e0.get("row") == 1, f"row={e0.get('row')}")
        rec("5.error.name==''", e0.get("name") == "", f"name='{e0.get('name')}'")
        rec("5.error.msg==Name is required",
            e0.get("error") == "Name is required", f"error='{e0.get('error')}'")

    # Step 6: create_missing_categories=false + unknown category
    unknown_cat = "DefinitelyNotAnExistingCategoryXYZ"
    payload6 = {
        "create_missing_categories": False,
        "rows": [{"name": "NoCatCreate", "category": unknown_cat}]
    }
    r = requests.post(f"{API}/tools/import", headers=H, json=payload6, timeout=30)
    rec("6.status", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    jb = r.json() if r.status_code == 200 else {}
    rec("6.created==1", jb.get("created") == 1, f"created={jb.get('created')}")
    nocat_id = (jb.get("ids") or [None])[0]
    if nocat_id:
        r = requests.get(f"{API}/tools/{nocat_id}", headers=H, timeout=30)
        t6 = r.json() if r.status_code == 200 else {}
        rec("6.tool.category_id_empty", not t6.get("category_id"),
            f"category_id={t6.get('category_id')}")
        rec("6.tool.category_name_empty", not t6.get("category_name"),
            f"category_name={t6.get('category_name')}")

    r = requests.get(f"{API}/categories", headers=H, timeout=30)
    cats6 = r.json() if r.status_code == 200 else []
    unk = next((c for c in cats6 if c.get("name") == unknown_cat), None)
    rec("6.unknown_category_not_created", unk is None, f"found={bool(unk)}")

    # Step 7: non-existent dealer + location
    payload7 = {"rows": [{"name": "NoFKMatch", "dealer": "NoSuchDealerXYZ",
                          "location": "NoSuchLocationXYZ"}]}
    r = requests.post(f"{API}/tools/import", headers=H, json=payload7, timeout=30)
    rec("7.status", r.status_code == 200, f"status={r.status_code}")
    jb = r.json() if r.status_code == 200 else {}
    rec("7.created==1", jb.get("created") == 1, f"created={jb.get('created')}")
    rec("7.errors_empty", jb.get("errors") == [], f"errors={jb.get('errors')}")
    nofk_id = (jb.get("ids") or [None])[0]
    if nofk_id:
        r = requests.get(f"{API}/tools/{nofk_id}", headers=H, timeout=30)
        t7 = r.json() if r.status_code == 200 else {}
        rec("7.tool.dealer_id_empty", not t7.get("dealer_id"),
            f"dealer_id={t7.get('dealer_id')}")
        rec("7.tool.location_id_empty", not t7.get("location_id"),
            f"location_id={t7.get('location_id')}")

    # Step 8: existing dealer + location
    r = requests.post(f"{API}/dealers", headers=H,
                      json={"name": "Test-Dealer-Import"}, timeout=30)
    rec("8.create_dealer", r.status_code == 200,
        f"status={r.status_code} body={r.text[:200]}")
    dealer_obj = r.json() if r.status_code == 200 else {}
    dealer_id = dealer_obj.get("id")

    r = requests.post(f"{API}/locations", headers=H,
                      json={"name": "Test-Loc-Import"}, timeout=30)
    rec("8.create_location", r.status_code == 200,
        f"status={r.status_code} body={r.text[:200]}")
    location_obj = r.json() if r.status_code == 200 else {}
    location_id = location_obj.get("id")

    payload8 = {"rows": [{"name": "WithFKMatch", "dealer": "Test-Dealer-Import",
                          "location": "Test-Loc-Import"}]}
    r = requests.post(f"{API}/tools/import", headers=H, json=payload8, timeout=30)
    rec("8.import_status", r.status_code == 200, f"status={r.status_code}")
    jb = r.json() if r.status_code == 200 else {}
    rec("8.created==1", jb.get("created") == 1, f"created={jb.get('created')}")
    fk_id = (jb.get("ids") or [None])[0]
    if fk_id:
        r = requests.get(f"{API}/tools/{fk_id}", headers=H, timeout=30)
        t8 = r.json() if r.status_code == 200 else {}
        rec("8.tool.dealer_id_matches", t8.get("dealer_id") == dealer_id,
            f"dealer_id={t8.get('dealer_id')} vs expected {dealer_id}")
        rec("8.tool.location_id_matches", t8.get("location_id") == location_id,
            f"location_id={t8.get('location_id')} vs expected {location_id}")

    # Step 9: Cleanup
    r = requests.get(f"{API}/tools", headers=H, timeout=30)
    tools = r.json() if r.status_code == 200 else []
    tool_names_to_delete = {"CSV-Imported Tool", "NoCatCreate", "NoFKMatch", "WithFKMatch"}
    for t in tools:
        if t.get("name") in tool_names_to_delete:
            rr = requests.delete(f"{API}/tools/{t['id']}", headers=H, timeout=30)
            rec(f"9.del_tool.{t['name']}", rr.status_code == 200,
                f"status={rr.status_code}")

    if test_cat_id:
        rr = requests.delete(f"{API}/categories/{test_cat_id}", headers=H, timeout=30)
        rec("9.del_category.CSV-Test-Category", rr.status_code == 200,
            f"status={rr.status_code}")
    if tag_a and tag_a.get("id"):
        rr = requests.delete(f"{API}/tags/{tag_a['id']}", headers=H, timeout=30)
        rec("9.del_tag.csv-tag-a", rr.status_code == 200, f"status={rr.status_code}")
    if tag_b and tag_b.get("id"):
        rr = requests.delete(f"{API}/tags/{tag_b['id']}", headers=H, timeout=30)
        rec("9.del_tag.csv-tag-b", rr.status_code == 200, f"status={rr.status_code}")
    if dealer_id:
        rr = requests.delete(f"{API}/dealers/{dealer_id}", headers=H, timeout=30)
        rec("9.del_dealer.Test-Dealer-Import", rr.status_code == 200,
            f"status={rr.status_code}")
    if location_id:
        rr = requests.delete(f"{API}/locations/{location_id}", headers=H, timeout=30)
        rec("9.del_location.Test-Loc-Import", rr.status_code == 200,
            f"status={rr.status_code}")

    # Step 10: smoke
    for ep in ["/tools", "/categories", "/tags", "/dealers", "/locations"]:
        rr = requests.get(f"{API}{ep}", headers=H, timeout=30)
        rec(f"10.smoke GET {ep}", rr.status_code == 200, f"status={rr.status_code}")

    total = len(results)
    failed = [r for r in results if not r[1]]
    print("\n" + "=" * 60)
    print(f"TOTAL: {total}  PASSED: {total - len(failed)}  FAILED: {len(failed)}")
    if failed:
        print("\nFAILURES:")
        for n, _, d in failed:
            print(f"  - {n}: {d}")
    print("=" * 60)
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
