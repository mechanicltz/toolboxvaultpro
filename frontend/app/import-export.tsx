import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { parseCsv, parseXlsx, saveBase64 } from "../src/csvIO";

type ImportField = { id: string; label: string; required?: boolean };
type ExportField = { id: string; label: string };

type Mapping = Record<number, string>; // colIndex -> system field id (or "" = skip)

const SKIP_VALUE = ""; // empty string == skip

// Header → field guesser. Returns the system field id, or "" if no match.
function guessField(header: string, fields: ImportField[]): string {
  const h = (header || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!h) return "";
  const aliases: Record<string, string> = {
    name: "name",
    title: "name",
    item: "name",
    tool: "name",
    toolname: "name",
    description: "description",
    desc: "description",
    notes: "description",
    note: "description",
    brand: "brand",
    make: "brand",
    manufacturer: "brand",
    model: "model",
    modelnumber: "model",
    serial: "serial_number",
    serialnumber: "serial_number",
    sn: "serial_number",
    quantity: "quantity",
    qty: "quantity",
    cost: "cost",
    price: "cost",
    amount: "cost",
    unitcost: "cost",
    category: "category",
    type: "category",
    location: "location",
    storedat: "location",
    where: "location",
    dealer: "dealer",
    vendor: "dealer",
    supplier: "dealer",
    seller: "dealer",
    condition: "condition",
    state: "condition",
    purchasedate: "purchase_date",
    datepurchased: "purchase_date",
    purchased: "purchase_date",
    boughton: "purchase_date",
    warranty: "warranty_expiry",
    warrantyexpiry: "warranty_expiry",
    warrantyuntil: "warranty_expiry",
    warrantyexpires: "warranty_expiry",
    tags: "tags",
    tag: "tags",
    labels: "tags",
  };
  if (aliases[h]) return aliases[h];
  // partial fallback: if any field's id is contained in the header
  for (const f of fields) {
    const fid = f.id.replace(/_/g, "");
    if (h === fid) return f.id;
    if (h.includes(fid)) return f.id;
  }
  return "";
}

