import { AppImage } from "../../src/components/AppImage";
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

import { themedStyles, useSkin } from "../../src/themeContext";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { SKIN, CAP } from "../../src/tbv/skins";
import { useIsSteel, useSteelPanelFrame } from "../../src/tbv/steel";
import TbvListPanel from "../../src/tbv/components/TbvListPanel";

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

  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const isSteel = useIsSteel();
  const steelPanel = useSteelPanelFrame();
  const steelScale = isSteel ? steelPanel.frameScale : undefined;
  const winSrc = isSteel ? steelPanel.source : SKIN.window;
  const winCap = isSteel ? steelPanel.capInsets : CAP.window;

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

      {/* HERO — fixed: broken-part photo + Open/Closed/Status pills */}
      <View style={styles.heroRow}>
        <TouchableOpacity
          testID="claim-photo"
          activeOpacity={claim.broken_photo ? 0.85 : 1}
          onPress={claim.broken_photo ? () => setLightbox(true) : undefined}
          style={styles.heroPhoto}
        >
          {claim.broken_photo ? (
            <AppImage source={{ uri: claim.broken_photo }} style={styles.heroPhotoImg} />
          ) : (
            <View style={styles.heroPhotoPh}>
              <Ionicons name="construct" size={30} color={theme.colors.textMuted} />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.heroRight}>
          <PillRow first label="OPEN DATE" value={claim.created_at ? formatDateUS(claim.created_at) : "—"} />
          <PillRow label="CLOSED DATE" value={claim.completed_at ? formatDateUS(claim.completed_at) : "—"} />
          <PillRow label="STATUS" value={label} valueColor={color} />
        </View>
      </View>

      {/* DETAILS — one fixed skinned panel; content scrolls inside */}
      <View style={styles.contentPanelOuter}>
        <ClaimPanel
          isIndustrial={isIndustrial}
          winSrc={winSrc}
          winCap={winCap}
          steelScale={steelScale}
          plainStyle={styles.contentPanelPlain}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <DetailRow
              testID="claim-tool-link"
              label="TOOL"
              onPress={() => claim.tool_id && router.push(`/tool/${claim.tool_id}`)}
            >
              {claim.tool_name || "Tool"}
            </DetailRow>

            {!!claim.inside_item_name && (
              <DetailRow testID="claim-inside-item" label="BROKEN ITEM">
                {claim.inside_item_name}{claim.inside_item_model ? `  ·  Model #: ${claim.inside_item_model}` : ""}
              </DetailRow>
            )}

            <DetailRow
              testID="claim-dealer-link"
              label="DEALER"
              onPress={claim.dealer_id ? () => router.push(`/dealer/${claim.dealer_id}`) : undefined}
            >
              {claim.dealer_name || "(no dealer assigned)"}
            </DetailRow>

            {!!claim.repair_company && (
              <DetailRow label="REPAIR COMPANY">{claim.repair_company}</DetailRow>
            )}

            {!!claim.contact && (
              <DetailRow label="CONTACT">
                <Text style={styles.detValue}>{formatPhonesInText(claim.contact)}</Text>
              </DetailRow>
            )}

            {!!claim.notified_at && (
              <DetailRow label="NOTIFIED">{formatDateUS(claim.notified_at)}</DetailRow>
            )}

            {!!claim.expected_completion && (
              <DetailRow label="EXPECTED BACK">{formatDateUS(claim.expected_completion)}</DetailRow>
            )}

            {!!claim.created_at && (
              <DetailRow label="OPENED">{formatDateTimeUS(claim.created_at)}</DetailRow>
            )}

            {!!claim.repair_cost && Number(claim.repair_cost) > 0 && (
              <DetailRow label="REPAIR / REPLACEMENT COST">
                <Text style={styles.detCost}>${Number(claim.repair_cost).toFixed(2)}</Text>
              </DetailRow>
            )}

            {!!claim.notes && (
              <View style={styles.notesBlock}>
                <Text style={styles.detLabel}>NOTES</Text>
                <Text style={styles.notesText}>{claim.notes}</Text>
              </View>
            )}
          </ScrollView>
        </ClaimPanel>
      </View>
      <Modal visible={lightbox} transparent onRequestClose={() => setLightbox(false)}>
        <TouchableOpacity
          testID="claim-photo-close"
          style={styles.lightboxBg}
          activeOpacity={1}
          onPress={() => setLightbox(false)}
        >
          {!!claim.broken_photo && (
            <AppImage source={{ uri: claim.broken_photo }} style={styles.lightboxImg} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ---- MODULE SCOPE (stable identity = no steel panel remount/flicker) ----
function ClaimPanel({
  isIndustrial, winSrc, winCap, steelScale, plainStyle, children,
}: {
  isIndustrial: boolean; winSrc: any; winCap: any; steelScale: any;
  plainStyle: any; children: React.ReactNode;
}) {
  return isIndustrial ? (
    <TbvListPanel
      source={winSrc}
      capInsets={winCap}
      frameScale={steelScale}
      padX={16}
      padTop={16}
      padBottom={12}
      style={{ flex: 1 }}
    >
      {children}
    </TbvListPanel>
  ) : (
    <View style={plainStyle}>{children}</View>
  );
}

function PillRow({
  label, value, valueColor, first,
}: { label: string; value: string; valueColor?: string; first?: boolean }) {
  return (
    <View style={[styles.pillRowFlat, !first && styles.pillRowDivider]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pillRowLabel}>{label}</Text>
      </View>
      <Text
        style={[styles.pillRowValueText, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}
      >
        {value || "—"}
      </Text>
    </View>
  );
}

function DetailRow({
  label, children, onPress, testID,
}: {
  label: string; children: React.ReactNode; onPress?: () => void; testID?: string;
}) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  const isStr = typeof children === "string";
  return (
    <Wrap
      testID={testID}
      style={styles.detRow}
      {...(onPress ? { activeOpacity: 0.7, onPress } : {})}
    >
      <Text style={styles.detLabel}>{label}</Text>
      <View style={styles.detValueWrap}>
        {isStr ? (
          <Text
            style={[styles.detValue, onPress && styles.detValueLink]}
            numberOfLines={2}
          >
            {children}
          </Text>
        ) : (
          children
        )}
        {!!onPress && (
          <Ionicons
            name="chevron-forward"
            size={15}
            color={theme.colors.textMuted}
            style={{ marginLeft: 4 }}
          />
        )}
      </View>
    </Wrap>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },

  // HERO
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  heroPhoto: { width: 100, height: 100, borderRadius: 8, overflow: "hidden", backgroundColor: "#000", borderWidth: 1, borderColor: c.border },
  heroPhotoImg: { width: "100%", height: "100%" },
  heroPhotoPh: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bgSecondary },
  heroRight: { flex: 1 },

  // PILL ROWS (top-right of hero)
  pillRowFlat: { flexDirection: "row", alignItems: "center", paddingVertical: 9, gap: 10 },
  pillRowDivider: { borderTopWidth: 1, borderTopColor: c.borderSubtle },
  pillRowLabel: { color: c.textPrimary, fontWeight: "800", fontSize: 9.5, letterSpacing: 0.8 },
  pillRowValueText: { color: c.textPrimary, fontWeight: "800", fontSize: 11, letterSpacing: 0.3, maxWidth: "62%", textAlign: "right" },

  // CONTENT PANEL
  contentPanelOuter: { flex: 1, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 14 },
  contentPanelPlain: { flex: 1, backgroundColor: c.bgSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 14, ...(theme.elevation.md as object) },

  // DETAIL ROWS
  detRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, gap: 12 },
  detLabel: { color: c.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  detValueWrap: { flexDirection: "row", alignItems: "center", flexShrink: 1, justifyContent: "flex-end" },
  detValue: { color: c.textPrimary, fontSize: 13, fontWeight: "800", textAlign: "right" },
  detValueLink: { color: c.accent },
  detCost: { color: c.textPrimary, fontSize: 17, fontWeight: "900" },
  notesBlock: { paddingTop: 12 },
  notesText: { color: c.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 6 },

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
