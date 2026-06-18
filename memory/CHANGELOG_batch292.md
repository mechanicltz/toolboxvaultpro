# CHANGELOG — Batch 292 (2026-06-18)

## New-account onboarding: 2nd "choose your theme" popup + icon/version fixes

### Two-step onboarding popups (NEW)
- `src/components/DemoBanner.tsx`:
  - The demo-data intro popup's primary "GOT IT — START EXPLORING" now chains
    into a SECOND one-time popup ("Make It Yours"): "Toolbox Vault offers 6
    different theme styles to suit your needs. Choose your desired theme to get
    started." Button: "CHOOSE MY THEME".
  - One-time gating via AsyncStorage key `tbv_theme_intro_seen`.
  - "CHOOSE MY THEME" navigates to `/(tabs)/more?openTheme=1`.
- `app/(tabs)/more.tsx` (Vault):
  - Reads `?openTheme=1` (useLocalSearchParams) → opens the Theme accordion
    (`setThemeOpen(true)`) and scrolls the SETTINGS card into view (ScrollView
    ref + onLayout marker).
- Verified e2e (fresh signup): demo popup → theme popup ("6 different theme
  styles") → Vault with Theme accordion open showing all 6 themes. PASS.

### Icon + version (this session)
- App icon: ALL app icons now use the bright-orange octagon master
  (`assets/branding/app_icon_master.png`) — icon.png, adaptive-icon.png,
  splash-icon.png, favicon.png. Transparent login logo (tbv_master_logo_*)
  untouched. See /app/memory/APP_ICON_RULE.md (hard rule).
  NOTE: Emergent build wizard has a server-side cached icon per deployment that
  the user must get cleared by support (the in-repo icon is correct).
- Version → 3.1.3, iOS buildNumber 28, Android versionCode 214.
- Added `ITSAppUsesNonExemptEncryption: false` to ios.infoPlist (skips the App
  Store export-compliance prompt on future builds).
- Removed on-screen build stamps from home + login (earlier this session).

### Reminder
- Build stamp removed, so no more HOME_BUILD bumping.
- User must "Save to GitHub" before EAS builds so these changes are included.
