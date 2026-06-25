# Toolbox Vault — PRD

## BACKLOG (on hold) — Dealer Catalog Lookup System (proposed 2026-06, HELD by user)
Large multi-phase feature. Admin panel to store direct URLs to dealer tool-catalog
PDFs (Matco, Mac Tools, Cornwell, Snap-on; later retail: Amazon/Home Depot/Harbor
Freight). System auto-downloads each catalog every 30 days, AI (vision LLM) parses
PDFs → model #, description, price, and bundle/kit membership (individual + set
pricing), stored in a catalog DB. New "add item" flow: pick dealer → enter model #
→ search parsed catalog → auto-fill matched info; if bundle, auto-add all bundled
items; if no match, prompt manual entry. Imported items stored like existing items
so data persists even if a future catalog drops a tool.
COST NOTES: AI cost only during 30-day refresh (NOT per user lookup — lookups are free
DB queries). Est. ~$0.005–0.01/page vision parsing → ~$15–65/month for 4 PDF dealers.
Phase 2 retail sites need product-data APIs (Rainforest ~$5.90/1k Amazon lookups;
Home Depot APIs $25–150/mo) — usage-based, separate. Build est. ~400–600 Emergent
credits (phased). RISKS: PDF extraction accuracy (esp. bundle detection), legal/IP of
redisplaying copyrighted catalog data, catalog must be a direct file URL.
RECOMMENDED NEXT STEP when resumed: cheap one-PDF Proof-of-Concept (parse one real
Matco/Snap-on catalog) to measure real accuracy + token cost before full build.


