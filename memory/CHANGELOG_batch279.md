# BUILD 279 batch (2026-06-13) — 4 follow-up changes

1. Personal Details (`personal-info.tsx`):
   - Header → "Personal Details" (no subtitle).
   - "Change Login Email" button removed from VIEW mode (now only in EDIT mode).

2. History claim detail (`claim/[id].tsx`) — skinned the 2 remaining flat sections:
   - status banner → SkinPlate metal frame.
   - date grid (NOTIFIED/CLOSED/OPENED) → wrapped in one SkinPlate; date boxes flattened inside.

3. Dealer claims (`dealer-claims/[id].tsx`) — EMAIL / TEXT / OPEN action buttons
   restyled from cramped red rectangles to readable orange PILLS
   (borderRadius pill, accent border/text, fontSize 8→10).

4. Inventory (`(tabs)/inventory.tsx`) — replaced the inline filter ACCORDION with the
   For-Sale pattern: a FILTERS button inside the metal search bar opens a bottom-sheet
   POPUP modal (Status / Locations / Tags / Sort / Categories + CLEAR ALL / DONE).
   The existing Status/Location/Tag/Sort/Category sub-pickers now open as nested modals
   on top of the FILTERS modal. Search frame padX bumped 16→44 (rail clearance).
   (FilterAccordionWrap component + a few accordion styles are now dead code.)

HOME_BUILD → BUILD 279.
Tested: testing agent iteration_22 — all 4 PASS (Inventory nested-modal flow verified).
Coverage gaps: /claim/[id] date/status frames and dealer-claims pills are source-verified
but couldn't be exercised at runtime (test account currently shows 0 open/history claims).
