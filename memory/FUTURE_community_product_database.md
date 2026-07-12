# FUTURE FEATURE — Community Product Database (Crowdsourced Tool Catalog)

> STATUS: DESIGN / DISCUSSION ONLY. **No code written.** Parked for later.
> Goal: dramatically reduce inventory data-entry time by letting users import
> product info that other users have already entered — a crowdsourced tool
> catalog layered on top of each user's private inventory.
>
> Source docs:
> - User PDF: "Toolbox Vault - Community Product Database Design Discussion"
>   (uploaded artifact — the user's own design brief).
> - This file = full synthesis of that PDF + the agent/user chat discussion so
>   we NEVER have to re-analyze from scratch. Read this first when revisiting.

---

## 1. CORE CONCEPT

- Every item a user enters creates/updates TWO things:
  1. Their **private inventory item** (exactly like today).
  2. A **community contribution** merged into a shared, public product catalog.
- The community catalog grows over time from ALL users' entries.
- When adding a new item, the user can look it up by model number and IMPORT
  previously-entered data instead of typing everything.
- Works "like categories and brands" — users collectively build the data the
  system reads from.

---

## 2. DATA MODEL (three record types) — plain-language mental model

**A. User Inventory Item (PRIVATE)** — only the owner sees this.
Fields: serial #, purchase date, purchase price, dealer, warranty, maintenance
history, notes, storage location, receipts, photos, documents, custom tags.

**B. Community Product Profile (PUBLIC, one per Brand+Model)** — the canonical
"catalog page" everyone reads.
Fields: official product name, brand, model, specs (drive size, length, etc.),
category, description, MSRP, price stats, community images.

**C. Community Contributions (the raw "votes" behind B)** — every user's
submitted value per field, each with a count + confidence + contributor
reputation. Profile (B) is the DISTILLED WINNER computed from these votes (C).

Mental model: **C = ballot box, B = election result, A = your private copy.**

### Fields that go into the COMMUNITY record (from user's original spec):
Item Name, Model number, bundled items + their info, dealer (NAME only),
brand, MSRP, Category, Tags, Consumable toggle.
### Fields that STAY PRIVATE (never community):
Serial number, purchase date, purchase PRICE (personal), warranty, maintenance,
notes, location, receipts, documents, personal photos (unless explicitly shared).

---

## 3. DECISIONS LOCKED (resolved in the PDF + chat)

- **Serial number = PRIVATE ONLY.** Never enters community DB (unique per
  physical tool; privacy/theft risk). Agreed by both.
- **Catalog KEY = Normalized Brand + Normalized Model** (NOT model alone —
  brands reuse model numbers). Normalization: uppercase, strip spaces/dashes/
  punctuation, handle common OCR mistakes. Match tiers: exact → normalized →
  partial → alias → fuzzy → OCR-mistake.
- **Pricing is SPLIT (never one generic "Price"):**
  - Private: user Purchase Price.
  - Community: MSRP, Average Purchase Price, Lowest Reported, Highest Reported,
    Estimated Replacement Cost.
- **Photos = STRICT OPT-IN.** Prompt "Share this image with the Community
  Product Database?" Nothing auto-publishes. Prefer highest-quality images.
- **Data quality = LAYERED:** per-field Confidence Score + #contributors +
  #confirmations + #reports, PLUS contributor reputation weighting, PLUS AI
  junk/profanity/duplicate detection.
- **Conflict resolution = "Personal Data Mapping":** imported dealer/tag/
  category/brand not in the user's account → "map to existing" OR "create new."
- **Bundles** preserve name, contents, child products, relationships; importing
  recreates the whole bundle structure; saving contributes the bundle shape.

---

## 4. FULL USER JOURNEY (every step + every system reaction)

**Step 1 — Tap "Add Item / Quick Add":** popup asks for Purchase Date, Dealer,
Model Number, Purchase Price. Nothing saved yet. When a usable model # exists,
system normalizes Brand+Model and queries the Community DB in the background.

**Step 2 — Search resolves to ONE of THREE branches:**

- **Branch A — NO MATCH:** message "No community match — add it manually," then
  the normal Add Item screen opens with the 4 popup fields pre-filled. On save,
  this becomes the FIRST contribution → seeds a new Profile (hidden from others
  until it passes the consensus threshold).

- **Branch B — ONE STRONG MATCH (high confidence):** show the matched product
  card. (OPEN: auto-fill straight through vs one confirming tap. Rec: show once,
  don't silent auto-fill in v1.) User imports → pre-filled Add screen, OR backs
  out.

- **Branch C — MULTIPLE / UNCERTAIN MATCHES:** show a LIST with a clear header
  ("Possible matches for model 3333 — pick the one that fits"). Each row shows
  **Dealer, Model #, Brand** (+ official name + confidence indicator). Tap a row
  → **expandable accordion** with full profile (description, specs, MSRP, images,
  available Tags/Categories/Dealers). User can collapse & pick a different one
  ("go back" requirement) or tap **"Skip / No match"** to add manually.

**Step 3 — Select a match → IMPORT popup (the heart):** shows ALL fields other
users stored for this Brand+Model as CHECKBOXES. Where users disagreed
(user's model-3333 tag example), show EVERY option RANKED WITH A COUNT, e.g.
Tags: `☐ Ratchet (218) ☐ 3/8" (140) ☐ hand-tool (12)`. Only values ABOVE the
consensus threshold AND not AI-flagged as junk appear. User checks desired
values → taps **Import**.

**Step 4 — Personal Data Mapping (conflict resolution):** for each imported
dealer/category/tag/brand NOT already in the user's account, ask one at a time
"Do you already have this under a different name?" → Pick from my list OR Create
new. System reactions:
- Brand not in list → created automatically (like manual add).
- Category/Tag not in list → created (after "listed differently?" check).
- Dealer not in list → lightweight dealer record created (NAME ONLY — NEVER any
  balances/financials) + REMINDER: "Go to Dealers to finish setting up <dealer>."

**Step 5 — Land on normal Add Item screen, PRE-FILLED.** User fills remaining
private fields (serial #, warranty, notes, location).

**Step 6 — Save → DUAL WRITE:**
1. Save private inventory item (as today).
2. Merge non-personal data into Community DB as new contributions → update
   counts, recompute canonical Profile, update price stats.
- Bundles: store/rebuild bundle structure + children.
- Photos: private unless "share with community?" = yes.

---

## 5. BEHIND-THE-SCENES SYSTEM REACTIONS

- Normalization on every write (Brand+Model canonicalized so variants collide).
- **Consensus gating**: a value stays invisible to others until N distinct users
  confirm it (kills one-off junk before anyone sees it).
- **AI cleaning pass**: flag profanity/keyboard-mashing/gibberish/meaningless
  text; cluster near-duplicate names into one canonical name. (Uses OpenAI via
  the Emergent LLM key.)
- **Confidence + reputation scoring**: value rank = #distinct users × their
  trust. Trusted contributors surface faster; reported contributors sink.
- **Duplicate profile merging**: same product → auto-merge or queue moderation.
- **Moderation hooks (future)**: report product / report field / restore
  version / merge duplicates / remove spam / suspend bad actors.

---

## 6. DATA-QUALITY / ANTI-GIBBERISH STRATEGY (user's explicit concern)

Problem: user1 "3/8 ratchet" (model 1234) vs user2 "stupid wrench thing"
(model 1234) — don't show user2's junk to user3.
Defense, in priority order:
1. **Per-field consensus counts** — rank by # distinct users (solves most).
2. **Minimum-consensus threshold before visible to others** (rec: 2 users).
3. **Entry validation** (length, profanity, gibberish patterns).
4. **AI normalization + junk detection.**
5. **Reputation weighting + report/moderation.**
**Phase-1 recommendation:** ship layers 1–3 (deterministic, no AI dependency);
add 4–5 as fast-follows once data volume exists.

---

## 7. OPEN DECISIONS STILL NEEDED FROM USER (before any build)

1. **Thresholds:** min distinct users before a value shows to others?
   (agent rec: 2). Confidence % for "auto-fill without asking"?
   (agent rec: DON'T auto-fill in v1).
2. **Consent default (non-photo):** contributing non-personal fields automatic
   on save, or an opt-in toggle?
3. **Currency:** community prices — single base currency vs currency stamped per
   entry + normalized? (app already has a currency selector).
4. **Offline:** lookup needs a clean "catalog unreachable → add manually"
   fallback (app supports offline).
5. **Edit/Delete propagation:** if a user edits/deletes their item, update/
   retract their community contribution? (agent rec: yes, versioned).
6. **Single-user dedupe:** prevent one user re-entering the same model many
   times from inflating vote counts.
7. **No-model-number items:** search by name, or skip matching? (rec: skip v1).

---

## 8. KEY RISKS / THINGS TO REMEMBER

- **COLD START (biggest risk):** catalog is useless until it has data; early
  users get "no match" almost every time. Decide whether to SEED it (starter set
  of common brands/models, or bootstrap from existing user inventories) so it
  feels valuable on day one.
- **Cross-tenant storage:** community collections must be GLOBAL (not
  owner-scoped like current data). Current app data is owner-scoped via
  contextvars/get_current_user — community DB needs a separate un-scoped store.
- **Legal/ToS:** publicly aggregating dealer names + pricing + brand data should
  be covered in Terms; users acknowledge contributions become community data.
- **PII leakage:** keep free-text notes/description OUT of community (biggest
  junk + personal-info source).
- Dealer imports = NAME string only, never financial/account data.

---

## 9. SUGGESTED PHASING (agent draft — not yet approved)

- **Phase 1 (MVP):** dual-write on save; Brand+Model normalization + catalog
  collections (Profile + Contributions); Quick Add popup; model-number lookup
  with 3 branches; import popup with per-field checkboxes + consensus counts;
  Personal Data Mapping; quality layers 1–3. No AI, no reputation, no photos.
- **Phase 2:** AI normalization/junk detection; community photo sharing;
  price stats (avg/low/high/replacement); bundle import/export.
- **Phase 3:** reputation scoring; report/moderation tools; duplicate merging;
  version history/restore; catalog seeding.

> NEXT ACTION WHEN REVISITING: get answers to Section 7, then agent produces the
> concrete build plan (collections + API surface + screen list + phase detail).
> Do NOT re-run analysis — everything is captured here.
