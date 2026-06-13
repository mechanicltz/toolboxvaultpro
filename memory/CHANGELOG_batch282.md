# Changelog — BUILD 282 (2026-06-13)

## Skinned-theme polish (Iron Forge)
- **Home dashboard → Dealer Accounts widget:** removed the small accent left-stripe
  (`styles.rowTick`) from the section header row and each dealer row in the skinned render
  path (`app/(tabs)/index.tsx`). Reclaims ~13px (3px bar + 10px margin) per row so dealer
  names/logos have more room. Stat rows (a separate section) keep their ticks.
- **Inventory "Detail summary headers" now skinned:** when the active skin is `industrial`,
  `SummaryHeader` is wrapped in a metal `<TbvFrame source={SKIN.window}/>` and a new
  `framed` prop strips its own card chrome (bg/border/left-stripe/margins/shadow) so only
  the metal frame shows. Plain themes unchanged. Files: `src/SummaryHeader.tsx`
  (added `framed` prop + `boxFramed` style), `app/(tabs)/inventory.tsx`
  (conditional TbvFrame wrap + `summaryFrameSkin` style).
- Verified via login → dashboard (stripes gone) and Inventory with the summary toggle ON
  (framed stat panel renders correctly). Full iOS Metro bundle compiles clean.

## Also in this session (earlier)
- Removed 5 dead 0-import components; moved `backend/generated/` (30 MB) to
  `/app/design_archive/` and removed its two temporary `/api/preview/*` endpoints.
- D3 "Downgrade to Free": not present in current code (appears removed previously) — still
  awaiting a user pointer if it exists somewhere.
