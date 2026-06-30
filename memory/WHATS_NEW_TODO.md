# TODO before public launch — "What's New" popup

Build a **"What's New" popup/modal** that shows to users on first launch after an
update. It should list, as simple bullet points, everything that has changed /
is now available since the **3.1.2** release.

Requirements:
- Shows once per version (track last-seen version in AsyncStorage; show when the
  installed app version > last-seen, then mark seen).
- Simple bulleted list of changes (curated copy, not auto-generated).
- Dismissible ("Got it" button). Accessible later from a menu link if desired.
- Should respect all themes (Plain Light/Dark + Steel/Iron).

Content source: maintain a per-version changelog array in code (e.g.
`src/whatsNew.ts`) keyed by version string.

Status: NOT STARTED (deferred per user request — build before shipping).

---

# In-progress UI batch (Plain themes only unless noted) — remaining

User-requested batch (scope = Plain Light + Plain Dark; Steel/Iron unchanged):

DONE:
- Login page (all themes): header wordmark on top, logo icon below; Plain themes
  now show a clean themed wordmark instead of the steel nameplate. (login.tsx)

REMAINING: (all DONE — batch complete, verified by testing iter77)
1. [DONE] NEW-badge bug: Upcoming Features "new" label clears after viewing.
2. [DONE] Inventory list: items inside ONE static scrollable ShadowBox
   (styles.invListBox, gated isPlain && gridCols===1), flat rows + dividers,
   bottom padding clears the + add FAB. Steel/Iron untouched.
3. [DONE] Inventory detail tabs: ALL inner sub-cards removed on Plain themes.
   ROOT FIX: `boxStyle` for plain switched from `detailsBox` (bordered white
   inner card w/ elevation) -> `detailsBoxFlat` (transparent). Now every tab's
   content sits DIRECTLY inside the big outer ShadowBox (contentPanelPlain) —
   no box-in-box. Covers Details, Photos, Documents, Maintenance, Warranty,
   History. Inner item rows also flattened (docRowFlat/rowFlat/cardFlat) so
   items are divider-separated.
   - EXCEPTION kept: Sets/Bundle expansion items render via BundleTab's local
     `s.row` card (independent of boxStyle) — untouched.
   - Steel/Iron use panelGroupFlat (unchanged).
   - NOTE: a stale Metro cache initially masked these changes; required a
     cache-clear rebuild. Users on-device must reload the app to pick it up.
4. [DONE] Dealer list: plain box layout.
5. [DONE] Warranty Claims tabs: Open / Dealers / History each render inside ONE
   static ShadowBox (styles.plainListBox, flex:1) with content scrolling INSIDE
   it — matching Inventory + item-details. New plain branch gated on
   `!isIndustrial && !searchActive`; rows flat (itemRowFlat/dealerListRow) with
   dividers, no per-group/per-item sub-cards. Search view + Steel/Iron untouched.
   Verified plain-light (DIAG: single box radius 8 + shadow, no inner cards).
6. [DONE] Upcoming Features page: ShadowBox for Plain, SkinnedCard for Steel/Iron.
7. [DONE] Insurance Claims compacting + Status/Tasks row alignment.

NOTE: NO shared components (ShadowBoxSubCard etc.) were edited — only the
individual screens, to avoid the prior dashboard-dealer regression.

Static ShadowBox = use the `ShadowBox` component (src/components/ShadowBox.tsx),
fixed height, list scrolls inside it. NOT the skinned TbvFrame/SkinPlate panel.
