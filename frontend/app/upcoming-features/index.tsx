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
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api, UpcomingRelease, UpcomingFeatureStatus } from "../../src/api";
import { themedStyles, useColors, useSkin } from "../../src/themeContext";
import { SkinnedCard } from "../../src/components/SkinnedCard";
import { ShadowBox } from "../../src/components/ShadowBox";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import ReportBugBadge from "../../src/components/ReportBugBadge";
import { markUpcomingSeen } from "../../src/upcomingBadge";
import { APP_VERSION } from "../../src/version";

/** Compare dotted numeric versions ("3.1.6"). Returns -1/0/1, or null if unparseable. */
function compareVersions(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const pa = a.trim().replace(/^v/i, "").split(".").map((n) => parseInt(n, 10));
  const pb = b.trim().replace(/^v/i, "").split(".").map((n) => parseInt(n, 10));
  if (pa.some(isNaN) || pb.some(isNaN)) return null;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

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
  const { skin } = useSkin();
  const [releases, setReleases] = useState<UpcomingRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Accordion open/closed per release id. Undefined => use the default (open
  // for not-yet-released/upcoming, collapsed for already-published releases).
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const isOpen = (rel: UpcomingRelease) =>
    openIds[rel.id] !== undefined ? openIds[rel.id] : !rel.released;
  const toggle = (rel: UpcomingRelease) =>
    setOpenIds((p) => ({ ...p, [rel.id]: !isOpen(rel) }));

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
      // Opening this screen clears the "new features" red dot everywhere.
      markUpcomingSeen();
    }, [load]),
  );

  const statusColor = (key: "muted" | "warning" | "success") =>
    key === "success" ? c.success : key === "warning" ? c.warning : c.textMuted;

  // Plain themes use a clean ShadowBox; Steel/Iron keep the skinned card.
  const isPlain = skin === "plain";
  const Card = ({ children, style, padding = 14 }: { children?: any; style?: any; padding?: number }) =>
    isPlain ? (
      <ShadowBox style={[{ paddingHorizontal: padding, paddingVertical: padding }, style]}>{children}</ShadowBox>
    ) : (
      <SkinnedCard style={style} padding={padding}>{children}</SkinnedCard>
    );

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
            <Card style={styles.emptyWrap} padding={22}>
              <View style={styles.emptyInner}>
                <Ionicons name="rocket-outline" size={30} color={c.accent} />
                <Text style={styles.emptyTitle}>No updates scheduled yet</Text>
                <Text style={styles.emptyText}>
                  Check back soon — we’re always working on new tools and fixes.
                </Text>
              </View>
          </Card>
          ) : (
            releases.map((rel) => {
              const featureCount = rel.features.filter((f) => f.type !== "fix").length;
              const fixCount = rel.features.filter((f) => f.type === "fix").length;
              const cmp = rel.released ? compareVersions(APP_VERSION, rel.version) : null;
              const open = isOpen(rel);
              return (
              <Card key={rel.id} style={styles.card}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => toggle(rel)}
                  style={styles.cardHeader}
                  testID={`upcoming-accordion-${rel.id}`}
                >
                  <Ionicons
                    name={rel.released ? "checkmark-circle" : "calendar"}
                    size={18}
                    color={rel.released ? c.success : c.accent}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardDate}>{formatDate(rel.release_date)}</Text>
                    {!!rel.title && <Text style={styles.cardTitle}>{rel.title}</Text>}
                    {!open && (
                      <Text style={styles.collapsedSummary}>
                        {featureCount > 0 || fixCount > 0
                          ? `${featureCount} feature${featureCount === 1 ? "" : "s"} · ${fixCount} fix${fixCount === 1 ? "" : "es"}`
                          : "Tap to view details"}
                      </Text>
                    )}
                  </View>
                  <Ionicons
                    name={open ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={c.textMuted}
                  />
                </TouchableOpacity>

                {open && (
                <>
                {rel.released && (
                  <View style={styles.releasedBanner}>
                    <Ionicons name="rocket" size={16} color={c.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.releasedTitle}>
                        {rel.version ? `Available in v${rel.version.replace(/^v/i, "")}` : "Available now"}
                      </Text>
                      <Text style={styles.releasedSub}>
                        {(featureCount > 0 || fixCount > 0)
                          ? `${featureCount} new feature${featureCount === 1 ? "" : "s"} · ${fixCount} bug fix${fixCount === 1 ? "" : "es"}${rel.version ? ` · Built on v${rel.version.replace(/^v/i, "")}` : ""}`
                          : "Update your app to get these changes."}
                      </Text>
                      {cmp !== null && (
                        <Text style={[styles.updateHint, { color: cmp < 0 ? c.warning : c.success }]}>
                          {cmp < 0
                            ? `Update available — you're on v${APP_VERSION}. Update to get these.`
                            : `You're up to date (v${APP_VERSION}).`}
                        </Text>
                      )}
                    </View>
                  </View>
                )}

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
                </>
                )}
            </Card>
              );
            })
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
  collapsedSummary: { fontSize: 12, color: c.textMuted, marginTop: 3 },
  divider: { height: 1, backgroundColor: c.borderSubtle, marginVertical: 12 },
  releasedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.success,
    backgroundColor: c.surfaceAlt,
  },
  releasedTitle: { fontSize: 13, fontWeight: "900", color: c.success, letterSpacing: 0.3 },
  releasedSub: { fontSize: 11, color: c.textSecondary, marginTop: 2, lineHeight: 15 },
  updateHint: { fontSize: 11, fontWeight: "800", marginTop: 4 },
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
