import { compressToDataUri } from "../../src/lib/imageCompress";
import { AppImage } from "../../src/components/AppImage";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
  TextInput, Platform, RefreshControl, Modal, StyleSheet, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { themedStyles, useColors, useSkin } from "../../src/themeContext";
import { ICField, ICSelect, ICButton, ICModal, ICDateField } from "../../src/components/insurance/ICKit";
import { ProgressPill } from "../../src/components/insurance/ProgressPill";
import { AddFab } from "../../src/components/AddFab";
import { TbvListPanel } from "../../src/tbv/components/TbvListPanel";
import { useIsSteel, useSteelPanelFrame } from "../../src/tbv/steel";
import { SKIN, CAP } from "../../src/tbv/skins";
import { SkinButton } from "../../src/components/SkinButton";
import { insuranceApi, ClaimSpec } from "../../src/insuranceApi";
import { renderAndViewClaimReport, viewStoredClaimReport, shareStoredClaimReport, renderClaimReportOnly, openDataUriFile } from "../../src/insuranceReport";
import { rescheduleClaimTaskRemindersNow } from "../../src/claimTaskReminders";

const money = (n: number) => "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s?: string) => { if (!s) return ""; const d = new Date(s); return isNaN(+d) ? s : d.toLocaleString(); };
const fmtDay = (s?: string) => { if (!s) return "—"; const d = new Date(s); return isNaN(+d) ? s : d.toLocaleDateString(); };

