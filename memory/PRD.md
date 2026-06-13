# Toolbox Tracker — PRD (v2)

## Goal
A mobile-first tool inventory tracker for managing tools across a toolbox/garage with deep dealer & warranty tracking.

## Users
Single user (no auth). Personal home/workshop use.

## Core Features
- **Tool Inventory** with full details: name, description, brand, model, serial, cost, purchase date, condition, location, **category**, tags, photos, documents.
- **Categories** (one per tool, autocomplete-create).
- **Tags** (many per tool, free-form add-as-you-type with autocomplete).
- **Dealers** with multiple **Agents**. One "current" agent at a time. Each tool snapshots which agent it was purchased from (so changing the current agent never alters past purchase records).
- **Warranty tracking** per tool: provider, contact, terms, length (months), start date, auto-computed expiry. Visible badge on inventory tab when warranties are expiring soon or expired (toggleable).
- **Consumables**: flag a tool as consumable + replacement info (store, website, SKU, notes). Filter the inventory by consumables.
- **Search & Filter**: full-text across all fields including dealer/agent/category. Filter chips: ALL / AVAILABLE / CHECKED OUT / CONSUMABLES.
- **Detail summary headers** on every list/search result: count, total $, dealer breakdown, category breakdown, location breakdown, tag count. Toggleable to hide $ amounts globally.
- **Borrower (People)** check-in/check-out with full history.
- **PDF Reports**: Full Inventory, Checked-Out, Available, per-tool detail. Optional "Include photos" toggle.
- **Toolbox Photo Mapping**: take a photo of your toolbox; **Gemini 2.5 Pro** analyzes drawer count + labels; user fine-tunes drawer regions; tap a drawer marker to see tools inside it. Drawers auto-create matching Locations.

## Design
Modern industrial dark theme — black background, yellow/orange accents (`#FFB300`), sharp edges, condensed/heavy typography, status dots.

## Tech
- Backend: FastAPI + MongoDB (motor), all routes under `/api`.
- Frontend: Expo Router (file-based), React Native, expo-image-picker, expo-document-picker, expo-print, expo-sharing, AsyncStorage for prefs.
- AI: Gemini 2.5 Pro vision via emergentintegrations (uses Emergent universal key).

## Smart Enhancement
Total inventory **value** rollups by dealer/category/search context — answers "how much did I spend with Matco?" or "what's my power tools investment?" instantly.

---

## Backlog — Future Features (not yet built)

### Combine / Bundle Items (requested 2026-05-15)
Let the user select several existing tools and group them into a single
"bundle" that has its own identity in the app:
- **Unique Bundle Model #** assigned to the parent bundle
- Listed as a **bundle** (not as individual items) in the inventory list
- Reported as a bundle in PDF / CSV exports
- Individual member items still trackable / inspectable from inside the bundle
- Likely a new top-level filter: `BUNDLES` alongside CONSUMABLES / FOR SALE / etc.
- Open design questions to confirm with user before building:
  - Can a tool belong to MULTIPLE bundles, or only one?
  - When a bundle is sold/lost/checked-out, are all members auto-marked the same way?
  - Should the bundle's photo be a montage of member photos, or a separately uploaded "hero" image?
  - Does the bundle have its own cost field, or is it the sum of member costs?


### Admin Broadcast Notices (requested 2026-05-15)
Admin-authored in-app popup messages that auto-show to every user the next
time they open the app — once per user per notice.

**Admin side (new "Notices" menu inside the existing Admin section):**
- List view of all notices (active + archived)
- Add / Edit / Delete a notice with: title, body text, severity (info / warning /
  critical), optional expiry date, audience filter (everyone vs free-only vs
  subscribed-only — future), active/inactive toggle
- Each notice gets a UUID `notice_id` and `created_at` timestamp

**User side:**
- On every app launch (after auth bootstrap + biometric unlock), call
  `GET /api/notices/pending`. Backend returns all ACTIVE notices that the
  user hasn't acknowledged yet.
- For each pending notice → show a styled modal (BevelCard background, severity
  color, title, body, single ACKNOWLEDGE button)
