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

REMAINING:
1. NEW-badge bug (all themes): Upcoming Features "new" label stays after viewing.
2. Inventory list: items inside ONE static, scrollable ShadowBox (not skinned
   panel), padded so bottom items clear the + add button.
3. Inventory detail tabs: Overview/Photos/Documents/Maintenance/Warranty → remove
   inner ShadowBoxSubCard, put content directly in the big static ShadowBox.
   Documents+Receipts: divider between them. History: no per-item sub-cards,
   divider between items.
4. Dealer list: plain box layout (no shadow box).
5. Warranty Claims tabs: Open claims (dividers), Claims-dealers, Claims-history
   (dividers) → content in big ShadowBox, no sub-cards.
6. Upcoming Features page: replace "weird box" (SkinnedCard) with ShadowBox.
7. Insurance Claims: list dashboard more compact + remove grey box behind each
   item's left icon. Detail dashboard: Status & Tasks on the same aligned row
   (all themes).

Static ShadowBox = use the `ShadowBox` component (src/components/ShadowBox.tsx),
fixed height, list scrolls inside it. NOT the skinned TbvFrame/SkinPlate panel.
