# Toolbox Vault — Login/Auth Screen Build Notes & Hard-Won Lessons

These are the COMPLETE, APPROVED, LOCKED screens: `login.tsx`, register mode
(create account), and `forgot-password.tsx`. Do NOT redesign them. Use the
patterns below as the head-start for every other screen.

## How the auth screens are built
- Built ENTIRELY from PNG image skins via `<ImageBackground resizeMode="stretch">`.
- Skin map + tokens live in `src/tbv/skins.ts` (SKIN, TBV palette, AR ratios).
- Reusable header: `src/tbv/TbvHeader.tsx` (back chevron + steel title).
- Skin preloader: `src/tbv/useTbvSkins.ts` (`preloadTbvSkins`, `useTbvSkinsReady`).
- Fonts: `@expo-google-fonts/bebas-neue`, `rajdhani`, `exo-2`.
  - BebasNeue_400Regular (headers/labels), Rajdhani_500/600/700 (body/values),
    Exo2_400/500/700 (small print).
- Palette used by login (LOCKED): ink #0A0A0A, steel #E8E8E8, orange #FF8533,
  text #F2F2F2, muted #C8C8C8.
  NOTE: New master directive specifies accent #FF6A00 + a separate light theme.
  This is a DISCREPANCY to resolve with the user before standardizing.

## Critical issues we hit & how we fixed them (reuse these!)

### 1. iOS native panel overflow (absolute image shrinks)
Symptom: panel art rendered too small / overflowed only on native iOS, fine on web.
Root cause: an absolutely-positioned `<Image>` with width/height `100%` inside a
PADDED `<View>` resolves the `100%` against the CONTENT box (padding excluded) on
iOS, but against the PADDING box on RN-web — so iOS shrank the image.
Fix pattern: outer panel View is UNPADDED; put padding on an INNER wrapper; size
the skin image with EXACT NUMERIC bounds (panelW, panelH), never `100%`.

### 2. Font-gate is mandatory
Symptom: on iPhone the tagline wrapped and labels/tabs mis-sized vs web.
Root cause: layout ran with system font (San Francisco) before the condensed
industrial fonts loaded — SF metrics are wider/taller.
Fix: gate first paint until `fontsLoaded || fontError`.

### 3. Cold-boot black-screen then image pop-in
Symptom: on fresh start the screen was black except inputs, then skins faded in.
Root cause: PNG skins not decoded yet; containers paint before bitmaps decode.
Fix: `expo-asset` preload of ALL skins (`preloadTbvSkins`), warmed during the
boot intro via `InteractionManager.runAfterInteractions` (so the intro VIDEO
starts first), and gate screens on `useTbvSkinsReady()`.

### 4. Button flicker while typing
Symptom: orange button flashed dark on every keystroke.
Root cause: `PrimaryButton` was defined INSIDE the screen component, so each
render created a new component type → `<ImageBackground>` remounted → PNG reloaded.
Fix: define such components at MODULE scope (stable identity).

### 5. STALE METRO BUNDLE (recurring!)
Symptom: edits don't appear; web preview shows old UI (e.g. old header).
Fix: after large edits to a screen, `sudo supervisorctl restart expo` and wait
for a fresh bundle before screenshotting. This has recurred multiple times.

## Layout/responsive rules that worked
- Cap working width: WORK_W = min(availableWidth, ~430) so web preview mirrors phone.
- Inputs/buttons/tabs all span the same `contentW` (= panelW - padX*2) for aligned edges.
- Field icon insets via `inputInner.paddingHorizontal` (22 felt right inside the skin).
- Panel height is CONTENT-DRIVEN (measure via onLayout), not fixed.
