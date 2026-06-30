# Changelog — Batch 294

## 1. Plain Light theme header logo (transparency fix)
- Reprocessed the uploaded "light header" wordmark. Source has a flat light-grey
  bg (#BFBFBF) plus a soft drop shadow. New script keys out the flat background
  cleanly (no rectangular box, crisp anti-aliased letter edges) and trims tight
  to the logo. The design's own soft shadow ramps naturally into transparency.
- File: `/app/scripts/process_light_header.py` → `/app/frontend/assets/light-header-logo.png`
  (1536×530). Synced `LIGHT_LOGO_ASPECT = 1536/530` in `TbvHeader.tsx`.
- Verified via testing agent: renders clean on the Plain Light dashboard, no box.

## 2. Data Management screen (Task 1 + Issue 2)
- NEW screen `/app/frontend/app/data-management.tsx`, reached via Vault → DATA
  MANAGEMENT → "Manage Data" (`more-data-management`). Three cards:
  - Install Preloaded Data → POST `/api/data-management/install-preloaded`
  - Remove Data (multi-select + warning + confirm modal) → POST `/api/data-management/remove`
  - Delete Prefilled Information (demo) → POST `/api/demo/clear` (keep_taxonomy / everything)
- MOVED "Delete Prefilled Information" out of the Account section into this screen;
  the Account row now routes to Manage Data when demo data is present. Removed the
  old demo modal/logic from `more.tsx`. Updated `DemoBanner.tsx` tooltip + button
  to point at "Vault → Manage Data".
- api.ts: added `removeData`, `installPreloaded`.

## 3. Add Bundle Items from Inventory (Task 2)
- NEW backend endpoint `POST /api/tools/{bundle_id}/absorb/{tool_id}` (routes_bundles.py):
  moves a standalone tool into a set as an inside item (name/model/cost/photo
  preserved), then deletes the standalone tool. The cover photo URL is TRANSFERRED
  (photos[0] not deleted); extra media + warranty claims are cleaned up.
- BundleTab.tsx: new "FROM INVENTORY" button (`absorb-inventory-btn`) opens a tool
  picker; selecting an item shows a confirm prompt then calls api.absorbToolIntoBundle.
- Backend verified 7/7 (tests/test_iter75_absorb_upcoming.py).

## 4. Notification bubbles for Upcoming Features (Task 3)
- NEW shared store `/app/frontend/src/upcomingBadge.ts`: `useUpcomingBadge()` +
  `markUpcomingSeen()`. Signature = release count + per-release id:updated_at,
  compared against AsyncStorage `tbv_upcoming_seen_sig`.
- Red dots wired on: Vault/"more" tab icon (`tab-more-dot`), dashboard wordmark
  (`tbv-header-badge` via new TbvHeader `badge` prop), and the Vault → Upcoming
  Features row (existing NEW pill, now driven by the per-user unseen state).
- Opening `/upcoming-features` calls `markUpcomingSeen()` → clears all dots globally.
- Verified via testing agent (both dots render bottom-right + on logo; clear on visit).

## Notes
- Admin allow-list: `MechanicLTZ@gmail.com` (ADMIN_EMAILS).
- Pre-existing lint warnings (unused imports in index.tsx/more.tsx) left untouched.
