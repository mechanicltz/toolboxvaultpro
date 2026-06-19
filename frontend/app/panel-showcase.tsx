// =====================================================================
// TEMPORARY DESIGN SHOWCASE  —  /panel-showcase
// 15 unique container-panel designs, each rendering the dashboard
// "summary area". Horizontal selector at top to switch designs.
// 9 panels use AI-generated textures (assets/images/panels/*).
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
import { IndustrialBanner } from "../src/components/IndustrialBanner";
import { ShadowBox } from "../src/components/ShadowBox";
import { TbvFrame } from "../src/tbv/components/TbvFrame";
import { SKIN, CAP } from "../src/tbv/skins";

// ---- AI-generated textures (Gemini Nano Banana) ----
const IMG = {
  riveted_steel: require("../assets/images/panels/riveted_steel.png"),
  carbon_fiber: require("../assets/images/panels/carbon_fiber.png"),
  black_marble_gold: require("../assets/images/panels/black_marble_gold.png"),
  futuristic_hud: require("../assets/images/panels/futuristic_hud.png"),
  brushed_titanium: require("../assets/images/panels/brushed_titanium.png"),
  walnut_brass: require("../assets/images/panels/walnut_brass.png"),
  concrete_industrial: require("../assets/images/panels/concrete_industrial.png"),
  holographic_glass: require("../assets/images/panels/holographic_glass.png"),
  diamond_plate: require("../assets/images/panels/diamond_plate.png"),
};

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
  rowBorder?: string;
};

