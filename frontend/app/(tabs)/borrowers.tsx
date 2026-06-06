import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useAppResume } from "../../src/appLifecycle";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { parseContacts, openPhone, openSms } from "../../src/contactLinks";
import { themedStyles } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";
import { ShadowBox } from "../../src/components/ShadowBox";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { PillButton } from "../../src/components/PillButton";
import { ContactIconButton, ContactIconImage } from "../../src/components/ContactIcons";
import { EmailLink } from "../../src/components/EmailLink";

import {
  isDeviceContactsAvailable,
  isAndroidPickerNeeded,
  loadAllDeviceContactsAndroid,
  pickContactNativeIOS,
  formatContactField,
  PickedContact,
} from "../../src/deviceContacts";

export default function BorrowersScreen() {
  const router = useRouter();
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");

  // Device contacts picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<PickedContact[]>([]);
  const [pickerFilter, setPickerFilter] = useState("");
  const canImportContacts = isDeviceContactsAvailable();

  const filteredDeviceContacts = useMemo(() => {
    const q = pickerFilter.trim().toLowerCase();
    if (!q) return deviceContacts;
    return deviceContacts.filter((c) =>
      (c.name + " " + (c.phone || "") + " " + (c.email || ""))
        .toLowerCase()
        .includes(q),
    );
  }, [deviceContacts, pickerFilter]);

  const openContactPicker = async () => {
    if (Platform.OS === "ios") {
      // iOS — bypass the in-app picker entirely. Open the native iOS
      // contact picker sheet directly. Avoids Expo Go's contacts
      // entitlement quirk that causes getContactsAsync() to return [].
      const c = await pickContactNativeIOS();
      if (c) {
        setName(c.name);
        setContact(formatContactField(c));
      }
      return;
    }
    // Android — load contacts list and show our in-app picker modal.
    setShowPicker(true);
    if (deviceContacts.length > 0) return; // cached
    setPickerLoading(true);
    try {
      const list = await loadAllDeviceContactsAndroid();
      setDeviceContacts(list);
    } finally {
      setPickerLoading(false);
    }
  };

  const pickContact = (c: PickedContact) => {
    setName(c.name);
    setContact(formatContactField(c));
    setShowPicker(false);
    setPickerFilter("");
  };

  const load = useCallback(async () => {
    const [b, t] = await Promise.all([
      api.listBorrowers(),
      api.listTools({ checked_out: true }),
    ]);
    setBorrowers(b);
    setTools(t);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


  const add = async () => {
    if (!name.trim()) return;
    await api.createBorrower({ name: name.trim(), contact: contact.trim() });
    setName("");
    setContact("");
    setShowAdd(false);
    load();
  };

  const toolsByBorrower = (borrowerName: string) =>
    tools.filter(
      (t) =>
        t.current_checkout?.borrower_name?.toLowerCase() ===
        borrowerName.toLowerCase()
    );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner title="CONTACTS" subtitle="Borrowers & Checkouts" />
      <View style={styles.actionsRow}>
        <PillButton
          testID="add-contact-header-btn"
          label="ADD CONTACT"
          icon="add"
          variant="active"
          onPress={() => setShowAdd(true)}
        />
      </View>

      <FlatList
        data={borrowers}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>No saved contacts. Add some to speed up checkout.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const active = toolsByBorrower(item.name);
          const { emails, phones } = parseContacts(item.contact || "");
          const firstPhone = phones[0];
          return (
            <ShadowBox
              testID={`borrower-row-${item.id}`}
              style={styles.row}
              onPress={() => router.push(`/borrower/${item.id}`)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  Tools Checked out: {active.length}
                </Text>
                {emails.map((em) => (
                  <View key={`e-${em}`} style={styles.rowEmailRow}>
                    <ContactIconImage type="mail" size={16} />
                    <EmailLink
                      email={em}
                      style={styles.rowEmailLink}
                      numberOfLines={1}
                      testID={`row-email-${em}`}
                    />
                  </View>
                ))}
              </View>
              {firstPhone ? (
                <View style={styles.rowActions}>
                  <ContactIconButton
                    type="call"
                    size={30}
                    testID={`row-call-${item.id}`}
                    onPress={() => openPhone(firstPhone)}
                  />
                  <ContactIconButton
                    type="text"
                    size={30}
                    testID={`row-text-${item.id}`}
                    onPress={() => openSms(firstPhone)}
                  />
                </View>
              ) : null}
            </ShadowBox>
          );
        }}
      />

      {/* Add-contact moved to top-right header. Bottom FAB removed. */}

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBg}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>NEW CONTACT</Text>

              {canImportContacts && (
                <TouchableOpacity
                  testID="import-contact-btn"
                  style={styles.importBtn}
                  onPress={openContactPicker}
                  activeOpacity={0.7}
                >
                  <Ionicons name="people" size={18} color={theme.colors.accent} />
                  <Text style={styles.importBtnText}>IMPORT FROM CONTACTS</Text>
                </TouchableOpacity>
              )}

              <TextInput
                testID="borrower-name-input"
                placeholder="Full name"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={name}
                onChangeText={setName}
              />
              <TextInput
                testID="borrower-contact-input"
                placeholder="Phone / email (optional)"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={contact}
                onChangeText={setContact}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.btnGhost}
                  onPress={() => {
                    setShowAdd(false);
                    setName("");
                    setContact("");
                  }}
                >
                  <Text style={styles.btnGhostText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="save-borrower-btn"
                  style={styles.btn}
                  onPress={add}
                >
                  <Text style={styles.btnText}>SAVE</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Device contacts picker */}
      <Modal visible={showPicker} animationType="slide" transparent onRequestClose={() => setShowPicker(false)}>
        <View style={styles.pickerBg}>
          <SafeAreaView style={styles.pickerCard} edges={["top", "bottom"]}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={() => { setShowPicker(false); setPickerFilter(""); }} hitSlop={10}>
                <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.pickerTitle}>PICK A CONTACT</Text>
              <View style={{ width: 26 }} />
            </View>
            <TextInput
              testID="contact-picker-search"
              placeholder="Search..."
              placeholderTextColor={theme.colors.textMuted}
              value={pickerFilter}
              onChangeText={setPickerFilter}
              style={styles.pickerSearch}
            />
            {pickerLoading ? (
              <View style={styles.pickerEmpty}>
                <Text style={styles.pickerEmptyText}>Loading contacts…</Text>
              </View>
            ) : filteredDeviceContacts.length === 0 ? (
              <View style={styles.pickerEmpty}>
                <Ionicons name="people-outline" size={40} color={theme.colors.textMuted} />
                <Text style={styles.pickerEmptyText}>
                  {deviceContacts.length === 0
                    ? "No device contacts available (or permission denied)."
                    : "No matches for your search."}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredDeviceContacts}
                keyExtractor={(c, i) => `${c.name}-${i}`}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    testID={`pick-device-contact-${item.name}`}
                    style={styles.pickerRow}
                    onPress={() => pickContact(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{item.name}</Text>
                      {!!(item.phone || item.email) && (
                        <Text style={styles.rowSub} numberOfLines={1}>
                          {[item.phone, item.email].filter(Boolean).join("  ·  ")}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                )}
              />
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15,15,15,0.9)",
    borderWidth: 1,
    borderColor: c.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  headerAddBtnText: {
    color: c.accent,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    color: c.textPrimary,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: 2,
  },
  subtitle: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  section: { paddingHorizontal: 20, paddingVertical: 8 },
  sectionLabel: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  checkedOutRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.bgSecondary,
    borderLeftWidth: 3,
    borderLeftColor: c.accentSecondary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  checkedOutTool: { color: c.textPrimary, fontWeight: "700", fontSize: 10 },
  checkedOutBy: { color: c.textSecondary, fontSize: 9, marginTop: 2 },
  checkedOutDatePill: {
    backgroundColor: c.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.divider,
    marginLeft: 8,
  },
  checkedOutDateText: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  rowChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  rowPhoneLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    marginTop: 2,
  },
  rowPhoneText: {
    color: c.textPrimary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  rowEmailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
    marginTop: 4,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 8,
  },
  rowEmailLink: {
    fontSize: 11,
    marginTop: 4,
  },
  rowChipPair: {
    flexDirection: "row",
    gap: 3,
  },
  rowChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: c.surface,
    maxWidth: "100%",
  },
  rowChipIcon: {
    paddingHorizontal: 6,
  },
  rowChipText: {
    color: c.textPrimary,
    fontSize: 8,
    fontWeight: "700",
    flexShrink: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: c.bgSecondary,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    ...(theme.elevation.md as object),
  },
  editRow: {
    backgroundColor: "rgba(249, 115, 22,0.06)",
    borderLeftWidth: 3,
    borderLeftColor: c.accent,
  },
  editInput: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.accent,
    color: c.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
    fontSize: 10,
    minHeight: 38,
  },
  iconBtn: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  avatar: {
    width: 44,
    height: 44,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  avatarText: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 14,
  },
  rowTitle: { color: c.textPrimary, fontWeight: "700", fontSize: 12 },
  rowSub: { color: c.textSecondary, fontSize: 9, marginTop: 2 },
  rowMeta: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 2,
    textTransform: "uppercase",
  },
  empty: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 40 },
  emptyText: {
    color: c.textSecondary,
    textAlign: "center",
    marginTop: 12,
  },
  fab: {
    position: "absolute",
    bottom: 90,
    right: 24,
    width: 56,
    height: 56,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
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
  input: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    color: c.textPrimary,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 4,
    marginBottom: 12,
    fontSize: 11,
  },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  btn: {
    flex: 1,
    backgroundColor: c.accent,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  btnText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 10,
  },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: c.border,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  btnGhostText: {
    color: c.textPrimary,
    fontWeight: "800",
    letterSpacing: 2,
    fontSize: 10,
  },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: c.accent,
    borderRadius: 6,
    marginBottom: 12,
  },
  importBtnText: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  pickerBg: {
    flex: 1,
    backgroundColor: c.bg,
  },
  pickerCard: {
    flex: 1,
    backgroundColor: c.bg,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  pickerTitle: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  pickerSearch: {
    backgroundColor: c.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    color: c.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 11,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  pickerEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 10,
  },
  pickerEmptyText: {
    color: c.textSecondary,
    textAlign: "center",
  },
}));
