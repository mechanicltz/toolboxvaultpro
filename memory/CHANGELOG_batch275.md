# BUILD 275 batch (2026-06-12)

1. Item-detail bottom ACTION grid (`tool/[id].tsx`): made buttons longer / tighter
   per user request ("less padding between them so they can be longer", keep 2-up):
   - `actionGrid` gap 5 → 2
   - `actionTile` (plain) + `actionTileSkinWrap` (metal skin) width 48.5–49.3% → 49.4%
   - `actionTileSkin` internal paddingHorizontal 6 → 2 (gives the centered label
     more room inside the steel plate so longer labels e.g. "MARK BROKEN" /
     "EDIT LISTING" fit better).
   NOTE: Web preview renders these metal `ImageBackground` tiles single-column
   regardless of width (the art's intrinsic width dominates on react-native-web).
   On iOS the 49.4% flex width packs 2-up (proven: build 274 @ 49.3% rendered
   2-up in the user's screenshot). Verify on device.

2. Pill-button consistency (photo / document / receipt "ADD"): VERIFIED via live
   web render that the item-DETAIL attachment ADD pills (`tool/[id].tsx` gallery,
   `DocumentsSection.tsx`, `ReceiptsSection.tsx`) already use the EXACT same
   `<PillButton variant="active" compact>` as the EDIT screen (`tool/edit.tsx`).
   No code change needed — the taller pill in the user's screenshots was a stale
   pre-refactor build. BUILD 275 ships the consistent compact pills.

3. HOME_BUILD bumped 274 → 275 (`app/(tabs)/index.tsx`).

## BUILD 276 (2026-06-12)
- Item-detail bottom ACTION buttons switched to **1 per row, full-width, centered**
  labels (`tool/[id].tsx`): `actionTile` + `actionTileSkinWrap` width → 100%,
  `actionGrid` gap → 8, skin paddingHorizontal restored to 6. Labels no longer
  clip; buttons align under the panels above. Verified on web preview.
- HOME_BUILD → BUILD 276.
- Keyboard audit: wrap `forgot-password.tsx`, `manage/[kind].tsx`, `for-sale.tsx`
  in KeyboardAvoidingView.
- Hardcoded orange back arrows: `wishlist.tsx`, `tool/edit.tsx`, `(tabs)/reports.tsx`.
- (P2) Centralized contrast-aware button kit; skin per-dealer claims + claim detail.
