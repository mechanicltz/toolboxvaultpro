# BUILD 277 batch (2026-06-12) — Skinning punch list

New reusable component: `src/components/SkinPlate.tsx`
  - Industrial themes → metal `TbvFrame` plate; plain themes → flat ShadowBox-style card.
  - Props: style (outer margins), innerStyle (row/align/gap layout), padX/padTop/padBottom, onPress, frame.
  - NOTE: `themedStyles(...)` returns a theme-reactive object used at MODULE scope (NOT a hook).

Quick fixes:
1. Contacts/Borrower detail: "PER-TOOL TOTALS" → "CHECKED OUT TOOL TOTALS" (+ contrast bump on section label, textMuted→textSecondary). `borrower/[id].tsx`
2. Claims top counters: "REPLACEMENT" label forced to 1 line (numberOfLines + adjustsFontSizeToFit). `(tabs)/claims.tsx`
3. Wishlist "Convert" button → active orange pill matching "Purchased". `wishlist.tsx`
4. Inventory For-Sale: removed floating "+" AddFab. `for-sale.tsx`
5. Warranty alerts: removed per-item colored side strip (kindBar). `warranty.tsx`

Skinned (cards wrapped in SkinPlate metal plates):
6. Maintenance — stat row + item cards. `maintenance.tsx`
7. Warranty — item rows. `warranty.tsx`
8. Wishlist — stat boxes + item cards. `wishlist.tsx`
9. For-Sale — item cards + stat boxes (LISTED & SOLD tabs). `for-sale.tsx`
10. Reports — type cards + format cards; local `Header` now renders `IndustrialBanner` so every wizard step (Filters/Format/Fields) shows the metal banner. `(tabs)/reports.tsx`
11. Personal Info — info cards. `personal-info.tsx`
12. Dealer claims — claim cards (OPEN & HISTORY tabs); replaced BevelCard with SkinPlate. `dealer-claims/[id].tsx`
13. Claim detail — Section bodies + toolCard skinned; broken-part photo now tappable → full-screen lightbox modal. `claim/[id].tsx`
   - (claims-history/[id].tsx was already skinned via TbvFrame — untouched.)

HOME_BUILD → BUILD 277.

Tested: testing agent iteration_20.json — all 13 items PASS, no SkinPlate render errors.
Claim-detail lightbox verified by code review only (no history claim with photo in test acct).
