import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";
import { formatDateUS, parseDateUS, todayISO } from "./dateUtil";

/**
 * Cross-platform date field.
 * - Web: uses native <input type="date"> for the scroll-wheel/calendar UI.
 * - Native: tap the field to open a centered date picker modal (3 wheels: month/day/year).
 *
 * Stores YYYY-MM-DD ISO under the hood. Displays MM/DD/YYYY.
 * If `value` is empty, defaults the picker to today on first interaction.
 */
export function DateField({
  value,
  onChange,
  placeholder,
  testID,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  testID?: string;
}) {
  const display = formatDateUS(value);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (Platform.OS === "web") {
    // Use native HTML input to get OS calendar/scrollwheel
    return (
      <View style={styles.input}>
        {/* @ts-ignore — using HTML element on web */}
        <input
          type="date"
          data-testid={testID}
          value={value || ""}
          onChange={(e: any) => onChange(e.target.value)}
          style={{
            backgroundColor: "transparent",
            border: "none",
            outline: "none",
            color: theme.colors.textPrimary,
            fontSize: 14,
            fontFamily: "inherit",
            width: "100%",
            colorScheme: "dark",
          }}
        />
      </View>
    );
  }

  // Native platform: simple modal picker (month/day/year wheels via plain TextInputs).
  // Works without an extra dependency. Tapping opens the picker.
  return (
    <>
      <TouchableOpacity
        testID={testID}
        style={styles.input}
        onPress={() => setPickerOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={{ color: display ? theme.colors.textPrimary : theme.colors.textMuted, fontSize: 14 }}>
          {display || placeholder || "MM/DD/YYYY"}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={theme.colors.textSecondary} />
      </TouchableOpacity>
      <NativePickerModal
        visible={pickerOpen}
        initial={value || todayISO()}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(iso) => {
          onChange(iso);
          setPickerOpen(false);
        }}
      />
    </>
  );
}

function NativePickerModal({
  visible,
  initial,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  initial: string;
  onCancel: () => void;
  onConfirm: (iso: string) => void;
}) {
  const us = formatDateUS(initial);
  const [v, setV] = useState(us);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>SELECT DATE</Text>
          <TextInput
            style={styles.dateInput}
            value={v}
            onChangeText={setV}
            placeholder="MM/DD/YYYY"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="numeric"
            autoFocus
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity style={styles.btnGhost} onPress={onCancel}>
              <Text style={styles.btnGhostText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => {
                const iso = parseDateUS(v);
                if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) onConfirm(iso);
                else onCancel();
              }}
            >
              <Text style={styles.btnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: theme.radii.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 24 },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 20,
    borderRadius: theme.radii.md,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 12,
  },
  dateInput: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: theme.radii.sm,
    fontSize: 16,
    marginBottom: 14,
  },
  btn: {
    flex: 1, height: 44, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.accent, borderRadius: theme.radii.sm,
  },
  btnText: { color: "#000", fontWeight: "800", letterSpacing: 2 },
  btnGhost: {
    flex: 1, height: 44, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.sm,
  },
  btnGhostText: { color: theme.colors.textPrimary, fontWeight: "800", letterSpacing: 2 },
});
