# 📱➡️🖥️ FUTURE FEATURE: Tablet-Friendly Layout

> **Status:** Planned / not in implementation. Captured 2026-07-06 at user request.
> **Goal (user's words):** "Keep everything the app does, looks like, and everything
> about it — just make it tablet friendly better." Right now the app *works* on a tablet
> but is essentially a stretched phone layout.
> **Companion doc:** `FUTURE_web_access.md` (desktop/browser) — shares the same responsive
> foundation, so build tablet first, then web reuses ~70% of it.

---

## 0. THE PRESERVATION CONTRACT (read before touching anything)

Tablet work is **additive and responsive-gated ONLY**. Nothing about the current phone
experience may change. Concretely, these are hard invariants:

1. **Phone is the source of truth.** At width `< 600px` (`isPhone`) every screen must render
   PIXEL-IDENTICAL to today. All tablet styling lives behind `isTablet` / `isDesktop`
   branches so the phone path is never altered.
2. **Feature parity.** Every feature stays: inventory, bundles/sets, dealers + payment
   schedules, borrowers/checkout, warranty claims, insurance claims, wishlist, for-sale,
   maintenance, reports (PDF/CSV), backups/disaster-recovery, currency selector, upcoming
   features/roadmap, admin tools, intro video, biometric lock.
3. **Look & identity preserved.** All 3 theme families stay exactly as-is:
   - **Iron Forge** (orange `#FF6A00`) and **Steel** skins — these use 9-slice metal-frame
     PNGs (`TbvFrame`, `tbv/skins`). Scaling these on tablet is the #1 visual risk — see §5.
   - **Crimson Steel** (pink `#FF1A6B`), plain **Light** and **Dark** modes.
   - Fonts: BebasNeue / Rajdhani / Exo2 stack (loaded via `useTbvFonts`).
4. **Data & isolation untouched.** Per-account AsyncStorage namespacing
   (`toolbox_prefs_v2_{user.id}`, `tbv_currency_code::{userId}`), background backups,
   RevenueCat entitlements — no changes.
5. **No regressions to `.env`, metro config, ports, or navigation semantics** (Android
   back-button policy, tab structure).

**Rule of thumb:** if a diff changes what a phone user sees, it's out of scope. Every tablet
change is `if (!isPhone) { … }`.

---

## 1. CURRENT STATE (what already exists — build on this, don't reinvent)

- **`src/responsive.ts`** — the foundation:
  - Breakpoints `BP = { phone: 600, tablet: 900, desktop: 1200 }`.
  - `useResponsive()` → `{ width, height, isPhone, isTablet, isDesktop, isLargeScreen,
    gridCols (1/2/3), fontScale (1 / 1.1 / 1.15) }`.
  - `CONTENT_MAX_WIDTH = 760`, `CONTENT_MAX_WIDTH_WIDE = 1080`.
- **`src/ResponsiveContainer.tsx`** — centers + max-width-caps content on large screens;
  a no-op on phones. Variants: `narrow` (760) / `wide` (1080) / `full`.
- **`app/_layout.tsx`** already wraps the Stack in `<ResponsiveContainer variant="wide">`,
  so on a tablet the whole app is centered with letterboxing today (that's the "kinda works").
- **`app/+html.tsx`** — web HTML shell (also benefits the browser effort).
- **Adoption gap:** only ~8 of ~44 route files reference the responsive helpers. Most
  screens render a single phone-width column centered on the tablet — lots of wasted
  horizontal space. **That gap is exactly the work.**

### Screen inventory (~44 routes) grouped by tablet treatment
| Group | Screens | Tablet opportunity |
|---|---|---|
| **List/grid** | inventory, dealers, borrowers, claims, wishlist, for-sale, bundle, maintenance, warranty, insurance-claims/index, upcoming-features | Multi-column grid (`gridCols` 2–3) instead of 1-col |
| **Detail** | tool/[id], dealer/[id], borrower/[id], claim/[id], insurance-claims/[id], checkout-history, claims-history, dealer-claims | Master-detail split (list left / detail right) in landscape |
| **Dashboard** | (tabs)/index | Wider stat grid, 2-up cards |
| **Forms/settings** | more, settings/currency, personal-info, change-email, data-management, import-export, reports, manage/[kind], locations, feedback, insurance-claims/new | Cap width (narrow), larger inputs, 2-col field rows where sensible |
| **Full-bleed / special** | login, intro, paywall, bootstrap, pdf-viewer, admin/* | Center card; pdf-viewer uses full width |

---

## 2. PHASED PLAN (each phase independently shippable & phone-safe)

### Phase 0 — Audit & tablet screenshot harness  ·  🟢 low risk
- Add a repeatable screenshot pass at tablet viewports: **820×1180 (portrait)** and
  **1180×820 / 1024×1366 (landscape)** for every route.
- Produce a punch-list of what looks stretched/awkward per screen. No code changes.
- Decide orientation support (check `app.json` — likely portrait-locked today; tablets
  usually want landscape enabled). Enabling landscape is a Phase-1 decision.

### Phase 1 — Foundation: consistent width + spacing  ·  🟢 low risk
- Wrap every screen's scroll content in `ResponsiveContainer` (narrow for forms/detail,
  wide for lists/dashboard) so nothing is edge-to-edge-stretched or awkwardly narrow.
- Apply `fontScale` from `useResponsive()` to base typography on tablet (gentle 1.1×).
- Ensure min touch targets and comfortable padding on the larger canvas.
- **Deliverable:** app looks intentional (not stretched) on tablet; phone untouched.

### Phase 2 — Multi-column grids  ·  🟠 medium
- Convert the **List/grid** group to render `gridCols` columns on tablet (2 portrait /
  3 landscape) via FlatList `numColumns` (keyed by width so it re-lays-out on rotate).
- Card components already exist; mostly a layout wrapper + width math.
- **Deliverable:** inventory/dealers/claims/wishlist/for-sale fill the tablet nicely.

### Phase 3 — Master-detail (split view)  ·  🟠 medium/high
- In landscape on tablet, show **list on left + selected detail on right** for the big
  Detail-group screens (tool, dealer, insurance-claim). On phone, unchanged push-navigation.
- Highest-value "feels like a real tablet app" upgrade; also the biggest effort.
- **Deliverable:** two-pane tool/dealer/claim browsing on tablet.

### Phase 4 — Navigation adaptation (optional)  ·  🟡 medium
- Optional **side rail / nav drawer** instead of the bottom tab bar on large landscape
  tablets (bottom tabs look stranded on a wide screen). Keep bottom tabs on phone + small
  tablets. Reuses directly for the desktop/web effort.

### Phase 5 — Modals, orientation & polish  ·  🟡 medium
- Size modals/bottom-sheets sensibly on tablet (centered cards, capped width).
- Full landscape + rotation handling; safe-area for tablet notches/home indicators.
- Verify skinned PNG frames scale cleanly at larger sizes (see §5).

### Phase 6 — QA & regression  ·  🔴 required to close
- `testing_agent` full regression on **phone** (no visual/functional change) + tablet
  smoke on every screen, both orientations. Verify all 5 theme looks intact.

---

## 3. EFFORT / SEQUENCING (rough)
| Phase | Scope | Risk |
|---|---|---|
| 0 Audit | Screenshots + punch-list | Low |
| 1 Foundation | Width/spacing/type everywhere | Low |
| 2 Grids | Multi-column lists | Medium |
| 3 Master-detail | Split views | Medium/High |
| 4 Nav | Side rail on large tablets | Medium |
| 5 Modals/orientation | Polish + landscape | Medium |
| 6 QA | Regression + tablet smoke | Required |

**Recommendation:** ship Phases 0→1→2 first (biggest visual win for least risk), then
decide if master-detail (3) and side-rail (4) are worth it before web.

---

## 4. TESTING STRATEGY
- Use the `screenshot_tool` at tablet viewports (820×1180, 1024×1366) per screen each phase.
- After each phase, `testing_agent` (frontend) with an explicit instruction: **"verify the
  phone layout at 390×844 is unchanged"** plus tablet checks.
- Keep `/app/memory/test_credentials.md` current for the agent.

## 5. KNOWN RISKS (tablet-specific)
1. **9-slice skin PNGs (`TbvFrame`, Iron Forge/Steel).** These metal frames are the identity
   of the app. At tablet sizes the corner bolts/edges must not smear or pixelate. Test skinned
   screens explicitly; may need higher-res source frames or tuned 9-slice insets.
2. **Hardcoded pixel widths / absolute positioning.** Audit for `width: <fixed>` and
   `position:'absolute'` that assume a 390px canvas.
3. **Orientation lock.** If `app.json` is portrait-only, landscape tablet layouts won't show
   until it's enabled — coordinate with the store build.
4. **FlatList numColumns + rotation.** Must re-key on width change or columns won't reflow.
5. **`fontScale` interaction** with the global `allowFontScaling=false` in `_layout.tsx`
   (Dynamic Type is disabled app-wide) — apply our own scale, don't re-enable OS scaling.

## 6. OPEN QUESTIONS (re-ask when starting)
1. Which tablets matter most — iPad (4:3) primarily, or Android tablets too?
2. Enable landscape, or keep portrait-only even on tablet?
3. Is master-detail (Phase 3) wanted, or is "clean multi-column + no stretching" enough?
4. Ship tablet fully before starting web, or interleave (they share Phases 1/2/4)?

---
**End of tablet concept doc. Reopen when ready to begin Phase 0.**
