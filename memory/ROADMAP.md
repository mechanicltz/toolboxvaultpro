# 🗺️ Toolbox Vault — Backlog & Roadmap (editable)

> Living list. Tell me "add X", "remove B3", "bump C2 to top", etc. and I'll keep this in sync.
> Priority key: 🔴 next-up · 🟠 soon · 🟡 planned · 🟢 future/idea
> Source specs noted where a fuller write-up already exists.

---

## A. Polish & cleanup (small, near-term)
- **A1 🔴 Keyboard audit** — wrap remaining forms in KeyboardAvoidingView so the keyboard
  never hides inputs: `forgot-password.tsx`, `manage/[kind].tsx`, `for-sale.tsx`.
- **A2 🟠 Theme back-arrows** — replace any remaining hardcoded orange back/nav arrows with the
  active theme accent (`tool/edit.tsx`, and audit the app for stragglers).
- **A3 🟠 Dead-code cleanup** — delete unused: `app/warranty-claims.tsx` route, the now-unused
  `FilterAccordionWrap` (inventory), leftover `PillButton`/AI-asset imports.
- **A4 🟡 Banner subtitle contrast** — IndustrialBanner subtitle text is nearly invisible on the
  metal background (flagged twice by testing). Bump color/opacity app-wide.
- **A5 🟡 Re-enable intro video** — currently `INTRO_ENABLED = false`. Turn back on once UI is final.
- **A6 🟡 PDF model-number de-dupe** — reports stack duplicate/blank `model_numbers`; clean them
  in `reports.py` for tidier PDFs.

## B. Theming / design system
- **B1 🟠 Centralized contrast-aware button kit** — PrimaryButton/SecondaryButton that auto-pick
  black/white text based on the theme accent's luminance (the deferred "Option B").
- **B2 🟡 Remaining unskinned spots** — final sweep for any flat cards left in metal themes
  (most screens now done via SkinPlate; dealer ACCOUNTS / edit modals are intentionally flat).
- **B3 🟢 Tablet responsiveness audit** — layout pass for larger screens.

## C. New features (DB-backed)
- **C1 🟠 "Upcoming Features" list (server-driven)** — admin CRUD of text entries + public GET +
  a Vault list users can open. Compliance-cleared (Apple+Google) as long as it's text only.
- **C2 🟡 Admin Broadcast Notices** — admin-authored in-app popups that show once per user
  (severity, expiry, audience). Full spec + endpoints in `PRD.md`. ~4–6 hrs.
- **C3 🟡 Combine / Bundle items** — group several tools into a "bundle" with its own model #,
  shown/exported as one item, members still inspectable. Open design Qs in `PRD.md`.
- **C4 🟢 Expanded Import sources** — bulk-onboard past purchases. MVP = forward-a-receipt-email
  + AI parse; then per-retailer CSV (Amazon, Harbor Freight, Home Depot, Lowe's, Northern Tool,
  Snap-on/Matco/Mac, eBay). Full plan in `PRD.md`.
  ⚠️ AI-cost rule: any AI/LLM feature needs a per-call cost estimate + your written OK first.

## D. Launch / compliance
- **D1 🟠 Google OAuth → Production** — move the consent screen out of Testing (Drive token
  currently expires every 7 days). Walkthrough in `PLAN_active_work.md`.
- **D2 🟡 Terms of Service + Privacy Policy** — host both (GitHub Pages), then link from the
  paywall and the More/Vault Account section. Templates already in `/app/memory`.
- **D3 🔴 Remove DEV "Downgrade to Free"** — delete the More-tab row + the `subscriptions.py`
  endpoint before any store submission (both marked "REMOVE BEFORE SUBMISSION").
- **D4 🟡 Version bump** — confirm target version/build before the next store build.

## E. Big future bets (concept docs exist, not started)
- **E1 🟢 Company / Multi-User Tier** — shops/fleets: one subscription, employee seats, shared
  inventory + equipment + insurance reporting (Master/Manager/Employee roles). Full design in
  `FUTURE_company_tier.md`.
- **E2 🟢 Web App Access** — full browser app at a public URL (same login/data; camera/biometric/
  push/IAP stay mobile-only). Foundation already exists via Expo web. Design in `FUTURE_web_access.md`.

---

### Recently shipped (for context — not backlog)
Skinning punch list (BUILDS 274–279): metal-frame skinning of maintenance, warranty, wishlist,
for-sale, reports, personal-info, dealer-claims, claim-detail; SkinPlate rail-clearing padding;
wishlist/for-sale stat & tab fixes; claim-detail photo lightbox; dealer-claims pill buttons;
Inventory search + filter-popup (matches For-Sale); "Personal Details" header; action-button layout.
