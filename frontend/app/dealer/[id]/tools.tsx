import { AppImage } from "../../../src/components/AppImage";
import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useAppResume } from "../../../src/appLifecycle";
import { theme } from "../../../src/theme";
import { api } from "../../../src/api";
import { usePrefs } from "../../../src/prefs";

import { themedStyles, useSkin } from "../../../src/themeContext";
import { IndustrialBanner } from "../../../src/components/IndustrialBanner";
import { BevelCard } from "../../../src/components/BevelCard";
import { SKIN, CAP } from "../../../src/tbv/skins";
import { TbvFrame } from "../../../src/tbv/components/TbvFrame";

/**
 * Dedicated screen showing every tool that was purchased from a single
 * dealer. Reached from the "View N purchased tools" button on the
 * dealer detail page.
 */
export default function DealerToolsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const { prefs } = usePrefs();
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const t = await api.listTools({ dealer_id: id });
      setTools(t || []);
    } catch (e) {
      // swallow
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


  const total = tools.reduce((sum, t) => {
    const cost = Number(t.cost) || 0;
    const qty = Math.max(1, Number(t.quantity) || 1);
    return sum + cost * qty;
  }, 0);

  const dealerName = (name as string) || "Dealer";

  // Industrial theme: render the summary in a metal window frame and each tool
  // row on a metal plate (mirrors the dealer detail screen). Plain themes keep
  // the flat BevelCard look.
  const RowShell = ({
    children,
    onPress,
    testID,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    testID?: string;
  }) =>
    isIndustrial ? (
      <TouchableOpacity testID={testID} style={styles.rowSkinWrap} onPress={onPress} activeOpacity={0.85}>
        <TbvFrame source={SKIN.plate} capInsets={CAP.plate} padX={26} padTop={14} padBottom={14}>
          <View style={styles.rowSkinInner}>{children}</View>
        </TbvFrame>
      </TouchableOpacity>
    ) : (
      <BevelCard testID={testID} style={styles.row} onPress={onPress} activeOpacity={0.85}>
        {children}
      </BevelCard>
    );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <IndustrialBanner
        title={dealerName || "TOOLS"}
        subtitle="Tools Purchased From"
        onBack={() => router.back()} backIcon="chevron-back"
      />
      <View style={{display:"none"}}>
      </View>

      {/* Summary band */}
      {(() => {
        const cells = (
          <>
            <View style={[styles.summaryCell, isIndustrial && styles.summaryCellSkin]}>
              <Text style={[styles.summaryValue, isIndustrial && styles.summaryValueSkin]}>{tools.length}</Text>
              <Text style={[styles.summaryLabel, isIndustrial && styles.summaryLabelSkin]}>TOTAL TOOLS</Text>
            </View>
            {isIndustrial && <View style={styles.summaryDividerSkin} />}
            <View style={[styles.summaryCell, styles.summaryCellAccent, isIndustrial && styles.summaryCellSkin]}>
              <Text style={[styles.summaryValueAccent, isIndustrial && styles.summaryValueAccentSkin]}>${total.toFixed(2)}</Text>
              <Text style={[styles.summaryLabelAccent, isIndustrial && styles.summaryLabelAccentSkin]}>TOTAL INVESTED</Text>
            </View>
          </>
        );
        return isIndustrial ? (
          <View style={styles.summarySkinWrap}>
            <TbvFrame source={SKIN.window} capInsets={CAP.window} padX={26} padTop={18} padBottom={18}>
              <View style={styles.summaryRowInner}>{cells}</View>
            </TbvFrame>
          </View>
        ) : (
          <View style={styles.summary}>{cells}</View>
        );
      })()}

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : tools.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="construct" size={36} color={theme.colors.textMuted} />
          <Text style={styles.emptyText}>
            No tools assigned to this dealer yet.
          </Text>
          <Text style={styles.emptyHint}>
            Open a tool and pick this dealer to see it appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={tools}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 90 }}
          renderItem={({ item: t, index }) => {
            const qty = Math.max(1, Number(t.quantity) || 1);
            const ext = (Number(t.cost) || 0) * qty;
            const photo = t.photos?.[0];
            return (
              <RowShell
                key={t.id}
                testID={`dealer-tool-${t.id}`}
                onPress={() => router.push(`/tool/${t.id}`)}
              >
                <Text style={styles.rowIndex}>{index + 1}</Text>
                <View style={styles.rowThumb}>
                  {photo ? (
                    <AppImage source={{ uri: photo }} style={styles.thumb} />
                  ) : (
                    <Ionicons name="construct" size={20} color={theme.colors.textMuted} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {t.brand || "—"}
                    {t.model ? `  ·  ${t.model}` : ""}
                  </Text>
                  <View style={styles.rowMeta}>
                    {!!t.purchased_from_agent_name && (
                      <Text style={styles.rowAgent} numberOfLines={1}>
                        <Ionicons name="person" size={11} color={theme.colors.textMuted} />{" "}
                        {t.purchased_from_agent_name}
                      </Text>
                    )}
                    <View style={styles.qtyPill}>
                      <Text style={styles.qtyPillText}>×{qty}</Text>
                    </View>
                  </View>
                </View>
                {prefs.show_prices && (
                  <View style={{ alignItems: "flex-end", marginRight: 4 }}>
                    <Text style={styles.rowCost}>${ext.toFixed(2)}</Text>
                    {qty > 1 && (
                      <Text style={styles.rowUnit}>
                        ${(Number(t.cost) || 0).toFixed(2)} ea
                      </Text>
                    )}
                  </View>
                )}
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.colors.textMuted}
                />
              </RowShell>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
    borderBottomColor: c.border,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  headerOver: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 1,
  },
  headerName: {
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: "900",
  },
  summary: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summarySkinWrap: { marginHorizontal: 14, marginVertical: 10 },
  summaryRowInner: { flexDirection: "row", gap: 10 },
  // Skinned summary: drop the box chrome (surface bg / border / shadow) so the
  // stats sit directly on the metal window. Text colors are bumped for
  // legibility against the dark plate.
  summaryCellSkin: {
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingVertical: 4,
    paddingHorizontal: 6,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  summaryDividerSkin: {
    width: 1,
    alignSelf: "stretch",
    marginVertical: 4,
    backgroundColor: c.accent,
    opacity: 0.35,
  },
  summaryValueSkin: { color: c.textPrimary },
  summaryLabelSkin: { color: c.textSecondary, opacity: 1 },
  summaryValueAccentSkin: { color: c.accent },
  summaryLabelAccentSkin: { color: c.accent, opacity: 0.9 },
  rowSkinWrap: { marginHorizontal: 14, marginBottom: 10 },
  rowSkinInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  summaryCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "flex-start",
  
    ...(theme.elevation.md as object),
  },
  summaryCellAccent: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  summaryValue: {
    color: c.textPrimary,
    fontSize: 16,
    fontWeight: "900",
  },
  summaryValueAccent: {
    color: "#000",
    fontSize: 16,
    fontWeight: "900",
  },
  summaryLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 4,
  },
  summaryLabelAccent: {
    color: "#000",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 4,
    opacity: 0.7,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyText: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 11,
    textAlign: "center",
  },
  emptyHint: { color: c.textMuted, fontSize: 9, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    padding: 10,
    marginBottom: 8,
  
    ...(theme.elevation.md as object),
  },
  rowIndex: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "800",
    minWidth: 18,
    textAlign: "center",
  },
  rowThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: c.bg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumb: { width: "100%", height: "100%", resizeMode: "cover" },
  rowName: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 10,
  },
  rowSub: {
    color: c.textSecondary,
    fontSize: 9,
    marginTop: 2,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    flexWrap: "wrap",
  },
  rowAgent: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "700",
    flexShrink: 1,
  },
  qtyPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: c.accent,
  },
  qtyPillText: {
    color: "#000",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  rowCost: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "800",
  },
  rowUnit: {
    color: c.textMuted,
    fontSize: 7,
    marginTop: 1,
  },
}));
