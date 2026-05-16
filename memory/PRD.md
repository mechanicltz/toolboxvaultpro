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

