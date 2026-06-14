# CHANGELOG — Batch 289 (2026-06-14)

## Inventory Free-Tier UI Redesign (COMPLETE)

User requests #2 and #3 from latest message — resolved.

### What changed
- `app/(tabs)/inventory.tsx`:
  - Moved the free-tier "hidden items" warning OUT of the list footer and into a
    prominent TOP banner via `ListHeaderComponent` (scrolls with the list, per
    user choice). Styled with existing `lockedTopBanner` styles: lock icon,
    "SUBSCRIPTION ENDED" title, "{n} tool(s) is/are hidden. Renew PRO to restore
    your full inventory." subtext, and an orange `RENEW` CTA chip.
  - Redesigned the bottom footer into a clean professional `lockedFooter` button:
    lock icon + "{n} tool(s) hidden on the free plan" + `UPGRADE` chip.
  - Both tap → `/paywall`. testIDs: `upgrade-banner-top`, `upgrade-banner`.
- `app/(tabs)/index.tsx`: bumped `HOME_BUILD` → **BUILD 317**.

### Verification
- Metro bundle compiled cleanly.
- Visual confirmed via screenshot logged in as `ryan@ryan.com` (free account,
  16 tools): top banner "SUBSCRIPTION ENDED — 1 tool is hidden" renders above the
  list with RENEW button. Matches the warranty-alert banner style requested.

### Note on backend (prior batch, already done)
- Free-tier visibility limit calc fixed to show 15 active items (excludes sold
  from the cap). API returns 15 active + 1 hidden.

## Current build: BUILD 317
