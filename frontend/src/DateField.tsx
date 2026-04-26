import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";
import { formatDateUS, todayISO } from "./dateUtil";

/**
 * Cross-platform date field.
 * - Web: uses native <input type="date"> for the OS calendar/scrollwheel UI.
 * - Native: tap the field to open a centered modal with a spinner-style
 *   DateTimePicker (scroll wheels for month/day/year on iOS).
 *
 * Stores values as YYYY-MM-DD ISO under the hood, displays as MM/DD/YYYY.
 * Defaults the picker to today on first interaction when value is empty.
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
            fontSize: 15,
            fontFamily: "inherit",
            width: "100%",
            colorScheme: "dark",
            paddingTop: 2,
            paddingBottom: 2,
          }}
        />
        {value ? (
          <TouchableOpacity onPress={() => onChange("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        testID={testID}
        style={styles.input}
        onPress={() => setPickerOpen(true)}
        activeOpacity={0.7}
      >
        <Text
          style={{
            color: display ? theme.colors.textPrimary : theme.colors.textMuted,
            fontSize: 15,
            flex: 1,
          }}
        >
          {display || placeholder || "DD/MM/YYYY"}
        </Text>
        {value ? (
          <TouchableOpacity onPress={() => onChange("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="calendar-outline" size={18} color={theme.colors.textSecondary} />
        )}
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
  // Lazy import to avoid web bundle issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DateTimePicker = require("@react-native-community/datetimepicker").default;

  const initDate = (() => {
    const d = new Date(initial);
    if (isNaN(d.getTime())) return new Date();
    return d;
  })();
  const [picked, setPicked] = useState<Date>(initDate);

  const toISO = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  // Android shows a modal natively — so we render the picker inline only when visible
  if (Platform.OS === "android") {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={picked}
        mode="date"
        display="spinner"
        onChange={(_event: any, date?: Date) => {
          if (date) {
            onConfirm(toISO(date));
          } else {
            onCancel();
          }
        }}
      />
    );
  }

  // iOS — wrap in our own themed modal
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>SELECT DATE</Text>
          <DateTimePicker
            value={picked}
            mode="date"
            display="spinner"
            themeVariant="dark"
            textColor={theme.colors.textPrimary}
            onChange={(_event: any, date?: Date) => {
              if (date) setPicked(date);
            }}
            style={{ alignSelf: "stretch" }}
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            <TouchableOpacity style={styles.btnGhost} onPress={onCancel}>
              <Text style={styles.btnGhostText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => onConfirm(toISO(picked))}
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
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    gap: 8,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 24,
  },
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
  btn: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.sm,
  },
  btnText: { color: "#000", fontWeight: "800", letterSpacing: 2 },
  btnGhost: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
  },
  btnGhostText: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    letterSpacing: 2,
  },
});
