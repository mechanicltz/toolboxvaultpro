# CHANGELOG — Batch 288 (2026-06-13)

Build: HOME_BUILD → **BUILD 288**. Verified: testing agent iteration_26 (all PASS).
Insurance Claims module — second polish/feature round.

## Frontend
1. **Import button overlap fixed** — "Import from my profile" pill now sits on its
   OWN row below the "Insurance Information" title (was overlapping the title via
   the ICSection `right` slot). `app/insurance-claims/new.tsx`.
2. **Timeline moved to bottom** — claim detail order is now …→ Reports → Timeline
   (last). `app/insurance-claims/[id].tsx`.
3. **Dashboard summary = one panel** — replaced the 6 separate stat boxes with a
   single skinned `window`-frame panel listing 6 stat rows (label left / value
   right). `app/insurance-claims/index.tsx`.
4. **Evidence thumbnails + viewer** — evidence cells now lazy-load real image
   thumbnails (list endpoint omits data; fetched per-item via new
   `insuranceApi.getEvidence`). Tapping an image opens a full-screen
   `EvidenceViewer` modal; tapping a doc opens/shares it via new
   `openDataUriFile()` in `src/insuranceReport.ts`.
5. **Report item-column picker** — Generate Report modal now has an "Itemized
   asset columns" checklist (Brand, Serial/Model, Qty, Condition, Purchase Date,
   Category, Location, Cost, Replacement, Claimed; Item name always shown).

## Backend (insurance_claims.py)
- `ReportOptions.item_columns: List[str]` added.
- `ITEM_COL_DEFS` + `DEFAULT_ITEM_COLUMNS` define selectable columns (label,
  relative width, alignment). `_items_table()` now builds the header/rows/total
  and normalized column widths dynamically from the selected columns. Numeric
  columns (cost/replacement/claimed) get a TOTAL row. Header bar #3A3A3A + white.
- Verified: render with custom `item_columns` → HTTP 200.

## Batch 289 (2026-06-13) — Insurance list compacted
- Insurance claims main list: replaced one large metal SkinPlate card PER claim
  with ONE skinned panel containing compact rows (matches main Dashboard pdRow
  style): claimTitle 16→14, claimMeta 12→11, smaller badge (10px), 10px row
  padding + hairline dividers, chevron 18→16. Verified via screenshot (BUILD 289).

## Batch 290-291 (2026-06-13) — Insurance list badge + tighter summary
- Status badge now matches the app convention (WarrantySection style): translucent
  tinted bg (tint+"22") + colored border + COLORED text, instead of white-on-solid.
  Draft "muted" tint uses textSecondary (was textMuted) for legibility. Fixes the
  unreadable grey/white "Draft" pill.
- Insurance summary panel compacted further: statRow padding 12→8, label 13→11,
  value 20→16; panel padTop/padBottom 14→8. Reduces the "too large" top area.
- Verified via screenshot (BUILD 291).

## Batch 292 (2026-06-13) — Insurance summary matches home "Net Worth" readout
- Insurance dashboard summary rows now replicate the home Dashboard detailsRow
  gauge style EXACTLY: BebasNeue_400Regular font @ 14px, letterSpacing 1.2,
  orange accent tick (rowTick) on each label, recessed "machined slot" row bg,
  and a recessed gauge-chip for the value. Replaces the prior 16px bold sans rows.
- Verified via screenshot (BUILD 292).