async function uriToDataUri(uri: string, mime: string): Promise<string> {
  if (Platform.OS === "web") {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result));
      r.readAsDataURL(blob);
    });
  }
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${b64}`;
}

// Tab definitions (order per spec). icon shown when needed.
type TabKey = "details" | "tasks" | "financials" | "contacts" | "evidence" | "documents"
  | "notes" | "items" | "reports" | "insurance" | "timeline";
const TAB_DEFS: { key: TabKey; label: string; countKey?: string }[] = [
  { key: "details", label: "Details" },
  { key: "tasks", label: "Tasks", countKey: "tasks" },
  { key: "financials", label: "Financials" },
  { key: "contacts", label: "Contacts", countKey: "contacts" },
  { key: "evidence", label: "Evidence", countKey: "evidence" },
  { key: "documents", label: "Documents", countKey: "documents" },
  { key: "notes", label: "Notes", countKey: "notes" },
  { key: "items", label: "Claimed Items", countKey: "items" },
  { key: "reports", label: "Reports", countKey: "reports" },
  { key: "insurance", label: "Insurance Info" },
  { key: "timeline", label: "Timeline", countKey: "timeline" },
];

// Timeline action → icon map.
const TL_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Created: "add-circle", Status: "swap-horizontal", Note: "create",
  Report: "document-text", Email: "mail", Items: "cube", Evidence: "camera",
  Document: "document-attach", Contact: "person-add", Task: "checkbox",
};

// Note category → left-stripe color (matches the home list's colored stripe).
const NOTE_COLORS: Record<string, string> = {
  General: "#64748B", Insurance: "#2F5D8A", "Agent Communication": "#7C3AED",
  "Adjuster Communication": "#0EA5E9", "Internal Notes": "#F59E0B", "Follow-Up": "#22C55E",
};
const noteColor = (cat: string) => NOTE_COLORS[cat] || "#64748B";

// ---- module-scope showroom panel (never remounts) ----
function ShowroomPanel({ isIndustrial, winSrc, winCap, steelScale, isSteel, plainStyle, children }: any) {
  return isIndustrial ? (
    <TbvListPanel source={winSrc} capInsets={winCap} frameScale={steelScale} style={{ flex: 1 }}
      padX={isSteel ? 16 : 26} padTop={isSteel ? 10 : 14} padBottom={isSteel ? 8 : 12}>
      {children}
    </TbvListPanel>
  ) : (
    <View style={plainStyle}>{children}</View>
  );
}

export default function ClaimDetail() {
  const router = useRouter();
  const c = useColors();
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const isSteel = useIsSteel();
  const steelPanel = useSteelPanelFrame();
  const winSrc = isSteel ? steelPanel.source : SKIN.window;
  const winCap = isSteel ? steelPanel.capInsets : CAP.window;
  const steelScale = isSteel ? steelPanel.frameScale : undefined;

  const { id } = useLocalSearchParams<{ id: string }>();
  const [claim, setClaim] = useState<any>(null);
  const [spec, setSpec] = useState<ClaimSpec | null>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabKey>("details");
  const [search, setSearch] = useState("");

  // modal/sheet state
  const [statusOpen, setStatusOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailPrefill, setEmailPrefill] = useState<{ subject?: string; body?: string } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editTask, setEditTask] = useState<any>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [editContact, setEditContact] = useState<any>(null);
  const [docOpen, setDocOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [selReport, setSelReport] = useState<any>(null);
  const [oneTapBusy, setOneTapBusy] = useState(false);
  const [oneTapColsOpen, setOneTapColsOpen] = useState(false);
  const [oneTapCols, setOneTapCols] = useState<string[]>(ONE_TAP_DEFAULT_COLS);
  const [evThumbs, setEvThumbs] = useState<Record<string, string>>({});
  const [viewEv, setViewEv] = useState<any | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cl, ev, docs, rep] = await Promise.all([
        insuranceApi.get(id), insuranceApi.listEvidence(id),
        insuranceApi.listDocuments(id), insuranceApi.listReports(id),
      ]);
      setClaim(cl); setEvidence(ev); setDocuments(docs); setReports(rep);
      // Keep claim-task deadline reminders in sync (no-op on web/when disabled).
      rescheduleClaimTaskRemindersNow().catch(() => {});
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not load claim.");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { insuranceApi.spec().then(setSpec).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Lazy-load image evidence thumbnails.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const e of evidence) {
        if (!String(e.mime || "").startsWith("image")) continue;
        if (evThumbs[e.id]) continue;
        try {
          const full = await insuranceApi.getEvidence(id, e.id);
          if (!cancelled && full?.data_b64) setEvThumbs((m) => ({ ...m, [e.id]: full.data_b64 }));
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidence, id]);

  const fin = claim?._financials || {};
  const items = claim?._resolved_items || [];
  const ins = claim?.insurance || {};
  const counts = claim?._counts || {};
  const progress = claim?._progress || { percent: 0, steps: [] };
  const tasks = claim?.tasks || [];
  const contacts = claim?.contacts || [];
  const notes = claim?.notes || [];
  const timeline = claim?.timeline || [];

  const openTasks = tasks.filter((t: any) => !t.done).length;

  // Date submitted (first status_history "Submitted")
  const dateSubmitted = useMemo(() => {
    const h = (claim?.status_history || []).find((s: any) => s.status === "Submitted");
    return h?.created_at;
  }, [claim]);

  // Warnings on claimed items
  const itemWarnings = useMemo(() => {
    const out: { item: any; issues: string[] }[] = [];
    for (const it of items) {
      const issues: string[] = [];
      if ((it.serials || []).length === 0) issues.push("Missing serial number");
      if ((it.models || []).length === 0) issues.push("Missing model number");
      if (!(it.cost > 0) && !(it.line_purchase > 0)) issues.push("Missing price");
      if (!it.purchase_date) issues.push("Missing purchase date");
      if (issues.length) out.push({ item: it, issues });
    }
    return out;
  }, [items]);

  const openEvidence = async (e: any) => {
    try {
      const isImg = String(e.mime || "").startsWith("image");
      let uri = evThumbs[e.id];
      if (!uri) {
        const full = await insuranceApi.getEvidence(id, e.id);
        uri = full?.data_b64;
        if (isImg && uri) setEvThumbs((m) => ({ ...m, [e.id]: uri! }));
      }
      if (!uri) throw new Error("Evidence file is unavailable.");
      if (isImg) setViewEv({ ...e, data: uri });
      else await openDataUriFile(uri, e.filename || "evidence", e.mime || "application/octet-stream");
    } catch (err: any) { Alert.alert("Could not open", err?.message || String(err)); }
  };

  const openDocument = async (d: any) => {
    try {
      const full = await insuranceApi.getDocument(id, d.id);
      const uri = full?.data_b64;
      if (!uri) throw new Error("Document file is unavailable.");
      const isImg = String(d.mime || "").startsWith("image");
      if (isImg) setViewEv({ ...d, kind: d.label || "Document", data: uri });
      else await openDataUriFile(uri, d.filename || "document", d.mime || "application/octet-stream");
    } catch (err: any) { Alert.alert("Could not open", err?.message || String(err)); }
  };

  const confirmDelete = () => {
    Alert.alert("Delete claim?", "This permanently removes the claim, its evidence and reports. Inventory is not affected.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await insuranceApi.remove(id); router.back(); } },
    ]);
  };
  const moreMenu = () => {
    Alert.alert("Claim actions", undefined, [
      { text: "Edit details", onPress: () => router.push(`/insurance-claims/new?id=${id}` as any) },
      { text: "Duplicate", onPress: async () => { const d = await insuranceApi.duplicate(id); router.replace(`/insurance-claims/${d.id}` as any); } },
      { text: claim?.archived ? "Unarchive" : "Archive", onPress: async () => { await insuranceApi.archive(id, !claim?.archived); load(); } },
      { text: "Delete", style: "destructive", onPress: confirmDelete },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const oneTapEmailInsurer = async (chosenCols: string[]) => {
    setOneTapColsOpen(false); setOneTapBusy(true);
    try {
      await renderClaimReportOnly(id, { kind: "detailed", ...TOGGLES.reduce((a, [k]) => ({ ...a, [k]: true }), {}), item_columns: chosenCols.length ? chosenCols : ONE_TAP_DEFAULT_COLS });
      const list = await insuranceApi.listReports(id);
      const latest = list[0];
      if (!latest) throw new Error("Report was generated but could not be located.");
      await load();
      const recipientName = ins.agent_name || ins.adjuster_name || "";
      const claimNo = claim.claim_number ? ` (Claim #${claim.claim_number})` : "";
      const subject = `Insurance Claim — ${claim.title}${claimNo}`;
      const body = `Hello${recipientName ? ` ${recipientName}` : ""},\n\n` +
        `Please find attached the detailed insurance claim report for "${claim.title}".\n\n` +
        `Policy #: ${ins.policy_number || "—"}\nClaim #: ${claim.claim_number || "—"}\n` +
        `Claim Type: ${claim.claim_type || "—"}\nDate of Loss: ${claim.date_of_loss || "—"}\n` +
        `Net Claimed: ${money(fin.net_claimed || 0)}\n\nPlease let me know if any additional documentation is needed.\n\nThank you.`;
      setSelReport(latest); setEmailPrefill({ subject, body }); setEmailOpen(true);
    } catch (e: any) { Alert.alert("Could not prepare email", e?.message || ""); } finally { setOneTapBusy(false); }
  };

  const addPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow photo access to attach evidence."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const data = await compressToDataUri(a.uri);
    setBusy(true);
    try { await insuranceApi.addEvidence(id, { filename: a.fileName || `photo-${Date.now()}.jpg`, mime: a.mimeType || "image/jpeg", kind: "Damage Photo", data_b64: data }); load(); }
    catch (e: any) { Alert.alert("Upload failed", e?.message || ""); } finally { setBusy(false); }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow camera access to capture evidence."); return; }
    const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const data = await compressToDataUri(a.uri);
    setBusy(true);
    try { await insuranceApi.addEvidence(id, { filename: `photo-${Date.now()}.jpg`, mime: "image/jpeg", kind: "Damage Photo", data_b64: data }); load(); }
    catch (e: any) { Alert.alert("Upload failed", e?.message || ""); } finally { setBusy(false); }
  };

  // FAB context action by active tab.
  const fabAction = () => {
    switch (tab) {
      case "tasks": setEditTask(null); setTaskOpen(true); break;
      case "contacts": setEditContact(null); setContactOpen(true); break;
      case "notes": setNoteOpen(true); break;
      case "documents": setDocOpen(true); break;
      case "evidence": setAddMenuOpen(true); break;
      case "items": setAttachOpen(true); break;
      case "reports": setReportOpen(true); break;
      default: setAddMenuOpen(true);
    }
  };

  if (loading || !claim) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={c.accent} style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  // ----- global search across the whole claim -----
  const ql = search.trim().toLowerCase();
  const searchResults = ql ? buildSearchResults(ql, { claim, items, notes, contacts, evidence, documents, reports, timeline }) : [];

  // ===================== TAB CONTENT =====================
  const DetailRow = ({ label, value }: { label: string; value?: any }) =>
    value ? (<View style={styles.kvRow}><Text style={styles.kvL}>{label}</Text><Text style={styles.kvV}>{String(value)}</Text></View>) : null;

  const renderDetails = () => (
    <View>
      <SectionHead title="CLAIM DETAILS" right={<EditLink onPress={() => router.push(`/insurance-claims/new?id=${id}` as any)} />} />
      <DetailRow label="Claim Number" value={claim.claim_number} />
      <DetailRow label="Incident Type" value={claim.claim_type} />
      <DetailRow label="Incident Date" value={claim.date_of_loss && fmtDay(claim.date_of_loss)} />
      <DetailRow label="Date Discovered" value={claim.date_discovered && fmtDay(claim.date_discovered)} />
      <DetailRow label="Incident Address" value={claim.loss_location} />
      <DetailRow label="Police Report #" value={claim.police_report_number} />
      <DetailRow label="Police Case #" value={claim.case_number} />
      {claim.description ? (<><Text style={styles.subLabel}>DESCRIPTION</Text><Text style={styles.bodyText}>{claim.description}</Text></>) : null}
      {claim.incident_notes ? (<><Text style={styles.subLabel}>INCIDENT NOTES</Text><Text style={styles.bodyText}>{claim.incident_notes}</Text></>) : null}
    </View>
  );

  const finRows: [string, number, boolean?][] = [
    ["Purchase Value", fin.total_purchase],
    ["Replacement Value", fin.total_replacement],
    ["Replacement Difference", fin.replacement_difference],
    ["Claim Amount", fin.total_claimed],
    ["Approved Amount", fin.approved_value],
    ["Paid Amount", fin.paid_value],
    ["Outstanding Balance", fin.outstanding_balance],
    ["Deductible", fin.deductible],
    ["Sales Tax", fin.sales_tax],
    ["Depreciation", fin.depreciation],
    ["Recoverable Depreciation", fin.recoverable_depreciation],
    ["Actual Cash Value", fin.actual_cash_value],
    ["Replacement Cost Value", fin.replacement_cost_value],
  ];
  const renderFinancials = () => (
    <View>
      <SectionHead title="FINANCIALS" right={<EditLink onPress={() => router.push(`/insurance-claims/new?id=${id}` as any)} />} />
      {finRows.map(([l, v]) => (
        <View key={l} style={styles.finRow}><Text style={styles.finL}>{l}</Text><Text style={styles.finV}>{money(v as number)}</Text></View>
      ))}
      <View style={[styles.finRow, styles.finNet]}><Text style={styles.finNetL}>NET EXPECTED PAYMENT</Text><Text style={styles.finNetV}>{money(fin.net_expected_payment)}</Text></View>
    </View>
  );

  const renderContacts = () => {
    const sorted = [...contacts].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const groups: Record<string, any[]> = {};
    for (const ct of sorted) {
      const letter = (ct.name || "#").trim().charAt(0).toUpperCase() || "#";
      (groups[letter] = groups[letter] || []).push(ct);
    }
    return (
      <View>
        <SectionHead title={`CONTACTS (${contacts.length})`} right={<AddLink onPress={() => { setEditContact(null); setContactOpen(true); }} />} />
        {contacts.length === 0 ? <Empty text="No contacts yet. Add adjusters, officers, etc." /> :
          Object.keys(groups).sort().map((letter) => (
            <View key={letter}>
              <Text style={styles.groupHead}>{letter}</Text>
              {groups[letter].map((ct) => (
                <View key={ct.id} style={styles.contactRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{ct.name}</Text>
                    {(ct.phone || ct.email) ? <Text style={styles.muted} numberOfLines={1}>{[ct.phone, ct.email].filter(Boolean).join(" · ")}</Text> : null}
                  </View>
                  {ct.role ? <Text style={styles.roleTag}>{ct.role}</Text> : null}
                  <TouchableOpacity onPress={() => contactMenu(ct)} hitSlop={8} style={{ paddingLeft: 8 }}>
                    <Ionicons name="ellipsis-vertical" size={18} color={c.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))}
      </View>
    );
  };

  const contactMenu = (ct: any) => {
    const opts: any[] = [];
    if (ct.phone) opts.push({ text: "Call", onPress: () => Linking.openURL(`tel:${ct.phone}`) });
    if (ct.phone) opts.push({ text: "Text", onPress: () => Linking.openURL(`sms:${ct.phone}`) });
    if (ct.email) opts.push({ text: "Email", onPress: () => Linking.openURL(`mailto:${ct.email}`) });
    if (ct.address) opts.push({ text: "Directions", onPress: () => Linking.openURL(Platform.select({ ios: `maps:0,0?q=${encodeURIComponent(ct.address)}`, default: `https://maps.google.com/?q=${encodeURIComponent(ct.address)}` })!) });
    opts.push({ text: "Edit", onPress: () => { setEditContact(ct); setContactOpen(true); } });
    opts.push({ text: "Delete", style: "destructive", onPress: async () => { await insuranceApi.deleteContact(id, ct.id); load(); } });
    opts.push({ text: "Cancel", style: "cancel" });
    Alert.alert(ct.name, ct.role || undefined, opts);
  };

  const renderEvidence = () => {
    const sorted = [...evidence].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return (
      <View>
        <SectionHead title={`EVIDENCE (${evidence.length})`} right={
          <View style={{ flexDirection: "row", gap: 14 }}>
            <TouchableOpacity onPress={takePhoto}><Ionicons name="camera-outline" size={20} color={c.accent} /></TouchableOpacity>
            <TouchableOpacity onPress={addPhoto}><Ionicons name="image-outline" size={20} color={c.accent} /></TouchableOpacity>
          </View>} />
        {busy ? <ActivityIndicator color={c.accent} /> : null}
        {sorted.length === 0 ? <Empty text="Add disaster/damage photos. Previewable in-app." /> :
          <View style={styles.evGrid}>
            {sorted.map((e) => {
              const isImg = String(e.mime || "").startsWith("image");
              const thumb = evThumbs[e.id];
              return (
                <View key={e.id} style={styles.evCell}>
                  <TouchableOpacity onPress={() => openEvidence(e)} activeOpacity={0.8}>
                    {isImg && thumb ? <AppImage source={{ uri: thumb }} style={styles.evThumb} resizeMode="cover" /> :
                      <View style={styles.evThumb}><Ionicons name={isImg ? "image" : "document-text"} size={26} color={c.accent} /></View>}
                  </TouchableOpacity>
                  <Text style={styles.evName} numberOfLines={1}>{e.kind}</Text>
                  <Text style={styles.evDate} numberOfLines={1}>{fmtDay(e.created_at)}</Text>
                  <TouchableOpacity onPress={() => Alert.alert("Remove evidence?", e.filename, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: async () => { await insuranceApi.deleteEvidence(id, e.id); load(); } }])} style={styles.evDel}>
                    <Ionicons name="close-circle" size={18} color={c.danger} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>}
      </View>
    );
  };

  const renderDocuments = () => {
    const sorted = [...documents].sort((a, b) => String(b.date || b.created_at).localeCompare(String(a.date || a.created_at)));
    return (
      <View>
        <SectionHead title={`DOCUMENTS (${documents.length})`} right={<AddLink onPress={() => setDocOpen(true)} />} />
        {sorted.length === 0 ? <Empty text="Upload PDFs, spreadsheets, email screenshots, etc." /> :
          sorted.map((d) => (
            <TouchableOpacity key={d.id} style={styles.docRow} onPress={() => openDocument(d)} activeOpacity={0.7}>
              <Ionicons name={String(d.mime || "").includes("pdf") ? "document-text" : String(d.mime || "").startsWith("image") ? "image" : "document"} size={22} color={c.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{d.label || d.filename}</Text>
                <Text style={styles.muted} numberOfLines={1}>{[fmtDay(d.date || d.created_at), d.note].filter(Boolean).join(" · ")}</Text>
              </View>
              <TouchableOpacity onPress={() => Alert.alert("Remove document?", d.label || d.filename, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: async () => { await insuranceApi.deleteDocument(id, d.id); load(); } }])} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={c.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
      </View>
    );
  };

  const renderNotes = () => {
    const sorted = [...notes].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return (
      <View>
        <SectionHead title={`NOTES (${notes.length})`} right={<AddLink onPress={() => setNoteOpen(true)} />} />
        {sorted.length === 0 ? <Empty text="No notes yet." /> :
          sorted.map((n) => (
            <View key={n.id} style={styles.noteRowWrap}>
              <View style={[styles.noteStripe, { backgroundColor: noteColor(n.category) }]} />
              <View style={styles.noteBody}>
                <Text style={styles.noteMeta}>{n.category} · {fmtDate(n.created_at)}</Text>
                <Text style={styles.noteText}>{n.text}</Text>
              </View>
              <TouchableOpacity onPress={async () => { await insuranceApi.deleteNote(id, n.id); load(); }} hitSlop={8} style={{ paddingLeft: 6 }}>
                <Ionicons name="close" size={16} color={c.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
      </View>
    );
  };

  const renderItems = () => (
    <View>
      <View style={styles.itemsTopBar}>
        <Text style={styles.itemsCount}>{items.length} item(s) listed</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {itemWarnings.length > 0 ? (
            <TouchableOpacity onPress={() => setWarningsOpen(true)} style={styles.warnBtn}>
              <Ionicons name="warning" size={14} color="#000" />
              <Text style={styles.warnBtnText}>{itemWarnings.length} Warning{itemWarnings.length > 1 ? "s" : ""}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.okBadge}><Ionicons name="checkmark-circle" size={14} color={c.success} /><Text style={[styles.muted, { color: c.success }]}>No warnings</Text></View>
          )}
          <TouchableOpacity onPress={() => setAttachOpen(true)}><Text style={styles.link}>+ Attach</Text></TouchableOpacity>
        </View>
      </View>
      {items.length === 0 ? <Empty text="Choose destroyed items being claimed. Tap Attach." /> :
        items.map((it: any) => {
          const w = itemWarnings.find((x) => x.item.tool_id === it.tool_id);
          return (
            <TouchableOpacity key={it.tool_id} style={styles.itemRow} onPress={() => setEditItem(it)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{it.name}{it.missing_tool ? " (removed)" : ""}</Text>
                <Text style={styles.muted} numberOfLines={1}>{[it.brand, it.pre_loss_condition && `${it.pre_loss_condition}→${it.post_loss_condition}`].filter(Boolean).join(" · ")}</Text>
              </View>
              {w ? <Ionicons name="warning" size={16} color={c.warning} style={{ marginRight: 6 }} /> : null}
              <Text style={styles.itemVal}>{money(it.line_claimed)}</Text>
              <TouchableOpacity onPress={async () => { await insuranceApi.detachItem(id, it.tool_id); load(); }} style={{ paddingLeft: 10 }}>
                <Ionicons name="trash-outline" size={18} color={c.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
    </View>
  );

  const renderReports = () => (
    <View>
      <SectionHead title={`REPORTS (${reports.length})`} />
      <View style={styles.reportOptRow}>
        <TouchableOpacity style={styles.reportOptBtn} onPress={() => setReportOpen(true)}>
          <Ionicons name="document-text-outline" size={18} color={c.accent} /><Text style={styles.reportOptText}>Create New</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.reportOptBtn} onPress={async () => {
          setBusy(true);
          try { await renderAndViewClaimReport(id, { kind: "quick", include_items: true, include_financials: true, include_insurance: true, include_incident: true, item_columns: DEFAULT_ITEM_COLUMNS }); load(); }
          catch (e: any) { Alert.alert("Report failed", e?.message || ""); } finally { setBusy(false); }
        }}>
          <Ionicons name="flash-outline" size={18} color={c.accent} /><Text style={styles.reportOptText}>Quick Report</Text>
        </TouchableOpacity>
      </View>
      <SkinButton label={oneTapBusy ? "Preparing report…" : "Email Report to Insurer"} icon="mail" onPress={() => { setOneTapCols(ONE_TAP_DEFAULT_COLS); setOneTapColsOpen(true); }} disabled={oneTapBusy} />
      <Text style={[styles.muted, { marginTop: 6, marginBottom: 10 }]}>History — each report is permanently saved as a new version (never overwritten).</Text>
      {reports.length === 0 ? <Empty text="No reports yet." /> :
        reports.map((r) => (
          <View key={r.id} style={styles.repRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{r.kind === "detailed" ? "Detailed" : "Quick"} Report v{r.version}</Text>
              <Text style={styles.muted}>{fmtDate(r.generated_at)} · {(r.size / 1024).toFixed(0)} KB</Text>
            </View>
            <TouchableOpacity onPress={() => viewStoredClaimReport(id, r.id).catch((e) => Alert.alert("Error", e.message))} style={styles.repBtn}><Ionicons name="eye-outline" size={18} color={c.accent} /></TouchableOpacity>
            <TouchableOpacity onPress={() => shareStoredClaimReport(id, r.id).catch((e) => Alert.alert("Error", e.message))} style={styles.repBtn}><Ionicons name="share-outline" size={18} color={c.accent} /></TouchableOpacity>
            <TouchableOpacity onPress={() => { setSelReport(r); setEmailPrefill(null); setEmailOpen(true); }} style={styles.repBtn}><Ionicons name="mail-outline" size={18} color={c.accent} /></TouchableOpacity>
          </View>
        ))}
    </View>
  );

  const renderInsurance = () => (
    <View>
      <SectionHead title="INSURANCE INFO" right={<EditLink onPress={() => router.push(`/insurance-claims/new?id=${id}` as any)} />} />
      {[["Company", ins.company], ["Policy #", ins.policy_number], ["Agent", ins.agent_name], ["Agent Phone", ins.agent_phone], ["Agent Email", ins.agent_email], ["Adjuster", ins.adjuster_name], ["Adjuster Phone", ins.adjuster_phone], ["Adjuster Email", ins.adjuster_email], ["Portal", ins.portal_url]]
        .filter(([, v]) => v).map(([l, v]) => (<View key={l as string} style={styles.kvRow}><Text style={styles.kvL}>{l}</Text><Text style={styles.kvV}>{String(v)}</Text></View>))}
      {!ins.company && !ins.policy_number ? <Empty text="No insurance info yet. Tap Edit to add." /> : null}
    </View>
  );

  const renderTimeline = () => (
    <View>
      <SectionHead title="TIMELINE" />
      <Text style={[styles.muted, { marginBottom: 8 }]}>Automatic audit trail (not editable).</Text>
      {timeline.length === 0 ? <Empty text="No activity yet." /> :
        [...timeline].reverse().map((t: any) => (
          <View key={t.id} style={styles.tlRow}>
            <View style={[styles.tlIcon, { borderColor: c.accent }]}>
              <Ionicons name={TL_ICON[t.type] || "ellipse"} size={14} color={c.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tlType}>{t.type}{t.detail ? `: ${t.detail}` : ""}</Text>
              <Text style={styles.muted}>{fmtDate(t.created_at)}</Text>
            </View>
          </View>
        ))}
    </View>
  );

  const renderTasks = () => (
    <View>
      <SectionHead title={`TASKS (${tasks.length})`} right={<AddLink onPress={() => { setEditTask(null); setTaskOpen(true); }} />} />
      <Text style={[styles.muted, { marginBottom: 8 }]}>Predefined steps check off automatically as you complete the claim. Add your own tasks anytime — completed tasks stay listed with a green check.</Text>
      {tasks.length === 0 ? <Empty text="No tasks." /> :
        tasks.map((t: any) => {
          const isDefault = t.source === "default";
          return (
            <View key={t.id} style={styles.taskRow}>
              <TouchableOpacity disabled={isDefault} onPress={async () => { await insuranceApi.patchTask(id, t.id, { done: !t.done }); load(); }} hitSlop={8}>
                <Ionicons name={t.done ? "checkbox" : "square-outline"} size={22} color={t.done ? c.success : c.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1 }} disabled={isDefault} onPress={() => setEditTask(t)} activeOpacity={isDefault ? 1 : 0.6}>
                <Text style={[styles.taskText, t.done && styles.taskDone]}>{t.text}</Text>
                <Text style={styles.muted}>
                  {isDefault ? "Auto step" : (t.due_date ? `Due ${fmtDay(t.due_date)}` : "No deadline")}
                </Text>
              </TouchableOpacity>
              {!isDefault ? (
                <TouchableOpacity onPress={async () => { await insuranceApi.deleteTask(id, t.id); load(); }} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
    </View>
  );

  const tabContent = () => {
    switch (tab) {
      case "details": return renderDetails();
      case "tasks": return renderTasks();
      case "financials": return renderFinancials();
      case "contacts": return renderContacts();
      case "evidence": return renderEvidence();
      case "documents": return renderDocuments();
      case "notes": return renderNotes();
      case "items": return renderItems();
      case "reports": return renderReports();
      case "insurance": return renderInsurance();
      case "timeline": return renderTimeline();
    }
  };

  const goToResult = (r: SearchResult) => { setSearch(""); setTab(r.tab); };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <IndustrialBannerHeader title={claim.title} onBack={() => router.back()} onMore={moreMenu} />

      {/* Progress bar */}
      <View style={styles.progressWrap}>
        <Text style={styles.progressLabel}>CLAIM PROGRESS</Text>
        <ProgressPill percent={progress.percent} />
      </View>

      {/* 2-column header facts */}
      <View style={styles.factsGrid}>
        <View style={styles.factCol}>
          <Fact label="STATUS" value={claim.status} onPress={() => setStatusOpen(true)} accent />
          <Fact label="DATE" value={fmtDay(claim.created_at)} />
          <Fact label="SUBMITTED" value={fmtDay(dateSubmitted)} />
        </View>
        <View style={styles.factCol}>
          <Fact label="CLAIMED" value={money(fin.total_claimed)} />
          <Fact label="DEDUCTIBLE" value={money(fin.deductible)} />
          <Fact label="PAYOUT" value={money(fin.paid_value)} />
        </View>
      </View>
      <TouchableOpacity testID="icd-tasks-link" style={styles.tasksLink} onPress={() => setTab("tasks")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7}>
        <Ionicons name="checkbox-outline" size={16} color={c.accent} />
        <Text style={styles.tasksLinkText}>Tasks to Complete</Text>
        {openTasks > 0 ? <View style={styles.tasksBadge}><Text style={styles.tasksBadgeText}>{openTasks}</Text></View> : <Ionicons name="checkmark-done" size={16} color={c.success} />}
        <View style={{ flex: 1 }} />
        <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
      </TouchableOpacity>

      {/* Horizontal tab bar */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {TAB_DEFS.map((t) => {
            const on = tab === t.key;
            const cnt = t.countKey ? counts[t.countKey] : undefined;
            return (
              <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, on && styles.tabOn]}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}{cnt != null ? ` (${cnt})` : ""}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* One static skinned panel */}
      <View style={styles.panelOuter}>
        <ShowroomPanel isIndustrial={isIndustrial} winSrc={winSrc} winCap={winCap} steelScale={steelScale} isSteel={isSteel} plainStyle={styles.panelPlain}>
          {/* Constant search bar */}
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={c.textMuted} style={{ marginRight: 8 }} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Search this claim…" placeholderTextColor={c.textMuted} style={styles.searchInput} />
            {search ? <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}><Ionicons name="close-circle" size={16} color={c.textMuted} /></TouchableOpacity> : null}
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={c.accent} />}>
            {ql ? (
              searchResults.length === 0 ? <Empty text={`No matches for "${search}".`} /> :
                searchResults.map((r, i) => (
                  <TouchableOpacity key={i} style={styles.resultRow} onPress={() => goToResult(r)}>
                    <View style={styles.resultTag}><Text style={styles.resultTagText}>{r.section}</Text></View>
                    <Text style={styles.resultText} numberOfLines={2}>{r.text}</Text>
                    <Ionicons name="chevron-forward" size={15} color={c.textMuted} />
                  </TouchableOpacity>
                ))
            ) : tabContent()}
          </ScrollView>
        </ShowroomPanel>
      </View>

      <AddFab testID="icd-fab" onPress={fabAction} />

      {/* ---------------- Modals ---------------- */}
      <StatusModal visible={statusOpen} onClose={() => setStatusOpen(false)} spec={spec} claim={claim} onDone={() => { setStatusOpen(false); load(); }} id={id} />
      <AttachModal visible={attachOpen} onClose={() => setAttachOpen(false)} id={id} attached={items.map((i: any) => i.tool_id)} onDone={() => { setAttachOpen(false); load(); }} />
      <NoteModal visible={noteOpen} onClose={() => setNoteOpen(false)} spec={spec} id={id} onDone={() => { setNoteOpen(false); load(); }} />
      <TaskModal visible={taskOpen || !!editTask} task={editTask} onClose={() => { setTaskOpen(false); setEditTask(null); }} id={id} onDone={() => { setTaskOpen(false); setEditTask(null); load(); }} />
      <ContactModal visible={contactOpen} contact={editContact} onClose={() => { setContactOpen(false); setEditContact(null); }} id={id} onDone={() => { setContactOpen(false); setEditContact(null); load(); }} />
      <DocumentModal visible={docOpen} onClose={() => setDocOpen(false)} id={id} onDone={() => { setDocOpen(false); load(); }} />
      <ItemEditModal item={editItem} spec={spec} id={id} onClose={() => setEditItem(null)} onDone={() => { setEditItem(null); load(); }} />
      <ReportModal visible={reportOpen} onClose={() => setReportOpen(false)} id={id} onDone={() => { setReportOpen(false); load(); }} />
      <EmailModal visible={emailOpen} onClose={() => { setEmailOpen(false); setEmailPrefill(null); }} id={id} ins={ins} report={selReport} prefill={emailPrefill} onDone={() => { setEmailOpen(false); setEmailPrefill(null); load(); }} />
      <EvidenceViewer ev={viewEv} onClose={() => setViewEv(null)} />

      {/* Task list now lives in the Tasks tab */}

      {/* Warnings sheet */}
      <ICModal visible={warningsOpen} onClose={() => setWarningsOpen(false)} title="Item Warnings">
        <Text style={styles.muted}>These appear only here (never on reports). Tap an item to fix it; warnings clear automatically.</Text>
        <View style={{ height: 10 }} />
        {itemWarnings.length === 0 ? <Empty text="All items are complete." /> :
          itemWarnings.map((w) => (
            <TouchableOpacity key={w.item.tool_id} style={styles.warnRow} onPress={() => { setWarningsOpen(false); router.push(`/tool/${w.item.tool_id}` as any); }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{w.item.name}</Text>
                {w.issues.map((iss) => <Text key={iss} style={[styles.muted, { color: c.warning }]}>• {iss}</Text>)}
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
            </TouchableOpacity>
          ))}
      </ICModal>

      {/* One-tap email column chooser */}
      <ICModal visible={oneTapColsOpen} onClose={() => setOneTapColsOpen(false)} title="Email Report — Choose Columns">
        <Text style={styles.muted}>Pick which item details appear (Item name is always shown):</Text>
        {ITEM_COLUMNS.map(([k, label]) => {
          const on = oneTapCols.includes(k);
          return (
            <TouchableOpacity key={k} style={styles.toggleRow} onPress={() => setOneTapCols((cur) => cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k])}>
              <Text style={styles.itemName}>{label}</Text>
              <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? c.accent : c.textMuted} />
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 12 }} />
        <ICButton label={oneTapBusy ? "Generating…" : "Generate & Email"} icon="mail" onPress={() => oneTapEmailInsurer(oneTapCols)} disabled={oneTapBusy} />
      </ICModal>

      {/* Add menu (FAB on tabs without a single obvious action) */}
      <ICModal visible={addMenuOpen} onClose={() => setAddMenuOpen(false)} title="Add to Claim">
        {[
          { t: "Note", i: "create-outline", fn: () => setNoteOpen(true) },
          { t: "Task", i: "checkbox-outline", fn: () => setTaskOpen(true) },
          { t: "Contact", i: "person-add-outline", fn: () => { setEditContact(null); setContactOpen(true); } },
          { t: "Evidence Photo (Gallery)", i: "image-outline", fn: addPhoto },
          { t: "Evidence Photo (Camera)", i: "camera-outline", fn: takePhoto },
          { t: "Document", i: "document-attach-outline", fn: () => setDocOpen(true) },
          { t: "Attach Inventory Items", i: "cube-outline", fn: () => setAttachOpen(true) },
        ].map((o) => (
          <TouchableOpacity key={o.t} style={styles.addMenuRow} onPress={() => { setAddMenuOpen(false); setTimeout(o.fn, 250); }}>
            <Ionicons name={o.i as any} size={20} color={c.accent} />
            <Text style={styles.addMenuText}>{o.t}</Text>
          </TouchableOpacity>
        ))}
      </ICModal>
    </SafeAreaView>
  );
}

/* ===================== small presentational helpers ===================== */
function SectionHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (<View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text>{right}</View>);
}
function EditLink({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (<TouchableOpacity onPress={onPress}><Ionicons name="create-outline" size={18} color={c.accent} /></TouchableOpacity>);
}
function AddLink({ onPress }: { onPress: () => void }) {
  return (<TouchableOpacity onPress={onPress}><Text style={styles.link}>+ Add</Text></TouchableOpacity>);
}
function Empty({ text }: { text: string }) { return <Text style={styles.muted}>{text}</Text>; }
function Fact({ label, value, onPress, accent }: { label: string; value: string; onPress?: () => void; accent?: boolean }) {
  const inner = (<><Text style={styles.factLabel}>{label}</Text><Text style={[styles.factValue, accent && styles.factValueAccent]} numberOfLines={1}>{value}</Text></>);
  return onPress ? <TouchableOpacity style={styles.fact} onPress={onPress}>{inner}</TouchableOpacity> : <View style={styles.fact}>{inner}</View>;
}

/* Banner wrapper using IndustrialBanner with a kebab right slot. */
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
function IndustrialBannerHeader({ title, onBack, onMore }: { title: string; onBack: () => void; onMore: () => void }) {
  const c = useColors();
  return (
    <IndustrialBanner title={title} onBack={onBack}
      rightSlot={<TouchableOpacity onPress={onMore} hitSlop={10} testID="icd-more"><Ionicons name="ellipsis-horizontal" size={22} color={c.accent} /></TouchableOpacity>} />
  );
}

/* ===================== global search ===================== */
type SearchResult = { section: string; text: string; tab: TabKey };
function buildSearchResults(ql: string, d: any): SearchResult[] {
  const out: SearchResult[] = [];
  const push = (section: string, text: string, tab: TabKey) => { if (text && text.toLowerCase().includes(ql)) out.push({ section, text, tab }); };
  const cl = d.claim, ins = cl.insurance || {};
  push("Details", `Claim #: ${cl.claim_number}`, "details");
  push("Details", `Type: ${cl.claim_type}`, "details");
  push("Details", `Location: ${cl.loss_location}`, "details");
  push("Details", `Description: ${cl.description}`, "details");
  push("Details", `Police #: ${cl.police_report_number}`, "details");
  push("Insurance Info", `Company: ${ins.company}`, "insurance");
  push("Insurance Info", `Policy #: ${ins.policy_number}`, "insurance");
  push("Insurance Info", `Agent: ${ins.agent_name}`, "insurance");
  push("Insurance Info", `Adjuster: ${ins.adjuster_name}`, "insurance");
  for (const it of d.items) {
    push("Claimed Items", it.name, "items");
    (it.serials || []).forEach((s: string) => push("Claimed Items", `${it.name} · S/N ${s}`, "items"));
    (it.models || []).forEach((m: string) => push("Claimed Items", `${it.name} · M# ${m}`, "items"));
    push("Claimed Items", `${it.name} · ${it.brand}`, "items");
  }
  for (const n of d.notes) push("Notes", n.text, "notes");
  for (const ct of d.contacts) push("Contacts", `${ct.name} · ${ct.role || ""} ${ct.phone || ""} ${ct.email || ""}`, "contacts");
  for (const e of d.evidence) push("Evidence", `${e.kind} · ${e.filename} ${e.caption || ""}`, "evidence");
  for (const doc of d.documents) push("Documents", `${doc.label || doc.filename} ${doc.note || ""}`, "documents");
  for (const r of d.reports) push("Reports", `${r.kind} report v${r.version}`, "reports");
  for (const t of d.timeline) push("Timeline", `${t.type}: ${t.detail || ""}`, "timeline");
  return out.slice(0, 60);
}

/* ===================== EvidenceViewer ===================== */
function EvidenceViewer({ ev, onClose }: any) {
  if (!ev) return null;
  return (
    <Modal visible={!!ev} transparent animationType="fade" onRequestClose={onClose}>
      <View style={evStyles.backdrop}>
        <TouchableOpacity style={evStyles.closeBtn} onPress={onClose}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity>
        <AppImage source={{ uri: ev.data }} style={evStyles.image} resizeMode="contain" />
        <Text style={evStyles.caption} numberOfLines={2}>{ev.kind}{ev.filename ? ` · ${ev.filename}` : ""}</Text>
      </View>
    </Modal>
  );
}
const evStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center", padding: 16 },
  closeBtn: { position: "absolute", top: 48, right: 20, zIndex: 2, padding: 8 },
  image: { width: "100%", height: "80%" },
  caption: { color: "#fff", fontSize: 13, marginTop: 12, textAlign: "center" },
});

/* ======================= Modals ======================= */
function StatusModal({ visible, onClose, spec, claim, onDone, id }: any) {
  const [status, setStatus] = useState(claim?.status || "Draft");
  const [note, setNote] = useState("");
  const [approved, setApproved] = useState(String(claim?.approved_value ?? ""));
  const [paid, setPaid] = useState(String(claim?.paid_value ?? ""));
  useEffect(() => { if (visible) { setStatus(claim?.status); setApproved(String(claim?.approved_value ?? "")); setPaid(String(claim?.paid_value ?? "")); setNote(""); } }, [visible]);
  const save = async () => { await insuranceApi.setStatus(id, { status, note, approved_value: parseFloat(approved) || 0, paid_value: parseFloat(paid) || 0 }); onDone(); };
  return (
    <ICModal visible={visible} onClose={onClose} title="Change Status">
      <ICSelect label="Status" value={status} options={spec?.statuses || []} onSelect={setStatus} />
      <ICField label="Approved Value" value={approved} onChangeText={setApproved} keyboardType="decimal-pad" />
      <ICField label="Paid Value" value={paid} onChangeText={setPaid} keyboardType="decimal-pad" />
      <ICField label="Note (optional)" value={note} onChangeText={setNote} multiline />
      <ICButton label="Save Status" icon="checkmark" onPress={save} />
    </ICModal>
  );
}

function NoteModal({ visible, onClose, spec, id, onDone }: any) {
  const c = useColors();
  const [text, setText] = useState("");
  const [category, setCategory] = useState("General");
  const [makeTask, setMakeTask] = useState(false);
  const [due, setDue] = useState("");
  useEffect(() => { if (visible) { setText(""); setCategory("General"); setMakeTask(false); setDue(""); } }, [visible]);
  const save = async () => { if (!text.trim()) return; await insuranceApi.addNote(id, { text, category, create_task: makeTask, task_due_date: makeTask ? due : "" }); onDone(); };
  return (
    <ICModal visible={visible} onClose={onClose} title="Add Note">
      <ICSelect label="Label" value={category} options={spec?.note_categories || []} onSelect={setCategory} />
      <ICField label="Note" value={text} onChangeText={setText} multiline />
      <TouchableOpacity style={styles.toggleRow} onPress={() => setMakeTask((v) => !v)}>
        <Text style={styles.itemName}>Create a task from this note</Text>
        <Ionicons name={makeTask ? "checkbox" : "square-outline"} size={20} color={makeTask ? c.accent : c.textMuted} />
      </TouchableOpacity>
      {makeTask ? <ICDateField label="Task deadline (optional)" value={due} onChange={setDue} /> : null}
      <ICButton label="Add Note" icon="add" onPress={save} />
    </ICModal>
  );
}

function TaskModal({ visible, task, onClose, id, onDone }: any) {
  const c = useColors();
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [notify, setNotify] = useState(true);
  useEffect(() => { if (visible) { setText(task?.text || ""); setDue(task?.due_date || ""); setNotify(task?.notify ?? true); } }, [visible, task]);
  const save = async () => {
    if (!text.trim()) return;
    if (task) await insuranceApi.patchTask(id, task.id, { text, due_date: due, notify });
    else await insuranceApi.addTask(id, { text, due_date: due, notify });
    onDone();
  };
  return (
    <ICModal visible={visible} onClose={onClose} title={task ? "Edit Task" : "Add Task"}>
      <ICField label="Task" value={text} onChangeText={setText} multiline />
      <ICDateField label="Deadline (optional)" value={due} onChange={setDue} />
      <TouchableOpacity style={styles.toggleRow} onPress={() => setNotify((v) => !v)}>
        <Text style={styles.itemName}>Remind me before the deadline</Text>
        <Ionicons name={notify ? "checkbox" : "square-outline"} size={20} color={notify ? c.accent : c.textMuted} />
      </TouchableOpacity>
      <ICButton label={task ? "Save Task" : "Add Task"} icon="checkmark" onPress={save} />
    </ICModal>
  );
}

function ContactModal({ visible, contact, onClose, id, onDone }: any) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => { if (visible) { setName(contact?.name || ""); setRole(contact?.role || ""); setPhone(contact?.phone || ""); setEmail(contact?.email || ""); setAddress(contact?.address || ""); setNote(contact?.note || ""); } }, [visible, contact]);
  const save = async () => {
    if (!name.trim()) return;
    const data = { name, role, phone, email, address, note };
    if (contact) await insuranceApi.patchContact(id, contact.id, data);
    else await insuranceApi.addContact(id, data);
    onDone();
  };
  return (
    <ICModal visible={visible} onClose={onClose} title={contact ? "Edit Contact" : "Add Contact"}>
      <ICField label="Name" value={name} onChangeText={setName} />
      <ICField label="Role" value={role} onChangeText={setRole} placeholder="Adjuster, Officer, Firefighter…" />
      <ICField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <ICField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <ICField label="Address" value={address} onChangeText={setAddress} />
      <ICField label="Note" value={note} onChangeText={setNote} multiline />
      <ICButton label={contact ? "Save Contact" : "Add Contact"} icon="checkmark" onPress={save} />
    </ICModal>
  );
}

function DocumentModal({ visible, onClose, id, onDone }: any) {
  const c = useColors();
  const [picked, setPicked] = useState<any>(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setPicked(null); setLabel(""); setNote(""); setDate(""); } }, [visible]);
  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/*"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setPicked(a); if (!label) setLabel(a.name || "");
  };
  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow photo access to attach a photo."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setPicked({ uri: a.uri, name: a.fileName || `photo-${Date.now()}.jpg`, mimeType: a.mimeType || "image/jpeg" });
    if (!label) setLabel(a.fileName || "Photo");
  };
  const takeDocPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow camera access to capture a photo."); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setPicked({ uri: a.uri, name: `photo-${Date.now()}.jpg`, mimeType: "image/jpeg" });
    if (!label) setLabel("Photo");
  };
  const save = async () => {
    if (!picked) { Alert.alert("Pick a file first"); return; }
    setBusy(true);
    try {
      const mime = picked.mimeType || "application/octet-stream";
      const data = await uriToDataUri(picked.uri, mime);
      await insuranceApi.addDocument(id, { filename: picked.name || `doc-${Date.now()}`, mime, data_b64: data, label, note, date });
      onDone();
    } catch (e: any) { Alert.alert("Upload failed", e?.message || ""); } finally { setBusy(false); }
  };
  return (
    <ICModal visible={visible} onClose={onClose} title="Add Document">
      <View style={styles.docSrcRow}>
        <TouchableOpacity style={styles.docSrcBtn} onPress={pick}>
          <Ionicons name="document-outline" size={20} color={c.accent} /><Text style={styles.docSrcText}>File</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.docSrcBtn} onPress={pickPhoto}>
          <Ionicons name="image-outline" size={20} color={c.accent} /><Text style={styles.docSrcText}>Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.docSrcBtn} onPress={takeDocPhoto}>
          <Ionicons name="camera-outline" size={20} color={c.accent} /><Text style={styles.docSrcText}>Camera</Text>
        </TouchableOpacity>
      </View>
      {picked ? (
        <View style={styles.pickedRow}>
          <Ionicons name="checkmark-circle" size={16} color={c.success} />
          <Text style={styles.pickText} numberOfLines={1}>{picked.name || "Selected file"}</Text>
        </View>
      ) : null}
      <View style={{ height: 12 }} />
      <ICField label="Label" value={label} onChangeText={setLabel} placeholder="e.g. Police Report" />
      <ICDateField label="Date (optional)" value={date} onChange={setDate} />
      <ICField label="Note (optional)" value={note} onChangeText={setNote} multiline />
      <ICButton label={busy ? "Uploading…" : "Add Document"} icon="add" onPress={save} disabled={busy} />
    </ICModal>
  );
}

function ItemEditModal({ item, spec, id, onClose, onDone }: any) {
  const [pre, setPre] = useState("Good");
  const [post, setPost] = useState("Unknown");
  const [claimed, setClaimed] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => { if (item) { setPre(item.pre_loss_condition || "Good"); setPost(item.post_loss_condition || "Unknown"); setClaimed(String(item.line_claimed ?? "")); setNotes(item.item_notes || ""); } }, [item]);
  if (!item) return null;
  const save = async () => {
    await insuranceApi.patchItem(id, item.tool_id, { pre_loss_condition: pre, post_loss_condition: post, claimed_value: claimed === "" ? null : parseFloat(claimed) || 0, item_notes: notes });
    onDone();
  };
  return (
    <ICModal visible={!!item} onClose={onClose} title={item.name}>
      <ICSelect label="Pre-Loss Condition" value={pre} options={spec?.pre_loss_conditions || []} onSelect={setPre} />
      <ICSelect label="Post-Loss Condition" value={post} options={spec?.post_loss_conditions || []} onSelect={setPost} />
      <ICField label="Claimed Value" value={claimed} onChangeText={setClaimed} keyboardType="decimal-pad" />
      <ICField label="Item Notes" value={notes} onChangeText={setNotes} multiline />
      <ICButton label="Save Item" icon="checkmark" onPress={save} />
    </ICModal>
  );
}

function AttachModal({ visible, onClose, id, attached, onDone }: any) {
  const c = useColors();
  const [tools, setTools] = useState<any[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (visible) { setSel(new Set()); setQ(""); setLoading(true); insuranceApi.listTools().then((t) => setTools(t || [])).catch(() => {}).finally(() => setLoading(false)); }
  }, [visible]);
  const attachedSet = new Set(attached || []);
  const filtered = tools.filter((t) => !attachedSet.has(t.id) && (!q || (t.name || "").toLowerCase().includes(q.toLowerCase()) || (t.brand || "").toLowerCase().includes(q.toLowerCase())));
  const toggle = (tid: string) => setSel((s) => { const n = new Set(s); n.has(tid) ? n.delete(tid) : n.add(tid); return n; });
  const add = async () => { if (sel.size === 0) return; await insuranceApi.attachItems(id, Array.from(sel)); onDone(); };
  return (
    <ICModal visible={visible} onClose={onClose} title="Attach Inventory" footer={
      <>
        <View style={{ flex: 1 }}><ICButton label="Cancel" variant="ghost" onPress={onClose} /></View>
        <View style={{ flex: 1 }}><ICButton label={`Add ${sel.size || ""}`.trim()} icon="add" onPress={add} disabled={sel.size === 0} /></View>
      </>
    }>
      <View style={styles.searchRowModal}>
        <Ionicons name="search" size={16} color={c.textMuted} style={{ marginRight: 6 }} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search items…" placeholderTextColor={c.textMuted} style={{ flex: 1, color: c.textPrimary }} />
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginVertical: 8 }}>
        <TouchableOpacity onPress={() => setSel(new Set(filtered.map((t) => t.id)))}><Text style={styles.link}>Select Visible</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setSel(new Set())}><Text style={styles.muted}>Clear</Text></TouchableOpacity>
        <Text style={[styles.muted, { marginLeft: "auto" }]}>{sel.size} selected</Text>
      </View>
      {loading ? <ActivityIndicator color={c.accent} /> :
        filtered.length === 0 ? <Text style={styles.muted}>No more items to attach.</Text> :
          filtered.slice(0, 300).map((t) => (
            <TouchableOpacity key={t.id} style={styles.toolRow} onPress={() => toggle(t.id)}>
              <Ionicons name={sel.has(t.id) ? "checkbox" : "square-outline"} size={20} color={sel.has(t.id) ? c.accent : c.textMuted} />
              {t.photos?.[0] ? <AppImage source={{ uri: t.photos[0] }} style={styles.toolThumb} /> : <View style={[styles.toolThumb, { backgroundColor: c.surfaceAlt }]} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{t.name}</Text>
                <Text style={styles.muted} numberOfLines={1}>{[t.brand, t.cost ? money(t.cost) : null].filter(Boolean).join(" · ")}</Text>
              </View>
            </TouchableOpacity>
          ))}
      <View style={{ height: 10 }} />
      <ICButton label={`Add ${sel.size || ""} Selected`} icon="add" onPress={add} disabled={sel.size === 0} />
    </ICModal>
  );
}

const TOGGLES: [string, string][] = [
  ["include_items", "Itemized assets"], ["include_financials", "Financial totals"],
  ["include_photos", "Item photos"], ["include_receipts", "Receipts"],
  ["include_notes", "Notes"], ["include_timeline", "Timeline"],
  ["include_evidence", "Claim evidence"], ["include_insurance", "Insurance info"],
  ["include_incident", "Incident description"],
];
const ITEM_COLUMNS: [string, string][] = [
  ["brand", "Brand"], ["serial_model", "Serial / Model"], ["qty", "Qty"],
  ["condition", "Condition"], ["purchase_date", "Purchase Date"], ["category", "Category"],
  ["location", "Location"], ["cost", "Cost (purchase)"], ["replacement", "Replacement value"],
  ["claimed", "Claimed value"],
];
const DEFAULT_ITEM_COLUMNS = ["brand", "serial_model", "qty", "condition", "claimed"];
const ONE_TAP_DEFAULT_COLS = ["brand", "serial_model", "qty", "claimed"];

function ReportModal({ visible, onClose, id, onDone }: any) {
  const c = useColors();
  const [kind, setKind] = useState<"quick" | "detailed">("detailed");
  const [opts, setOpts] = useState<any>({});
  const [cols, setCols] = useState<string[]>(DEFAULT_ITEM_COLUMNS);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setKind("detailed"); setOpts({}); setCols(DEFAULT_ITEM_COLUMNS); } }, [visible]);
  const val = (k: string) => opts[k] !== false;
  const toggleCol = (k: string) => setCols((cur) => cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
  const generate = async () => {
    setBusy(true);
    try { await renderAndViewClaimReport(id, { kind, ...TOGGLES.reduce((a, [k]) => ({ ...a, [k]: val(k) }), {}), item_columns: cols.length ? cols : DEFAULT_ITEM_COLUMNS }); onDone(); }
    catch (e: any) { Alert.alert("Report failed", e?.message || ""); } finally { setBusy(false); }
  };
  return (
    <ICModal visible={visible} onClose={onClose} title="Generate Report">
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
        {(["quick", "detailed"] as const).map((k) => (
          <TouchableOpacity key={k} onPress={() => setKind(k)} style={[styles.kindChip, kind === k && { backgroundColor: c.accent, borderColor: c.accent }]}>
            <Text style={[styles.kindText, kind === k && { color: c.textOnAccent }]}>{k === "quick" ? "Quick" : "Detailed"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.muted}>Include in report:</Text>
      {TOGGLES.map(([k, label]) => (
        <TouchableOpacity key={k} style={styles.toggleRow} onPress={() => setOpts((o: any) => ({ ...o, [k]: !val(k) }))}>
          <Text style={styles.itemName}>{label}</Text>
          <Ionicons name={val(k) ? "checkbox" : "square-outline"} size={20} color={val(k) ? c.accent : c.textMuted} />
        </TouchableOpacity>
      ))}
      {val("include_items") && (
        <>
          <Text style={[styles.muted, { marginTop: 14 }]}>Itemized asset columns (Item name always shown):</Text>
          {ITEM_COLUMNS.map(([k, label]) => {
            const on = cols.includes(k);
            return (
              <TouchableOpacity key={k} style={styles.toggleRow} onPress={() => toggleCol(k)}>
                <Text style={styles.itemName}>{label}</Text>
                <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? c.accent : c.textMuted} />
              </TouchableOpacity>
            );
          })}
        </>
      )}
      <View style={{ height: 10 }} />
      <ICButton label={busy ? "Generating…" : "Generate & View"} icon="document-text" onPress={generate} disabled={busy} />
    </ICModal>
  );
}

function EmailModal({ visible, onClose, id, ins, report, prefill, onDone }: any) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setTo(ins?.agent_email || ins?.adjuster_email || ""); setSubject(prefill?.subject || ""); setBody(prefill?.body || ""); } }, [visible]);
  const send = async () => {
    if (!to.trim() || !report) { Alert.alert("Recipient required", "Enter an email address."); return; }
    setBusy(true);
    try { await insuranceApi.emailReport(id, report.id, { to, subject, body }); Alert.alert("Sent", `Report emailed to ${to}.`); onDone(); }
    catch (e: any) { Alert.alert("Email failed", e?.message || ""); } finally { setBusy(false); }
  };
  const quick = (email?: string) => email && setTo(email);
  return (
    <ICModal visible={visible} onClose={onClose} title={`Email Report v${report?.version ?? ""}`}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {ins?.agent_email ? <TouchableOpacity onPress={() => quick(ins.agent_email)} style={styles.kindChip}><Text style={styles.kindText}>Agent</Text></TouchableOpacity> : null}
        {ins?.adjuster_email ? <TouchableOpacity onPress={() => quick(ins.adjuster_email)} style={styles.kindChip}><Text style={styles.kindText}>Adjuster</Text></TouchableOpacity> : null}
      </View>
      <ICField label="To" value={to} onChangeText={setTo} keyboardType="email-address" autoCapitalize="none" />
      <ICField label="Subject (optional)" value={subject} onChangeText={setSubject} />
      <ICField label="Message (optional)" value={body} onChangeText={setBody} multiline />
      <ICButton label={busy ? "Sending…" : "Send Email"} icon="send" onPress={send} disabled={busy} />
    </ICModal>
  );
}

const styles = themedStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg },
  link: { color: c.accent, fontWeight: "800", fontSize: 13 },
  muted: { color: c.textSecondary, fontSize: 12 },

  progressWrap: { paddingHorizontal: 18, paddingTop: 2, paddingBottom: 6 },
  progressLabel: { color: c.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginBottom: 2 },

  // header facts
  factsGrid: { flexDirection: "row", paddingHorizontal: 14, gap: 12 },
  factCol: { flex: 1, gap: 6 },
  fact: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  factLabel: { color: c.textMuted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  factValue: { color: c.textPrimary, fontSize: 12, fontWeight: "800", maxWidth: "58%", textAlign: "right" },
  factValueAccent: { color: c.accent },
  tasksLink: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  tasksLinkText: { color: c.accent, fontWeight: "800", fontSize: 13 },
  tasksBadge: { minWidth: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: c.accent, alignItems: "center" },
  tasksBadgeText: { color: c.textOnAccent, fontSize: 10, fontWeight: "900" },

  // tab bar
  tabBar: { paddingHorizontal: 12, gap: 6, paddingVertical: 4 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  tabOn: { borderColor: c.accent, borderWidth: 2, backgroundColor: "transparent" },
  tabText: { color: c.textSecondary, fontSize: 11, fontWeight: "800" },
  tabTextOn: { color: c.accent },

  // panel
  panelOuter: { flex: 1, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 14 },
  panelPlain: { flex: 1, backgroundColor: c.bgSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },

  // search
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, height: 40, marginBottom: 10 },
  searchInput: { flex: 1, color: c.textPrimary, fontSize: 14 },
  searchRowModal: { flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 9, paddingHorizontal: 10, height: 42 },

  // search results
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  resultTag: { backgroundColor: c.surfaceAlt, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  resultTagText: { color: c.accent, fontSize: 9, fontWeight: "900", letterSpacing: 0.3 },
  resultText: { flex: 1, color: c.textPrimary, fontSize: 13 },

  // section
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: c.accent, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  subLabel: { color: c.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginTop: 10, marginBottom: 3 },
  bodyText: { color: c.textPrimary, fontSize: 13, lineHeight: 19 },

  // kv rows
  kvRow: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  kvL: { width: 130, color: c.textMuted, fontSize: 12 },
  kvV: { flex: 1, color: c.textPrimary, fontSize: 13, fontWeight: "600" },

  // financials
  finRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  finL: { color: c.textSecondary, fontSize: 13 },
  finV: { color: c.textPrimary, fontSize: 13, fontWeight: "700" },
  finNet: { borderTopWidth: 2, borderTopColor: c.accent, marginTop: 8, paddingTop: 10, borderBottomWidth: 0 },
  finNetL: { color: c.accent, fontSize: 13, fontWeight: "900" },
  finNetV: { color: c.accent, fontSize: 18, fontWeight: "900" },

  // contacts
  groupHead: { color: c.accent, fontSize: 13, fontWeight: "900", marginTop: 10, marginBottom: 2 },
  contactRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.borderSubtle, gap: 6 },
  roleTag: { color: c.textSecondary, fontSize: 11, fontWeight: "700" },

  // items
  itemsTopBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  itemsCount: { color: c.textPrimary, fontSize: 13, fontWeight: "800" },
  warnBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.warning, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  warnBtnText: { color: "#000", fontSize: 11, fontWeight: "900" },
  okBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  warnRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  itemName: { color: c.textPrimary, fontSize: 14, fontWeight: "700" },
  itemVal: { color: c.textPrimary, fontSize: 14, fontWeight: "800" },

  // evidence
  evGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  evCell: { width: 80, alignItems: "center" },
  evThumb: { width: 70, height: 70, borderRadius: 8, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  evName: { color: c.textPrimary, fontSize: 10, fontWeight: "700", marginTop: 3 },
  evDate: { color: c.textMuted, fontSize: 9 },
  evDel: { position: "absolute", top: -6, right: 6 },

  // documents
  docRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },

  // notes
  noteRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.borderSubtle, paddingRight: 20 },
  noteMeta: { color: c.textMuted, fontSize: 11, fontWeight: "700" },
  noteText: { color: c.textPrimary, fontSize: 13, marginTop: 2 },
  noteRowWrap: { flexDirection: "row", alignItems: "stretch", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  noteStripe: { width: 4, borderRadius: 2, marginRight: 10 },
  noteBody: { flex: 1 },
  docSrcRow: { flexDirection: "row", gap: 10 },
  docSrcBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 14, borderRadius: 10, borderWidth: 1.4, borderStyle: "dashed", borderColor: c.accent, backgroundColor: c.surface },
  docSrcText: { color: c.accent, fontSize: 12, fontWeight: "800" },
  pickedRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },

  // tasks
  taskRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  taskText: { color: c.textPrimary, fontSize: 14, fontWeight: "600" },
  taskDone: { textDecorationLine: "line-through", color: c.textMuted },

  // reports
  reportOptRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  reportOptBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10, borderWidth: 1.4, borderColor: c.accent, backgroundColor: c.surface },
  reportOptText: { color: c.accent, fontWeight: "800", fontSize: 12 },
  repRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  repBtn: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1.2, borderColor: c.accent, backgroundColor: c.surface },

  // timeline
  tlRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 7 },
  tlIcon: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.4, alignItems: "center", justifyContent: "center" },
  tlType: { color: c.textPrimary, fontSize: 13, fontWeight: "600" },

  // misc
  toolRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  toolThumb: { width: 38, height: 38, borderRadius: 6 },
  kindChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  kindText: { color: c.textSecondary, fontWeight: "800", fontSize: 13 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  pickBtn: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 10, borderWidth: 1.4, borderStyle: "dashed", borderColor: c.accent, backgroundColor: c.surface },
  pickText: { color: c.textPrimary, fontSize: 13, fontWeight: "600", flex: 1 },
  addMenuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  addMenuText: { color: c.textPrimary, fontSize: 15, fontWeight: "700" },
}));
