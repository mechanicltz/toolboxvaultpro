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
3. [DONE] Inventory detail tabs: Documents+Receipts now share ONE box with a
   single divider (newStyles.tabSectionDivider) on Plain themes; History already
   flat-with-dividers; Maintenance/Warranty single box. Steel/Iron untouched.
4. [DONE] Dealer list: plain box layout.
5. [DONE] Warranty Claims tabs: Open claims / Dealers / History → flat rows with
   dividers (styles.itemRowFlat) inside the big ShadowBox, no per-item sub-cards.
   ShadowBoxSubCard import removed from claims.tsx. Steel/Iron untouched.
6. [DONE] Upcoming Features page: ShadowBox for Plain, SkinnedCard for Steel/Iron.
7. [DONE] Insurance Claims compacting + Status/Tasks row alignment.

NOTE: NO shared components (ShadowBoxSubCard etc.) were edited — only the
individual screens, to avoid the prior dashboard-dealer regression.

Static ShadowBox = use the `ShadowBox` component (src/components/ShadowBox.tsx),
fixed height, list scrolls inside it. NOT the skinned TbvFrame/SkinPlate panel.
