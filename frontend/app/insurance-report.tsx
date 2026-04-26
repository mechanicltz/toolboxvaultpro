import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  Switch,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { theme } from "../src/theme";
import { api } from "../src/api";

const esc = (s: any) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function InsuranceReportScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOpts, setShowOpts] = useState(false);
  const [includeThumbs, setIncludeThumbs] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([
        api.getPersonalProfile().catch(() => null),
        api.listTools().catch(() => []),
      ]);
      setProfile(p);
      setTools(t || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const profileComplete = !!profile?.name?.trim();
  const total = tools.reduce((s, t) => s + (t.cost || 0), 0);

  const startReport = () => {
    if (!profileComplete) {
      Alert.alert(
        "Personal Information Required",
        "Please add your personal information first. This is required so the insurance report has a name and address.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Add Personal Info",
            onPress: () => router.push("/personal-info"),
          },
        ]
      );
      return;
    }
    if (tools.length === 0) {
      Alert.alert(
        "No items",
        "There are no inventory items to include in the report."
      );
      return;
    }
    setShowOpts(true);
  };

  const generate = async () => {
    setGenerating(true);
    let printWin: Window | null = null;
    try {
      if (Platform.OS === "web") {
        printWin = window.open("", "_blank");
        if (!printWin) {
          Alert.alert("Popup blocked", "Please allow popups for this site.");
          setGenerating(false);
          return;
        }
        printWin.document.write(
          "<!doctype html><title>Generating Insurance Report...</title><body style='font-family:Helvetica;padding:40px;color:#666'>Generating Insurance Report...</body>"
        );
      }

      const html = buildHtml(profile, tools, total, includeThumbs, includeNotes);

      if (Platform.OS === "web") {
        if (!printWin) return;
        const fullHtml = html.replace(
          "</body>",
          "<script>setTimeout(function(){window.print();},800);</script></body>"
        );
        printWin.document.open();
        printWin.document.write(fullHtml);
        printWin.document.close();
        printWin.document.title = "Insurance Inventory Report";
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: "application/pdf" });
        }
      }
      setShowOpts(false);
    } catch (e: any) {
      if (printWin) printWin.close();
      Alert.alert("Error", e.message || "Could not generate report.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="ir-back"
          onPress={() => router.back()}
          hitSlop={10}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>INSURANCE REPORT</Text>
          <Text style={styles.subtitle}>FULL INVENTORY VALUATION</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 140 }}>
        {/* Personal info card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons
              name={profileComplete ? "person-circle" : "alert-circle"}
              size={20}
              color={
                profileComplete ? theme.colors.success : theme.colors.warning
              }
            />
            <Text style={styles.cardTitle}>PERSONAL / COMPANY INFO</Text>
            <TouchableOpacity
              testID="ir-edit-profile"
              onPress={() => router.push("/personal-info")}
              style={styles.editBtn}
            >
              <Text style={styles.editBtnText}>
                {profileComplete ? "EDIT" : "ADD"}
              </Text>
            </TouchableOpacity>
          </View>
          {profileComplete ? (
            <View>
              <Text style={styles.profName}>{profile.name}</Text>
              {!!profile.address && (
                <Text style={styles.profLine}>
                  {profile.address}
                  {profile.address2 ? `, ${profile.address2}` : ""}
                </Text>
              )}
              {(!!profile.city || !!profile.state || !!profile.zip_code) && (
                <Text style={styles.profLine}>
                  {[profile.city, profile.state, profile.zip_code]
                    .filter(Boolean)
                    .join(", ")}
                  {profile.country ? `  ·  ${profile.country}` : ""}
                </Text>
              )}
              {!!profile.phone && (
                <Text style={styles.profLine}>📞 {profile.phone}</Text>
              )}
              {!!profile.email && (
                <Text style={styles.profLine}>✉️ {profile.email}</Text>
              )}
              {!!profile.insurance_company && (
                <Text style={styles.profLine}>
                  Insurance: {profile.insurance_company}
                  {profile.policy_number ? `  ·  Policy #${profile.policy_number}` : ""}
                </Text>
              )}
            </View>
          ) : (
            <Text style={styles.warnText}>
              No personal information saved yet. The report needs at least a
              name to identify the policyholder. Tap ADD to enter it.
            </Text>
          )}
        </View>

        {/* Stats card */}
        <View style={styles.statsRow}>
          <Stat label="Items" value={String(tools.length)} />
          <Stat label="Total Value" value={`$${total.toFixed(2)}`} primary />
        </View>

        <TouchableOpacity
          testID="ir-generate"
          style={[
            styles.generateBtn,
            !profileComplete && { opacity: 0.5 },
          ]}
          onPress={startReport}
        >
          <Ionicons name="document-text" size={20} color="#000" />
          <Text style={styles.generateBtnText}>GENERATE REPORT</Text>
        </TouchableOpacity>
        {!profileComplete && (
          <Text style={styles.helperText}>
            Add personal information first to enable report generation.
          </Text>
        )}
      </ScrollView>

      {/* Options modal */}
      <Modal
        transparent
        visible={showOpts}
        animationType="slide"
        onRequestClose={() => setShowOpts(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>REPORT OPTIONS</Text>
            <View style={styles.optRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optLabel}>Include item thumbnails</Text>
                <Text style={styles.optHint}>
                  Adds a small photo next to each item (longer PDF).
                </Text>
              </View>
              <Switch
                testID="ir-toggle-thumbs"
                value={includeThumbs}
                onValueChange={setIncludeThumbs}
                trackColor={{
                  false: theme.colors.surface,
                  true: theme.colors.accent,
                }}
                thumbColor="#fff"
              />
            </View>
            <View style={styles.optRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optLabel}>Include description / notes</Text>
                <Text style={styles.optHint}>
                  Adds a small line under each item with its description.
                </Text>
              </View>
              <Switch
                testID="ir-toggle-notes"
                value={includeNotes}
                onValueChange={setIncludeNotes}
                trackColor={{
                  false: theme.colors.surface,
                  true: theme.colors.accent,
                }}
                thumbColor="#fff"
              />
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => setShowOpts(false)}
                disabled={generating}
              >
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="ir-confirm-generate"
                style={styles.btnPrimary}
                onPress={generate}
                disabled={generating}
              >
                {generating ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.btnPrimaryText}>CREATE PDF</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  primary,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <View style={[styles.statBox, primary && styles.statBoxPrimary]}>
      <Text style={[styles.statValue, primary && styles.statValuePrimary]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function buildHtml(
  profile: any,
  tools: any[],
  total: number,
  includeThumbs: boolean,
  includeNotes: boolean
): string {
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const profLines: string[] = [];
  if (profile.address) {
    let line = profile.address;
    if (profile.address2) line += `, ${profile.address2}`;
    profLines.push(line);
  }
  const cityLine = [profile.city, profile.state, profile.zip_code]
    .filter(Boolean)
    .join(", ");
  if (cityLine) profLines.push(cityLine);
  if (profile.country) profLines.push(profile.country);
  if (profile.phone) profLines.push(`Phone: ${profile.phone}`);
  if (profile.email) profLines.push(`Email: ${profile.email}`);
  if (profile.insurance_company) {
    let ins = `Insurance: ${profile.insurance_company}`;
    if (profile.policy_number) ins += `  ·  Policy #${profile.policy_number}`;
    profLines.push(ins);
  }

  const rows = tools
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map((t, i) => {
      const photo = (t.photos && t.photos[0]) || "";
      const thumbCol =
        includeThumbs
          ? `<td class="thumb">${
              photo
                ? `<img src="${photo}" />`
                : `<div class="thumb-ph">—</div>`
            }</td>`
          : "";
      const notesRow =
        includeNotes && t.description
          ? `<tr class="notes-row"><td></td>${
              includeThumbs ? "<td></td>" : ""
            }<td colspan="5"><em>${esc(t.description)}</em></td></tr>`
          : "";
      return `
        <tr>
          <td class="num">${i + 1}</td>
          ${thumbCol}
          <td class="name">${esc(t.name) || "—"}</td>
          <td>${esc(t.purchase_date) || "—"}</td>
          <td>${esc(t.brand) || "—"}</td>
          <td>${esc(t.serial_number) || "—"}</td>
          <td class="val">$${(t.cost || 0).toFixed(2)}</td>
        </tr>
        ${notesRow}
      `;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: letter; margin: 0.55in 0.5in 0.55in 0.5in; }
    body { font-family: Helvetica, Arial, sans-serif; color: #111; margin: 0; }
    .head { text-align: center; border-bottom: 4px solid #FFB300; padding-bottom: 14px; margin-bottom: 18px; }
    .head h1 { font-size: 26px; letter-spacing: 3px; margin: 0 0 6px 0; text-transform: uppercase; }
    .head .date { color: #666; font-size: 12px; letter-spacing: 1px; }
    .pi {
      background: #fff8e6;
      border: 1px solid #FFB300;
      border-radius: 4px;
      padding: 14px 18px;
      margin-bottom: 18px;
    }
    .pi .pi-name { font-size: 18px; font-weight: 800; letter-spacing: 0.5px; margin: 0; }
    .pi .pi-line { font-size: 12px; margin-top: 4px; color: #333; }
    .stats { display: flex; gap: 18px; margin-bottom: 14px; }
    .stat { flex: 1; border: 1px solid #ddd; padding: 10px 14px; border-radius: 4px; background: #fafafa; }
    .stat .stat-l { font-size: 9px; letter-spacing: 1.5px; color: #666; text-transform: uppercase; font-weight: 700; }
    .stat .stat-v { font-size: 18px; font-weight: 800; margin-top: 2px; }
    .stat.tot { background: #FFB300; color: #000; border-color: #FFB300; }
    .stat.tot .stat-l { color: rgba(0,0,0,0.65); }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead th {
      background: #111; color: #FFB300; text-align: left;
      padding: 8px 10px; font-size: 9px; letter-spacing: 1.5px;
      text-transform: uppercase;
    }
    tbody td { padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: middle; }
    tbody tr:nth-child(even) td { background: #fafafa; }
    td.num { text-align: center; color: #FFB300; font-weight: 800; width: 28px; font-size: 11px; }
    td.thumb { width: 46px; padding: 4px; }
    td.thumb img { width: 40px; height: 40px; object-fit: cover; border-radius: 3px; border: 1px solid #ddd; }
    td.thumb .thumb-ph { width: 40px; height: 40px; background: #f0f0f0; border-radius: 3px; text-align:center; line-height:40px; color:#999; font-size: 14px;}
    td.name { font-weight: 700; }
    td.val { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
    .notes-row td { font-size: 10px; color: #666; padding-top: 0 !important; padding-bottom: 8px !important; border-bottom: 1px solid #eee; background: #fff !important; }
    tr.total-row td {
      background: #111 !important; color: #FFB300; font-weight: 900; font-size: 13px;
      letter-spacing: 1px; padding: 12px 10px; text-transform: uppercase;
    }
    tr.total-row td.val { color: #fff; font-size: 16px; }
    .footer { text-align: center; color: #999; font-size: 10px; margin-top: 22px; letter-spacing: 1px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style></head><body>
    <div class="head">
      <h1>Insurance Inventory Report</h1>
      <div class="date">Prepared ${esc(today)}</div>
    </div>
    <div class="pi">
      <div class="pi-name">${esc(profile.name)}</div>
      ${profLines.map((l) => `<div class="pi-line">${esc(l)}</div>`).join("")}
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-l">Total Items</div><div class="stat-v">${tools.length}</div></div>
      <div class="stat tot"><div class="stat-l">Total Value</div><div class="stat-v">$${total.toFixed(2)}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>#</th>
        ${includeThumbs ? "<th></th>" : ""}
        <th>Item Name</th>
        <th>Purchase Date</th>
        <th>Brand</th>
        <th>Serial Number</th>
        <th style="text-align:right">Value</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td colspan="${includeThumbs ? 6 : 5}">Grand Total — ${tools.length} item${tools.length === 1 ? "" : "s"}</td>
          <td class="val">$${total.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
    ${profile.notes ? `<p style="margin-top:14px;font-size:11px;color:#444"><strong>Notes:</strong> ${esc(profile.notes)}</p>` : ""}
    <div class="footer">Generated by Toolbox · ${esc(today)}</div>
  </body></html>`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
  },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: 2,
  },
  card: {
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    padding: 14,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 12,
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 4,
  },
  editBtnText: {
    color: theme.colors.accent,
    fontWeight: "900",
    letterSpacing: 1.2,
    fontSize: 11,
  },
  profName: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 4,
  },
  profLine: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  warnText: {
    color: theme.colors.warning,
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    borderRadius: 6,
    alignItems: "center",
  },
  statBoxPrimary: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  statValue: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  statValuePrimary: { color: "#000" },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 2,
    textTransform: "uppercase",
  },
  previewCard: {
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    padding: 14,
    marginBottom: 18,
  },
  previewTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 11,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
    alignItems: "center",
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
  },
  bulletText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.accent,
    height: 56,
    borderRadius: 6,
    ...(theme.elevation.accent as object),
  },
  generateBtnText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 15,
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 10,
  },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 22,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 14,
  },
  optRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  optLabel: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  optHint: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  btnGhost: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  btnGhostText: {
    color: theme.colors.textPrimary,
    fontWeight: "900",
    letterSpacing: 2,
  },
  btnPrimary: {
    flex: 2,
    height: 48,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  btnPrimaryText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 14,
  },
});
