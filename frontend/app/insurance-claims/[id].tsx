import { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Image,
  TextInput, Platform, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { themedStyles, useColors } from "../../src/themeContext";
import { ICSection, ICField, ICSelect, ICButton, ICModal } from "../../src/components/insurance/ICKit";
import { insuranceApi, ClaimSpec } from "../../src/insuranceApi";
import { renderAndViewClaimReport, viewStoredClaimReport, shareStoredClaimReport, renderClaimReportOnly } from "../../src/insuranceReport";

const money = (n: number) => "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s?: string) => { if (!s) return ""; const d = new Date(s); return isNaN(+d) ? s : d.toLocaleString(); };

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

export default function ClaimDetail() {
  const router = useRouter();
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [claim, setClaim] = useState<any>(null);
  const [spec, setSpec] = useState<ClaimSpec | null>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // modal state
  const [attachOpen, setAttachOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailPrefill, setEmailPrefill] = useState<{ subject?: string; body?: string } | null>(null);
  const [oneTapBusy, setOneTapBusy] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [selReport, setSelReport] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [cl, ev, rep] = await Promise.all([
        insuranceApi.get(id), insuranceApi.listEvidence(id), insuranceApi.listReports(id),
      ]);
      setClaim(cl); setEvidence(ev); setReports(rep);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not load claim.");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { insuranceApi.spec().then(setSpec).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const fin = claim?._financials || {};
  const items = claim?._resolved_items || [];
  const ins = claim?.insurance || {};

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

  // One-tap: silently generate a fresh DETAILED report, then open the email
  // composer pre-filled with the saved agent/adjuster + a polished template.
  const oneTapEmailInsurer = async () => {
    setOneTapBusy(true);
    try {
      const f = await renderClaimReportOnly(id, {
        kind: "detailed",
        ...TOGGLES.reduce((a, [k]) => ({ ...a, [k]: true }), {}),
      });
      await load();
      const recipientName = ins.agent_name || ins.adjuster_name || "";
      const claimNo = claim.claim_number ? ` (Claim #${claim.claim_number})` : "";
      const subject = `Insurance Claim — ${claim.title}${claimNo}`;
      const body =
        `Hello${recipientName ? ` ${recipientName}` : ""},\n\n` +
        `Please find attached the detailed insurance claim report for "${claim.title}".\n\n` +
        `Policy #: ${ins.policy_number || "—"}\n` +
        `Claim #: ${claim.claim_number || "—"}\n` +
        `Claim Type: ${claim.claim_type || "—"}\n` +
        `Date of Loss: ${claim.date_of_loss || "—"}\n` +
        `Net Claimed: ${money(fin.net_claimed || 0)}\n\n` +
        `Please let me know if any additional documentation is needed.\n\nThank you.`;
      setSelReport({ id: f.reportId, version: f.version, kind: "detailed" });
      setEmailPrefill({ subject, body });
      setEmailOpen(true);
    } catch (e: any) {
      Alert.alert("Could not prepare email", e?.message || "");
    } finally {
      setOneTapBusy(false);
    }
  };

  const addPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow photo access to attach evidence."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const mime = a.mimeType || "image/jpeg";
    const data = a.base64 ? `data:${mime};base64,${a.base64}` : await uriToDataUri(a.uri, mime);
    setBusy(true);
    try {
      await insuranceApi.addEvidence(id, { filename: a.fileName || `photo-${Date.now()}.jpg`, mime, kind: "Damage Photo", data_b64: data });
      load();
    } catch (e: any) { Alert.alert("Upload failed", e?.message || ""); } finally { setBusy(false); }
  };

  const addDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const mime = a.mimeType || "application/octet-stream";
    setBusy(true);
    try {
      const data = await uriToDataUri(a.uri, mime);
      await insuranceApi.addEvidence(id, { filename: a.name || `doc-${Date.now()}`, mime, kind: mime.includes("pdf") ? "Document" : "Insurance Document", data_b64: data });
      load();
    } catch (e: any) { Alert.alert("Upload failed", e?.message || ""); } finally { setBusy(false); }
  };

  if (loading || !claim) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={c.accent} style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="icd-back" onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={24} color={c.textPrimary} /></TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{claim.title}</Text>
        <TouchableOpacity testID="icd-more" onPress={moreMenu} style={styles.iconBtn}><Ionicons name="ellipsis-horizontal" size={22} color={c.textPrimary} /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={c.accent} />}>
        {/* Status */}
        <ICSection title="Status" right={<TouchableOpacity testID="icd-change-status" onPress={() => setStatusOpen(true)}><Text style={styles.link}>Change</Text></TouchableOpacity>}>
          <View style={styles.statusRow}>
            <View style={[styles.badge, { borderColor: c.accent }]}><Text style={[styles.badgeText, { color: c.accent }]}>{claim.status}</Text></View>
            {claim.archived ? <Text style={styles.muted}>· Archived</Text> : null}
          </View>
          <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
            <View><Text style={styles.miniLabel}>APPROVED</Text><Text style={styles.miniVal}>{money(claim.approved_value)}</Text></View>
            <View><Text style={styles.miniLabel}>PAID</Text><Text style={styles.miniVal}>{money(claim.paid_value)}</Text></View>
          </View>
        </ICSection>

        {/* Financials */}
        <ICSection title="Claim Totals">
          {[["Total Purchase", fin.total_purchase], ["Total Replacement", fin.total_replacement], ["Total Claimed", fin.total_claimed]].map(([l, v]) => (
            <View key={l as string} style={styles.finRow}><Text style={styles.finL}>{l}</Text><Text style={styles.finV}>{money(v as number)}</Text></View>
          ))}
          {fin.sales_tax ? <View style={styles.finRow}><Text style={styles.finL}>Sales Tax</Text><Text style={styles.finV}>{money(fin.sales_tax)}</Text></View> : null}
          {fin.deductible ? <View style={styles.finRow}><Text style={styles.finL}>Deductible</Text><Text style={styles.finV}>−{money(fin.deductible)}</Text></View> : null}
          {fin.depreciation ? <View style={styles.finRow}><Text style={styles.finL}>Depreciation</Text><Text style={styles.finV}>−{money(fin.depreciation)}</Text></View> : null}
          <View style={[styles.finRow, styles.finNet]}><Text style={styles.finNetL}>NET CLAIMED</Text><Text style={styles.finNetV}>{money(fin.net_claimed)}</Text></View>
        </ICSection>

        {/* Insurance */}
        <ICSection title="Insurance & Policy" right={<TouchableOpacity onPress={() => router.push(`/insurance-claims/new?id=${id}` as any)}><Ionicons name="create-outline" size={18} color={c.accent} /></TouchableOpacity>}>
          {[["Company", ins.company], ["Policy #", ins.policy_number], ["Agent", ins.agent_name], ["Agent Phone", ins.agent_phone], ["Agent Email", ins.agent_email], ["Adjuster", ins.adjuster_name], ["Adjuster Phone", ins.adjuster_phone], ["Adjuster Email", ins.adjuster_email], ["Portal", ins.portal_url], ["Claim Type", claim.claim_type], ["Date of Loss", claim.date_of_loss], ["Loss Location", claim.loss_location]].filter(([, v]) => v).map(([l, v]) => (
            <View key={l as string} style={styles.kvRow}><Text style={styles.kvL}>{l}</Text><Text style={styles.kvV}>{String(v)}</Text></View>
          ))}
          {claim.description ? <Text style={[styles.muted, { marginTop: 8 }]}>{claim.description}</Text> : null}
        </ICSection>

        {/* Items */}
        <ICSection title={`Attached Items (${items.length})`} right={<TouchableOpacity testID="icd-attach" onPress={() => setAttachOpen(true)}><Text style={styles.link}>+ Attach</Text></TouchableOpacity>}>
          {items.length === 0 ? <Text style={styles.muted}>No items attached. Tap “Attach” to add inventory to this claim.</Text> :
            items.map((it: any) => (
              <TouchableOpacity key={it.tool_id} testID={`icd-item-${it.tool_id}`} style={styles.itemRow} onPress={() => setEditItem(it)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>{it.name}{it.missing_tool ? " (removed)" : ""}</Text>
                  <Text style={styles.muted} numberOfLines={1}>{[it.brand, it.pre_loss_condition && `${it.pre_loss_condition}→${it.post_loss_condition}`].filter(Boolean).join(" · ")}</Text>
                </View>
                <Text style={styles.itemVal}>{money(it.line_claimed)}</Text>
                <TouchableOpacity testID={`icd-remove-${it.tool_id}`} onPress={async () => { await insuranceApi.detachItem(id, it.tool_id); load(); }} style={{ paddingLeft: 10 }}>
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
        </ICSection>

        {/* Evidence */}
        <ICSection title={`Claim Evidence (${evidence.length})`} right={
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity testID="icd-add-photo" onPress={addPhoto}><Ionicons name="image-outline" size={18} color={c.accent} /></TouchableOpacity>
            <TouchableOpacity testID="icd-add-doc" onPress={addDocument}><Ionicons name="document-attach-outline" size={18} color={c.accent} /></TouchableOpacity>
          </View>}>
          {busy ? <ActivityIndicator color={c.accent} /> : null}
          {evidence.length === 0 ? <Text style={styles.muted}>Add disaster photos, police reports or documents (claim-only).</Text> :
            <View style={styles.evGrid}>
              {evidence.map((e) => (
                <View key={e.id} style={styles.evCell} testID={`icd-ev-${e.id}`}>
                  {(e.mime || "").startsWith("image") ?
                    <View style={styles.evThumb}><Ionicons name="image" size={22} color={c.textMuted} /></View> :
                    <View style={styles.evThumb}><Ionicons name="document-text" size={22} color={c.textMuted} /></View>}
                  <Text style={styles.evName} numberOfLines={1}>{e.kind}</Text>
                  <TouchableOpacity onPress={() => { Alert.alert("Remove evidence?", e.filename, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: async () => { await insuranceApi.deleteEvidence(id, e.id); load(); } }]); }} style={styles.evDel}>
                    <Ionicons name="close-circle" size={18} color={c.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>}
        </ICSection>

        {/* Notes */}
        <ICSection title={`Notes (${(claim.notes || []).length})`} right={<TouchableOpacity testID="icd-add-note" onPress={() => setNoteOpen(true)}><Text style={styles.link}>+ Add</Text></TouchableOpacity>}>
          {(claim.notes || []).length === 0 ? <Text style={styles.muted}>No notes yet.</Text> :
            claim.notes.map((n: any) => (
              <View key={n.id} style={styles.noteRow}>
                <Text style={styles.noteMeta}>{n.category} · {fmtDate(n.created_at)}</Text>
                <Text style={styles.noteText}>{n.text}</Text>
                <TouchableOpacity onPress={async () => { await insuranceApi.deleteNote(id, n.id); load(); }} style={{ position: "absolute", right: 0, top: 6 }}>
                  <Ionicons name="close" size={16} color={c.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
        </ICSection>

        {/* Timeline */}
        <ICSection title="Timeline">
          {(claim.timeline || []).slice().reverse().map((t: any) => (
            <View key={t.id} style={styles.tlRow}>
              <View style={[styles.tlDot, { backgroundColor: c.accent }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.tlType}>{t.type}{t.detail ? `: ${t.detail}` : ""}</Text>
                <Text style={styles.muted}>{fmtDate(t.created_at)}</Text>
              </View>
            </View>
          ))}
        </ICSection>

        {/* Reports */}
        <ICSection title={`Reports (${reports.length})`} right={<TouchableOpacity testID="icd-generate" onPress={() => setReportOpen(true)}><Text style={styles.link}>Generate</Text></TouchableOpacity>}>
          <ICButton
            label={oneTapBusy ? "Preparing report…" : "Email Detailed Report to Insurer"}
            icon="mail"
            onPress={oneTapEmailInsurer}
            disabled={oneTapBusy}
            testID="icd-onetap-email"
          />
          <Text style={[styles.muted, { marginTop: 6, marginBottom: 10 }]}>
            Generates the latest detailed PDF and pre-fills an email to your saved agent / adjuster.
          </Text>
          {reports.length === 0 ? <Text style={styles.muted}>Generate a professional Quick or Detailed PDF report.</Text> :
            reports.map((r) => (
              <View key={r.id} style={styles.repRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{r.kind === "detailed" ? "Detailed" : "Quick"} Report v{r.version}</Text>
                  <Text style={styles.muted}>{fmtDate(r.generated_at)} · {(r.size / 1024).toFixed(0)} KB</Text>
                </View>
                <TouchableOpacity testID={`icd-view-${r.id}`} onPress={() => viewStoredClaimReport(id, r.id).catch((e) => Alert.alert("Error", e.message))} style={styles.repBtn}><Ionicons name="eye-outline" size={18} color={c.accent} /></TouchableOpacity>
                <TouchableOpacity onPress={() => shareStoredClaimReport(id, r.id).catch((e) => Alert.alert("Error", e.message))} style={styles.repBtn}><Ionicons name="share-outline" size={18} color={c.accent} /></TouchableOpacity>
                <TouchableOpacity testID={`icd-email-${r.id}`} onPress={() => { setSelReport(r); setEmailPrefill(null); setEmailOpen(true); }} style={styles.repBtn}><Ionicons name="mail-outline" size={18} color={c.accent} /></TouchableOpacity>
              </View>
            ))}
        </ICSection>
      </ScrollView>

      {/* ---------------- Modals ---------------- */}
      <StatusModal visible={statusOpen} onClose={() => setStatusOpen(false)} spec={spec} claim={claim} onDone={() => { setStatusOpen(false); load(); }} id={id} />
      <AttachModal visible={attachOpen} onClose={() => setAttachOpen(false)} id={id} attached={items.map((i: any) => i.tool_id)} onDone={() => { setAttachOpen(false); load(); }} />
      <NoteModal visible={noteOpen} onClose={() => setNoteOpen(false)} spec={spec} id={id} onDone={() => { setNoteOpen(false); load(); }} />
      <ItemEditModal item={editItem} spec={spec} id={id} onClose={() => setEditItem(null)} onDone={() => { setEditItem(null); load(); }} />
      <ReportModal visible={reportOpen} onClose={() => setReportOpen(false)} id={id} onDone={() => { setReportOpen(false); load(); }} />
      <EmailModal visible={emailOpen} onClose={() => { setEmailOpen(false); setEmailPrefill(null); }} id={id} ins={ins} report={selReport} prefill={emailPrefill} onDone={() => { setEmailOpen(false); setEmailPrefill(null); load(); }} />
    </SafeAreaView>
  );
}

/* ======================= Modals ======================= */

function StatusModal({ visible, onClose, spec, claim, onDone, id }: any) {
  const [status, setStatus] = useState(claim?.status || "Draft");
  const [note, setNote] = useState("");
  const [approved, setApproved] = useState(String(claim?.approved_value ?? ""));
  const [paid, setPaid] = useState(String(claim?.paid_value ?? ""));
  useEffect(() => { if (visible) { setStatus(claim?.status); setApproved(String(claim?.approved_value ?? "")); setPaid(String(claim?.paid_value ?? "")); setNote(""); } }, [visible]);
  const save = async () => {
    await insuranceApi.setStatus(id, { status, note, approved_value: parseFloat(approved) || 0, paid_value: parseFloat(paid) || 0 });
    onDone();
  };
  return (
    <ICModal visible={visible} onClose={onClose} title="Change Status">
      <ICSelect label="Status" value={status} options={spec?.statuses || []} onSelect={setStatus} testID="icd-status-select" />
      <ICField label="Approved Value" value={approved} onChangeText={setApproved} keyboardType="decimal-pad" testID="icd-approved" />
      <ICField label="Paid Value" value={paid} onChangeText={setPaid} keyboardType="decimal-pad" testID="icd-paid" />
      <ICField label="Note (optional)" value={note} onChangeText={setNote} multiline testID="icd-status-note" />
      <ICButton label="Save Status" icon="checkmark" onPress={save} testID="icd-status-save" />
    </ICModal>
  );
}

function NoteModal({ visible, onClose, spec, id, onDone }: any) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("General");
  useEffect(() => { if (visible) { setText(""); setCategory("General"); } }, [visible]);
  const save = async () => { if (!text.trim()) return; await insuranceApi.addNote(id, { text, category }); onDone(); };
  return (
    <ICModal visible={visible} onClose={onClose} title="Add Note">
      <ICSelect label="Category" value={category} options={spec?.note_categories || []} onSelect={setCategory} testID="icd-note-cat" />
      <ICField label="Note" value={text} onChangeText={setText} multiline testID="icd-note-text" />
      <ICButton label="Add Note" icon="add" onPress={save} testID="icd-note-save" />
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
    await insuranceApi.patchItem(id, item.tool_id, {
      pre_loss_condition: pre, post_loss_condition: post,
      claimed_value: claimed === "" ? null : parseFloat(claimed) || 0, item_notes: notes,
    });
    onDone();
  };
  return (
    <ICModal visible={!!item} onClose={onClose} title={item.name}>
      <ICSelect label="Pre-Loss Condition" value={pre} options={spec?.pre_loss_conditions || []} onSelect={setPre} testID="icd-item-pre" />
      <ICSelect label="Post-Loss Condition" value={post} options={spec?.post_loss_conditions || []} onSelect={setPost} testID="icd-item-post" />
      <ICField label="Claimed Value" value={claimed} onChangeText={setClaimed} keyboardType="decimal-pad" testID="icd-item-claimed" />
      <ICField label="Item Notes" value={notes} onChangeText={setNotes} multiline testID="icd-item-notes" />
      <ICButton label="Save Item" icon="checkmark" onPress={save} testID="icd-item-save" />
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
    if (visible) {
      setSel(new Set()); setQ(""); setLoading(true);
      insuranceApi.listTools().then((t) => setTools(t || [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [visible]);
  const attachedSet = new Set(attached || []);
  const filtered = tools.filter((t) => !attachedSet.has(t.id) && (!q || (t.name || "").toLowerCase().includes(q.toLowerCase()) || (t.brand || "").toLowerCase().includes(q.toLowerCase())));
  const toggle = (tid: string) => setSel((s) => { const n = new Set(s); n.has(tid) ? n.delete(tid) : n.add(tid); return n; });
  const add = async () => { if (sel.size === 0) return; await insuranceApi.attachItems(id, Array.from(sel)); onDone(); };
  return (
    <ICModal visible={visible} onClose={onClose} title="Attach Inventory">
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={c.textMuted} style={{ marginRight: 6 }} />
        <TextInput testID="icd-attach-search" value={q} onChangeText={setQ} placeholder="Search items…" placeholderTextColor={c.textMuted} style={{ flex: 1, color: c.textPrimary }} />
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginVertical: 8 }}>
        <TouchableOpacity testID="icd-select-visible" onPress={() => setSel(new Set(filtered.map((t) => t.id)))}><Text style={styles.link}>Select Visible</Text></TouchableOpacity>
        <TouchableOpacity testID="icd-clear-sel" onPress={() => setSel(new Set())}><Text style={styles.muted}>Clear</Text></TouchableOpacity>
        <Text style={[styles.muted, { marginLeft: "auto" }]}>{sel.size} selected</Text>
      </View>
      {loading ? <ActivityIndicator color={c.accent} /> :
        filtered.length === 0 ? <Text style={styles.muted}>No more items to attach.</Text> :
          filtered.slice(0, 300).map((t) => (
            <TouchableOpacity key={t.id} testID={`icd-tool-${t.id}`} style={styles.toolRow} onPress={() => toggle(t.id)}>
              <Ionicons name={sel.has(t.id) ? "checkbox" : "square-outline"} size={20} color={sel.has(t.id) ? c.accent : c.textMuted} />
              {t.photos?.[0] ? <Image source={{ uri: t.photos[0] }} style={styles.toolThumb} /> : <View style={[styles.toolThumb, { backgroundColor: c.surfaceAlt }]} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{t.name}</Text>
                <Text style={styles.muted} numberOfLines={1}>{[t.brand, t.cost ? money(t.cost) : null].filter(Boolean).join(" · ")}</Text>
              </View>
            </TouchableOpacity>
          ))}
      <View style={{ height: 10 }} />
      <ICButton label={`Add ${sel.size || ""} Selected`} icon="add" onPress={add} disabled={sel.size === 0} testID="icd-attach-confirm" />
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

function ReportModal({ visible, onClose, id, onDone }: any) {
  const c = useColors();
  const [kind, setKind] = useState<"quick" | "detailed">("detailed");
  const [opts, setOpts] = useState<any>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setKind("detailed"); setOpts({}); } }, [visible]);
  const val = (k: string) => opts[k] !== false;
  const generate = async () => {
    setBusy(true);
    try {
      await renderAndViewClaimReport(id, { kind, ...TOGGLES.reduce((a, [k]) => ({ ...a, [k]: val(k) }), {}) });
      onDone();
    } catch (e: any) { Alert.alert("Report failed", e?.message || ""); } finally { setBusy(false); }
  };
  return (
    <ICModal visible={visible} onClose={onClose} title="Generate Report">
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
        {(["quick", "detailed"] as const).map((k) => (
          <TouchableOpacity key={k} testID={`icd-kind-${k}`} onPress={() => setKind(k)} style={[styles.kindChip, kind === k && { backgroundColor: c.accent, borderColor: c.accent }]}>
            <Text style={[styles.kindText, kind === k && { color: c.textOnAccent }]}>{k === "quick" ? "Quick" : "Detailed"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.muted}>Include in report:</Text>
      {TOGGLES.map(([k, label]) => (
        <TouchableOpacity key={k} testID={`icd-opt-${k}`} style={styles.toggleRow} onPress={() => setOpts((o: any) => ({ ...o, [k]: !val(k) }))}>
          <Text style={styles.itemName}>{label}</Text>
          <Ionicons name={val(k) ? "checkbox" : "square-outline"} size={20} color={val(k) ? c.accent : c.textMuted} />
        </TouchableOpacity>
      ))}
      <View style={{ height: 10 }} />
      <ICButton label={busy ? "Generating…" : "Generate & View"} icon="document-text" onPress={generate} disabled={busy} testID="icd-report-go" />
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
      <ICField label="To" value={to} onChangeText={setTo} keyboardType="email-address" autoCapitalize="none" testID="icd-email-to" />
      <ICField label="Subject (optional)" value={subject} onChangeText={setSubject} testID="icd-email-subject" />
      <ICField label="Message (optional)" value={body} onChangeText={setBody} multiline testID="icd-email-body" />
      <ICButton label={busy ? "Sending…" : "Send Email"} icon="send" onPress={send} disabled={busy} testID="icd-email-send" />
    </ICModal>
  );
}

const styles = themedStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  iconBtn: { padding: 8, minWidth: 40, alignItems: "center" },
  headerTitle: { flex: 1, textAlign: "center", color: c.textPrimary, fontSize: 17, fontWeight: "800" },
  link: { color: c.accent, fontWeight: "800", fontSize: 13 },
  muted: { color: c.textMuted, fontSize: 12 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { borderWidth: 1.4, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: "800" },
  miniLabel: { color: c.textMuted, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  miniVal: { color: c.textPrimary, fontSize: 15, fontWeight: "800" },
  finRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  finL: { color: c.textSecondary, fontSize: 13 },
  finV: { color: c.textPrimary, fontSize: 13, fontWeight: "700" },
  finNet: { borderTopWidth: 1, borderTopColor: c.border, marginTop: 6, paddingTop: 8 },
  finNetL: { color: c.accent, fontSize: 13, fontWeight: "900" },
  finNetV: { color: c.accent, fontSize: 16, fontWeight: "900" },
  kvRow: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  kvL: { width: 110, color: c.textMuted, fontSize: 12 },
  kvV: { flex: 1, color: c.textPrimary, fontSize: 13 },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  itemName: { color: c.textPrimary, fontSize: 14, fontWeight: "700" },
  itemVal: { color: c.textPrimary, fontSize: 14, fontWeight: "800" },
  evGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  evCell: { width: 76, alignItems: "center" },
  evThumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  evName: { color: c.textMuted, fontSize: 10, marginTop: 3 },
  evDel: { position: "absolute", top: -6, right: 4 },
  noteRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.borderSubtle, paddingRight: 20 },
  noteMeta: { color: c.textMuted, fontSize: 11, fontWeight: "700" },
  noteText: { color: c.textPrimary, fontSize: 13, marginTop: 2 },
  tlRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 6 },
  tlDot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  tlType: { color: c.textPrimary, fontSize: 13, fontWeight: "600" },
  repRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  repBtn: { paddingHorizontal: 6 },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 9, paddingHorizontal: 10, height: 42 },
  toolRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  toolThumb: { width: 38, height: 38, borderRadius: 6 },
  kindChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  kindText: { color: c.textSecondary, fontWeight: "800", fontSize: 13 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
}));
