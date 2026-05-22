/**
 * Reports Hub — wizard for picking a report type, configuring options /
 * filters / fields, choosing a format, and dispatching the chosen action.
 * Backed by /api/reports/spec + /api/reports/render — the wizard never
 * has to know report internals.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { DateField } from "../../src/DateField";
import { runReport, ReportAction, ReportFormat } from "../../src/reportRunner";

import { themedStyles } from "../../src/themeContext";

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
  | { id: string; type: "number"; label: string }
  | { id: string; type: "date"; label: string }
  | { id: string; type: "select"; label: string; choices: string[] }
  | { id: string; type: "location"; label: string }
  | { id: string; type: "dealer_multi"; label: string }
  | { id: string; type: "dealer_single"; label: string }
  | { id: string; type: "tag_multi"; label: string }
  | { id: string; type: "brand_multi"; label: string }
  | { id: string; type: "borrower_multi"; label: string }
  | { id: string; type: "category_multi"; label: string }
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

// Wizard order: type → options → format → fields. Putting "format" before
// "fields" lets us know whether the user picked CSV (no column cap) or PDF
// (capped at 6) by the time we reach the Fields step.
type WizardStep = "type" | "options" | "format" | "fields";

const MAX_PDF_COLUMNS = 6;

// ---- Component ----------------------------------------------------------

export default function ReportsHubScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ preset?: string; dealer_id?: string; step?: string }>();
  const [specs, setSpecs] = useState<ReportSpec[] | null>(null);
  const [step, setStep] = useState<WizardStep>("type");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, any>>({});
  const [columns, setColumns] = useState<string[]>([]);
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [running, setRunning] = useState<ReportAction | null>(null);
  const presetApplied = useRef(false);

  // Fetch report catalog once. If the backend is unreachable we surface the
  // problem inline (specs stays null → loading spinner persists with a quiet
  // retry button) instead of a blocking iOS modal — fewer interruptions when
  // the user has spotty connectivity / the backend hiccups for a moment.
  const [loadError, setLoadError] = useState<string | null>(null);
  const fetchSpecs = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.get("/reports/spec");
      setSpecs((res.reports || []) as ReportSpec[]);
    } catch (e: any) {
      setLoadError(e?.message || "Failed to load report types");
    }
  }, []);
  useEffect(() => {
    fetchSpecs();
  }, [fetchSpecs]);

  // Reset to step 1 on focus (don't carry stale state if user navigates away
  // and back). Apply preset (e.g. "sales" from the for-sale screen) once.
  useFocusEffect(
    useMemo(
      () => () => {
        if (!presetApplied.current && params.preset && specs) {
          const sp = specs.find((s) => s.id === params.preset);
          if (sp) {
            applySpec(sp);
            // Pre-fill dealer filter if provided in the deep-link.
            if (params.dealer_id) {
              setOptions((prev) => ({
                ...prev,
                dealer_ids: [params.dealer_id],
              }));
            }
            // Allow caller to deep-link directly to the format/preview step.
            setStep((params.step as WizardStep) || "options");
            presetApplied.current = true;
          }
        }
      },
      [params.preset, params.dealer_id, params.step, specs],
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
      else if (
        f.type === "dealer_multi" ||
        f.type === "tag_multi" ||
        f.type === "brand_multi" ||
        f.type === "borrower_multi" ||
        f.type === "category_multi"
      )
        initOpts[f.id] = [];
      else if (f.type === "number") initOpts[f.id] = undefined;
      else initOpts[f.id] = "";
    }
    setOptions(initOpts);
    setColumns([...spec.default_columns]);
  }

  function pickType(spec: ReportSpec) {
    applySpec(spec);
    setStep(spec.options_schema?.length ? "options" : "format");
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
          {loadError ? (
            <>
              <Ionicons
                name="cloud-offline-outline"
                size={42}
                color={theme.colors.textMuted}
                style={{ marginBottom: 14 }}
              />
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: 13,
                  textAlign: "center",
                  marginBottom: 4,
                  paddingHorizontal: 24,
                }}
              >
                Can't reach the server right now.
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontSize: 11,
                  textAlign: "center",
                  marginBottom: 20,
                  paddingHorizontal: 32,
                }}
              >
                {loadError}
              </Text>
              <TouchableOpacity
                testID="reports-retry"
                style={{
                  paddingHorizontal: 22,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: theme.colors.accent,
                }}
                onPress={fetchSpecs}
              >
                <Text
                  style={{
                    color: "#000",
                    fontWeight: "900",
                    letterSpacing: 1.5,
                    fontSize: 12,
                  }}
                >
                  RETRY
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <ActivityIndicator color={theme.colors.accent} />
          )}
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
          {(() => {
            // Show the "leave dates blank for ALL dates" hint exactly once,
            // right above the first `date` field.
            let dateHintShown = false;
            return (selected.options_schema || []).map((f) => {
              const showDateHint = !dateHintShown && f.type === "date";
              if (showDateHint) dateHintShown = true;
              return (
                <View key={f.id}>
                  {showDateHint && (
                    <Text style={styles.dateHint}>
                      Leave dates blank for ALL dates
                    </Text>
                  )}
                  <OptionRow
                    field={f}
                    value={options[f.id]}
                    onChange={(v) => setOptions((o) => ({ ...o, [f.id]: v }))}
                  />
                </View>
              );
            });
          })()}
        </ScrollView>
        <FooterButtons
          onBack={() => setStep("type")}
          onNext={() => setStep("format")}
        />
      </SafeAreaView>
    );
  }

  if (step === "format" && selected) {
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title={selected.title}
          onBack={() => setStep(selected.options_schema?.length ? "options" : "type")}
        />
        <Crumbs current={2} />
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
        </ScrollView>
        <FooterButtons
          onBack={() => setStep(selected.options_schema?.length ? "options" : "type")}
          onNext={() => setStep("fields")}
        />
      </SafeAreaView>
    );
  }

  if (step === "fields" && selected) {
    const max = format === "pdf" ? MAX_PDF_COLUMNS : 999;
    const isFull = columns.length >= max;
    const moveColumn = (idx: number, dir: -1 | 1) => {
      setColumns((curr) => {
        const ni = idx + dir;
        if (ni < 0 || ni >= curr.length) return curr;
        const next = [...curr];
        const [it] = next.splice(idx, 1);
        next.splice(ni, 0, it);
        return next;
      });
    };
    const colSpecMap = new Map(selected.columns.map((c) => [c.id, c]));
    const unselected = selected.columns.filter((c) => !columns.includes(c.id));
    return (
      <SafeAreaView style={styles.container}>
        <Header title={selected.title} onBack={() => setStep("format")} />
        <Crumbs current={3} />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sectionLabel}>
            Columns to include
            {format === "pdf" ? `  (max ${MAX_PDF_COLUMNS} for PDF)` : ""}
          </Text>
          <Text style={styles.helper}>
            {columns.length} of {selected.columns.length} selected · drag-free
            order using the ⌃ ⌄ buttons
          </Text>

          {/* SELECTED — ordered, with up/down arrow controls */}
          {columns.length > 0 && (
            <View style={{ marginBottom: 18 }}>
              <Text style={styles.subLabel}>SELECTED · LEFT → RIGHT IN REPORT</Text>
              {columns.map((cid, idx) => {
                const c = colSpecMap.get(cid);
                if (!c) return null;
                return (
                  <View key={cid} style={styles.fieldRowSelected}>
                    <TouchableOpacity
                      style={styles.checkboxOn}
                      onPress={() => setColumns((curr) => curr.filter((x) => x !== cid))}
                      hitSlop={8}
                    >
                      <Ionicons name="checkmark" size={14} color="#000" />
                    </TouchableOpacity>
                    <Text style={[styles.fieldLabel, { flex: 1 }]} numberOfLines={1}>
                      {c.label}
                    </Text>
                    {c.type === "money" || c.type === "number" ? (
                      <Text style={styles.fieldHint}>SUMMED</Text>
                    ) : c.type === "image" ? (
                      <Text style={styles.fieldHint}>IMAGE</Text>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => moveColumn(idx, -1)}
                      disabled={idx === 0}
                      hitSlop={8}
                      style={[styles.arrowBtn, idx === 0 && { opacity: 0.3 }]}
                      testID={`field-up-${cid}`}
                    >
                      <Ionicons name="chevron-up" size={20} color={theme.colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveColumn(idx, 1)}
                      disabled={idx === columns.length - 1}
                      hitSlop={8}
                      style={[styles.arrowBtn, idx === columns.length - 1 && { opacity: 0.3 }]}
                      testID={`field-down-${cid}`}
                    >
                      <Ionicons name="chevron-down" size={20} color={theme.colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* UNSELECTED */}
          {unselected.length > 0 && (
            <View>
              <Text style={styles.subLabel}>AVAILABLE</Text>
              {unselected.map((c) => {
                const disabled = isFull;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.fieldRow, disabled && { opacity: 0.4 }]}
                    disabled={disabled}
                    onPress={() => setColumns((curr) => [...curr, c.id])}
                    activeOpacity={0.7}
                  >
                    <View style={styles.checkbox} />
                    <Text style={[styles.fieldLabel, { flex: 1 }]}>{c.label}</Text>
                    {c.type === "money" || c.type === "number" ? (
                      <Text style={styles.fieldHint}>SUMMED</Text>
                    ) : c.type === "image" ? (
                      <Text style={styles.fieldHint}>IMAGE</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {format === "pdf" && columns.length > MAX_PDF_COLUMNS ? (
            <Text style={styles.warn}>
              You have {columns.length} columns selected — PDF is capped at{" "}
              {MAX_PDF_COLUMNS}. Switch to CSV to keep them all.
            </Text>
          ) : null}
        </ScrollView>
        <View style={styles.footerBar}>
          <TouchableOpacity
            style={styles.btnGhost}
            onPress={() => setStep("format")}
            disabled={!!running}
          >
            <Text style={styles.btnGhostText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnPrimary, (running || columns.length === 0) && { opacity: 0.6 }]}
            disabled={!!running || columns.length === 0}
            onPress={() => {
              if (format === "pdf" && columns.length > MAX_PDF_COLUMNS) {
                setColumns(columns.slice(0, MAX_PDF_COLUMNS));
              }
              execute("view");
            }}
            testID="run-report-btn"
          >
            {running ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="eye" size={18} color="#000" />
                <Text style={styles.btnPrimaryText}>VIEW REPORT</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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
  const labels = ["Filters", "Format", "Fields"];
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
    return <LocationDropdown value={value} onChange={onChange} label={field.label} />;
  }
  if (field.type === "dealer_multi") {
    return <DealerMultiDropdown value={value || []} onChange={onChange} label={field.label} />;
  }
  if (field.type === "dealer_single") {
    return <DealerSingleDropdown value={value || ""} onChange={onChange} label={field.label} />;
  }
  if (field.type === "tag_multi") {
    return <TagMultiDropdown value={value || []} onChange={onChange} label={field.label} />;
  }
  if (field.type === "brand_multi") {
    return <BrandMultiDropdown value={value || []} onChange={onChange} label={field.label} />;
  }
  if (field.type === "borrower_multi") {
    return <BorrowerMultiDropdown value={value || []} onChange={onChange} label={field.label} />;
  }
  if (field.type === "category_multi") {
    return <CategoryMultiDropdown value={value || []} onChange={onChange} label={field.label} />;
  }
  if (field.type === "number") {
    return (
      <View style={styles.optionField}>
        <Text style={styles.optionLabel}>{field.label}</Text>
        <TextInput
          testID={`opt-num-${field.id}`}
          style={styles.numberInput}
          placeholder="—"
          placeholderTextColor={theme.colors.textMuted}
          value={value === undefined || value === null || value === "" ? "" : String(value)}
          onChangeText={(v) => {
            // Strip non-numeric characters except '.' and '-'
            const cleaned = v.replace(/[^0-9.\-]/g, "");
            if (cleaned === "") onChange(undefined);
            else {
              const n = parseFloat(cleaned);
              onChange(isNaN(n) ? undefined : n);
            }
          }}
          keyboardType="decimal-pad"
        />
      </View>
    );
  }
  return null;
}

// =============================================================================
// Dropdown primitives (single + multi select). Replaces the legacy chip rows
// for Location, Dealer, Tag, and Brand filters in the reports wizard.
// =============================================================================

type DropdownItem = { id: string; label: string };

function SingleSelectDropdown({
  label,
  value,
  onChange,
  items,
  loading,
  allLabel = "All",
  testIdPrefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: DropdownItem[];
  loading?: boolean;
  allLabel?: string;
  testIdPrefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, filter]);

  const selected = items.find((i) => i.id === value);
  const display = !value ? allLabel : selected?.label || allLabel;

  return (
    <View style={styles.optionField}>
      <Text style={styles.optionLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.dropdownBtn}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        testID={testIdPrefix ? `${testIdPrefix}-dropdown` : undefined}
      >
        <Text style={styles.dropdownBtnText} numberOfLines={1}>
          {display}
        </Text>
        <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.dropdownBg}>
          <View style={styles.dropdownCard}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>{label.toUpperCase()}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.dropdownSearch}
              placeholder="Search..."
              placeholderTextColor={theme.colors.textSecondary}
              value={filter}
              onChangeText={setFilter}
            />
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
              <TouchableOpacity
                style={[styles.dropdownRow, !value && styles.dropdownRowSelected]}
                onPress={() => {
                  onChange("");
                  setOpen(false);
                  setFilter("");
                }}
              >
                <Text style={styles.dropdownRowText}>{allLabel}</Text>
                {!value && <Ionicons name="checkmark" size={20} color={theme.colors.accent} />}
              </TouchableOpacity>
              {loading ? (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <ActivityIndicator color={theme.colors.accent} />
                </View>
              ) : filtered.length === 0 ? (
                <Text style={styles.dropdownEmpty}>No matches.</Text>
              ) : (
                filtered.map((i) => {
                  const active = value === i.id;
                  return (
                    <TouchableOpacity
                      key={i.id}
                      style={[styles.dropdownRow, active && styles.dropdownRowSelected]}
                      onPress={() => {
                        onChange(i.id);
                        setOpen(false);
                        setFilter("");
                      }}
                    >
                      <Text style={styles.dropdownRowText} numberOfLines={1}>{i.label}</Text>
                      {active && <Ionicons name="checkmark" size={20} color={theme.colors.accent} />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MultiSelectDropdown({
  label,
  value,
  onChange,
  items,
  loading,
  allLabel = "All",
  testIdPrefix,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  items: DropdownItem[];
  loading?: boolean;
  allLabel?: string;
  testIdPrefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, filter]);

  const display = (() => {
    if (!value.length) return allLabel;
    if (value.length === 1) {
      return items.find((i) => i.id === value[0])?.label || `${value.length} selected`;
    }
    return `${value.length} selected`;
  })();

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  return (
    <View style={styles.optionField}>
      <Text style={styles.optionLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.dropdownBtn}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        testID={testIdPrefix ? `${testIdPrefix}-dropdown` : undefined}
      >
        <Text style={styles.dropdownBtnText} numberOfLines={1}>
          {display}
        </Text>
        <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.dropdownBg}>
          <View style={styles.dropdownCard}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>{label.toUpperCase()}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.dropdownSearch}
              placeholder="Search..."
              placeholderTextColor={theme.colors.textSecondary}
              value={filter}
              onChangeText={setFilter}
            />
            <View style={styles.dropdownActions}>
              <TouchableOpacity onPress={() => onChange([])} style={styles.dropdownActionBtn}>
                <Text style={styles.dropdownActionText}>{allLabel} (clear)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onChange(items.map((i) => i.id))}
                style={styles.dropdownActionBtn}
              >
                <Text style={styles.dropdownActionText}>Select all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 380 }}>
              {loading ? (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <ActivityIndicator color={theme.colors.accent} />
                </View>
              ) : filtered.length === 0 ? (
                <Text style={styles.dropdownEmpty}>No matches.</Text>
              ) : (
                filtered.map((i) => {
                  const active = value.includes(i.id);
                  return (
                    <TouchableOpacity
                      key={i.id}
                      style={[styles.dropdownRow, active && styles.dropdownRowSelected]}
                      onPress={() => toggle(i.id)}
                    >
                      <View style={[styles.dropdownCheck, active && styles.dropdownCheckOn]}>
                        {active && <Ionicons name="checkmark" size={14} color="#000" />}
                      </View>
                      <Text style={[styles.dropdownRowText, { flex: 1 }]} numberOfLines={1}>
                        {i.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.dropdownDoneBtn}
              onPress={() => {
                setOpen(false);
                setFilter("");
              }}
            >
              <Text style={styles.dropdownDoneText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// =============================================================================
// Typed wrappers — fetch once, hand off to the generic dropdowns above.
// =============================================================================

function DealerSingleDropdown({
  value, onChange, label,
}: { value: string; onChange: (v: string) => void; label: string }) {
  const [dealers, setDealers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.get("/dealers").then((r: any) => {
      if (alive) {
        setDealers(r || []);
        setLoading(false);
      }
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return (
    <SingleSelectDropdown
      label={label}
      value={value}
      onChange={onChange}
      loading={loading}
      allLabel="All Dealers"
      items={dealers.map((d) => ({ id: d.id, label: d.name }))}
      testIdPrefix={`opt-${label.toLowerCase()}`}
    />
  );
}

function DealerMultiDropdown({
  value, onChange, label,
}: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  const [dealers, setDealers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.get("/dealers").then((r: any) => {
      if (alive) {
        setDealers(r || []);
        setLoading(false);
      }
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return (
    <MultiSelectDropdown
      label={label}
      value={value}
      onChange={onChange}
      loading={loading}
      allLabel="All Dealers"
      items={dealers.map((d) => ({ id: d.id, label: d.name }))}
      testIdPrefix={`opt-${label.toLowerCase()}`}
    />
  );
}

function LocationDropdown({
  value, onChange, label,
}: { value: string; onChange: (v: string) => void; label: string }) {
  const [locs, setLocs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.get("/locations").then((r: any) => {
      if (alive) {
        setLocs(r || []);
        setLoading(false);
      }
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return (
    <SingleSelectDropdown
      label={label}
      value={value}
      onChange={onChange}
      loading={loading}
      allLabel="All Locations"
      items={locs.map((l) => ({ id: l.id, label: l.name }))}
      testIdPrefix="opt-location"
    />
  );
}

function TagMultiDropdown({
  value, onChange, label,
}: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.get("/reports/filter-options").then((r: any) => {
      if (alive) {
        setTags(r?.tags || []);
        setLoading(false);
      }
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return (
    <MultiSelectDropdown
      label={label}
      value={value}
      onChange={onChange}
      loading={loading}
      allLabel="All Tags"
      items={tags.map((t) => ({ id: t.id, label: t.name }))}
      testIdPrefix="opt-tags"
    />
  );
}

function BrandMultiDropdown({
  value, onChange, label,
}: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  const [brands, setBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.get("/reports/filter-options").then((r: any) => {
      if (alive) {
        setBrands(r?.brands || []);
        setLoading(false);
      }
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return (
    <MultiSelectDropdown
      label={label}
      value={value}
      onChange={onChange}
      loading={loading}
      allLabel={brands.length ? "All Brands" : "No brands yet"}
      items={brands.map((b) => ({ id: b, label: b }))}
      testIdPrefix="opt-brands"
    />
  );
}

function BorrowerMultiDropdown({
  value, onChange, label,
}: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  const [borrowers, setBorrowers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.get("/borrowers").then((r: any) => {
      if (alive) {
        setBorrowers(r || []);
        setLoading(false);
      }
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return (
    <MultiSelectDropdown
      label={label}
      value={value}
      onChange={onChange}
      loading={loading}
      allLabel={borrowers.length ? "All People" : "No people yet"}
      items={borrowers.map((b) => ({ id: b.id, label: b.name }))}
      testIdPrefix="opt-people"
    />
  );
}

function CategoryMultiDropdown({
  value, onChange, label,
}: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.get("/categories").then((r: any) => {
      if (alive) {
        setCats(r || []);
        setLoading(false);
      }
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return (
    <MultiSelectDropdown
      label={label}
      value={value}
      onChange={onChange}
      loading={loading}
      allLabel={cats.length ? "All Categories" : "No categories yet"}
      items={cats.map((c) => ({ id: c.id, label: c.name }))}
      testIdPrefix="opt-categories"
    />
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

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerTitle: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
  },
  body: { padding: 16, paddingBottom: 100 },
  intro: {
    color: c.textSecondary,
    fontSize: 10,
    marginBottom: 16,
    lineHeight: 14,
  },
  // ---- type cards ----
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: c.bgSecondary,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: c.border,
  
    ...(theme.elevation.md as object),
  },
  typeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  typeTitle: { color: c.textPrimary, fontSize: 11, fontWeight: "800" },
  typeDesc: {
    color: c.textSecondary,
    fontSize: 8,
    marginTop: 3,
    lineHeight: 11,
  },
  // ---- crumbs ----
  crumbs: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: c.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  crumb: { flexDirection: "row", alignItems: "center" },
  crumbDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  crumbDotText: { fontSize: 8, fontWeight: "800", color: c.textSecondary },
  crumbLabel: {
    fontSize: 8,
    color: c.textSecondary,
    marginLeft: 6,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  crumbLine: { width: 18, height: 1, backgroundColor: c.border, marginHorizontal: 8 },
  // ---- options ----
  sectionLabel: {
    color: c.textPrimary,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 6,
    marginBottom: 10,
  },
  helper: {
    color: c.textSecondary,
    fontSize: 8,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  optionLabel: {
    color: c.textPrimary,
    fontSize: 10,
    flex: 1,
    marginLeft: 12,
  },
  optionField: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  numberInput: {
    marginTop: 6,
    backgroundColor: c.bgSecondary,
    color: c.textPrimary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.border,
    fontSize: 12,
  
    ...(theme.elevation.input as object),
  },
  input: {
    marginTop: 6,
    backgroundColor: c.bgSecondary,
    color: c.textPrimary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.border,
    fontSize: 10,
  
    ...(theme.elevation.input as object),
  },
  segmentedRow: {
    flexDirection: "row",
    marginTop: 6,
    backgroundColor: c.bgSecondary,
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
  segmentedBtnOn: { backgroundColor: "transparent", borderWidth: 2, borderColor: c.accent },
  segmentedText: { color: c.textPrimary, fontSize: 9, fontWeight: "700" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bgSecondary,
  
    ...(theme.elevation.md as object),
  },
  chipOn: { backgroundColor: "transparent", borderColor: c.accent, borderWidth: 2 },
  chipText: { color: c.textPrimary, fontSize: 8, fontWeight: "700" },
  // ---- fields ----
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  fieldRowSelected: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingRight: 4,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    gap: 10,
  },
  arrowBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  subLabel: {
    color: c.textSecondary,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 4,
  },
  dateHint: {
    color: c.textSecondary,
    fontSize: 8,
    fontStyle: "italic",
    marginBottom: 4,
    marginTop: 8,
  },
  // ---- generic dropdown ----
  dropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 8,
  
    ...(theme.elevation.md as object),
  },
  dropdownBtnText: {
    color: c.textPrimary,
    fontSize: 10,
    flex: 1,
  },
  dropdownBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  dropdownCard: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    overflow: "hidden",
    maxHeight: "85%",
  },
  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  dropdownTitle: {
    color: c.textPrimary,
    fontWeight: "900",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  dropdownSearch: {
    backgroundColor: c.bg,
    color: c.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  dropdownActions: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  dropdownActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: c.border,
  },
  dropdownActionText: {
    color: c.textPrimary,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  dropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    gap: 10,
  },
  dropdownRowSelected: {
    backgroundColor: "rgba(249, 115, 22,0.08)",
  },
  dropdownRowText: {
    color: c.textPrimary,
    fontSize: 10,
  },
  dropdownEmpty: {
    color: c.textSecondary,
    fontSize: 10,
    textAlign: "center",
    padding: 24,
    fontStyle: "italic",
  },
  dropdownCheck: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownCheckOn: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  dropdownDoneBtn: {
    backgroundColor: c.accent,
    paddingVertical: 14,
    alignItems: "center",
  },
  dropdownDoneText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: c.accent, borderColor: c.accent },
  fieldLabel: {
    color: c.textPrimary,
    fontSize: 10,
    flex: 1,
    marginLeft: 12,
  },
  fieldHint: {
    color: c.textSecondary,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1,
    backgroundColor: c.bgSecondary,
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
    borderColor: c.border,
    backgroundColor: c.bgSecondary,
  
    ...(theme.elevation.md as object),
  },
  formatCardOn: { backgroundColor: "transparent", borderColor: c.accent, borderWidth: 2 },
  formatTitle: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 8,
  },
  formatSub: {
    color: c.textSecondary,
    fontSize: 7,
    marginTop: 4,
    textAlign: "center",
    lineHeight: 10,
  },
  warn: {
    color: "#dc2626",
    fontSize: 8,
    marginTop: 12,
    fontStyle: "italic",
  },
  // ---- action ----
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.bgSecondary,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: c.border,
  
    ...(theme.elevation.md as object),
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { color: c.textPrimary, fontSize: 10, fontWeight: "800" },
  actionSub: { color: c.textSecondary, fontSize: 8, marginTop: 2 },
  summaryBox: {
    marginTop: 18,
    backgroundColor: c.bgSecondary,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
  
    ...(theme.elevation.md as object),
  },
  summaryHead: {
    color: c.textPrimary,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  summaryRow: { flexDirection: "row", paddingVertical: 4 },
  summaryKey: {
    width: 90,
    color: c.textSecondary,
    fontSize: 8,
    fontWeight: "700",
  },
  summaryVal: { color: c.textPrimary, fontSize: 9, flex: 1 },
  // ---- footer buttons ----
  footerBar: {
    flexDirection: "row",
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.bg,
  },
  btnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.border,
  },
  btnGhostText: { color: c.textPrimary, fontWeight: "800", fontSize: 9, letterSpacing: 1 },
  btnPrimary: {
    flex: 1,
    backgroundColor: c.accent,
    paddingVertical: 12,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnPrimaryText: { color: "#000", fontWeight: "900", fontSize: 10, letterSpacing: 1 },
}));
