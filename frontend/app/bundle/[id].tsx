import { AppImage } from "../../src/components/AppImage";
import { useState, useCallback, type ReactNode } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { confirm } from "../../src/confirm";
import { themedStyles, useSkin } from "../../src/themeContext";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { PillButton } from "../../src/components/PillButton";
import { ShadowBox } from "../../src/components/ShadowBox";
import { SKIN, CAP } from "../../src/tbv/skins";
import { useIsSteel, useSteelPanelFrame } from "../../src/tbv/steel";
import { TbvFrame } from "../../src/tbv/components/TbvFrame";

export default function BundleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const isSteel = useIsSteel();
  const steelPanel = useSteelPanelFrame();
  const winSrc = isSteel ? steelPanel.source : SKIN.window;
  const winCap = isSteel ? steelPanel.capInsets : CAP.window;
  const steelScale = isSteel ? steelPanel.frameScale : undefined;
  const [bundle, setBundle] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setBundle(await api.getBundle(id));
    } catch (e: any) {
      Alert.alert("Error", e?.detail || e?.message || "Could not load set");
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onDelete = useCallback(async () => {
    const count = bundle?.items?.length || 0;
    const ok = await confirm(
      "Delete this set?",
      count > 0
        ? `This will permanently delete the set AND all ${count} item${count === 1 ? "" : "s"} inside it. This cannot be undone.`
        : "This will permanently delete the set. This cannot be undone.",
      "Delete Set",
      true,
    );
    if (!ok) return;
    try {
      await api.deleteBundle(id);
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e?.detail || e?.message || "Could not delete set");
    }
  }, [bundle, id, router]);

  // Industrial themes wrap card content in a metal TbvFrame; plain Light/Dark
  // use the flat ShadowBox. Mirrors the Dealer detail screen exactly.
  const CardShell = ({ children, testID }: { children: ReactNode; testID?: string }) =>
    isIndustrial ? (
      <View style={styles.cardSkinWrap}>
        <TbvFrame source={winSrc} capInsets={winCap} frameScale={steelScale} padX={36} padTop={20} padBottom={20} testID={testID}>
          {children}
        </TbvFrame>
      </View>
    ) : (
      <ShadowBox testID={testID} style={styles.detailsBox}>{children}</ShadowBox>
    );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }
  if (!bundle) return null;

  const items = bundle.items || [];
  const itemsTotal = items.reduce((s: number, i: any) => s + (Number(i.cost) || 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title="SET DETAILS"
        subtitle={bundle.name}
        onBack={() => router.canGoBack() ? router.back() : router.replace("/bundle")}
      />

      <View style={styles.actionsRow}>
        <PillButton
          testID="bundle-edit-btn"
          label="EDIT"
          icon="create-outline"
          variant="active"
          onPress={() => router.push(`/bundle/edit?id=${id}`)}
        />
        <PillButton
          testID="bundle-delete-btn"
          label="DELETE"
          icon="trash-outline"
          variant="danger"
          onPress={onDelete}
        />
      </View>

      <ScrollView style={{ backgroundColor: theme.colors.canvas }} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.heroBox}>
          {bundle.photos?.[0] ? (
            <AppImage source={{ uri: bundle.photos[0] }} style={styles.hero} />
          ) : (
            <View style={[styles.hero, styles.heroEmpty]}>
              <Ionicons name="cube" size={40} color={theme.colors.textMuted} />
            </View>
          )}
          <Text style={styles.setName}>{bundle.name}</Text>
          {!!bundle.part_number && <Text style={styles.setSub}>PART #{bundle.part_number}</Text>}
        </View>

        {/* PRICING */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabelStrong}>PRICING</Text>
        </View>
        <CardShell testID="bundle-pricing-card">
          <View style={styles.detailsRow}>
            <Text style={styles.detailsLabel}>SET PRICE</Text>
            <Text style={[styles.detailsValue, styles.valueAccent]}>${(Number(bundle.set_price) || 0).toFixed(2)}</Text>
          </View>
          <View style={styles.detailsRow}>
            <Text style={styles.detailsLabel}>ITEMS TOTAL (INDIVIDUAL)</Text>
            <Text style={styles.detailsValue}>${itemsTotal.toFixed(2)}</Text>
          </View>
          <View style={[styles.detailsRow, styles.detailsRowLast]}>
            <Text style={styles.detailsLabel}>ITEMS IN SET</Text>
            <Text style={styles.detailsValue}>{items.length}</Text>
          </View>
        </CardShell>

        {!!bundle.notes && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabelStrong}>NOTES</Text>
            </View>
            <CardShell testID="bundle-notes-card">
              <Text style={styles.notes}>{bundle.notes}</Text>
            </CardShell>
          </>
        )}

        {/* ITEMS IN THIS SET */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabelStrong}>ITEMS IN THIS SET</Text>
        </View>
        <CardShell testID="bundle-items-card">
          {items.length === 0 ? (
            <View style={[styles.detailsRow, styles.detailsRowLast]}>
              <Text style={styles.emptyText}>No items in this set yet. Tap EDIT to add some.</Text>
            </View>
          ) : (
            items.map((it: any, idx: number) => (
              <TouchableOpacity
                key={it.id}
                testID={`bundle-detail-item-${it.id}`}
                style={[styles.detailsRow, idx === items.length - 1 && styles.detailsRowLast]}
                activeOpacity={0.6}
                onPress={() => router.push(`/tool/${it.id}`)}
              >
                {it.photos?.[0] ? (
                  <AppImage source={{ uri: it.photos[0] }} style={styles.itemThumb} />
                ) : (
                  <View style={[styles.itemThumb, styles.itemThumbEmpty]}>
                    <Ionicons name="construct" size={16} color={theme.colors.textMuted} />
                  </View>
                )}
                <View style={styles.itemTextWrap}>
                  <Text style={styles.itemName} numberOfLines={1}>{it.name || "Unnamed item"}</Text>
                  {(it.model || it.model_numbers?.[0]) ? (
                    <Text style={styles.itemModel} numberOfLines={1}>{it.model || it.model_numbers[0]}</Text>
                  ) : null}
                </View>
                <Text style={styles.itemCost}>${Number(it.cost) || 0}</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </CardShell>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  actionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },

  heroBox: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  hero: { width: 120, height: 120, borderRadius: 10, marginBottom: 8 },
  heroEmpty: { backgroundColor: c.bgSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  setName: { color: c.textPrimary, fontSize: 18, fontWeight: "900", letterSpacing: 1, marginTop: 4, textAlign: "center", paddingHorizontal: 24 },
  setSub: { color: c.textMuted, fontSize: 8, fontWeight: "800", letterSpacing: 1.5, marginTop: 4 },

  sectionHeader: { flexDirection: "row", alignItems: "center" },
  sectionLabelStrong: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },

  // Skinned-card wrapper + flat fallback — identical tokens to Dealer detail.
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
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
    gap: 10,
  },
  detailsRowLast: { borderBottomWidth: 0 },
  detailsLabel: { color: c.textMuted, fontSize: 7, fontWeight: "800", letterSpacing: 1.5, flexShrink: 1 },
  detailsValue: { color: c.textPrimary, fontSize: 10, fontWeight: "700", textAlign: "right" },
  valueAccent: { color: c.accent },

  notes: { color: c.textSecondary, fontSize: 11, lineHeight: 17, paddingVertical: 8 },

  // Item rows inside the ITEMS card
  itemThumb: { width: 34, height: 34, borderRadius: 6 },
  itemThumbEmpty: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  itemTextWrap: { flex: 1, minWidth: 0 },
  itemName: { color: c.textPrimary, fontSize: 12, fontWeight: "700" },
  itemModel: { color: c.textMuted, fontSize: 8, fontWeight: "700", letterSpacing: 0.5, marginTop: 2 },
  itemCost: { color: c.textPrimary, fontSize: 10, fontWeight: "700" },
  emptyText: { color: c.textMuted, fontSize: 9, fontStyle: "italic", paddingVertical: 6 },
}));
