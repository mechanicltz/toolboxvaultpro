# Toolbox Vault — Master Design System (living reference)

Source: user's MASTER DESIGN DIRECTIVE (2026-06). Keep this updated every phase.

## Vibe
Industrial / mechanical / heavy / premium / machined-steel control panel.
NOT generic mobile, Material, iOS default, SaaS, flat, or cyberpunk.

## Themes (BOTH required going forward)
- DARK: forged gunmetal/worn steel, diamond plate, bolts, orange glow.
- LIGHT: brushed aluminum / industrial silver / machined steel.
- Accent color (BOTH): #FF6A00.
  (NOTE: locked login uses #FF8533 — discrepancy flagged for user.)

## Header system (authenticated screens)
- NATIVE TEXT ONLY. No image/wordmark PNG for titles.
- Mimic the logo: heavy condensed font, ALL CAPS, slight letter spacing,
  strong vertical weight, subtle shadow/glow only.
- "TOOLBOX" = #D8D8D8, "VAULT" = #FF6A00.
- Fonts allowed: Bebas Neue, Oswald, Anton, Teko, Rajdhani SemiBold.
- May sit on `tbv_header_panel_dark(v2)` panel.

## Responsive / asset rules
- NEVER fixed pixel sizing. Scale to screen width/height/safe-area.
- Anchor content to the VISIBLE artwork area, not transparent/image edges.
- Use 9-slice scaling for stretchable containers (accordion/section/widget).

## Component strategy: reuse-first
Header, Section Container, Accordion Container, Action Card, Stat Card,
Inventory Tile, Modal, Popup, Nav Item. Build reusable pieces, not giant screens.

## ASSET INVENTORY (downloaded from user's Drive -> /app/frontend/assets/tbv-master/)
Present (45 PNGs, most 1536x1024 or 1024x1536, full-bleed framed panels):
- Backgrounds: tbv_background_dark, _light, tbv_splash_dark, _light
- UI/Backgrounds: tbv_background_industrial_dark
- Branding: app_icon d/l, brand_badge d/l, brand_emblem_dark, logo d/l,
  master_logo_dark(/v2)/light, wordmark d/l
- UI/ActionCards: tbv_action_box_dark/light, tbv_header_panel_darkv2
- UI/Headers: tbv_header_panel_dark
- UI/Buttons: btn_primary_orange, btn_secondary_dark, floating_action_button_orange
- UI/Cards: card_dark, card_dealer_dark, card_inventory_dark, card_stat_dark, card_warranty_dark
- UI/Controls: checkbox d/l, radio d/l, toggle d/l
- UI/Dashboard: dashboard_widget_dark/light/light_v2, stat_card_dark/light/light_v2
- UI/Hardware: corner_bracket_dark, hex_bolt_dark
- UI/Accents: accent_bar_orange, section_divider_dark

## MISSING assets the directive references (NOT in the Drive folder):
- tbv_section_box_dark / _light  (Dealer Accounts, Settings groups, etc.)
- tbv_accordion_container_dark / _light
- tbv_inventory_tile_dark / _light / _light_v2
- tbv_inventory_detail_panel_dark / _light / _light_v2
- tbv_dashboard_master_panel_dark / _light / _light_v2
ACTION: confirm with user whether these will be provided, or whether we should
substitute (e.g. action_box / card_* / dashboard_widget) until they arrive.

## Notes on the present container assets
- Opaque bbox ~= full image (full-bleed); the FRAME border sits inside the
  opaque area, so 9-slice cap insets must be measured VISUALLY per asset.
- Many are RGBA but a few are RGB (no alpha) — keep iOS app-store alpha rules in mind for icons.

## Build gotchas: see TBV_LOGIN_BUILD_NOTES.md (font-gate, skin preload, stale
Metro bundle, module-scope components, numeric image sizing on iOS).
