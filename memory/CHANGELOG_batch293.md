# CHANGELOG — Batch 293 (2026-06-18)

## Intro Video on/off toggle (Vault → Settings)

- `src/idle.ts`: added a persisted device preference `tbv_intro_video_enabled`
  (AsyncStorage, default ON) with in-memory cache + warm-on-import:
  - getIntroVideoEnabled() (sync), getIntroVideoEnabledAsync(), setIntroVideoEnabled().
  - shouldShowIntro() now returns false when the user disabled the intro.
- `app/_layout.tsx`: on mount, reads the pref and disables the cold-boot intro
  (setShowIntro(false)) when the user turned it off. The auth-loading window
  gives the async read time to resolve before the overlay would render.
- `app/(tabs)/more.tsx`: new "Intro Video — Play the splash video when the app
  starts" SectionRow with an AppSwitch (testID `toggle-intro-video`) as the last
  row of the SETTINGS card; local state loaded via getIntroVideoEnabledAsync,
  toggling calls setIntroVideoEnabled.
- Verified (ryan@ryan.com): toggle renders in SETTINGS and flips ON/OFF.

NOTE: A stale browser bundle initially hid the new row; resolved by restarting
expo. (Watch for transient `assets/images/textures` scandir noise in Metro logs
— pre-existing, non-fatal, unrelated.)
