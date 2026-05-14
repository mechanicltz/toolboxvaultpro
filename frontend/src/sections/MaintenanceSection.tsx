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

import { themedStyles } from "../themeContext";

const TYPES = ["Calibration", "Service", "Inspection", "Cleaning", "Custom"];

function daysUntil(iso: string): number {
  if (!iso) return 9999;
  const target = new Date(iso + "T00:00:00").getTime();
  const today = new Date(new Date().toISOString().substring(0, 10) + "T00:00:00").getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function statusFor(nextDue: string): { color: string; label: string; bg: string } {
  if (!nextDue) return { color: theme.colors.textMuted, label: "—", bg: "transparent" };
  const days = daysUntil(nextDue);
  if (days < 0) return { color: "#fff", label: `${Math.abs(days)}D OVERDUE`, bg: theme.colors.danger };
  if (days <= 30) return { color: "#000", label: `DUE IN ${days}D`, bg: theme.colors.accent };
  if (days <= 90) return { color: theme.colors.accent, label: `IN ${days}D`, bg: "transparent" };
  return { color: theme.colors.textSecondary, label: `IN ${days}D`, bg: "transparent" };
}

export function MaintenanceSection({
  tool,
  onChange,
}: {
  tool: any;
  onChange: () => void;
}) {
  const schedules: any[] = tool?.maintenance || [];
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [serviceTarget, setServiceTarget] = useState<any | null>(null);
  const [historyTarget, setHistoryTarget] = useState<any | null>(null);

  const remove = async (sch: any) => {
    const ok = await confirm("Delete Schedule", `Delete ${sch.type} schedule?`, "Delete", true);
    if (!ok) return;
    try {
      await api.deleteMaintenance(tool.id, sch.id);
      onChange();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>
          MAINTENANCE{schedules.length > 0 ? ` (${schedules.length})` : ""}
        </Text>
        <TouchableOpacity
          testID="add-maintenance-btn"
          style={styles.addBtn}
          onPress={() => setShowAdd(true)}
        >
          <Ionicons name="add" size={14} color="#000" />
          <Text style={styles.addBtnText}>SCHEDULE</Text>
        </TouchableOpacity>
      </View>
      {schedules.length === 0 ? (
        <Text style={styles.empty}>
          No schedules yet. Add calibration / service intervals to track due dates.
        </Text>
      ) : (
        schedules.map((sch: any) => {
          const status = statusFor(sch.next_due_date || "");
          return (
            <View key={sch.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="construct" size={16} color={theme.colors.accent} />
                  <Text style={styles.rowTitle}>{sch.type}</Text>
                  {!!status.label && status.label !== "—" && (
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: status.bg },
                        status.bg === "transparent" && { borderWidth: 1, borderColor: status.color },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: status.color }]}>
                        {status.label}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.rowMeta}>
                  Every {sch.interval_months} mo
                  {sch.last_done_date ? `  ·  Last: ${formatDateUS(sch.last_done_date)}` : ""}
                  {sch.next_due_date ? `  ·  Next: ${formatDateUS(sch.next_due_date)}` : ""}
                </Text>
                {!!sch.notes && <Text style={styles.rowNotes}>{sch.notes}</Text>}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <TouchableOpacity
                    testID={`mark-serviced-${sch.id}`}
                    style={styles.smBtn}
                    onPress={() => setServiceTarget(sch)}
                  >
                    <Ionicons name="checkmark-circle" size={13} color={theme.colors.success} />
                    <Text style={[styles.smBtnText, { color: theme.colors.success }]}>
                      MARK SERVICED
                    </Text>
                  </TouchableOpacity>
                  {(sch.history || []).length > 0 && (
                    <TouchableOpacity
                      testID={`history-${sch.id}`}
                      style={styles.smBtn}
                      onPress={() => setHistoryTarget(sch)}
                    >
                      <Ionicons name="time" size={13} color={theme.colors.textSecondary} />
                      <Text style={[styles.smBtnText, { color: theme.colors.textSecondary }]}>
                        HISTORY ({(sch.history || []).length})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 4 }}>
                <TouchableOpacity
                  testID={`edit-sch-${sch.id}`}
                  onPress={() => setEditTarget(sch)}
                  hitSlop={10}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="pencil" size={16} color={theme.colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`del-sch-${sch.id}`}
                  onPress={() => remove(sch)}
                  hitSlop={10}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {/* Add / Edit modal */}
      <ScheduleModal
        visible={showAdd || !!editTarget}
        toolId={tool?.id}
        existing={editTarget}
        onClose={() => {
          setShowAdd(false);
          setEditTarget(null);
        }}
        onSaved={() => {
          setShowAdd(false);
          setEditTarget(null);
          onChange();
        }}
      />

      {/* Mark serviced modal */}
      <ServiceModal
        visible={!!serviceTarget}
        toolId={tool?.id}
        schedule={serviceTarget}
        onClose={() => setServiceTarget(null)}
        onSaved={() => {
          setServiceTarget(null);
          onChange();
        }}
      />

      {/* History modal */}
      <HistoryModal
        visible={!!historyTarget}
        schedule={historyTarget}
        onClose={() => setHistoryTarget(null)}
      />
    </View>
  );
}

function ScheduleModal({
  visible,
  toolId,
  existing,
  onClose,
  onSaved,
}: {
  visible: boolean;
  toolId: string;
  existing: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState(existing?.type || "Calibration");
  const [customType, setCustomType] = useState("");
  const [interval, setInterval] = useState(String(existing?.interval_months || 12));
  const [lastDone, setLastDone] = useState(existing?.last_done_date || "");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [busy, setBusy] = useState(false);

  // Reset when modal opens
  React.useEffect(() => {
    if (visible) {
      setType(existing?.type || "Calibration");
      setCustomType("");
      setInterval(String(existing?.interval_months || 12));
      setLastDone(existing?.last_done_date || "");
      setNotes(existing?.notes || "");
    }
  }, [visible, existing]);

  const submit = async () => {
    const finalType = type === "Custom" ? customType.trim() || "Service" : type;
    const intMonths = parseInt(interval) || 12;
    if (intMonths <= 0) {
      Alert.alert("Invalid", "Interval must be a positive number of months.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        type: finalType,
        interval_months: intMonths,
        last_done_date: lastDone || null,
        notes,
      };
      if (existing) {
        await api.updateMaintenance(toolId, existing.id, payload);
      } else {
        await api.addMaintenance(toolId, payload);
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
              {existing ? "EDIT SCHEDULE" : "NEW MAINTENANCE SCHEDULE"}
            </Text>
            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>TYPE</Text>
              <View style={styles.chipWrap}>
                {TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, type === t && styles.chipOn]}
                    onPress={() => setType(t)}
                  >
                    <Text style={[styles.chipText, type === t && styles.chipTextOn]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {type === "Custom" && (
                <TextInput
                  placeholder="Custom type name"
                  placeholderTextColor={theme.colors.textMuted}
                  value={customType}
                  onChangeText={setCustomType}
                  style={[styles.input, { marginTop: 8 }]}
                />
              )}

              <Text style={styles.label}>INTERVAL (months)</Text>
              <TextInput
                placeholder="12"
                placeholderTextColor={theme.colors.textMuted}
                value={interval}
                onChangeText={setInterval}
                style={styles.input}
                keyboardType="number-pad"
              />

              <Text style={styles.label}>LAST DONE (optional)</Text>
              <DateField value={lastDone} onChange={setLastDone} />

              <Text style={styles.label}>NOTES</Text>
              <TextInput
                placeholder="Calibrate to factory spec"
                placeholderTextColor={theme.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
                multiline
              />
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={styles.btnGhost} onPress={onClose} disabled={busy}>
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="save-schedule-btn"
                style={styles.btnPrimary}
                onPress={submit}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.btnPrimaryText}>SAVE</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ServiceModal({
  visible,
  toolId,
  schedule,
  onClose,
  onSaved,
}: {
  visible: boolean;
  toolId: string;
  schedule: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().substring(0, 10);
  const [date, setDate] = useState(today);
  const [cost, setCost] = useState("");
  const [tech, setTech] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setDate(today);
      setCost("");
      setTech("");
      setNotes("");
    }
  }, [visible]);

  const submit = async () => {
    setBusy(true);
    try {
      await api.logService(toolId, schedule.id, {
        date,
        cost: parseFloat(cost) || 0,
        technician: tech,
        notes,
      });
      onSaved();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!schedule) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>MARK SERVICED — {schedule.type}</Text>
            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>DATE</Text>
              <DateField value={date} onChange={setDate} />
              <Text style={styles.label}>COST ($)</Text>
              <TextInput
                placeholder="0.00"
                placeholderTextColor={theme.colors.textMuted}
                value={cost}
                onChangeText={setCost}
                style={styles.input}
                keyboardType="decimal-pad"
              />
              <Text style={styles.label}>TECHNICIAN / SHOP</Text>
              <TextInput
                placeholder="Calibration Lab Inc."
                placeholderTextColor={theme.colors.textMuted}
                value={tech}
                onChangeText={setTech}
                style={styles.input}
              />
              <Text style={styles.label}>NOTES</Text>
              <TextInput
                placeholder="Cert # 12345, accuracy verified..."
                placeholderTextColor={theme.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                multiline
              />
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={styles.btnGhost} onPress={onClose} disabled={busy}>
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-service-btn"
                style={styles.btnPrimary}
                onPress={submit}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.btnPrimaryText}>LOG SERVICE</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function HistoryModal({
  visible,
  schedule,
  onClose,
}: {
  visible: boolean;
  schedule: any | null;
  onClose: () => void;
}) {
  if (!schedule) return null;
  const events = (schedule.history || []).slice().reverse();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tapping outside the card closes the modal — a common iOS/Android pattern. */}
      <TouchableOpacity
        style={styles.modalBg}
        activeOpacity={1}
        onPress={onClose}
        testID="history-modal-backdrop"
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={styles.modalCard}>
            {/* Top-right X close — always visible, can't be squeezed off-screen. */}
            <View style={styles.historyHeaderRow}>
              <Text style={styles.modalTitle}>{schedule.type} HISTORY</Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={12}
                testID="history-modal-close"
                style={styles.closeXBtn}
              >
                <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {events.length === 0 ? (
                <Text style={styles.empty}>No events logged yet.</Text>
              ) : (
                events.map((ev: any, i: number) => (
                  <View key={ev.id || i} style={styles.histRow}>
                    <Text style={styles.histDate}>{ev.date}</Text>
                    {!!ev.cost && <Text style={styles.histCost}>${(ev.cost || 0).toFixed(2)}</Text>}
                    {!!ev.technician && (
                      <Text style={styles.histLine}>By: {ev.technician}</Text>
                    )}
                    {!!ev.notes && <Text style={styles.histNotes}>{ev.notes}</Text>}
                  </View>
                ))
              )}
            </ScrollView>
            {/* Big primary CLOSE button at the bottom — always tappable. */}
            <TouchableOpacity
              style={styles.historyCloseBtn}
              onPress={onClose}
              testID="history-modal-close-bottom"
            >
              <Text style={styles.historyCloseBtnText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = themedStyles((c) => ({
  section: { marginTop: 18 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionLabel: {
    color: c.textPrimary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: c.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 4,
  },
  addBtnText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 8,
    letterSpacing: 1.5,
  },
  empty: {
    color: c.textMuted,
    fontSize: 9,
    fontStyle: "italic",
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 4,
    marginBottom: 8,
    gap: 8,
  
    ...(theme.elevation.md as object),
  },
  rowTitle: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  rowMeta: {
    color: c.textSecondary,
    fontSize: 8,
    marginTop: 4,
  },
  rowNotes: {
    color: c.textMuted,
    fontSize: 9,
    fontStyle: "italic",
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    marginLeft: "auto",
  },
  badgeText: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1,
  },
  smBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 3,
  },
  smBtnText: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: c.bgSecondary,
    padding: 20,
    borderRadius: theme.radii.md,
    borderTopWidth: 2,
    borderTopColor: c.accent,
    maxHeight: "94%",
  },
  modalTitle: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 14,
  },
  label: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    color: c.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 4,
    fontSize: 10,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: theme.radii.pill,
    backgroundColor: c.bg,
  },
  chipOn: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  chipText: {
    color: c.textSecondary,
    fontSize: 9,
    fontWeight: "700",
  },
  chipTextOn: { color: "#000", fontWeight: "900" },
  btnGhost: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.sm,
  },

  // ---------- HISTORY MODAL ----------
  historyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  closeXBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
  },
  historyCloseBtn: {
    marginTop: 14,
    height: 46,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.sm,
  },
  historyCloseBtnText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 2,
  },
  btnGhostText: {
    color: c.textPrimary,
    fontWeight: "800",
    letterSpacing: 2,
  },
  btnPrimary: {
    flex: 2,
    height: 44,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.sm,
  },
  btnPrimaryText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 10,
  },
  histRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  histDate: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 10,
  },
  histCost: {
    color: c.accent,
    fontWeight: "800",
    fontSize: 9,
    marginTop: 2,
  },
  histLine: {
    color: c.textSecondary,
    fontSize: 9,
    marginTop: 2,
  },
  histNotes: {
    color: c.textMuted,
    fontSize: 9,
    fontStyle: "italic",
    marginTop: 4,
  },
}));
