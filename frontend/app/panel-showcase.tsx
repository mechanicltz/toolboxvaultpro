// =====================================================================
// PANEL PREVIEW  —  /panel-showcase   (TEMPORARY)
// Shows reference design #3 (ornate parchment frame) rebuilt as a
// recolorable VECTOR asset. Tap a colour to repaint the same frame —
// this is exactly how it would behave as a per-theme container.
// >>> TEMPORARY: remove this file + the Vault link when done. <<<
// =====================================================================
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import OrnateFramePanel, { makeTone } from "../src/components/OrnateFramePanel";

const VARIANTS = [
  { name: "Parchment Gold", tint: "#B6892E" },
  { name: "Royal Blue", tint: "#2E5FB8" },
  { name: "Emerald", tint: "#1E8A5B" },
  { name: "Crimson", tint: "#B33A3A" },
  { name: "Royal Purple", tint: "#7A3FB8" },
  { name: "Graphite", tint: "#566069" },
];

const ROWS: { icon: any; label: string; value: string }[] = [
  { icon: "cube", label: "TOTAL ITEMS", value: "142" },
  { icon: "cash", label: "NET WORTH", value: "$48,250" },
  { icon: "arrow-redo", label: "CHECKED OUT", value: "3" },
  { icon: "pricetag", label: "SELLING", value: "5" },
  { icon: "heart", label: "WISH LIST", value: "12" },
];

function SummaryBody({ tint }: { tint: string }) {
  const t = makeTone(tint);
  return (
    <View>
      <View style={sb.header}>
        <Ionicons name="briefcase" size={18} color={t.accent} />
        <Text style={[sb.title, { color: t.title }]}>PORTFOLIO SUMMARY</Text>
      </View>
      <View style={[sb.divider, { backgroundColor: t.divider }]} />
      {ROWS.map((r) => (
        <View key={r.label} style={sb.row}>
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

export default function PanelShowcase() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState(0);
  const tint = VARIANTS[selected].tint;

  const W = Math.min(width - 36, 380);
  const H = 380;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#E9C46A" />
          <Text style={styles.backTxt}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>ORNATE FRAME</Text>
        <Text style={styles.sub}>Design #3 · rebuilt as a recolorable theme asset</Text>

        {/* colour selector */}
        <View style={styles.swatchRow}>
          {VARIANTS.map((v, i) => (
            <TouchableOpacity
              key={v.name}
              onPress={() => setSelected(i)}
              style={[
                styles.swatch,
                { backgroundColor: v.tint },
                selected === i && styles.swatchActive,
              ]}
              hitSlop={6}
            />
          ))}
        </View>
        <Text style={styles.variantName}>{VARIANTS[selected].name}</Text>

        {/* the frame */}
        <View style={styles.frameWrap}>
          <OrnateFramePanel tint={tint} width={W} height={H}>
            <SummaryBody tint={tint} />
          </OrnateFramePanel>
        </View>

        <Text style={styles.note}>
          Same vector frame, painted from one colour value. It stays sharp at any
          size and can follow each app theme automatically.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B0B0C" },
  headerBar: { paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { flexDirection: "row", alignItems: "center" },
  backTxt: { color: "#E9C46A", fontSize: 16, marginLeft: 2 },
  scroll: { alignItems: "center", paddingBottom: 48, paddingHorizontal: 16 },
  h1: {
    color: "#E9C46A",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 4,
  },
  sub: { color: "#9A9A9A", fontSize: 13, marginTop: 4, marginBottom: 20 },
  swatchRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
  },
  swatchActive: { borderColor: "#FFFFFF", transform: [{ scale: 1.18 }] },
  variantName: {
    color: "#DDD",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 18,
  },
  frameWrap: { alignItems: "center" },
  note: {
    color: "#7E7E80",
    fontSize: 12,
    textAlign: "center",
    marginTop: 22,
    lineHeight: 18,
    maxWidth: 340,
  },
});

const sb = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 9 },
  title: { fontSize: 15, fontWeight: "900", letterSpacing: 1.4 },
  divider: { height: 1, marginTop: 10, marginBottom: 6, opacity: 0.7 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 9 },
  label: { flex: 1, fontSize: 12.5, fontWeight: "700", letterSpacing: 0.6 },
  pill: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 3,
    minWidth: 64,
    alignItems: "center",
  },
  value: { fontSize: 13, fontWeight: "800" },
});
