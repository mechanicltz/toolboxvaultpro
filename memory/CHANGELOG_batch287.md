# CHANGELOG — Batch 287 (2026-06-13)

Build: HOME_BUILD → **BUILD 287**. Verified: testing agent iteration_25 (all PASS).
Insurance Claims module polish pass + bug fixes.

## Bug fixes
- **One-tap "Email Detailed Report to Insurer" didn't work** — it relied on the
  `X-Report-Id` response header which the ingress can strip, leaving the report
  id empty → send failed. Now re-fetches `listReports()` and grabs the newest
  report. Verified end-to-end (email actually sent). SMTP confirmed working.
- (Inventory list padding from batch 286 retained.)

## Insurance UI/UX (skinned-theme focused, plain themes preserved)
1. **Date pickers** — New Claim "Date of Loss" / "Date Discovered" now use the
   app's `DateField` via new `ICDateField` (native picker on device, masked
   input on web). `src/components/insurance/ICKit.tsx`, `app/insurance-claims/new.tsx`.
2. **Import button** — now a filled accent pill (icon + label), `new.tsx`.
3. **Bigger/clearer buttons** — `ICButton` enlarged (minHeight 50, fontSize 15,
   radius 12, ghost variant uses textPrimary + accent border). Report-row
   view/share/email actions are now 40×40 distinct bordered chips.
4. **Status badge** — claim list badge is now FILLED with white text (Draft was
   grey/unreadable on metal). `app/insurance-claims/index.tsx`.
5. **Uniform dashboard tiles** — `statInner` minHeight + value `adjustsFontSizeToFit`
   so all tiles match height and "$…" no longer truncates.
6. **Stretched panels fix** — `ICSection` switched from the short `plate` frame
   (400×85, stretched ~7× on tall forms) to the taller `window` frame (400×273).
7. **Readability** — field labels and muted/meta text lifted from `textMuted` to
   `textSecondary`.

## Backend — PDF report readability (insurance only)
- `insurance_claims.py build_claim_pdf`: after `_styles(ACCENT)`, override the
  `section` / `th` / `th_right` styles + items-table header to a **dark-grey bar
  (#3A3A3A) with WHITE text** (was navy text on near-black #111 = unreadable).
  Other report types untouched. Render verified HTTP 200.