- ACKNOWLEDGE → `POST /api/notices/{id}/ack` → backend writes the user_id +
  notice_id to a `notice_acks` collection so it never re-fires for that user
- Non-admin users see each notice exactly ONCE, regardless of how many devices
  / reinstalls (acks are stored server-side keyed by user_id, not on-device)

**Admin side never sees the popup** even if they have unacked notices — admins
already know what they posted.

**Backend collections to add:**
- `notices`: {id, title, body, severity, created_at, expires_at, active, audience}
- `notice_acks`: {user_id, notice_id, acked_at} (compound unique index on
  user_id + notice_id)

**Endpoints to add:**
- `GET    /api/admin/notices`       — list all (admin)
- `POST   /api/admin/notices`       — create (admin)
- `PATCH  /api/admin/notices/{id}`  — edit (admin)
- `DELETE /api/admin/notices/{id}`  — delete (admin)
- `GET    /api/notices/pending`     — list unacked active notices for the
                                       current user (all auth users)
- `POST   /api/notices/{id}/ack`    — mark acked for current user (all auth)

**Estimated effort:** ~4-6 hours backend + frontend + admin UI. Low complexity,
high impact for emergency comms / changelog blasts.


### Expanded Import Selections (requested 2026-06)
Add additional first-class **Import From…** sources beyond the current
Receipt OCR / CSV flows. Each source would parse order history / receipts
into Toolbox Vault tools (name, cost, purchase date, dealer, photo if
available) so users can bulk-onboard years of past purchases.

**Candidate sources to scope:**
- **Amazon** (order history export / forwarded order emails)
- **Harbor Freight** (account order history / emailed receipts)
- **Home Depot** (online order history / Pro Xtra account export)
- **Lowe's** (MyLowe's account order history)
- **Northern Tool** (account order history)
- **Snap-On / Matco / Mac Tools** (dealer truck invoices — may overlap with
  existing dealer flow)
- **eBay** (purchase history for used tool buyers)
- **Generic email-forwarding inbox** (`imports@toolboxvault.app` → parse any
  forwarded receipt email with AI)

**Implementation approaches to evaluate:**
1. **Email-forward + AI parse** (lowest effort, broadest coverage) — user
   forwards any receipt to a dedicated inbox, GPT-4o parses it into a draft
   tool. Works for ALL retailers without per-site scrapers.
2. **CSV / JSON upload per retailer** — user downloads their order history
   from the retailer's website and uploads the file; we have a per-retailer
   parser. More reliable but requires the user to do the export step.
3. **OAuth / API integrations** — only Amazon has an SP-API and it's
   merchant-only; not viable for consumers. SKIP.
4. **Screen-scrape with the user's logged-in session** — fragile, ToS risk.
   AVOID.

**Recommended MVP path:** Option 1 (email-forward + AI) for v1.x, then add
per-retailer CSV parsers (Option 2) for the top-2 retailers by user demand.

**Open questions for user when we pick this up:**
- Which retailers do you personally use most? (drives priority order)
- OK with a dedicated forwarding email address as the primary intake, or do
  you want a "paste email body" textarea inside the app instead?
- Should imported items go straight into the inventory, or land in a
  "Pending Import — review & approve" tray first?

**Estimated effort:** 1–2 days for the email-forward MVP + 1 day per
retailer-specific CSV parser.


### TODO — Confirmed for next session (added 2026-05-16)
1. **Bump version for next build** — user said "1.3.1" but current is already 1.3.1; assumed they meant **v1.3.2 / build 22**. CONFIRM with user before bumping.
2. **Terms of Service + Privacy Policy hosting** — produce both as polished Markdown/HTML, walk user through hosting on GitHub Pages (free) so they have real public HTTPS URLs to paste into App Store Connect + Google Play Console. Must satisfy BOTH stores' content requirements (subscription disclosure, IAP terms, contact email, data-handling section).
3. **Add Terms link inside the paywall and More tab** — user will hand over the public URL after step 2. Targets: `app/paywall.tsx` (subscription terms-of-use link required by Apple), `app/(tabs)/more.tsx` Account section (Terms + Privacy rows).
4. **Remove the DEV Downgrade button + endpoint** — delete the row in `app/(tabs)/more.tsx` (search "DEV: Downgrade to Free") AND the backend endpoint in `subscriptions.py` (search `/dev/downgrade-to-free`). Both have prominent inline comments saying REMOVE BEFORE SUBMISSION.


