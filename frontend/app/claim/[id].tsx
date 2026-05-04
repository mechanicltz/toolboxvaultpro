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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { formatDateUS, formatDateTimeUS } from "../../src/dateUtil";
import { formatPhonesInText } from "../../src/contactLinks";

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
      <View style={styles.header}>
        <TouchableOpacity
          testID="claim-back-btn"
          onPress={() => {
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
          hitSlop={10}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>WARRANTY CLAIM</Text>
          <Text style={styles.subtitle}>
            {isHistorical ? "HISTORICAL RECORD" : "ACTIVE CLAIM"}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 100 }}>
        <View style={[styles.statusBanner, { borderColor: color }]}>
          <View style={[styles.statusDot, { backgroundColor: color }]} />
          <Text style={[styles.statusText, { color }]}>{label}</Text>
        </View>

        <TouchableOpacity
          testID="claim-tool-link"
          style={styles.toolCard}
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
        </TouchableOpacity>

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

        <View style={styles.dateGrid}>
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
        </View>

        {!!claim.notes && (
          <Section label="NOTES">
            <Text style={styles.notes}>{claim.notes}</Text>
          </Section>
        )}

        {!!claim.broken_photo && (
          <Section label="PHOTO OF BROKEN PART">
            <Image source={{ uri: claim.broken_photo }} style={styles.photoLarge} />
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: 2,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderRadius: 6,
    backgroundColor: theme.colors.bgSecondary,
    marginBottom: 14,
  },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  toolCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
  },
  toolPhoto: { width: 60, height: 60, borderRadius: 4 },
  toolPhotoPh: {
    backgroundColor: theme.colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  toolName: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "900",
  },
  toolMeta: {
    color: theme.colors.textMuted,
    fontSize: 8,
    marginTop: 2,
  },
  section: { marginBottom: 14 },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  sectionBody: {
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
    padding: 12,
  },
  value: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: "700",
  },
  linkText: {
    color: theme.colors.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 6,
  },
  dateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  dateBox: {
    flexBasis: "48%",
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
    padding: 10,
  },
  dateLabel: {
    color: theme.colors.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  dateValue: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 4,
  },
  dateValueHi: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 4,
  },
  notes: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    lineHeight: 14,
  },
  photoLarge: {
    width: "100%",
    height: 240,
    borderRadius: 4,
    backgroundColor: theme.colors.bg,
  },
});
