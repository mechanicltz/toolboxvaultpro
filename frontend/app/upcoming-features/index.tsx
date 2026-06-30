// Upcoming Features (user-facing roadmap).
// Public to any signed-in user. Shows admin-published releases sorted by the
// soonest date first, each with its feature list and per-feature status.
import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api, UpcomingRelease, UpcomingFeatureStatus } from "../../src/api";
import { themedStyles, useColors } from "../../src/themeContext";
import { SkinnedCard } from "../../src/components/SkinnedCard";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import ReportBugBadge from "../../src/components/ReportBugBadge";

function formatDate(iso: string): string {
  try {
    // Month + Year only (the day is intentionally ignored / not collected).
    const [y, m] = (iso || "").split("-").map((n) => parseInt(n, 10));
    if (!y || !m) return iso;
    const dt = new Date(y, m - 1, 1);
    return dt.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  } catch {
    return iso;
  }
}

const STATUS_META: Record<
  UpcomingFeatureStatus,
  { icon: keyof typeof Ionicons.glyphMap; key: "muted" | "warning" | "success" }
> = {
  "On The List": { icon: "ellipse-outline", key: "muted" },
  "Work Started": { icon: "build", key: "warning" },
  "Completed": { icon: "checkmark-circle", key: "success" },
};

export default function UpcomingFeaturesScreen() {
  const router = useRouter();
  const c = useColors();
  const [releases, setReleases] = useState<UpcomingRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.listUpcomingFeatures();
      setReleases(data || []);
    } catch {
      setReleases([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const statusColor = (key: "muted" | "warning" | "success") =>
    key === "success" ? c.success : key === "warning" ? c.warning : c.textMuted;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <IndustrialBanner
        title="UPCOMING FEATURES"
        subtitle="What we're building next"
        onBack={() => router.back()}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={c.accent}
            />
          }
        >
          {releases.length === 0 ? (
            <SkinnedCard style={styles.emptyWrap} padding={22}>
              <View style={styles.emptyInner}>
                <Ionicons name="rocket-outline" size={30} color={c.accent} />
                <Text style={styles.emptyTitle}>No updates scheduled yet</Text>
                <Text style={styles.emptyText}>
                  Check back soon — we’re always working on new tools and fixes.
                </Text>
              </View>
            </SkinnedCard>
          ) : (
            releases.map((rel) => (
              <SkinnedCard key={rel.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="calendar" size={18} color={c.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardDate}>{formatDate(rel.release_date)}</Text>
                    {!!rel.title && <Text style={styles.cardTitle}>{rel.title}</Text>}
                  </View>
                </View>
                <View style={styles.divider} />
                {rel.features.length === 0 ? (
                  <Text style={styles.noFeatures}>Details coming soon.</Text>
                ) : (
                  rel.features.map((f) => {
                    const meta = STATUS_META[f.status] || STATUS_META["On The List"];
                    const col = statusColor(meta.key);
                    return (
                      <View key={f.id} style={styles.featureRow}>
                        <Ionicons name={meta.icon} size={18} color={col} style={{ marginTop: 1 }} />
                        <View style={{ flex: 1 }}>
                          <View style={styles.featureTitleRow}>
                            <Text style={styles.featureTitle}>{f.title}</Text>
                            <View style={[styles.statusPill, { borderColor: col }]}>
                              <Text style={[styles.statusText, { color: col }]}>
                                {f.status}
                              </Text>
                            </View>
                          </View>
                          {!!f.description && (
                            <Text style={styles.featureDesc}>{f.description}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </SkinnedCard>
            ))
          )}

          {/* Feature-request prompt + bug/feature badge. */}
          <Text style={styles.requestPrompt}>
            Want your idea to be put on this list? Send us a Message
          </Text>
          <ReportBugBadge style={{ marginTop: 6 }} testID="upcoming-feedback" />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 60 },
  emptyWrap: { marginTop: 4 },
  emptyInner: { alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: c.textPrimary, textAlign: "center" },
  emptyText: { fontSize: 13, color: c.textMuted, textAlign: "center", lineHeight: 19 },
  card: { marginBottom: 14 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardDate: { fontSize: 16, fontWeight: "800", color: c.accent, letterSpacing: 0.3 },
  cardTitle: { fontSize: 13, fontWeight: "600", color: c.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: c.borderSubtle, marginVertical: 12 },
  noFeatures: { fontSize: 13, color: c.textMuted, fontStyle: "italic" },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 7,
  },
  featureTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureTitle: { flex: 1, fontSize: 14, fontWeight: "600", color: c.textPrimary },
  featureDesc: { fontSize: 12, color: c.textMuted, marginTop: 3, lineHeight: 17 },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  requestPrompt: {
    fontSize: 13,
    fontWeight: "700",
    color: c.textSecondary,
    textAlign: "center",
    marginTop: 18,
    marginBottom: 2,
    paddingHorizontal: 16,
    lineHeight: 19,
  },
}));
