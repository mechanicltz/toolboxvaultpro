import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
  Linking,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useAppResume } from "../../src/appLifecycle";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { confirm } from "../../src/confirm";
import { formatDateUS as fmtDate } from "../../src/dateUtil";
import { formatPhonesInText } from "../../src/contactLinks";
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

import { themedStyles } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";
import { ContactIconImage } from "../../src/components/ContactIcons";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { PillButton } from "../../src/components/PillButton";

type Tab = "open" | "completed";

const REPAIR_STATUSES = [
  "Not Reported",
  "Reported",
  "In Repair",
  "Awaiting Parts",
  "Sent in for Repairs",
  "Repaired",
];

export default function DealerClaimsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [dealer, setDealer] = useState<any>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [archivedClaims, setArchivedClaims] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("open");
  const [refreshing, setRefreshing] = useState(false);
  const [statusPickerFor, setStatusPickerFor] = useState<any | null>(null);

  const updateStatus = async (t: any, newStatus: string) => {
    try {
      const next: any = {
        repair_info: { ...(t.repair_info || {}), repair_status: newStatus },
      };
      if (newStatus.toLowerCase() === "repaired") {
        next.needs_repair = false;
        next.repair_info = null;
      }
      await api.updateTool(t.id, next);
      setStatusPickerFor(null);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not update status");
    }
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [d, allTools, archived] = await Promise.all([
        api.getDealer(id),
        api.listTools({ dealer_id: id }),
        api.listWarrantyClaims({ dealer_id: id, archived: true }).catch(() => []),
      ]);
      setDealer(d);
      // Only keep broken tools for live view
      setTools((allTools || []).filter((t: any) => t.needs_repair));
      setArchivedClaims(archived || []);
    } catch {
      /* ignore */
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const isRepaired = (t: any) =>
    (t.repair_info?.repair_status || "").toLowerCase() === "repaired";

  const open = tools.filter((t) => !isRepaired(t));
  // Convert archived claims into pseudo-tools for unified display
  const completedFromTools = tools.filter((t) => isRepaired(t));
  const completedFromClaims = (archivedClaims || []).map((c: any) => ({
    id: c.tool_id || c.id,
    claim_id: c.id,
    name: c.tool_name || "Tool",
    serial_number: c.serial_number || "",
    purchase_date: c.purchase_date || "",
    photos: c.tool_photo ? [c.tool_photo] : [],
    repair_info: {
      company_notified: c.repair_company || "",
      contact: c.contact || "",
      notified_at: c.notified_at || "",
      expected_completion: c.expected_completion || c.completed_at?.substring?.(0, 10) || "",
      repair_status: c.claim_status === "rejected" ? "Rejected" : "Repaired",
      notes: c.notes || "",
      broken_photo: c.broken_photo || "",
    },
    needs_repair: false,
    _archivedClaim: true,
    _completedAt: c.completed_at,
  }));
  // Dedupe — prefer archive entry over the live tool's repair_info if present
  const seenIds = new Set(completedFromClaims.map((x) => x.id));
  const completed = [
    ...completedFromClaims,
    ...completedFromTools.filter((t) => !seenIds.has(t.id)),
  ];
  const visible = tab === "open" ? open : completed;

  const notify = async (t: any, mode: "email" | "sms") => {
    try {
      const agent = dealer?.agents?.find((a: any) => a.id === dealer?.current_agent_id);
      const phone = (agent?.phone || dealer?.phone || "").replace(/[^\d+]/g, "");
      const email = (agent?.email || "").trim();
      // Prompt to add contact info if missing
      if ((mode === "email" && !email) || (mode === "sms" && !phone)) {
        const target = mode === "email" ? "email address" : "phone number";
        const ok = await confirm(
          `No ${target} on file`,
          `${dealer?.name || "Dealer"} doesn't have a${mode === "email" ? "n " : " "}${target} for the current agent.\n\nWould you like to open the dealer page to add it?`,
          "Open Dealer"
        );
        if (ok) router.push(`/dealer/${dealer.id}`);
        return;
      }
      const subject = `Repair / Warranty: ${t.name}`;
      const greetName = agent?.name || dealer?.name || "there";
      const _claimMns: string[] = (Array.isArray(t.model_numbers) && t.model_numbers.length)
        ? t.model_numbers.filter((s: any) => !!s)
        : (t.serial_number ? [String(t.serial_number)] : []);
      const _claimSns: string[] = Array.isArray(t.serial_numbers)
        ? t.serial_numbers.filter((s: any) => !!s) : [];
      const lines = [
        `Hello ${greetName}, I have a repair/warranty tool.`,
        `Tool: ${t.name}`,
        `Model Number${_claimMns.length > 1 ? "s" : ""}: ${_claimMns.length ? _claimMns.join(", ") : "N/A"}`,
        `Serial Number${_claimSns.length === 1 ? "" : "s"}: ${_claimSns.length ? _claimSns.join(", ") : "N/A"}`,
        `Purchase date: ${fmtDate(t.purchase_date) || "N/A"}`,
      ];
      const body = lines.join("\n");

      // Materialize the broken-item photo (stored as base64 data URI on the
      // tool's repair_info) into a temp file so we can attach it to either
      // the email (via MailComposer) or the share sheet for SMS (MMS via
      // Sharing.shareAsync). If there's no photo, we still send the text-
      // only message via the standard mailto:/sms: scheme as before.
      let photoUri: string | null = null;
      const dataUri: string = t.repair_info?.broken_photo || "";
      if (dataUri.startsWith("data:image/")) {
        try {
          const match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
          if (match) {
            const ext = (match[1] || "jpg").toLowerCase().replace("jpeg", "jpg");
            const base64 = match[2];
            const safeName = (t.name || "broken-item")
              .replace(/[^a-z0-9_-]/gi, "_")
              .slice(0, 40);
            const target =
              (FileSystem.cacheDirectory || "") + `${safeName}.${ext}`;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (FileSystem as any).writeAsStringAsync(target, base64, {
              encoding: "base64",
            });
            photoUri = target;
          }
        } catch (e) {
          console.warn("[claims] failed to materialize broken photo", e);
        }
      }

      if (mode === "email") {
        // Prefer the native mail composer because it actually supports
        // file attachments. mailto: URLs do not.
        const canCompose = await MailComposer.isAvailableAsync().catch(() => false);
        if (canCompose) {
          await MailComposer.composeAsync({
            recipients: [email],
            subject,
            body,
            isHtml: false,
            attachments: photoUri ? [photoUri] : undefined,
          });
        } else {
          // Fallback: open mailto: (no attachment possible).
          const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          if (Platform.OS === "web") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).window.location.href = url;
          } else {
            await Linking.openURL(url);
          }
        }
      } else {
        // SMS: sms: URL scheme can pre-fill the body but cannot attach a
        // photo. To send the photo as MMS we open the system share sheet
        // with the image — user picks Messages and types/keeps the body.
        if (photoUri && Platform.OS !== "web") {
          const canShare = await Sharing.isAvailableAsync().catch(() => false);
          if (canShare) {
            await Sharing.shareAsync(photoUri, {
              dialogTitle: subject,
              mimeType: "image/jpeg",
              UTI: "public.jpeg",
            });
            // Some users may also want the prefilled text — drop into clipboard so
            // they can paste it into Messages after they select a recipient.
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const Clipboard = await import("expo-clipboard");
              await Clipboard.setStringAsync(`${subject}\n\n${body}`);
            } catch {
              // best-effort
            }
          } else {
            const url = `sms:${phone}?body=${encodeURIComponent(body)}`;
            await Linking.openURL(url);
          }
        } else {
          // No photo (or web): regular sms: link with body pre-filled.
          const url = `sms:${phone}?body=${encodeURIComponent(body)}`;
          if (Platform.OS === "web") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).window.location.href = url;
          } else {
            await Linking.openURL(url);
          }
        }
      }
      // Auto mark Reported
      const cur = t.repair_info?.repair_status || "Not Reported";
      if (cur === "Not Reported") {
        await api.updateTool(t.id, {
          repair_info: {
            ...(t.repair_info || {}),
            company_notified: dealer?.name || "",
            contact: agent?.name || "",
            notified_at: new Date().toISOString().substring(0, 10),
            repair_status: "Reported",
          },
        });
        load();
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  if (!dealer) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.empty}>
          <Text style={{ color: theme.colors.textMuted }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title={dealer.name}
        subtitle="Claims / Repairs"
        onBack={() => router.back()} backIcon="chevron-back"
      />
      <View style={styles.detailActionsRowDC}>
        <PillButton
          testID="open-dealer-detail"
          label="DEALER"
          icon="briefcase"
          variant="active"
          onPress={() => router.push(`/dealer/${dealer.id}`)}
        />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          testID="tab-open"
          style={[styles.tabChip, tab === "open" && styles.tabChipOn]}
          onPress={() => setTab("open")}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === "open" && styles.tabTextOn]}>
            OPEN ({open.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="tab-completed"
          style={[styles.tabChip, tab === "completed" && styles.tabChipOn]}
          onPress={() => setTab("completed")}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === "completed" && styles.tabTextOn]}>
            COMPLETED ({completed.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
      >
        {visible.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name={tab === "open" ? "checkmark-circle" : "archive"}
              size={48}
              color={tab === "open" ? theme.colors.success : theme.colors.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {tab === "open" ? "No open repairs" : "No completed repairs"}
            </Text>
            <Text style={styles.emptyText}>
              {tab === "open"
                ? `Nothing broken at ${dealer.name} right now.`
                : "When tools are marked Repaired, they show up here."}
            </Text>
          </View>
        ) : (
          visible.map((t) => {
            const status = (t.repair_info?.repair_status || "Not Reported").toUpperCase();
            const statusColor =
              status === "NOT REPORTED"
                ? theme.colors.textMuted
                : status === "REPORTED"
                ? theme.colors.accent
                : status === "REPAIRED"
                ? theme.colors.success
                : theme.colors.accentSecondary;
            const photo = t.repair_info?.broken_photo || t.photos?.[0];
            return (
              <BevelCard
                key={t._archivedClaim ? `claim-${t.claim_id || t.id}` : `tool-${t.id}`}
                style={styles.card}
              >
                <TouchableOpacity
                  testID={`open-claim-${t.id}`}
                  style={styles.cardHead}
                  onPress={() =>
                    t._archivedClaim && t.claim_id
                      ? router.push(`/claim/${t.claim_id}`)
                      : router.push(`/tool/${t.id}`)
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.thumb}>
                    {photo ? (
                      <Image source={{ uri: photo }} style={styles.thumbImg} />
                    ) : (
                      <Ionicons name="build" size={24} color={theme.colors.danger} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {t.name}
                    </Text>
                    {!!t.repair_info?.contact && (
                      <Text style={styles.itemMeta}>Contact: {formatPhonesInText(t.repair_info.contact)}</Text>
                    )}
                    {!!t.repair_info?.notified_at && (
                      <Text style={styles.notifiedHighlight}>
                        Notified: {fmtDate(t.repair_info.notified_at)}
                      </Text>
                    )}
                    {!!t.repair_info?.expected_completion && (
                      <Text style={styles.itemMeta}>
                        Expected back: {fmtDate(t.repair_info.expected_completion)}
                      </Text>
                    )}
                    <TouchableOpacity
                      testID={`status-pill-${t.id}`}
                      style={[styles.statusPill, { borderColor: statusColor }]}
                      onPress={() => tab === "open" && setStatusPickerFor(t)}
                      disabled={tab !== "open"}
                    >
                      <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
                      {tab === "open" && (
                        <Ionicons name="caret-down" size={11} color={statusColor} />
                      )}
                    </TouchableOpacity>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
                {!!t.repair_info?.notes && (
                  <Text style={styles.notes}>{t.repair_info.notes}</Text>
                )}
                {tab === "open" && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      testID={`email-${t.id}`}
                      style={styles.actionBtn}
                      onPress={() => notify(t, "email")}
                    >
                      <ContactIconImage type="mail" size={16} />
                      <Text style={styles.actionText}>EMAIL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`text-${t.id}`}
                      style={styles.actionBtn}
                      onPress={() => notify(t, "sms")}
                    >
                      <ContactIconImage type="text" size={16} />
                      <Text style={styles.actionText}>TEXT</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`detail-${t.id}`}
                      style={[styles.actionBtn, { backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border }]}
                      onPress={() =>
                        t._archivedClaim && t.claim_id
                          ? router.push(`/claim/${t.claim_id}`)
                          : router.push(`/tool/${t.id}`)
                      }
                    >
                      <Ionicons name="open" size={14} color={theme.colors.accent} />
                      <Text style={[styles.actionText, { color: theme.colors.accent }]}>
                        {t._archivedClaim ? "VIEW CLAIM" : "OPEN"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </BevelCard>
            );
          })
        )}
      </ScrollView>

      {/* Status picker modal */}
      <Modal
        transparent
        visible={!!statusPickerFor}
        animationType="slide"
        onRequestClose={() => setStatusPickerFor(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>CHANGE STATUS</Text>
            <Text style={styles.modalSubtitle}>
              {statusPickerFor?.name}
            </Text>
            {REPAIR_STATUSES.map((s) => {
              const isCurrent =
                (statusPickerFor?.repair_info?.repair_status || "Not Reported") === s;
              return (
                <TouchableOpacity
                  key={s}
                  testID={`pick-status-${s.replace(/\s/g, "-")}`}
                  style={[styles.statusOption, isCurrent && styles.statusOptionActive]}
                  onPress={() => updateStatus(statusPickerFor, s)}
                >
                  <Text
                    style={[
                      styles.statusOptionText,
                      isCurrent && styles.statusOptionTextActive,
                    ]}
                  >
                    {s}
                  </Text>
                  {isCurrent && (
                    <Ionicons name="checkmark" size={18} color={theme.colors.accent} />
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setStatusPickerFor(null)}
            >
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  detailActionsRowDC: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  notifiedHighlight: {
    color: c.accent,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 4,
    letterSpacing: 0.3,
  },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: c.bgSecondary,
    paddingHorizontal: 18,
    paddingVertical: 22,
    borderTopWidth: 2,
    borderTopColor: c.accent,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  modalTitle: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 4,
  },
  modalSubtitle: {
    color: c.accent,
    fontSize: 9,
    fontWeight: "700",
    marginBottom: 14,
  },
  statusOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    marginBottom: 8,
    backgroundColor: c.bg,
  },
  statusOptionActive: {
    backgroundColor: "rgba(249, 115, 22,0.12)",
    borderColor: c.accent,
  },
  statusOptionText: {
    color: c.textPrimary,
    fontWeight: "700",
    fontSize: 10,
  },
  statusOptionTextActive: { color: c.accent, fontWeight: "900" },
  cancelBtn: {
    marginTop: 6,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
  },
  cancelBtnText: {
    color: c.textPrimary,
    fontWeight: "900",
    letterSpacing: 2,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    gap: 8,
  },
  backBtn: { padding: 8 },
  title: { color: c.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  subtitle: { color: c.accent, fontSize: 7, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 },
  dealerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 4,
  },
  dealerBtnText: { color: c.accent, fontWeight: "900", fontSize: 7, letterSpacing: 1 },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tabChip: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 4,
  },
  tabChipOn: { backgroundColor: "transparent", borderColor: c.accent, borderWidth: 2 },
  tabText: { color: c.textSecondary, fontWeight: "900", fontSize: 9, letterSpacing: 1 },
  tabTextOn: { color: c.accent },
  emptyState: { alignItems: "center", padding: 40, gap: 12 },
  emptyTitle: { color: c.textPrimary, fontWeight: "900", letterSpacing: 1.5, fontSize: 10 },
  emptyText: { color: c.textMuted, fontSize: 9, textAlign: "center", lineHeight: 14 },
  card: {
    padding: 12,
    marginBottom: 10,
    /* Surface gradient + borders now come from <BevelCard>. The red
       left-border accent (3 px) was a visual indicator for OPEN repairs;
       it competed with BevelCard's bevel highlight, so we removed it. The
       status pill inside the row already conveys urgency. */
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: {
    width: 56,
    height: 56,
    backgroundColor: c.bg,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  itemName: { color: c.textPrimary, fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },
  itemMeta: { color: c.textMuted, fontSize: 8, marginTop: 2 },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 3,
    marginTop: 5,
  },
  statusText: { fontWeight: "900", fontSize: 7, letterSpacing: 0.5 },
  notes: {
    color: c.textSecondary,
    fontSize: 9,
    fontStyle: "italic",
    marginTop: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: c.border,
  },
  actionRow: { flexDirection: "row", gap: 6, marginTop: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    backgroundColor: "transparent",
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: c.danger,
  },
  actionText: { color: c.danger, fontWeight: "900", fontSize: 8, letterSpacing: 1 },
}));
