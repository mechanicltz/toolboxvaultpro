# CHANGELOG — Batch 291 (2026-06-14) — v3.1.2 Release Prep

## Release config + build-stamp removal + deployment check

### Version bump → v3.1.2
- app.json: version "2.1.1" → **3.1.2**
- iOS buildNumber "26" → **27**
- Android versionCode 127 → 128 → **212**
  - CRITICAL: Play Console already has versionCode **211** live (Internal testing).
    New uploads must be > 211. Set to 212 to guarantee acceptance.
- Version label (v3.1.2) flows automatically to login + home via src/version.ts.

### On-screen build stamps removed (per user request)
- Home (app/(tabs)/index.tsx): removed both HOME_BUILD stamps (plain + industrial)
  and deleted the now-unused HOME_BUILD const.
- Login (app/login.tsx): removed the "#025" stamp block.
- Verified via screenshots: login shows "v3.1.2" only, home shows "3.1.2" only.

### Iron Forge default theme
- Confirmed already the default for new installs (themeContext.tsx defaults:
  skin="industrial", variant="orange" = Iron Forge). No code change needed.

### Deployment readiness
- deployment_agent health check: **PASS**. No hardcoded secrets, env vars
  externalized (EXPO_PUBLIC_BACKEND_URL / MONGO_URL / DB_NAME), CORS ok,
  no compilation/startup errors.

### Google Play status (from user screenshots)
- Production access GRANTED; Production track currently Inactive (never public).
- Live in Internal testing (211/2.1.1) + Closed testing Alpha (127).
- Plan: EAS production build of v3.1.2 (versionCode ≥212) → Production →
  Create new release → upload .aab → release notes → review → roll out.
- 2 pending "changes not yet sent for review" (open testing setup + add CA/US)
  to be reviewed/discarded so they don't ride along with production submission.

## Build marker: on-screen build number now REMOVED (was BUILD 320).
