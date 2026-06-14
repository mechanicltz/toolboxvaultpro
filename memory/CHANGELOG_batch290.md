# CHANGELOG — Batch 290 (2026-06-14)

## Report bundle total + Year-End cleanup + Dealer skinned UI fixes

### 1. Bundle report footer total (backend — reports.py)
- Problem: With "Bundle" set-pricing chosen, the report TABLE FOOTER total
  summed every individual item including bundled items. Only the top summary
  stat was correct.
- Fix: `_data_table` / `render_csv` now accept `total_overrides`. The inventory
  and insurance fetchers set `footer_total_overrides={"cost": items_bundles}`
  in bundle mode, where items_bundles = unbundled items' individual cost +
  each set's set_price (counted once). Items are still listed individually with
  their own prices; only the grand total reflects bundle pricing.
- Tests: added 3 tests in tests/test_bundle_reports.py (10 pass total).
  Verified end-to-end PDF + CSV render (footer = override value).

### 2. Year-End "Total Recovered" removed (backend — reports.py)
- Removed the "Total Recovered" summary stat (wrapped to 2 lines, looked tacky)
  AND the per-row "Recovered" (`ye_recovered`) column + its default-columns ref.

### 3. Dealer detail — agent card shadow box in skinned theme (dealer/[id].tsx)
- Added `AgentSubShell`: in the metal/industrial skin the expanded agent
  business card renders as a flat plate (accent top-border separator, no
  floating shadow). Light/Dark themes keep `ShadowBoxSubCard`.

### 4. Dealer tools screen — summary boxes in skinned theme (dealer/[id]/tools.tsx)
- Removed the unskinned surface/border/shadow boxes around "TOTAL TOOLS" and
  "TOTAL INVESTED" when industrial-skinned; stats now sit on the metal window
  with readable colors (white count, accent invested) + a subtle divider.

### Build
- HOME_BUILD → **BUILD 319**. Expo restarted.
- All changes verified: backend via pytest + render; skinned UI via screenshots
  (ryan@ryan.com, industrial skin).
