import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { formatDateTime } from "../../src/dt";

export default function CheckoutHistoryPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tool, setTool] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const t = await api.getTool(id);
      setTool(t);
    } catch (e) {
      console.error("[checkout-history] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const history: any[] = Array.isArray(tool?.checkout_history)
    ? tool!.checkout_history.slice().reverse()
    : [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} testID="back-btn">
          <Ionicons name="arrow-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            CHECKOUT HISTORY
          </Text>
          {!!tool?.name && (
            <Text style={styles.headerSub} numberOfLines={1}>
              {tool.name}
            </Text>
          )}
        </View>
        <View style={styles.headerCount}>
          <Text style={styles.headerCountText}>{history.length}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : history.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="time-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>No checkout history yet</Text>
          <Text style={styles.emptyBody}>
            When this item is checked out, the record will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {history.map((h: any, i: number) => (
            <TouchableOpacity
              key={i}
              testID={`hist-${i}`}
              style={styles.row}
              onPress={() => h.borrower_id && router.push(`/borrower/${h.borrower_id}`)}
              disabled={!h.borrower_id}
              activeOpacity={0.7}
            >
              <View style={styles.rowHead}>
                <Text style={styles.name} numberOfLines={1}>
                  {h.borrower_name || "Unknown"}
                </Text>
                {!!h.borrower_id && (
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={theme.colors.textMuted}
                  />
                )}
              </View>
              <Text style={styles.line}>
                <Text style={styles.label}>Out: </Text>
                {formatDateTime(h.checked_out_at)}
              </Text>
              <Text style={styles.line}>
                <Text style={styles.label}>In:  </Text>
                {h.checked_in_at ? formatDateTime(h.checked_in_at) : "— currently out"}
              </Text>
              {!!h.notes && <Text style={styles.notes}>{h.notes}</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitleCol: { flex: 1 },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 1.4,
  },
  headerSub: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  headerCount: {
    backgroundColor: theme.colors.bgSecondary,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  headerCountText: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    fontSize: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 32,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    fontSize: 14,
    marginTop: 8,
  },
  emptyBody: {
    color: theme.colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  row: {
    backgroundColor: theme.colors.bgSecondary,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  name: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    fontSize: 13,
    flex: 1,
  },
  line: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    marginTop: 2,
  },
  label: {
    color: theme.colors.textMuted,
    fontWeight: "700",
  },
  notes: {
    color: theme.colors.textPrimary,
    fontStyle: "italic",
    fontSize: 12,
    marginTop: 6,
  },
});
