# Insurance Claim DETAIL page — full build spec (user-authored)

Target file: `app/insurance-claims/[id].tsx` (rewrite). Backend: `backend/insurance_claims.py`.
Phase 1 (dashboard list) already DONE in `app/insurance-claims/index.tsx`.

## Goal
Make the claim detail a streamlined "assistant," Showroom-layout style. The top hero
area replaces the usual photo+side-rows with: Claim Name → Progress bar → 2-column
header facts → horizontal tab menu → ONE non-remounting skinned static panel.

## A. TASK LIST (every claim has one) — drives the progress bar
- Prepopulated with the general in-app steps a user must do to be ready to submit a
  report package to the insurer.
- User can ADD their own tasks (things the insurer asks for).
- Each task: text, optional **deadline date**. If deadline set → app sends a
  **notification reminder**. Add an on/off toggle in **Vault > Notifications**.
- Tasks can be checked complete / edited / deleted.
- "Tasks to Complete" link in the header opens the task list.
- A note can spawn a task (see Notes).

## B. PROGRESS BAR (top, under Claim Name)
- Clean custom version of the attached glossy pill progress bar with a "%" bubble
  pointer above the fill (theme-colored fill, dark track). Build in RN (no image).
- Tied to claim progress steps:
  ✓ Claim Created
  ✓ Insurance Company Added
  ✓ Claim Number Entered
  ✓ Inventory Attached
  ✓ Photos Added
  □ Generate Report
  □ Submit Claim
- Shows current % complete. (Progress = completed steps / 7, OR tie to task list
  completion — CONFIRM which drives the %. Likely the 7 fixed steps for the bar,
  task list is the actionable companion.)

## C. HEADER FACTS (2 columns, under the progress bar)
Claim Status · Date Opened · Date Submitted · Claim Amount · Deductible · Payout Amount ·
link "Tasks to Complete".

## D. HORIZONTAL TAB MENU + non-remounting static panel
Tabs (each with a COUNTER badge, e.g. "Evidence (3)", "Contacts (6)"):
Details · Financials · Contacts · Evidence · Documents · Notes · Claimed Items ·
Reports · Insurance Info · Timeline
- Panel is one skinned static panel; content swaps inside, panel never remounts.
- **Constant search bar at top of the panel.** Searches EVERY field in the claim:
  titles, descriptions, notes, contacts, claim #, serial #, model #, manufacturers,
  document labels, evidence labels, report names, timeline entries, inventory items.
  Results clickable → jump to that area.

## E. Floating + button (bottom-right, like other screens)
Opens localized popup: add new contact / note / evidence photo / document / etc.

## F. TAB CONTENTS
- **Details:** Claim number, incident type, incident date, incident address, claim
  description, police report #, police case #.
- **Financials:** Purchase Value, Replacement Value, Replacement Difference, Claim
  Amount, Approved Amount, Paid Amount, Outstanding Balance, Deductible, Sales Tax,
  Depreciation (optional), Recoverable Depreciation, Actual Cash Value, Replacement
  Cost Value, Net Expected Payment. (Several are COMPUTED — define formulas.)
