# 🗺️ Toolbox Vault — Backlog & Roadmap (editable)

> Living list. Tell me "add X", "remove C2", "bump D3 to top", etc. and I'll keep this in sync.
> Priority key: 🔴 next-up · 🟠 soon · 🟡 planned · 🟢 future/idea
> IDs are kept stable across edits for easy reference.

---

## A. Polish & cleanup
- **A2 🟠 Theme back-arrows** — replace any remaining hardcoded orange back/nav arrows with the
  active theme accent (`tool/edit.tsx`, and audit the app for stragglers).

## B. Theming / design system
- **B2 🟡 Remaining unskinned spots** — final sweep for any flat cards left in metal themes
  (dealer ACCOUNTS / edit modals are currently intentionally flat).

## C. New features (DB-backed)
- **C1 🟠 "Upcoming Features" list (server-driven)** — admin CRUD of text entries + public GET +
  a Vault list users can open. Compliance-cleared (Apple+Google) as long as it's text only.
- **C2 🟡 Admin Broadcast Notices** — admin-authored in-app popups that show once per user
  (severity, expiry, audience). Full spec + endpoints in `PRD.md`. ~4–6 hrs.
- **C3 🟡 Combine / Bundle items** — group several tools into a "bundle" with its own model #,
  shown/exported as one item, members still inspectable. Open design Qs in `PRD.md`.

## D. Launch / compliance
- **D1 🟠 Google OAuth → Production** — move the consent screen out of Testing (Drive token
  currently expires every 7 days). Walkthrough in `PLAN_active_work.md`.
- **D3 🔴 Remove DEV "Downgrade to Free"** — delete the More-tab row + the `subscriptions.py`
  endpoint before any store submission (both marked "REMOVE BEFORE SUBMISSION").

---

### Recently shipped (for context — not backlog)
Skinning punch list (BUILDS 274–279): metal-frame skinning of maintenance, warranty, wishlist,
for-sale, reports, personal-info, dealer-claims, claim-detail; SkinPlate rail-clearing padding;
wishlist/for-sale stat & tab fixes; claim-detail photo lightbox; dealer-claims pill buttons;
Inventory search + filter-popup (matches For-Sale); "Personal Details" header; action-button layout.
