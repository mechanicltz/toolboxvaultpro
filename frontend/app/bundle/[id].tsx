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
import { ShadowBox } from "../../src/components/ShadowBox";
import { SKIN, CAP } from "../../src/tbv/skins";
import { TbvFrame } from "../../src/tbv/components/TbvFrame";

export default function BundleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const [bundle, setBundle] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const b = await api.getBundle(id);
      setBundle(b);
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }
  if (!bundle) return null;

  const items = bundle.items || [];
  const itemsTotal = items.reduce((s: number, i: any) => s + (i.cost || 0), 0);

  const CardShell = ({ children, testID }: { children: ReactNode; testID?: string }) =>
    isIndustrial ? (
      <View style={styles.cardSkinWrap}>
        <TbvFrame source={SKIN.window} capInsets={CAP.window} padX={36} padTop={26} padBottom={26} testID={testID}>
          {children}
        </TbvFrame>
      </View>
    ) : (
      <ShadowBox testID={testID} style={styles.card}>{children}</ShadowBox>
    );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title="SET DETAILS"
        subtitle={bundle.name}
        leftSlot={
          <TouchableOpacity
            testID="bundle-detail-back"
            onPress={() => router.canGoBack() ? router.back() : router.replace("/inventory")}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color="#F97316" />
          </TouchableOpacity>
        }
        rightSlot={
          <TouchableOpacity
            testID="bundle-edit-btn"
            onPress={() => router.push(`/bundle/edit?id=${id}`)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="create-outline" size={22} color="#F97316" />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        {bundle.photos?.length > 0 && (
          <Image source={{ uri: bundle.photos[0] }} style={styles.hero} />
        )}

        <CardShell testID="bundle-info-card">
          <Text style={styles.bigName}>{bundle.name}</Text>
          <View style={styles.metaRow}>
            {!!bundle.part_number && (
              <View style={styles.pill}>
                <Ionicons name="barcode-outline" size={12} color={theme.colors.accent} />
                <Text style={styles.pillText}>{bundle.part_number}</Text>
              </View>
            )}
            <View style={styles.pill}>
              <Ionicons name="cube-outline" size={12} color={theme.colors.accent} />
              <Text style={styles.pillText}>{items.length} item{items.length === 1 ? "" : "s"}</Text>
            </View>
          </View>
          {!!bundle.notes && <Text style={styles.notes}>{bundle.notes}</Text>}
        </CardShell>

        {/* Pricing comparison */}
        <CardShell testID="bundle-pricing-card">
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>SET PRICE</Text>
            <Text style={styles.priceValAccent}>${(bundle.set_price || 0).toFixed(2)}</Text>
          </View>
          <View style={[styles.priceRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.priceLabel}>ITEMS TOTAL (individual)</Text>
            <Text style={styles.priceVal}>${itemsTotal.toFixed(2)}</Text>
          </View>
        </CardShell>

        {/* Items */}
        <Text style={styles.sectionTitle}>ITEMS IN THIS SET</Text>
        {items.length === 0 ? (
          <Text style={styles.helper}>No items in this set yet. Tap edit to add some.</Text>
        ) : (
          items.map((it: any) => (
            <TouchableOpacity
              key={it.id}
              testID={`bundle-detail-item-${it.id}`}
              style={styles.itemRow}
              onPress={() => router.push(`/tool/${it.id}`)}
            >
              {it.photos?.[0] ? (
                <Image source={{ uri: it.photos[0] }} style={styles.itemThumb} />
              ) : (
                <View style={[styles.itemThumb, styles.itemThumbEmpty]}>
                  <Ionicons name="construct" size={18} color={theme.colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
                <Text style={styles.itemSub}>
                  {(it.model || it.model_numbers?.[0]) ? `${it.model || it.model_numbers[0]} · ` : ""}
                  ${it.cost || 0}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity testID="bundle-delete-btn" style={styles.deleteBtn} onPress={onDelete}>
          <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
          <Text style={styles.deleteBtnText}>DELETE SET & ALL ITEMS</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  cardSkinWrap: { marginBottom: 14 },
  hero: { width: "100%", height: 180, borderRadius: 12, marginBottom: 14 },
  card: {
    backgroundColor: c.surface, borderRadius: 12, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: c.border,
  },
  bigName: { color: c.textPrimary, fontSize: 20, fontWeight: "900" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: c.accent + "18", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  pillText: { color: c.accent, fontSize: 11, fontWeight: "800" },
  notes: { color: c.textSecondary, fontSize: 13, marginTop: 12, lineHeight: 19 },
  priceRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  priceLabel: { color: c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  priceVal: { color: c.textPrimary, fontSize: 16, fontWeight: "800" },
  priceValAccent: { color: c.accent, fontSize: 18, fontWeight: "900" },
  sectionTitle: { color: c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  helper: { color: c.textMuted, fontSize: 12, marginBottom: 12 },
  itemRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: c.surface, borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.border,
  },
  itemThumb: { width: 44, height: 44, borderRadius: 8 },
  itemThumbEmpty: { backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" },
  itemName: { color: c.textPrimary, fontSize: 14, fontWeight: "700" },
  itemSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderColor: c.danger, borderRadius: 10, paddingVertical: 13, marginTop: 18,
  },
  deleteBtnText: { color: c.danger, fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
}));
