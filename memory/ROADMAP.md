# 🗺️ Toolbox Vault — Backlog & Roadmap (editable)

> Living list. Tell me "add X", "remove C2", "bump D3 to top", etc. and I'll keep this in sync.
> Priority key: 🔴 next-up · 🟠 soon · 🟡 planned · 🟢 future/idea
> IDs are kept stable across edits for easy reference.

---

## C. New features (DB-backed) — saved for later 🟢
- **C1 🟢 "Upcoming Features" list (server-driven)** — admin CRUD of text entries + public GET +
  a Vault list users can open. Compliance-cleared (Apple+Google) as long as it's text only.
- **C2 🟢 Admin Broadcast Notices** — admin-authored in-app popups that show once per user
  (severity, expiry, audience). Full spec + endpoints in `PRD.md`. ~4–6 hrs.
- **C3 🟢 Combine / Bundle items** — group several tools into a "bundle" with its own model #,
  shown/exported as one item, members still inspectable. Open design Qs in `PRD.md`.

## D. Launch / compliance
- **D1 🟠 Google OAuth → Production** — move the consent screen out of Testing (Drive token
  currently expires every 7 days). Walkthrough in `PLAN_active_work.md`.
- **D3 🔴 Remove DEV "Downgrade to Free"** — delete the More-tab row + the `subscriptions.py`
  endpoint before any store submission (both marked "REMOVE BEFORE SUBMISSION").

## E. Cut the Fat (asset/code cleanup)
- **E1 🔴 Asset trim (awaiting approval)** — ~424 MB of unreferenced assets identified
  (full tiered list in `memory/FAT_TRIM_SCAN.md`). Delete in safe tiers after user approval.
- **E2 🟡 Dead source files** — remove 5 verified 0-import components (see scan report).
- **E3 🟢 Backend `generated/` (~30 MB)** — move out of deploy bundle after confirming no route serves it.

---

## F. Platform reach (user-requested 2026-07-06) 🟠 soon
- **F1 🟠 Tablet-friendly layout** — keep 100% of current features/look; add responsive
  tablet layouts (multi-column grids, master-detail, capped widths) gated behind
  `isTablet`/`isDesktop` so the phone experience is pixel-identical. Preservation contract +
  6-phase plan in `memory/FUTURE_tablet_friendly.md`. Foundation already exists
  (`src/responsive.ts`, `ResponsiveContainer`) but is applied to only ~8 of ~44 screens.
  Suggested order: Phase 0 audit → 1 foundation → 2 grids first.
- **F2 🟠 Web (browser) access** — same app at a public URL, sign-in-only for existing
  mobile accounts (no web payments). Full concept + phased plan in
  `memory/FUTURE_web_access.md`. Shares ~70% of the tablet responsive work → do tablet first.

---

### Recently shipped (for context — not backlog)
- BUILD 283: **Insurance Claims module** (new) — full documentation & reporting system
  (claims CRUD, item attachment referencing inventory, claim-only evidence photos/docs,
  live financials, status engine + timeline, notes, professional Quick/Detailed PDF
  reports with version history + email, search/filter/duplicate/archive). Free feature,
  themed light/dark/skin. Backend 20/20 pytest green. Entry: Vault → Insurance Claims.
- BUILD 280: App-wide KeyboardAvoidingView coverage (manage, reports-options, schedule modal,
  notifications custom-days modal, admin restore modal); re-enabled intro splash video.
- BUILDS 274–279: metal-frame skinning of maintenance, warranty, wishlist, for-sale, reports,
  personal-info, dealer-claims, claim-detail; SkinPlate rail-clearing padding; wishlist/for-sale
  stat & tab fixes; claim-detail photo lightbox; dealer-claims pill buttons; Inventory search +
  filter-popup (matches For-Sale); "Personal Details" header; action-button layout.
- Removed from backlog per user: A1, A2, A3, B1, B2 (and prior trims).
