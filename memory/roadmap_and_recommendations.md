# Toolbox Vault — Future Improvements Roadmap

This document captures the prioritized list of incremental upgrades discussed
with the user. The user's app is in production with a ~4,800-credit
investment to date and is feature-complete ("99% done"). The user explicitly
chose the incremental upgrade path over a full rebuild.

---

## TL;DR — Recommended Path Forward

Total estimated cost for **all** Tier 1 items: ~**1,900–2,800 credits**.
This achieves most of the benefits a full rebuild (~4,000–10,000 credits) would
deliver, without throwing away a working app.

Do them in the order below — each is self-contained and the user can pause
between any of them.

---

## TIER 1 — High ROI, Real User Impact (Recommended)

### 1. Cloud Image Storage (Supabase / S3 / Cloudinary)
**Estimated cost: 800–1,200 credits**
**Why this matters:** Photos are currently stored as base64 strings inside
MongoDB. This is the #1 source of real bugs we've fought:
  - TestFlight / production performance lag (4-second filter delay)
  - iOS expo-print hangs on PDF generation
  - List re-render lag from per-item base64 decode
  - AsyncStorage bloat
  - Slow initial inventory load
  - Bloated database / backup costs

**What it unlocks:**
  - True scalability to 10,000+ users with 1000s of items each
  - Easy "Full JSON Backup" feature (URLs are tiny vs base64 blobs)
  - Faster inventory loads
  - Simpler PDF generation
  - Cheaper MongoDB hosting at scale

**What user must do BEFORE this work begins:**
  - Sign up for Supabase (recommended — generous free tier) OR AWS S3 OR
    Cloudinary account
  - For Supabase: provide project URL + service-role key (server-side) +
    anon key (client-side)
  - Create a public-or-RLS-protected bucket called `tool-photos`

**Migration:** Existing base64 photos need a one-time migration script to
upload them to the bucket and replace the DB strings with public URLs.
Estimated 1-2 hours of safe migration time per 1000 tools.

---

### 2. MongoDB Indexes
**Estimated cost: 100–200 credits**
**Why this matters:** Right now `db.tools.find({...})` does a full collection
scan. Every screen that loads tools waits for MongoDB to read every record.
At 1000+ tools per user, this gets slow. Indexes are the database equivalent
of a book's index — go straight to the right record without reading every page.

**What changes:** Add `db.tools.create_index([("owner_id", 1), ...])` and
similar for high-traffic queries. Zero schema changes, zero user-facing
disruption, just faster.

**What user must do:** Nothing. This is purely backend work, deployable
without a new mobile build.

---

### 3. TanStack Query (React Query) for Top 3 Screens
**Estimated cost: 400–600 credits**
**Why this matters:** Currently every screen re-fetches everything from the
server on every focus, even if the user just left it 2 seconds ago. TanStack
Query caches API responses and only refetches when data is actually stale.
Result: instant screen transitions, fewer redundant network calls, better
battery life.

**Scope for the top 3 screens:**
  - Inventory (the heaviest re-fetcher — 7 parallel calls every focus)
  - Home/Dashboard
  - Tool Detail screen

**What user must do:** Nothing — frontend-only refactor, ships in next build.

---

### 4. Split `server.py` Into 4–5 Files (Lighter Refactor)
**Estimated cost: 600–800 credits**
**Why this matters:** The current 3500-line `server.py` is hard to navigate
and risky to edit. A split into focused files (`tools_routes.py`,
`reports_routes.py`, `auth_routes.py`, `import_export_routes.py`, plus
`models.py`) makes future changes safer and faster.

**Lighter than full hexagonal refactor:** Just splitting the file by feature
area, keeping the existing `_DBProxy` pattern. Low risk, real benefit.

**What user must do:** Nothing.

---

## TIER 2 — Architectural Improvements (Optional)

### 5. Repository / Service Layer
**Estimated cost: 1,000–2,000 credits**
**Why:** Even cleaner code separation. Useful if planning to onboard another
developer or add a web admin panel.
**Recommendation:** Skip unless you're adding a second developer.

### 6. Centralized Exception Handler
**Estimated cost: 200–400 credits**
**Why:** Cleaner error responses, easier debugging.
**Recommendation:** Combine with Tier 1 #4 (server.py refactor) for free.

### 7. React Hook Form + Zod for Forms
**Estimated cost: 600–1,000 credits**
**Why:** More robust forms (Edit Tool, Edit Settings, etc.).
**Recommendation:** Defer until form bugs surface.

