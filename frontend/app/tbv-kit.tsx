/**
 * /tbv-kit — internal styleguide / preview route for the Toolbox Vault UI kit.
 * Not linked in navigation; used to validate ALL 12 components in BOTH themes.
 */
import React, { useState } from "react";
import { ScrollView, View, Text, StyleSheet, ImageBackground } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useThemeMode } from "../src/themeContext";
import {
  TbvHeader, TbvButton, TbvPanel, TbvSectionBox, TbvAccordion, TbvAccordionRow,
  TbvActionCard, TbvStatCard, TbvInventoryTile, TbvModal,
  useTbvTheme, useTbvFonts, TBV_FONT,
} from "../src/tbv";

function SectionLabel({ children }: { children: string }) {
  const { t } = useTbvTheme();
  return (
    <Text style={[s.sectionLabel, { color: t.orange }]}>{children}</Text>
  );
}

export default function TbvKitPreview() {
  const ready = useTbvFonts();
  const { t, skin } = useTbvTheme();
  const { toggle, mode } = useThemeMode();
  const [modal, setModal] = useState(false);

  if (!ready) return <View style={{ flex: 1, backgroundColor: "#0A0A0A" }} />;

  return (
    <ImageBackground source={skin("background")} resizeMode="cover" style={{ flex: 1 }}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.pageVeil }]} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <TbvHeader subtitle={`FOUNDATION KIT · ${mode.toUpperCase()} MODE`} />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}>

          <TbvButton
            label={`Switch to ${mode === "dark" ? "Light" : "Dark"} Mode`}
            icon="contrast"
            variant="secondary"
            onPress={toggle}
          />

          {/* ── STAT CARDS ── */}
          <SectionLabel>STAT CARDS</SectionLabel>
          <View style={s.statRow}>
            <TbvStatCard style={s.statCell} label="Total Items" value={128} icon="cube" />
            <TbvStatCard style={s.statCell} label="Checked Out" value={14} icon="exit" valueColor={t.text} />
          </View>
          <View style={s.statRow}>
            <TbvStatCard style={s.statCell} label="Net Worth" value="$42.5k" icon="cash" />
            <TbvStatCard style={s.statCell} label="Warranties" value={9} icon="shield-checkmark" valueColor={t.text} />
          </View>

          {/* ── PANEL ── */}
          <SectionLabel>BASE PANEL / DASHBOARD WIDGET</SectionLabel>
          <TbvPanel skin="dashboardWidget">
            <Text style={[s.h, { color: t.headSteel }]}>DASHBOARD WIDGET</Text>
            <Text style={[s.b, { color: t.textMuted }]}>Reusable content module container.</Text>
          </TbvPanel>

          {/* ── SECTION BOX ── */}
          <SectionLabel>SECTION BOX</SectionLabel>
          <TbvSectionBox
            title="Dealer Accounts"
            icon="business"
            right={<Ionicons name="ellipsis-horizontal" size={20} color={t.textMuted} />}
          >
            <Text style={[s.b, { color: t.textMuted }]}>Configurable grouped section content.</Text>
          </TbvSectionBox>

          {/* ── ACTION CARDS ── */}
          <SectionLabel>ACTION CARDS</SectionLabel>
          <TbvActionCard title="Report a Bug" subtitle="Tell us what went wrong" icon="bug" onPress={() => {}} />
          <TbvActionCard title="Quick Add Tool" subtitle="Scan or enter manually" icon="add-circle" onPress={() => {}} />

          {/* ── ACCORDION ── */}
          <SectionLabel>ACCORDION (1–400 rows)</SectionLabel>
          <TbvAccordion title="Sockets & Ratchets" icon="construct" count={3} defaultOpen>
            <TbvAccordionRow label="3/8 Drive Ratchet" value="$89" icon="build" showChevron onPress={() => {}} />
            <TbvAccordionRow label="Socket Set (40pc)" value="$129" icon="build" showChevron onPress={() => {}} />
            <TbvAccordionRow label="Extension Bar" value="$24" icon="build" showChevron onPress={() => {}} last />
          </TbvAccordion>

          {/* ── INVENTORY TILES ── */}
          <SectionLabel>INVENTORY TILES</SectionLabel>
          <TbvInventoryTile
            name="Impact Wrench 1/2&quot;"
            meta="Cabinet A · Drawer 3"
            value="$249"
            status="In"
            onPress={() => {}}
          />
          <TbvInventoryTile
            name="Torque Wrench"
            meta="Checked out · J. Smith"
            value="$179"
            status="Out"
            statusColor="#E0B000"
            onPress={() => {}}
          />

          {/* ── MODAL ── */}
          <SectionLabel>MODAL</SectionLabel>
          <TbvButton label="Open Modal" icon="albums" onPress={() => setModal(true)} />

        </ScrollView>
      </SafeAreaView>

      <TbvModal
        visible={modal}
        onClose={() => setModal(false)}
        title="Confirm Action"
        actions={
          <>
            <TbvButton label="Confirm" icon="checkmark" onPress={() => setModal(false)} />
            <TbvButton label="Cancel" variant="secondary" onPress={() => setModal(false)} />
          </>
        }
      >
        <Text style={[s.b, { color: t.text }]}>
          This is the reusable industrial modal. The panel art, title treatment,
          divider, and buttons all come from the Foundation Kit and respond to the
          active theme.
        </Text>
      </TbvModal>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontFamily: TBV_FONT.head, fontSize: 13, letterSpacing: 2, marginTop: 6 },
  h: { fontFamily: TBV_FONT.head, fontSize: 22, letterSpacing: 1 },
  b: { fontFamily: TBV_FONT.body, fontSize: 14, marginTop: 4, lineHeight: 20 },
  statRow: { flexDirection: "row", gap: 12 },
  statCell: { flex: 1 },
});
