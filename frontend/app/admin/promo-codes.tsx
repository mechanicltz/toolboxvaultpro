// Admin page for managing promo codes. Only visible to accounts whose email
// is listed in the backend's ADMIN_EMAILS env var. Non-admins get redirected.
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Switch,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";

import { themedStyles } from "../../src/themeContext";

type PromoCode = {
  id: string;
  code: string;
  grant_type: "lifetime" | "months";
  months: number;
  max_redemptions: number;
  redeemed_count: number;
  is_active: boolean;
  notes?: string;
  created_at?: string;
};

export default function AdminPromoCodesPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api.adminWhoAmI();
      if (!me.is_admin) {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      const list = await api.adminListPromoCodes();
      setCodes(list || []);
    } catch {
      setAllowed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openNew = () => {
    setEditing(null);
    setShowEditor(true);
  };

  const openEdit = (c: PromoCode) => {
    setEditing(c);
    setShowEditor(true);
  };

  const onSaved = () => {
    setShowEditor(false);
    setEditing(null);
    load();
  };

  const toggleActive = async (c: PromoCode) => {
    try {
      await api.adminUpdatePromoCode(c.id, { is_active: !c.is_active });
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.detail || e?.message || "Update failed");
    }
  };

  const confirmDelete = (c: PromoCode) => {
    const doIt = async () => {
      try {
        await api.adminDeletePromoCode(c.id);
        load();
      } catch (e: any) {
        Alert.alert("Error", e?.detail || e?.message || "Delete failed");
      }
    };
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Delete code "${c.code}"? This cannot be undone.`)) doIt();
      return;
    }
    Alert.alert(
      "Delete code?",
      `"${c.code}" will be permanently removed. Users who already redeemed it keep their access.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doIt },
      ],
    );
  };

  if (allowed === false) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={26} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ADMIN</Text>
        </View>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>Admin access only</Text>
          <Text style={styles.emptyBody}>
            This screen is restricted to administrator accounts.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} testID="back-btn">
          <Ionicons name="arrow-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PROMO CODES</Text>
        <TouchableOpacity style={styles.headerAdd} onPress={openNew} testID="new-code-btn">
          <Ionicons name="add" size={18} color="#000" />
          <Text style={styles.headerAddText}>NEW</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : codes.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="gift-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>No codes yet</Text>
          <Text style={styles.emptyBody}>
            Tap NEW to create your first promo code.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
          {codes.map((c) => (
            <View key={c.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.code} selectable>
                    {c.code}
                  </Text>
                  <Text style={styles.codeMeta}>
                    {c.grant_type === "lifetime" ? "Lifetime PRO" : `${c.months} months PRO`}
                    {"  ·  "}
                    {c.redeemed_count} / {c.max_redemptions} used
                  </Text>
                  {!!c.notes && <Text style={styles.notes}>{c.notes}</Text>}
                </View>
                <Switch
                  value={c.is_active}
                  onValueChange={() => toggleActive(c)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                  thumbColor="#fff"
                />
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(c)}>
                  <Ionicons name="create-outline" size={14} color={theme.colors.accent} />
                  <Text style={styles.actionText}>EDIT</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.dangerBtn]}
                  onPress={() => confirmDelete(c)}
                >
                  <Ionicons name="trash-outline" size={14} color={theme.colors.danger} />
                  <Text style={[styles.actionText, { color: theme.colors.danger }]}>DELETE</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <PromoEditorModal
        visible={showEditor}
        editing={editing}
        onClose={() => {
          setShowEditor(false);
          setEditing(null);
        }}
        onSaved={onSaved}
      />
    </SafeAreaView>
  );
}

