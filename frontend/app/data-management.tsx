import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useAppResume } from "../src/appLifecycle";
import { theme } from "../src/theme";
import { themedStyles } from "../src/themeContext";
import { api } from "../src/api";
import { IndustrialBanner } from "../src/components/IndustrialBanner";
import { SkinPlate } from "../src/components/SkinPlate";

// Categories the user can bulk-delete (keys match the backend _DM_REMOVE_MAP).
const REMOVE_OPTIONS: { key: string; label: string }[] = [
  { key: "inventory_items", label: "Inventory Items (tools & sets)" },
  { key: "wish_list", label: "Wish List" },
  { key: "claims", label: "Warranty Claims" },
  { key: "insurance_claims", label: "Insurance Claims" },
  { key: "dealers", label: "Dealers" },
  { key: "contacts", label: "Contacts / Borrowers" },
  { key: "locations", label: "Locations" },
  { key: "categories", label: "Categories" },
  { key: "tags", label: "Tags" },
  { key: "personal_information", label: "Personal Information" },
];

// Starter content that can be (re)installed (keys match _DM_INSTALL_TYPES).
const INSTALL_OPTIONS: { key: string; label: string }[] = [
  { key: "categories", label: "Categories" },
  { key: "tags", label: "Tags" },
  { key: "dealers", label: "Dealers" },
  { key: "locations", label: "Locations" },
];