---
### CHANGELOG — 2026-06-09 (fork continuation)
- **Iron Forge inventory skin (Stages 1-3)**: metal bg + framed search bar + skinned FAB, item cards on metal plate frame, framed Filter accordion + pickers. Plain themes untouched. Later removed the search-bar select icon (multi-select still via long-press), search bar now full width.
- **Crimson header fixed**: regenerated crimson nameplate from the NEW Iron Forge nameplate via -37° HSV hue rotation (`frontend/scripts/recolor_crimson.py`).
- **Floating + FAB** added to Dealers/Contacts/Claims/For Sale (shared `src/components/AddFab.tsx`, real black drop shadow); removed old Add buttons; Inventory+Wishlist FABs got the same shadow.
- **TWO NEW THEMES — Arctic (aqua) + Emerald (Irish green)**: full asset sets via `frontend/scripts/recolor_theme.py` (Arctic +167°, Emerald +127°). Wired in theme.ts (palettes), skins.ts (SKIN maps + VARIANT_MAPS + VARIANT_ACCENT), themeContext.tsx (variant/appearance/palette), more.tsx (picker rows). Login/forgot/TbvHeader now tint via VARIANT_ACCENT. Verified both end-to-end. To add more colors: run recolor_theme.py + copy SKIN/palette/variant/picker entries.
- Current build stamp: BUILD 242.

## Batch 284 (2026-06-13) — shipped, tested (iteration_24, all PASS)
- P0 FIX: dealer "Schedule" (truck account) crash — missing KeyboardAvoidingView import in src/sections/BalanceSection.tsx.
- Inventory skinned layout: all items now inside ONE metal panel (new src/tbv/components/TbvListPanel.tsx) instead of per-item frames.
- Detail Summary Header: added summaryFrameSkin marginHorizontal (was too wide).
- Default location seeding (backend): Main Toolbox>Drawer 1, Home Toolbox>Drawer 1 for new users (idempotent).
- Insurance Claims one-tap email: "Email Detailed Report to Insurer" button auto-renders detailed PDF + prefilled polished email template (src/insuranceReport.ts renderClaimReportOnly, EmailModal prefill prop).
- Build stamp: BUILD 284.

## Batch 287 (2026-06-13) — Insurance module polish, tested (iteration_25, all PASS)
- BUG FIX: one-tap "Email Detailed Report to Insurer" now reliably grabs the freshly generated report (was relying on a proxy-strippable header); verified email actually sent.
- New Claim date fields → date pickers (ICDateField); Import button → filled accent pill.
- Buttons enlarged/clearer module-wide; report-row actions → 40x40 bordered chips.
- Claim status badge → filled white-text (Draft now readable); dashboard tiles uniform height + value auto-fit.
- Stretched skinned panels fixed: ICSection now uses the taller window frame (not the short plate frame).
- Backend: insurance PDF section/table headers → dark-grey bars with white text (was navy-on-black).
- Build stamp: BUILD 287.

## Batch 288 (2026-06-13) — Insurance polish round 2, tested (iteration_26, all PASS)
- Import button moved to its own row under "Insurance Information" title (no overlap).
- Claim detail Timeline moved to the very bottom.
- Dashboard 6 stat boxes → ONE skinned panel with 6 stat rows.
- Evidence now shows real image thumbnails + tap-to-open (full-screen viewer for images, open/share for docs); added insuranceApi.getEvidence + openDataUriFile.
- Report generation: per-column picker for the itemized-asset table (backend ReportOptions.item_columns + dynamic _items_table).
- Build stamp: BUILD 288.

## Batch 289 (2026-06-13)
- Insurance claims main list compacted to one panel of dashboard-style rows (smaller text/badges, hairline dividers) — was oversized per-claim cards. BUILD 289.
