# 🏛️ Showroom Layout

> A reusable "detail screen" layout blueprint. Reference implementation:
> **`/app/frontend/app/dealer/[id].tsx`** (Dealer Detail) — itself modeled on
> **`/app/frontend/app/tool/[id].tsx`** (Item Detail).
>
> Use this when you want a screen that has: a fixed branded header + a fixed
> horizontal tab bar + ONE skinned panel that stays put while only its inner
> content changes per tab (no flicker, no nested panels).

---

## 1. Visual anatomy (top → bottom)

```
┌─────────────────────────────────────────────┐
│  IndustrialBanner  (back · TITLE · kebab)     │  ← fixed
├─────────────────────────────────────────────┤
│  HERO ROW                                     │  ← fixed
│   [ logo ]   TOTAL PURCHASED   $1,234 · 5 …   │
│              ───────────────                  │
│              ROUTE · Weekly        ✎          │
│              Next: Tue Jun 30                 │
├─────────────────────────────────────────────┤
│  TAB BAR   [ COMPANY ][ AGENTS ][ ACCOUNTS ]  │  ← fixed (segmented)
├─────────────────────────────────────────────┤
│ ╔═══════════ SKINNED PANEL (flex:1) ═══════╗ │  ← fixed frame
│ ║  <ScrollView> active tab content </…>    ║ │     content scrolls
│ ║  …only the children change per tab…      ║ │     inside
│ ╚══════════════════════════════════════════╝ │
└─────────────────────────────────────────────┘
```

Everything ABOVE the panel is fixed and never scrolls. The panel itself is a
fixed-height (`flex: 1`) skinned frame; ONLY its inner content scrolls and
swaps between tabs.

---

## 2. The non-negotiable rules (why it works)

1. **Outer container is `flex: 1` (`SafeAreaView`), NOT a ScrollView.**
   Children = Banner → Hero → Tab bar → Content panel. Hero & tab bar are plain
   fixed children; the panel gets `flex: 1` so it fills the rest of the device.

2. **ONE skinned panel.** The panel frame renders once. The per-tab content
   inside it must be PLAIN containers (`<View>`), never another skinned
   panel/card. Nesting a second skin = the "panel inside a panel" bug.

3. **Define the panel component at MODULE scope, NOT inside the screen
   component.** If it's declared inside render, every tab tap creates a new
   component identity → React unmounts/remounts the panel → the steel image
   reloads → visible flicker. Module scope keeps the instance mounted; only
   children change. (This was the root cause of the flicker we fixed.)

4. **Content lives in a single `<ScrollView style={{flex:1}}>` inside the
   panel**, with the 3 tab branches as `{activeTab === "x" && (…)}` children.

---

## 3. Component structure (copy/paste skeleton)

```tsx
// ---- MODULE SCOPE (outside the screen component!) ----
function ShowroomPanel({
  isIndustrial, winSrc, winCap, steelScale, plainStyle, children,
}: {
  isIndustrial: boolean; winSrc: any; winCap: any; steelScale: any;
  plainStyle: any; children: React.ReactNode;
}) {
  return isIndustrial ? (
    <TbvListPanel
      source={winSrc}
      capInsets={winCap}
      frameScale={steelScale}
      padX={16}
      padTop={16}
      padBottom={12}
      style={{ flex: 1 }}
    >
      {children}
    </TbvListPanel>
  ) : (
    <View style={plainStyle}>{children}</View>
  );
}

export default function MyDetailScreen() {
  const [activeTab, setActiveTab] = useState<"company" | "agents" | "accounts">("company");

  // Steel skin sources (see import block in §4)
  const isSteel = useIsSteel();
  const steelPanel = useSteelPanelFrame();
  const isIndustrial = isSteel; // or skin === "industrial"
  const steelScale = isSteel ? steelPanel.frameScale : undefined;
  const winSrc = isSteel ? steelPanel.source : SKIN.window;
  const winCap = isSteel ? steelPanel.capInsets : CAP.window;

  return (
    <SafeAreaView style={styles.container /* { flex:1 } */} edges={["top"]}>
      <IndustrialBanner title={name} onBack={() => router.back()} rightSlot={<Kebab/>} />

      {/* HERO — fixed */}
      <View style={styles.heroRow}>
        <Logo size={110} />
        <View style={styles.heroRight}>
          <TouchableOpacity onPress={openPrimary}>
            <Text style={styles.heroLabel}>TOTAL PURCHASED</Text>
            <Text style={styles.heroValue}>$1,234 · 5 items</Text>
          </TouchableOpacity>
          <View style={styles.heroSep} />
          <TouchableOpacity onPress={openRouteEditor}>
            <View style={styles.heroRouteLabelRow}>
              <Text style={styles.heroLabel}>ROUTE · Weekly</Text>
              <Ionicons name="create-outline" size={12} color={accent} />
            </View>
            <Text style={styles.heroNext}>Next: Tue Jun 30</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* TAB BAR — fixed segmented control */}
      <View style={styles.tabBar}>
        {(["company","agents","accounts"] as const).map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.tab, activeTab === k && styles.tabOn]}
            onPress={() => setActiveTab(k)}
          >
            <Text style={[styles.tabText, activeTab === k && styles.tabTextOn]}>
              {k.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* CONTENT — one fixed panel, scrollable content inside */}
      <View style={styles.contentPanelOuter}>
        <ShowroomPanel
          isIndustrial={isIndustrial}
          winSrc={winSrc}
          winCap={winCap}
          steelScale={steelScale}
          plainStyle={styles.contentPanelPlain}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {activeTab === "company" && (<View>{/* plain content */}</View>)}
            {activeTab === "agents" && (<View>{/* plain content */}</View>)}
            {activeTab === "accounts" && (<View>{/* plain content */}</View>)}
          </ScrollView>
        </ShowroomPanel>
      </View>

      {/* …modals (edit, quick-route editor, etc.)… */}
    </SafeAreaView>
  );
}
```

