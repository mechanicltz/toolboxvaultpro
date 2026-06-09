import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, TextInput, KeyboardAvoidingView, Platform, Pressable, Share, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Contacts from "expo-contacts";
import { useAppResume } from "../../src/appLifecycle";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { confirm } from "../../src/confirm";
import { formatDateTime } from "../../src/dt";
import { parseContacts, openPhone, openSms } from "../../src/contactLinks";
import { ContactIconButton, ContactIconImage } from "../../src/components/ContactIcons";
import { EmailLink } from "../../src/components/EmailLink";

import { themedStyles, useSkin } from "../../src/themeContext";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { PillButton } from "../../src/components/PillButton";
import { ShadowBox, ShadowBoxMini } from "../../src/components/ShadowBox";
import { SKIN, CAP } from "../../src/tbv/skins";
import { TbvFrame } from "../../src/tbv/components/TbvFrame";

export default function BorrowerHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ name: string; contact: string; notes: string }>({ name: "", contact: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);

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
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


  const openEditModal = () => {
    if (!data?.borrower) return;
    setEditForm({
      name: data.borrower.name || "",
      contact: data.borrower.contact || "",
      notes: data.borrower.notes || "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!id) return;
    const name = (editForm.name || "").trim();
    if (!name) return;
    setSaving(true);
    try {
      await api.updateBorrower(id, { name, contact: (editForm.contact || "").trim(), notes: (editForm.notes || "").trim() });
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    const ok = await confirm(
      "Delete contact?",
      `Remove ${data?.borrower?.name || "this contact"} from your list?`,
      "Delete",
      true
    );
    if (!ok) return;
    await api.deleteBorrower(id);
    router.back();
  };

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: theme.colors.textPrimary, padding: 20 }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const b = data.borrower;

  const { emails: cEmails, phones: cPhones } = parseContacts(b.contact);
  const cPhone = cPhones[0] || "";
  const cEmail = cEmails[0] || "";

  const buildVCard = () => {
    const out = ["BEGIN:VCARD", "VERSION:3.0", `FN:${b.name}`, `N:${b.name};;;;`];
    if (cPhone) out.push(`TEL;TYPE=CELL:${cPhone}`);
    if (cEmail) out.push(`EMAIL;TYPE=INTERNET:${cEmail}`);
    out.push("END:VCARD");
    return out.join("\r\n");
  };

  const doShareContact = async () => {
    const text = [b.name, cPhone ? `Phone: ${cPhone}` : "", cEmail ? `Email: ${cEmail}` : ""]
      .filter(Boolean)
      .join("\n");

    // Web preview: Share API / expo-contacts aren't available, so fall back to
    // the browser Web Share API, then the clipboard, then just show the text.
    if (Platform.OS === "web") {
      const w: any = globalThis;
      try {
        if (w.navigator?.share) {
          await w.navigator.share({ title: b.name, text });
          return;
        }
      } catch {
        return; /* user cancelled the web share sheet */
      }
      try {
        await w.navigator?.clipboard?.writeText(text);
        Alert.alert("Copied", "Contact details copied to your clipboard.");
        return;
      } catch {
        /* clipboard blocked */
      }
      Alert.alert(b.name, text);
      return;
    }

    try {
      await Share.share({ message: text });
    } catch {
      /* user cancelled */
    }
  };

  const doSaveToDevice = async () => {
    // Web preview can't write to device contacts — download a .vcf vCard the
    // user can open to import the contact instead.
    if (Platform.OS === "web") {
      try {
        const w: any = globalThis;
        const blob = new w.Blob([buildVCard()], { type: "text/vcard;charset=utf-8" });
        const url = w.URL.createObjectURL(blob);
        const a = w.document.createElement("a");
        a.href = url;
        a.download = `${b.name || "contact"}.vcf`;
        w.document.body.appendChild(a);
        a.click();
        a.remove();
        w.URL.revokeObjectURL(url);
        Alert.alert("Contact card downloaded", "Open the .vcf file to add this contact to your address book.");
      } catch {
        Alert.alert("Error", "Could not generate the contact card.");
      }
      return;
    }

    try {
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== "granted") {
        if (!perm.canAskAgain) {
          Alert.alert(
            "Contacts access needed",
            "Enable Contacts access in Settings to save this contact to your phone.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ]
          );
        } else {
          Alert.alert("Contacts access needed", "Allow Contacts access to save this contact to your phone.");
        }
        return;
      }
      const contact: any = {
        [Contacts.Fields.FirstName]: b.name,
        [Contacts.Fields.ContactType]: Contacts.ContactTypes.Person,
      };
      if (cPhone) contact[Contacts.Fields.PhoneNumbers] = [{ label: "mobile", number: cPhone }];
      if (cEmail) contact[Contacts.Fields.Emails] = [{ label: "work", email: cEmail }];
      await Contacts.addContactAsync(contact);
      Alert.alert("Saved", `${b.name} was added to your phone contacts.`);
    } catch {
      Alert.alert("Error", "Could not save this contact to your phone.");
    }
  };

  const handleShare = () => {
    // Native: use the OS action sheet — rock-solid, no modal-dismiss timing
    // issues when presenting the Share sheet / Contacts dialog afterwards.
    // Web: Alert.alert buttons don't render, so use the in-app Modal instead.
    if (Platform.OS === "web") {
      setShowShareSheet(true);
      return;
    }
    Alert.alert(b.name, "Share this contact or save it to your phone.", [
      { text: "Share (text / email)", onPress: doShareContact },
      { text: "Save to Phone Contacts", onPress: doSaveToDevice },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // Web-only: close the in-app sheet, then run the action on the next tick.
  const closeSheetThen = (fn: () => void) => {
    setShowShareSheet(false);
    setTimeout(fn, 150);
  };

  // Industrial themes wrap rows/cards in metal frames; plain Light/Dark keep
  // the ShadowBox look.
  const RowShell = ({
    children,
    onPress,
    testID,
    leftStripe,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    testID?: string;
    leftStripe?: string;
  }) =>
    isIndustrial ? (
      <TouchableOpacity
        testID={testID}
        style={styles.rowSkinWrap}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <TbvFrame
          source={SKIN.plate}
          capInsets={CAP.plate}
          style={styles.rowSkinFrame}
          padX={18}
          padTop={12}
          padBottom={12}
          leftStripe={leftStripe}
        >
          <View style={styles.rowSkinInner}>{children}</View>
        </TbvFrame>
      </TouchableOpacity>
    ) : (
      <ShadowBox
        testID={testID}
        style={[styles.row, leftStripe ? { borderLeftColor: leftStripe, borderLeftWidth: 3 } : null]}
        onPress={onPress}
      >
        {children}
      </ShadowBox>
    );

  const CardShell = ({
    children,
    testID,
    plainStyle,
  }: {
    children: React.ReactNode;
    testID?: string;
    plainStyle?: any;
  }) =>
    isIndustrial ? (
      <View style={styles.cardSkinFrame}>
        <TbvFrame
          source={SKIN.window}
          capInsets={CAP.window}
          padX={34}
          padTop={28}
          padBottom={28}
          testID={testID}
        >
          {children}
        </TbvFrame>
      </View>
    ) : (
      <ShadowBox testID={testID} style={plainStyle}>
        {children}
      </ShadowBox>
    );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title={b.name}
        subtitle="Contact Details"
        onBack={() => router.back()}
      />
      <View style={styles.detailActionsRow}>
        <PillButton
          testID="edit-borrower-btn"
          label="EDIT"
          icon="create-outline"
          variant="active"
          onPress={openEditModal}
        />
        <PillButton
          testID="share-borrower-btn"
          label="SHARE"
          icon="share-social-outline"
          variant="active"
          onPress={handleShare}
        />
        <PillButton
          testID="delete-borrower-btn"
          label="DELETE"
          icon="trash-outline"
          variant="danger"
          onPress={handleDelete}
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.heroBox}>
          <Text style={styles.bigName}>{b.name}</Text>
          <ContactActions raw={b.contact} />
        </View>

        {isIndustrial ? (
          <View style={styles.statSkinFrame}>
            <TbvFrame
              source={SKIN.window}
              capInsets={CAP.window}
              padX={30}
              padTop={34}
              padBottom={34}
            >
              <View style={styles.statGridInner}>
                <Cell flat label="Total checkouts" value={String(data.total_checkouts || 0)} />
                <Cell flat label="Unique tools" value={String(data.unique_tools || 0)} />
                <Cell flat label="Check Out" value={String(data.currently_held?.length || 0)} highlight={data.currently_held?.length > 0} />
              </View>
            </TbvFrame>
          </View>
        ) : (
          <View style={styles.statGrid}>
            <Cell label="Total checkouts" value={String(data.total_checkouts || 0)} />
            <Cell label="Unique tools" value={String(data.unique_tools || 0)} />
            <Cell label="Check Out" value={String(data.currently_held?.length || 0)} highlight={data.currently_held?.length > 0} />
          </View>
        )}

        {!!b.notes && (
          <CardShell
            testID="contact-notes-card"
            plainStyle={{ marginHorizontal: 16, marginTop: 4, paddingHorizontal: 14, paddingVertical: 12 }}
          >
            <View style={{ alignSelf: "flex-start", backgroundColor: theme.colors.accent, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, marginBottom: 8 }}>
              <Text style={{ color: "#000", fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>NOTES</Text>
            </View>
            <Text style={{ color: theme.colors.textPrimary, fontSize: 14, lineHeight: 20 }}>{b.notes}</Text>
          </CardShell>
        )}

        {data.currently_held?.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>CURRENTLY CHECKED OUT</Text>
            {data.currently_held.map((c: any) => (
              <RowShell
                key={c.tool_id}
                testID={`held-${c.tool_id}`}
                leftStripe={theme.colors.accentSecondary}
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
              </RowShell>
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
            <RowShell
              key={t.tool_id}
              testID={`per-tool-${t.tool_id}`}
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
            </RowShell>
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
            <Text style={styles.modalLabel}>NOTES</Text>
            <TextInput
              testID="edit-borrower-notes-input"
              placeholder="Notes (optional)"
              placeholderTextColor={theme.colors.textMuted}
              value={editForm.notes}
              onChangeText={(v) => setEditForm({ ...editForm, notes: v })}
              style={[styles.modalInput, { minHeight: 70 }]}
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

      {/* Share / Save contact action sheet — in-app Modal (works on RN-Web
          too, unlike Alert.alert whose buttons array is ignored on web). */}
      <Modal visible={showShareSheet} transparent animationType="slide" onRequestClose={() => setShowShareSheet(false)}>
        <View style={styles.shareBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowShareSheet(false)} />
          <View style={styles.shareSheet}>
            <View style={styles.shareGrabber} />
            <Text style={styles.shareTitle} numberOfLines={1}>{b.name}</Text>
            <Text style={styles.shareSub}>Share this contact or save it to your phone.</Text>

            <TouchableOpacity
              testID="share-option-share"
              style={styles.shareOption}
              onPress={() => closeSheetThen(doShareContact)}
              activeOpacity={0.85}
            >
              <Ionicons name="share-social-outline" size={20} color={theme.colors.accent} />
              <Text style={styles.shareOptionText}>Share (text / email)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="share-option-save"
              style={styles.shareOption}
              onPress={() => closeSheetThen(doSaveToDevice)}
              activeOpacity={0.85}
            >
              <Ionicons name="person-add-outline" size={20} color={theme.colors.accent} />
              <Text style={styles.shareOptionText}>Save to Phone Contacts</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="share-option-cancel"
              style={[styles.shareOption, styles.shareCancel]}
              onPress={() => setShowShareSheet(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.shareCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Cell({ label, value, highlight, flat }: { label: string; value: string; highlight?: boolean; flat?: boolean }) {
  const inner = (
    <>
      <Text style={[styles.cellValue, highlight && { color: theme.colors.accentSecondary }]}>{value}</Text>
      <Text style={styles.cellLabel}>{label}</Text>
    </>
  );
  if (flat) {
    return <View style={styles.cellFlat}>{inner}</View>;
  }
  return (
    <ShadowBoxMini style={[styles.cell, highlight && { borderColor: theme.colors.accentSecondary }]}>
      {inner}
    </ShadowBoxMini>
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
          <Text style={styles.actionPhone} numberOfLines={1}>{p}</Text>
          <ContactIconButton
            type="call"
            size={32}
            testID={`contact-call-${p}`}
            onPress={() => openPhone(p)}
          />
          <ContactIconButton
            type="text"
            size={32}
            testID={`contact-text-${p}`}
            onPress={() => openSms(p)}
          />
        </View>
      ))}
      {emails.map((e) => (
        <View key={`e-${e}`} style={styles.emailRow}>
          <ContactIconImage type="mail" size={22} />
          <EmailLink
            email={e}
            style={styles.actionEmailLink}
            numberOfLines={1}
            testID={`contact-email-${e}`}
          />
        </View>
      ))}
    </View>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  detailActionsRow: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, gap: 8 },
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
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  actionPhone: {
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginRight: 2,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 6,
  },
  actionEmailLink: {
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
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
  cellFlat: {
    flex: 1, minWidth: 90, paddingVertical: 8,
    alignItems: "center",
  },
  statSkinFrame: { marginHorizontal: 14, marginVertical: 12 },
  statGridInner: { flexDirection: "row", gap: 8 },
  cardSkinFrame: { marginHorizontal: 14, marginTop: 6 },
  rowSkinWrap: { marginHorizontal: 14, marginBottom: 8 },
  rowSkinFrame: { width: "100%" },
  rowSkinInner: { flexDirection: "row", alignItems: "center", gap: 10 },
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
  shareBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  shareSheet: {
    backgroundColor: c.bgSecondary,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 2,
    borderTopColor: c.accent,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  shareGrabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    marginBottom: 14,
  },
  shareTitle: {
    color: c.textPrimary,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },
  shareSub: {
    color: c.textMuted,
    fontSize: 11,
    marginTop: 4,
    marginBottom: 14,
  },
  shareOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    marginBottom: 10,
    minHeight: 52,
  },
  shareOptionText: {
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  shareCancel: {
    justifyContent: "center",
    backgroundColor: "transparent",
    borderColor: c.border,
    marginBottom: 0,
    marginTop: 2,
  },
  shareCancelText: {
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
}));
