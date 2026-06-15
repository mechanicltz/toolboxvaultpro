# Toolbox Vault — Google Play Release Guide (v3.1.2, versionCode 212)
First-ever PRODUCTION release. Written for someone brand-new to Play Console.

## YOUR EXACT STARTING POINT (from your screenshots)
- App already exists in Play Console.
- Production access = GRANTED.
- Production track = currently Inactive (this will be your FIRST public release).
- Highest version already on Play = versionCode 211. Your new build = 212 (good, it's higher).
- Managed publishing = OFF (so you must manually "Send for review").
- You have 2 pending changes sitting in Publishing overview (we handle these at the end).
- You have the v3.1.2 .aab ready to upload.

=================================================================
PART 0 — WHAT YOU NEED IN FRONT OF YOU
=================================================================
1. Your signed .aab file (v3.1.2 / versionCode 212) saved somewhere easy to find.
2. New screenshots (phone): at least 2, up to 8. PNG or JPEG, NO transparency, 9:16 portrait, side length 320–3840 px (1080x1920 is perfect).
3. (Optional but recommended since the app runs on tablets) 4+ tablet screenshots.
4. Short "What's new" text (release notes).

=================================================================
PART 1 — LOG IN AND OPEN YOUR APP
=================================================================
1. Go to https://play.google.com/console in Chrome.
2. Sign in with the Google account that owns the developer account.
3. On the "All apps" dashboard, CLICK the app row "Toolbox Vault" to open it.
4. You're now on the app's Dashboard. The LEFT side is the main menu you'll use.

=================================================================
PART 2 — UPLOAD NEW SCREENSHOTS / STORE GRAPHICS  (do this first)
=================================================================
1. In the LEFT menu, find the "Grow" section → click "Store presence" → click "Main store listing".
   (If you don't see "Grow", look for "Store presence" → "Main store listing".)
2. Scroll down to the "Graphics" area.
3. APP ICON (512x512) and FEATURE GRAPHIC (1024x500) are already set — only touch them if you want to change them.
4. PHONE SCREENSHOTS:
   a. Find "Phone screenshots".
   b. To remove an old one: hover the image → click the small trash/X icon.
   c. To add new ones: click "Upload" (or the + / "Add screenshots" box) → select your new phone images.
   d. Drag images to reorder — the FIRST one is the most important (it's what users see first).
   e. Rules: 2–8 images, PNG or 24-bit JPEG, NO transparency, portrait 9:16 (e.g., 1080x1920).
5. TABLET SCREENSHOTS (optional, recommended):
   a. Scroll to "7-inch tablet screenshots" and "10-inch tablet screenshots".
   b. Upload at least 4 to each (you can reuse the same tablet images for both 7" and 10").
6. CLICK the blue "Save" button at the bottom right.
   NOTE: Because managed publishing is OFF, saving here just STAGES the change. It won't go live until you send changes for review (Part 5).

=================================================================
PART 3 — CREATE THE PRODUCTION RELEASE (upload the .aab)
=================================================================
1. In the LEFT menu, open the "Test and release" section → click "Production".
2. You'll see the Production page with the track summary "Inactive".
3. Top-right: CLICK the blue button "Create new release".
4. APP SIGNING:
   - If a box about "Play App Signing" appears, just CLICK "Continue" / "Use Google-generated key". (You've released before, so this is already on.)
5. APP BUNDLES:
   - Find the "App bundles" box.
   - CLICK "Upload" and select your v3.1.2 .aab file (NOT an APK).
   - Wait for the upload + processing spinner to finish.
   - A row should appear showing version "3.1.2 (212)". Confirm the (212) is correct.
   - If you see an error like "Version code 211 has already been used" → your build's number is too low; rebuild with versionCode 212+ and re-upload.
6. RELEASE DETAILS (scroll down):
   - "Release name" auto-fills as "212 (3.1.2)". Leave it as is.
   - "Release notes": in the box between the <en-US> tags, type your what's-new. Example:

     <en-US>
     - New Insurance Claims: document losses and email a professional PDF to your insurer
     - Tool Sets with accurate bundle pricing in reports
     - Redesigned professional PDF & CSV reports
     - Iron Forge theme polish across the app
     - Smoother forms, faster performance, and stability fixes
     </en-US>

7. Bottom-right: CLICK "Next".
   - If asked to "Save" first, click Save, then Next.

=================================================================
PART 4 — REVIEW THE RELEASE
=================================================================
1. You're now on "Review and roll out" (or "Review release").
2. Look at the "Errors, warnings and messages" panel:
   - YELLOW warnings = usually OK to continue (read them, but they don't block you).
   - RED errors = MUST be fixed before you can publish. If you hit a red error you don't understand, copy the exact text and send it to me.
3. If there's a "Rollout percentage" field for a first production release, set it to 100% (full rollout) unless you intentionally want a staged rollout.
4. When clean, CLICK the blue button "Start rollout to Production".
5. A confirmation popup appears → CLICK "Rollout" / "Send for review".

=================================================================
PART 5 — SEND EVERYTHING FOR REVIEW (Publishing overview)
=================================================================
Because Managed Publishing is OFF, your changes (new screenshots + the release) are queued and must be SENT to Google.
1. In the LEFT menu, click "Publishing overview" (near the top).
2. You'll see a list of "Changes ready to send", which now includes:
   - Production release 212 (3.1.2)
   - Main store listing (your new screenshots)
   - Your 2 OLD pending changes (Open testing setup, "Add 2 countries: Canada, United States", "Unsync from production")
3. DECIDE on the 2 old pending changes:
   - "Add 2 countries: Canada, United States" → KEEP if you want those countries live.
   - "Open testing – Save for later" / "Unsync from production" → if these were experiments you don't want, click the "..." (or "Manage") next to each and DISCARD them so they don't get submitted.
4. When the list shows only what you want to publish, CLICK the blue "Send X changes for review" button.
5. Confirm. Done — it's now submitted to Google.

=================================================================
PART 6 — WHAT HAPPENS NEXT
=================================================================
- Status changes to "In review" / "Pending publication".
- First production releases typically take a few hours up to ~2–3 days to be reviewed.
- Because managed publishing is OFF and you chose "Start rollout", it AUTO-PUBLISHES the moment Google approves it. You don't need to do anything else.
- To check status later: Play Console → "Publishing overview" or "Test and release → Production".
- You'll also get an email from Google Play when it's approved (or if changes are needed).

=================================================================
COMMON ERRORS & FIXES
=================================================================
- "Version code 211 has already been used": rebuild with versionCode 212 or higher.
- "You must use a different version code": same fix — increase versionCode.
- "Your app currently targets API level X and must target Y": rebuild with the required target SDK (tell me and I'll bump it).
- "Upload a 24-bit PNG without alpha" on a graphic: re-export the image as JPEG or 24-bit PNG with transparency turned OFF.
- "App not compliant — Data safety / Content rating incomplete": these were completed when you got production access, but if flagged, finish those forms under "Policy and programs" / "App content".
- Red "Declarations" prompts: complete any "App content" items it points to, then return to the release.

=================================================================
QUICK CHECKLIST
=================================================================
[ ] New phone screenshots uploaded + Saved (Main store listing)
[ ] (Optional) Tablet screenshots uploaded
[ ] Production → Create new release
[ ] Uploaded v3.1.2 .aab → shows 3.1.2 (212)
[ ] Release notes typed
[ ] Reviewed (no red errors)
[ ] Start rollout to Production
[ ] Publishing overview → discarded unwanted pending changes
[ ] Send changes for review
[ ] Waiting for Google approval (auto-publishes when approved)