// =============================================================================
// Editor modal (create OR edit)
// =============================================================================
function PromoEditorModal({
  visible,
  editing,
  onClose,
  onSaved,
}: {
  visible: boolean;
  editing: PromoCode | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editing;

  const [code, setCode] = useState("");
  const [grantType, setGrantType] = useState<"lifetime" | "months">("lifetime");
  const [months, setMonths] = useState("12");
  const [maxRedemptions, setMaxRedemptions] = useState("1");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Sync state when opening for edit or create.
  useEffect(() => {
    if (visible) {
      setCode(editing?.code || "");
      setGrantType(editing?.grant_type || "lifetime");
      setMonths(String(editing?.months || 12));
      setMaxRedemptions(String(editing?.max_redemptions || 1));
      setNotes(editing?.notes || "");
      setIsActive(editing?.is_active ?? true);
      setErr("");
    }
  }, [visible, editing]);

  const submit = async () => {
    setErr("");
    const maxR = parseInt(maxRedemptions || "1", 10);
    const m = parseInt(months || "0", 10);
    if (Number.isNaN(maxR) || maxR < 1) return setErr("Max redemptions must be at least 1");
    if (grantType === "months" && (Number.isNaN(m) || m < 1))
      return setErr("Months must be at least 1");
    setBusy(true);
    try {
      if (isEdit && editing) {
        await api.adminUpdatePromoCode(editing.id, {
          code: code.trim().toUpperCase() || undefined,
          grant_type: grantType,
          months: grantType === "months" ? m : 0,
          max_redemptions: maxR,
          is_active: isActive,
          notes: notes.trim(),
        });
      } else {
        await api.adminCreatePromoCode({
          code: code.trim().toUpperCase() || undefined,
          grant_type: grantType,
          months: grantType === "months" ? m : 0,
          max_redemptions: maxR,
          is_active: isActive,
          notes: notes.trim(),
        });
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={Platform.OS === "ios" ? "slide" : "fade"}
      onRequestClose={onClose}
    >
      <View style={editorStyles.bg}>
        <View style={editorStyles.card}>
          <ScrollView contentContainerStyle={{ padding: 18 }}>
            <View style={editorStyles.head}>
              <Text style={editorStyles.title}>
                {isEdit ? "EDIT CODE" : "NEW CODE"}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={editorStyles.label}>CODE</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder={isEdit ? "" : "Leave blank to auto-generate"}
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[editorStyles.input, { flex: 1 }]}
              />
            </View>
            <Text style={editorStyles.hint}>
              Tip: leave empty to auto-generate a secure random code.
            </Text>

            <Text style={editorStyles.label}>GRANT TYPE</Text>
            <View style={editorStyles.tabRow}>
              <TouchableOpacity
                style={[
                  editorStyles.tab,
                  grantType === "lifetime" && editorStyles.tabActive,
                ]}
                onPress={() => setGrantType("lifetime")}
              >
                <Text
                  style={[
                    editorStyles.tabText,
                    grantType === "lifetime" && editorStyles.tabTextActive,
                  ]}
                >
                  LIFETIME
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  editorStyles.tab,
                  grantType === "months" && editorStyles.tabActive,
                ]}
                onPress={() => setGrantType("months")}
              >
                <Text
                  style={[
                    editorStyles.tabText,
                    grantType === "months" && editorStyles.tabTextActive,
                  ]}
                >
                  TIMED
                </Text>
              </TouchableOpacity>
            </View>

            {grantType === "months" && (
              <>
                <Text style={editorStyles.label}>MONTHS</Text>
                <TextInput
                  value={months}
                  onChangeText={setMonths}
                  placeholder="12"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="number-pad"
                  style={editorStyles.input}
                />
              </>
            )}

            <Text style={editorStyles.label}>MAX REDEMPTIONS</Text>
            <TextInput
              value={maxRedemptions}
              onChangeText={setMaxRedemptions}
              placeholder="1"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              style={editorStyles.input}
            />
            <Text style={editorStyles.hint}>
              How many different people can redeem this code total.
            </Text>

            <Text style={editorStyles.label}>NOTES (PRIVATE)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Given to Mike, expires Dec 2026"
              placeholderTextColor={theme.colors.textMuted}
              style={[editorStyles.input, { minHeight: 60 }]}
              multiline
            />

            <View style={editorStyles.switchRow}>
              <Text style={editorStyles.switchLabel}>ACTIVE</Text>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                thumbColor="#fff"
              />
            </View>

            {err ? <Text style={editorStyles.err}>{err}</Text> : null}

            <TouchableOpacity
              style={[editorStyles.submit, busy && { opacity: 0.6 }]}
              onPress={submit}
              disabled={busy}
              testID="save-promo-btn"
            >
              {busy ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={editorStyles.submitText}>
                  {isEdit ? "SAVE CHANGES" : "CREATE CODE"}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerTitle: {
    flex: 1,
    color: c.textPrimary,
    fontWeight: "900",
    letterSpacing: 1.4,
    fontSize: 14,
  },
  headerAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.accent,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  headerAddText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
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
  },
  card: {
    backgroundColor: c.bgSecondary,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  
    ...(theme.elevation.md as object),
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  code: {
    color: c.textPrimary,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 1.5,
  },
  codeMeta: {
    color: c.textSecondary,
    fontSize: 11,
    marginTop: 3,
    fontWeight: "700",
  },
  notes: {
    color: c.textMuted,
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 4,
  },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dangerBtn: { borderColor: c.danger },
  actionText: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 1,
  },
}));

const editorStyles = themedStyles((c) => ({
  bg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "92%",
    backgroundColor: c.bgSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    color: c.textPrimary,
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 13,
  },
  label: {
    color: c.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 6,
  },
  hint: {
    color: c.textMuted,
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 4,
  },
  input: {
    backgroundColor: c.bg,
    color: c.textPrimary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  tabRow: { flexDirection: "row", gap: 6 },
  tab: {
    flex: 1,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  tabText: { color: c.textPrimary, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  tabTextActive: { color: "#000" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    padding: 12,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
  },
  switchLabel: { color: c.textPrimary, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  err: {
    color: c.danger,
    fontWeight: "700",
    fontSize: 12,
    marginTop: 12,
    textAlign: "center",
  },
  submit: {
    backgroundColor: c.accent,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  submitText: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 12 },
}));