## Upcoming Features / Roadmap + Vault Facebook link (2026-06 — DONE & tested)
Admin-managed GLOBAL roadmap shown to all users. Backend `routes_upcoming.py`
(non-owner-scoped `real_db.upcoming_releases`): public `GET /api/upcoming-features`
(any signed-in user; sorted soonest `release_date` first) + admin-gated
`POST/PUT/DELETE /api/admin/upcoming-features` (ADMIN_EMAILS via `_require_admin`).
Each release = one `release_date` (ISO YYYY-MM-DD) + optional `title` + `features`
list, each feature `{id,title,status}` where status ∈ On The List / Work Started /
Completed (invalid → "On The List"; empty titles dropped). Admin may publish
multiple dated releases. Frontend: api.ts methods + `UpcomingRelease` type; user
screen `app/upcoming-features/index.tsx` (color-coded status pills, prompt "Want
your idea to be put on this list? Send us a Message" above ReportBugBadge → /feedback);
admin screen `app/admin/upcoming-features.tsx` (create/edit/delete modal, DateField,
tap-to-cycle status pills; redirects non-admins to /more). Vault (`more.tsx`) gets a
new top "ROADMAP" SectionCard ("Upcoming Features" row + admin-only "Manage Roadmap"
row) and a "Follow us on Facebook" link (→ facebook.com/toolboxvault) at the bottom.
Verified: backend 10/10 pytest (`tests/test_upcoming_features.py`), frontend admin +
non-admin flows. NOTE: app version label now reads from app.json (no HOME_BUILD const).


> 🚨 **HARD RULE — APP ICON:** ALL app icons/launcher/splash/favicon MUST be the
> bright-orange octagon master at `frontend/assets/branding/app_icon_master.png`.
> The ONLY exception is the transparent login logo (`tbv_master_logo_*`). See
> `/app/memory/APP_ICON_RULE.md` before touching ANY image asset.


## First-run onboarding tour (2026-02 — DONE & tested)
Interactive guided "spotlight" tour (watch mode) that teaches new users the core
features, then returns them to the dashboard. Implemented in `src/onboarding/`
(`OnboardingTour.tsx` provider/hook, `OnboardingTourOverlay.tsx` dimmed coaching
card, `tourSteps.ts` 7-step config). Wired into `_layout.tsx` (provider + overlay),
`DemoBanner.tsx` (the demo-intro "GOT IT — SHOW ME AROUND" button auto-launches it
for new accounts), and `more.tsx` (a "GETTING STARTED → Replay App Tour" row to
re-run anytime). 7 steps: add item & bundle → mark item broken → set dealer agent →
add personal data → insurance inventory report → turn on notifications → change
theme. Steps 2 & 3 deep-link into a real demo tool/dealer (fetched async on start,
list-screen fallback). NEXT/BACK/SKIP/FINISH + progress dots; dim layer blocks
taps so it's pure "watch" mode. Testing agent verified Entry Point A fully
(all 7 steps, deep-links, navigation, controls) — no bugs. Build marker BUILD 313.

## Test-suite triage & green-up (2026-02 — DONE & verified)
Picked up the backend refactor handoff: verified the P0 import fix (extracted
`routes_stats.py` / `routes_tool_actions.py`) — `/api/stats`, `/api/tools`,
checkout all 200. Then triaged the full pytest suite (was **33 failed + 68
errors** → now **227 passed, 2 graceful skips, 0 failed/errored**, ~100s):
- **Root cause #1 (cascading errors):** 14 test modules each logged in
  independently → blew past the `/api/auth/login` 5/min/IP cap. Added a
  suite-wide login cache in `tests/conftest.py` (monkeypatches
  `Session.request`; caches the FULL real login body keyed by **email+password
  hash**, validated via `/auth/me`, disk-persisted). Wrong-password logins miss
  the cache → real 401 preserved. Deliberately NO 429 retry (would mask the
  limiter from the rate-limit probe test).
- **Root cause #2 (stale tests):** `test_tooltracker.py` / `test_iteration2.py`
  pre-dated auth + the freemium 15-tool limit + the app rebrand. Fixed: their
  `s` fixture now authenticates as the **Pro** account `mechanicltz@gmail.com`
  (no tool-limit), and the health assert is `"Toolbox Vault API"`.
- **Removed obsolete coverage:** deleted `test_payment_accounts.py` (tested the
  removed `/payment-accounts` API — replaced by dealer-scoped
  `/dealers/{id}/accounts/.../{confirm,skip}-payment`, already covered by
  `test_dealer_schedules.py` + `test_skip_payment.py`); removed `TestToolboxLayouts`
  + `TestToolboxAnalyze` from `test_iteration2.py` (`/toolbox-layouts` &
  `/toolbox/analyze` no longer exist).
- **Register-bound tests** (`test_demo_prefill`, `test_full_snapshot_plain`) now
  `pytest.skip` gracefully on the register 3/hr/IP limit (shared backend) — they
  run fully on CI's fresh single-IP backend.
- CI is unaffected: it only runs the 4 guard suites (taxonomy/dealers/extra/tools)
  against a fresh localhost backend — all green.

## God-file refactor (2026-02 — backend DONE & tested; frontend DEFERRED)
Goal: split god-files for maintainability with ZERO behavior change.
DONE — server.py 5,319 → **2,316 lines (−56%)**; **53/53 tests pass**
(`test_refactor_regression` + `test_routes_taxonomy/dealers/extra/tools`):
- **B1** `models.py` — all Pydantic models + `now_iso` + constants.
- **B2** `core.py` — env/Mongo client, owner-scoped DB proxy (`db`), context
  vars, `get_current_user`, `to_public`, in-process rate limiter.
- **B3** route groups via `register_*_routes(api_router)` (deps from
  core/models/helpers/routes_taxonomy, no cycles):
  - `helpers.py` (shared `build_tool_query`, `_validate_photo_payload` + photo
    size constants).
  - `routes_taxonomy.py` (locations/tags/brands/categories/borrowers + shared
    `_ensure_brand_saved`), `routes_dealers.py`, `routes_maintenance.py`,
    `routes_bundles.py`, `routes_warranty.py`, `routes_wishlist.py`,
    **`routes_tools.py`** (largest — CRUD + CSV import/export + list/filter).
  - ⚠️ GOTCHA fixed: `routes_tools.py` must NOT use `from __future__ import
    annotations` — its inline Pydantic body models (ImportPayload/ExportPayload)
    are function-local, and lazy string annotations make FastAPI misread them
    as query params (422). Keep eager annotations there.
- **CI:** `.github/workflows/backend-tests.yml` spins up its own Mongo+backend and
  runs all guard suites (taxonomy/dealers/extra/tools) on every push.
STILL in server.py (P2 — large/shared, leave for later): stats/aggregate,
sale/sold, per-tool documents, theft/loss, bulk ops, insurance-claims wiring,
personal-profile, account-delete, auth/admin, demo-seed, startup/indexes.
DEFERRED (P2): frontend deep component extraction. PROGRESS: `more.tsx`
1,764 → 1,219 lines — its 4 style blocks moved to `src/screens/more/moreStyles.ts`
(F1a, behaviour-identical; More screen verified rendering on web). `index.tsx`
styles already live in `src/screens/home/homeStyles.ts`. **`tool/[id].tsx`
5,423 → 3,738 lines (−31%)** — its 4 `themedStyles` blocks (qsStyles/styles/
newStyles/pickerStyles) moved verbatim to `src/screens/tool/toolDetailStyles.ts`
(F2, behaviour-identical; lint clean, tool route bundles without error on web —
visual unchanged since styles moved verbatim, on-device spot-check still advised). Remaining (riskier):
extracting the More screen's presentational components (`Row`/`SectionRow`/
`SectionCard`) — possible now that `styles` is an importable module — and any
`index.tsx` sub-sections. Needs on-device verification (web preview renders
skinned screens black; text-only checks pass).

## God-file refactor — earlier checkpoint notes

