# 🚧 ACTIVE PUNCH LIST — Toolbox Vault (CURRENT SOURCE OF TRUTH)

**LAST UPDATED:** 2026-06-07
**App name:** Toolbox Vault (Expo Router + FastAPI + MongoDB)
**Live store version:** v2.1.1 (real users on installed builds)

> ⚠️ READ THIS FIRST. Conversation handoffs LOSE detail and the user is (rightly)
> furious about it. This file is the authoritative spec. DO NOT improvise defaults
> that contradict anything here. ALWAYS verify the handoff against THIS file + the
> actual code before trusting any auto-generated summary.

---

## 🔑 CREDENTIALS / ENV RULES
- Preview/login test account: **MechanicLTZ@gmail.com / Blue321!**
- Build indicator: `const HOME_BUILD = "BUILD NNN";` in `/app/frontend/app/(tabs)/index.tsx`.
  **BUMP IT +1 on EVERY frontend change** (Expo Go caches aggressively). Currently **BUILD 208**.
- After ANY frontend change run `sudo supervisorctl restart expo` (Metro watch is flaky).
- Intro video is **INTENTIONALLY DISABLED**: `INTRO_ENABLED = false` in `app/_layout.tsx`. LEAVE OFF until the user says otherwise (confirmed 2026-06-07).
- Do NOT touch `.env` proxy vars (EXPO_PACKAGER_*), metro.config.js.

---

## ✅ ALREADY DONE THIS SESSION (2026-06-07) — verified
1. **Header nameplate halo / white border** — FIXED. The PNG `assets/tbv-v2/trimmed/Branding/tbv_master_nameplate.png` (+ trimmed-pink variant) had a baked grey outer glow AND a light metallic outer rim (~9px deep on the bottom). Fix script: hard-thresholded alpha (kill semi-transparent glow) + **feathered the outer edge to dark via a brightness-ceiling ramp** (padded erosion so bottom-flush pixels count as edge). Backup at `*_nameplate.bak.png`. Confirmed good by user.
2. **Version number** on header raised: `IndustrialBanner.tsx` version `bottom: nameplateH * 0.12` (was 0.085 → 0.015 originally).
3. **#34** Inventory header title → `INVENTORY` (subtitle removed).
4. **Sort/date picker** on inventory shows **"Date"** by default (was "NEWEST FIRST").
5. **#28** Tool form: **Name, Price, Purchase Date now REQUIRED** (validation in `tool/edit.tsx` save()); purchase date defaults to today for new; Model Number(s) is NO LONGER required.
6. **#30** Numeric keyboards on price/phone fields (added phone-pad to dealer/agent phone in `dealer/[id].tsx`).
7. **#31** Personal Info: removed top-right banner EDIT pencil (only the lower "EDIT INFORMATION" button remains).
8. **#32** CENTRALIZED EMAIL: Personal Info email + Report-a-Bug email are now **read-only, locked to the account login email** (`useAuth().user.email`). Personal info save forces `email: user.email`.
9. **#33** CHANGE LOGIN EMAIL (option **B** = current-password + 6-digit code emailed to NEW address):
   - Backend (additive, mirrors forgot/reset password): `POST /api/auth/change-email/request` and `POST /api/auth/change-email/confirm` in `server.py`; `send_email_change_code()` in `email_sender.py`; collection `email_changes` (bcrypt-hashed code, 15-min TTL, 5-attempt cap, rate-limited). Confirm returns fresh JWT.
   - Frontend: `app/change-email.tsx` (2-step screen), api methods `requestEmailChange`/`confirmEmailChange`, entry points in `personal-info.tsx` (read + edit views).
10. **Add Item button readability** — made white text+icon (was black, unreadable on dark theme accents).
11. **New-tool form UX**: NAME accordion opens by default on a new item; removed the white header SAVE pill (bottom "CREATE TOOL" bar saves); added centered tip **"Tap each line to fill in details"** above the form box.
12. **Logout flicker** — FIXED (pending user device confirm). Cause: login Stack.Screen `animation:"fade"` exposed the near-black window bg (`#0A0A0A`) during the fade. Fix: login animation → `"none"` in `_layout.tsx`; added `fadeDuration={0}` to login's ImageBackgrounds.

Backend change-email tested by testing_agent (16/16 backend pass). All additive — **safe to deploy for live v2.1.1 users** (no existing endpoint changed/removed).

---

## 📋 CONFIRMED CURRENT BATCH (user list 2026-06-07) — user said "I confirm, ready to start"

> Design system: reuse `src/components/ShadowBox.tsx` (the bordered "Description Card"
> look used on the home dashboard). "Mini cards" = the small stat tiles. Match existing
> patterns; later we'll build a centralized button/UI kit (user chose to defer = "B").

