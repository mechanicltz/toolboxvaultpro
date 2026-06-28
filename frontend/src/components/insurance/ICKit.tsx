/**
 * Shared themed building blocks for the Insurance Claims screens.
 * All adapt to light / dark / industrial-skin via useColors + SkinPlate.
 */
import React, { ReactNode, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Platform, KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { themedStyles, useColors } from "../../themeContext";
import { SkinPlate } from "../SkinPlate";
import { DateField } from "../../DateField";

export const ICSection = ({ title, right, children, testID }: {
  title: string; right?: ReactNode; children: ReactNode; testID?: string;
}) => {
  const s = styles;
  return (
    <SkinPlate style={{ marginBottom: 14 }} padX={18} padTop={16} padBottom={16} frame="window" testID={testID}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{title.toUpperCase()}</Text>
        {right}
      </View>
      {children}
    </SkinPlate>
  );
};

export const ICField = ({ label, value, onChangeText, placeholder, keyboardType, multiline, testID, autoCapitalize }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: any; multiline?: boolean; testID?: string; autoCapitalize?: any;
}) => {
  const c = useColors();
  const s = styles;
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value ?? ""}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        style={[s.input, multiline && { height: 90, textAlignVertical: "top" }]}
      />
    </View>
  );
};

export const ICSelect = ({ label, value, options, onSelect, testID }: {
  label: string; value: string; options: string[]; onSelect: (v: string) => void; testID?: string;
}) => {
  const c = useColors();
  const s = styles;
  const [open, setOpen] = useState(false);
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TouchableOpacity testID={testID} style={s.input} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: value ? c.textPrimary : c.textMuted, fontSize: 15 }}>{value || "Select…"}</Text>
          <Ionicons name="chevron-down" size={16} color={c.textMuted} />
        </View>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {options.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  testID={`${testID}-opt-${opt}`}
                  style={[s.optRow, value === opt && { backgroundColor: c.surfaceAlt }]}
                  onPress={() => { onSelect(opt); setOpen(false); }}
                >
                  <Text style={{ color: c.textPrimary, fontSize: 15 }}>{opt}</Text>
                  {value === opt && <Ionicons name="checkmark" size={18} color={c.accent} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export const ICButton = ({ label, onPress, icon, variant = "primary", testID, disabled }: {
  label: string; onPress: () => void; icon?: any; variant?: "primary" | "ghost" | "danger"; testID?: string; disabled?: boolean;
}) => {
  const c = useColors();
  const bg = variant === "primary" ? c.accent : variant === "danger" ? c.danger : c.surface;
  const fg = variant === "ghost" ? c.textPrimary : c.textOnAccent;
  return (
    <TouchableOpacity
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
        backgroundColor: bg, borderWidth: variant === "ghost" ? 1.5 : 0, borderColor: c.accent,
        paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12, minHeight: 50, opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon && <Ionicons name={icon} size={19} color={fg} />}
      <Text style={{ color: fg, fontWeight: "800", fontSize: 15 }}>{label}</Text>
    </TouchableOpacity>
  );
};

/** Date field that matches ICField look but opens the app's native date picker. */
export const ICDateField = ({ label, value, onChange, placeholder, testID }: {
  label: string; value: string; onChange: (iso: string) => void; placeholder?: string; testID?: string;
}) => {
  const s = styles;
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <DateField value={value} onChange={onChange} placeholder={placeholder} testID={testID} />
    </View>
  );
};

export const ICModal = ({ visible, onClose, title, children, footer }: {
  visible: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
}) => {
  const s = styles;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.modalBg}>
        <View style={s.bigSheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{title}</Text>
            <TouchableOpacity testID="ic-modal-close" onPress={onClose}><Ionicons name="close" size={24} color="#888" /></TouchableOpacity>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            style={footer ? { flexGrow: 0 } : undefined}
          >
            {children}
          </ScrollView>
          {footer ? <View style={s.sheetFooter}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = themedStyles((c) => ({
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: c.accent, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  fieldWrap: { marginBottom: 12 },
  fieldLabel: { color: c.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 0.3, marginBottom: 5 },
  input: {
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 9,
    paddingHorizontal: 12, paddingVertical: 10, color: c.textPrimary, fontSize: 15, minHeight: 44,
    justifyContent: "center",
  },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.bgSecondary, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 28 },
  bigSheet: {
    backgroundColor: c.bgSecondary, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 16, paddingBottom: 28, maxHeight: "88%",
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sheetTitle: { color: c.textPrimary, fontSize: 17, fontWeight: "800" },
  sheetFooter: { paddingTop: 10, borderTopWidth: 1, borderTopColor: c.borderSubtle, flexDirection: "row", gap: 10 },
  optRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 13, paddingHorizontal: 10, borderRadius: 8,
  },
}));
