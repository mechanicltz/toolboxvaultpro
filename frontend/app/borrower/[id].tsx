import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { formatDateTime } from "../../src/dt";
import { parseContacts, openEmail, openPhone, openSms } from "../../src/contactLinks";

import { themedStyles } from "../../src/themeContext";

export default function BorrowerHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ name: string; contact: string }>({ name: "", contact: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await api.borrowerHistory(id);
      setData(d);
    } catch {
      router.back();
    }
  }, [id, router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEditModal = () => {
    if (!data?.borrower) return;
    setEditForm({
      name: data.borrower.name || "",
      contact: data.borrower.contact || "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!id) return;
    const name = (editForm.name || "").trim();
    if (!name) return;
    setSaving(true);
    try {
      await api.updateBorrower(id, { name, contact: (editForm.contact || "").trim() });
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: theme.colors.textPrimary, padding: 20 }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const b = data.borrower;
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{b.name.toUpperCase()}</Text>
        <TouchableOpacity testID="edit-borrower-btn" onPress={openEditModal} hitSlop={10}>
          <Ionicons name="create-outline" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.heroBox}>
          <View style={styles.bigAvatar}>
            <Text style={styles.bigAvatarText}>
              {b.name.substring(0, 2).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.bigName}>{b.name}</Text>
          <ContactActions raw={b.contact} />
          <TouchableOpacity
            testID="edit-borrower-pill-btn"
            style={styles.editPill}
            onPress={openEditModal}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={14} color={theme.colors.accent} />
            <Text style={styles.editPillText}>EDIT CONTACT</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statGrid}>
          <Cell label="Total checkouts" value={String(data.total_checkouts || 0)} />
          <Cell label="Unique tools" value={String(data.unique_tools || 0)} />
          <Cell label="Currently held" value={String(data.currently_held?.length || 0)} highlight={data.currently_held?.length > 0} />
        </View>

        {data.currently_held?.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>CURRENTLY CHECKED OUT</Text>
            {data.currently_held.map((c: any) => (
              <TouchableOpacity
                key={c.tool_id}
                testID={`held-${c.tool_id}`}
                style={[styles.row, { borderLeftColor: theme.colors.accentSecondary, borderLeftWidth: 3 }]}
                onPress={() => router.push(`/tool/${c.tool_id}`)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{c.tool_name}</Text>
                  <Text style={styles.rowMeta}>
                    Out since {formatDateTime(c.checked_out_at)}
                  </Text>
                  {!!c.notes && <Text style={styles.rowNotes}>{c.notes}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        )}

        <Text style={styles.sectionLabel}>
          PER-TOOL TOTALS
        </Text>
        {data.per_tool.length === 0 ? (
          <Text style={styles.empty}>No checkout history yet.</Text>
        ) : (
          data.per_tool.map((t: any, idx: number) => (
            <TouchableOpacity
              key={t.tool_id}
              testID={`per-tool-${t.tool_id}`}
              style={styles.row}
              onPress={() => router.push(`/tool/${t.tool_id}`)}
            >
              <View style={styles.rank}>
                <Text style={styles.rankText}>{idx + 1}</Text>
              </View>
              <View style={styles.thumb}>
                {t.photo ? (
                  <Image source={{ uri: t.photo }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <Ionicons name="construct" size={18} color={theme.colors.accent} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{t.tool_name}</Text>
                <Text style={styles.rowMeta}>
                  Last out {formatDateTime(t.last_checked_out_at)}
                </Text>
              </View>
              <View style={styles.countPill}>
                <Text style={styles.countNum}>{t.checkout_count}</Text>
                <Text style={styles.countLbl}>×</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        <Text style={styles.sectionLabel}>RECENT TIMELINE</Text>
        {data.history.length === 0 ? (
          <Text style={styles.empty}>No checkouts yet.</Text>
        ) : (
          data.history.map((h: any, i: number) => (
            <View key={i} style={styles.histRow}>
              <View style={styles.dot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.histTool}>{h.tool_name}</Text>
                <Text style={styles.histTime}>
                  Out: {formatDateTime(h.checked_out_at)}
                </Text>
                <Text style={styles.histTime}>
                  In:{"  "}{h.checked_in_at ? formatDateTime(h.checked_in_at) : "still out"}
                </Text>
                {!!h.notes && <Text style={styles.rowNotes}>{h.notes}</Text>}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Edit contact modal */}
      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBg}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>EDIT CONTACT</Text>
            <Text style={styles.modalLabel}>NAME</Text>
            <TextInput
              testID="edit-borrower-name-input"
              placeholder="Contact name"
              placeholderTextColor={theme.colors.textMuted}
              value={editForm.name}
              onChangeText={(v) => setEditForm({ ...editForm, name: v })}
              style={styles.modalInput}
              autoFocus
            />
            <Text style={styles.modalLabel}>PHONE / EMAIL</Text>
            <TextInput
              testID="edit-borrower-contact-input"
              placeholder="555-867-5309 / jim@example.com"
              placeholderTextColor={theme.colors.textMuted}
              value={editForm.contact}
              onChangeText={(v) => setEditForm({ ...editForm, contact: v })}
              style={styles.modalInput}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                testID="edit-borrower-cancel-btn"
                style={styles.modalBtnGhost}
                onPress={() => setEditing(false)}
                disabled={saving}
              >
                <Text style={styles.modalBtnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="edit-borrower-save-btn"
                style={[styles.modalBtn, (!editForm.name.trim() || saving) && { opacity: 0.5 }]}
                onPress={saveEdit}
                disabled={!editForm.name.trim() || saving}
              >
                <Text style={styles.modalBtnText}>{saving ? "SAVING…" : "SAVE"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Cell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={[styles.cell, highlight && { borderColor: theme.colors.accentSecondary }]}>
      <Text style={[styles.cellValue, highlight && { color: theme.colors.accentSecondary }]}>{value}</Text>
      <Text style={styles.cellLabel}>{label}</Text>
    </View>
  );
}

function ContactActions({ raw }: { raw?: string | null }) {
  if (!raw) return null;
  const { emails, phones } = parseContacts(raw);
  if (emails.length === 0 && phones.length === 0) {
    // unparseable — still render the raw text muted but not tappable
    return <Text style={styles.contact}>{raw}</Text>;
  }
  return (
    <View style={styles.actionsWrap}>
      {phones.map((p) => (
        <View key={`pgrp-${p}`} style={styles.actionGroup}>
          <TouchableOpacity
            testID={`contact-call-${p}`}
            style={styles.actionBtn}
            onPress={() => openPhone(p)}
            activeOpacity={0.7}
          >
            <Ionicons name="call" size={16} color={theme.colors.accent} />
            <Text style={styles.actionText} numberOfLines={1}>{p}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID={`contact-text-${p}`}
            style={[styles.actionBtn, styles.actionBtnSmall]}
            onPress={() => openSms(p)}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-ellipses" size={15} color={theme.colors.accent} />
            <Text style={styles.actionText}>Text</Text>
          </TouchableOpacity>
        </View>
      ))}
      {emails.map((e) => (
        <TouchableOpacity
          key={`e-${e}`}
          testID={`contact-email-${e}`}
          style={styles.actionBtn}
          onPress={() => openEmail(e)}
          activeOpacity={0.7}
        >
          <Ionicons name="mail" size={16} color={theme.colors.accent} />
          <Text style={styles.actionText} numberOfLines={1}>{e}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  title: { color: c.textPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 2, flex: 1, textAlign: "center" },
  heroBox: { alignItems: "center", paddingVertical: 16 },
  bigAvatar: {
    width: 70, height: 70, backgroundColor: c.surface,
    borderWidth: 2, borderColor: c.accent,
    alignItems: "center", justifyContent: "center", borderRadius: 4,
  },
  bigAvatarText: { color: c.accent, fontWeight: "900", fontSize: 16, letterSpacing: 2 },
  bigName: { color: c.textPrimary, fontSize: 16, fontWeight: "900", letterSpacing: 1, marginTop: 12 },
  contact: { color: c.textSecondary, fontSize: 10, marginTop: 4 },
  actionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 14,
  },
  actionGroup: {
    flexDirection: "row",
    gap: 4,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: c.surface,
  
    ...(theme.elevation.md as object),
  },
  actionBtnSmall: {
    paddingHorizontal: 10,
  },
  actionText: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "700",
  },
  statGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 14, marginVertical: 12, gap: 8 },
  cell: {
    flex: 1, minWidth: 90, paddingVertical: 12,
    borderWidth: 1, borderColor: c.border,
    backgroundColor: c.bgSecondary,
    alignItems: "center", borderRadius: 4,
  
    ...(theme.elevation.md as object),
  },
  cellValue: { color: c.textPrimary, fontWeight: "900", fontSize: 16 },
  cellLabel: {
    color: c.textMuted, fontSize: 7,
    fontWeight: "800", letterSpacing: 1, marginTop: 2, textTransform: "uppercase",
  },
  sectionLabel: {
    color: c.textMuted, fontSize: 8, fontWeight: "800",
    letterSpacing: 2, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomColor: c.borderSubtle, borderBottomWidth: 1,
    backgroundColor: c.bgSecondary,
    marginHorizontal: 14, marginBottom: 6, borderRadius: 4,
  },
  rank: {
    width: 28, height: 28, alignItems: "center", justifyContent: "center",
    backgroundColor: c.surface, borderRadius: 4,
  },
  rankText: { color: c.accent, fontWeight: "900", fontSize: 10 },
  thumb: {
    width: 36, height: 36, borderRadius: 4, overflow: "hidden",
    backgroundColor: c.surface,
    alignItems: "center", justifyContent: "center",
  },
  rowName: { color: c.textPrimary, fontWeight: "700", fontSize: 10 },
  rowMeta: { color: c.textSecondary, fontSize: 8, marginTop: 2 },
  rowNotes: { color: c.textMuted, fontStyle: "italic", fontSize: 8, marginTop: 4 },
  countPill: {
    flexDirection: "row", alignItems: "center", gap: 2,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: c.accent, borderRadius: 4,
  },
  countNum: { color: "#000", fontWeight: "900", fontSize: 10 },
  countLbl: { color: "#000", fontWeight: "900", fontSize: 8 },
  histRow: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomColor: c.borderSubtle, borderBottomWidth: 1,
  },
  dot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: c.accent, marginTop: 6,
  },
  histTool: { color: c.textPrimary, fontWeight: "700", fontSize: 10 },
  histTime: { color: c.textSecondary, fontSize: 8, marginTop: 2 },
  empty: { color: c.textMuted, fontStyle: "italic", padding: 20, textAlign: "center" },
  editPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: c.surface,
    marginTop: 12,
  
    ...(theme.elevation.md as object),
  },
  editPillText: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 1.2,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: c.bgSecondary,
    padding: 24,
    borderTopWidth: 2,
    borderTopColor: c.accent,
  },
  modalTitle: {
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 16,
  },
  modalLabel: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    color: c.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    borderRadius: 4,
    fontSize: 12,
  },
  modalBtn: {
    flex: 1,
    backgroundColor: c.accent,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  modalBtnText: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 11 },
  modalBtnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: c.border,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  modalBtnGhostText: { color: c.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 11 },
}));
