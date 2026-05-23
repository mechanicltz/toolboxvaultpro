# 🌐 FUTURE FEATURE: Web App Access

> **Status:** Concept design, NOT IN IMPLEMENTATION. Document captured 2026-05-23.
> Synergizes well with the Company Tier feature (see FUTURE_company_tier.md) — shop owners
> strongly prefer doing admin work on a keyboard + large screen.

## Concept Summary

Bring the full app to a web browser at a public URL (e.g., `app.toolboxvault.com`). Users
sign in with the same credentials as mobile, see the same data, can do almost everything
they can on mobile — except things that physically require a mobile device (camera, biometrics,
push notifications, in-app purchases via the native stores).

## Existing Foundation (good news)

The app is already built on **Expo Router with web support enabled**. This means:
- All file-based routes in `/app/frontend/app/` already serve as web URLs out of the box
- React Native components render to HTML via `react-native-web`
- Most `expo-*` libraries have web shims that no-op gracefully on the web
- The metro bundler can produce a static web build via `expo export --platform web`

**The web preview at `localhost:3000` that we test against during development IS the web app.**
The infrastructure is there — what's missing is the polish.

## What Works Today, Out of the Box (on web)

- Authentication (JWT in localStorage/cookies)
- All API calls (same FastAPI backend, same endpoints)
- All screens render (FlatList, ScrollView, Text, Image, TextInput, etc. all map to web)
- Image upload (file picker — `expo-image-picker` falls back to `<input type="file">` on web)
- Navigation between screens (Expo Router → URL routes)
- PDF generation (expo-print → browser PDF or download)
- Email/SMS intents (mailto: / sms: links open the user's email client)
- Form submission (existing `react-hook-form` works the same)
- Theme switching (light/dark)
- Cross-device data sync (already automatic — same backend)

## What Needs Re-Implementation / Adaptation

### High priority
1. **Responsive layout** — current UI is optimized for 390x844 phone viewport. Desktop
   browsers are 1280-1920+ wide. Need:
   - Tablet breakpoint (768-1023px) — 2-column lists, larger touch targets become hover targets
   - Desktop breakpoint (1024+px) — sidebar nav instead of bottom tabs, multi-pane layouts
   - Master/detail views for tools (list on left, detail on right)
2. **Bottom-tab nav → sidebar nav** on desktop. The bottom tab bar at 1080px looks absurd.
3. **Keyboard navigation** — tab order, focus rings, Enter-to-submit on forms,
   ⌘+S to save, ⌘+K to open search, Escape to close modals
4. **Data-table views** for large lists. Current FlatList is fine on mobile but the desktop
   inventory list of 500 tools would benefit from a sortable/filterable table with columns,
   like Airtable.

### Medium priority
5. **File upload UX** — drag-and-drop zones, multi-file selects, progress bars for large
   image batches (mobile uploads one photo at a time)
6. **Print stylesheet** for PDF previews — better page-break handling on the web
7. **Native sharing fallbacks** — `expo-sharing` on web should fall back to download-link
   or copy-to-clipboard
8. **Camera capture** — `getUserMedia` for webcam access on laptops with built-in cameras

### Lower priority
9. **Marketing landing page** — `/` route currently redirects to login, but a public
   landing page (features, pricing, screenshots) would be good for SEO/conversion
10. **SEO meta tags** — Open Graph, Twitter cards on shareable pages
11. **PWA manifest** — let users "install" the web app from Chrome/Edge as a desktop app

## What CANNOT (or shouldn't) Work on Web

- **Biometric Face ID / Touch ID** — graceful degrade to password only on web
- **Push notifications** — web push is a different beast (service workers, VAPID keys);
  do email fallbacks for now
- **In-app purchases via RevenueCat native SDK** — separate path needed (see below)
- **Native iOS/Android share sheets** — fallback to manual share/download
- **Background tasks / local notifications** — N/A on web

## Subscription Handling on Web (Big Issue)

Mobile subs come from Apple IAP / Google Play Billing via RevenueCat. **Web users can't use
those.** Need a parallel path:

### Option A: Stripe via RevenueCat Web SDK
- RevenueCat already supports Stripe-backed web checkout (`https://docs.revenuecat.com/docs/web`)
- Same entitlements unify across iOS / Android / Web
- Web users pay via Stripe → RC gives them the same `pro` entitlement that iOS subscribers get
- No double-billing: if a user subscribes on iOS then signs in on web, RC sees their active
  iOS entitlement and skips the upsell

### Option B: Apple/Google's "external web purchase" allowance
- Apple recently allowed apps to link to external web purchase (with required disclosure)
- Could direct mobile users to web checkout for a cheaper price (skipping the 30% cut)
- Risky — Apple's rules around this are strict and changing
- **NOT recommended** until we're more established

### Recommended: Option A (Stripe via RC)
- Same price on web as on mobile to avoid the Apple/Google compliance drama
- ~$5-10/mo savings if users prefer Stripe (lower fees, easier to manage in dashboard)

## Architecture Decisions

### Authentication
- Existing JWT-based auth ALREADY works on web. Token is stored in `AsyncStorage` which
  uses `localStorage` on web. No changes needed.
- "Forgot password" flow needs an email link → web reset page. Already partially built.
- "Sign in with Apple/Google" on web: separate OAuth flows; can defer to phase 2.

### URL structure
- Existing routes already produce nice URLs: `/(tabs)`, `/tool/[id]`, `/dealer/[id]`, etc.
- Deep linking from mobile email/SMS: links to `https://app.toolboxvault.com/tool/abc123`
  should ALSO work on mobile via `expo-router`'s universal links setup.

### Marketing site vs app
- Two reasonable approaches:
  - **A.** Single Expo Router project, `/` is marketing, `/app/*` is the authenticated app
  - **B.** Marketing site is a separate static project (Astro/Next.js) at root domain,
    the Expo app lives at `app.toolboxvault.com`
- B is cleaner for SEO, easier to update marketing copy without redeploying the app.
- A is simpler operationally.
- Decide based on whether you want a "real" landing page or just the app.

## Deployment

### Hosting
- Static export from Expo (`expo export --platform web`) → can be hosted on:
  - Vercel (free tier likely sufficient, great DX)
  - Netlify
  - Cloudflare Pages
  - GitHub Pages
  - Emergent platform (if they support static hosting)
- Custom domain: `app.toolboxvault.com` or `toolboxvault.app`

### Backend
- **No backend changes needed** — same FastAPI server handles web + mobile requests
- May need to add CORS headers for the new web domain (`api.toolboxvault.com` → `app.toolboxvault.com`)
- Rate limiting may need adjustment (web users hammer endpoints more aggressively)

## Implementation Phases

| Phase | Scope | Risk | Credits |
|---|---|---|---|
| **1. Web Polish** | Disable mobile-only features gracefully (biometric, native share), fix any web-crash bugs, basic responsive tweaks at 768/1024 breakpoints | Low | 50-100 |
| **2. Desktop Layout** | Sidebar nav on desktop (instead of bottom tabs), master/detail layouts, keyboard shortcuts | Medium | 100-150 |
| **3. Data-Table Views** | Replace FlatList with sortable/filterable tables on desktop for tools/dealers/etc | Medium | 80-120 |
| **4. Web Subscription** | Stripe via RC integration, unified entitlements with mobile, Stripe webhook handler | High (payments) | 80-120 |
| **5. Marketing Site** | Landing page, pricing, FAQ, screenshots — either inside Expo or separate Astro site | Low | 60-100 |
| **6. Polish + SEO + Deployment** | PWA manifest, meta tags, custom domain, Vercel deploy, beta testing | Medium | 80-120 |
| | | **TOTAL** | **~450-710 credits** |

Realistic timeline: **4-6 weeks** spread across the phases.

## Synergy with Company Tier

If both this and Company Tier ship, there's overlap that saves credits:
- The data-table views in Phase 3 here are useful for company admin dashboards too
- The Stripe subscription path in Phase 4 here is exactly what company-tier billing needs
  (companies prefer paying via card on web, not via Apple IAP)
- Sidebar nav on desktop is where company management screens belong

**Recommendation: build Company Tier first** (mobile-only, simpler scope), then add web
as the second major release. Selling both at once is too much for a solo dev to ship in a
reasonable timeframe.

## Pricing Position

Web access could be:
- **Included in all paid tiers** (recommended — adds value without adding cost to user)
- **Pro-tier exclusive** for individual users + included for all company tiers
- **A standalone $5/mo add-on**

Pro-tier exclusive is the most likely outcome — keep individual free users on mobile only,
make the web a paid perk.

## Open Questions for User (re-ask when implementing)

1. Custom domain you want to use? (`app.toolboxvault.com`, `app.tbvault.com`, etc.)
2. Marketing site vs app-only? (Single project or separate)
3. Should free-tier individual users get web access, or is it paid-only?
4. Any specific desktop-only features wanted (CSV imports via drag-drop? bulk operations?
   keyboard shortcuts? print previews?)
5. Should the web app work offline (PWA with service worker), or always require connection?

---
**End of concept doc. Reopen this file when ready to begin Phase 1.**
