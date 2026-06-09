import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useAppResume } from "../../src/appLifecycle";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { formatDateUS } from "../../src/dateUtil";

import { themedStyles, useSkin } from "../../src/themeContext";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { SKIN, CAP, TBV } from "../../src/tbv/skins";
import TbvFrame from "../../src/tbv/components/TbvFrame";

const STATUS_COLORS: Record<string, string> = {
  broken: theme.colors.danger,
  awaiting_approval: theme.colors.warning,
  waiting_replacement: theme.colors.accentSecondary,
  completed: theme.colors.success,
  rejected: theme.colors.textMuted,
};

const STATUS_LABEL: Record<string, string> = {
  broken: "OPEN",
  awaiting_approval: "AWAITING APPROVAL",
  waiting_replacement: "WAITING REPLACEMENT",
  completed: "COMPLETED",
  rejected: "REJECTED",
};

export default function ClaimsHistoryPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const [tool, setTool] = useState<any>(null);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [t, c] = await Promise.all([
        api.getTool(id),
        api.listWarrantyClaims({ tool_id: id }),
      ]);
      setTool(t);
      setClaims(Array.isArray(c) ? c : []);
    } catch (e) {
      console.error("[claims-history] load failed", e);
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


  const body = (
    <SafeAreaView style={[styles.container, isIndustrial && styles.containerSkin]} edges={["top"]}>
      <IndustrialBanner
        title="CLAIMS HISTORY"
        subtitle={tool?.name || "Warranty claims"}
        leftSlot={
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} testID="back-btn">
            <Ionicons name="arrow-back" size={22} color="#F97316" />
          </TouchableOpacity>
        }
      />
      <View style={{ display: "none" }}>
        <View style={styles.headerCount}>
          <Text style={styles.headerCountText}>{claims.length}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : claims.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="shield-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>No claims filed</Text>
          <Text style={styles.emptyBody}>
            Warranty and repair claims for this item will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {claims.map((c: any, idx: number) => {
            const status = (c.claim_status || "broken").toLowerCase();
            const color = STATUS_COLORS[status] || theme.colors.textMuted;
            const label = STATUS_LABEL[status] || status.toUpperCase();
            const inner = (
              <>
                <View style={styles.cardRow}>
                  <View style={styles.numCol}>
                    <Text style={styles.num}>#{idx + 1}</Text>
                  </View>
                  {c.broken_photo ? (
                    <Image source={{ uri: c.broken_photo }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPlaceholder]}>
                      <Ionicons name="image-outline" size={20} color={theme.colors.textMuted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={[styles.statusPill, { borderColor: color }]}>
                      <Text style={[styles.statusText, { color }]}>{label}</Text>
                    </View>
                    {!!c.notified_at && (
                      <Text style={styles.notified}>
                        Notified: {formatDateUS(c.notified_at)}
                      </Text>
                    )}
                    {!!c.repair_company && (
                      <Text style={styles.meta}>Company: {c.repair_company}</Text>
                    )}
                    {!!c.contact && (
                      <Text style={styles.meta}>Contact: {c.contact}</Text>
                    )}
                    {!!c.expected_completion && (
                      <Text style={styles.meta}>
                        Expected back: {formatDateUS(c.expected_completion)}
                      </Text>
                    )}
                    {!!c.completed_at && (
                      <Text style={styles.meta}>
                        Closed: {formatDateUS(c.completed_at)}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </View>
                {!!c.notes && (
                  <View style={styles.notesBox}>
                    <Text style={styles.notesLabel}>NOTES</Text>
                    <Text style={styles.notes}>{c.notes}</Text>
                  </View>
                )}
              </>
            );
            return (
              <TouchableOpacity
                key={c.id}
                testID={`claim-${c.id}`}
                style={isIndustrial ? styles.cardSkinWrap : styles.card}
                activeOpacity={0.85}
                onPress={() => router.push(`/claim/${c.id}`)}
              >
                {isIndustrial ? (
                  <TbvFrame
                    source={SKIN.window}
                    capInsets={CAP.window}
                    padX={16}
                    padTop={16}
                    padBottom={16}
                  >
                    {inner}
                  </TbvFrame>
                ) : (
                  inner
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );

  if (isIndustrial) {
    return (
      <ImageBackground source={SKIN.bg} style={styles.skinBg} resizeMode="cover" fadeDuration={0}>
        <View style={styles.skinVeil} pointerEvents="none" />
        {body}
      </ImageBackground>
    );
  }
  return body;
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  containerSkin: { backgroundColor: "transparent" },
  skinBg: { flex: 1, backgroundColor: TBV.ink },
  skinVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,10,10,0.60)" },
  cardSkinWrap: { marginBottom: 12 },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerTitleCol: { flex: 1 },
  headerTitle: {
    color: c.textPrimary,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 1.4,
  },
  headerSub: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  headerCount: {
    backgroundColor: c.bgSecondary,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  
    ...(theme.elevation.md as object),
  },
  headerCountText: {
    color: c.textPrimary,
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
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 14,
    marginTop: 8,
  },
  emptyBody: {
    color: c.textMuted,
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  
    ...(theme.elevation.md as object),
  },
  cardRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  numCol: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.accent,
  },
  num: {
    color: c.accent,
    fontSize: 9,
    fontWeight: "900",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 6,
    backgroundColor: c.bg,
  },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 4,
  },
  statusText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  notified: {
    color: c.accent,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 2,
  },
  meta: {
    color: c.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  notesBox: {
    backgroundColor: c.bg,
    borderRadius: 6,
    padding: 8,
    marginTop: 8,
  },
  notesLabel: {
    color: c.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  notes: {
    color: c.textPrimary,
    fontSize: 11,
    lineHeight: 15,
  },
}));
