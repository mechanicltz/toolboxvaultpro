# CHANGELOG — Batch 284 (2026-06-13)

Build: HOME_BUILD bumped 283 → **BUILD 284**.
Verified by frontend testing agent — iteration_24 (all 4 PASS, no bugs).

## P0 Bug Fix
- **Dealer "Schedule" (Truck Account) crash** — tapping Schedule for a dealer
  truck account threw `Property 'KeyboardAvoidingView' doesn't exist`.
  Root cause: `KeyboardAvoidingView`/`Platform` used in `ScheduleModal` but not
  imported in `src/sections/BalanceSection.tsx`. Added the imports. Modal now
  opens cleanly.

## P1 — Skinned (Iron Forge) layout
- **Inventory single-panel layout** — the entire FlatList now lives inside ONE
  large metal panel (`src/tbv/components/TbvListPanel.tsx`, a new fill-parent
  9-slice container) instead of one `TbvFrame` per item. Rows render as plain
  `rowSkinPlain` with hairline dividers. Plain/light/dark themes unaffected.
  - New component `TbvListPanel` measures its OWN box (flex:1) so a virtualized
    FlatList can scroll inside it (TbvFrame measures child height and can't).
- **Detail Summary Header too wide** — added the missing `summaryFrameSkin`
  style `{ marginHorizontal: 12, marginBottom: 8 }` in inventory.tsx so the
  skinned summary panel is inset from screen edges.

## P1 — Locations
- **Default location seeding** — `backend/server.py seed_default_content_for_user`
  now seeds `Main Toolbox > Drawer 1` and `Home Toolbox > Drawer 1` (idempotent,
  case-insensitive) for new users. Curl-verified hierarchy (parent_id correct).
  NOTE: existing users (e.g. mechanicltz) won't auto-get these unless the admin
  seed-defaults backfill is run.

## P2 — Insurance Claims one-tap email
- Added **"Email Detailed Report to Insurer"** button on the claim detail
  Reports section (`app/insurance-claims/[id].tsx`). It silently renders a fresh
  Detailed PDF (`renderClaimReportOnly` in `src/insuranceReport.ts`), then opens
  the email composer pre-filled with the saved agent/adjuster email + a polished
  subject/body template (policy #, claim #, type, date of loss, net claimed).
- `EmailModal` now accepts a `prefill` prop; per-report mail icon clears prefill
  to avoid stale template leakage.