## Report redesign + Tablet UI (2026-02 / build 308 — DONE)
Backend `reports.py` redesigned to ONE cohesive professional identity across
ALL report types (Inventory, Insurance, Claims, Sales, Dealer Account):
- Unified palette constants (`ACCENT_HEX` steel-blue #2F5D8A, `HEADER_HEX`
  slate #334155, slate inks, hairlines, steel tint). Per-report `spec.accent`
  is now intentionally IGNORED for styling so every PDF matches. Removed all
  harsh black (#111) header bars and orange/cream (#F97316 / #fff8e6) accents.
- Table header + section/group/dealer header bars → slate w/ white text;
  stat highlight cards + totals row + sub-headers → light steel tint; rules →
  steel-blue. (Dealer-account report keeps semantic GREEN payments / RED
  charges — intentional, standard for financial reports.)
- Owner letterhead on EVERY report: render endpoint injects personal_profile
  ("PREPARED FOR" block w/ name/address/contact) when available; insurance
  still manages its own opt-out. Verified: 5 report types render valid PDFs;
  visual analysis confirms steel-blue/slate + letterhead, no black/orange.
- CSV remains pure data (no letterhead) by design.
Tablet/iPad UI (lint-clean; native-only, verify on device — web preview renders
skinned screens black, a known artifact):
- Dashboard quick buttons (ADD ITEM / NEW CLAIM) capped at 480px & centered.
- Skinned inventory 2-col cards get a bordered plate (`rowSkinGridCard`).
- Skinned dealer 2-col cards stretch to uniform row height (`rowSkinGridWrap`
  + frame flex:1).
- Tool detail page content capped at 760px & centered (stops full-width button
  stretch). All gated so phones (< cap) are unchanged.



## Bundle / Set REBUILD (2026-06 — Stage 1 of 6 DONE & backend-tested)
User-driven full rework of bundles. NEW MODEL: a bundle is now a Tool with
`is_bundle=True` carrying ALL normal item fields PLUS `inside_items` (embedded
lightweight sub-items: id/name/model/cost/photo — NEVER listed in inventory)
and linked `expansion_of` items (normal inventory tools bought later as add-ons,
which DO stay in the inventory list). Models: `InsideItem(+Create/Update)` in
models.py; Tool/ToolCreate/ToolUpdate gained `is_bundle`, `inside_items`,
`expansion_of`; WarrantyClaim gained `inside_item_id/name/model` + `bundle_model`
(for Stage 2). `build_tool_query` now searches `inside_items.name/model` (so
searching a sub-item surfaces the parent bundle) + `is_bundle`/`expansion_of`
filters. New endpoints in routes_bundles.py: POST/PUT/DELETE
`/api/tools/{bid}/inside-items[/{id}]`, GET `/api/tools/{bid}/expansion-items`,
POST/DELETE `/api/tools/{bid}/expansion/{tool_id}`, and NON-DESTRUCTIVE
`POST /api/bundles/migrate-to-tools` (old `bundles` collection → bundle-tools
reusing id; old child tools re-linked as expansion items, no data loss;
idempotent). list_tools slims inside-item photos to thumbs. Inventory rows now
show "SET / BUNDLE" badge (is_bundle) and "SET ADD-ON" badge (expansion_of).
Backend test: /app/backend/test_stage1_bundles.py — ALL PASS.
## Bundle Stage 2 DONE & backend-tested (2026-06)
Claims/mark-broken on a bundle: "Mark broken" on a bundle with inside items now
opens a "WHAT BROKE?" chooser (whole set vs each inside item) — `startRepairFlow`
+ `showBrokenTarget` modal in app/tool/[id].tsx. Picking an inside item stuffs
inside_item_id/name/model into repairForm -> repair_info; backend update_tool
copies these + bundle_model (bundle's first model #) into the warranty_claims
mirror. RepairInfo gained inside_item_id/name/model. Dealer email/SMS
(notifyDealer) is now bundle-aware: inside-item claims send a professional msg
naming BOTH the set's model/part # AND the broken sub-item's name+model. Claim
shown on bundle detail card ("Broken item" row), in Claims tab + dealer
warranty-claims list (shows "<item> (model)" + "in <set>"). FIXED latent bug:
WarrantyClaim was not imported in routes_tools.py. Backend test:
/app/backend/test_stage2_claims.py — ALL PASS. NOTE: full UI exercise of the
chooser needs Stage 3/4 (no in-app way to create a bundle + inside items yet;
only via API).
## Bundle Stage 3 DONE & tested (2026-06) — iteration_47
Bundle detail = the item-detail page (bundle is a tool). New component
`/app/frontend/src/screens/tool/BundleTab.tsx` renders the "Set" tab (testID
tab-bundle): manage inside items (add-inside-item-btn / inside-name/model/cost /
optional photo / inside-save / inside-edit-<id> / inside-del-<id>) and expansion
items (add-expansion-btn -> expansion-search picker picker-item-<id> -> link ->
expansion-unlink-<id>) + totals (Set price + Expansion + COMBINED TOTAL). For an
expansion add-on the tab shows "Add-on" with the parent set. Tab only shows when
is_bundle || expansion_of. CREATION (folds into Stage 4): AddChooser
"add-choose-bundle" and the Sets&Bundles list FAB (add-bundle-fab) now create a
bundle-tool ("New Set") via POST /tools and open /tool/{id}?startEdit=1 (new
startEdit param auto-enters edit mode via beginEdit). app/bundle/index.tsx now
lists is_bundle tools (auto-runs migrate-to-tools), rows route to /tool/{id}.
api.ts gained: migrateBundlesToTools, addInsideItem, updateInsideItem,
deleteInsideItem, listExpansionItems, linkExpansionItem, unlinkExpansionItem.
Tested: /app/backend/tests/test_bundles_v3.py 8/8 PASS + full frontend flow PASS.
KNOWN PRE-EXISTING (not bundle-related): dashboard intro-video overlay swallows
the first tap after a fresh route load (iter_46). STILL PENDING for bundles:
Stage 4 (make Add ITEM also live-edit + retire old add/edit + old bundle screens
+ old bundles collection), Stage 5 (inventory "bundles only" filter), Stage 6
(reports/export simplified; bundle export WITH/WITHOUT expansions — deferred from
Stage 3), LATER HOWTO.
## Bundle Stage 4 + intro-tap fix DONE & tested (2026-06) — iteration_48
ADD = LIVE-EDIT: "Add Item" (AddChooser add-choose-item) and "Add Set/Bundle"
(add-choose-bundle + Sets list add-bundle-fab) now POST /tools to create a blank
record ("New Item"/"New Set", is_bundle for sets) then navigate
/tool/{id}?startEdit=1&startFresh=1. tool/[id] reads startEdit (auto beginEdit
via editAutoOpened ref) + startFresh (freshUnsavedRef). NEW editable NAME field
(testID edit-name) added to Details edit form; 'name' now included in saveEdit
payload (was previously MISSING — names couldn't be edited at all before). On
Cancel of a fresh unsaved record -> api.deleteTool + router.back (no orphan
"New Item"/"New Set" rows). Old /tool/edit form retired (still registered but
unreferenced); wishlist convert + WarrantySection edit buttons now route to
/tool/{id}?startEdit=1. INTRO TAP FIX: src/IntroOverlay.tsx now sets local `gone`
state + player.pause() on finish/skip so the expo-video <video> can't linger and
swallow the first tap after a fresh route load. NOTE: testing_agent fixed a
missing `useRef` in tool/[id].tsx React import (would red-screen Add flow) — now
imported. Tested iteration_48: intro first-tap OK, Add Item/Set + discard-on-
cancel + name persistence all PASS. Minor unverified (code path proven): add-
bundle-fab real-tap nav + menu-edit/wishlist/warranty routing.
REMAINING: Stage 5 (inventory "bundles only" filter), Stage 6 (reports/export
simplified + bundle export WITH/WITHOUT expansions), LATER HOWTO. Optional
cleanup: delete unused app/tool/edit.tsx + app/bundle/edit.tsx + app/bundle/[id].tsx
+ old /api/bundles CRUD + bundles collection.
## UI fix batch 2 (2026-06) — keyboard, tab-retap, receipts, doc preview, edit-btn
- Edit-bar SAVE/CANCEL buttons: fixed height:48 was overriding padding → now
  inline height:38 + editBar paddingTop 8/paddingBottom 12 (tool/[id].tsx +
  toolDetailStyles.ts). VERIFIED iter (button height).
- KEYBOARD covering edited field: wrapped root in <KeyboardProvider> (_layout.tsx)
  and swapped the item edit/add ScrollView -> KeyboardAwareScrollView with
  bottomOffset (editing?120:0) in tool/[id].tsx (react-native-keyboard-controller,
  already in package.json). NOTE: real overlap behavior only fully testable on a
  native build, not web.
- TAB re-tap reload: BottomBar.tsx onPress now no-ops when already on that tab
  (if (!active) router.push).
- RECEIPT shows BLACK: ReceiptsSection.tsx used plain <Image> which can't load
  authenticated /api/files GridFS URLs -> switched thumb + lightbox to <AppImage>
  (removed unused Image import).
- DOCUMENT preview-first (native): DocumentsSection.tsx openDoc no longer fires
  Sharing.shareAsync immediately on native; it shows the in-app preview modal
  (images render inline via data URI; pdf/other show a card + explicit
  OPEN/SHARE button calling new shareNative()). showModal now true whenever a doc
  is selected. Web preview unchanged. NOTE: native preview only testable on build.
STILL TODO (next rounds): Warranty edit full setup (duration picker + start date
default today); Add contact/dealer top-X cancel + off-screen save/cancel; global
BACK button on every page; Dealer seed data 1-contact-per-field cleanup; Stage 6
(reports/export simplified + bundle export WITH/WITHOUT expansions).
## VERIFIED iter_51/iter_52: receipt-black, tab-retap, web doc preview,
## KeyboardProvider stability ALL PASS. Warranty full setup VERIFIED (iter_52):
## WARRANTY LENGTH (number + MONTHS/YEARS toggle warranty-unit-*) + START DATE
## (defaults to today on enable) added to renderWarranty() in tool/[id].tsx;
## setWarrantyField()/computeWarrantyExpiry() auto-derive expiry; save persists.
## NOTE: warranty edit lives on the WARRANTY tab, not Details.
## REMAINING from user's big list: (a) Add contact/dealer needs top-X cancel +
## save/cancel currently run off-screen at bottom; (b) global BACK button on every
## page (back-stack to dashboard); (c) Dealer SEED data has multiple phones/emails
## per single line -> must be 1 tappable contact per field; (d) Stage 6 reports/
## export simplified + bundle export WITH/WITHOUT expansion items.

## Bundle Stage 5 + UI fix batch DONE & tested (2026-06) — iteration_49
DONE this round (7 items): (1) Stage 5 inventory filter "SETS / BUNDLES"
(inventory.tsx: Filter type, VALID_FILTERS, counts, STATUS_OPTIONS, client filter
x.is_bundle). (2) BundleTab `editing` prop — add/edit/delete/unlink on Set tab
only in edit mode. (3) Add-on tab reads "This item is an addon to a set:" + link
(expansion-parent-link) to parent bundle. (4) Details reordered PURCHASED→DEALER→
BRAND on top (dupes removed). (5) History popup REMOVED; CHECKOUTS/CLAIMS now
plain-text toggle, active=accent (histSeg* styles). (6) Edit save/cancel buttons
shrunk. (7) Dashboard footer "VAULT → CUSTOMIZE" → "VAULT → SETTINGS". iter_49:
footer LIVE-confirmed; rest code-review-confirmed (live blocked by login 5/min
rate-limit, env artifact).
STILL TODO (next rounds, from user's list): Warranty edit full setup (duration
picker + start date default today); keyboard covers edited field in live-edit/add
(KeyboardAvoidingView); Add contact/dealer top-X cancel + save/cancel off-screen;
global BACK button every page; receipt photo shows BLACK; tapping uploaded DOC
should PREVIEW first (like report) before share/print; re-tapping CURRENT bottom
tab reloads page (make no-op); Dealer seed data has multiple phones/emails per
line (must be 1 tappable contact per field). PLUS Stage 6 (reports/export
simplified + bundle export WITH/WITHOUT expansions). Minor: PDF builder pushes
CATEGORY twice (~tool/[id].tsx:1317, cosmetic).

REMAINING STAGES: 2=claims/mark-broken (whole bundle vs one inside item; dealer
msg must read "came in the set <bundleModel>, but the <sub> I broke is <itemModel>");
3=bundle detail screen (manage inside items + expansion area w/ bundle+expansion
sum + export with/without expansions); 4=Add=live-edit (Add Item/Bundle open the
tabbed details layout blank, retire old add/edit + old bundle screens + old
bundles collection); 5=inventory filter "bundles only"; 6=reports simplified
(bundle at bundle price; detailed lists inside items w/o per-item pricing);
LATER=HOWTO writeup. NOTE: migration already run on admin demo data, so the OLD
"Sets & Bundles" screen may show 0 items until Stage 3/4 swaps those screens.


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

## Cold-start dashboard font bug (2026-02 / build 307 — FIXED)
Symptom (iOS cold start only): the Home dashboard first-painted with an oversized
fallback system font (truncated dealer names, huge labels); navigating away and
back fixed it. Root cause: fonts (BebasNeue/Rajdhani/Exo2) were loaded PER-SCREEN
with no root gate, so the dashboard (the first screen) could mount before glyphs
were registered, and only self-corrected on remount.
Fix: load the full font stack ONCE at the root (`useTbvFonts()` in ShellNav,
`app/_layout.tsx`) and hold the screen Stack until it's ready — every screen's
first paint now has fonts available. The boot intro overlay covers the brief
gate on cold start. Verified the gate doesn't hang (login renders with correct
fonts). Native-only bug (web preview doesn't exhibit it).

## UI fixes round 2 (2026-02 / build 306 — DONE)
1. Insurance claims LIST: replaced custom header with shared `IndustrialBanner`
   (back arrow) + moved the add action to a floating `AddFab` (bottom-right),
   matching inventory. `app/insurance-claims/index.tsx`.
2. Dealer "tools purchased" screen was unskinned: added industrial skin
   (summary in SKIN.window frame, rows on SKIN.plate via a RowShell), mirroring
   the dealer detail screen. `app/dealer/[id]/tools.tsx`.
3. Contacts list now ALWAYS alphabetical by name (first letter of first name) —
   `localeCompare` sort on load. `app/(tabs)/borrowers.tsx`.
4. Contact detail "currently checked out" + "checked out tool totals" overflow
   on skinned theme: increased RowShell plate padding (padX 18→22, padTop/Bottom
   12→16) so taller content stays inside the plate. `app/borrower/[id].tsx`.
Verification notes: #1/#2 mirror proven components/patterns + compile clean
(screenshot tool renders nested routes black on web preview — a known artifact,
fine on device). #3 is logic. #4 is narrow-screen only (screenshot tool locked
to 1920px desktop) — confirm on device.

## UI fixes (2026-02 / build 305 — DONE & verified)
1. Login header version: moved from bottom-right to CENTERED over the nameplate
   (matches in-app IndustrialBanner placement). `app/login.tsx`.
2. Backup download "cannot read property 'base64' of undefined": SDK 54 moved
   `writeAsStringAsync/cacheDirectory/EncodingType` to `expo-file-system/legacy`
   — switched the native download import. `app/admin/backups.tsx`.
3. Skinned inventory list overflowing the frame: increased `TbvListPanel`
   padTop 12→22, padBottom 2→14 so rows sit inside the frame. `app/(tabs)/inventory.tsx`.
4. Insurance claim "Email Detailed Report to Insurer" → renamed "Email Report"
   and restyled to the dashboard metal-plate ADD-button look on skinned themes
   via new `src/components/SkinButton.tsx`. `app/insurance-claims/[id].tsx`.

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

### Phase 2 + 3 — DONE & TESTED (2026-02 / build 304): MongoDB GridFS migration
IMPORTANT FINDING: Emergent has NO first-party object storage in this env
(emergentintegrations exposes only llm + payments). Used **MongoDB GridFS**
(reuses MONGO_URL, no external keys) — the verified platform-recommended path.

Implemented & verified (backend pytest 19/20 in test_media_gridfs.py; frontend
18 live /api/files requests all 200, 16 thumbs + 2 full, 0 broken images):
- `backend/media.py`: GridFS `media` bucket; `offload_value/offload_list`
  (data: URI -> `/api/files/{id}`, Pillow 256px JPEG thumbnail linked via
  metadata.thumb_id), `thumb_url`, `delete_value(s)`. Router `/api/files/{id}`
  + `/api/files/{id}/thumb` (StreamingResponse, immutable cache headers).
  init_media(real_db) + router included at server.py ~4700. Auth middleware
  whitelists `/api/files/` (public by design; unguessable ObjectIds).
- Wired offload into: create_tool/update_tool/delete_tool (photos+receipts+
  documents, with GridFS cleanup on delete), list_tools (cover->thumb), create/
  update bundle + list_bundles (cover->thumb) + get_bundle items (thumb),
  create/update_wishlist. Tool detail/get returns FULL urls.
- Frontend `AppImage` resolves relative `/api/files` URLs to
  EXPO_PUBLIC_BACKEND_URL (works on native, not just web).
- `backend/migrate_media.py` (idempotent): backfilled existing base64 -> GridFS.
  Result: 177 blobs offloaded, 0 base64 remaining across tools/bundles/wishlist/
  warranty; 356 GridFS files.
- v1 tradeoffs (intentional, not bugs): replacing a photo on edit may orphan the
  old GridFS file; dealer logos / home logo / demo-seed tiles / insurance
  historical snapshot photos remain base64 (small/frozen); /api/files GET public.

### NEXT: God-file refactor (maintainability only, NOT started)
Split server.py (~5.3k lines) / more.tsx (~1.7k) / index.tsx (~1k) into modules
(routes/, models/, services/). Pure cleanup — no behavior change. High regression
risk, so do as its own carefully-tested pass.

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
- P3: iOS themed app icon (alternate app icons) — let users switch the home-screen
  icon to match their chosen theme (Iron Forge / Crimson / Arctic / Emerald).
  iOS-ONLY (uses setAlternateIconName; shows Apple's system confirmation popup).
  Icons must be predefined/bundled at build time. Android intentionally excluded
  (no clean runtime icon-swap API; activity-alias hack is fragile/flickery).
- P2: SDK upgrade — Expo/React Native bump to clear Play Console "deprecated
  edge-to-edge APIs (Android 15)" warning. Comes from RN's StatusBarModule
  (setStatusBarColor/setNavigationBarColor); framework-level, non-blocking.
- P3: Large-screen support — app is locked PORTRAIT (android:screenOrientation).
  Android 16 ignores the lock on tablets/foldables (Play Console warning).
  Decide whether to build a proper landscape/resizable tablet layout (deferred
  intentionally; earlier tablet-stretch issues drove the portrait lock).

## Critical Dev Notes
- Frontend is Expo. On EVERY frontend change bump `const HOME_BUILD = "BUILD XXX"`
  in `app/(tabs)/index.tsx` (+1) and `sudo supervisorctl restart expo`.
  Current: **BUILD 319**.
- Backend: 0.0.0.0:8001, all routes `/api` prefixed. Frontend uses
  EXPO_PUBLIC_BACKEND_URL. Mongo via MONGO_URL / DB_NAME.
- Preview/login URL: login-stretch-layout.preview.emergentagent.com
- `/api/auth/login` has a 5/min rate limit — space out automated logins.
- pdf-viewer back button must NOT use dismissAll().

## Status bar fix (2026-06) — ROOT CAUSE FOUND & FIXED
The "device info (clock/battery) invisible on Steel theme" bug was actually the
app RED-SCREENING on every load. Cause: the prior imperative fix used
`React.useEffect` in ThemedStatusBar (app/_layout.tsx) but `React` was never
imported as a default there (only named hooks were) -> "React is not defined"
uncaught error on boot. Fix: use the already-imported `useEffect`. Also added a
native launch default `androidStatusBar` (light-content / translucent /
transparent bg) to app.json so Android shows light glyphs from frame 0. Runtime
logic (skin==="industrial" -> barStyle "light") was already correct. Web preview
can't show the native status bar — user must confirm white clock/battery on their
own phone. Verified: app boots with NO red screen after fix.

## User decisions (2026-06) — CLOSED, do not revisit
- "Stuck Agents tab" on dealer pages: user confirms it is NOT broken on their
  device. The iter_57 web-preview failure was a test-harness artifact only.
  CLOSED — do not chase.
- Dealer detail "edit-in-place / live edit" conversion: user is intentionally
  KEEPING the dealer editing the way it is now. CLOSED — do not implement.

## All company-wide reports now use the NEW set model (2026-06 — DONE & tested)
Reworked backend reports.py so Inventory, Insurance and Year-End reports use the
v3.2 set model (a bundle IS a tool with is_bundle + embedded inside_items; set
price = the tool's own cost; expansion add-ons are separate tools). Removed the
old `db.bundles`/`bundle_id` dual-sum engine (`_load_bundles_map`, `_bundle_sums`,
`_bundle_value_stats`, `_group_rows_by_bundle`, `SET_PRICING_OPTION`). New:
`_normalise_tool_row` now carries is_bundle/inside_items/expansion_of; helper
`_append_set_items(rows, list_items)` renders each set as ONE row priced at its
set price and, when the new toggle `list_set_items` (SET_DETAILS_OPTION, default
ON) is set, lists the inside items by name+model beneath the set name with NO
individual prices. Totals are a plain sum of row costs (set counted once at set
price; inside items have no inventory presence so never double-count; expansion
items are real separate rows). Verified: unit test + live PDFs (inventory/
insurance/year_end all HTTP 200) + end-to-end with a real owner-scoped bundle
(set row shows "(SET)" + 2 inside items w/o prices, total correct, no leaked
rows). Frontend wizard auto-renders the new toggle (toggle type already supported).
This matches the per-set export already built into tool/[id].tsx (Stage 6).

## Add-item Name placeholder fix (2026-06 — DONE & tested)
The Add flow created a tool named "New Item" / "New Set" and the edit form showed
that literal text in the Name field (looked like a hint but was a real value that
didn't clear on tap). Fix in app/tool/[id].tsx: `beginEdit` now starts a fresh
record's name EMPTY (`freshUnsavedRef.current ? "" : t.name`) so the greyed
placeholder shows instead; `saveEdit` falls back to "New Item"/"New Set" only if
the user saves it blank (never wipes an existing item's name). Verified live (Pro
acct): new item's edit-name value = "" with placeholder "e.g. 1/2\" Impact Wrench".
Note: only "New Item"/"New Set" were literal stand-ins — all other Add flows
already use empty fields + placeholders; quantity default "1" is a real default
(kept, per user's "unless it was a set default value").

## More room when adding/editing an item (2026-06 — DONE & tested)
User: the fill-out area above the keyboard was too small. Fix in app/tool/[id].tsx:
(1) while `editing`, the top hero panel (photo + STATUS/QUANTITY/PRICE pills) is
HIDDEN so the form gets the full height under the tab strip; (2) the edit
KeyboardAwareScrollView paddingBottom raised 90->340 and bottomOffset 120->140 so
the focused field scrolls higher (toward centre) and even the last fields can be
pulled up above the keyboard. Both theme branches updated (replace_all). Verified
live (Pro acct): in edit mode "ADD PHOTO"/status pills are gone, form starts at
ITEM NAME directly under the tabs; lint clean.

## Mark-broken sheet covered by keyboard (2026-06 — DONE & tested)
The "Mark as broken / Edit repair info" modal (app/tool/[id].tsx, showRepair) is a
bottom-anchored sheet (modalBg justifyContent flex-end) with text inputs (Contact,
Cost, Notes) and had NO keyboard avoidance, so the keyboard covered it. Fix: wrap
its modalBg in <KeyboardAvoidingView behavior={ios?"padding":undefined}> (Platform
& KeyboardAvoidingView already imported), mirroring the working PaymentModal
pattern, so the sheet lifts above the keyboard; inner ScrollView still lets you
reach every field. Verified live: sheet opens via menu -> Mark broken and renders
all fields + CANCEL/MARK BROKEN; lint clean. Keyboard-lift itself is native-only
(web shows no keyboard) — confirm feel on device.

## Claim history detail page redesigned to Showroom layout (2026-06 — DONE & tested)
app/claim/[id].tsx was using old SkinPlate cards (not steel-skinned, not showroom).
Rebuilt to the showroom blueprint: IndustrialBanner + fixed HERO (broken-part
photo left + top-right PillRows OPEN DATE / CLOSED DATE / STATUS[colored]) + ONE
fixed skinned panel (module-scope ClaimPanel → TbvListPanel for steel / bordered
View fallback) whose inner ScrollView holds clean label/value DetailRows: TOOL
(→/tool, accent+chevron), DEALER (→/dealer), REPAIR COMPANY, CONTACT (phone links),
NOTIFIED, EXPECTED BACK, OPENED, REPAIR/REPLACEMENT COST, NOTES. Steel hooks
(useSkin/useIsSteel/useSteelPanelFrame) placed BEFORE the loading early-return
(rules of hooks). Photo tap opens existing lightbox. Verified live on a real
COMPLETED claim (Pro acct): all sections render, steel skin applied; lint clean.

## PDF viewer screen made professional (2026-06 — DONE)
app/pdf-viewer.tsx chrome was unpolished: chunky grey picture-frame bezel
(#878d96 border + #2b2e33 padding, letter aspect), busy repeating metal-texture
backdrop, raw download filename as the title, and a green ContactIcon share glyph.
Redesigned to a modern document-viewer look: white "page" filling the area on a
soft charcoal backdrop (#1F2227 / light #ECEEF2) with a subtle drop shadow
(pdfShadow) and hairline border, rounded 14. Title now prettified via `prettyTitle`
useMemo (strips .pdf/.csv ext + trailing timestamp + underscores -> "New test
item"); used in header, share dialog, iframe, loader. Header & footer share icons
unified to Ionicons share-outline (header=accent, footer=black on accent CTA).
Removed Image+SKIN+ContactIconImage imports. Verified: title cleans correctly,
SHARE/SAVE present, lint clean. (Skinned web screenshot captures black — preview
artifact; confirm visually on device.)

## RULE — WRITTEN IN STONE (user demand, 2026-06-19)
ALWAYS talk to this user in PLAIN ENGLISH. No code words, no file names, no
technical jargon, no error-message copy-paste. Explain everything like you would
to a smart friend who does not code. Keep it short. This is non-negotiable.

## RULE — ACTIVE THEME CONTEXT (user demand, 2026-06-23)
Unless the user says otherwise, assume they are viewing the app through the
DEFAULT **Steel** theme layout (skin !== "plain", metalStyle === "steel"). All
bugs, changes, edits, and screenshots should target the Steel theme first.

## UI fix batch 3 (2026-06) — iteration_53 VERIFIED
- Add Dealer / Edit Dealer / New-Edit Agent(contact) modals got a top-right X
  close button (testIDs add-dealer-close / edit-dealer-close / agent-modal-close)
  + ScrollView contentContainerStyle paddingBottom:28 so bottom CREATE/SAVE/CANCEL
  clear the screen edge. (dealers.tsx + dealer/[id].tsx). ALL 3 VERIFIED iter_53.
- DEFAULT_DEALERS_SEED in server.py cleaned: each warranty/customer/tech contact
  field now holds ONE tappable value (removed "phone · email", "(hours)", text).
  Applies to NEW accounts only — EXISTING accounts keep old messy values (no
  migration written yet; offer to add one updating existing default-dealer records
  if user wants their own demo data fixed).
- NOTE: Metro runs with CI=true (hot reload disabled) — MUST `sudo supervisorctl
  restart expo` after frontend edits or changes won't reach the bundle.
STILL TODO (user's list): global BACK button on EVERY page (audit which screens
lack the IndustrialBanner back arrow); Stage 6 (reports/export simplified +
bundle export WITH/WITHOUT expansions). Plus optional: migrate existing accounts'
dealer contact fields to the cleaned single-contact format.