### A. SHADOWBOX RESTYLE PASS
- [ ] **ITEM DESCRIPTION page bottom buttons** (`app/tool/[id].tsx`): the action buttons at the BOTTOM of an item's detail page should be **ShadowBox-style buttons** (raised/bordered card look, matching `ShadowBox`), not flat. (Added 2026-06-07.)
- [ ] **MAINTENANCE screen** (`app/maintenance.tsx`): restyle the list rows to ShadowBox layout; the little info cards at the top → ShadowBox **mini-card** design.
- [ ] **FOR SALE page** (`app/for-sale.tsx`): update to ShadowBox layout design.
- [ ] **WISHLIST page** (`app/wishlist.tsx`): update to ShadowBox layout; the **top 4 info cards** → ShadowBox mini-card layout.
- [ ] **DEALER DETAIL restructure** (`app/dealer/[id].tsx`):
  - "**TOTAL PURCHASED**" row becomes its OWN ShadowBox placed **right under the "Company Details" heading but ABOVE the Company Details ShadowBox**.
  - Then a ShadowBox titled **AGENTS**, containing one ShadowBox **sub-card per agent**.
    - **Current agent pinned to the TOP**, shown with a **★ star + ORANGE text**.
    - All OTHER agents listed **alphabetically by FIRST name**.
  - Then a ShadowBox titled (truck & credit) **ACCOUNTS**, with each account as a ShadowBox **sub-card**.
    - Q3 (account fields) was asked; default = surface whatever is already stored per account (name/number, type truck|credit, balance). Confirm against the dealer data model in code.

### B. FUNCTIONAL FIXES
- [x] **Inventory FAB** — DONE (BUILD 203). Removed full-width `addItemBtn`; added circular bottom-right FAB (`testID add-item-fab`, reused existing `fab` style made circular borderRadius:32) → `router.push("/tool/edit")`. Wishlist parity.
- [x] **LOST/STOLEN status** — DONE. Tool model has NO explicit `status` field (it's derived). Inventory row badge now shows **LOST/STOLEN (red, top priority)** when `lost_status.is_lost`; reverts to IN automatically on recover (backend `recover` already clears is_lost). No backend change needed.
- [x] **LOCATION change UX** (`app/tool/[id].tsx`): DONE (BUILD 204). Removed `<LocationPicker>` (which spawned the 2nd colorful PickerModal). The "MOVE TO LOCATION" modal now renders an **inline scrollable location list** (current highlighted orange w/ ✓, indented by depth, "No location" option to clear) — pick in place, no second popup. Uses `buildLocationTree`/`flattenLocationTree` from `src/locationTree`; locations loaded on modal open.

### C. FEATURE + COMPLIANCE (answered)
- [ ] **"UPCOMING FEATURES" list** (parked unless user says build now):
  - **Compliance answer (researched 2026-06-07):** ✅ ALLOWED on Apple AND Google. Server-driven **text content** (a changelog/feature list edited in the admin panel, stored in DB, fetched by all users) needs **no new build and no re-review**. Policy is behavior-based. The ONLY red line: don't use remote content to change app *behavior* (no external purchase links, no unlocking paid/digital features outside IAP, no materially changing the reviewed purpose). A plain "what we're working on" text list = safe (same as a remote FAQ/changelog).
  - If built: admin CRUD (add/edit/delete text entries) + a public GET endpoint + a Vault-list entry users can open. DB-backed, updates live without redeploy.

### OPEN CLARIFICATIONS (user said "confirm & start" without answering these 3; defaults chosen)
1. Build "Upcoming Features" now or later → **DEFAULT: later**, focus on A+B first (revisit with user).
2. Order → **DEFAULT: functional fixes (B) first** (quick, testable), then restyle pass (A).
3. Account sub-card fields → **DEFAULT: mirror existing stored fields**; confirm in code.

---

## 🧰 KEY FILES
- ShadowBox component: `src/components/ShadowBox.tsx`
- Maintenance: `app/maintenance.tsx` (+ `src/sections/MaintenanceSection.tsx`)
- For Sale: `app/for-sale.tsx`
- Wishlist: `app/wishlist.tsx` (this is the FAB reference)
- Dealer detail: `app/dealer/[id].tsx`
- Inventory: `app/(tabs)/inventory.tsx` (addItemBtn to remove; FAB to add)
- Tool detail (location popup, lost/stolen): `app/tool/[id].tsx`, `src/sections/LostStatusSection.tsx`
- Auth/email: `src/AuthContext.tsx`, `app/change-email.tsx`, `backend/server.py`, `backend/email_sender.py`

---

## 🧪 TESTING PROTOCOL
- Read `/app/test_result.md` before invoking testing_agent.
- Backend: use `testing_agent` with creds above. All backend so far passes.
- Frontend: ask the user before large frontend test runs; small UI verified by screenshot.
- Update `/app/memory/test_credentials.md` whenever creds change.

---

## 🚫 HARD RULES (carried over — still apply)
- DO NOT build ANY AI/LLM feature (OCR, GPT autofill, AI lookup) without an explicit per-call cost estimate AND written approval. AI Receipt Scan + Model# AI autofill were REMOVED for cost reasons — do not rebuild.
- Active/selected toggle styling = transparent bg + 2px orange border + orange text (NOT black-on-orange). Solid primary CTAs (SAVE/CREATE) keep black-on-orange — but watch theme contrast (this is why a centralized contrast-aware button kit is the deferred "B" task).
- Do NOT make app icons fully transparent (Apple compliance).
- User HATES being over-prompted. Make smart defaults, execute, ask only on genuine ambiguity.

## 📌 PARKED FOR LATER
- Google OAuth consent screen → "In production" (Drive token expires every 7 days in Testing mode). See `PLAN_active_work.md` for the full walkthrough.
- Centralized button/UI kit (contrast-aware PrimaryButton/SecondaryButton) — user deferred ("B"); do during the theme-skinning pass.
- Tablet responsiveness audit.
- Cleanup: dead `app/warranty-claims.tsx` route + unused AI assets.
