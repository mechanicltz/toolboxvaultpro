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
  **BUMP IT +1 on EVERY frontend change** (Expo Go caches aggressively). Currently **BUILD 222**.
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

### CLAIM CARD — INSET SUB-CARD FULLY REMOVED + INVENTORY EDIT SCREEN SKIN (user 2026-06-09) — DONE (BUILD 257) ✅ verified @414px
- [x] Claim card: the transparent-style override on `claimCard` wasn't dropping the panel (web boxShadow / opaque bg persisted). FIX: in industrial, render the claim rows+buttons inside a Fragment directly (no inset `View` at all) via IIFE — `isIndustrial ? claimBody : <View claimCard>{claimBody}</View>`. Sub-card shadow-box gone; content sits on metal frame.
- [x] `app/tool/edit.tsx` Iron Forge skin: added useSkin→isIndustrial, ImageBackground(SKIN.bg)+veil wrap, transparent container. New `FormCard` adapter wraps the 5 form sections in `TbvFrame` SKIN.window (padX 34/14/16) in industrial; plain keeps flat `detailsBox`. Converted via replace_all on the 4 identical `</View>\n\n<View detailsBox>` transitions + block1 open + block5 close. Verified: accordion rows + NAME input inside rails, SAVE button skinned.

### OUT-OF-BOUNDS FIX — TbvFrame content under side rails (user 2026-06-09, on-device) — DONE (BUILD 255) ✅ verified @414px
- ROOT CAUSE: window-frame side rails render ~38pt wide (CAP.window left/right=38), but padX was 16–20 → full-bleed content (claim buttons, history text rows, NOTES boxes) bled UNDER the rails on real phones. Desktop-width screenshots hid it (rails tiny vs wide column).
- FIX (padX must be ≥ rail width): claim `CardShell` padX 20→40 (top/bot 30/32); detail `GroupCard` padX 30→36; `checkout-history` padX 18→40; `claims-history` padX 16→38 (top/bot 28/30). Verified at 414px viewport — all content inside rails.
- ⚠️ RULE FOR FUTURE SKINNING: TbvFrame(SKIN.window) needs padX≥36, padTop≥30, padBottom≥32 for any full-width content. ALWAYS screenshot-test at phone width (≤414px), not desktop.

### CLAIM CARD — DROP INSET SHADOW-BOX IN SKINNED THEMES (user 2026-06-09) — DONE (BUILD 254) ✅ screenshot-verified IronForge
- [x] The claim card's inner `claimCard` inset (bg + border + elevation shadow behind the data rows + EMAIL/TEXT/EDIT CLAIM/MARK FIXED buttons) now uses `claimCardSkin` override (transparent bg, no border, no shadow/elevation) when `isIndustrial`, so content sits directly on the CardShell metal frame. Plain Light/Dark unchanged.

### CHECKOUT-HISTORY + CLAIMS-HISTORY PAGES IRON FORGE SKIN (user 2026-06-09) — DONE (BUILD 253) ✅ screenshot-verified IronForge
- [x] `app/checkout-history/[id].tsx` + `app/claims-history/[id].tsx`: added `useSkin`→isIndustrial, wrapped each in ImageBackground(SKIN.bg)+veil (transparent container), converted the list cards to metal `TbvFrame` (SKIN.window) wrapped in TouchableOpacity (cards are tappable → borrower/claim). Plain Light/Dark keep original ShadowBox/View cards. Verified claims card (metal frame w/ OPEN badge + NOTES) + checkout empty-state on metal.
- Pattern reused from detail page (body var + `if (isIndustrial) return <ImageBackground>…`).

