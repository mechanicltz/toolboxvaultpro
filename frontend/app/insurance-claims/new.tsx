import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { themedStyles, useColors } from "../../src/themeContext";
import { ICSection, ICField, ICSelect, ICButton, ICDateField } from "../../src/components/insurance/ICKit";
import { insuranceApi, ClaimSpec } from "../../src/insuranceApi";

const blankInsurance = {
  company: "", policy_number: "", agent_name: "", agent_phone: "", agent_email: "",
  adjuster_name: "", adjuster_phone: "", adjuster_email: "", portal_url: "",
};

export default function ClaimForm() {
  const router = useRouter();
  const c = useColors();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = params.id;
  const isEdit = !!editId;

  const [spec, setSpec] = useState<ClaimSpec | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    title: "", claim_type: "Other", status: "Draft", claim_number: "",
    date_of_loss: "", date_discovered: "", loss_location: "", description: "",
    incident_notes: "", police_report_number: "", case_number: "", additional_notes: "",
    deductible: "", coverage_limit: "", depreciation: "", sales_tax: "",
    shipping_costs: "", labor_costs: "", repair_costs: "",
    insurance: { ...blankInsurance },
  });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const setIns = (k: string, v: any) => setForm((f: any) => ({ ...f, insurance: { ...f.insurance, [k]: v } }));

  useEffect(() => {
    insuranceApi.spec().then(setSpec).catch(() => {});
    if (isEdit) {
      insuranceApi.get(editId!).then((cl) => {
        setForm({
          ...cl,
          insurance: { ...blankInsurance, ...(cl.insurance || {}) },
          deductible: String(cl.deductible ?? ""), coverage_limit: String(cl.coverage_limit ?? ""),
          depreciation: String(cl.depreciation ?? ""), sales_tax: String(cl.sales_tax ?? ""),
          shipping_costs: String(cl.shipping_costs ?? ""), labor_costs: String(cl.labor_costs ?? ""),
          repair_costs: String(cl.repair_costs ?? ""),
        });
      }).catch(() => {}).finally(() => setLoading(false));
    }
  }, [editId]);

  const importProfile = useCallback(async () => {
    try {
      const p = await insuranceApi.getProfile();
      setForm((f: any) => ({
        ...f,
        insurance: {
          ...f.insurance,
          company: f.insurance.company || p.insurance_company || "",
          policy_number: f.insurance.policy_number || p.policy_number || "",
        },
      }));
      Alert.alert("Imported", "Insurance details pulled from your profile.");
    } catch {
      Alert.alert("Nothing to import", "No insurance info found in your profile yet.");
    }
  }, []);

  const num = (v: any) => (v === "" || v == null ? 0 : parseFloat(v) || 0);

  const save = async () => {
    if (!form.title?.trim()) {
      Alert.alert("Title required", "Please enter a claim title.");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      deductible: num(form.deductible), coverage_limit: num(form.coverage_limit),
      depreciation: num(form.depreciation), sales_tax: num(form.sales_tax),
      shipping_costs: num(form.shipping_costs), labor_costs: num(form.labor_costs),
      repair_costs: num(form.repair_costs),
    };
    try {
      if (isEdit) {
        await insuranceApi.update(editId!, payload);
        router.back();
      } else {
        const created = await insuranceApi.create(payload);
        router.replace(`/insurance-claims/${created.id}` as any);
      }
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Could not save the claim.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={c.accent} style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="icf-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEdit ? "Edit Claim" : "New Claim"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <ICSection title="Claim Details">
            <ICField label="Claim Title *" value={form.title} onChangeText={(t) => set("title", t)} placeholder="e.g. Shop Fire — June 2026" testID="icf-title" />
            <ICSelect label="Claim Type" value={form.claim_type} options={spec?.claim_types || []} onSelect={(v) => set("claim_type", v)} testID="icf-type" />
            {!isEdit && <ICSelect label="Status" value={form.status} options={spec?.statuses || []} onSelect={(v) => set("status", v)} testID="icf-status" />}
            <ICField label="Claim Number" value={form.claim_number} onChangeText={(t) => set("claim_number", t)} testID="icf-number" />
            <ICDateField label="Date of Loss" value={form.date_of_loss} onChange={(t) => set("date_of_loss", t)} testID="icf-dol" />
            <ICDateField label="Date Discovered" value={form.date_discovered} onChange={(t) => set("date_discovered", t)} testID="icf-dod" />
            <ICField label="Loss Location" value={form.loss_location} onChangeText={(t) => set("loss_location", t)} testID="icf-loc" />
          </ICSection>

          <ICSection title="Incident">
            <ICField label="Claim Description" value={form.description} onChangeText={(t) => set("description", t)} multiline testID="icf-desc" />
            <ICField label="Incident Notes" value={form.incident_notes} onChangeText={(t) => set("incident_notes", t)} multiline testID="icf-incident" />
            <ICField label="Police Report #" value={form.police_report_number} onChangeText={(t) => set("police_report_number", t)} testID="icf-police" />
            <ICField label="Case #" value={form.case_number} onChangeText={(t) => set("case_number", t)} testID="icf-case" />
            <ICField label="Additional Notes" value={form.additional_notes} onChangeText={(t) => set("additional_notes", t)} multiline testID="icf-addl" />
          </ICSection>

          <ICSection
            title="Insurance Information"
            right={
              <TouchableOpacity testID="icf-import" onPress={importProfile} style={styles.importBtn} activeOpacity={0.8}>
                <Ionicons name="download-outline" size={16} color={c.textOnAccent} />
                <Text style={styles.importText}>Import</Text>
              </TouchableOpacity>
            }
          >
            <ICField label="Insurance Company" value={form.insurance.company} onChangeText={(t) => setIns("company", t)} testID="icf-ins-company" />
            <ICField label="Policy Number" value={form.insurance.policy_number} onChangeText={(t) => setIns("policy_number", t)} testID="icf-ins-policy" />
            <ICField label="Agent Name" value={form.insurance.agent_name} onChangeText={(t) => setIns("agent_name", t)} testID="icf-agent-name" />
            <ICField label="Agent Phone" value={form.insurance.agent_phone} onChangeText={(t) => setIns("agent_phone", t)} keyboardType="phone-pad" testID="icf-agent-phone" />
            <ICField label="Agent Email" value={form.insurance.agent_email} onChangeText={(t) => setIns("agent_email", t)} keyboardType="email-address" autoCapitalize="none" testID="icf-agent-email" />
            <ICField label="Adjuster Name" value={form.insurance.adjuster_name} onChangeText={(t) => setIns("adjuster_name", t)} testID="icf-adj-name" />
            <ICField label="Adjuster Phone" value={form.insurance.adjuster_phone} onChangeText={(t) => setIns("adjuster_phone", t)} keyboardType="phone-pad" testID="icf-adj-phone" />
            <ICField label="Adjuster Email" value={form.insurance.adjuster_email} onChangeText={(t) => setIns("adjuster_email", t)} keyboardType="email-address" autoCapitalize="none" testID="icf-adj-email" />
            <ICField label="Claim Portal URL" value={form.insurance.portal_url} onChangeText={(t) => setIns("portal_url", t)} autoCapitalize="none" testID="icf-portal" />
          </ICSection>

          <ICSection title="Financials (optional)">
            <ICField label="Deductible" value={form.deductible} onChangeText={(t) => set("deductible", t)} keyboardType="decimal-pad" testID="icf-deductible" />
            <ICField label="Coverage Limit" value={form.coverage_limit} onChangeText={(t) => set("coverage_limit", t)} keyboardType="decimal-pad" testID="icf-limit" />
            <ICField label="Depreciation" value={form.depreciation} onChangeText={(t) => set("depreciation", t)} keyboardType="decimal-pad" testID="icf-depreciation" />
            <ICField label="Sales Tax" value={form.sales_tax} onChangeText={(t) => set("sales_tax", t)} keyboardType="decimal-pad" testID="icf-tax" />
            <ICField label="Shipping Costs" value={form.shipping_costs} onChangeText={(t) => set("shipping_costs", t)} keyboardType="decimal-pad" testID="icf-shipping" />
            <ICField label="Labor Costs" value={form.labor_costs} onChangeText={(t) => set("labor_costs", t)} keyboardType="decimal-pad" testID="icf-labor" />
            <ICField label="Repair Costs" value={form.repair_costs} onChangeText={(t) => set("repair_costs", t)} keyboardType="decimal-pad" testID="icf-repair" />
          </ICSection>

          <ICButton label={saving ? "Saving…" : isEdit ? "Save Changes" : "Create Claim"} icon="checkmark" onPress={save} disabled={saving} testID="icf-save" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.borderSubtle,
  },
  iconBtn: { padding: 8, minWidth: 40, alignItems: "center" },
  headerTitle: { color: c.textPrimary, fontSize: 18, fontWeight: "800" },
  importBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: c.accent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
  },
  importText: { color: c.textOnAccent, fontSize: 13, fontWeight: "800" },
}));
