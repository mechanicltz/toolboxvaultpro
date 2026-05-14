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
import { theme } from "../../../src/theme";
import { api } from "../../../src/api";
import { usePrefs } from "../../../src/prefs";

import { themedStyles } from "../../../src/themeContext";

/**
 * Dedicated screen showing every tool that was purchased from a single
 * dealer. Reached from the "View N purchased tools" button on the
 * dealer detail page.
 */
export default function DealerToolsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const { prefs } = usePrefs();
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

  const total = tools.reduce((sum, t) => {
    const cost = Number(t.cost) || 0;
    const qty = Math.max(1, Number(t.quantity) || 1);
    return sum + cost * qty;
  }, 0);

  const dealerName = (name as string) || "Dealer";

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={10}
          testID="back-btn"
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerOver}>TOOLS PURCHASED FROM</Text>
          <Text style={styles.headerName} numberOfLines={1}>
            {dealerName}
          </Text>
        </View>
      </View>

      {/* Summary band */}
      <View style={styles.summary}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{tools.length}</Text>
          <Text style={styles.summaryLabel}>TOTAL TOOLS</Text>
        </View>
        <View style={[styles.summaryCell, styles.summaryCellAccent]}>
          <Text style={styles.summaryValueAccent}>${total.toFixed(2)}</Text>
          <Text style={styles.summaryLabelAccent}>TOTAL INVESTED</Text>
        </View>
      </View>

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
              <TouchableOpacity
                key={t.id}
                testID={`dealer-tool-${t.id}`}
                style={styles.row}
                onPress={() => router.push(`/tool/${t.id}`)}
                activeOpacity={0.85}
              >
                <Text style={styles.rowIndex}>{index + 1}</Text>
                <View style={styles.rowThumb}>
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.thumb} />
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
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
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
