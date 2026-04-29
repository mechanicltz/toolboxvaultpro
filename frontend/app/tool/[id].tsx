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
  Linking,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { confirm } from "../../src/confirm";
import { formatDateTime } from "../../src/dt";
import { formatDateUS } from "../../src/dateUtil";
import { DateField } from "../../src/DateField";
import {
  LostStatusBanner,
  ReportLostButton,
} from "../../src/sections/LostStatusSection";
import { DocumentsSection } from "../../src/sections/DocumentsSection";
import { MaintenanceSection } from "../../src/sections/MaintenanceSection";
import { ClaimsHistorySection } from "../../src/sections/ClaimsHistorySection";
import { WarrantySection } from "../../src/sections/WarrantySection";

export default function ToolDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tool, setTool] = useState<any>(null);
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [dealers, setDealers] = useState<any[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [coMode, setCoMode] = useState<"saved" | "free">("saved");
  const [coName, setCoName] = useState("");
  const [coBorrowerId, setCoBorrowerId] = useState<string | null>(null);
  const [coNotes, setCoNotes] = useState("");
  const [photoIdx, setPhotoIdx] = useState(0);

  // Repair modal
  const todayStr = () => new Date().toISOString().substring(0, 10);
  const [showRepair, setShowRepair] = useState(false);
  const [showMarkSold, setShowMarkSold] = useState(false);
  const [showSoldDelete, setShowSoldDelete] = useState(false);
  const [markSoldForm, setMarkSoldForm] = useState({
    sold_price: "",
    sold_to: "",
    sold_at: new Date().toISOString().substring(0, 10),
    sold_notes: "",
  });
  const [markSoldBusy, setMarkSoldBusy] = useState(false);
  const [repairForm, setRepairForm] = useState({
    company_notified: "",
    notified_at: "",
    expected_completion: "",
    repair_status: "Not Reported",
    contact: "",
    notes: "",
    broken_photo: "",
  });

  const pickBrokenPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
      });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        const data =
          a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
        setRepairForm((f) => ({ ...f, broken_photo: data }));
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not pick photo");
    }
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [t, b, d] = await Promise.all([
        api.getTool(id),
        api.listBorrowers(),
        api.listDealers(),
      ]);
      setTool(t);
      setBorrowers(b);
      setDealers(d || []);
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
        <Text style={{ color: theme.colors.textPrimary, padding: 20 }}>Loading...</Text>
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
    try {
      await api.checkinTool(tool.id);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Check in failed");
    }
  };

  const doDelete = async () => {
    if (!(await confirm("Delete tool?", "This cannot be undone.", "Delete", true))) return;
    await api.deleteTool(tool.id);
    router.back();
  };

  const notifyDealer = async (t: any, mode: "email" | "sms") => {
    try {
      const dealers = await api.listDealers();
      const dealer = dealers.find((d: any) => d.id === t.dealer_id);
      if (!dealer) {
        const ok = await confirm(
          "No dealer assigned",
          "This tool has no dealer. Add a dealer to send a repair / warranty request.",
          "Open Dealers"
        );
        if (ok) router.push("/dealers");
        return;
      }
      const agent = dealer?.agents?.find((a: any) => a.id === dealer?.current_agent_id);
      const phone = (agent?.phone || dealer?.phone || "").replace(/[^\d+]/g, "");
      const email = (agent?.email || "").trim();

      // Prompt to add contact info if missing
      if ((mode === "email" && !email) || (mode === "sms" && !phone)) {
        const target = mode === "email" ? "email address" : "phone number";
        const ok = await confirm(
          `No ${target} on file`,
          `${dealer.name} doesn't have a${mode === "email" ? "n " : " "}${target} for the current agent.\n\nWould you like to open the dealer page to add it?`,
          "Open Dealer"
        );
        if (ok) router.push(`/dealer/${dealer.id}`);
        return;
      }

      // Exact template requested
      const greetName = agent?.name || dealer.name;
      const lines = [
        `Hello ${greetName}, I have a repair/warranty tool.`,
        `Tool: ${t.name}`,
        `Serial Number: ${t.serial_number || "N/A"}`,
        `Purchase date: ${formatDateUS(t.purchase_date) || "N/A"}`,
      ];
      if (t.repair_info?.broken_photo) {
        lines.push(`(A photo of the broken item is available.)`);
      }
      const subject = encodeURIComponent(`Repair / Warranty: ${t.name}`);
      const body = encodeURIComponent(lines.join("\n"));

      let url = "";
      if (mode === "email") {
        url = `mailto:${email}?subject=${subject}&body=${body}`;
      } else {
        url = `sms:${phone}?body=${body}`;
      }
      if (Platform.OS === "web") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).window.location.href = url;
      } else {
        await Linking.openURL(url);
      }
      // Auto-mark as Reported once notified
      const cur = t.repair_info?.repair_status || "Not Reported";
      if (cur === "Not Reported") {
        await api.updateTool(t.id, {
          repair_info: {
            ...(t.repair_info || {}),
            company_notified: dealer?.name || "",
            contact: agent?.name || "",
            notified_at: new Date().toISOString().substring(0, 10),
            repair_status: "Reported",
          },
        });
        load();
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const openRepair = () => {
    // Auto-fill the repair company from the tool's already-assigned dealer.
    // The repair always goes to the dealer the tool was bought from — this
    // shouldn't be a separate choice inside the repair flow.
    const linkedDealer = dealers.find((d: any) => d.id === tool?.dealer_id);
    const linkedAgent = linkedDealer?.agents?.find(
      (a: any) => a.id === linkedDealer?.current_agent_id,
    );
    const dealerName =
      tool?.repair_info?.company_notified || linkedDealer?.name || "";
    const contact =
      tool?.repair_info?.contact ||
      linkedAgent?.name ||
      linkedAgent?.phone ||
      linkedDealer?.phone ||
      "";
    setRepairForm({
      company_notified: dealerName,
      notified_at: tool.repair_info?.notified_at || todayStr(),
      expected_completion: tool.repair_info?.expected_completion || "",
      repair_status: tool.repair_info?.repair_status || "Not Reported",
      contact,
      notes: tool.repair_info?.notes || "",
      broken_photo: tool.repair_info?.broken_photo || "",
    });
    setShowRepair(true);
  };

  const saveRepair = async () => {
    try {
      await api.updateTool(tool.id, {
        needs_repair: true,
        repair_info: { ...repairForm },
      });
      setShowRepair(false);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not save repair info");
    }
  };

  const markRepaired = async () => {
    try {
      await api.updateTool(tool.id, {
        needs_repair: false,
        repair_info: null,
      });
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not update tool");
    }
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
          `<tr><td>${esc(h.borrower_name)}</td><td>${esc(formatDateUS(h.checked_out_at))}</td><td>${esc(formatDateUS(h.checked_in_at))}</td></tr>`
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
          <Ionicons name="arrow-back" size={26} color={theme.colors.textPrimary} />
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
            <Ionicons name="create-outline" size={24} color={theme.colors.textPrimary} />
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

        <View style={styles.bodyContainer}>
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

          <LostStatusBanner tool={tool} onChange={load} />

          {/* For Sale banner */}
          {tool.for_sale && !tool.is_sold && (
            <View style={styles.saleBanner}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="pricetag" size={22} color="#000" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.saleBannerTitle}>
                    FOR SALE
                  </Text>
                  <Text style={styles.saleBannerPrice}>
                    {`$${(tool.sale_price || 0).toFixed(2)}`}
                    {tool.sale_listed_at ? `  ·  Listed ${formatDateUS(tool.sale_listed_at)}` : ""}
                  </Text>
                  {!!tool.sale_notes && (
                    <Text style={styles.saleBannerNotes}>{tool.sale_notes}</Text>
                  )}
                </View>
                <TouchableOpacity
                  testID="mark-sold-btn"
                  style={styles.markSoldBtn}
                  onPress={() => setShowMarkSold(true)}
                >
                  <Ionicons name="checkmark-circle" size={14} color="#fff" />
                  <Text style={styles.markSoldText}>MARK SOLD</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Sold banner */}
          {tool.is_sold && (
            <View style={[styles.saleBanner, { backgroundColor: "#27AE60" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="checkmark-done-circle" size={22} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.saleBannerTitle, { color: "#fff" }]}>SOLD</Text>
                  <Text style={[styles.saleBannerPrice, { color: "#fff" }]}>
                    {tool.sold_price ? `$${tool.sold_price.toFixed(2)}` : ""}
                    {tool.sold_at ? `  ·  ${formatDateUS(tool.sold_at)}` : ""}
                    {tool.sold_to ? `  ·  to ${tool.sold_to}` : ""}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {tool.needs_repair && (
            <View style={styles.repairBanner}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <Ionicons name="build" size={20} color={theme.colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.repairTitle}>
                    {(tool.repair_info?.repair_status || "Not Reported").toUpperCase()}
                  </Text>
                  {!!tool.repair_info?.company_notified && (
                    <Text style={styles.repairLine}>At: {tool.repair_info.company_notified}</Text>
                  )}
                  {!!tool.repair_info?.notified_at && (
                    <Text style={styles.repairLine}>Notified: {formatDateUS(tool.repair_info.notified_at)}</Text>
                  )}
                  {!!tool.repair_info?.expected_completion && (
                    <Text style={styles.repairLine}>Expected back: {formatDateUS(tool.repair_info.expected_completion)}</Text>
                  )}
                  {!!tool.repair_info?.contact && (
                    <Text style={styles.repairLine}>Contact: {tool.repair_info.contact}</Text>
                  )}
                  {!!tool.repair_info?.notes && (
                    <Text style={[styles.repairLine, { fontStyle: "italic", marginTop: 4 }]}>
                      {tool.repair_info.notes}
                    </Text>
                  )}
                </View>
                <TouchableOpacity testID="edit-repair-btn" onPress={openRepair} hitSlop={10}>
                  <Ionicons name="create-outline" size={18} color={theme.colors.danger} />
                </TouchableOpacity>
              </View>

              {!!tool.repair_info?.broken_photo && (
                <Image
                  source={{ uri: tool.repair_info.broken_photo }}
                  style={styles.brokenPhoto}
                />
              )}

              <View style={styles.notifyRow}>
                <TouchableOpacity
                  testID="notify-email-btn"
                  style={styles.notifyBtn}
                  onPress={() => notifyDealer(tool, "email")}
                >
                  <Ionicons name="mail" size={14} color="#fff" />
                  <Text style={styles.notifyText}>EMAIL DEALER</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="notify-sms-btn"
                  style={styles.notifyBtn}
                  onPress={() => notifyDealer(tool, "sms")}
                >
                  <Ionicons name="chatbubble" size={14} color="#fff" />
                  <Text style={styles.notifyText}>TEXT DEALER</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.infoCard}>
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

            {/* Dealer / Agent — right under the tags */}
            {(!!tool.dealer_name || !!tool.purchased_from_agent_name) && (
              <TouchableOpacity
                testID="detail-dealer-row"
                activeOpacity={tool.dealer_id ? 0.7 : 1}
                onPress={() => {
                  if (tool.dealer_id) router.push(`/dealer/${tool.dealer_id}`);
                }}
                style={styles.detailRow}
              >
                <Ionicons
                  name="briefcase"
                  size={16}
                  color={theme.colors.accent}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailRowLabel}>DEALER</Text>
                  <Text style={styles.detailRowValue}>
                    {tool.dealer_name || "—"}
                    {tool.purchased_from_agent_name
                      ? `  ·  ${tool.purchased_from_agent_name}`
                      : ""}
                  </Text>
                </View>
                {tool.dealer_id && (
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={theme.colors.textMuted}
                  />
                )}
              </TouchableOpacity>
            )}

            {/* Location — right under dealer/agent */}
            {!!tool.location_name && (
              <View style={styles.detailRow}>
                <Ionicons
                  name="location"
                  size={16}
                  color={theme.colors.accent}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailRowLabel}>LOCATION</Text>
                  <Text style={styles.detailRowValue}>{tool.location_name}</Text>
                </View>
              </View>
            )}

            <View style={styles.grid}>
              <Field label="Brand" value={tool.brand} />
              <Field label="Model" value={tool.model} />
              <Field label="Serial #" value={tool.serial_number} />
              <Field label="Cost" value={`$${(tool.cost || 0).toFixed(2)}`} />
              <Field label="Condition" value={tool.condition} />
              <Field label="Purchased" value={formatDateUS(tool.purchase_date)} />
            </View>

            <DocumentsSection tool={tool} onChange={load} />
            <MaintenanceSection tool={tool} onChange={load} />
            <WarrantySection tool={tool} />
            <ClaimsHistorySection toolId={tool.id} />
            <ReportLostButton tool={tool} onChange={load} />

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
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {tool.is_checked_out ? (
            <TouchableOpacity testID="checkin-btn" style={[styles.btnSuccess, { flex: 2 }]} onPress={doCheckin}>
              <Ionicons name="checkmark" size={22} color="#000" />
              <Text style={styles.btnText}>CHECK IN</Text>
            </TouchableOpacity>
          ) : tool.needs_repair ? (
            <TouchableOpacity
              testID="mark-repaired-btn"
              style={[styles.btnSuccess, { flex: 2 }]}
              onPress={markRepaired}
            >
              <Ionicons name="checkmark-circle" size={22} color="#000" />
              <Text style={styles.btnText}>MARK REPAIRED</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="checkout-btn"
              style={[styles.btn, { flex: 2 }]}
              onPress={() => setShowCheckout(true)}
            >
              <Ionicons name="log-out-outline" size={22} color="#000" />
              <Text style={styles.btnText}>CHECK OUT</Text>
            </TouchableOpacity>
          )}

          {!tool.needs_repair && (
            <TouchableOpacity
              testID="mark-broken-btn"
              style={[styles.btnDanger, { flex: 1 }]}
              onPress={openRepair}
            >
              <Ionicons name="build" size={20} color={theme.colors.textPrimary} />
              <Text style={[styles.btnText, { color: theme.colors.textPrimary }]}>BROKEN</Text>
            </TouchableOpacity>
          )}
        </View>
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

      {/* Repair Modal — quick mark-broken / edit repair info */}
      <Modal visible={showRepair} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { borderTopColor: theme.colors.danger, maxHeight: "90%" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Ionicons name="build" size={22} color={theme.colors.danger} />
              <Text style={styles.modalTitle}>
                {tool.needs_repair ? "EDIT REPAIR INFO" : "MARK AS BROKEN"}
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.repairLabel}>STATUS</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {["Not Reported", "Reported", "In Repair", "Awaiting Parts", "Sent in for Repairs", "Repaired"].map((s) => (
                  <TouchableOpacity
                    key={s}
                    testID={`repmod-status-${s}`}
                    style={[
                      styles.repChip,
                      repairForm.repair_status === s && styles.repChipActive,
                    ]}
                    onPress={() => setRepairForm({ ...repairForm, repair_status: s })}
                  >
                    <Text style={[
                      styles.repChipText,
                      repairForm.repair_status === s && styles.repChipTextActive,
                    ]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.repairLabel}>REPAIR COMPANY (DEALER)</Text>
              {(() => {
                const linkedDealer = dealers.find(
                  (d: any) => d.id === tool?.dealer_id,
                );
                const displayName =
                  repairForm.company_notified ||
                  linkedDealer?.name ||
                  "";
                if (!displayName) {
                  return (
                    <View style={styles.dealerLockBox}>
                      <Ionicons
                        name="alert-circle"
                        size={16}
                        color={theme.colors.warning}
                      />
                      <Text style={styles.dealerLockMissing}>
                        No dealer assigned to this tool. Edit the tool to
                        select one.
                      </Text>
                    </View>
                  );
                }
                return (
                  <View style={styles.dealerLockBox}>
                    <Ionicons
                      name="briefcase"
                      size={16}
                      color={theme.colors.accent}
                    />
                    <Text style={styles.dealerLockName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    <Ionicons
                      name="lock-closed"
                      size={13}
                      color={theme.colors.textMuted}
                    />
                  </View>
                );
              })()}

              <Text style={styles.repairLabel}>CONTACT</Text>
              <TextInput
                testID="repmod-contact"
                placeholder="800-555-1234"
                placeholderTextColor={theme.colors.textMuted}
                value={repairForm.contact}
                style={styles.input}
                onChangeText={(v) => setRepairForm({ ...repairForm, contact: v })}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.repairLabel}>NOTIFIED ON</Text>
                  <DateField
                    testID="repmod-notified"
                    value={repairForm.notified_at}
                    onChange={(v) => setRepairForm({ ...repairForm, notified_at: v })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.repairLabel}>EXPECTED BACK</Text>
                  <DateField
                    testID="repmod-expected"
                    value={repairForm.expected_completion}
                    onChange={(v) => setRepairForm({ ...repairForm, expected_completion: v })}
                  />
                </View>
              </View>

              <Text style={styles.repairLabel}>NOTES</Text>
              <TextInput
                testID="repmod-notes"
                placeholder="What's wrong? RMA #..."
                placeholderTextColor={theme.colors.textMuted}
                value={repairForm.notes}
                style={[styles.input, { height: 80, textAlignVertical: "top" }]}
                multiline
                onChangeText={(v) => setRepairForm({ ...repairForm, notes: v })}
              />

              <Text style={styles.repairLabel}>PHOTO OF BROKEN PART</Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginBottom: 6 }}>
                Only shown in this claim — not added to the item's main photos.
              </Text>
              {repairForm.broken_photo ? (
                <View style={{ position: "relative", marginBottom: 8 }}>
                  <Image
                    source={{ uri: repairForm.broken_photo }}
                    style={{
                      width: "100%",
                      height: 180,
                      borderRadius: 6,
                      backgroundColor: theme.colors.bg,
                    }}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    testID="remove-broken-photo-btn"
                    onPress={() =>
                      setRepairForm({ ...repairForm, broken_photo: "" })
                    }
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      backgroundColor: "rgba(0,0,0,0.7)",
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="trash" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  testID="pick-broken-photo-btn"
                  onPress={pickBrokenPhoto}
                  style={{
                    height: 80,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: theme.colors.accent,
                    borderRadius: 6,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <Ionicons name="camera" size={20} color={theme.colors.accent} />
                  <Text
                    style={{
                      color: theme.colors.accent,
                      fontWeight: "900",
                      letterSpacing: 1.5,
                    }}
                  >
                    ADD PHOTO
                  </Text>
                </TouchableOpacity>
              )}

              {!tool.needs_repair && tool.is_checked_out && (
                <Text style={{ color: theme.colors.warning, fontSize: 12, marginVertical: 6 }}>
                  Heads up: this tool is currently checked out to{" "}
                  {tool.current_checkout?.borrower_name}. Marking it broken will auto check-in.
                </Text>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => setShowRepair(false)}
              >
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-repair-btn"
                style={[styles.btn, { backgroundColor: theme.colors.danger }]}
                onPress={saveRepair}
              >
                <Text style={[styles.btnText, { color: theme.colors.textPrimary }]}>
                  {tool.needs_repair ? "SAVE" : "MARK BROKEN"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Mark Sold Modal */}
      <Modal visible={showMarkSold} transparent animationType="slide" onRequestClose={() => setShowMarkSold(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="checkmark-done-circle" size={20} color="#27AE60" />
              <Text style={styles.modalTitle}>MARK AS SOLD</Text>
              <TouchableOpacity onPress={() => setShowMarkSold(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>
              <Text style={styles.repairLabel}>SOLD PRICE ($)</Text>
              <TextInput
                testID="sold-price"
                placeholder="0.00"
                placeholderTextColor={theme.colors.textMuted}
                value={markSoldForm.sold_price}
                onChangeText={(v) => setMarkSoldForm({ ...markSoldForm, sold_price: v })}
                style={styles.input}
                keyboardType="decimal-pad"
              />
              <Text style={styles.repairLabel}>SOLD TO (buyer name)</Text>
              <TextInput
                testID="sold-to"
                placeholder="Buyer name / contact"
                placeholderTextColor={theme.colors.textMuted}
                value={markSoldForm.sold_to}
                onChangeText={(v) => setMarkSoldForm({ ...markSoldForm, sold_to: v })}
                style={styles.input}
              />
              <Text style={styles.repairLabel}>SOLD ON</Text>
              <DateField
                testID="sold-on"
                value={markSoldForm.sold_at}
                onChange={(v) => setMarkSoldForm({ ...markSoldForm, sold_at: v })}
              />
              <Text style={styles.repairLabel}>NOTES (optional)</Text>
              <TextInput
                testID="sold-notes"
                placeholder="Any details about the sale..."
                placeholderTextColor={theme.colors.textMuted}
                value={markSoldForm.sold_notes}
                onChangeText={(v) => setMarkSoldForm({ ...markSoldForm, sold_notes: v })}
                style={[styles.input, { height: 70, textAlignVertical: "top" }]}
                multiline
              />
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => setShowMarkSold(false)}
                style={[styles.modalBtn, { flex: 1, backgroundColor: theme.colors.bgSecondary }]}
              >
                <Text style={[styles.modalBtnText, { color: theme.colors.textPrimary }]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-mark-sold"
                disabled={markSoldBusy}
                onPress={async () => {
                  setMarkSoldBusy(true);
                  try {
                    await api.markToolSold(tool.id, {
                      sold_price: parseFloat(markSoldForm.sold_price) || 0,
                      sold_to: markSoldForm.sold_to,
                      sold_at: markSoldForm.sold_at,
                      sold_notes: markSoldForm.sold_notes,
                    });
                    setShowMarkSold(false);
                    setShowSoldDelete(true); // ask delete vs archive
                  } catch (e: any) {
                    Alert.alert("Error", String(e?.message || e));
                  } finally {
                    setMarkSoldBusy(false);
                  }
                }}
                style={[styles.modalBtn, { flex: 1, backgroundColor: "#27AE60" }]}
              >
                {markSoldBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: "#fff" }]}>MARK SOLD</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* After-sold: delete or archive */}
      <Modal visible={showSoldDelete} transparent animationType="fade" onRequestClose={() => setShowSoldDelete(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 420 }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="checkmark-done-circle" size={22} color="#27AE60" />
              <Text style={styles.modalTitle}>SOLD!</Text>
            </View>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>
              The item has been marked sold.  Would you like to keep it in your
              SOLD archive (you can still report on it later) or remove it
              from the system entirely?
            </Text>
            <TouchableOpacity
              testID="sold-archive-btn"
              onPress={() => {
                setShowSoldDelete(false);
                load();
              }}
              style={[styles.modalBtn, { backgroundColor: theme.colors.accent, marginBottom: 8 }]}
            >
              <Text style={[styles.modalBtnText, { color: "#000" }]}>KEEP IN SOLD ARCHIVE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="sold-delete-btn"
              onPress={async () => {
                try {
                  await api.deleteTool(tool.id);
                  setShowSoldDelete(false);
                  router.replace("/for-sale");
                } catch (e: any) {
                  Alert.alert("Error", String(e?.message || e));
                }
              }}
              style={[styles.modalBtn, { backgroundColor: theme.colors.danger }]}
            >
              <Text style={[styles.modalBtnText, { color: "#fff" }]}>DELETE FROM SYSTEM</Text>
            </TouchableOpacity>
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
  bodyContainer: { paddingHorizontal: 16, paddingBottom: 12 },
  infoCard: {
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: 18,
    marginBottom: 16,
    overflow: "hidden",
    ...(theme.elevation.md as object),
  },
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
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.bgSecondary,
    gap: 8,
    marginBottom: 14,
    ...(theme.elevation.md as object),
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: theme.colors.textPrimary, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  statusSub: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 2 },
  repairBanner: {
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: "rgba(239, 68, 68, 0.18)",
    borderRadius: theme.radii.md,
    marginBottom: 16,
    ...(theme.elevation.md as object),
  },
  repairTitle: {
    color: "#FCA5A5",
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 12,
    marginBottom: 4,
  },
  repairLine: { color: theme.colors.textPrimary, fontSize: 13, marginTop: 1 },
  brokenPhoto: {
    width: "100%",
    height: 220,
    borderRadius: 6,
    marginTop: 12,
    backgroundColor: theme.colors.bg,
  },
  notifyRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  notifyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    backgroundColor: theme.colors.danger,
    borderRadius: 4,
  },
  notifyText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1.2,
  },
  title: { color: theme.colors.textPrimary, fontSize: 26, fontWeight: "900", letterSpacing: 1 },
  description: { color: theme.colors.textSecondary, fontSize: 15, marginTop: 8, lineHeight: 22 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 16 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
  },
  detailRowLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    marginBottom: 2,
  },
  detailRowValue: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  // Sale / Sold banner
  saleBanner: {
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    marginBottom: 6,
  },
  saleBannerTitle: {
    color: "#000",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 2,
  },
  saleBannerPrice: {
    color: "#000",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  saleBannerNotes: {
    color: "rgba(0,0,0,0.7)",
    fontSize: 11,
    marginTop: 4,
    fontStyle: "italic",
  },
  markSoldBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#27AE60",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  markSoldText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1.5,
  },
  // Generic modal helpers
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 18,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  modalTitle: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  modalBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalBtnText: {
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1.5,
  },
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
  fieldValue: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: "600", marginTop: 4 },
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
  docName: { color: theme.colors.textPrimary, flex: 1, fontSize: 14 },
  histRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  histName: { color: theme.colors.textPrimary, fontWeight: "700", fontSize: 14 },
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
  consumableLine: { color: theme.colors.textPrimary, fontSize: 13, marginTop: 2 },
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 24,
    backgroundColor: "rgba(15, 15, 15, 0.96)",
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  btn: {
    flexDirection: "row",
    backgroundColor: theme.colors.accent,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.md,
    gap: 8,
    ...(theme.elevation.accent as object),
  },
  btnSuccess: {
    flexDirection: "row",
    backgroundColor: theme.colors.success,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.md,
    gap: 8,
    ...(theme.elevation.md as object),
  },
  btnDanger: {
    flexDirection: "row",
    backgroundColor: theme.colors.danger,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.md,
    gap: 6,
    ...(theme.elevation.md as object),
  },
  repairLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 4,
  },
  dealerLockBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  dealerLockName: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  dealerLockMissing: {
    flex: 1,
    color: theme.colors.warning,
    fontSize: 12,
    fontStyle: "italic",
  },
  repChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
  },
  repChipActive: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.danger,
  },
  repChipText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  repChipTextActive: { color: theme.colors.textPrimary },
  btnText: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 20,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
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
  borrowerName: { color: theme.colors.textPrimary, fontWeight: "600", fontSize: 14 },
  input: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
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
  btnGhostText: { color: theme.colors.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 20,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
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
  borrowerName: { color: theme.colors.textPrimary, fontWeight: "600", fontSize: 14 },
  input: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
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
  btnGhostText: { color: theme.colors.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 14 },
});
