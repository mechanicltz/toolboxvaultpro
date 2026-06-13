import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useAppResume } from "../../src/appLifecycle";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { formatDateUS, formatDateTimeUS } from "../../src/dateUtil";
import { formatPhonesInText } from "../../src/contactLinks";

import { themedStyles } from "../../src/themeContext";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { SkinPlate } from "../../src/components/SkinPlate";

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

export default function ClaimDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [claim, setClaim] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const c = await api.getWarrantyClaim(id);
      setClaim(c);
    } catch {
      Alert.alert("Error", "Claim not found");
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


  if (loading || !claim) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const status = (claim.claim_status || "broken").toLowerCase();
  const color = STATUS_COLORS[status] || theme.colors.textMuted;
  const label = STATUS_LABEL[status] || status.toUpperCase();
  const isHistorical = status === "completed" || status === "rejected";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title="WARRANTY CLAIM"
        subtitle={isHistorical ? "Historical Record" : "Active Claim"}
        onBack={() => {
          try {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/claims");
            }
          } catch {
            router.replace("/claims");
          }
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 100 }}>
        <SkinPlate
          style={styles.statusBannerOuter}
          innerStyle={styles.statusBannerInner}
          padTop={11}
          padBottom={11}
        >
          <View style={[styles.statusDot, { backgroundColor: color }]} />
          <Text style={[styles.statusText, { color }]}>{label}</Text>
        </SkinPlate>

        <SkinPlate
          testID="claim-tool-link"
          style={styles.toolCardOuter}
          innerStyle={styles.toolCardInner}
          onPress={() => claim.tool_id && router.push(`/tool/${claim.tool_id}`)}
        >
          {claim.broken_photo ? (
            <Image source={{ uri: claim.broken_photo }} style={styles.toolPhoto} />
          ) : (
            <View style={[styles.toolPhoto, styles.toolPhotoPh]}>
              <Ionicons name="construct" size={32} color={theme.colors.textMuted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.toolName}>{claim.tool_name || "Tool"}</Text>
            <Text style={styles.toolMeta}>Tap to open the tool</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </SkinPlate>

        <Section label="DEALER">
          <Text style={styles.value}>
            {claim.dealer_name || "(no dealer assigned)"}
          </Text>
          {!!claim.dealer_id && (
            <TouchableOpacity
              testID="claim-dealer-link"
              onPress={() => router.push(`/dealer/${claim.dealer_id}`)}
            >
              <Text style={styles.linkText}>View dealer →</Text>
            </TouchableOpacity>
          )}
        </Section>

        {!!claim.repair_company && (
          <Section label="REPAIR COMPANY">
            <Text style={styles.value}>{claim.repair_company}</Text>
          </Section>
        )}
        {!!claim.contact && (
          <Section label="CONTACT">
            <Text style={styles.value}>{formatPhonesInText(claim.contact)}</Text>
          </Section>
        )}

        <SkinPlate style={styles.dateGridOuter} innerStyle={styles.dateGrid} padTop={12} padBottom={12}>
          {!!claim.notified_at && (
            <View style={styles.dateBox}>
              <Text style={styles.dateLabel}>NOTIFIED</Text>
              <Text style={styles.dateValueHi}>{formatDateUS(claim.notified_at)}</Text>
            </View>
          )}
          {!!claim.expected_completion && (
            <View style={styles.dateBox}>
              <Text style={styles.dateLabel}>EXPECTED BACK</Text>
              <Text style={styles.dateValue}>{formatDateUS(claim.expected_completion)}</Text>
            </View>
          )}
          {!!claim.completed_at && (
            <View style={styles.dateBox}>
              <Text style={styles.dateLabel}>CLOSED</Text>
              <Text style={styles.dateValue}>{formatDateUS(claim.completed_at)}</Text>
            </View>
          )}
          {!!claim.created_at && (
            <View style={styles.dateBox}>
              <Text style={styles.dateLabel}>OPENED</Text>
              <Text style={styles.dateValue}>{formatDateTimeUS(claim.created_at)}</Text>
            </View>
          )}
        </SkinPlate>

        {!!claim.notes && (
          <Section label="NOTES">
            <Text style={styles.notes}>{claim.notes}</Text>
          </Section>
        )}

        {/* Repair / replacement cost — shown when > 0. Helps the user verify
            what they recorded and what will roll up into reports. */}
        {!!claim.repair_cost && Number(claim.repair_cost) > 0 && (
          <Section label="REPAIR / REPLACEMENT COST">
            <Text style={[styles.notes, { fontSize: 18, fontWeight: "700" }]}>
              ${Number(claim.repair_cost).toFixed(2)}
            </Text>
          </Section>
        )}

        {!!claim.broken_photo && (
          <Section label="PHOTO OF BROKEN PART">
            <TouchableOpacity testID="claim-photo" activeOpacity={0.9} onPress={() => setLightbox(true)}>
              <Image source={{ uri: claim.broken_photo }} style={styles.photoLarge} />
            </TouchableOpacity>
          </Section>
        )}
      </ScrollView>
      <Modal visible={lightbox} transparent onRequestClose={() => setLightbox(false)}>
        <TouchableOpacity
          testID="claim-photo-close"
          style={styles.lightboxBg}
          activeOpacity={1}
          onPress={() => setLightbox(false)}
        >
          {!!claim.broken_photo && (
            <Image source={{ uri: claim.broken_photo }} style={styles.lightboxImg} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <SkinPlate padX={12} padTop={12} padBottom={12}>{children}</SkinPlate>
    </View>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  title: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },
  subtitle: {
    color: c.accent,
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: 2,
  },
  statusBannerOuter: {
    marginBottom: 14,
  },
  statusBannerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  toolCardOuter: {
    marginBottom: 14,
  },
  toolCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toolPhoto: { width: 60, height: 60, borderRadius: 4 },
  toolPhotoPh: {
    backgroundColor: c.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  toolName: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "900",
  },
  toolMeta: {
    color: c.textMuted,
    fontSize: 8,
    marginTop: 2,
  },
  section: { marginBottom: 14 },
  sectionLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  sectionBody: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 4,
    padding: 12,
  
    ...(theme.elevation.md as object),
  },
  value: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "700",
  },
  linkText: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 6,
  },
  dateGridOuter: {
    marginBottom: 14,
  },
  dateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 12,
    columnGap: 8,
  },
  dateBox: {
    flexBasis: "48%",
  },
  dateLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  dateValue: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 4,
  },
  dateValueHi: {
    color: c.accent,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 4,
  },
  notes: {
    color: c.textPrimary,
    fontSize: 10,
    lineHeight: 14,
  },
  photoLarge: {
    width: "100%",
    height: 240,
    borderRadius: 4,
    backgroundColor: c.bg,
  },
  lightboxBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  lightboxImg: {
    width: "100%",
    height: "80%",
  },
}));
