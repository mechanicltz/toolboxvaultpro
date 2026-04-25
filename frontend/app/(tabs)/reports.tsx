import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { theme } from "../../src/theme";
import { api } from "../../src/api";

const escapeHtml = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const buildHtml = (title: string, subtitle: string, tools: any[], includePhotos: boolean) => {
  const totalValue = tools.reduce((s, t) => s + (t.cost || 0), 0);
  const rows = tools
    .map((t, i) => {
      const status = t.is_checked_out
        ? `<span class="out">CHECKED OUT</span>`
        : `<span class="in">AVAILABLE</span>`;
      const checkout = t.is_checked_out
        ? `<div class="meta">With: <b>${escapeHtml(t.current_checkout?.borrower_name || "")}</b> · Since ${escapeHtml((t.current_checkout?.checked_out_at || "").substring(0, 10))}</div>`
        : "";
      const photoCell = includePhotos && t.photos?.[0]
        ? `<td style="width:70px"><img src="${t.photos[0]}" style="width:60px;height:60px;object-fit:cover;border:1px solid #ccc"/></td>`
        : "";
      return `
        <tr>
          <td class="num">${i + 1}</td>
          ${photoCell}
          <td>
            <div class="name">${escapeHtml(t.name)}</div>
            <div class="meta">${escapeHtml(t.brand || "")} ${escapeHtml(t.model || "")}</div>
            <div class="meta">${escapeHtml(t.dealer_name || "")}${t.dealer_name && t.purchased_from_agent_name ? " · " + escapeHtml(t.purchased_from_agent_name) : ""}</div>
            <div class="meta">${escapeHtml(t.tag_names?.join(", ") || "")}</div>
            ${checkout}
          </td>
          <td>${escapeHtml(t.location_name || "—")}</td>
          <td class="num">$${(t.cost || 0).toFixed(2)}</td>
          <td>${status}</td>
        </tr>`;
    })
    .join("");
  const photoHeader = includePhotos ? "<th>Photo</th>" : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, Helvetica, Arial; margin: 24px; color: #111; }
    .header { border-bottom: 3px solid #FFB300; padding-bottom: 12px; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 22px; letter-spacing: 2px; text-transform: uppercase; }
    .sub { color: #666; font-size: 12px; margin-top: 4px; }
    .summary { display: flex; gap: 24px; margin: 16px 0; }
    .stat { flex: 1; border: 1px solid #ddd; padding: 10px; }
    .stat .v { font-size: 20px; font-weight: 900; }
    .stat .l { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #111; color: #FFB300; padding: 8px; text-align: left; font-size: 10px; letter-spacing: 1px; }
    td { padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    .name { font-weight: 700; font-size: 13px; }
    .meta { color: #666; font-size: 11px; margin-top: 2px; }
    .num { text-align: right; }
    .in { color: #16a34a; font-weight: 700; font-size: 10px; letter-spacing: 1px; }
    .out { color: #dc2626; font-weight: 700; font-size: 10px; letter-spacing: 1px; }
    .footer { margin-top: 20px; font-size: 10px; color: #999; text-align: center; }
  </style></head><body>
    <div class="header">
      <h1>${escapeHtml(title)}</h1>
      <div class="sub">${escapeHtml(subtitle)} · Generated ${new Date().toLocaleString()}</div>
    </div>
    <div class="summary">
      <div class="stat"><div class="v">${tools.length}</div><div class="l">Items</div></div>
      <div class="stat"><div class="v">${tools.filter((t) => t.is_checked_out).length}</div><div class="l">Checked Out</div></div>
      <div class="stat"><div class="v">$${totalValue.toFixed(2)}</div><div class="l">Total Value</div></div>
    </div>
    <table>
      <thead><tr><th>#</th>${photoHeader}<th>Tool</th><th>Location</th><th>Cost</th><th>Status</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px">No items</td></tr>'}</tbody>
    </table>
    <div class="footer">Toolbox Tracker · ${tools.length} item(s)</div>
  </body></html>`;
};

export default function ReportsScreen() {
  const [stats, setStats] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api.getStats().then(setStats).catch(() => {});
    }, [])
  );

  const generate = async (kind: "all" | "out" | "in") => {
    if (busy) return;
    setBusy(true);
    try {
      let tools: any[] = [];
      let title = "FULL INVENTORY REPORT";
      let subtitle = "All tracked tools and equipment";
      if (kind === "all") {
        tools = await api.listTools();
      } else if (kind === "out") {
        tools = await api.listTools({ checked_out: true });
        title = "CHECKED OUT REPORT";
        subtitle = "Tools currently borrowed";
      } else {
        tools = await api.listTools({ checked_out: false });
        title = "AVAILABLE TOOLS";
        subtitle = "Tools currently in inventory";
      }
      const html = buildHtml(title, subtitle, tools, includePhotos);
      const { uri } = await Print.printToFileAsync({ html });
      if (Platform.OS === "web") {
        // Open in new tab on web
        window.open(uri, "_blank");
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: title,
        });
      } else {
        Alert.alert("PDF saved", `Saved to: ${uri}`);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not generate PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>REPORTS</Text>
        <Text style={styles.subtitle}>Export PDFs of your inventory</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.total_tools ?? 0}</Text>
            <Text style={styles.statLabel}>Total Tools</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: theme.colors.success }]}>
              {stats.available ?? 0}
            </Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: theme.colors.accentSecondary }]}>
              {stats.checked_out ?? 0}
            </Text>
            <Text style={styles.statLabel}>Checked Out</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: theme.colors.accent }]}>
              ${(stats.total_value ?? 0).toFixed(0)}
            </Text>
            <Text style={styles.statLabel}>Total Value</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>EXPORT REPORTS</Text>

        <View style={styles.toggleRow}>
          <Ionicons name="image" size={20} color={theme.colors.accent} />
          <Text style={styles.toggleText} numberOfLines={1}>Include photos in PDF</Text>
          <Switch
            testID="toggle-include-photos"
            value={includePhotos}
            onValueChange={setIncludePhotos}
            trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
            thumbColor="#fff"
          />
        </View>

        <TouchableOpacity
          testID="report-full-btn"
          style={styles.reportCard}
          onPress={() => generate("all")}
          disabled={busy}
        >
          <View style={styles.reportIcon}>
            <Ionicons name="document-text" size={28} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportTitle}>FULL INVENTORY</Text>
            <Text style={styles.reportDesc}>
              All tools with details, costs, locations, and status
            </Text>
          </View>
          <Ionicons name="download-outline" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="report-out-btn"
          style={styles.reportCard}
          onPress={() => generate("out")}
          disabled={busy}
        >
          <View style={styles.reportIcon}>
            <Ionicons name="alert-circle" size={28} color={theme.colors.accentSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportTitle}>CHECKED OUT</Text>
            <Text style={styles.reportDesc}>
              Tools currently borrowed and by whom
            </Text>
          </View>
          <Ionicons name="download-outline" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="report-in-btn"
          style={styles.reportCard}
          onPress={() => generate("in")}
          disabled={busy}
        >
          <View style={styles.reportIcon}>
            <Ionicons name="checkmark-circle" size={28} color={theme.colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportTitle}>AVAILABLE TOOLS</Text>
            <Text style={styles.reportDesc}>
              Tools currently in your inventory
            </Text>
          </View>
          <Ionicons name="download-outline" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        {busy && (
          <Text style={{ color: theme.colors.accent, textAlign: "center", marginTop: 16 }}>
            Generating PDF...
          </Text>
        )}

        <Text style={styles.tip}>
          TIP: To export filtered/search results, use the search bar on the Inventory tab,
          then export from a single tool's detail page.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { color: theme.colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: 2 },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  statCard: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    borderRadius: 4,
  },
  statValue: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 28 },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 4,
    textTransform: "uppercase",
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 12,
  },
  reportCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginBottom: 10,
    borderRadius: 4,
    gap: 14,
  },
  reportIcon: {
    width: 48,
    height: 48,
    backgroundColor: theme.colors.surface,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  reportTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 2,
  },
  reportDesc: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  tip: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 24,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