// Shared summary content — adapts colors to each panel via `t`.
function SummaryBody({ t }: { t: Tone }) {
  return (
    <View>
      <View style={sb.header}>
        <Ionicons name="briefcase" size={18} color={t.accent} />
        <Text style={[sb.title, { color: t.title }]}>PORTFOLIO SUMMARY</Text>
      </View>
      <View style={[sb.divider, { backgroundColor: t.divider }]} />
      {ROWS.map((r) => (
        <View
          key={r.label}
          style={[
            sb.row,
            t.rowBg ? { backgroundColor: t.rowBg } : null,
            t.rowBorder ? { borderWidth: 1, borderColor: t.rowBorder } : null,
          ]}
        >
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

// Image panel wrapper — full-bleed texture, thin border, optional contrast scrim.
function ImagePanel({
  source,
  overlay,
  borderColor,
  borderWidth = 1,
  radius = 16,
  glow,
  children,
}: {
  source: any;
  overlay?: string;
  borderColor: string;
  borderWidth?: number;
  radius?: number;
  glow?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        { borderRadius: radius, overflow: "hidden", borderWidth, borderColor },
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
      <ImageBackground source={source} resizeMode="cover" style={{ width: "100%" }}>
        {overlay ? (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: overlay }]} />
        ) : null}
        <View style={{ padding: 16 }}>{children}</View>
      </ImageBackground>
    </View>
  );
}

// ===================================================================
// 15 PANEL DESIGNS
// ===================================================================
type Panel = { key: string; name: string; tag: string; render: () => React.ReactNode };

const PANELS: Panel[] = [
  // 1 — Shadow Box (existing plain-theme design)
  {
    key: "shadowbox",
    name: "Shadow Box",
    tag: "Your current floating description-card look",
    render: () => (
      <ShadowBox style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
        <SummaryBody
          t={{
            accent: "#FF6A00",
            title: "#E8E8E8",
            label: "#C8C8C8",
            value: "#FFFFFF",
            pillBorder: "#FF6A00",
            pillBg: "rgba(255,106,0,0.10)",
            divider: "#3A3A3A",
          }}
        />
      </ShadowBox>
    ),
  },
  // 2 — Skinned metal window frame (existing industrial skin)
  {
    key: "skinned",
    name: "Skinned Steel",
    tag: "Your current industrial skin frame",
    render: () => (
      <TbvFrame source={SKIN.window} capInsets={CAP.window} padX={26} padTop={22} padBottom={22}>
        <SummaryBody
          t={{
            accent: "#FF7A1A",
            title: "#F2E9DD",
            label: "#D8CFC2",
            value: "#FFFFFF",
            pillBorder: "#FF7A1A",
            pillBg: "rgba(0,0,0,0.25)",
            divider: "rgba(255,255,255,0.18)",
          }}
        />
      </TbvFrame>
    ),
  },
  // 3 — Riveted steel plate (IMAGE)
  {
    key: "riveted",
    name: "Riveted Plate",
    tag: "Steel plate bolted onto the background",
    render: () => (
      <ImagePanel source={IMG.riveted_steel} overlay="rgba(10,12,16,0.34)" borderColor="#5a5f66" borderWidth={1}>
        <SummaryBody
          t={{
            accent: "#FFB454",
            title: "#FFFFFF",
            label: "#E4E6EA",
            value: "#FFFFFF",
            pillBorder: "rgba(255,255,255,0.55)",
            pillBg: "rgba(0,0,0,0.35)",
            divider: "rgba(255,255,255,0.25)",
          }}
        />
      </ImagePanel>
    ),
  },
  // 4 — Carbon fiber + red stitch (IMAGE)
  {
    key: "carbon",
    name: "Carbon Fiber",
    tag: "Glossy motorsport carbon weave",
    render: () => (
      <ImagePanel source={IMG.carbon_fiber} overlay="rgba(8,8,10,0.28)" borderColor="#E11D2A" borderWidth={1.5}>
        <SummaryBody
          t={{
            accent: "#FF3B3B",
            title: "#FFFFFF",
            label: "#DDDDDD",
            value: "#FFFFFF",
            pillBorder: "#FF3B3B",
            pillBg: "rgba(0,0,0,0.45)",
            divider: "rgba(255,59,59,0.4)",
          }}
        />
      </ImagePanel>
    ),
  },
  // 5 — Black marble + gold (IMAGE, Fortune 500)
  {
    key: "marble",
    name: "Black Marble & Gold",
    tag: "Fortune-500 executive luxury",
    render: () => (
      <ImagePanel source={IMG.black_marble_gold} overlay="rgba(0,0,0,0.22)" borderColor="#C9A24B" borderWidth={1}>
        <SummaryBody
          t={{
            accent: "#E6C566",
            title: "#F4E9C9",
            label: "#E8E2D2",
            value: "#F8E7A6",
            pillBorder: "#C9A24B",
            pillBg: "rgba(0,0,0,0.35)",
            divider: "rgba(201,162,75,0.55)",
          }}
        />
      </ImagePanel>
    ),
  },
  // 6 — Futuristic HUD (IMAGE, high-tech)
  {
    key: "hud",
    name: "Futuristic HUD",
    tag: "Glowing sci-fi command console",
    render: () => (
      <ImagePanel
        source={IMG.futuristic_hud}
        overlay="rgba(2,8,16,0.40)"
        borderColor="#27E0F0"
        borderWidth={1}
        glow="rgba(39,224,240,0.5)"
      >
        <SummaryBody
          t={{
            accent: "#2FE6F6",
            title: "#CFF9FF",
            label: "#A9E8F2",
            value: "#FFFFFF",
            pillBorder: "#2FE6F6",
            pillBg: "rgba(0,30,40,0.45)",
            divider: "rgba(47,230,246,0.4)",
          }}
        />
      </ImagePanel>
    ),
  },
  // 7 — Brushed titanium (IMAGE)
  {
    key: "titanium",
    name: "Brushed Titanium",
    tag: "Precision aerospace metal",
    render: () => (
      <ImagePanel source={IMG.brushed_titanium} overlay="rgba(240,242,245,0.30)" borderColor="#8a9098" borderWidth={1}>
        <SummaryBody
          t={{
            accent: "#2E6FB0",
            title: "#1A1F26",
            label: "#2A3038",
            value: "#10141A",
            pillBorder: "#5b6470",
            pillBg: "rgba(255,255,255,0.55)",
            divider: "rgba(0,0,0,0.25)",
          }}
        />
      </ImagePanel>
    ),
  },
  // 8 — Executive walnut + brass (IMAGE)
  {
    key: "walnut",
    name: "Executive Walnut",
    tag: "Warm walnut & polished brass",
    render: () => (
      <ImagePanel source={IMG.walnut_brass} overlay="rgba(20,10,2,0.30)" borderColor="#B08D57" borderWidth={1.5}>
        <SummaryBody
          t={{
            accent: "#E3B873",
            title: "#F6E7CC",
            label: "#EAD9BC",
            value: "#FBEFD4",
            pillBorder: "#B08D57",
            pillBg: "rgba(0,0,0,0.4)",
            divider: "rgba(176,141,87,0.55)",
          }}
        />
      </ImagePanel>
    ),
  },
  // 9 — Industrial concrete (IMAGE)
  {
    key: "concrete",
    name: "Industrial Concrete",
    tag: "Minimalist architectural slab",
    render: () => (
      <ImagePanel source={IMG.concrete_industrial} overlay="rgba(245,245,245,0.34)" borderColor="#9a9a98" borderWidth={1}>
        <SummaryBody
          t={{
            accent: "#E8662A",
            title: "#23262B",
            label: "#34373C",
            value: "#16181C",
            pillBorder: "#E8662A",
            pillBg: "rgba(255,255,255,0.5)",
            divider: "rgba(0,0,0,0.18)",
          }}
        />
      </ImagePanel>
    ),
  },
  // 10 — Holographic glass (IMAGE)
  {
    key: "holo",
    name: "Holographic Glass",
    tag: "Iridescent frosted future-glass",
    render: () => (
      <ImagePanel
        source={IMG.holographic_glass}
        overlay="rgba(10,8,20,0.30)"
        borderColor="#B388FF"
        borderWidth={1}
        glow="rgba(179,136,255,0.45)"
      >
        <SummaryBody
          t={{
            accent: "#C9A7FF",
            title: "#F1ECFF",
            label: "#DCD2F5",
            value: "#FFFFFF",
            pillBorder: "rgba(201,167,255,0.8)",
            pillBg: "rgba(255,255,255,0.12)",
            divider: "rgba(201,167,255,0.45)",
          }}
        />
      </ImagePanel>
    ),
  },
  // 11 — Diamond plate (IMAGE, rugged)
  {
    key: "diamond",
    name: "Diamond Plate",
    tag: "Rugged anti-slip tread metal",
    render: () => (
      <ImagePanel source={IMG.diamond_plate} overlay="rgba(245,246,248,0.32)" borderColor="#6e7378" borderWidth={1.5}>
        <SummaryBody
          t={{
            accent: "#1B1D20",
            title: "#16181B",
            label: "#26292D",
            value: "#0E0F12",
            pillBorder: "#1B1D20",
            pillBg: "rgba(255,210,40,0.85)",
            divider: "rgba(0,0,0,0.3)",
          }}
        />
      </ImagePanel>
    ),
  },
  // 12 — Neon glassmorphism (UI, high-tech)
  {
    key: "neon",
    name: "Neon Glass",
    tag: "Glassmorphic neon-edge card",
    render: () => (
      <View
        style={[
          ui.neon,
          Platform.select({
            web: { boxShadow: "0 0 16px rgba(255,0,170,0.45), inset 0 0 24px rgba(0,200,255,0.10)" as any },
            default: { shadowColor: "#FF2BD6", shadowOpacity: 0.7, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
          }) as object,
        ]}
      >
        <SummaryBody
          t={{
            accent: "#00E5FF",
            title: "#FFFFFF",
            label: "#D7E6F0",
            value: "#FF6AD5",
            pillBorder: "#FF2BD6",
            pillBg: "rgba(255,43,214,0.10)",
            divider: "rgba(0,229,255,0.35)",
          }}
        />
      </View>
    ),
  },
  // 13 — Minimal luxury hairline (UI, Fortune 500)
  {
    key: "minimal",
    name: "Minimal Luxury",
    tag: "Quiet wealth — hairline gold on ivory",
    render: () => (
      <View style={ui.minimal}>
        <SummaryBody
          t={{
            accent: "#B8912F",
            title: "#1A1A1A",
            label: "#3A3A3A",
            value: "#7A5C12",
            pillBorder: "#D9C68A",
            pillBg: "rgba(184,145,47,0.06)",
            divider: "#E6DFC9",
          }}
        />
      </View>
    ),
  },
  // 14 — Neumorphic soft (UI)
  {
    key: "neumorphic",
    name: "Soft Neumorphic",
    tag: "Soft pressed-clay surfaces",
    render: () => (
      <View
        style={[
          ui.neu,
          Platform.select({
            web: { boxShadow: "8px 8px 18px #c4c8cf, -8px -8px 18px #ffffff" as any },
            default: { shadowColor: "#aeb3bb", shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 6, height: 6 }, elevation: 6 },
          }) as object,
        ]}
      >
        <SummaryBody
          t={{
            accent: "#5566FF",
            title: "#3A3F4B",
            label: "#5A606C",
            value: "#3A3F4B",
            pillBorder: "#E3E7EE",
            pillBg: "#EDF0F5",
            divider: "#DFE3EA",
            rowBg: "#ECEFF4",
          }}
        />
      </View>
    ),
  },
  // 15 — Blueprint tech grid (UI)
  {
    key: "blueprint",
    name: "Blueprint Tech",
    tag: "Engineering schematic on navy",
    render: () => (
      <View style={ui.blueprint}>
        <View pointerEvents="none" style={ui.blueprintGrid}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={`h${i}`} style={[ui.bpLineH, { top: i * 34 + 8 }]} />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <View key={`v${i}`} style={[ui.bpLineV, { left: i * 40 + 8 }]} />
          ))}
        </View>
        <SummaryBody
          t={{
            accent: "#7FD3FF",
            title: "#DCF1FF",
            label: "#AFD8F0",
            value: "#FFFFFF",
            pillBorder: "#4FA8E0",
            pillBg: "rgba(20,50,80,0.5)",
            divider: "rgba(127,211,255,0.4)",
          }}
        />
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
      <IndustrialBanner
        title="PANEL SHOWCASE"
        subtitle="15 unique container designs · TEMP"
        onBack={() => router.back()}
      />

      {/* Horizontal selector */}
      <View style={styles.selectorWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.selectorContent}
        >
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
                  <Text style={[styles.chipNumText, active && styles.chipNumTextActive]}>
                    {i + 1}
                  </Text>
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
        <Text style={styles.hint}>
          Swipe the bar above to compare all 15 designs. Tap a name to preview it here.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0E0F12" },
  selectorWrap: {
    borderBottomWidth: 1,
    borderBottomColor: "#23262B",
    backgroundColor: "#15171B",
  },
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
  chipNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2C3036",
  },
  chipNumActive: { backgroundColor: "#FF6A00" },
  chipNumText: { fontSize: 11, fontWeight: "900", color: "#AAB0B8" },
  chipNumTextActive: { color: "#000" },
  chipText: { fontSize: 13, fontWeight: "700", color: "#AAB0B8" },
  chipTextActive: { color: "#FFFFFF" },
  body: { padding: 16, paddingBottom: 60 },
  panelTitle: { fontSize: 18, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0.4 },
  panelTag: { fontSize: 13, color: "#9AA0A8", marginTop: 2, marginBottom: 16 },
  hint: {
    fontSize: 12,
    color: "#6F757D",
    textAlign: "center",
    marginTop: 22,
    lineHeight: 18,
    paddingHorizontal: 20,
  },
});

const ui = StyleSheet.create({
  neon: {
    backgroundColor: "rgba(16,18,28,0.85)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#00E5FF",
    padding: 16,
  },
  minimal: {
    backgroundColor: "#FBF8F1",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D9C68A",
    padding: 18,
  },
  neu: {
    backgroundColor: "#EDF0F5",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#F4F6FA",
    padding: 16,
  },
  blueprint: {
    backgroundColor: "#0A2540",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2E6FA0",
    padding: 16,
    overflow: "hidden",
  },
  blueprintGrid: { ...StyleSheet.absoluteFillObject },
  bpLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(127,211,255,0.10)",
  },
  bpLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(127,211,255,0.10)",
  },
});
