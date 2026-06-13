# Toolbox Vault — PRD

## Product
React Native/Expo (Expo Router) inventory app for tradespeople, with a FastAPI +
MongoDB backend. Dynamic theming (Iron Forge industrial skin, Crimson, Arctic,
Emerald, Plain Light/Dark) via `src/themeContext.tsx`. Core modules: Inventory,
Dealers, Contacts/Borrowers, Insurance Claims, Warranty, Reports, Wishlist,
For-Sale, Maintenance, Locations/Categories/Tags.

## Bundle / Set Feature (active)
Group inventory items into a "Set" (e.g. a mechanic's socket set). Each item keeps
its own model #, price, photo; the bundle has its own photo, part #, and set price.

### Requirements
- Items in a bundle keep individual model #, price, photo. ✅
- Bundle has bundle photo, part number, set price, notes. ✅
- Inventory lists show items individually but tag them as part of a bundle ("IN SET" badge). ✅
- Viewing an item's detail lets the user open the full bundle. ✅
- Deleting a bundle deletes all its items (popup warning, cascade). ✅
- ADD "+" button prompts: "Add Item" vs "Add Set/Bundle". ✅
- Add Bundle flow: input set data + choose existing items to add. ✅
- Assign item to a bundle from the item edit form (BUNDLE / SET accordion). ✅
- REPORTS (Phase 2 — NOT STARTED): toggle individual / bundle / both pricing;
  dual sums to avoid double counting — "Items & bundles sum" (unbundled items +
  bundle prices) vs "Items only sum" (all items at individual value, ignoring
  bundle prices); items listed on own rows grouped under their bundle.

## Implemented (2026-02 / build 294)
### Backend (Phase 1 — done & tested, 14/14 pytest in /app/backend/tests/test_bundles.py)
- Models: `Bundle`, `BundleCreate`, `BundleUpdate` (server.py ~880). `tools.bundle_id`.
- Endpoints (server.py ~2606): POST/GET `/api/bundles`, GET/PUT/DELETE
  `/api/bundles/{id}`, POST/DELETE `/api/bundles/{id}/items/{tool_id}`.
  DELETE bundle cascades: deletes child tools + their warranty_claims.
- `/api/tools` POST/PUT accept & persist `bundle_id`.

### Frontend (Phase 1 — done & tested)
- `src/api.ts`: listBundles, getBundle, createBundle, updateBundle, deleteBundle,
  addItemToBundle, removeItemFromBundle.
- `app/bundle/index.tsx` (list + FAB), `app/bundle/edit.tsx` (create/edit + attach
  items), `app/bundle/[id].tsx` (detail: price comparison, items, cascade delete).
- `src/components/AddChooser.tsx`: bottom sheet "Add Item" / "Add Set/Bundle".
- `app/tool/edit.tsx`: BUNDLE / SET accordion + bundle picker modal; saves bundle_id;
  accepts route params `bundle_id` / `bundle_name` to prefill.
- `app/(tabs)/inventory.tsx`: FAB opens AddChooser; "IN SET" badge on rows.
- `app/tool/[id].tsx`: "SET / BUNDLE" detail row → /bundle/[id].
- `app/(tabs)/more.tsx`: "Sets & Bundles" entry under ORGANIZATION.

## Roadmap / Backlog
- P0: Phase 2 — Bundle reporting engine (dual sums, no double-count). backend
  `/app/backend/reports.py` + frontend report config modals.
- P2: Google OAuth → Production (move consent screen out of Testing).
- P3: Server-driven "Upcoming Features" list.
- P3: Admin Broadcast Notices (in-app popups).

## Critical Dev Notes
- Frontend is Expo. On EVERY frontend change bump `const HOME_BUILD = "BUILD XXX"`
  in `app/(tabs)/index.tsx` (+1) and `sudo supervisorctl restart expo`.
  Current: **BUILD 294**.
- Backend: 0.0.0.0:8001, all routes `/api` prefixed. Frontend uses
  EXPO_PUBLIC_BACKEND_URL. Mongo via MONGO_URL / DB_NAME.
- Preview/login URL: login-stretch-layout.preview.emergentagent.com
- `/api/auth/login` has a 5/min rate limit — space out automated logins.
- pdf-viewer back button must NOT use dismissAll().
