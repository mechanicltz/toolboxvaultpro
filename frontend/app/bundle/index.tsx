import { useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { themedStyles } from "../../src/themeContext";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { AddFab } from "../../src/components/AddFab";

export default function BundlesList() {
  const router = useRouter();
  const [bundles, setBundles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.listBundles({ forceFresh: true } as any);
      setBundles(Array.isArray(list) ? list : []);
    } catch {
      setBundles([]);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title="SETS & BUNDLES"
        subtitle={`${bundles.length} set${bundles.length === 1 ? "" : "s"}`}
        leftSlot={
          <TouchableOpacity
            testID="bundles-back"
            onPress={() => router.canGoBack() ? router.back() : router.replace("/more")}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color="#F97316" />
          </TouchableOpacity>
        }
      />
      {loading ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 100 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.accent} />
          }
        >
          {bundles.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={48} color={theme.colors.textMuted} />
              <Text style={styles.emptyText}>No sets yet</Text>
              <Text style={styles.emptySub}>
                Group items into a set (e.g. a socket set) with its own part # and price.
              </Text>
            </View>
          ) : (
            bundles.map((b) => (
              <TouchableOpacity
                key={b.id}
                testID={`bundle-card-${b.id}`}
                style={styles.card}
                onPress={() => router.push(`/bundle/${b.id}`)}
              >
                {b.photos?.[0] ? (
                  <Image source={{ uri: b.photos[0] }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Ionicons name="cube" size={22} color={theme.colors.accent} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{b.name}</Text>
                  <Text style={styles.sub}>
                    {b.part_number ? `#${b.part_number} · ` : ""}
                    {b.item_count || 0} item{(b.item_count || 0) === 1 ? "" : "s"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.price}>${(b.set_price || 0).toFixed(2)}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
      <AddFab testID="add-bundle-fab" onPress={() => router.push("/bundle/edit")} />
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: c.surface, borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: c.border,
  },
  thumb: { width: 52, height: 52, borderRadius: 8 },
  thumbEmpty: { backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" },
  name: { color: c.textPrimary, fontSize: 15, fontWeight: "800" },
  sub: { color: c.textMuted, fontSize: 12, marginTop: 3 },
  price: { color: c.accent, fontSize: 16, fontWeight: "900" },
  empty: { alignItems: "center", marginTop: 80, paddingHorizontal: 30 },
  emptyText: { color: c.textPrimary, fontSize: 18, fontWeight: "800", marginTop: 14 },
  emptySub: { color: c.textMuted, fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 19 },
}));