function CheckRow({
  label,
  checked,
  onToggle,
  danger,
  testID,
  last,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  danger?: boolean;
  testID?: string;
  last?: boolean;
}) {
  const tint = danger ? theme.colors.danger : theme.colors.accent;
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.checkRow, last && styles.checkRowLast]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={22}
        color={checked ? tint : theme.colors.textMuted}
      />
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function DataManagementScreen() {
  const router = useRouter();

  const [installSel, setInstallSel] = useState<Set<string>>(new Set());
  const [removeSel, setRemoveSel] = useState<Set<string>>(new Set());
  const [busyInstall, setBusyInstall] = useState(false);
  const [busyRemove, setBusyRemove] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);

  // Prefilled / demo data state.
  const [demoPresent, setDemoPresent] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoChoice, setDemoChoice] = useState(false);

  const loadDemo = useCallback(async () => {
    try {
      const s = await api.demoStatus({ forceFresh: true });
      setDemoPresent(!!s?.present);
    } catch {
      setDemoPresent(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { loadDemo(); }, [loadDemo]));
  useAppResume(useCallback(() => { loadDemo(); }, [loadDemo]));

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const doInstall = useCallback(async () => {
    if (installSel.size === 0) {
      Alert.alert("Nothing Selected", "Pick at least one type of starter content to install.");
      return;
    }
    setBusyInstall(true);
    try {
      const res = await api.installPreloaded([...installSel]);
      const total = Object.values(res?.installed || {}).reduce((a, b) => a + (b || 0), 0);
      setInstallSel(new Set());
      Alert.alert(
        "Preloaded Data Installed",
        total > 0
          ? `Added ${total} starter item${total === 1 ? "" : "s"} to your account.`
          : "The selected content already exists — nothing new was added.",
      );
    } catch {
      Alert.alert("Couldn't Install", "Something went wrong. Please try again.");
    } finally {
      setBusyInstall(false);
    }
  }, [installSel]);

  const removePreloaded = useCallback(() => {
    const types = installSel.size > 0 ? [...installSel] : INSTALL_OPTIONS.map((o) => o.key);
    const labels = INSTALL_OPTIONS.filter((o) => types.includes(o.key)).map((o) => o.label).join(", ");
    Alert.alert(
      "Remove Preloaded Data?",
      `This permanently deletes the starter ${labels} the app loads for new users. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusyInstall(true);
            try {
              const res = await api.removeData(types);
              const total = Object.values(res?.removed || {}).reduce((a, b) => a + (b || 0), 0);
              setInstallSel(new Set());
              Alert.alert("Preloaded Data Removed", `${total} starter record${total === 1 ? "" : "s"} deleted.`);
            } catch {
              Alert.alert("Couldn't Remove", "Something went wrong. Please try again.");
            } finally {
              setBusyInstall(false);
            }
          },
        },
      ],
    );
  }, [installSel]);

  const confirmRemove = useCallback(async () => {
    setRemoveConfirm(false);
    setBusyRemove(true);
    try {
      const res = await api.removeData([...removeSel]);
      const total = Object.values(res?.removed || {}).reduce((a, b) => a + (b || 0), 0);
      setRemoveSel(new Set());
      await loadDemo();
      Alert.alert(
        "Data Removed",
        `${total} record${total === 1 ? "" : "s"} were permanently deleted.`,
      );
    } catch {
      Alert.alert("Couldn't Remove", "Something went wrong. Please try again.");
    } finally {
      setBusyRemove(false);
    }
  }, [removeSel, loadDemo]);

  const onRemovePress = useCallback(() => {
    if (removeSel.size === 0) {
      Alert.alert("Nothing Selected", "Select at least one category to remove.");
      return;
    }
    setRemoveConfirm(true);
  }, [removeSel]);

  const runClearDemo = useCallback(async (mode: "everything" | "keep_taxonomy") => {
    setDemoChoice(false);
    setDemoBusy(true);
    try {
      await api.demoClear(mode);
      setDemoPresent(false);
      Alert.alert(
        "Prefilled Data Removed",
        mode === "everything"
          ? "All sample data — including dealers, locations, tags & categories — has been deleted."
          : "Sample tools, claims and other demo records were removed. Your dealers, locations, tags & categories were kept.",
      );
    } catch {
      Alert.alert("Couldn't Remove", "Something went wrong. Please try again.");
    } finally {
      setDemoBusy(false);
    }
  }, []);

  const selectedRemoveLabels = REMOVE_OPTIONS.filter((o) => removeSel.has(o.key)).map((o) => o.label);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner title="Data Management" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
        {/* Install preloaded starter content */}
        <Text style={styles.sectionLabel}>INSTALL PRELOADED DATA</Text>
        <SkinPlate frame="window" style={styles.panel} padX={14} padTop={12} padBottom={12}>
          <Text style={styles.helpText}>
            Add the same starter content new accounts receive. Already-existing
            items are skipped, so this is safe to run anytime.
          </Text>
          {INSTALL_OPTIONS.map((o, i) => (
            <CheckRow
              key={o.key}
              testID={`dm-install-${o.key}`}
              label={o.label}
              checked={installSel.has(o.key)}
              onToggle={() => toggle(installSel, o.key, setInstallSel)}
              last={i === INSTALL_OPTIONS.length - 1}
            />
          ))}
          <TouchableOpacity
            testID="dm-install-btn"
            style={[styles.primaryBtn, busyInstall && { opacity: 0.6 }]}
            onPress={doInstall}
            disabled={busyInstall}
            activeOpacity={0.85}
          >
            {busyInstall ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="cloud-download-outline" size={16} color="#000" />
                <Text style={styles.primaryBtnText}>INSTALL SELECTED</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            testID="dm-remove-preloaded-btn"
            style={styles.linkBtn}
            onPress={removePreloaded}
            disabled={busyInstall}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={13} color={theme.colors.danger} />
            <Text style={styles.linkBtnText}>Delete the preloaded data instead</Text>
          </TouchableOpacity>
        </SkinPlate>

        {/* Bulk remove data */}
        <Text style={[styles.sectionLabel, { marginTop: 22 }]}>REMOVE DATA</Text>
        <SkinPlate frame="window" style={styles.panel} padX={14} padTop={12} padBottom={12}>
          <View style={styles.warnBox}>
            <Ionicons name="warning" size={16} color={theme.colors.danger} />
            <Text style={styles.warnText}>
              Permanently deletes the selected categories for your account. This
              cannot be undone — export a backup first if you might need the data.
            </Text>
          </View>
          {REMOVE_OPTIONS.map((o, i) => (
            <CheckRow
              key={o.key}
              testID={`dm-remove-${o.key}`}
              label={o.label}
              checked={removeSel.has(o.key)}
              onToggle={() => toggle(removeSel, o.key, setRemoveSel)}
              danger
              last={i === REMOVE_OPTIONS.length - 1}
            />
          ))}
          <TouchableOpacity
            testID="dm-remove-btn"
            style={[styles.dangerBtn, busyRemove && { opacity: 0.6 }]}
            onPress={onRemovePress}
            disabled={busyRemove}
            activeOpacity={0.85}
          >
            {busyRemove ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={styles.dangerBtnText}>REMOVE SELECTED</Text>
              </>
            )}
          </TouchableOpacity>
        </SkinPlate>

        {/* Delete prefilled / demo data (only while present) */}
        {demoPresent && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 22 }]}>PREFILLED INFORMATION</Text>
            <SkinPlate frame="window" style={styles.panel} padX={14} padTop={12} padBottom={12}>
              <Text style={styles.helpText}>
                Your account still holds the sample/demo data added when you
                signed up. Remove it whenever you&apos;re ready to work with only
                your own data.
              </Text>
              <TouchableOpacity
                testID="dm-delete-prefilled"
                style={[styles.primaryBtn, demoBusy && { opacity: 0.6 }]}
                onPress={() => setDemoChoice(true)}
                disabled={demoBusy}
                activeOpacity={0.85}
              >
                {demoBusy ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={16} color="#000" />
                    <Text style={styles.primaryBtnText}>DELETE PREFILLED INFORMATION</Text>
                  </>
                )}
              </TouchableOpacity>
            </SkinPlate>
          </>
        )}
      </ScrollView>

      {/* Remove-data confirmation */}
      <Modal visible={removeConfirm} transparent animationType="fade" onRequestClose={() => setRemoveConfirm(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modalCard} testID="dm-remove-confirm">
            <View style={styles.modalHeader}>
              <Ionicons name="warning" size={20} color={theme.colors.danger} />
              <Text style={styles.modalTitle}>CONFIRM REMOVAL</Text>
              <TouchableOpacity onPress={() => setRemoveConfirm(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalBody}>
              The following will be permanently deleted:
            </Text>
            {selectedRemoveLabels.map((l) => (
              <View key={l} style={styles.bulletRow}>
                <Ionicons name="remove-circle" size={14} color={theme.colors.danger} />
                <Text style={styles.bulletText}>{l}</Text>
              </View>
            ))}
            <Text style={[styles.modalBody, { marginTop: 12 }]}>This cannot be undone.</Text>
            <TouchableOpacity testID="dm-remove-confirm-btn" style={styles.dangerBtn} onPress={confirmRemove} activeOpacity={0.85}>
              <Text style={styles.dangerBtnText}>DELETE PERMANENTLY</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setRemoveConfirm(false)} activeOpacity={0.85}>
              <Text style={styles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Prefilled-data choice modal */}
      <Modal visible={demoChoice} transparent animationType="fade" onRequestClose={() => setDemoChoice(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modalCard} testID="dm-demo-choice">
            <View style={styles.modalHeader}>
              <Ionicons name="sparkles" size={20} color={theme.colors.accent} />
              <Text style={styles.modalTitle}>DELETE PREFILLED INFO</Text>
              <TouchableOpacity onPress={() => setDemoChoice(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalBody}>
              Choose how much of the sample data to remove. This can&apos;t be undone.
            </Text>
            <TouchableOpacity testID="dm-demo-keep" style={styles.optBtn} activeOpacity={0.85} onPress={() => runClearDemo("keep_taxonomy")}>
              <Ionicons name="albums-outline" size={18} color={theme.colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optTitle}>Keep My Setup</Text>
                <Text style={styles.optSub}>
                  Remove demo tools, claims & contacts — keep dealers, locations, tags & categories
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity testID="dm-demo-everything" style={styles.optBtn} activeOpacity={0.85} onPress={() => runClearDemo("everything")}>
              <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optTitle, { color: theme.colors.danger }]}>Remove Everything</Text>
                <Text style={styles.optSub}>
                  Wipe all sample data including dealers, locations, tags & categories — start blank
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.85} onPress={() => setDemoChoice(false)}>
              <Text style={styles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  sectionLabel: {
    color: c.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 8,
    marginLeft: 2,
  },
  panel: { marginTop: 2 },
  helpText: {
    color: c.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  checkRowLast: { borderBottomWidth: 0 },
  checkLabel: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  warnBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(220,38,38,0.10)",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.35)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  warnText: { flex: 1, color: c.textSecondary, fontSize: 12, lineHeight: 17 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    height: 48,
    borderRadius: 8,
    backgroundColor: c.accent,
  },
  primaryBtnText: { color: "#000", fontWeight: "900", letterSpacing: 1, fontSize: 11 },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    height: 48,
    borderRadius: 8,
    backgroundColor: c.danger,
  },
  dangerBtnText: { color: "#fff", fontWeight: "900", letterSpacing: 1, fontSize: 11 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: c.bgSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 20,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  modalTitle: { flex: 1, color: c.textPrimary, fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  modalBody: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  bulletText: { flex: 1, color: c.textPrimary, fontSize: 13, fontWeight: "700" },
  optBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.canvas,
  },
  optTitle: { color: c.textPrimary, fontSize: 14, fontWeight: "800" },
  optSub: { color: c.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  cancelBtn: { marginTop: 12, paddingVertical: 12, alignItems: "center" },
  cancelText: { color: c.textSecondary, fontWeight: "800", letterSpacing: 1 },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 6,
  },
  linkBtnText: { color: c.danger, fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
}));
