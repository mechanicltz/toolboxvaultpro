# 🚧 ACTIVE WORK PLAN — Mr. Foreman App (post-launch polish batch)

**LAST UPDATED:** 2026-05-26

This file is the SOURCE OF TRUTH for the current multi-session feature batch.
Conversation summaries lose detail — this file does not. Any agent (current or
future) picking up this work MUST read this file first.

The user is frustrated when context is lost mid-feature. **DO NOT improvise
defaults that contradict the decisions documented here.**

---

## 📋 THE 7-ITEM BATCH (user list from 2026-05-26)

### Session 1 — Small wins (IN PROGRESS)
- [ ] **#1** — Active-text color sweep: anywhere a button/chip/toggle/segment shows a "selected" state, the text must be ORANGE (`c.accent`), NOT BLACK. Solid-fill primary CTAs (SAVE, GENERATE, APPLY) can keep black text on orange. Targets: every `chipTextOn`/`chipTextActive`/`segmentedTextOn`/`tabTextActive`/`editChipTextOn`/`selected.color`/`color: "#000"` inside active styling across the codebase.
- [ ] **#4** — Edit-claim modal currently doesn't accept Repair Cost. Add a `REPAIR COST ($)` input to whichever modal/screen handles claim editing. Backend already supports `repair_cost` on `WarrantyClaim` and bidirectional sync with tool.repair_info.
- [ ] **#5** — Dealer detail "AGENTS" description card:
  - Row label "AGENTS" → **bold white**
  - Current agent: name **+ location** rendered in **orange**
  - Other agents: white, **NOT bold**
  - All agent names **indented right** ~12-16px so they read as children of the AGENTS row
- [ ] **#5a** — Dealer LIST screen:
  - Remove the small letter/envelope icon box on the left of each dealer row
  - Phone/text quick-action icons: if a CURRENT AGENT is set on the dealer → use the agent's phone, NOT the company. If no current agent → HIDE the phone/text icons entirely
- [ ] **#5b** — Dealer DETAIL screen: remove the duplicate EDIT button that sits UNDER the Phone + Text buttons. The header already has an Edit pencil. (The under-buttons-edit one is redundant.)
- [ ] **#6** — Home Customize settings: add a toggle to show/hide the "next dealer-route reminder" banner at the top of the home screen.

### Session 2 — Borrowed-tool overdue notifications (#3) ✅ DONE
- [x] New profile/settings field: `borrow_reminders_enabled` (bool) + `borrow_reminder_hours` (number; defaults to 24h per user spec)
  - Period choices in modal: 12h, 1d, 2d, 3d, 4d, 5d, 6d, 1w, 2w, 3w, 1m, Custom days
- [x] `src/borrowReminders.ts` module created — schedules/cancels local notifications, 5 stacked occurrences per tool
- [x] On `POST /api/tools/{id}/checkout` → frontend (`tool/[id].tsx`) schedules reminder if user has enabled
- [x] On `POST /api/tools/{id}/checkin` → frontend cancels scheduled notifications for that tool
- [x] Reminder body: "[Tool Name] is still checked out to [Borrower]. Tap to follow up."
- [x] Notification deep-link: tap → opens `/tool/{id}` (handled by data.url)
- [x] In-app TEXT REMINDER + CALL quick-action buttons added to the checked-out card on tool detail (visible when borrower_phone is on file). TEXT uses the EXACT user-approved template via `composeBorrowSmsBody()`
- [x] Backend: `CheckoutRecord.borrower_phone` field added; `CheckoutRequest.borrower_phone` accepted; auto-resolved from `borrowers` collection when borrower_id is sent. Verified via curl: tool checkout returns `current_checkout.borrower_phone` populated.
- [x] **#3a** Settings: "Send test notification" row now appears whenever EITHER `dealer_notifications_enabled` OR `borrow_reminders_enabled` is on (was previously gated to dealer-only). Both notification types share the same test button.
- [x] Reminder-period picker modal added with all 11 presets + Custom days input

### Session 3 — In-app PDF preview screen (#2) ✅ DONE
- [x] Created `app/pdf-viewer.tsx` — new screen with WebView (native) / iframe (web) embed of the PDF, header SHARE button, and persistent SHARE/SAVE button at the bottom as a backup affordance.
- [x] Registered route in `app/_layout.tsx` (header shown, slide-from-right animation, card presentation).
- [x] Updated `src/reportRunner.ts` runReportNative: for `action == "view"` + PDF mime → navigate to `/pdf-viewer` instead of share sheet. `action == "save"` / "email" / CSV view still uses the share sheet (the user might not have asked for those).
- [x] Updated `src/printHtml.native.ts`: tool detail PDFs (spec sheet, for-sale flyer, receipt PDFs) now also route through the preview screen before the share sheet.
- [x] Web report flow unchanged — anchor-download already provides preview-then-save via browser tab.
- [x] CSV/XLSX exports still share immediately (binary text, no visual preview value).
- NOTE: Native interactive notification buttons (TEXT/CALL directly inside the iOS banner) were intentionally not implemented — the tap-deep-link → on-screen-buttons pattern is more reliable.

