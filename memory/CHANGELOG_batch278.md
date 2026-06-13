# BUILD 278 batch (2026-06-13) — Skinning alignment + polish fixes

ROOT CAUSE of "content out of bounds on metal frames": the plate frame has
46px L/R rails (CAP.plate) + 12px T/B; SkinPlate (and several claims TbvFrame
calls) used padX of only 10-18, so content sat ON TOP of the rails.

Fixes:
1. `src/components/SkinPlate.tsx` — now ENFORCES rail-clearing padding minimums
   per frame (plate: padX≥44 / padT≥14 / padB≥16; window: padX≥38 / padT≥28 /
   padB≥30). Any smaller per-screen override is auto-bumped. Plain themes keep
   light padding (14/12/12). This single fix re-aligns maintenance, warranty,
   wishlist, for-sale, personal-info, dealer-claims, and claim-detail at once.
2. `(tabs)/claims.tsx` — bumped all TbvFrame padX (16/18→44, window 26→38) so
   stat row, search, dealer/open rows, and history window are inside the rails.
3. Wishlist (`wishlist.tsx`):
   - Stat row → ONE SkinPlate wrapping 3 flat stats; dropped the "Bought" box
     (4 individual framed boxes couldn't fit). Now Open / Planned / Spent fit.
   - Convert/Purchased/Restore pills → `compact` so they stay inside the card.
   - OPEN / PURCHASED tabs → skinned dark pills (orange border when active).
4. For-Sale (`for-sale.tsx`):
   - LISTED/SOLD tabs → skinned pills; search bar → metal SkinPlate frame.
   - 2 stat boxes → ONE SkinPlate with flat stats (were overflowing).
5. Personal Info (`personal-info.tsx`) — header now "Personal Details", no subtitle.

HOME_BUILD → BUILD 278.
Verified on web: wishlist, for-sale, claims, personal-info all aligned within rails.
