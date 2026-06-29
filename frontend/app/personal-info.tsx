import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { AppSwitch } from "../src/components/AppSwitch";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useAppResume } from "../src/appLifecycle";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { useAuth } from "../src/AuthContext";
import { formatPhone } from "../src/contactLinks";

import { themedStyles } from "../src/themeContext";
import { IndustrialBanner } from "../src/components/IndustrialBanner";
import { SkinPlate } from "../src/components/SkinPlate";

type Profile = {
  name: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  phone: string;
  email: string;
  policy_number: string;
  insurance_company: string;
  notes: string;
  is_company: boolean;
};

const EMPTY: Profile = {
  name: "",
  address: "",
  address2: "",
  city: "",
  state: "",
  zip_code: "",
  country: "",
  phone: "",
  email: "",
  policy_number: "",
  insurance_company: "",
  notes: "",
  is_company: false,
};

export default function PersonalInfoScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [form, setForm] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // #16: default to a READ-ONLY view. Tapping EDIT switches to the form.
  const [editing, setEditing] = useState(false);
  // Single-panel section toggle: "personal" vs "insurance" info.
  const [section, setSection] = useState<"personal" | "insurance">("personal");

  const load = useCallback(async () => {
    try {
      const p = await api.getPersonalProfile();
      const merged = { ...EMPTY, ...(p || {}) };
      setForm(merged);
      // First-time users (no name saved yet) go straight into edit mode.
      setEditing(!String(merged.name || "").trim());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


  const update = (k: keyof Profile, v: any) => setForm({ ...form, [k]: v });

  const save = async () => {
    if (!form.name.trim()) {
      Alert.alert(
        "Name required",
        "Please enter your name (or company name) before saving."
      );
      return;
    }
    setSaving(true);
    try {
      // #32 — Email is centralized: always store the account login email so
      // Personal Info, Insurance Reports and Bug Reports stay in sync.
      await api.updatePersonalProfile({ ...form, email: user?.email || form.email });
      setEditing(false);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not save profile.");
    } finally {
      setSaving(false);
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
      <IndustrialBanner
        title="Personal Details"
        onBack={() => router.back()}
        rightSlot={undefined}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Two-button segmented toggle — switches the single panel's content */}
          <View style={styles.segRow}>
            {(["personal", "insurance"] as const).map((s) => (
              <TouchableOpacity
                key={s}
                testID={`pi-seg-${s}`}
                style={[styles.segBtn, section === s && styles.segBtnActive]}
                onPress={() => setSection(s)}
                activeOpacity={0.85}
              >
                <Text style={[styles.segText, section === s && styles.segTextActive]}>
                  {s === "personal" ? "PERSONAL INFO" : "INSURANCE INFO"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ONE static skinned panel — content driven by the toggle + edit mode */}
          <SkinPlate style={styles.panel} padX={14} padTop={10} padBottom={10}>
            {section === "personal" ? (
              editing ? (
                <>
                  <View style={styles.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.toggleLabel}>
                        {form.is_company ? "COMPANY ENTITY" : "INDIVIDUAL"}
                      </Text>
                      <Text style={styles.toggleHint}>
                        Toggle if this profile is for a business / company instead of a person.
                      </Text>
                    </View>
                    <AppSwitch
                      testID="pi-is-company"
                      value={form.is_company}
                      onValueChange={(v) => update("is_company", v)}
                      trackColor={{ false: theme.colors.surface, true: theme.colors.accent }}
                      thumbColor="#fff"
                    />
                  </View>

                  <Field label={form.is_company ? "Company Name" : "Full Name"} value={form.name} onChange={(v) => update("name", v)} testID="pi-name" required />
                  <Field label="Street Address" value={form.address} onChange={(v) => update("address", v)} testID="pi-address" placeholder="123 Main St" />
                  <Field label="Apt / Suite (optional)" value={form.address2} onChange={(v) => update("address2", v)} testID="pi-address2" placeholder="Unit 4B" />
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 2 }}>
                      <Field label="City" value={form.city} onChange={(v) => update("city", v)} testID="pi-city" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field label="State" value={form.state} onChange={(v) => update("state", v)} testID="pi-state" placeholder="CA" />
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field label="Zip / Postal Code" value={form.zip_code} onChange={(v) => update("zip_code", v)} testID="pi-zip" keyboardType="numbers-and-punctuation" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field label="Country" value={form.country} onChange={(v) => update("country", v)} testID="pi-country" placeholder="USA" />
                    </View>
                  </View>
                  <Field
                    label="Phone"
                    value={formatPhone(form.phone)}
                    onChange={(v) => update("phone", String(v || "").replace(/\D/g, "").slice(0, 10))}
                    testID="pi-phone"
                    keyboardType="phone-pad"
                    placeholder="555-555-5555"
                  />
                  <Text style={styles.lockedLabel}>EMAIL (LOGIN)</Text>
                  <View style={styles.lockedRow}>
                    <Text style={styles.lockedEmail} numberOfLines={1}>{user?.email || form.email || "—"}</Text>
                    <Ionicons name="lock-closed" size={14} color={theme.colors.textMuted} />
                  </View>
                  <TouchableOpacity testID="pi-edit-change-email" onPress={() => router.push("/change-email")} style={styles.changeEmailInline} activeOpacity={0.8}>
                    <Text style={styles.changeEmailInlineText}>Change Login Email</Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.colors.accent} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <InfoRow label="Type" value={form.is_company ? "Company Entity" : "Individual"} />
                  <InfoRow label={form.is_company ? "Company Name" : "Full Name"} value={form.name} />
                  <InfoRow label="Phone" value={form.phone ? formatPhone(form.phone) : ""} />
                  <InfoRow label="Email" value={user?.email || form.email} />
                  <InfoRow label="Street" value={form.address} />
                  {!!form.address2 && <InfoRow label="Apt / Suite" value={form.address2} />}
                  <InfoRow label="City" value={form.city} />
                  <InfoRow label="State" value={form.state} />
                  <InfoRow label="Zip / Postal" value={form.zip_code} />
                  <InfoRow label="Country" value={form.country} last />
                </>
              )
            ) : editing ? (
              <>
                <Field label="Insurance Company" value={form.insurance_company} onChange={(v) => update("insurance_company", v)} testID="pi-ins-co" placeholder="State Farm" />
                <Field label="Policy Number" value={form.policy_number} onChange={(v) => update("policy_number", v)} testID="pi-policy" placeholder="ABC-12345" />
                <Field label="Notes" value={form.notes} onChange={(v) => update("notes", v)} testID="pi-notes" multiline placeholder="Anything extra to include on reports..." />
              </>
            ) : (
              <>
                <InfoRow label="Insurance Co." value={form.insurance_company} />
                <InfoRow label="Policy #" value={form.policy_number} />
                <InfoRow label="Notes" value={form.notes} last />
              </>
            )}
          </SkinPlate>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.actionBar}>
        {editing ? (
          <>
            <TouchableOpacity
              testID="pi-cancel"
              style={styles.btnGhost}
              onPress={() => {
                // Discard unsaved edits and return to the read-only view.
                load();
              }}
            >
              <Text style={styles.btnGhostText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="pi-save"
              style={[styles.btnPrimary, saving && { opacity: 0.6 }]}
              onPress={save}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.btnPrimaryText}>SAVE</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            testID="pi-edit"
            style={styles.btnPrimary}
            onPress={() => setEditing(true)}
          >
            <Ionicons name="create-outline" size={16} color="#000" />
            <Text style={[styles.btnPrimaryText, { marginLeft: 8 }]}>
              EDIT INFORMATION
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  multiline,
  placeholder,
  keyboardType,
  autoCapitalize,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  multiline?: boolean;
  placeholder?: string;
  keyboardType?: any;
  autoCapitalize?: any;
  testID?: string;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.fieldLabel}>
        {label.toUpperCase()}
        {required ? " *" : ""}
      </Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder || ""}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          styles.input,
          multiline && { minHeight: 80, textAlignVertical: "top" },
        ]}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

function InfoRow({
  label,
  value,
  last,
}: {
  label: string;
  value?: string;
  last?: boolean;
}) {
  const shown = String(value || "").trim();
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label.toUpperCase()}</Text>
      <Text
        style={[styles.infoValue, !shown && styles.infoValueEmpty]}
        numberOfLines={3}
      >
        {shown || "—"}
      </Text>
    </View>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  bannerEdit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  bannerEditText: {
    color: "#F97316",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  viewCard: {
    marginTop: 6,
    marginBottom: 2,
  },
  segRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: theme.radii?.md ?? 8,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    backgroundColor: c.bgSecondary,
  },
  segBtnActive: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  segText: {
    color: c.textSecondary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  segTextActive: {
    color: "#000",
  },
  panel: {
    marginTop: 2,
  },
  viewSection: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 18,
    marginBottom: 2,
    marginLeft: 2,
  },
  infoRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  infoValue: {
    color: c.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  infoValueEmpty: {
    color: c.textMuted,
    fontWeight: "500",
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomColor: c.border,
    borderBottomWidth: 1,
  },
  title: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },
  subtitle: {
    color: c.accent,
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    padding: 14,
    marginBottom: 4,
  
    ...(theme.elevation.md as object),
  },
  toggleLabel: {
    color: c.textPrimary,
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 9,
  },
  toggleHint: {
    color: c.textMuted,
    fontSize: 8,
    marginTop: 4,
  },
  fieldLabel: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  input: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    color: c.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 46,
    borderRadius: 4,
    fontSize: 10,
  
    ...(theme.elevation.input as object),
  },
  divider: {
    height: 1,
    backgroundColor: c.border,
    marginTop: 24,
    marginBottom: 6,
  },
  changeEmailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  changeEmailText: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  lockedLabel: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 14,
    marginBottom: 6,
  },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  lockedEmail: {
    flex: 1,
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  changeEmailInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 8,
    marginTop: 2,
  },
  changeEmailInlineText: {
    color: c.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  sectionTitle: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 8,
    marginBottom: 4,
  },
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: "rgba(15,15,15,0.96)",
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  btnGhost: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  btnGhostText: {
    color: c.textPrimary,
    fontWeight: "900",
    letterSpacing: 2,
  },
  btnPrimary: {
    flex: 2,
    height: 50,
    flexDirection: "row",
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  btnPrimaryText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 10,
  },
}));
