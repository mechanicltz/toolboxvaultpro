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

### Session 2 — Borrowed-tool overdue notifications (#3)
- [ ] New profile/settings field: `borrow_reminder_period` (stored as DURATION_HOURS integer; nullable = off)
  - **Default for new users: 24 hours (1 day)**
  - **Choices: 12 hours, 1 day, 2 days, 3 days, 4 days, 5 days, 6 days, 1 week, 2 weeks, 3 weeks, 1 month, Custom (number of days)**
  - Custom path stores raw hours; UI picks days × 24
- [ ] On `POST /api/tools/{id}/checkout` → frontend schedules a local `expo-notifications` reminder for `now + borrow_reminder_period`. Repeat every period until checkin.
- [ ] On `POST /api/tools/{id}/checkin` → cancel scheduled notification for that tool.
- [ ] Notification body: `"Tool [NAME] is still checked out to [BORROWER] — please follow up."`
- [ ] Notification actions:
  - **TEXT** → opens SMS deep link with EXACT template (DO NOT REWORD):
    > `Hey [Borrower Name] — just a friendly reminder you still have my [Tool Name]. Let me know when it's coming back, Thanks`
  - **CALL** → `tel:` deep link to borrower phone
- [ ] Works even when app is closed/force-quit (local notifications survive on iOS up to 64 scheduled).
- [ ] **#3a** — Settings/Notifications screen:
  - "Send test notification" button appears ONLY if ANY notification toggle is enabled
  - Reminder-time picker is SHARED across all notification types (warranty expiry, maintenance, borrow reminder) — one setting drives all of them

### Session 3 — In-app PDF preview screen (#2)
- [ ] When user taps "Generate PDF" or "View Report" in a report wizard (or anywhere PDFs are produced — tool spec, for-sale flyer, etc.), instead of immediately invoking the iOS share sheet:
  - Navigate to a new `app/pdf-viewer.tsx` screen
  - Show the PDF inline (use `expo-print`'s `printToFileAsync` + an in-app PDF viewer; on web fall back to `<iframe>`. For native use `react-native-pdf` if needed, OR open the file:// URI in a WebView)
  - Top-right header: **Share** icon → opens the share sheet (current behavior)
  - Top-left header: Back chevron (does not auto-share, just closes)
- [ ] Same flow for CSV/XLSX? — user did NOT specify; assume PDF only unless asked. CSV/XLSX still share immediately.
- [ ] Audit ALL places that currently auto-share PDFs: `reports.tsx` (report wizard), `tool/[id].tsx` (spec sheet + for-sale flyer + receipt PDFs), `reportRunner.ts`, `printHtml*.ts`.

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
