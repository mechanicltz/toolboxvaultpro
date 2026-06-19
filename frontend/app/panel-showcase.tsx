// =====================================================================
// TEMPORARY DESIGN SHOWCASE  —  /panel-showcase
// 15 unique container-panel designs, each rendering the dashboard
// "summary area". Horizontal selector at top to switch designs.
//
// FULLY SELF-CONTAINED on purpose: it imports ZERO shared app components
// (no ShadowBox / TbvFrame / SKIN / theme). Only standard React-Native +
// expo-router + Ionicons. This guarantees it can NEVER affect or break the
// real app. Textures are valid PNGs served over the network from the
// backend (/api/panels/*), with a solid fallback colour + onError so a
// failed image can never crash the page.
// >>> TEMPORARY: remove this file + the Vault link when done testing. <<<
// =====================================================================
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ImageBackground,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

// ---- Network-served textures (no bundled assets) ----
const PANEL_BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/panels`;
const url = (name: string) => ({ uri: `${PANEL_BASE}/${name}.png` });

// ---- Dashboard summary demo data ----
const ROWS: { icon: any; label: string; value: string }[] = [
  { icon: "cube", label: "TOTAL ITEMS", value: "142" },
  { icon: "cash", label: "NET WORTH", value: "$48,250" },
  { icon: "arrow-redo", label: "CHECKED OUT", value: "3" },
  { icon: "pricetag", label: "SELLING", value: "5" },
  { icon: "heart", label: "WISH LIST", value: "12" },
  { icon: "construct", label: "MAINT. DUE", value: "4" },
];

type Tone = {
  accent: string;
  title: string;
  label: string;
  value: string;
  pillBorder: string;
  pillBg: string;
  divider: string;
  rowBg?: string;
};

function SummaryBody({ t }: { t: Tone }) {
  return (
    <View>
      <View style={sb.header}>
        <Ionicons name="briefcase" size={18} color={t.accent} />
        <Text style={[sb.title, { color: t.title }]}>PORTFOLIO SUMMARY</Text>
      </View>
      <View style={[sb.divider, { backgroundColor: t.divider }]} />
      {ROWS.map((r) => (
        <View key={r.label} style={[sb.row, t.rowBg ? { backgroundColor: t.rowBg } : null]}>
          <Ionicons name={r.icon} size={15} color={t.accent} style={{ width: 22 }} />
          <Text style={[sb.label, { color: t.label }]} numberOfLines={1}>
            {r.label}
          </Text>
          <View style={[sb.pill, { borderColor: t.pillBorder, backgroundColor: t.pillBg }]}>
            <Text style={[sb.value, { color: t.value }]}>{r.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const sb = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 9 },
  title: { fontSize: 15, fontWeight: "900", letterSpacing: 1.6 },
  divider: { height: 1, marginTop: 10, marginBottom: 6, opacity: 0.7 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    paddingHorizontal: 2,
  },
  label: { flex: 1, fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  pill: {
    minWidth: 64,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  value: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
});

// Plain (no-image) panel wrapper.
function PlainPanel({
  style,
  children,
}: {
  style?: any;
  children: React.ReactNode;
}) {
  return <View style={[{ padding: 16, borderRadius: 14 }, style]}>{children}</View>;
}

// Network-image panel with a SOLID fallback colour so it always renders.
function ImagePanel({
  name,
  overlay,
  fallback,
  borderColor,
  borderWidth = 1,
  radius = 16,
  glow,
  children,
}: {
  name: string;
  overlay?: string;
  fallback: string;
  borderColor: string;
  borderWidth?: number;
  radius?: number;
  glow?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        { borderRadius: radius, overflow: "hidden", borderWidth, borderColor, backgroundColor: fallback },
        glow
          ? (Platform.select({
              web: { boxShadow: `0 0 18px ${glow}` as any },
              default: {
                shadowColor: glow,
                shadowOpacity: 0.9,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 0 },
                elevation: 8,
              },
            }) as object)
          : null,
      ]}
    >
      <ImageBackground source={url(name)} resizeMode="cover" style={{ width: "100%" }} onError={() => {}}>
        {overlay ? <View style={[StyleSheet.absoluteFillObject, { backgroundColor: overlay }]} /> : null}
        <View style={{ padding: 16 }}>{children}</View>
      </ImageBackground>
    </View>
  );
}

type Panel = { key: string; name: string; tag: string; render: () => React.ReactNode };

const PANELS: Panel[] = [
  // 1 — Shadow Box (plain)
  {
    key: "shadowbox",
    name: "Shadow Box",
    tag: "Floating dark card with a soft drop shadow",
    render: () => (
      <PlainPanel
        style={[
          { backgroundColor: "#1C1E22", borderWidth: 1, borderColor: "#2E3137" },
          Platform.select({
            web: { boxShadow: "0 10px 24px rgba(0,0,0,0.55)" as any },
            default: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
          }) as object,
        ]}
      >
        <SummaryBody t={{ accent: "#FF6A00", title: "#E8E8E8", label: "#C8C8C8", value: "#FFFFFF", pillBorder: "#FF6A00", pillBg: "rgba(255,106,0,0.10)", divider: "#3A3A3A" }} />
      </PlainPanel>
    ),
  },
  // 2 — Brushed Steel (plain metal look)
  {
    key: "steel",
    name: "Brushed Steel",
    tag: "Solid machined-metal panel with bevel edges",
    render: () => (
      <PlainPanel style={{ backgroundColor: "#3b3f45", borderTopWidth: 2, borderTopColor: "#6b7178", borderBottomWidth: 2, borderBottomColor: "#1c1e21", borderLeftWidth: 1, borderRightWidth: 1, borderLeftColor: "#4a4f55", borderRightColor: "#2a2d31" }}>
        <SummaryBody t={{ accent: "#FF7A1A", title: "#F2F2F2", label: "#D5D8DC", value: "#FFFFFF", pillBorder: "#7a818a", pillBg: "rgba(0,0,0,0.30)", divider: "rgba(255,255,255,0.18)" }} />
      </PlainPanel>
    ),
  },
  // 3 — Riveted steel plate (IMAGE)
  {
    key: "riveted",
    name: "Riveted Plate",
    tag: "Steel plate bolted onto the background",
    render: () => (
      <ImagePanel name="riveted_steel" fallback="#3a3f45" overlay="rgba(10,12,16,0.34)" borderColor="#5a5f66">
        <SummaryBody t={{ accent: "#FFB454", title: "#FFFFFF", label: "#E4E6EA", value: "#FFFFFF", pillBorder: "rgba(255,255,255,0.55)", pillBg: "rgba(0,0,0,0.35)", divider: "rgba(255,255,255,0.25)" }} />
      </ImagePanel>
    ),
  },
  // 4 — Carbon fiber (IMAGE)
  {
    key: "carbon",
    name: "Carbon Fiber",
    tag: "Glossy motorsport carbon weave",
    render: () => (
      <ImagePanel name="carbon_fiber" fallback="#141416" overlay="rgba(8,8,10,0.28)" borderColor="#E11D2A" borderWidth={1.5}>
        <SummaryBody t={{ accent: "#FF3B3B", title: "#FFFFFF", label: "#DDDDDD", value: "#FFFFFF", pillBorder: "#FF3B3B", pillBg: "rgba(0,0,0,0.45)", divider: "rgba(255,59,59,0.4)" }} />
      </ImagePanel>
    ),
  },
  // 5 — Black marble + gold (IMAGE)
  {
    key: "marble",
    name: "Black Marble & Gold",
    tag: "Fortune-500 executive luxury",
    render: () => (
      <ImagePanel name="black_marble_gold" fallback="#15130f" overlay="rgba(0,0,0,0.22)" borderColor="#C9A24B">
        <SummaryBody t={{ accent: "#E6C566", title: "#F4E9C9", label: "#E8E2D2", value: "#F8E7A6", pillBorder: "#C9A24B", pillBg: "rgba(0,0,0,0.35)", divider: "rgba(201,162,75,0.55)" }} />
      </ImagePanel>
    ),
  },
  // 6 — Futuristic HUD (IMAGE)
  {
    key: "hud",
    name: "Futuristic HUD",
    tag: "Glowing sci-fi command console",
    render: () => (
      <ImagePanel name="futuristic_hud" fallback="#06121b" overlay="rgba(2,8,16,0.40)" borderColor="#27E0F0" glow="rgba(39,224,240,0.5)">
        <SummaryBody t={{ accent: "#2FE6F6", title: "#CFF9FF", label: "#A9E8F2", value: "#FFFFFF", pillBorder: "#2FE6F6", pillBg: "rgba(0,30,40,0.45)", divider: "rgba(47,230,246,0.4)" }} />
      </ImagePanel>
    ),
  },
  // 7 — Brushed titanium (IMAGE)
  {
    key: "titanium",
    name: "Brushed Titanium",
    tag: "Precision aerospace metal",
    render: () => (
      <ImagePanel name="brushed_titanium" fallback="#c7ccd2" overlay="rgba(240,242,245,0.30)" borderColor="#8a9098">
        <SummaryBody t={{ accent: "#2E6FB0", title: "#1A1F26", label: "#2A3038", value: "#10141A", pillBorder: "#5b6470", pillBg: "rgba(255,255,255,0.55)", divider: "rgba(0,0,0,0.25)" }} />
      </ImagePanel>
    ),
  },
  // 8 — Executive walnut + brass (IMAGE)
  {
    key: "walnut",
    name: "Executive Walnut",
    tag: "Warm walnut & polished brass",
    render: () => (
      <ImagePanel name="walnut_brass" fallback="#3a2417" overlay="rgba(20,10,2,0.30)" borderColor="#B08D57" borderWidth={1.5}>
        <SummaryBody t={{ accent: "#E3B873", title: "#F6E7CC", label: "#EAD9BC", value: "#FBEFD4", pillBorder: "#B08D57", pillBg: "rgba(0,0,0,0.4)", divider: "rgba(176,141,87,0.55)" }} />
      </ImagePanel>
    ),
  },
  // 9 — Industrial concrete (IMAGE)
  {
    key: "concrete",
    name: "Industrial Concrete",
    tag: "Minimalist architectural slab",
    render: () => (
      <ImagePanel name="concrete_industrial" fallback="#ccccca" overlay="rgba(245,245,245,0.34)" borderColor="#9a9a98">
        <SummaryBody t={{ accent: "#E8662A", title: "#23262B", label: "#34373C", value: "#16181C", pillBorder: "#E8662A", pillBg: "rgba(255,255,255,0.5)", divider: "rgba(0,0,0,0.18)" }} />
      </ImagePanel>
    ),
  },
  // 10 — Holographic glass (IMAGE)
  {
    key: "holo",
    name: "Holographic Glass",
    tag: "Iridescent frosted future-glass",
    render: () => (
      <ImagePanel name="holographic_glass" fallback="#15122a" overlay="rgba(10,8,20,0.30)" borderColor="#B388FF" glow="rgba(179,136,255,0.45)">
        <SummaryBody t={{ accent: "#C9A7FF", title: "#F1ECFF", label: "#DCD2F5", value: "#FFFFFF", pillBorder: "rgba(201,167,255,0.8)", pillBg: "rgba(255,255,255,0.12)", divider: "rgba(201,167,255,0.45)" }} />
      </ImagePanel>
    ),
  },
  // 11 — Diamond plate (IMAGE)
  {
    key: "diamond",
    name: "Diamond Plate",
    tag: "Rugged anti-slip tread metal",
    render: () => (
      <ImagePanel name="diamond_plate" fallback="#b9bcc0" overlay="rgba(245,246,248,0.32)" borderColor="#6e7378" borderWidth={1.5}>
        <SummaryBody t={{ accent: "#1B1D20", title: "#16181B", label: "#26292D", value: "#0E0F12", pillBorder: "#1B1D20", pillBg: "rgba(255,210,40,0.85)", divider: "rgba(0,0,0,0.3)" }} />
      </ImagePanel>
    ),
  },
  // 12 — Neon glass (plain)
  {
    key: "neon",
    name: "Neon Glass",
    tag: "Glassmorphic neon-edge card",
    render: () => (
      <PlainPanel
        style={[
          { backgroundColor: "rgba(16,18,28,0.92)", borderWidth: 1, borderColor: "#00E5FF", borderRadius: 16 },
          Platform.select({
            web: { boxShadow: "0 0 16px rgba(255,0,170,0.45)" as any },
            default: { shadowColor: "#FF2BD6", shadowOpacity: 0.7, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
          }) as object,
        ]}
      >
        <SummaryBody t={{ accent: "#00E5FF", title: "#FFFFFF", label: "#D7E6F0", value: "#FF6AD5", pillBorder: "#FF2BD6", pillBg: "rgba(255,43,214,0.10)", divider: "rgba(0,229,255,0.35)" }} />
      </PlainPanel>
    ),
  },
  // 13 — Minimal luxury (plain)
  {
    key: "minimal",
    name: "Minimal Luxury",
    tag: "Quiet wealth — hairline gold on ivory",
    render: () => (
      <PlainPanel style={{ backgroundColor: "#FBF8F1", borderWidth: 1, borderColor: "#D9C68A", borderRadius: 6, padding: 18 }}>
        <SummaryBody t={{ accent: "#B8912F", title: "#1A1A1A", label: "#3A3A3A", value: "#7A5C12", pillBorder: "#D9C68A", pillBg: "rgba(184,145,47,0.06)", divider: "#E6DFC9" }} />
      </PlainPanel>
    ),
  },
  // 14 — Soft neumorphic (plain)
  {
    key: "neumorphic",
    name: "Soft Neumorphic",
    tag: "Soft pressed-clay surfaces",
    render: () => (
      <PlainPanel
        style={[
          { backgroundColor: "#EDF0F5", borderWidth: 1, borderColor: "#F4F6FA", borderRadius: 22 },
          Platform.select({
            web: { boxShadow: "8px 8px 18px #c4c8cf, -8px -8px 18px #ffffff" as any },
            default: { shadowColor: "#aeb3bb", shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 6, height: 6 }, elevation: 6 },
          }) as object,
        ]}
      >
        <SummaryBody t={{ accent: "#5566FF", title: "#3A3F4B", label: "#5A606C", value: "#3A3F4B", pillBorder: "#E3E7EE", pillBg: "#EDF0F5", divider: "#DFE3EA", rowBg: "#ECEFF4" }} />
      </PlainPanel>
    ),
  },
  // 15 — Blueprint tech (plain)
  {
    key: "blueprint",
    name: "Blueprint Tech",
    tag: "Engineering schematic on navy",
    render: () => (
      <View style={{ backgroundColor: "#0A2540", borderRadius: 12, borderWidth: 1, borderColor: "#2E6FA0", padding: 16, overflow: "hidden" }}>
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={`h${i}`} style={{ position: "absolute", left: 0, right: 0, height: 1, top: i * 34 + 8, backgroundColor: "rgba(127,211,255,0.10)" }} />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <View key={`v${i}`} style={{ position: "absolute", top: 0, bottom: 0, width: 1, left: i * 40 + 8, backgroundColor: "rgba(127,211,255,0.10)" }} />
          ))}
        </View>
        <SummaryBody t={{ accent: "#7FD3FF", title: "#DCF1FF", label: "#AFD8F0", value: "#FFFFFF", pillBorder: "#4FA8E0", pillBg: "rgba(20,50,80,0.5)", divider: "rgba(127,211,255,0.4)" }} />
      </View>
    ),
  },
];

export default function PanelShowcase() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [sel, setSel] = useState(0);
  const panelMaxW = Math.min(width - 32, 540);
  const panel = PANELS[sel];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Simple self-contained header (no shared components) */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FF6A00" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.hTitle}>PANEL SHOWCASE</Text>
          <Text style={styles.hSub}>15 unique container designs · TEMP</Text>
        </View>
      </View>

      {/* Horizontal selector */}
      <View style={styles.selectorWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorContent}>
          {PANELS.map((p, i) => {
            const active = i === sel;
            return (
              <TouchableOpacity
                key={p.key}
                onPress={() => setSel(i)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`panel-chip-${i}`}
              >
                <View style={[styles.chipNum, active && styles.chipNumActive]}>
                  <Text style={[styles.chipNumText, active && styles.chipNumTextActive]}>{i + 1}</Text>
                </View>
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.panelTitle}>
          {sel + 1}. {panel.name}
        </Text>
        <Text style={styles.panelTag}>{panel.tag}</Text>
        <View style={{ width: panelMaxW, alignSelf: "center" }}>{panel.render()}</View>
        <Text style={styles.hint}>Swipe the bar above to compare all 15 designs. Tap a name to preview it here.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0E0F12" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  hTitle: { fontSize: 17, fontWeight: "900", color: "#FF6A00", letterSpacing: 1.2 },
  hSub: { fontSize: 11, color: "#8A9098", letterSpacing: 0.6, marginTop: 2 },
  selectorWrap: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#23262B", backgroundColor: "#15171B" },
  selectorContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2C3036",
    backgroundColor: "#1B1E23",
  },
  chipActive: { borderColor: "#FF6A00", backgroundColor: "rgba(255,106,0,0.14)" },
  chipNum: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#2C3036" },
  chipNumActive: { backgroundColor: "#FF6A00" },
  chipNumText: { fontSize: 11, fontWeight: "900", color: "#AAB0B8" },
  chipNumTextActive: { color: "#000" },
  chipText: { fontSize: 13, fontWeight: "700", color: "#AAB0B8" },
  chipTextActive: { color: "#FFFFFF" },
  body: { padding: 16, paddingBottom: 60 },
  panelTitle: { fontSize: 18, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0.4 },
  panelTag: { fontSize: 13, color: "#9AA0A8", marginTop: 2, marginBottom: 16 },
  hint: { fontSize: 12, color: "#6F757D", textAlign: "center", marginTop: 22, lineHeight: 18, paddingHorizontal: 20 },
});
