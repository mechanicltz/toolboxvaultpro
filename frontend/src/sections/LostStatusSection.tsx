import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import { api } from "../api";
import { DateField } from "../DateField";
import { confirm } from "../confirm";
import { formatDateUS } from "../dateUtil";

export function LostStatusBanner({
  tool,
  onChange,
}: {
  tool: any;
  onChange: () => void;
}) {
  const ls = tool?.lost_status;
  if (!ls?.is_lost) return null;
  const isStolen = ls.type === "stolen";
  const recover = async () => {
    const ok = await confirm(
      "Mark Recovered",
      "Mark this tool as found / recovered?",
      "Recover",
    );
    if (!ok) return;
    try {
      await api.recoverTool(tool.id);
      onChange();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };
  return (
    <View style={styles.banner}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Ionicons
          name={isStolen ? "warning" : "help-circle"}
          size={26}
          color="#fff"
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>
            {isStolen ? "REPORTED STOLEN" : "REPORTED LOST"}
          </Text>
          {!!ls.reported_date && (
            <Text style={styles.bannerLine}>Reported: {formatDateUS(ls.reported_date)}</Text>
          )}
          {!!ls.police_report_number && (
            <Text style={styles.bannerLine}>
              Police Report #: {ls.police_report_number}
            </Text>
          )}
          {!!ls.insurance_company && (
            <Text style={styles.bannerLine}>
              Insurance: {ls.insurance_company}
              {ls.insurance_claim_number
                ? `  ·  Claim #${ls.insurance_claim_number}`
                : ""}
            </Text>
          )}
          {!!ls.notes && (
            <Text style={[styles.bannerLine, { fontStyle: "italic" }]}>
              {ls.notes}
            </Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        testID="recover-tool-btn"
        style={styles.recoverBtn}
        onPress={recover}
      >
        <Ionicons name="checkmark-circle" size={16} color="#000" />
        <Text style={styles.recoverText}>MARK RECOVERED</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ReportLostButton({
  tool,
  onChange,
}: {
  tool: any;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (tool?.lost_status?.is_lost) return null;
  return (
    <>
      <TouchableOpacity
        testID="report-lost-btn"
        style={styles.outlineBtn}
        onPress={() => setOpen(true)}
      >
        <Ionicons name="warning-outline" size={16} color={theme.colors.danger} />
        <Text style={styles.outlineBtnText}>REPORT LOST / STOLEN</Text>
      </TouchableOpacity>
      <ReportLostModal
        toolId={tool.id}
        visible={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          onChange();
        }}
      />
    </>
  );
}

export function ReportLostModal({
  toolId,
  toolIds,
  visible,
  onClose,
  onSaved,
  bulk = false,
}: {
  toolId?: string;
  toolIds?: string[];
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  bulk?: boolean;
}) {
  const today = new Date().toISOString().substring(0, 10);
  const [type, setType] = useState<"lost" | "stolen">("lost");
  const [reportedDate, setReportedDate] = useState(today);
  const [police, setPolice] = useState("");
  const [insurance, setInsurance] = useState("");
  const [claim, setClaim] = useState("");
  const [reportedBy, setReportedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        type,
        reported_date: reportedDate,
        police_report_number: police,
        insurance_company: insurance,
        insurance_claim_number: claim,
        reported_by: reportedBy,
        notes,
      };
      if (bulk && toolIds) {
        await api.bulkTools({
          tool_ids: toolIds,
          action: "report_lost",
          lost_payload: payload,
        });
      } else if (toolId) {
        await api.reportLost(toolId, payload);
      }
      onSaved();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {bulk
                ? `REPORT ${toolIds?.length || 0} TOOLS LOST/STOLEN`
                : "REPORT LOST / STOLEN"}
            </Text>

            <View style={styles.segment}>
              <TouchableOpacity
                style={[styles.segBtn, type === "lost" && styles.segBtnActive]}
                onPress={() => setType("lost")}
              >
                <Text style={[styles.segText, type === "lost" && styles.segTextActive]}>
                  LOST
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segBtn, type === "stolen" && styles.segBtnActive]}
                onPress={() => setType("stolen")}
              >
                <Text style={[styles.segText, type === "stolen" && styles.segTextActive]}>
                  STOLEN
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>REPORTED DATE</Text>
              <DateField value={reportedDate} onChange={setReportedDate} />

              {type === "stolen" && (
                <>
                  <Text style={styles.label}>POLICE REPORT #</Text>
                  <TextInput
                    placeholder="e.g. 24-12345"
                    placeholderTextColor={theme.colors.textMuted}
                    value={police}
                    onChangeText={setPolice}
                    style={styles.input}
                  />
                </>
              )}

              <Text style={styles.label}>INSURANCE COMPANY</Text>
              <TextInput
                placeholder="e.g. State Farm"
                placeholderTextColor={theme.colors.textMuted}
                value={insurance}
                onChangeText={setInsurance}
                style={styles.input}
              />
              <Text style={styles.label}>INSURANCE CLAIM #</Text>
              <TextInput
                placeholder="e.g. 7798XK"
                placeholderTextColor={theme.colors.textMuted}
                value={claim}
                onChangeText={setClaim}
                style={styles.input}
              />
              <Text style={styles.label}>REPORTED BY</Text>
              <TextInput
                placeholder="Your name (optional)"
                placeholderTextColor={theme.colors.textMuted}
                value={reportedBy}
                onChangeText={setReportedBy}
                style={styles.input}
              />
              <Text style={styles.label}>NOTES</Text>
              <TextInput
                placeholder="What happened, last seen location, etc."
                placeholderTextColor={theme.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                multiline
              />
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={onClose}
                disabled={busy}
              >
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="submit-lost-btn"
                style={styles.btnDanger}
                onPress={submit}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnDangerText}>
                    {type === "stolen" ? "REPORT STOLEN" : "REPORT LOST"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: theme.colors.danger,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 6,
    borderTopWidth: 3,
    borderTopColor: "#fff",
  },
  bannerTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 4,
  },
  bannerLine: {
    color: "#fff",
    fontSize: 9,
    marginTop: 2,
  },
  recoverBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginTop: 10,
  },
  recoverText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 8,
    letterSpacing: 1.5,
  },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 4,
    marginTop: 12,
  },
  outlineBtnText: {
    color: theme.colors.danger,
    fontWeight: "800",
    letterSpacing: 1.5,
    fontSize: 9,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 20,
    borderRadius: theme.radii.md,
    borderTopWidth: 2,
    borderTopColor: theme.colors.danger,
    maxHeight: "94%",
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 14,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: theme.colors.bg,
    borderRadius: 6,
    padding: 3,
    marginBottom: 14,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 4,
  },
  segBtnActive: {
    backgroundColor: theme.colors.danger,
  },
  segText: {
    color: theme.colors.textSecondary,
    fontWeight: "800",
    letterSpacing: 1.5,
    fontSize: 9,
  },
  segTextActive: { color: "#fff" },
  label: {
    color: theme.colors.textMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 4,
    fontSize: 10,
  },
  btnGhost: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.sm,
  },
  btnGhostText: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    letterSpacing: 2,
  },
  btnDanger: {
    flex: 2,
    height: 44,
    backgroundColor: theme.colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.sm,
    flexDirection: "row",
    gap: 8,
  },
  btnDangerText: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 10,
  },
});
