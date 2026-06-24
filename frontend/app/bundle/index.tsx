import { AppImage } from "../../src/components/AppImage";
import { useState, useCallback, type ReactNode } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { themedStyles, useSkin } from "../../src/themeContext";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { ShadowBox } from "../../src/components/ShadowBox";
import { AddFab } from "../../src/components/AddFab";
import { SKIN, CAP } from "../../src/tbv/skins";
import { useIsSteel, useSteelPanelFrame } from "../../src/tbv/steel";
import { TbvFrame } from "../../src/tbv/components/TbvFrame";
import { TbvListPanel } from "../../src/tbv/components/TbvListPanel";

export default function BundlesList() {
  const router = useRouter();
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const isSteel = useIsSteel();
  const steelPanel = useSteelPanelFrame();
  const winSrc = isSteel ? steelPanel.source : SKIN.window;
  const winCap = isSteel ? steelPanel.capInsets : CAP.window;
  const steelScale = isSteel ? steelPanel.frameScale : undefined;
  const [bundles, setBundles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      // Bundles are now tools flagged is_bundle. Migrate any old-format bundles
      // first (non-destructive, idempotent) so live users keep their data.
      try { await api.migrateBundlesToTools(); } catch {}
      const list = await api.listTools({ is_bundle: true }, { forceFresh: true } as any);
      setBundles(Array.isArray(list) ? list : []);
    } catch {
      setBundles([]);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  const createBundleAndOpen = async () => {
    try {
      const created = await api.createTool({ name: "New Set", is_bundle: true });
      router.push(`/tool/${created.id}?startEdit=1&startFresh=1` as any);
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const CardShell = ({ children, testID }: { children: ReactNode; testID?: string }) =>
    isIndustrial ? (
      <View style={styles.cardSkinWrap}>
        <TbvFrame source={winSrc} capInsets={winCap} frameScale={steelScale} padX={36} padTop={16} padBottom={16} testID={testID}>
          {children}
        </TbvFrame>
      </View>
    ) : (
      <ShadowBox testID={testID} style={styles.detailsBox}>{children}</ShadowBox>
    );

  const bundleRows = bundles.map((b, idx) => (
    <TouchableOpacity
      key={b.id}
      testID={`bundle-card-${b.id}`}
      style={[styles.row, idx === bundles.length - 1 && styles.rowLast]}
      activeOpacity={0.6}
      onPress={() => router.push(`/tool/${b.id}`)}
    >
      {b.photos?.[0] ? (
        <AppImage source={{ uri: b.photos[0] }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Ionicons name="cube" size={18} color={theme.colors.accent} />
        </View>
      )}
      <View style={styles.textWrap}>
        <Text style={styles.name} numberOfLines={1}>{b.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {b.model_numbers?.[0] ? `#${b.model_numbers[0]}  ·  ` : ""}
          {(b.inside_items?.length || 0)} item{(b.inside_items?.length || 0) === 1 ? "" : "s"}
        </Text>
      </View>
      <Text style={styles.price}>${(Number(b.cost) || 0).toFixed(2)}</Text>
      <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
    </TouchableOpacity>
  ));

  const refreshCtl = (
    <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.accent} />
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title="SETS & BUNDLES"
        subtitle={`${bundles.length} set${bundles.length === 1 ? "" : "s"}`}
        onBack={() => router.canGoBack() ? router.back() : router.replace("/more")}
      />
      {loading ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 100 }} />
      ) : bundles.length === 0 ? (
        <ScrollView
          style={{ backgroundColor: theme.colors.canvas }}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 120 }}
          refreshControl={refreshCtl}
        >
          <CardShell testID="bundles-empty-card">
            <View style={styles.emptyWrap}>
              <Ionicons name="cube-outline" size={36} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>NO SETS YET</Text>
              <Text style={styles.emptySub}>
                Group items into a set (e.g. a socket set) with its own part # and price.
              </Text>
            </View>
          </CardShell>
        </ScrollView>
      ) : isIndustrial ? (
        // Fixed-height metal panel: the list scrolls INSIDE it (matches Inventory).
        <TbvListPanel
          source={winSrc}
          capInsets={winCap}
          frameScale={steelScale}
          style={styles.skinListPanel}
          padX={36}
          padTop={16}
          padBottom={16}
        >
          <ScrollView showsVerticalScrollIndicator={false} refreshControl={refreshCtl} contentContainerStyle={{ paddingBottom: 8 }}>
            {bundleRows}
          </ScrollView>
        </TbvListPanel>
      ) : (
        <ScrollView
          style={{ backgroundColor: theme.colors.canvas }}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 120 }}
          refreshControl={refreshCtl}
        >
          <ShadowBox testID="bundles-card" style={styles.detailsBox}>{bundleRows}</ShadowBox>
        </ScrollView>
      )}
      <AddFab testID="add-bundle-fab" onPress={createBundleAndOpen} />
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  skinListPanel: { flex: 1, marginHorizontal: 16, marginTop: 8, marginBottom: 12 },

  cardSkinWrap: { marginHorizontal: 16, marginTop: 4, marginBottom: 12 },
  detailsBox: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    ...(theme.elevation.md as object),
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  rowLast: { borderBottomWidth: 0 },
  thumb: { width: 40, height: 40, borderRadius: 6 },
  thumbEmpty: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  textWrap: { flex: 1, minWidth: 0 },
  name: { color: c.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  sub: { color: c.textMuted, fontSize: 8, fontWeight: "800", letterSpacing: 1, marginTop: 3 },
  price: { color: c.textPrimary, fontSize: 11, fontWeight: "800" },

  emptyWrap: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 20 },
  emptyTitle: { color: c.textPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 2, marginTop: 12 },
  emptySub: { color: c.textMuted, fontSize: 9, fontWeight: "700", textAlign: "center", marginTop: 8, lineHeight: 15, letterSpacing: 0.5 },
}));
