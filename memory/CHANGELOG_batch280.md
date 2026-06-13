# Changelog — BUILD 280–281 (2026-06-13)

## BUILD 280 — Keyboard + Intro
- **App-wide KeyboardAvoidingView audit & fix.** Scanned every `TextInput`. Most were
  search-bars-at-top or date-pickers (never covered). Fixed the 5 genuinely at-risk inputs:
  - `app/manage/[kind].tsx` — list edit input: `automaticallyAdjustKeyboardInsets` on ScrollView.
  - `app/(tabs)/reports.tsx` — report-builder option fields: same.
  - `src/sections/NotificationsSettingsSection.tsx` — custom-days modal ScrollView: same.
  - `src/sections/BalanceSection.tsx` — payment-schedule modal wrapped in `KeyboardAvoidingView`.
  - `app/admin/backups.tsx` — restore-email confirm modal wrapped in `KeyboardAvoidingView`.
  - (Fixed a stray corrupted styles block at end of BalanceSection.tsx.)
- **Re-enabled intro splash video** (`app/_layout.tsx`: `INTRO_ENABLED = true`). Confirmed the
  15s safety-timeout + tap-to-skip fallback still reveals the app if the video can't play.
- Roadmap: removed A2 & B2; moved all C features to "later".

## BUILD 281 — Cut the Fat (asset cleanup)
- Static + density-corrected scan (Metro auto-bundles `@2x/@3x` siblings — accounted for).
- **Deleted 217 unreferenced asset files / ~424 MB** in 3 verified tiers
  (assets 671 MB → 247 MB):
  - Tier 1 (47 MB): `tbv-v3/`, `archive/`, default SpaceMono font, stray leftovers.
  - Tier 2 (185 MB): old pre-trimmed `tbv-v2/*` and unused `tbv-master/*` subfolders.
  - Tier 3 (192 MB): unused logos/textures/placeholders inside active `trimmed*` variants.
- Each tier verified with full iOS+Web Metro bundles (no resolve errors) + login render.
- Records: `memory/FAT_TRIM_SCAN.md`, `memory/FAT_TRIM_DELETED_FILES.log` (for rollback ref).
- NOT done (deferred): 5 dead source components, backend `generated/` (~30 MB) — pending user OK.

## Follow-up (2026-06-13) — Dead code + backend trim
- Deleted 5 verified 0-import components: `DiamondPlate.tsx`, `industrial/IndustrialTabBar.tsx`,
  `sections/ClaimsHistorySection.tsx`, `tbv/components/TBVSteelHeader.tsx`, `tbv/components/TbvWordmark.tsx`.
- Moved `backend/generated/` (30 MB) → `/app/design_archive/generated` (out of deploy bundle) and
  removed the two temporary no-auth preview endpoints (`/api/preview/login-mockup`,
  `/api/preview/texture/{name}`) that were its only consumers.
- Verified: backend startup clean; frontend iOS bundle HTTP 200, no resolve errors.
- D3 "Downgrade to Free": NOT found in current code (no "REMOVE BEFORE SUBMISSION" markers,
  no downgrade button text, no git history) — appears already removed in a prior session. Awaiting user pointer.