export default function ImportExportScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState<string>("");

  // Import state
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [importFields, setImportFields] = useState<ImportField[]>([]);
  const [pickerForCol, setPickerForCol] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<any>(null);

  // Export state (field selection)
  const [exportFields, setExportFields] = useState<ExportField[]>([]);
  const [selectedExportFields, setSelectedExportFields] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx">("csv");

  // Load the system field schema once
  useEffect(() => {
    api
      .get("/tools/import-fields")
      .then((r: any) => setImportFields(r?.fields || []))
      .catch(() => setImportFields([]));
    api
      .get("/tools/export-fields")
      .then((r: any) => {
        const fs: ExportField[] = r?.fields || [];
        setExportFields(fs);
        // default = all fields selected
        setSelectedExportFields(new Set(fs.map((f) => f.id)));
      })
      .catch(() => setExportFields([]));
  }, []);

  const toggleExportField = (id: string) => {
    setSelectedExportFields((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllExportFields = () =>
    setSelectedExportFields(new Set(exportFields.map((f) => f.id)));
  const clearExportFields = () => setSelectedExportFields(new Set());

  // Mapping summary — how many columns are actually mapped, which are duplicates,
  // and whether the required "Name" field is wired up.
  const mappingSummary = (() => {
    const mappedIds: string[] = [];
    headers.forEach((_, i) => {
      const v = mapping[i];
      if (v) mappedIds.push(v);
    });
    const counts: Record<string, number> = {};
    mappedIds.forEach((id) => {
      counts[id] = (counts[id] || 0) + 1;
    });
    const duplicates = Object.entries(counts)
      .filter(([, n]) => n > 1)
      .map(([id]) => id);
    const mappedCount = mappedIds.length;
    const totalCols = headers.length;
    const skipped = totalCols - mappedCount;
    const hasName = mappedIds.includes("name");
    return { mappedCount, totalCols, skipped, hasName, duplicates, counts };
  })();

  /* ---------------- EXPORT ---------------- */
  const doExport = useCallback(async () => {
    if (selectedExportFields.size === 0) {
      Alert.alert(
        "No fields selected",
        "Pick at least one field to include in the export.",
      );
      return;
    }
    setBusy("export");
    try {
      const ordered = exportFields
        .map((f) => f.id)
        .filter((id) => selectedExportFields.has(id));
      const r: any = await api.post("/tools/export-csv", {
        fields: ordered,
        format: exportFormat,
      });
      if (!r?.base64) throw new Error("Server returned no data");
      const mime =
        r.mime ||
        (exportFormat === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv");
      const fallbackFilename =
        exportFormat === "xlsx" ? "tools.xlsx" : "tools.csv";
      await saveBase64(r.filename || fallbackFilename, mime, r.base64);
      Alert.alert(
        "Export ready",
        `Exported ${r.rows} tool${r.rows === 1 ? "" : "s"} as ${exportFormat.toUpperCase()} with ${ordered.length} field${ordered.length === 1 ? "" : "s"}.${
          Platform.OS === "web" ? " The file should download now." : ""
        }`,
      );
    } catch (e: any) {
      Alert.alert("Export failed", e?.message || "Could not export.");
    } finally {
      setBusy("");
    }
  }, [exportFields, selectedExportFields, exportFormat]);

  /* ---------------- IMPORT — pick file + parse ---------------- */
  const pickFile = useCallback(async () => {
    setBusy("pick");
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/comma-separated-values",
          "application/csv",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "*/*",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) {
        setBusy("");
        return;
      }
      const asset = res.assets[0];
      const name = asset.name || "import.csv";
      const ext = name.toLowerCase().split(".").pop() || "";
      const isXlsx =
        ext === "xlsx" ||
        ext === "xls" ||
        (asset.mimeType || "").includes("sheet") ||
        (asset.mimeType || "").includes("excel");

      let parsed: string[][] = [];
      if (isXlsx) {
        // XLSX — must read as base64 and delegate to SheetJS
        let b64 = "";
        if (Platform.OS === "web") {
          const r = await fetch(asset.uri);
          const buf = await r.arrayBuffer();
          const bytes = new Uint8Array(buf);
          // Chunked conversion to base64 to avoid blowing the stack on large files
          let bin = "";
          const CHUNK = 0x8000;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            bin += String.fromCharCode.apply(
              null,
              Array.from(bytes.subarray(i, i + CHUNK)),
            );
          }
          const w: any = (globalThis as any).window;
          b64 = w.btoa(bin);
        } else {
          b64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        parsed = parseXlsx(b64);
      } else {
        // CSV (or anything text-based)
        let text = "";
        if (Platform.OS === "web") {
          const r = await fetch(asset.uri);
          text = await r.text();
        } else {
          text = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.UTF8,
          });
        }
        parsed = parseCsv(text);
      }

      if (!parsed.length) {
        Alert.alert(
          "Empty file",
          `We couldn't find any rows in that ${isXlsx ? "Excel" : "CSV"} file.`,
        );
        setBusy("");
        return;
      }
      const hdr = parsed[0].map((h) => (h || "").trim());
      const dataRows = parsed.slice(1);
      setFileName(name);
      setHeaders(hdr);
      setRows(dataRows);
      // Auto-guess mapping from headers
      const auto: Mapping = {};
      hdr.forEach((h, i) => {
        auto[i] = guessField(h, importFields);
      });
      setMapping(auto);
      setImportResult(null);
    } catch (e: any) {
      Alert.alert("Couldn't open file", e?.message || "");
    } finally {
      setBusy("");
    }
  }, [importFields]);

  /* ---------------- IMPORT — re-run auto-map ---------------- */
  const runAutoMap = useCallback(() => {
    if (!headers.length) return;
    const auto: Mapping = {};
    headers.forEach((h, i) => {
      auto[i] = guessField(h, importFields);
    });
    setMapping(auto);
  }, [headers, importFields]);

  const clearMapping = useCallback(() => {
    if (!headers.length) return;
    const cleared: Mapping = {};
    headers.forEach((_, i) => {
      cleared[i] = "";
    });
    setMapping(cleared);
  }, [headers]);

  /* ---------------- IMPORT — submit ---------------- */
  const doImport = useCallback(async () => {
    if (!rows.length) return;
    // Verify a Name column is mapped
    const hasName = Object.values(mapping).some((v) => v === "name");
    if (!hasName) {
      Alert.alert(
        "Name column required",
        "Map at least one CSV column to the system field “Name”. That's the only required field.",
      );
      return;
    }
    setBusy("import");
    try {
      const normalized = rows
        .map((r) => {
          const obj: Record<string, any> = {};
          for (const [colIdxStr, fieldId] of Object.entries(mapping)) {
            if (!fieldId) continue;
            const colIdx = parseInt(colIdxStr, 10);
            const val = (r[colIdx] || "").trim();
            // Allow same target field mapped from multiple columns —
            // last-wins (and non-empty wins over empty)
            if (val || !(fieldId in obj)) obj[fieldId] = val;
          }
          return obj;
        })
        // Skip rows that are completely empty
        .filter((o) => Object.values(o).some((v) => (v || "") !== ""));

      const result: any = await api.post("/tools/import", {
        rows: normalized,
        create_missing_categories: true,
        create_missing_tags: true,
      });
      setImportResult(result);
    } catch (e: any) {
      // 402 = free tier limit hit — the global paywall handler in api.ts
      // already navigated the user there. Don't pile a raw JSON alert on top.
      if (e?.paymentRequired || e?.status === 402) {
        // no-op
      } else {
        Alert.alert(
          "Import failed",
          e?.detail || e?.message || "Server error during import.",
        );
      }
    } finally {
      setBusy("");
    }
  }, [rows, mapping]);

  /* ---------------- RENDER ---------------- */
  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>IMPORT / EXPORT DATABASE</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18 }}>
        {/* EXPORT CARD */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="download-outline" size={22} color={theme.colors.accent} />
            <Text style={styles.cardTitle}>EXPORT TO SPREADSHEET</Text>
          </View>
          <Text style={styles.cardBody}>
            Download a spreadsheet of every tool in your inventory. Pick which
            fields you want included — by default everything is selected.
          </Text>

          {/* Format toggle */}
          <Text style={styles.sectionLabel}>FILE FORMAT</Text>
          <View style={styles.formatToggle}>
            <TouchableOpacity
              testID="fmt-csv"
              style={[
                styles.formatBtn,
                exportFormat === "csv" && styles.formatBtnActive,
              ]}
              onPress={() => setExportFormat("csv")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="document-text"
                size={16}
                color={exportFormat === "csv" ? "#000" : theme.colors.textSecondary}
              />
              <Text
                style={[
                  styles.formatBtnText,
                  exportFormat === "csv" && styles.formatBtnTextActive,
                ]}
              >
                CSV
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="fmt-xlsx"
              style={[
                styles.formatBtn,
                exportFormat === "xlsx" && styles.formatBtnActive,
              ]}
              onPress={() => setExportFormat("xlsx")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="grid"
                size={16}
                color={exportFormat === "xlsx" ? "#000" : theme.colors.textSecondary}
              />
              <Text
                style={[
                  styles.formatBtnText,
                  exportFormat === "xlsx" && styles.formatBtnTextActive,
                ]}
              >
                EXCEL (XLSX)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Field selector */}
          <View style={styles.exportFieldsHeader}>
            <Text style={styles.exportFieldsHeading}>
              FIELDS TO INCLUDE ({selectedExportFields.size}/{exportFields.length})
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={selectAllExportFields}
                style={styles.exportFieldsBtn}
                testID="export-select-all"
              >
                <Text style={styles.exportFieldsBtnText}>SELECT ALL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={clearExportFields}
                style={styles.exportFieldsBtn}
                testID="export-clear-all"
              >
                <Text style={styles.exportFieldsBtnText}>CLEAR</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.exportFieldsList}>
            {exportFields.map((f) => {
              const on = selectedExportFields.has(f.id);
              return (
                <TouchableOpacity
                  key={f.id}
                  testID={`export-field-${f.id}`}
                  style={styles.exportFieldRow}
                  onPress={() => toggleExportField(f.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.exportCheck, on && styles.exportCheckOn]}>
                    {on && <Ionicons name="checkmark" size={14} color="#000" />}
                  </View>
                  <Text style={styles.exportFieldLabel}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
            {exportFields.length === 0 && (
              <ActivityIndicator color={theme.colors.accent} style={{ padding: 20 }} />
            )}
          </View>

          <TouchableOpacity
            testID="export-csv-btn"
            style={[
              styles.btnPrimary,
              { marginTop: 14 },
              (busy === "export" || selectedExportFields.size === 0) && { opacity: 0.6 },
            ]}
            disabled={!!busy || selectedExportFields.size === 0}
            onPress={doExport}
            activeOpacity={0.8}
          >
            {busy === "export" ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="cloud-download" size={18} color="#000" />
                <Text style={styles.btnPrimaryText}>
                  EXPORT {selectedExportFields.size} FIELD
                  {selectedExportFields.size === 1 ? "" : "S"} AS {exportFormat.toUpperCase()}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* IMPORT CARD */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cloud-upload-outline" size={22} color={theme.colors.accent} />
            <Text style={styles.cardTitle}>IMPORT FROM SPREADSHEET</Text>
          </View>
          <Text style={styles.cardBody}>
            Import tools from any CSV or Excel (.xlsx) file — including exports from
            other inventory apps. Pick a file, then map each of its columns to a
            Toolbox Vault field. Missing Categories, Tags, Locations, and Dealers
            are auto-created (matched case-insensitively by name, so duplicates
            are skipped).
          </Text>

          <TouchableOpacity
            testID="pick-csv-btn"
            style={[styles.btnGhost, busy === "pick" && { opacity: 0.6 }]}
            disabled={!!busy}
            onPress={pickFile}
            activeOpacity={0.8}
          >
            {busy === "pick" ? (
              <ActivityIndicator color={theme.colors.textPrimary} />
            ) : (
              <>
                <Ionicons name="folder-open" size={18} color={theme.colors.textPrimary} />
                <Text style={styles.btnGhostText}>
                  {fileName ? "CHOOSE A DIFFERENT FILE" : "CHOOSE CSV OR EXCEL FILE"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {fileName ? (
            <Text style={styles.fileName} numberOfLines={1}>
              📄 {fileName} · {rows.length} row{rows.length === 1 ? "" : "s"}
            </Text>
          ) : null}

          {/* MAPPING */}
          {headers.length > 0 ? (
            <>
              <View style={styles.mapHeaderRow}>
                <Text style={styles.sectionLabel}>COLUMN MAPPING</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={runAutoMap}
                    testID="auto-map-btn"
                    activeOpacity={0.7}
                  >
                    <Ionicons name="flash" size={12} color={theme.colors.accent} />
                    <Text style={styles.smallBtnText}>AUTO-MAP</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={clearMapping}
                    testID="clear-map-btn"
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={12} color={theme.colors.textSecondary} />
                    <Text style={styles.smallBtnText}>CLEAR</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.helper}>
                Map each column from your file to a Toolbox Vault field. Leave any
                column you don't need set to "Skip".
              </Text>

              {/* MAPPING STATUS BANNER */}
              <View
                style={[
                  styles.statusBanner,
                  mappingSummary.hasName
                    ? styles.statusBannerOk
                    : styles.statusBannerBad,
                ]}
              >
                <View style={styles.statusRow}>
                  <Ionicons
                    name={mappingSummary.hasName ? "checkmark-circle" : "alert-circle"}
                    size={16}
                    color={mappingSummary.hasName ? "#10b981" : theme.colors.danger}
                  />
                  <Text style={styles.statusText}>
                    {mappingSummary.hasName
                      ? "Name column mapped"
                      : "Name column is required"}
                  </Text>
                </View>
                <View style={styles.statusRow}>
                  <Ionicons
                    name="git-branch-outline"
                    size={14}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.statusSubText}>
                    {mappingSummary.mappedCount} of {mappingSummary.totalCols} columns mapped
                    {mappingSummary.skipped > 0 ? ` · ${mappingSummary.skipped} skipped` : ""}
                  </Text>
                </View>
                {mappingSummary.duplicates.length > 0 ? (
                  <View style={styles.statusRow}>
                    <Ionicons
                      name="warning-outline"
                      size={14}
                      color={theme.colors.warning || "#f59e0b"}
                    />
                    <Text style={[styles.statusSubText, { color: theme.colors.warning || "#f59e0b" }]}>
                      {mappingSummary.duplicates.length} field
                      {mappingSummary.duplicates.length === 1 ? "" : "s"} mapped to multiple columns — last non-empty value wins
                    </Text>
                  </View>
                ) : null}
              </View>

              {headers.map((h, i) => {
                const sel = mapping[i] || "";
                const selField = importFields.find((f) => f.id === sel);
                const sample = (rows[0] && rows[0][i]) || "";
                const isRequired = selField?.required;
                const isDup =
                  sel && (mappingSummary.counts[sel] || 0) > 1;
                return (
                  <View key={i} style={styles.mapRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.mapHeader} numberOfLines={1}>
                        {h || `Column ${i + 1}`}
                      </Text>
                      <Text style={styles.mapSample} numberOfLines={1}>
                        e.g. {sample || "—"}
                      </Text>
                    </View>
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color={theme.colors.textMuted}
                      style={{ marginHorizontal: 6 }}
                    />
                    <TouchableOpacity
                      style={[
                        styles.mapBtn,
                        !sel && styles.mapBtnSkipped,
                        isRequired && styles.mapBtnRequired,
                        isDup && styles.mapBtnDup,
                      ]}
                      onPress={() => setPickerForCol(i)}
                      testID={`map-col-${i}`}
                    >
                      {isRequired ? (
                        <Ionicons name="star" size={11} color={theme.colors.accent} />
                      ) : null}
                      <Text style={[styles.mapBtnText, !sel && styles.mapBtnTextSkipped]} numberOfLines={1}>
                        {selField ? selField.label : "Skip"}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                );
              })}

              {/* PREVIEW */}
              {rows.length > 0 ? (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 18 }]}>PREVIEW (first 3 rows)</Text>
                  <ScrollView horizontal contentContainerStyle={{ paddingVertical: 4 }}>
                    <View>
                      <View style={styles.previewRow}>
                        {headers.map((h, i) => {
                          const sel = mapping[i] || "";
                          const f = importFields.find((x) => x.id === sel);
                          return (
                            <View key={i} style={styles.previewCell}>
                              <Text style={styles.previewHead} numberOfLines={1}>{h}</Text>
                              <Text style={styles.previewMap} numberOfLines={1}>
                                {f ? `→ ${f.label}` : "→ Skip"}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                      {rows.slice(0, 3).map((r, ri) => (
                        <View key={ri} style={styles.previewRow}>
                          {headers.map((_, ci) => (
                            <View key={ci} style={styles.previewCell}>
                              <Text style={styles.previewVal} numberOfLines={2}>
                                {r[ci] || ""}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </>
              ) : null}

              <TouchableOpacity
                testID="run-import-btn"
                style={[styles.btnPrimary, { marginTop: 18 }, busy === "import" && { opacity: 0.6 }]}
                disabled={!!busy || rows.length === 0}
                onPress={doImport}
                activeOpacity={0.8}
              >
                {busy === "import" ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#000" />
                    <Text style={styles.btnPrimaryText}>
                      IMPORT {rows.length} ROW{rows.length === 1 ? "" : "S"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          {/* RESULT */}
          {importResult ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>
                ✅ Created {importResult.created} tool
                {importResult.created === 1 ? "" : "s"}
              </Text>
              {importResult.auto_created ? (() => {
                const ac = importResult.auto_created;
                const lines: { icon: keyof typeof Ionicons.glyphMap; label: string; items: any[] }[] = [
                  { icon: "folder-outline", label: "categor", items: ac.categories || [] },
                  { icon: "pricetag-outline", label: "tag", items: ac.tags || [] },
                  { icon: "location-outline", label: "location", items: ac.locations || [] },
                  { icon: "business-outline", label: "dealer", items: ac.dealers || [] },
                ].filter((l) => l.items.length > 0);
                if (!lines.length) return null;
                return (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.resultSub}>Auto-created (no duplicates):</Text>
                    {lines.map((l, i) => (
                      <View key={i} style={styles.autoCreatedRow}>
                        <Ionicons name={l.icon} size={14} color={theme.colors.accent} />
                        <Text style={styles.autoCreatedText} numberOfLines={2}>
                          {l.items.length}{" "}
                          {l.label === "categor"
                            ? l.items.length === 1
                              ? "category"
                              : "categories"
                            : `${l.label}${l.items.length === 1 ? "" : "s"}`}
                          : {l.items.map((x: any) => x.name).slice(0, 6).join(", ")}
                          {l.items.length > 6 ? `, …+${l.items.length - 6} more` : ""}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })() : null}
              {importResult.errors?.length ? (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.resultErr}>
                    {importResult.errors.length} row
                    {importResult.errors.length === 1 ? "" : "s"} skipped:
                  </Text>
                  {importResult.errors.slice(0, 8).map((e: any, i: number) => (
                    <Text key={i} style={styles.resultErrLine} numberOfLines={1}>
                      · row {e.row}: {e.error}
                    </Text>
                  ))}
                  {importResult.errors.length > 8 ? (
                    <Text style={styles.resultErrLine}>
                      …and {importResult.errors.length - 8} more
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.btnGhost, { marginTop: 10 }]}
                onPress={() => router.replace("/(tabs)/inventory")}
              >
                <Ionicons name="cube" size={16} color={theme.colors.textPrimary} />
                <Text style={styles.btnGhostText}>VIEW INVENTORY</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Field-picker modal */}
      <Modal
        visible={pickerForCol !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerForCol(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>MAP TO…</Text>
              <TouchableOpacity onPress={() => setPickerForCol(null)} hitSlop={10}>
                <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 460 }}>
              <TouchableOpacity
                style={styles.modalRow}
                onPress={() => {
                  if (pickerForCol !== null) {
                    setMapping((m) => ({ ...m, [pickerForCol]: SKIP_VALUE }));
                  }
                  setPickerForCol(null);
                }}
              >
                <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                <Text style={styles.modalRowText}>Skip this column</Text>
              </TouchableOpacity>
              {importFields.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={styles.modalRow}
                  onPress={() => {
                    if (pickerForCol !== null) {
                      setMapping((m) => ({ ...m, [pickerForCol]: f.id }));
                    }
                    setPickerForCol(null);
                  }}
                >
                  <Ionicons
                    name={f.required ? "star" : "ellipse-outline"}
                    size={16}
                    color={f.required ? theme.colors.accent : theme.colors.textMuted}
                  />
                  <Text style={styles.modalRowText}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  card: {
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 18,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  cardBody: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 14,
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  btnPrimaryText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 10,
  },
  btnGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  btnGhostText: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    letterSpacing: 1.5,
    fontSize: 9,
  },
  fileName: {
    color: theme.colors.textSecondary,
    marginTop: 10,
    fontSize: 9,
  },
  sectionLabel: {
    color: theme.colors.textPrimary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 18,
    marginBottom: 8,
  },
  helper: {
    color: theme.colors.textSecondary,
    fontSize: 9,
    marginBottom: 10,
    fontStyle: "italic",
  },
  mapRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    gap: 6,
  },
  mapHeader: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
    fontSize: 10,
  },
  mapSample: {
    color: theme.colors.textMuted,
    fontSize: 8,
    fontStyle: "italic",
  },
  mapBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
    minWidth: 140,
    maxWidth: 180,
  },
  mapBtnSkipped: {
    borderColor: theme.colors.border,
  },
  mapBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 9,
    fontWeight: "700",
    flex: 1,
  },
  mapBtnTextSkipped: {
    color: theme.colors.textMuted,
  },
  previewRow: { flexDirection: "row" },
  previewCell: {
    width: 130,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bg,
  },
  previewHead: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    fontSize: 8,
    letterSpacing: 1,
  },
  previewMap: {
    color: theme.colors.accent,
    fontSize: 7,
    marginTop: 2,
  },
  previewVal: {
    color: theme.colors.textSecondary,
    fontSize: 8,
    marginTop: 2,
  },
  resultBox: {
    marginTop: 18,
    padding: 12,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 8,
  },
  resultTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 1,
  },
  resultErr: {
    color: theme.colors.danger,
    fontWeight: "800",
    fontSize: 9,
  },
  resultErrLine: {
    color: theme.colors.textSecondary,
    fontSize: 8,
    marginTop: 2,
  },
  resultSub: {
    color: theme.colors.textPrimary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  autoCreatedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 2,
  },
  autoCreatedText: {
    color: theme.colors.textSecondary,
    fontSize: 8,
    flex: 1,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    overflow: "hidden",
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "900",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  modalRowText: {
    color: theme.colors.textPrimary,
    fontSize: 10,
  },
  exportFieldsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    flexWrap: "wrap",
    gap: 8,
  },
  exportFieldsHeading: {
    color: theme.colors.textPrimary,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  exportFieldsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  exportFieldsBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1,
  },
  exportFieldsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  exportFieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    backgroundColor: theme.colors.bg,
    flexBasis: "48%",
    minWidth: 130,
  },
  exportCheck: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  exportCheckOn: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  exportFieldLabel: {
    color: theme.colors.textPrimary,
    fontSize: 9,
    fontWeight: "700",
    flex: 1,
  },
  mapHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 8,
    flexWrap: "wrap",
    gap: 6,
  },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  smallBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1,
  },
  statusBanner: {
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 10,
    gap: 4,
  },
  statusBannerOk: {
    backgroundColor: "rgba(16,185,129,0.08)",
    borderColor: "rgba(16,185,129,0.5)",
  },
  statusBannerBad: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderColor: "rgba(239,68,68,0.5)",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    color: theme.colors.textPrimary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  statusSubText: {
    color: theme.colors.textSecondary,
    fontSize: 8,
    flex: 1,
  },
  mapBtnRequired: {
    borderColor: theme.colors.accent,
    borderWidth: 2,
  },
  mapBtnDup: {
    borderColor: theme.colors.warning || "#f59e0b",
  },
  formatToggle: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  formatBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  formatBtnActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  formatBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  formatBtnTextActive: {
    color: "#000",
  },
});