### DETAIL PAGE — ACTION BTN ONE-LINE + CLAIM CARD SKIN (user 2026-06-09) — DONE (BUILD 251) ✅ screenshot-verified IronForge+Arctic
- [x] Bottom ACTION tiles: icon + label now on ONE LINE (actionTileSkin + plain actionTile → flexDirection row, gap 8). Steel button art unchanged.
- [x] CLAIM INFORMATION card ("marked broken" section, `claimBox`) was a flat grey card → now wrapped in metal window frame via new `CardShell` adapter (industrial → TbvFrame SKIN.window; plain → original View). Inner EMAIL/TEXT/EDIT CLAIM/MARK FIXED stay as semantic colour CTAs inside the inset panel.
- NOTE: `CardShell` is reusable — checked-out & sale info cards could get the same frame later if the user wants.

### DETAIL PAGE BOTTOM ACTION BUTTONS SKINNED (user 2026-06-09) — DONE (BUILD 250) ✅ screenshot-verified
- [x] Bottom ACTION grid tiles (CHECK OUT/IN, MARK FIXED/BROKEN, EXPORT, LIST FOR SALE / EDIT LISTING / MARK SOLD) were flat dark ShadowBoxMini. Added `ActionTile` adapter: in industrial renders the skinned steel button art (`SKIN.btnSecondary` ImageBackground, auto-recolors per theme) at a FIXED 64px height (ImageBackground reserves intrinsic image height if height isn't fixed → must pin height); keeps the semantic icon colour (green=fixed, red=broken, pink=sale). Plain Light/Dark keep ShadowBoxMini. Verified Crimson.
- [x] REPORT LOST/STOLEN left as its deliberate red-outline danger button (reads fine on metal).

### DETAIL PAGE FIT FIXES (user 2026-06-09, on-device Crimson) — DONE (BUILD 247) ✅ screenshot-verified
- [x] **Rows overflowing the frame rails**: GroupCard padding was too small (padTop 8 / padBottom 10) so first/last rows (LOCATION…BRAND) sat under the window-frame top/bottom metal rails. Bumped to padX 30 / padTop 30 / padBottom 32 — rows now sit cleanly inside the window. Verified.
- [x] **Photo + STATUS/QTY/PRICE in ONE container** (user asked about `tbv_card_dealer_dark`): tried that asset — it's a FIXED-LAYOUT decorative card (baked photo slot + 4 row slots, RGB no-alpha) that balloons on wide layouts and didn't render/scale cleanly as a live container. Pivoted to the stretchable `SKIN.window` metal frame: photo (96×96) on the left + 3 PillRows on the right, all inside ONE window frame. Same one-container result, reliable. Verified.
- NOTE: `SKIN.cardDealer` is still defined but unused. If the user really wants that exact art, it'd need to be rebuilt as a 9-slice/stretchable frame (or content absolutely-positioned to its baked slots at a fixed aspect).

### INVENTORY DETAIL PAGE (app/tool/[id].tsx) IRON FORGE SKIN — DONE (BUILD 245) ✅ screenshot-verified industrial + plain
- [x] Was unskinned in industrial: stack-scene WHITE bands showed behind the banner + ACTIONS area, cards were flat. Now dual-renders like inventory/dashboard.
- [x] Added `useSkin()` → `isIndustrial`. Wrapped the whole screen in `<ImageBackground source={SKIN.bg}>` + 60% veil (container goes transparent) so metal covers the page edge-to-edge and the white scene bg is never visible.
- [x] Adapter components `StatCard` + `GroupCard`: in industrial they render real `TbvFrame` metal frames (`SKIN.window`/`CAP.window`) — covers the STATUS/QTY/PRICE stat card AND all 6 grouped detail boxes (primary/attachments/services/classify/description/history). In plain Light/Dark they fall back to the exact ShadowBox look (untouched, verified).
- [x] Left semantic cards (claim/checkout/sale) and the bottom ACTION tiles (ShadowBoxMini, need onPress) as dark cards — they read cleanly on the metal. Nested attachment sub-cards (collapsed) also left as ShadowBoxSubCard.
- NOTE for next pass (optional polish): metal-frame the bottom ACTION tiles (wrap TbvFrame in a TouchableOpacity since TbvFrame is visual-only) + the claim/checkout/sale cards if the user wants 100% framed.

### CRIMSON HUE CORRECTION (user request 2026-06-09) — DONE (BUILD 244) ✅ screenshot-verified
- [x] **Crimson nameplate + pink report badge were too RED (~346–349°)** vs the native crimson accent `#FF1A6B` (338.8°). Re-rotated BOTH from their orange bases with `recolor_theme.recolor_file()` to land the accent at ~338°: nameplate delta 314.4° (from base 24.4°), badge delta 312.4° (from base 26.4°). Verified medians: nameplate 338.2°, badge 338.9°. Now matches the DASHBOARD/tab pink. (Earlier -37° rotation overshot toward red.)

### REPORT-A-BUG BADGE SWAP + DASHBOARD TIP (user request 2026-06-09) — DONE (BUILD 243) ✅ screenshot-verified orange + emerald
- [x] **New "REPORT A BUG / REQUEST FEATURES" metal badge**: user-supplied art (transparent PNG). Trimmed to content (alpha>10 bbox + 6px pad), downscaled to 1200×415, saved as `assets/tbv/report-bug-badge.png` (orange base). Generated 3 hue-rotated variants with `scripts/recolor_theme.py`'s `recolor_file()` — pink (-37°), arctic (+167°), emerald (+127°) → `report-bug-badge-{pink,arctic,emerald}.png`. `ReportBugBadge.tsx` now reads `useSkin().industrialVariant` and picks the matching badge (plain Light/Dark force orange = base). ASPECT updated to 1200/415. Shows on Home (plain + industrial) AND Vault bottom — all follow the active colour theme. ✅ verified orange (Iron Forge) + green (Emerald) on device.
- [x] **Dashboard tip text**: "Customize ... under MORE → CUSTOMIZE" → "VAULT → CUSTOMIZE" (both plain + industrial home tips). The More tab is branded VAULT.

### NEW THEMES: ARCTIC (aqua) + EMERALD (Irish green) — DONE (BUILD 242) ✅ screenshot-verified both
- Generalized the crimson recolor into `frontend/scripts/recolor_theme.py` (walks a folder, applies any HSV hue rotation). Base orange accent ≈ 23°.
  - **Arctic** = +167° → accent hue ~190° (aqua). Accent `#1FC3E8`. Folder `assets/tbv-v2/trimmed-arctic/` (55 PNGs).
  - **Emerald** = +127° → accent hue ~150° (Irish green). Accent `#16C871`. Folder `assets/tbv-v2/trimmed-emerald/` (55 PNGs).
- Wiring (mirrors the pink path exactly):
  - `theme.ts`: `darkPaletteArctic`, `darkPaletteEmerald` (accent family only).
  - `skins.ts`: `SKIN_ARCTIC`, `SKIN_EMERALD` maps + `VARIANT_MAPS` + Proxy now keys off `VARIANT_MAPS[_variant]`; `IndustrialVariant` extended; `SKIN_LIST` includes all 4; added `VARIANT_ACCENT` map.
  - `themeContext.tsx`: `IndustrialVariant` + `AppearanceOption` extended (`industrial-arctic`/`industrial-emerald`); `VARIANT_PALETTE` map; `effectivePalette`, hydration parse, `setAppearance`, `appearance` derivation all handle the 2 new variants.
  - `more.tsx`: Theme accordion now lists Arctic (snow icon) + Emerald (leaf icon).
  - Locked login/forgot + `TbvHeader` now use `VARIANT_ACCENT[...]` (was hardcoded pink-vs-orange) so those screens tint correctly for all 4 colors.
- **To add more colors later**: run `recolor_theme.py trimmed trimmed-<name> <delta>`, copy a SKIN_* map + palette + VARIANT_* entries + 1 picker row. ~10 min, no design work.



### CRIMSON HEADER + FLOATING ADD BUTTONS (user request 2026-06-08) — DONE (BUILD 239)
- [x] **Crimson header = new design**: Crimson theme was still using the OLD nameplate art. Crimson assets are produced from Iron Forge by a Pillow hue-rotation. Reverse-engineered the exact transform from the orange/pink plate-frame pair = **uniform -37° HSV hue rotation** (preserves S/V/alpha; metal greys stay neutral; ~1/255 error). Created reusable `frontend/scripts/recolor_crimson.py` and regenerated `assets/tbv-v2/trimmed-pink/Branding/tbv_master_nameplate.png` from the NEW orange nameplate (old backed up as `*.OLD.png`). New crimson nameplate: 1100×275 (matches orange), accent hue 345.7° (matches theme). `SKIN_PINK.nameplate` already wired → IndustrialBanner shows it on ALL pages automatically when crimson variant active. Verified at code/asset level (web harness can't drive the theme switcher). USER to confirm on-device in Crimson.
- [x] **Floating + FAB on Dealers / Contacts / Claims / For Sale**: created shared `src/components/AddFab.tsx` (round accent + button, real BLACK drop shadow so it "floats" — the theme `elevation.accent` was an orange glow that vanished on dark bg). Added to all 4 pages; removed the old header/Add buttons (ADD DEALER, ADD CONTACT, NEW CLAIM, ADD ITEM) + now-unused PillButton imports. Also upgraded the existing Inventory + Wishlist FABs to the same drop shadow. ✅ verified: all 4 FABs present, all old buttons gone (DOM + screenshot).
  - NOTE: `themedStyles(...)` returns a styles OBJECT (used at module scope), NOT a hook — first AddFab attempt used a `useStyles()` hook and crashed; fixed.



### IRON FORGE INVENTORY SKIN — IN PROGRESS (staged; user approved staging + keep current card layout on metal frame)
- [x] **Stage 1** (BUILD 224): `app/(tabs)/inventory.tsx` now dual-renders like the dashboard. When `skin==="industrial"` it wraps in `<ImageBackground source={SKIN.bg}>` + dark veil, makes the SafeAreaView transparent, frames the search bar with `SKIN.plate`/`CAP.plate` (TbvFrame), skins the FAB with `SKIN.fab` (octagonal orb + dark "+"), and accents the select-mode button. Plain light/dark themes UNCHANGED (flat canvas fallback). No functional changes. ✅ verified by screenshot — pending USER OK.
- [x] **Stage 2** (BUILD 233): item cards now dual-render. Industrial wraps the existing row content (thumb, title/sub, tags, qty badge, lost badge, IN/OUT/REPAIR status, select-mode checkbox) in a `TbvFrame source={SKIN.plate} capInsets={CAP.plate}` (same thin wide frame as the search bar) inside a TouchableOpacity (preserves onPress/onLongPress/select). Plain themes keep the ShadowBox + LinearGradient card. NOTE: tried `SKIN.card` first — its 60px corner brackets overlapped content & looked like a thin pipe; `SKIN.plate` is the correct wide-short proportion. ✅ verified by screenshot — pending USER OK.
- [x] **Stage 3** (BUILD 235): Filter accordion + pickers framed. Added a module-level `FilterAccordionWrap` that renders `TbvFrame source={SKIN.plate}` in industrial mode (matches search bar/cards) and the plain `ShadowBox` otherwise. The 5 picker buttons (status/location/tag/sort/category) get `locationFilterBtnSkin` (dark metal bg + orange-tinted border) in industrial. Plain themes unchanged. ✅ verified by screenshot (collapsed + expanded) — pending USER OK.

**IRON FORGE INVENTORY SKIN — ALL 3 STAGES COMPLETE (BUILD 236). Plain Light/Dark fully preserved; no functional changes.**
- Tweak (BUILD 240): removed the metal plate panel around the search-bar select button and swapped the `checkmark-done` icon → `create-outline` (edit/pencil) icon. In industrial it's now a bare borderless icon (`selectHeaderBtnBare`); removed the unused `selectFrameInner` style. ✅ screenshot-verified.
- Fix (BUILD 236): filter panel was 32px too wide — `TbvFrame`'s wrap is `width:100%`, so margin placed directly on it overflows the parent by marginX*2. Moved margin to an outer `filterAccordionSkinWrap` View (matches the card pattern). Filter now aligns with search bar + cards.


> Design system: reuse `src/components/ShadowBox.tsx` (the bordered "Description Card"
> look used on the home dashboard). "Mini cards" = the small stat tiles. Match existing
> patterns; later we'll build a centralized button/UI kit (user chose to defer = "B").

### A. SHADOWBOX RESTYLE PASS — ✅ ALL DONE (BUILDS 207–218)
- [x] **ITEM DESCRIPTION page bottom buttons** (`app/tool/[id].tsx`) → ShadowBoxMini. DONE.
- [x] **MAINTENANCE screen** (`app/maintenance.tsx`): rows → ShadowBox; top tiles → ShadowBoxMini; left status stripes removed. DONE.
- [x] **FOR SALE page** (`app/for-sale.tsx`): tabs/search/stats/cards → ShadowBox; active tab keeps dark bg + accent text; Asking Total tile de-tinted. DONE.
- [x] **WISHLIST page** (`app/wishlist.tsx`): cards → ShadowBox; top 4 tiles → ShadowBoxMini; tabs → ShadowBox buttons; edit/share/delete moved to top-right icon toolbar; Convert/Purchased now bottom buttons. DONE.
- [x] **DEALER DETAIL restructure** (`app/dealer/[id].tsx`): TOTAL PURCHASED own ShadowBox; AGENTS titled ShadowBox w/ sub-cards (current pinned ★ orange, rest alpha by first name); ACCOUNTS sub-cards inside a recessed ShadowBox (green stripe removed, padding fixed); agent toolbar (call/text/share + edit/delete) on top row. Account actions consolidated to **Adjust** + **Schedule** buttons. DONE.
- [x] **CHECKOUT HISTORY** (`app/checkout-history/[id].tsx`) rows → ShadowBox. DONE.
- [x] **REPORTS HUB + IMPORT/EXPORT** format buttons (PDF/CSV, CSV/XLSX) → ShadowBox on all forms; reports type/format cards de-chromed. DONE.
- [x] **PDF VIEWER black-frame bug** (`app/pdf-viewer.tsx`): was snapshotting theme colors via StyleSheet.create → converted to themedStyles (frame now follows active theme). DONE.
- [x] **HEADER VERSION**: centered on its plate, bigger, "v" removed (now `2.1.1`). DONE.

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

---

## ✅ DONE (2026-06-09, BUILD 258) — Vault menu skinned
- **VAULT (`app/(tabs)/more.tsx`) fully skinned.** `SectionCard` now renders inside a metal `TbvFrame` (SKIN.window / CAP.window, padX=30 padTop/Bottom=22) for industrial themes, flat bordered `sectionCard` View for plain Light/Dark. Covers RESOURCES, ORGANIZATION, DATA MANAGEMENT, SETTINGS, ACCOUNT.
- **Notifications section (`src/sections/NotificationsSettingsSection.tsx`)** wrapped in the same `TbvFrame` via a `Shell` component (industrial vs plain).
- **Nested grey "box-in-box" removed in metal themes:** theme-picker group (`optGroupFlat`) and the 3 notification sub-groups (`notifGroupFlat`) are flattened (transparent bg, no border/shadow) so options sit directly on the metal frame.
- Detection via `useSkin().skin === "industrial"` (covers all 4 colour variants).
- Verified visually (orange/Iron Forge) — all 6 sections render in metal frames, content within rails, theme accordion options sit on the frame cleanly.
