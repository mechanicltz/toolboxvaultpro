# 🚨 HARD RULE — APP ICON / LOGO (DO NOT VIOLATE) 🚨

This is a non-negotiable directive from the app owner. Any agent working on this
project MUST follow it exactly. Read this BEFORE touching any image asset.

## THE ONE TRUE APP ICON
- Canonical master file: `frontend/assets/branding/app_icon_master.png`
  (bright-ORANGE-bordered octagon, crossed hammer + wrench, dark textured plate)
- Source artifact: "final app icon squared bright.png"
  https://customer-assets.emergentagent.com/job_8fd6e80c-913c-428b-a577-42b669f83fd4/artifacts/159ovxij_final%20app%20icon%20squared%20bright.png

## EVERY app icon / launcher / splash / favicon MUST be this image:
- `frontend/assets/images/icon.png`            (iOS + main app icon) — 1024x1024, RGB, NO alpha
- `frontend/assets/images/adaptive-icon.png`   (Android adaptive foreground) — 1024x1024
- `frontend/assets/images/splash-icon.png`     (splash screen) — 1024x1024
- `frontend/assets/images/favicon.png`         (web) — 256x256
If you ever need "the app icon" anywhere, it is THIS image. No exceptions.

## THE ONLY ALLOWED EXCEPTION — the transparent login logo
The login screen / in-app brand header uses a TRANSPARENT-background logo.
DO NOT replace these with the octagon icon. Leave them alone:
- `frontend/assets/tbv/tbv_master_logo_dark_v2.png`   (used via SKIN.masterLogo on login)
- `frontend/assets/tbv/tbv_master_logo_light.png`
- `frontend/assets/tbv-v2/trimmed/Branding/tbv_master_logo_dark_v2.png`
- `frontend/assets/tbv-v2/trimmed-pink/Branding/tbv_master_logo_dark_v2.png`
- `frontend/assets/tbv-v2/trimmed-emerald/Branding/tbv_master_logo_dark_v2.png`
- `frontend/assets/tbv-v2/trimmed-arctic/Branding/tbv_master_logo_dark_v2.png`

## CRITICAL FACTS / WHY THIS KEPT BREAKING
- The native build reads the icon ONLY from `app.json` -> `expo.icon`
  (= `./assets/images/icon.png`) and `android.adaptiveIcon.foregroundImage`
  (= `./assets/images/adaptive-icon.png`). This is a MANAGED Expo app (no native
  ios/ or android/ folders). If the build shows the wrong icon, it's because the
  file at that exact path was not overwritten — it is NEVER a "cache" issue.
- The app icon is COMPILED INTO the binary. Changing it ALWAYS requires a new
  EAS build + store upload. There is no way around a rebuild. Never claim the
  icon is updated on-device without a new build.

## HOW TO RE-APPLY (if asked again)
```
cd frontend
python3 - <<'PY'
from PIL import Image
s=Image.open('assets/branding/app_icon_master.png').convert('RGB')
for p,sz in {'assets/images/icon.png':1024,'assets/images/adaptive-icon.png':1024,
             'assets/images/splash-icon.png':1024,'assets/images/favicon.png':256}.items():
    s.resize((sz,sz),Image.LANCZOS).save(p)
PY
```
Then: Save to GitHub -> EAS build -> upload. Verify the build's icon BEFORE shipping.

## STATUS (2026-06-15)
- icon.png, adaptive-icon.png, splash-icon.png, favicon.png = octagon ✅ (hash d26f0965…)
- Transparent login logos = untouched ✅
- app version 3.1.3, iOS buildNumber 28, Android versionCode 214
