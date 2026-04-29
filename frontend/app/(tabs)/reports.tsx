/**
 * Reports Hub — wizard for picking a report type, configuring options /
 * filters / fields, choosing a format, and dispatching the chosen action.
 * Backed by /api/reports/spec + /api/reports/render — the wizard never
 * has to know report internals.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { DateField } from "../../src/DateField";
import { runReport, ReportAction, ReportFormat } from "../../src/reportRunner";

// ---- Types --------------------------------------------------------------

type ColumnSpec = {
  id: string;
  label: string;
  align: "left" | "right" | "center";
  type: "text" | "money" | "number" | "date" | "image";
};
type OptionField =
  | { id: string; type: "toggle"; label: string; default?: boolean }
  | { id: string; type: "text"; label: string }
  | { id: string; type: "date"; label: string }
  | { id: string; type: "select"; label: string; choices: string[] }
  | { id: string; type: "location"; label: string }
  | { id: string; type: "dealer_multi"; label: string }
  | {
      id: string;
      type: "segmented";
      label: string;
      choices: { id: string; label: string }[];
      default?: string;
    };

type ReportSpec = {
  id: string;
  title: string;
  description: string;
  icon: string;
  accent: string;
  columns: ColumnSpec[];
  default_columns: string[];
  options_schema: OptionField[];
};

type WizardStep = "type" | "options" | "fields" | "format" | "action";

const MAX_PDF_COLUMNS = 6;

// ---- Component ----------------------------------------------------------

export default function ReportsHubScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ preset?: string }>();
  const [specs, setSpecs] = useState<ReportSpec[] | null>(null);
  const [step, setStep] = useState<WizardStep>("type");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, any>>({});
  const [columns, setColumns] = useState<string[]>([]);
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [running, setRunning] = useState<ReportAction | null>(null);
  const presetApplied = useRef(false);

  // Fetch report catalog once
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get("/reports/spec");
        if (active) setSpecs((res.reports || []) as ReportSpec[]);
      } catch (e: any) {
        Alert.alert("Error", "Could not load report types: " + (e?.message || ""));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Reset to step 1 on focus (don't carry stale state if user navigates away
  // and back). Apply preset (e.g. "sales" from the for-sale screen) once.
  useFocusEffect(
    useMemo(
      () => () => {
        if (!presetApplied.current && params.preset && specs) {
          const sp = specs.find((s) => s.id === params.preset);
          if (sp) {
            applySpec(sp);
            setStep("options");
            presetApplied.current = true;
          }
        }
      },
      [params.preset, specs],
    ),
  );

  const selected = useMemo(
    () => specs?.find((s) => s.id === selectedId) || null,
    [specs, selectedId],
  );

  function applySpec(spec: ReportSpec) {
    setSelectedId(spec.id);
    // Initialise options from defaults
    const initOpts: Record<string, any> = {};
    for (const f of spec.options_schema || []) {
      if (f.type === "toggle") initOpts[f.id] = (f as any).default ?? true;
      else if (f.type === "segmented")
        initOpts[f.id] = (f as any).default ?? (f as any).choices?.[0]?.id;
      else if (f.type === "dealer_multi") initOpts[f.id] = [];
      else initOpts[f.id] = "";
    }
    setOptions(initOpts);
    setColumns([...spec.default_columns]);
  }

  function pickType(spec: ReportSpec) {
    applySpec(spec);
    setStep(spec.options_schema?.length ? "options" : "fields");
  }

  async function execute(action: ReportAction) {
    if (!selected) return;
    setRunning(action);
    try {
      await runReport(
        {
          reportType: selected.id,
          format,
          columns,
          options,
        },
        action,
        {
          subject: selected.title,
          body: `Please find the attached ${selected.title}.`,
        },
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not generate the report.");
    } finally {
      setRunning(null);
    }
  }

  if (!specs) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="REPORTS" onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // ---- Render the active step --------------------------------------------

  if (step === "type") {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="REPORTS" onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.intro}>
            Pick a report. Each one walks you through filters, fields and
            export options.
          </Text>
          {specs.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.typeCard}
              onPress={() => pickType(s)}
              activeOpacity={0.85}
              testID={`pick-${s.id}`}
            >
              <View style={[styles.typeIcon, { backgroundColor: s.accent }]}>
                <Ionicons name={s.icon as any} size={22} color="#000" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.typeTitle}>{s.title}</Text>
                <Text style={styles.typeDesc}>{s.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === "options" && selected) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title={selected.title} onBack={() => setStep("type")} />
        <Crumbs current={1} />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sectionLabel}>Filters</Text>
          {(selected.options_schema || []).map((f) => (
            <OptionRow
              key={f.id}
              field={f}
              value={options[f.id]}
              onChange={(v) => setOptions((o) => ({ ...o, [f.id]: v }))}
            />
          ))}
        </ScrollView>
        <FooterButtons
          onBack={() => setStep("type")}
          onNext={() => setStep("fields")}
        />
      </SafeAreaView>
    );
  }

  if (step === "fields" && selected) {
    const max = format === "pdf" ? MAX_PDF_COLUMNS : 99;
    const isFull = columns.length >= max;
    return (
      <SafeAreaView style={styles.container}>
        <Header title={selected.title} onBack={() => setStep(selected.options_schema?.length ? "options" : "type")} />
        <Crumbs current={2} />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sectionLabel}>
            Choose columns
            {format === "pdf" ? `  (max ${MAX_PDF_COLUMNS} for PDF)` : ""}
          </Text>
          <Text style={styles.helper}>
            {columns.length} of {selected.columns.length} selected
          </Text>
          {selected.columns.map((c) => {
            const checked = columns.includes(c.id);
            const disabled = !checked && isFull;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.fieldRow, disabled && { opacity: 0.4 }]}
                disabled={disabled}
                onPress={() =>
                  setColumns((curr) =>
                    checked ? curr.filter((x) => x !== c.id) : [...curr, c.id],
                  )
                }
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                  {checked && <Ionicons name="checkmark" size={14} color="#000" />}
                </View>
                <Text style={styles.fieldLabel}>{c.label}</Text>
                {c.type === "money" || c.type === "number" ? (
                  <Text style={styles.fieldHint}>SUMMED</Text>
                ) : c.type === "image" ? (
                  <Text style={styles.fieldHint}>IMAGE</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <FooterButtons
          onBack={() => setStep(selected.options_schema?.length ? "options" : "type")}
          onNext={() => setStep("format")}
          disabled={columns.length === 0}
        />
      </SafeAreaView>
    );
  }

  if (step === "format" && selected) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title={selected.title} onBack={() => setStep("fields")} />
        <Crumbs current={3} />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sectionLabel}>Export format</Text>
          <View style={styles.formatRow}>
            <TouchableOpacity
              style={[styles.formatCard, format === "pdf" && styles.formatCardOn]}
              onPress={() => setFormat("pdf")}
            >
              <Ionicons name="document-text" size={28} color={format === "pdf" ? "#000" : theme.colors.textPrimary} />
              <Text style={[styles.formatTitle, format === "pdf" && { color: "#000" }]}>PDF</Text>
              <Text style={[styles.formatSub, format === "pdf" && { color: "#000" }]}>
                Formatted report{"\n"}max {MAX_PDF_COLUMNS} columns
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formatCard, format === "csv" && styles.formatCardOn]}
              onPress={() => setFormat("csv")}
            >
              <Ionicons name="grid" size={28} color={format === "csv" ? "#000" : theme.colors.textPrimary} />
              <Text style={[styles.formatTitle, format === "csv" && { color: "#000" }]}>CSV</Text>
              <Text style={[styles.formatSub, format === "csv" && { color: "#000" }]}>
                Spreadsheet file{"\n"}all columns supported
              </Text>
            </TouchableOpacity>
          </View>
          {format === "pdf" && columns.length > MAX_PDF_COLUMNS ? (
            <Text style={styles.warn}>
              You have {columns.length} columns selected — PDF is capped at{" "}
              {MAX_PDF_COLUMNS}. Switch to CSV to keep them all.
            </Text>
          ) : null}
        </ScrollView>
        <FooterButtons
          onBack={() => setStep("fields")}
          onNext={() => {
            // Auto-trim columns when moving forward into action with PDF cap
            if (format === "pdf" && columns.length > MAX_PDF_COLUMNS) {
              setColumns(columns.slice(0, MAX_PDF_COLUMNS));
            }
            setStep("action");
          }}
        />
      </SafeAreaView>
    );
  }

  if (step === "action" && selected) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title={selected.title} onBack={() => setStep("format")} />
        <Crumbs current={4} />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sectionLabel}>What would you like to do?</Text>
          <ActionCard
            icon="eye"
            title="View"
            sub="Open the report on this device"
            onPress={() => execute("view")}
            busy={running === "view"}
          />
          <ActionCard
            icon="mail"
            title="Email"
            sub={
              Platform.OS === "web"
                ? "Download then email — your mail app opens pre-filled"
                : "Open your mail app with the report attached"
            }
            onPress={() => execute("email")}
            busy={running === "email"}
          />
          <ActionCard
            icon="download"
            title="Save"
            sub={
              Platform.OS === "web"
                ? "Download the file"
                : "Save to Files / share to another app"
            }
            onPress={() => execute("save")}
            busy={running === "save"}
          />
          <View style={styles.summaryBox}>
            <Text style={styles.summaryHead}>Summary</Text>
            <SummaryRow k="Type" v={selected.title} />
            <SummaryRow k="Columns" v={`${columns.length} (${columns.join(", ")})`} />
            <SummaryRow k="Format" v={format.toUpperCase()} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

// ---- Sub-components -----------------------------------------------------

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={10}>
        <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

function Crumbs({ current }: { current: number }) {
  const labels = ["Filters", "Fields", "Format", "Action"];
  return (
    <View style={styles.crumbs}>
      {labels.map((l, i) => {
        const active = i + 1 === current;
        const done = i + 1 < current;
        return (
          <View key={l} style={styles.crumb}>
            <View
              style={[
                styles.crumbDot,
                active && { backgroundColor: theme.colors.accent },
                done && { backgroundColor: "#16a34a" },
              ]}
            >
              <Text style={[styles.crumbDotText, (active || done) && { color: "#000" }]}>
                {i + 1}
              </Text>
            </View>
            <Text style={[styles.crumbLabel, active && { color: theme.colors.textPrimary, fontWeight: "800" }]}>
              {l}
            </Text>
            {i < labels.length - 1 && <View style={styles.crumbLine} />}
          </View>
        );
      })}
    </View>
  );
}

function FooterButtons({
  onBack,
  onNext,
  disabled,
}: {
  onBack: () => void;
  onNext: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.footerBar}>
      <TouchableOpacity style={styles.btnGhost} onPress={onBack}>
        <Text style={styles.btnGhostText}>Back</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btnPrimary, disabled && { opacity: 0.4 }]}
        onPress={onNext}
        disabled={disabled}
      >
        <Text style={styles.btnPrimaryText}>Next</Text>
        <Ionicons name="chevron-forward" size={18} color="#000" />
      </TouchableOpacity>
    </View>
  );
}

function OptionRow({
  field,
  value,
  onChange,
}: {
  field: OptionField;
  value: any;
  onChange: (v: any) => void;
}) {
  if (field.type === "toggle") {
    return (
      <TouchableOpacity
        style={styles.optionRow}
        onPress={() => onChange(!value)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, !!value && styles.checkboxOn]}>
          {!!value && <Ionicons name="checkmark" size={14} color="#000" />}
        </View>
        <Text style={styles.optionLabel}>{field.label}</Text>
      </TouchableOpacity>
    );
  }
  if (field.type === "text") {
    return (
      <View style={styles.optionField}>
        <Text style={styles.optionLabel}>{field.label}</Text>
        <TextInput
          style={styles.input}
          placeholder="Optional"
          placeholderTextColor={theme.colors.textSecondary}
          value={value || ""}
          onChangeText={onChange}
        />
      </View>
    );
  }
  if (field.type === "date") {
    return (
      <View style={styles.optionField}>
        <Text style={styles.optionLabel}>{field.label}</Text>
        <DateField value={value || ""} onChange={onChange} />
      </View>
    );
  }
  if (field.type === "select") {
    return (
      <View style={styles.optionField}>
        <Text style={styles.optionLabel}>{field.label}</Text>
        <View style={styles.segmentedRow}>
          {(field as any).choices.map((c: string) => {
            const active = (value || "") === c;
            return (
              <TouchableOpacity
                key={c || "_any"}
                style={[styles.segmentedBtn, active && styles.segmentedBtnOn]}
                onPress={() => onChange(c)}
              >
                <Text style={[styles.segmentedText, active && { color: "#000" }]}>
                  {c || "Any"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }
  if (field.type === "segmented") {
    return (
      <View style={styles.optionField}>
        <Text style={styles.optionLabel}>{field.label}</Text>
        <View style={styles.segmentedRow}>
          {(field as any).choices.map((c: { id: string; label: string }) => {
            const active = value === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.segmentedBtn, active && styles.segmentedBtnOn]}
                onPress={() => onChange(c.id)}
              >
                <Text style={[styles.segmentedText, active && { color: "#000" }]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }
  if (field.type === "location") {
    return <LocationPicker value={value} onChange={onChange} label={field.label} />;
  }
  if (field.type === "dealer_multi") {
    return <DealerMultiPicker value={value || []} onChange={onChange} label={field.label} />;
  }
  return null;
}

function LocationPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const [locs, setLocs] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api.get("/locations").then((r: any) =>
      setLocs([{ id: "", name: "All locations" }, ...(r || [])]),
    );
  }, []);
  return (
    <View style={styles.optionField}>
      <Text style={styles.optionLabel}>{label}</Text>
      <View style={styles.chipWrap}>
        {locs.map((l) => {
          const active = (value || "") === l.id;
          return (
            <TouchableOpacity
              key={l.id || "_any"}
              style={[styles.chip, active && styles.chipOn]}
              onPress={() => onChange(l.id)}
            >
              <Text style={[styles.chipText, active && { color: "#000" }]}>{l.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function DealerMultiPicker({
  value,
  onChange,
  label,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
}) {
  const [dealers, setDealers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api.get("/dealers").then((r: any) => setDealers(r || []));
  }, []);
  const allSelected = dealers.length > 0 && value.length === 0;
  return (
    <View style={styles.optionField}>
      <Text style={styles.optionLabel}>{label}</Text>
      <View style={styles.chipWrap}>
        <TouchableOpacity
          style={[styles.chip, allSelected && styles.chipOn]}
          onPress={() => onChange([])}
        >
          <Text style={[styles.chipText, allSelected && { color: "#000" }]}>All Dealers</Text>
        </TouchableOpacity>
        {dealers.map((d) => {
          const active = value.includes(d.id);
          return (
            <TouchableOpacity
              key={d.id}
              style={[styles.chip, active && styles.chipOn]}
              onPress={() => {
                if (active) onChange(value.filter((x) => x !== d.id));
                else onChange([...value, d.id]);
              }}
            >
              <Text style={[styles.chipText, active && { color: "#000" }]}>{d.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function ActionCard({
  icon,
  title,
  sub,
  onPress,
  busy,
}: {
  icon: string;
  title: string;
  sub: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.actionCard}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.85}
      testID={`action-${title.toLowerCase()}`}
    >
      <View style={styles.actionIcon}>
        {busy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Ionicons name={icon as any} size={22} color="#000" />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
    </TouchableOpacity>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryKey}>{k}</Text>
      <Text style={styles.summaryVal} numberOfLines={2}>
        {v}
      </Text>
    </View>
  );
}

// ---- Styles -------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
  },
  body: { padding: 16, paddingBottom: 100 },
  intro: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 19,
  },
  // ---- type cards ----
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: theme.colors.cardBg,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  typeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  typeTitle: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: "800" },
  typeDesc: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },
  // ---- crumbs ----
  crumbs: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  crumb: { flexDirection: "row", alignItems: "center" },
  crumbDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  crumbDotText: { fontSize: 11, fontWeight: "800", color: theme.colors.textSecondary },
  crumbLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginLeft: 6,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  crumbLine: { width: 18, height: 1, backgroundColor: theme.colors.border, marginHorizontal: 8 },
  // ---- options ----
  sectionLabel: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 6,
    marginBottom: 10,
  },
  helper: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  optionLabel: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    flex: 1,
    marginLeft: 12,
  },
  optionField: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  input: {
    marginTop: 6,
    backgroundColor: theme.colors.cardBg,
    color: theme.colors.textPrimary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: 13,
  },
  segmentedRow: {
    flexDirection: "row",
    marginTop: 6,
    backgroundColor: theme.colors.cardBg,
    borderRadius: 6,
    padding: 3,
    flexWrap: "wrap",
  },
  segmentedBtn: {
    flex: 1,
    minWidth: 80,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 4,
    alignItems: "center",
  },
  segmentedBtnOn: { backgroundColor: theme.colors.accent },
  segmentedText: { color: theme.colors.textPrimary, fontSize: 12, fontWeight: "700" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardBg,
  },
  chipOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipText: { color: theme.colors.textPrimary, fontSize: 11, fontWeight: "700" },
  // ---- fields ----
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  fieldLabel: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    flex: 1,
    marginLeft: 12,
  },
  fieldHint: {
    color: theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    backgroundColor: theme.colors.cardBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  // ---- format ----
  formatRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  formatCard: {
    flex: 1,
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardBg,
  },
  formatCardOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  formatTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 8,
  },
  formatSub: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    marginTop: 4,
    textAlign: "center",
    lineHeight: 14,
  },
  warn: {
    color: "#dc2626",
    fontSize: 11,
    marginTop: 12,
    fontStyle: "italic",
  },
  // ---- action ----
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.cardBg,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: "800" },
  actionSub: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 2 },
  summaryBox: {
    marginTop: 18,
    backgroundColor: theme.colors.cardBg,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryHead: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  summaryRow: { flexDirection: "row", paddingVertical: 4 },
  summaryKey: {
    width: 90,
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  summaryVal: { color: theme.colors.textPrimary, fontSize: 12, flex: 1 },
  // ---- footer buttons ----
  footerBar: {
    flexDirection: "row",
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  btnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  btnGhostText: { color: theme.colors.textPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  btnPrimary: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    paddingVertical: 12,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnPrimaryText: { color: "#000", fontWeight: "900", fontSize: 13, letterSpacing: 1 },
});
