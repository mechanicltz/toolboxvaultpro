import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { confirm } from "../../src/confirm";
import { formatDateTime } from "../../src/dt";

export default function ToolDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tool, setTool] = useState<any>(null);
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [coMode, setCoMode] = useState<"saved" | "free">("saved");
  const [coName, setCoName] = useState("");
  const [coBorrowerId, setCoBorrowerId] = useState<string | null>(null);
  const [coNotes, setCoNotes] = useState("");
  const [photoIdx, setPhotoIdx] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [t, b] = await Promise.all([api.getTool(id), api.listBorrowers()]);
      setTool(t);
      setBorrowers(b);
    } catch {
      Alert.alert("Error", "Tool not found");
      router.back();
    }
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!tool) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: "#fff", padding: 20 }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const doCheckout = async () => {
    const name = coMode === "saved"
      ? borrowers.find((b) => b.id === coBorrowerId)?.name
      : coName.trim();
    if (!name) {
      Alert.alert("Required", "Pick a person or enter a name.");
      return;
    }
    try {
      await api.checkoutTool(tool.id, {
        borrower_name: name,
        borrower_id: coMode === "saved" ? coBorrowerId : null,
        notes: coNotes,
      });
      setShowCheckout(false);
      setCoName("");
      setCoBorrowerId(null);
      setCoNotes("");
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Checkout failed");
    }
  };

  const doCheckin = async () => {
    if (!(await confirm("Check in tool?", `Mark ${tool.name} as returned.`, "Check In"))) return;
    await api.checkinTool(tool.id);
    load();
  };

  const doDelete = async () => {
    if (!(await confirm("Delete tool?", "This cannot be undone.", "Delete", true))) return;
    await api.deleteTool(tool.id);
    router.back();
  };

  const exportPdf = async () => {
    let printWin: Window | null = null;
    if (Platform.OS === "web") {
      printWin = window.open("", "_blank");
      if (!printWin) {
        Alert.alert("Popup blocked", "Please allow popups for this site.");
        return;
      }
      printWin.document.write(
        "<!doctype html><title>Loading...</title><body style='font-family:Helvetica;padding:40px;color:#666'>Generating report...</body>"
      );
    }
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const photoTags = (tool.photos || [])
      .slice(0, 4)
      .map((p: string) => `<img src="${p}" style="width:48%;margin:1%;border:1px solid #ccc"/>`)
      .join("");
    const history = (tool.checkout_history || [])
      .map(
        (h: any) =>
          `<tr><td>${esc(h.borrower_name)}</td><td>${esc((h.checked_out_at || "").substring(0, 10))}</td><td>${esc((h.checked_in_at || "").substring(0, 10))}</td></tr>`
      )
      .join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Helvetica;margin:24px;color:#111}
      h1{font-size:22px;letter-spacing:2px;text-transform:uppercase;border-bottom:3px solid #FFB300;padding-bottom:8px}
      .grid{display:flex;flex-wrap:wrap;margin-top:12px}
      .lab{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:1px}
      .val{font-size:14px;font-weight:700;margin-bottom:8px}
      .col{flex:1;min-width:50%;padding:6px 0}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}
      th{background:#111;color:#FFB300;text-align:left;padding:6px;font-size:10px}
      td{padding:6px;border-bottom:1px solid #eee}
      .status{display:inline-block;padding:4px 10px;font-size:10px;font-weight:700;letter-spacing:1px}
      .out{background:#fee;color:#dc2626}.in{background:#efe;color:#16a34a}
    </style></head><body>
      <h1>${esc(tool.name)}</h1>
      <span class="status ${tool.is_checked_out ? "out" : "in"}">${tool.is_checked_out ? "CHECKED OUT" : "AVAILABLE"}</span>
      <div class="grid">
        <div class="col"><div class="lab">Brand</div><div class="val">${esc(tool.brand) || "—"}</div></div>
        <div class="col"><div class="lab">Model</div><div class="val">${esc(tool.model) || "—"}</div></div>
        <div class="col"><div class="lab">Serial</div><div class="val">${esc(tool.serial_number) || "—"}</div></div>
        <div class="col"><div class="lab">Cost</div><div class="val">$${(tool.cost || 0).toFixed(2)}</div></div>
        <div class="col"><div class="lab">Location</div><div class="val">${esc(tool.location_name) || "—"}</div></div>
        <div class="col"><div class="lab">Condition</div><div class="val">${esc(tool.condition) || "—"}</div></div>
        <div class="col" style="min-width:100%"><div class="lab">Description</div><div class="val" style="font-weight:400">${esc(tool.description) || "—"}</div></div>
        <div class="col" style="min-width:100%"><div class="lab">Tags</div><div class="val" style="font-weight:400">${esc((tool.tag_names || []).join(", ")) || "—"}</div></div>
      </div>
      ${photoTags ? `<h3 style="margin-top:20px">Photos</h3><div style="display:flex;flex-wrap:wrap">${photoTags}</div>` : ""}
      ${history ? `<h3 style="margin-top:20px">Checkout History</h3><table><thead><tr><th>Borrower</th><th>Out</th><th>In</th></tr></thead><tbody>${history}</tbody></table>` : ""}
    </body></html>`;
    try {
      if (Platform.OS === "web") {
        if (!printWin) return;
        const fullHtml = html.replace(
          "</body>",
          "<script>setTimeout(function(){window.print();},600);</script></body>"
        );
        printWin.document.open();
        printWin.document.write(fullHtml);
        printWin.document.close();
        printWin.document.title = tool.name;
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync())
          await Sharing.shareAsync(uri, { mimeType: "application/pdf" });
      }
    } catch (e: any) {
      if (printWin) printWin.close();
      Alert.alert("Error", e.message);
    }
  };

  const photos = tool.photos || [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 18 }}>
          <TouchableOpacity testID="export-pdf-btn" onPress={exportPdf} hitSlop={10}>
            <Ionicons name="document-text-outline" size={24} color={theme.colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="edit-tool-btn"
            onPress={() => router.push({ pathname: "/tool/edit", params: { id: tool.id } })}
            hitSlop={10}
          >
            <Ionicons name="create-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity testID="delete-tool-btn" onPress={doDelete} hitSlop={10}>
            <Ionicons name="trash-outline" size={24} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.heroBox}>
          {photos.length > 0 ? (
            <Image source={{ uri: photos[photoIdx] }} style={styles.heroImg} />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Ionicons name="construct" size={64} color={theme.colors.accent} />
            </View>
          )}
          {photos.length > 1 && (
            <ScrollView
              horizontal
              style={styles.thumbStrip}
              contentContainerStyle={{ gap: 8, padding: 8 }}
            >
              {photos.map((p: string, i: number) => (
                <TouchableOpacity key={i} onPress={() => setPhotoIdx(i)}>
                  <Image
                    source={{ uri: p }}
                    style={[styles.thumbSm, photoIdx === i && styles.thumbActive]}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <View
            style={[
              styles.statusBanner,
              { borderColor: tool.is_checked_out ? theme.colors.accentSecondary : theme.colors.success },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: tool.is_checked_out ? theme.colors.accentSecondary : theme.colors.success },
              ]}
            />
            <View style={{ flex: 1 }}>
              {tool.is_checked_out ? (
                <>
                  <TouchableOpacity
                    testID="banner-borrower-link"
                    onPress={() => {
                      if (tool.current_checkout?.borrower_id)
                        router.push(`/borrower/${tool.current_checkout.borrower_id}`);
                    }}
                    disabled={!tool.current_checkout?.borrower_id}
                  >
                    <Text style={styles.statusText}>
                      OUT WITH {tool.current_checkout?.borrower_name?.toUpperCase()}
                      {tool.current_checkout?.borrower_id ? "  ›" : ""}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.statusSub}>
                    Since {formatDateTime(tool.current_checkout?.checked_out_at)}
                  </Text>
                </>
              ) : (
                <Text style={styles.statusText}>AVAILABLE</Text>
              )}
            </View>
          </View>

          <Text style={styles.title}>{tool.name}</Text>
          {!!tool.description && (
            <Text style={styles.description}>{tool.description}</Text>
          )}

          {(tool.tag_names || []).length > 0 && (
            <View style={styles.tagWrap}>
              {tool.tag_names.map((t: string) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.grid}>
            <Field label="Brand" value={tool.brand} />
            <Field label="Model" value={tool.model} />
            <Field label="Serial #" value={tool.serial_number} />
            <Field label="Cost" value={`$${(tool.cost || 0).toFixed(2)}`} />
            <Field label="Location" value={tool.location_name} />
            <Field label="Condition" value={tool.condition} />
            <Field label="Purchased" value={tool.purchase_date} />
          </View>

          {(tool.documents || []).length > 0 && (
            <>
              <Text style={styles.sectionLabel}>DOCUMENTS</Text>
              {tool.documents.map((d: any, i: number) => (
                <View key={i} style={styles.docRow}>
                  <Ionicons name="document" size={20} color={theme.colors.accent} />
                  <Text style={styles.docName} numberOfLines={1}>{d.name}</Text>
                </View>
              ))}
            </>
          )}

          {(tool.checkout_history || []).length > 0 && (
            <>
              <Text style={styles.sectionLabel}>HISTORY</Text>
              {tool.checkout_history.slice().reverse().map((h: any, i: number) => (
                <TouchableOpacity
                  key={i}
                  testID={`hist-${i}`}
                  style={styles.histRow}
                  onPress={() => h.borrower_id && router.push(`/borrower/${h.borrower_id}`)}
                  disabled={!h.borrower_id}
                  activeOpacity={0.7}
                >
                  <View>
                    <Text style={styles.histName}>
                      {h.borrower_name}
                      {h.borrower_id ? "  ›" : ""}
                    </Text>
                    <Text style={styles.histDate}>
                      Out: {formatDateTime(h.checked_out_at)}
                    </Text>
                    <Text style={styles.histDate}>
                      In:{"  "}{h.checked_in_at ? formatDateTime(h.checked_in_at) : "—"}
                    </Text>
                    {!!h.notes && <Text style={styles.histNotes}>{h.notes}</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        {tool.is_checked_out ? (
          <TouchableOpacity testID="checkin-btn" style={styles.btnSuccess} onPress={doCheckin}>
            <Ionicons name="checkmark" size={22} color="#000" />
            <Text style={styles.btnText}>CHECK IN</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            testID="checkout-btn"
            style={styles.btn}
            onPress={() => setShowCheckout(true)}
          >
            <Ionicons name="log-out-outline" size={22} color="#000" />
            <Text style={styles.btnText}>CHECK OUT</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showCheckout} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>CHECK OUT TOOL</Text>

            <View style={styles.segment}>
              <TouchableOpacity
                testID="seg-saved"
                style={[styles.segBtn, coMode === "saved" && styles.segBtnActive]}
                onPress={() => setCoMode("saved")}
              >
                <Text style={[styles.segText, coMode === "saved" && styles.segTextActive]}>
                  FROM LIST
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="seg-free"
                style={[styles.segBtn, coMode === "free" && styles.segBtnActive]}
                onPress={() => setCoMode("free")}
              >
                <Text style={[styles.segText, coMode === "free" && styles.segTextActive]}>
                  FREE TEXT
                </Text>
              </TouchableOpacity>
            </View>

            {coMode === "saved" ? (
              <ScrollView style={{ maxHeight: 200 }}>
                {borrowers.length === 0 ? (
                  <Text style={{ color: theme.colors.textMuted, marginVertical: 12 }}>
                    No saved people. Switch to free text or add people in the People tab.
                  </Text>
                ) : (
                  borrowers.map((b) => (
                    <TouchableOpacity
                      key={b.id}
                      testID={`pick-borrower-${b.id}`}
                      style={[
                        styles.borrowerPick,
                        coBorrowerId === b.id && styles.borrowerPickActive,
                      ]}
                      onPress={() => setCoBorrowerId(b.id)}
                    >
                      <Text style={styles.borrowerName}>{b.name}</Text>
                      {coBorrowerId === b.id && (
                        <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            ) : (
              <TextInput
                testID="checkout-name-input"
                placeholder="Enter person's name"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={coName}
                onChangeText={setCoName}
              />
            )}

            <TextInput
              testID="checkout-notes-input"
              placeholder="Notes (optional)"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { height: 72 }]}
              value={coNotes}
              onChangeText={setCoNotes}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => setShowCheckout(false)}
              >
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="confirm-checkout-btn" style={styles.btn} onPress={doCheckout}>
                <Text style={styles.btnText}>CHECK OUT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  heroBox: { backgroundColor: theme.colors.bgSecondary, marginBottom: 16 },
  heroImg: { width: "100%", height: 280, resizeMode: "cover" },
  heroPlaceholder: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  thumbStrip: { backgroundColor: theme.colors.bg },
  thumbSm: {
    width: 56,
    height: 56,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  thumbActive: { borderColor: theme.colors.accent, borderWidth: 2 },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: theme.colors.bgSecondary,
    gap: 8,
    marginBottom: 16,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: "#fff", fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  title: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: 1 },
  description: { color: theme.colors.textSecondary, fontSize: 15, marginTop: 8, lineHeight: 22 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 16 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(255,179,0,0.15)",
    borderRadius: 2,
  },
  tagText: { color: theme.colors.accent, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 24, gap: 0 },
  field: {
    width: "50%",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  fieldValue: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 4 },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "800",
    marginTop: 28,
    marginBottom: 12,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  docName: { color: "#fff", flex: 1, fontSize: 14 },
  histRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  histName: { color: "#fff", fontWeight: "700", fontSize: 14 },
  histDate: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  histNotes: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4, fontStyle: "italic" },
  consumableBox: {
    marginTop: 16, padding: 12, borderWidth: 1,
    borderColor: theme.colors.accent, backgroundColor: "rgba(255,179,0,0.08)", borderRadius: 4,
  },
  warrantyBox: {
    marginTop: 12, padding: 12, borderWidth: 1,
    borderColor: theme.colors.success, backgroundColor: "rgba(34,197,94,0.06)", borderRadius: 4,
  },
  consumableHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  consumableTitle: { color: theme.colors.accent, fontWeight: "900", letterSpacing: 1.5, fontSize: 12 },
  consumableLine: { color: "#fff", fontSize: 13, marginTop: 2 },
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: theme.colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  btn: {
    flexDirection: "row",
    backgroundColor: theme.colors.accent,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    gap: 8,
  },
  btnSuccess: {
    flexDirection: "row",
    backgroundColor: theme.colors.success,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    gap: 8,
  },
  btnText: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 20,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 16,
  },
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 14,
    borderRadius: 4,
    overflow: "hidden",
  },
  segBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  segBtnActive: { backgroundColor: theme.colors.accent },
  segText: { color: theme.colors.textSecondary, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  segTextActive: { color: "#000" },
  borrowerPick: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 6,
    borderRadius: 4,
  },
  borrowerPickActive: { borderColor: theme.colors.accent, backgroundColor: "rgba(255,179,0,0.1)" },
  borrowerName: { color: "#fff", fontWeight: "600", fontSize: 14 },
  input: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 48,
    borderRadius: 4,
    marginBottom: 10,
    fontSize: 15,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  btnGhostText: { color: "#fff", fontWeight: "800", letterSpacing: 2, fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 20,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 16,
  },
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 14,
    borderRadius: 4,
    overflow: "hidden",
  },
  segBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  segBtnActive: { backgroundColor: theme.colors.accent },
  segText: { color: theme.colors.textSecondary, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  segTextActive: { color: "#000" },
  borrowerPick: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 6,
    borderRadius: 4,
  },
  borrowerPickActive: { borderColor: theme.colors.accent, backgroundColor: "rgba(255,179,0,0.1)" },
  borrowerName: { color: "#fff", fontWeight: "600", fontSize: 14 },
  input: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 48,
    borderRadius: 4,
    marginBottom: 10,
    fontSize: 15,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  btnGhostText: { color: "#fff", fontWeight: "800", letterSpacing: 2, fontSize: 14 },
});
