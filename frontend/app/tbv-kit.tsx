/**
 * /tbv-kit — internal styleguide / preview route for the Toolbox Vault UI kit.
 * Not linked in navigation; used to validate components in BOTH themes.
 */
import React from "react";
import { ScrollView, View, Text, StyleSheet, ImageBackground } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeMode } from "../src/themeContext";
import { TbvHeader, TbvButton, TbvPanel, useTbvTheme, useTbvFonts, TBV_FONT } from "../src/tbv";

export default function TbvKitPreview() {
  const ready = useTbvFonts();
  const { t, skin } = useTbvTheme();
  const { toggle, mode } = useThemeMode();
  if (!ready) return <View style={{ flex: 1, backgroundColor: "#0A0A0A" }} />;
  return (
    <ImageBackground source={skin("background")} resizeMode="cover" style={{ flex: 1 }}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.pageVeil }]} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <TbvHeader subtitle={`KIT PREVIEW · ${mode}`} />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}>
          <TbvPanel skin="dashboardWidget">
            <Text style={[s.h, { color: t.headSteel }]}>DASHBOARD WIDGET</Text>
            <Text style={[s.b, { color: t.textMuted }]}>Reusable content module container.</Text>
          </TbvPanel>

          <TbvPanel skin="statCard" pad={18}>
            <Text style={[s.label, { color: t.textMuted }]}>TOTAL ITEMS</Text>
            <Text style={[s.value, { color: t.orange }]}>128</Text>
          </TbvPanel>

          <TbvPanel skin="actionBox">
            <Text style={[s.h, { color: t.headSteel }]}>ACTION CARD</Text>
            <Text style={[s.b, { color: t.textMuted }]}>Interactive surface for quick actions.</Text>
          </TbvPanel>

          <TbvPanel skin="sectionBox">
            <Text style={[s.h, { color: t.headSteel }]}>SECTION BOX (substitute)</Text>
            <Text style={[s.b, { color: t.textMuted }]}>Dealer Accounts / Settings groups.</Text>
          </TbvPanel>

          <TbvButton label="Primary Button" icon="construct" onPress={() => {}} />
          <TbvButton label="Secondary" variant="secondary" onPress={() => {}} />
          <TbvButton label={`Toggle Theme (now: ${mode})`} variant="secondary" onPress={toggle} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  h: { fontFamily: TBV_FONT.head, fontSize: 22, letterSpacing: 1 },
  b: { fontFamily: TBV_FONT.body, fontSize: 13, marginTop: 4 },
  label: { fontFamily: TBV_FONT.head, fontSize: 14, letterSpacing: 1.5 },
  value: { fontFamily: TBV_FONT.label, fontSize: 34, marginTop: 2 },
});