- **Contacts:** address book for this claim (officers, adjusters, firefighters…).
  Fields incl. note + **Role**. Sorted alphabetically by first name with A–Z letter
  group headers (like the app's existing contacts list). Row shows name + role on
  right. 3-dot menu per contact: call, email, text, directions.
- **Evidence:** upload / take photos, saved here. Each: date + label + note. Sorted by
  date, label shown. Previewable in-app.
- **Documents:** upload docs (pdf, excel, email screenshots, photos…). Each: label +
  note + date. Sorted by date + label.
- **Notes:** add note with selectable label form (preset labels e.g. "insurance
  adjuster phone conversation", "police officer email", "just a note", or custom).
  Saved/displayed by date, newest on top. **"Create a task from note"** checkbox: e.g.
  note "adjuster wants a better photo by Friday" → creates a task due Friday, slotted
  into the task list by timeframe.
- **Claimed Items:** choose destroyed items being claimed. Select all or one at a time.
  Top of panel: Total # items listed + a **Warnings** button. Warnings = items missing
  serial OR model, missing price, missing purchase date. Warning list shows each item +
  its warning; tap → go edit that inventory item; on return the warning auto-clears if
  resolved. **Warnings update automatically on any inventory edit — never manual
  refresh.** Warnings are user-only, NEVER printed on reports.
- **Reports:** top options: Create a new report · History reports · Quick report.
  Below shows the chosen option's content. Every report generate/download/share/email
  auto-creates a Timeline entry. Reports NEVER overwrite — each generation is a new
  permanently-stored version in history.
- **Insurance Info:** the insurance company's info (existing InsuranceInfo model).
- **Timeline:** auditable, automatic, NOT editable/deletable. Each entry has an ICON
  for the action (Report Generated, Status Changed, Note Added, Document Uploaded,
  Evidence Added, Contact Added, Item Attached, etc.).

## BACKEND GAPS to build (in insurance_claims.py / models)
- `tasks[]`: {id, text, due_date?, done, done_at?, source ("default"|"user"|"note"),
  created_at}. Default-task seeding on claim create. CRUD endpoints + toggle.
- `contacts[]`: {id, name, role, phone, email, address, note, created_at} + CRUD.
- `documents[]`: separate from evidence: {id, label, note, file (base64/url), mime,
  date, created_at} + CRUD. (Evidence already exists.)
- Financials computed fields + formulas (define ACV, RCV, recoverable depreciation,
  outstanding balance = approved - paid, replacement difference = replacement -
  purchase, net expected payment, etc.).
- Progress steps computation endpoint/derived in payload.
- Report versioning: append-only report history (already has listReports — ensure new
  version each time, never overwrite) + timeline entry on each report action.
- Create-task-from-note support.
- Task deadline NOTIFICATIONS + Vault>Notifications toggle (local notifications via
  expo-notifications; confirm scheduling approach — Expo Go limits, needs dev build).
- Chunked upload for documents/evidence to bypass proxy limits.

## Open decisions to confirm before building
1. Progress % source: the 7 fixed steps, or task-list completion, or both?
2. Notifications: local device reminders (expo-notifications) — OK that they only fire
   on a real build/device, not Expo Go web?
3. Documents vs Evidence are separate collections — confirm.
4. Phase order (proposed): P2a backend (tasks/contacts/documents/financials/progress) →
   P2b detail shell (name+progress+header+tab bar+panel+search+FAB) → P2c tabs
   (Details/Financials/Insurance/Timeline) → P2d (Contacts/Notes+task-from-note/Tasks)
   → P2e (Evidence/Documents uploads) → P2f (Claimed Items + warnings) → P2g (Reports
   versioning) → P2h (notifications + Vault toggle).

## ✅ DECISIONS CONFIRMED BY USER (locked)
1. Progress %% = **BOTH**: the bar reflects the 7 fixed steps AND the task-list
   completion. Implementation note: keep the 7-step pipeline as the visible "Claim
   Progress" checklist driving the bar, AND factor task-list completion in. Suggested:
   show the 7-step bar prominently; blend task completion into the % (e.g. steps and
   tasks combined), or show two readouts — clarify exact blend at build time but the
   user wants both represented.
2. Notifications = **YES**, build with expo-notifications (local scheduled reminders on
   task deadlines) + on/off toggle in Vault → Notifications. Only fires on real
   build/device (not Expo Go/web) — user accepts this. Treat as an INTEGRATION → call
   integration_expert for expo-notifications scheduling best practices before building.
3. Documents vs Evidence = **SEPARATE** collections/sections. Evidence already exists;
   Documents is new.
4. Build order = **CONFIRMED** as proposed (P2a backend → P2b shell → tab waves →
   reports versioning → notifications).