---

## 4. Imports needed for the steel skin

```tsx
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsSteel, useSteelPanelFrame } from "../../src/tbv/steel";
import { SKIN, CAP } from "../../src/tbv/skin";            // path per actual file
import TbvListPanel from "../../src/tbv/components/TbvListPanel";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { Ionicons } from "@expo/vector-icons";
```

`TbvListPanel` = the fill-capable steel "window" panel (use this, NOT
`TbvFrame`, which sizes to its content and will NOT fill `flex: 1`).

---

## 5. Styles (themedStyles — values used in Dealer Detail)

```tsx
container: { flex: 1, backgroundColor: c.canvas },

// HERO
heroRow:   { flexDirection: "row", alignItems: "center", gap: 14,
             paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
heroRight: { flex: 1, alignItems: "flex-start" },   // left-aligned beside logo
heroLabel: { color: c.textMuted, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
heroValue: { color: c.textPrimary, fontSize: 13, fontWeight: "900", marginTop: 2 },
heroSep:   { height: 1, alignSelf: "stretch", backgroundColor: c.borderSubtle, marginVertical: 8 },
heroNext:  { color: c.textSecondary, fontSize: 9, fontWeight: "700", marginTop: 2 },
heroNextEmpty:    { color: c.textMuted, fontSize: 9, fontStyle: "italic", marginTop: 2 },
heroRouteLabelRow:{ flexDirection: "row", alignItems: "center" },
// logo size = 110 (DEALER_LOGO_SLOT.hero)

// TAB BAR (segmented)
tabBar:     { flexDirection: "row", marginHorizontal: 16, marginBottom: 12,
              borderRadius: 8, borderWidth: 1, borderColor: c.border,
              backgroundColor: c.bgSecondary, overflow: "hidden" },
tab:        { flex: 1, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
tabOn:      { backgroundColor: c.accent },
tabText:    { color: c.textSecondary, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
tabTextOn:  { color: "#000" },

// CONTENT PANEL
contentPanelOuter: { flex: 1, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 14 },
contentPanelPlain: { flex: 1, backgroundColor: c.bgSecondary, borderWidth: 1,
                     borderColor: c.border, borderRadius: 10, padding: 6,
                     ...(theme.elevation.md as object) },   // non-steel fallback panel
```

---

## 6. Inner "card" rule

Per-tab content used to wrap in a `CardShell` that drew its own steel frame —
that caused nested panels. The fix: a per-tab shell must render PLAIN:

```tsx
const CardShell = ({ children, testID, plainStyle }) => (
  <View style={plainStyle} testID={testID}>{children}</View>
);
// plainStyle = minimal padding only, e.g. { paddingHorizontal: 6, paddingVertical: 2 }
// NO background / border / margin / elevation on inner shells.
```

---

## 7. Clean label / value rows (used in the Accounts tab)

Easy-to-read "header + label-left / value-right" block:

```tsx
<View style={s.acctHeaderRow}><Text style={s.acctHeaderText}>CREDIT ACCOUNT</Text>…</View>
<View style={s.acctRow}><Text style={s.acctRowLabel}>Balance</Text>
  <Text style={s.acctRowValueStrong}>$1,234.00</Text></View>
<View style={[s.acctRow, s.acctRowLast]}><Text style={s.acctRowLabel}>Status</Text>
  <Text style={s.acctRowValue}>Paid up</Text></View>
```
```tsx
acctHeaderRow:   { flexDirection:"row", justifyContent:"space-between", alignItems:"center",
                   paddingBottom:8, marginBottom:4, borderBottomWidth:2, borderBottomColor:c.accent },
acctHeaderText:  { color:c.textPrimary, fontSize:12, fontWeight:"900", letterSpacing:1.5 },
acctRow:         { flexDirection:"row", justifyContent:"space-between", alignItems:"center",
                   paddingVertical:9, borderBottomWidth:1, borderBottomColor:c.border },
acctRowLast:     { borderBottomWidth:0 },
acctRowLabel:    { color:c.textSecondary, fontSize:12, fontWeight:"600" },
acctRowValue:    { color:c.textPrimary, fontSize:13, fontWeight:"800", maxWidth:"60%", textAlign:"right" },
acctRowValueStrong: { fontSize:18, fontWeight:"900" },  // + green(paid)/red(owed) color
```

---

## 8. Extras seen on the Dealer page (optional patterns)

- **Tappable hero ROUTE → quick editor:** the ROUTE block is its own
  `TouchableOpacity` opening a small modal (`routeForm` state) that saves ONLY
  the route fields via `api.updateDealer` — no full edit form.
- **List section column headers** (Agents tab): a header row with `NAME` /
  `ROUTE LOCATION` labels above the rows; an "OTHER AGENTS" divider separates
  the pinned current item from the rest.
- **Inline edit (item page pattern):** when editing, the `IndustrialBanner`
  `centerSlot` shows CANCEL/SAVE in place of the title to free vertical space.

---

## 9. Checklist to replicate on a new page

- [ ] Outer `SafeAreaView` is `flex: 1` (no top-level ScrollView).
- [ ] Banner + Hero + Tab bar are fixed siblings.
- [ ] Panel component declared at **module scope**.
- [ ] Panel = `TbvListPanel` (steel) / bordered `View` (fallback), `flex: 1`.
- [ ] Single inner `<ScrollView style={{flex:1}}>` holds all tab branches.
- [ ] Per-tab content is PLAIN (no second skinned panel).
- [ ] Tab bar is a full-width segmented control (orange-filled active).
