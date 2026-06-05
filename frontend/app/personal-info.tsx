import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useAppResume } from "../src/appLifecycle";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { formatPhone } from "../src/contactLinks";

import { themedStyles } from "../src/themeContext";
import { IndustrialBanner } from "../src/components/IndustrialBanner";

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
  const [form, setForm] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api.getPersonalProfile();
      setForm({ ...EMPTY, ...(p || {}) });
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
      await api.updatePersonalProfile(form);
      router.back();
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
        title="PERSONAL INFORMATION"
        subtitle="Used for Insurance Reports"
        leftSlot={
          <TouchableOpacity testID="pi-back" onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color="#F97316" />
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>
                {form.is_company ? "COMPANY ENTITY" : "INDIVIDUAL"}
              </Text>
              <Text style={styles.toggleHint}>
                Toggle if this profile is for a business / company instead of a
                person.
              </Text>
            </View>
            <Switch
              testID="pi-is-company"
              value={form.is_company}
              onValueChange={(v) => update("is_company", v)}
              trackColor={{
                false: theme.colors.surface,
                true: theme.colors.accent,
              }}
              thumbColor="#fff"
            />
          </View>

          <Field
            label={form.is_company ? "Company Name" : "Full Name"}
            value={form.name}
            onChange={(v) => update("name", v)}
            testID="pi-name"
            required
          />

          <Field
            label="Street Address"
            value={form.address}
            onChange={(v) => update("address", v)}
            testID="pi-address"
            placeholder="123 Main St"
          />

          <Field
            label="Apt / Suite (optional)"
            value={form.address2}
            onChange={(v) => update("address2", v)}
            testID="pi-address2"
            placeholder="Unit 4B"
          />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 2 }}>
              <Field
                label="City"
                value={form.city}
                onChange={(v) => update("city", v)}
                testID="pi-city"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="State"
                value={form.state}
                onChange={(v) => update("state", v)}
                testID="pi-state"
                placeholder="CA"
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Zip / Postal Code"
                value={form.zip_code}
                onChange={(v) => update("zip_code", v)}
                testID="pi-zip"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Country"
                value={form.country}
                onChange={(v) => update("country", v)}
                testID="pi-country"
                placeholder="USA"
              />
            </View>
          </View>

          <Field
            label="Phone"
            value={formatPhone(form.phone)}
            onChange={(v) => {
              // Keep only digits (max 10) so the stored value is canonical.
              const digits = String(v || "").replace(/\D/g, "").slice(0, 10);
              update("phone", digits);
            }}
            testID="pi-phone"
            keyboardType="phone-pad"
            placeholder="555-555-5555"
          />

          <Field
            label="Email"
            value={form.email}
            onChange={(v) => update("email", v)}
            testID="pi-email"
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="you@example.com"
          />

          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>INSURANCE (OPTIONAL)</Text>

          <Field
            label="Insurance Company"
            value={form.insurance_company}
            onChange={(v) => update("insurance_company", v)}
            testID="pi-ins-co"
            placeholder="State Farm"
          />

          <Field
            label="Policy Number"
            value={form.policy_number}
            onChange={(v) => update("policy_number", v)}
            testID="pi-policy"
            placeholder="ABC-12345"
          />

          <Field
            label="Notes"
            value={form.notes}
            onChange={(v) => update("notes", v)}
            testID="pi-notes"
            multiline
            placeholder="Anything extra to include on reports..."
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.actionBar}>
        <TouchableOpacity
          testID="pi-cancel"
          style={styles.btnGhost}
          onPress={() => router.back()}
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

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
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
