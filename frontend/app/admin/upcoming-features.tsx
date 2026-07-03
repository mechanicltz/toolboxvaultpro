// Admin · Upcoming Features (roadmap manager).
// Only visible to ADMIN_EMAILS accounts. Non-admins are redirected to More.
// Lets the admin create dated releases and manage each release's feature list
// (title + status: On The List / Work Started / Completed).
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import {
  api,
  UpcomingRelease,
  UpcomingFeatureStatus,
  UpcomingFeatureItem,
} from "../../src/api";
import { themedStyles, useColors } from "../../src/themeContext";
import { SkinnedCard } from "../../src/components/SkinnedCard";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";

const STATUSES: UpcomingFeatureStatus[] = ["On The List", "Work Started", "Completed"];

type DraftFeature = {
  id: string;
  title: string;
  description: string;
  status: UpcomingFeatureStatus;
  type: "feature" | "fix";
};

function formatDate(iso: string): string {
  try {
    const [y, m] = (iso || "").split("-").map((n) => parseInt(n, 10));
    if (!y || !m) return iso || "No date";
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  } catch {
    return iso;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Month + Year only picker (no day — an exact day could upset users if a
 *  release slips). Emits an ISO "YYYY-MM-01" string. */
function MonthYearField({ value, onChange, testID }: { value: string; onChange: (v: string) => void; testID?: string }) {
  const c = useColors();
  const now = new Date();
  const [yStr, mStr] = (value || "").split("-");
  const year = parseInt(yStr, 10) || now.getFullYear();
  const month = parseInt(mStr, 10) || now.getMonth() + 1;
  const emit = (y: number, m: number) => onChange(`${y}-${String(m).padStart(2, "0")}-01`);
  return (
    <View testID={testID}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <TouchableOpacity testID={`${testID}-year-prev`} onPress={() => emit(year - 1, month)} hitSlop={8} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={20} color={c.accent} />
        </TouchableOpacity>
        <Text style={{ color: c.textPrimary, fontSize: 18, fontWeight: "900", letterSpacing: 1 }}>{year}</Text>
        <TouchableOpacity testID={`${testID}-year-next`} onPress={() => emit(year + 1, month)} hitSlop={8} style={{ padding: 8 }}>
          <Ionicons name="chevron-forward" size={20} color={c.accent} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {MONTHS.map((mm, i) => {
          const active = month === i + 1;
          return (
            <TouchableOpacity
              key={mm}
              testID={`${testID}-m${i + 1}`}
              onPress={() => emit(year, i + 1)}
              style={{
                width: "23%",
                paddingVertical: 9,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: active ? c.accent : c.border,
                backgroundColor: active ? c.accent : "transparent",
                alignItems: "center",
              }}
            >
              <Text style={{ color: active ? "#000" : c.textSecondary, fontWeight: "800", fontSize: 12 }}>{mm}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function AdminUpcomingFeaturesScreen() {
  const router = useRouter();
  const c = useColors();
  const [checking, setChecking] = useState(true);
  const [releases, setReleases] = useState<UpcomingRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftVersion, setDraftVersion] = useState("");
  const [draftReleased, setDraftReleased] = useState(false);
  const [draftFeatures, setDraftFeatures] = useState<DraftFeature[]>([]);

  // Per-release 3-dot menu + quick "add feature" modal
  const [menuRel, setMenuRel] = useState<UpcomingRelease | null>(null);
  const [addFeatRel, setAddFeatRel] = useState<UpcomingRelease | null>(null);
  const [qfTitle, setQfTitle] = useState("");
  const [qfDesc, setQfDesc] = useState("");
  const [qfType, setQfType] = useState<"feature" | "fix">("feature");

  // Admin gate
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await api.adminWhoAmI();
        if (!me?.is_admin) {
          router.replace("/(tabs)/more");
          return;
        }
      } catch {
        if (active) router.replace("/(tabs)/more");
        return;
      }
      if (active) setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [router]);

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
      if (!checking) load();
    }, [checking, load]),
  );

  const openCreate = () => {
    setEditId(null);
    const n = new Date();
    setDraftDate(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`);
    setDraftTitle("");
    setDraftVersion("");
    setDraftReleased(false);
    setDraftFeatures([]);
    setEditOpen(true);
  };

  const openEdit = (rel: UpcomingRelease) => {
    setEditId(rel.id);
    setDraftDate(rel.release_date || "");
    setDraftTitle(rel.title || "");
    setDraftVersion(rel.version || "");
    setDraftReleased(!!rel.released);
    setDraftFeatures(
      (rel.features || []).map((f: UpcomingFeatureItem) => ({
        id: f.id,
        title: f.title,
        description: f.description || "",
        status: f.status,
        type: f.type === "fix" ? "fix" : "feature",
      })),
    );
    setEditOpen(true);
  };

  const addFeatureRow = () =>
    setDraftFeatures((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${prev.length}`,
        title: "",
        description: "",
        status: "On The List",
        type: "feature",
      },
    ]);

  const updateFeature = (idx: number, patch: Partial<DraftFeature>) =>
    setDraftFeatures((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    );

  const removeFeature = (idx: number) =>
    setDraftFeatures((prev) => prev.filter((_, i) => i !== idx));

  const cycleStatus = (idx: number) => {
    const cur = draftFeatures[idx].status;
    const next = STATUSES[(STATUSES.indexOf(cur) + 1) % STATUSES.length];
    updateFeature(idx, { status: next });
  };

  const save = async () => {
    if (!draftDate) {
      Alert.alert("Date required", "Please choose a release date.");
      return;
    }
    const features = draftFeatures
      .map((f) => ({
        id: f.id,
        title: f.title.trim(),
        description: f.description.trim(),
        status: f.status,
        type: f.type,
      }))
      .filter((f) => f.title);
    setSaving(true);
    try {
      if (editId) {
        await api.adminUpdateUpcomingFeature(editId, {
          release_date: draftDate,
          title: draftTitle.trim(),
          version: draftVersion.trim(),
          released: draftReleased,
          features,
        });
      } else {
        await api.adminCreateUpcomingFeature({
          release_date: draftDate,
          title: draftTitle.trim(),
          version: draftVersion.trim(),
          released: draftReleased,
          features,
        });
      }
      setEditOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert("Couldn't save", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (rel: UpcomingRelease) => {
    Alert.alert(
      "Delete release?",
      `Remove the ${formatDate(rel.release_date)} update and all its features? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.adminDeleteUpcomingFeature(rel.id);
              await load();
            } catch (e: any) {
              Alert.alert("Couldn't delete", String(e?.message || e));
            }
          },
        },
      ],
    );
  };

  const statusColor = (s: UpcomingFeatureStatus) =>
    s === "Completed" ? c.success : s === "Work Started" ? c.warning : c.textMuted;

  // Persist a new feature list for a release (used by inline status pills + quick-add).
  const patchFeatures = async (rel: UpcomingRelease, newFeatures: any[]) => {
    try {
      await api.adminUpdateUpcomingFeature(rel.id, {
        features: newFeatures.map((f) => ({
          id: f.id,
          title: f.title,
          description: f.description || "",
          status: f.status,
          type: f.type || "feature",
        })),
      });
      await load();
    } catch (e: any) {
      Alert.alert("Couldn't update", String(e?.message || e));
    }
  };

  // Tap a feature's status pill on the card to cycle it (no need to open Edit).
  const cycleFeatureStatus = (rel: UpcomingRelease, featureId: string) => {
    const nf = rel.features.map((f) => {
      if (f.id !== featureId) return f;
      const next = STATUSES[(STATUSES.indexOf(f.status) + 1) % STATUSES.length];
      return { ...f, status: next };
    });
    patchFeatures(rel, nf);
  };

  const toggleReleased = async (rel: UpcomingRelease) => {
    setMenuRel(null);
    try {
      await api.adminUpdateUpcomingFeature(rel.id, { released: !rel.released });
      await load();
    } catch (e: any) {
      Alert.alert("Couldn't update", String(e?.message || e));
    }
  };

  const openQuickAdd = (rel: UpcomingRelease) => {
    setMenuRel(null);
    setAddFeatRel(rel);
    setQfTitle("");
    setQfDesc("");
    setQfType("feature");
  };

  const saveQuickAdd = async () => {
    if (!qfTitle.trim() || !addFeatRel) {
      Alert.alert("Title required", "Please enter a title for the feature.");
      return;
    }
    const rel = addFeatRel;
    const nf = [
      ...rel.features,
      {
        id: `new-${Date.now()}`,
        title: qfTitle.trim(),
        description: qfDesc.trim(),
        status: "On The List" as UpcomingFeatureStatus,
        type: qfType,
      },
    ];
    setSaving(true);
    await patchFeatures(rel, nf);
    setSaving(false);
    setAddFeatRel(null);
  };

  if (checking) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <IndustrialBanner
        title="UPCOMING FEATURES"
        subtitle="Admin · manage the roadmap"
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
            <Text style={styles.emptyText}>
              No releases yet. Tap the + button to publish your first roadmap entry.
            </Text>
          ) : (
            releases.map((rel) => (
              <SkinnedCard key={rel.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name={rel.released ? "checkmark-circle" : "calendar"} size={18} color={rel.released ? c.success : c.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardDate}>
                      {formatDate(rel.release_date)}
                      {rel.released && !!rel.version ? `  ·  v${rel.version.replace(/^v/i, "")}` : ""}
                    </Text>
                    {!!rel.title && <Text style={styles.cardTitle}>{rel.title}</Text>}
                  </View>
                  <TouchableOpacity
                    onPress={() => setMenuRel(rel)}
                    hitSlop={8}
                    style={styles.iconBtn}
                    testID={`upcoming-menu-${rel.id}`}
                  >
                    <Ionicons name="ellipsis-vertical" size={20} color={c.textPrimary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.divider} />
                {rel.features.length === 0 ? (
                  <Text style={styles.noFeatures}>No features added.</Text>
                ) : (
                  rel.features.map((f) => (
                    <View key={f.id} style={styles.featureBlock}>
                      <View style={styles.featureRow}>
                        <Text style={styles.featureTitle}>{f.title}</Text>
                        <TouchableOpacity
                          onPress={() => cycleFeatureStatus(rel, f.id)}
                          activeOpacity={0.7}
                          testID={`upcoming-pill-${f.id}`}
                          style={[styles.statusPill, { borderColor: statusColor(f.status) }]}
                        >
                          <Text style={[styles.statusText, { color: statusColor(f.status) }]}>
                            {f.status}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {!!f.description && (
                        <Text style={styles.featureDesc}>{f.description}</Text>
                      )}
                    </View>
                  ))
                )}
              </SkinnedCard>
            ))
          )}
        </ScrollView>
      )}

      {/* Floating + button (create a new dated update) */}
      {!loading && (
        <TouchableOpacity style={styles.fab} onPress={openCreate} testID="upcoming-fab" activeOpacity={0.85}>
          <Ionicons name="add" size={30} color="#000" />
        </TouchableOpacity>
      )}

      {/* Per-release 3-dot action menu */}
      <Modal visible={!!menuRel} transparent animationType="fade" onRequestClose={() => setMenuRel(null)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuRel(null)}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuHeader} numberOfLines={1}>
              {menuRel ? formatDate(menuRel.release_date) : ""}{menuRel?.title ? ` · ${menuRel.title}` : ""}
            </Text>
            <TouchableOpacity style={styles.menuItem} onPress={() => { const r = menuRel; setMenuRel(null); if (r) openEdit(r); }} testID="menu-edit">
              <Ionicons name="create-outline" size={20} color={c.textPrimary} />
              <Text style={styles.menuItemText}>Edit update</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => menuRel && openQuickAdd(menuRel)} testID="menu-add-feature">
              <Ionicons name="add-circle-outline" size={20} color={c.textPrimary} />
              <Text style={styles.menuItemText}>Add a feature</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => menuRel && toggleReleased(menuRel)} testID="menu-toggle-released">
              <Ionicons name={menuRel?.released ? "cloud-offline-outline" : "rocket-outline"} size={20} color={c.success} />
              <Text style={[styles.menuItemText, { color: c.success }]}>
                {menuRel?.released ? "Unmark released" : "Released & available to download"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => { const r = menuRel; setMenuRel(null); if (r) confirmDelete(r); }} testID="menu-delete">
              <Ionicons name="trash-outline" size={20} color={c.danger} />
              <Text style={[styles.menuItemText, { color: c.danger }]}>Delete update</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Quick "add a feature" modal */}
      <Modal visible={!!addFeatRel} transparent animationType="slide" onRequestClose={() => setAddFeatRel(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ADD A FEATURE</Text>
              <TouchableOpacity onPress={() => setAddFeatRel(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={c.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>TITLE</Text>
            <TextInput
              value={qfTitle}
              onChangeText={setQfTitle}
              placeholder="e.g. QR label printing"
              placeholderTextColor={c.textMuted}
              style={styles.input}
              testID="quickfeat-title"
            />
            <Text style={styles.label}>DESCRIPTION (optional)</Text>
            <TextInput
              value={qfDesc}
              onChangeText={setQfDesc}
              placeholder="Short detail"
              placeholderTextColor={c.textMuted}
              style={[styles.input, { height: 70 }]}
              multiline
              testID="quickfeat-desc"
            />
            <View style={styles.qfTypeRow}>
              {(["feature", "fix"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setQfType(t)}
                  style={[styles.qfTypeBtn, qfType === t && styles.qfTypeBtnOn]}
                  testID={`quickfeat-type-${t}`}
                >
                  <Text style={[styles.qfTypeText, qfType === t && { color: "#000" }]}>
                    {t === "fix" ? "BUG FIX" : "FEATURE"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.createBtn} onPress={saveQuickAdd} disabled={saving} testID="quickfeat-save">
              <Ionicons name="add" size={18} color="#000" />
              <Text style={styles.createBtnText}>{saving ? "SAVING…" : "ADD FEATURE"}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create / Edit modal */}
      <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBg}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editId ? "EDIT UPDATE" : "NEW UPDATE"}
              </Text>
              <TouchableOpacity onPress={() => setEditOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={c.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>RELEASE MONTH</Text>
              <MonthYearField value={draftDate} onChange={setDraftDate} testID="upcoming-date" />

              <Text style={styles.label}>UPDATE NAME (optional)</Text>
              <TextInput
                value={draftTitle}
                onChangeText={setDraftTitle}
                placeholder="e.g. Bug fixes & polish"
                placeholderTextColor={c.textMuted}
                style={styles.input}
                testID="upcoming-title"
              />

              <Text style={styles.label}>VERSION # (e.g. 3.1.6)</Text>
              <TextInput
                value={draftVersion}
                onChangeText={setDraftVersion}
                placeholder="Version this update ships in"
                placeholderTextColor={c.textMuted}
                style={styles.input}
                autoCapitalize="none"
                testID="upcoming-version"
              />

              <TouchableOpacity
                style={[styles.releaseToggle, draftReleased && styles.releaseToggleOn]}
                onPress={() => setDraftReleased((v) => !v)}
                activeOpacity={0.8}
                testID="upcoming-released-toggle"
              >
                <Ionicons
                  name={draftReleased ? "checkbox" : "square-outline"}
                  size={22}
                  color={draftReleased ? c.success : c.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.releaseToggleTitle}>Released &amp; available to update</Text>
                  <Text style={styles.releaseToggleSub}>
                    {draftReleased
                      ? "Marks every fix Completed and shows users a green “Available in v” banner."
                      : "Turn on once this version is live in the App Store / Play Store."}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.featuresHeader}>
                <Text style={styles.label}>FEATURES</Text>
                <TouchableOpacity onPress={addFeatureRow} hitSlop={8} testID="upcoming-add-feature">
                  <Ionicons name="add-circle-outline" size={22} color={c.accent} />
                </TouchableOpacity>
              </View>

              {draftFeatures.length === 0 ? (
                <Text style={styles.noFeatures}>Tap + to add a feature.</Text>
              ) : (
                draftFeatures.map((f, idx) => (
                  <View key={f.id} style={styles.draftCard}>
                    <View style={styles.draftCardHead}>
                      <Text style={styles.draftIndex}>FEATURE {idx + 1}</Text>
                      <TouchableOpacity
                        onPress={() => cycleStatus(idx)}
                        style={[styles.statusPill, { borderColor: statusColor(f.status) }]}
                        testID={`upcoming-feature-status-${idx}`}
                      >
                        <Text style={[styles.statusText, { color: statusColor(f.status) }]}>
                          {f.status}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => updateFeature(idx, { type: f.type === "fix" ? "feature" : "fix" })}
                        style={[styles.typePill, f.type === "fix" && styles.typePillOn]}
                        testID={`upcoming-feature-type-${idx}`}
                      >
                        <Text style={[styles.typePillText, f.type === "fix" && { color: "#000" }]}>
                          {f.type === "fix" ? "BUG FIX" : "FEATURE"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeFeature(idx)} hitSlop={6}>
                        <Ionicons name="close-circle" size={20} color={c.textMuted} />
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      value={f.title}
                      onChangeText={(t) => updateFeature(idx, { title: t })}
                      placeholder="Feature title"
                      placeholderTextColor={c.textMuted}
                      style={[styles.input, { marginTop: 8 }]}
                      testID={`upcoming-feature-${idx}`}
                    />
                    <TextInput
                      value={f.description}
                      onChangeText={(t) => updateFeature(idx, { description: t })}
                      placeholder="Description (optional)"
                      placeholderTextColor={c.textMuted}
                      style={[styles.input, styles.inputMultiline, { marginTop: 8 }]}
                      multiline
                      testID={`upcoming-feature-desc-${idx}`}
                    />
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              disabled={saving}
              onPress={save}
              testID="upcoming-save"
            >
              {saving ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.saveBtnText}>{editId ? "SAVE CHANGES" : "PUBLISH"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 100 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  menuSheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingBottom: 34,
  },
  menuHeader: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
  },
  menuItemLast: {},
  menuItemText: { color: c.textPrimary, fontSize: 15, fontWeight: "600" },
  qfTypeRow: { flexDirection: "row", gap: 10, marginTop: 6, marginBottom: 14 },
  qfTypeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: 999,
  },
  qfTypeBtnOn: { backgroundColor: c.accent },
  qfTypeText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5, color: c.accent },
  createBtn: {
    backgroundColor: c.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    marginBottom: 16,
  },
  createBtnText: { color: "#000", fontWeight: "800", fontSize: 14, letterSpacing: 0.6 },
  emptyText: { color: c.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20, marginTop: 30 },
  card: { marginBottom: 14 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardDate: { fontSize: 16, fontWeight: "800", color: c.accent },
  cardTitle: { fontSize: 13, fontWeight: "600", color: c.textSecondary, marginTop: 2 },
  iconBtn: { padding: 4 },
  divider: { height: 1, backgroundColor: c.borderSubtle, marginVertical: 12 },
  noFeatures: { fontSize: 13, color: c.textMuted, fontStyle: "italic", marginTop: 4 },
  featureBlock: { paddingVertical: 6 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureTitle: { flex: 1, fontSize: 14, fontWeight: "600", color: c.textPrimary },
  featureDesc: { fontSize: 12, color: c.textMuted, marginTop: 3, lineHeight: 17 },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  // Modal
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: c.bgSecondary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingBottom: 28,
    borderTopWidth: 2,
    borderTopColor: c.accent,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: 15, fontWeight: "900", color: c.textPrimary, letterSpacing: 1.5 },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: c.textSecondary,
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: c.textPrimary,
    backgroundColor: c.surface,
    fontSize: 14,
    marginTop: 2,
  },
  inputMultiline: { minHeight: 60, textAlignVertical: "top" },
  featuresHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  draftCard: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    backgroundColor: c.surfaceAlt,
    padding: 12,
    marginTop: 10,
  },
  draftCardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  draftIndex: { flex: 1, fontSize: 11, fontWeight: "900", color: c.textSecondary, letterSpacing: 0.8 },
  releaseToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    backgroundColor: c.surface,
  },
  releaseToggleOn: { borderColor: c.success, backgroundColor: c.surfaceAlt },
  releaseToggleTitle: { fontSize: 12, fontWeight: "800", color: c.textPrimary },
  releaseToggleSub: { fontSize: 10, color: c.textMuted, marginTop: 3, lineHeight: 14 },
  typePill: {
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typePillOn: { backgroundColor: c.accent },
  typePillText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5, color: c.accent },
  saveBtn: {
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 16,
  },
  saveBtnText: { color: "#000", fontWeight: "800", fontSize: 15, letterSpacing: 0.6 },
}));
