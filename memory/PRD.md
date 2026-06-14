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
- REPORTS (Phase 2 — ✅ DONE): toggle individual / bundle / both pricing;
  dual sums to avoid double counting — "Items + Bundles" (unbundled items +
  set prices, each set once) vs "Items Only" (all items at individual value);
  bundled items listed on own rows grouped under a per-set section header
  showing the set price. Applied to Inventory, Insurance, Year-End reports.

## Memory / Photo Scaling — Phase 1 DONE (2026-02 / build 303 — TESTED)
Root cause of the random Expo Go crashes: user photos stored as base64 *inside*
Mongo tool documents (up to 5MB each) and rendered with RN `<Image>`, which
decodes every photo into a full-res bitmap kept in memory → OOM (native crash =
Expo Go closes to home) during fast navigation on photo-heavy lists.

Phase 1 (client memory relief — shipped & regression-tested, 0 broken images
across 13 screens, no crashes on rapid-nav stress):
- New `src/components/AppImage.tsx`: wrapper over `expo-image` (downsamples to
  display size, bounded memory cache, disk cache, `recyclingKey`). Maps RN's
  `resizeMode` → expo-image `contentFit`. Swapped ALL ~35 user-photo `<Image>`
  renders across 20 files to `<AppImage>` (static metal-skin PNGs left on RN
  Image intentionally).
- New `src/lib/imageCompress.ts` (`compressToDataUri`, 1280px/JPEG 0.55) wired
  into previously-uncompressed upload paths: wishlist, tool/[id] repair photos,
  insurance-claims evidence (tool/edit, more, dealers, bundle/edit, dealer/[id]
  already compressed).

### Phase 2 + 3 — NEXT (NOT started): MongoDB GridFS migration
IMPORTANT FINDING: Emergent has NO first-party object storage in this env
(emergentintegrations exposes only llm + payments; no storage env vars). The
verified platform-recommended path is **MongoDB GridFS** (reuses MONGO_URL, no
external keys). Plan:
- Backend: GridFS bucket via `AsyncIOMotorGridFSBucket`; `/api/files` upload
  (+Pillow thumbnail ~256px), streaming GET with cache headers, DELETE w/ owner
  check. Change tool/bundle/claim/etc photo fields from base64 → file-id/URL +
  thumb ref. Update create/update/list/get + demo_seed. List endpoints return
  thumbnails only.
- Frontend: upload returns file id; render via `${BACKEND_URL}/api/files/{id}`
  with AppImage; lists use thumbnail URL.
- Migration: backfill existing base64 → GridFS (full + thumb), keep base64 until
  verified, then unset. Run as a script/endpoint.
- After memory work: god-file refactor (split server.py / more.tsx / index.tsx).

## Prefilled Demo System (2026-02 / build 301 — DONE & TESTED)
On registration, new accounts are auto-seeded with a rich demo dataset so users
can explore every feature immediately. All demo records tagged `is_demo: true`
(default dealers tagged `is_demo_enriched: true`) for clean removal.

### Backend (`/app/backend/demo_seed.py` + routes in server.py ~2693)
- `seed_demo_data_for_user()` hooked into `/api/auth/register` (idempotent).
  Seeds 15 tools (checked-out/lost/stolen/broken/for-sale/sold/consumable),
  1 bundle, 3 borrowers, 3 warranty claims (open+history), 1 full insurance
  claim + evidence, 3 wishlist items, personal profile, and enriches 4 default
  dealers with balances/routes/agents/payment schedules. Clipart PNGs via PIL.
- `GET /api/demo/status` -> {present, intro_seen}
- `POST /api/demo/intro-seen` -> marks one-time popup seen
- `POST /api/demo/clear` body {mode:"everything"|"keep_taxonomy"}:
  keep_taxonomy wipes demo records but keeps dealers/locations/tags/categories
  (resets enriched dealers); everything also wipes taxonomy -> blank app.
  Both set demo_present=false, intro_seen=true (popup never reappears).
- Tests: `/app/backend/tests/test_demo_prefill.py` (11/11 pass).

### Frontend
- `src/api.ts`: demoStatus, demoIntroSeen, demoClear.
- `src/components/DemoBanner.tsx`: one-time intro popup + persistent banner;
  rendered in BOTH dashboard branches (plain + skin) in `app/(tabs)/index.tsx`.
- `app/(tabs)/more.tsx` ACCOUNT card: "Delete Prefilled Information" row (shown
  only while demo present) -> custom themed choice Modal (Keep My Setup / Remove
  Everything / Cancel — web-parity, replaces 3-button Alert). Row + banner
  disappear permanently after deletion (status refetched on focus).

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
  Current: **BUILD 301**.
- Backend: 0.0.0.0:8001, all routes `/api` prefixed. Frontend uses
  EXPO_PUBLIC_BACKEND_URL. Mongo via MONGO_URL / DB_NAME.
- Preview/login URL: login-stretch-layout.preview.emergentagent.com
- `/api/auth/login` has a 5/min rate limit — space out automated logins.
- pdf-viewer back button must NOT use dismissAll().