### Session 4 — Tool-edit screen → 25+ accordions (#7)
- [ ] Full rewrite of `app/tool/edit.tsx` (~2,400 lines currently).
- [ ] Every input field becomes its own COLLAPSED row by default. Tap row → expands inline to reveal input(s).
- [ ] **CRITICAL ORDER**: Model Number(s) is the **FIRST** row (above everything else, even Name). User plans to add an AI-powered model lookup feature next that will auto-fill the rest of the form from the model #, so Model # must come first.
- [ ] Suggested row order:
  1. **Model Number(s)** ← FIRST
  2. Photos
  3. Name
  4. Brand
  5. Cost
  6. MSRP (optional)
  7. Quantity
  8. Purchase Date
  9. Condition
  10. Serial Number(s)
  11. Description / Notes
  12. Category
  13. Tags
  14. Location
  15. Dealer
  16. Purchased Agent
  17. Pending Dealer Charge
  18. Consumable (toggle group)
  19. Needs Repair (toggle group)
  20. Warranty (toggle group)
  21. Documents
  22. Receipts
  23. (anything else like is_consumable subfields under the toggle row)
- [ ] Each accordion row shows: label + a SUMMARY value (e.g., "MODEL #(S): DCD777, MAX-15") + chevron. Tapping expands.
- [ ] Preserve all existing functionality: AI receipt scan, multi-item parsing, photo capture, set-mode behavior, etc.

---

## 🧰 KEY FILES BY ITEM

| Item | File(s) |
|---|---|
| #1 | search whole `frontend/app/` + `frontend/src/` for `color: "#000"` inside active styles; `chipTextOn`, `chipTextActive`, `editChipTextOn`, `segmentedTextOn`, `tabTextActive`, `selected` patterns |
| #4 | `app/claim/[id].tsx` — edit modal lives here. May also need `app/dealer-claims/[id].tsx` |
| #5, #5a | `app/(tabs)/dealers.tsx` (list), `app/dealer/[id].tsx` (detail) |
| #5b | `app/dealer/[id].tsx` |
| #6 | `app/(tabs)/more.tsx` (customize section) and `app/(tabs)/index.tsx` (where banner renders). Setting key: `home.show_dealer_route_reminder` |
| #3 | `app/(tabs)/more.tsx` (notification settings), `src/notifications.ts` (probably create new), `app/tool/[id].tsx` (checkout/checkin to fire reminder schedule), `app/(tabs)/index.tsx` (overdue banner) |
| #2 | `app/pdf-viewer.tsx` (NEW), `app/(tabs)/reports.tsx`, `app/tool/[id].tsx`, `src/printHtml.*.ts`, `src/reportRunner.ts` |
| #7 | `app/tool/edit.tsx` |

---

## 🛑 IMPORTANT CONTEXT (don't lose this)

1. **Backend split**: Edits to `/app/backend/` only apply to PREVIEW automatically. For production, user must click "Deploy changes" in Emergent dashboard, then we hit production at `https://asset-locator-12.emergent.host`. Production admin login: `MechanicLTZ@gmail.com` / `Mechanic2026!`. Preview admin: `MechanicLTZ@gmail.com` / `Blue321!`.

2. **Vocabulary**: "Description Cards" = unified warranty-style bordered cards. Used throughout the UI.

3. **Active-button styling rule** (per user, repeatedly stated): ACTIVE/SELECTED toggle buttons → transparent bg + 2px orange border (`c.accent`) + orange text. NOT solid fill with black text. Primary CTAs (SAVE, GENERATE) are different — they can keep solid orange + black text.

4. **Apple compliance**: Don't make app icons fully transparent. Keep `adaptive-icon.png` and `splash-icon.png` on opaque dark bg.

5. **User has explicitly asked NOT to be over-prompted with questions.** Make smart defaults and execute. Ask only on genuine ambiguity.

6. **Multi-value fields** already done: `model_numbers[]` and `serial_numbers[]` on Tool. Display as stacked list. Empty rows show "—" (not hidden).

7. **MSRP** done: `msrp_price` field on Tool. Included as toggleable money column in Insurance/Inventory/LostStolen/YearEnd reports. NOT in Sales or Claims reports (per user choice).

8. **Repair Cost** done: `repair_cost` on RepairInfo + WarrantyClaim, bidirectional sync. Repair Cost Report + Year End Report both exist with TOTAL rows. Year picker is data-driven.

---

## 🧪 TESTING PROTOCOL (don't deviate)

- After backend changes: run `deep_testing_backend_v2`. Use creds from `/app/memory/test_credentials.md`.
- After frontend changes: ASK USER first ("Want me to run frontend testing agent?"). Never run frontend tests without explicit permission.
- Frontend testing agent has trouble logging in via Playwright fill() on RN-Web. **Workaround**: seed JWT via `localStorage.setItem('tt.auth.token', '<token>')` in `addInitScript`. Token must be fresh (90-day expiry from creation).
- Always update `/app/test_result.md` per the testing protocol section before invoking testing agent.

---

## ✅ SESSION 1 PROGRESS CHECKLIST (current session)

Update this in-place as items complete:

- [x] #1 color sweep complete (inventory chips, dealers chips, dealer/[id] editChip, reports segmented + crumb + checkmark, login tabs, wishlist mail icon, Pickers chip, PaymentModal seg, MaintenanceSection chip, for-sale chip — all switched from black-on-orange to orange-on-transparent + orange border)
- [x] #4 claim modal has repair cost input (added to tool/[id].tsx repair modal, both UI input and save payload)
- [x] #5 agents card restyled (bold-white AGENTS header, orange current agent name+location, indented agent rows)
- [x] #5a dealer list cleaned up (removed left avatar/initials box; phone/text icons only when current agent set; uses agent's phone)
- [x] #5b duplicate edit btn removed (agent EDIT button removed from agentActions row — note: editing an agent now requires using the dealer-level edit pencil; user may want to revisit)
- [x] #6 home customize toggle added (`show_dealer_route_reminder` pref; toggle in More → Customize section; banner respects pref on home tab)

When Session 1 is done, prompt user: "Ready to move to Session 2 (notifications)?"
