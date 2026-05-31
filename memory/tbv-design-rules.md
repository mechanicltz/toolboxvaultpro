# Toolbox Vault — Design System Rules (USER-PROVIDED, AUTHORITATIVE)

## CORE RULES
1. **ToolboxVaultAssets is the source of truth.** Do NOT redesign or substitute with
   gradients / flat rectangles / Material / iOS native / Android native / glassmorphism /
   neumorphism / SaaS styling.
2. Before creating ANY visual element, check `/app/frontend/assets/tbv-v2/` for a
   matching asset. Use it via `<Image>` or `<ImageBackground>` with `resizeMode="stretch"`.
3. Render text, icons, and user content NATIVELY on top of those skins (children).
4. Skins are **stretchable UI** (treat like 9-slice). Aspect ratio in source PNG is
   irrelevant — Flexbox decides final size.
5. Use Flexbox / `gap` / `padding`. Do NOT use hardcoded `top: X%` positioning.
6. Phone: full responsive single column. Tablet: multi-column / expanded.
   Never letterbox a phone-sized form centered on a tablet.

## VISUAL TARGET
Dark gunmetal steel · industrial machinery · heavy-equipment dashboards · Snap-on toolbox · orange illuminated accents · mechanical hardware · premium rugged.

## TEXTURES
- `Textures/tbv_worn_gunmetal_dark.png` → card / panel interiors / dashboard surfaces
- `Textures/tbv_diamond_plate_dark.png` → dashboard / inventory / industrial backgrounds

## TOOL PLACEHOLDER
- Use `Inventory/tbv_tool_placeholder_dark.png` when a tool has no image (never camera icon / blank).

## BUILD ORDER (one screen at a time, wait for approval)
1. **Login** ← CURRENT
2. Dashboard
3. Inventory
4. Warranties
5. Dealers
6. Reports
7. Settings

## TIE-BREAKER
When uncertain between two design choices → choose the option that feels MORE like industrial equipment, LESS like a generic mobile app.