### 8. Strict MongoDB Schema Validation
**Estimated cost: 300–500 credits**
**Why:** Catches bad data at the database level (defense in depth).
**Recommendation:** Defer — Pydantic catches 95% of cases already.

---

## TIER 3 — Future / Strategic

### 9. Apple StoreKit / In-App Purchases (if monetizing)
**Estimated cost: 1,500–3,000 credits**
**Prerequisites from user:**
  - Apple Developer Program enrollment ($99/year)
  - App Store Connect product setup
  - Decision on what to gate (currently 100% free per prior request)
  - Shared Secret + App Store Server API key

### 10. Full JSON Backup / Restore with Schema Versioning
**Estimated cost: 1,000–1,500 credits**
**Note:** Significantly cheaper AFTER Tier 1 #1 (cloud image storage), since
the backup file becomes tiny without embedded base64 photos.

### 11. Real-time / Multi-user Sync (Socket.io or Supabase Realtime)
**Estimated cost: 1,500–2,500 credits**
**Why:** Only if app expands to teams/workshops with shared inventories.

### 12. Background Jobs / Scheduled Tasks
**Estimated cost: 800–1,500 credits**
**Why:** For automated warranty reminders, scheduled exports, etc. Not
needed at current scale.

---

## What NOT to Do (anti-recommendations)

- **Full rebuild from scratch.** Costs more than the original (estimated
  4,000–10,000 credits) and produces a less battle-tested app. The current
  architecture is sound; the bugs were operational/configuration issues, not
  architectural ones.
- **Adopt "Hexagonal" / Clean Architecture.** Over-engineered for a single-
  developer app of this size.
- **Migrate from MongoDB to PostgreSQL.** No real benefit for your use case;
  high cost and risk.

---

## Known Operational Issues Already Fixed (for reference)

These were the "real bugs" we fought. Documenting so future agents don't
re-introduce them:

1. **`eas.json` was missing** → production builds had `BASE = undefined`,
   causing the "TestFlight shows 4 phantom tools" symptom. Fixed by adding
   `eas.json` with `EXPO_PUBLIC_BACKEND_URL` per profile + a hardcoded
   fallback in `api.ts`.
2. **Cache not cleared on login/logout** → stale data carried across user
   sessions. Fixed by `clearCached()` calls in `AuthContext.tsx`.
3. **Modal-stacking conflict on iOS** caused For-Sale Poster to hang
   forever — the `<Modal>`-based busy indicator competed with
   `expo-print`'s internal `UIPrintInteractionController` for the
   presented-VC slot. Fixed by switching to an in-tree absolute overlay.
4. **`react-native-safe-area-context` returns `bottom = 0` on Android 15**
   (mandatory edge-to-edge mode). Fixed via hardcoded `ANDROID_NAV_SAFE_PAD`
   in `BottomBar.tsx` (computed from Dimensions.screen vs window).
5. **Standard `<Image>` re-decodes base64 every render** → 4-second
   inventory filter lag. Fixed by switching to `expo-image` with
   `cachePolicy="memory-disk"` and `recyclingKey={item.id}`.
6. **NetInfo flashes OFFLINE banner on app resume** → fixed by debouncing
   offline transitions and ignoring null reachability events.

---

## File / Folder Reference (For Future Work)

- Frontend entry: `/app/frontend/app/_layout.tsx`
- Auth context: `/app/frontend/src/AuthContext.tsx`
- API layer: `/app/frontend/src/api.ts`
- Cache: `/app/frontend/src/cache.ts`
- Network watcher: `/app/frontend/src/network.ts`
- Bottom tab bar: `/app/frontend/src/BottomBar.tsx`
- Inventory screen: `/app/frontend/app/(tabs)/inventory.tsx`
- Tool detail / PDF generation: `/app/frontend/app/tool/[id].tsx`
- Image compression for PDFs: `/app/frontend/src/pdfImage.ts`
- Backend main file: `/app/backend/server.py` (3500+ lines, split candidate)
- Backend reports: `/app/backend/reports.py`
- Backend auth: `/app/backend/auth.py`
- Backend email: `/app/backend/email_sender.py`
- EAS Build config: `/app/frontend/eas.json`
- App config: `/app/frontend/app.json`

---

*Last updated: 2025-06-12. User to update when picking next item to tackle.*
