import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";
import { formatDateUS, parseDateUS, todayISO } from "./dateUtil";

import { themedStyles, useThemeMode, useColors } from "./themeContext";

/**
 * Cross-platform date field. Always displays/inputs in MM/DD/YYYY (US).
 * Stored value is YYYY-MM-DD ISO under the hood.
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
  const [text, setText] = useState(display);
  const hiddenRef = useRef<any>(null);

  // Sync displayed text whenever the external value changes (form reset, edit load, etc.)
  useEffect(() => {
    setText(display);
  }, [display]);

  // Auto-mask MM/DD/YYYY as the user types
  const handleType = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let out = digits;
    if (digits.length >= 5) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length >= 3) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setText(out);
    if (digits.length === 8) {
      const mm = digits.slice(0, 2);
      const dd = digits.slice(2, 4);
      const yyyy = digits.slice(4);
      const m = parseInt(mm, 10);
      const d = parseInt(dd, 10);
      const y = parseInt(yyyy, 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2200) {
        onChange(`${yyyy}-${mm}-${dd}`);
      }
    } else if (digits.length === 0) {
      onChange("");
    }
  };

  if (Platform.OS === "web") {
    // Use a masked text input on web so the visible format is ALWAYS
    // MM/DD/YYYY regardless of the browser's locale (per user
    // 2026-05-26: every date input + display in the app must use US
    // MM/DD/YYYY). The internal `value` is still stored as ISO
    // YYYY-MM-DD and the parent receives the same ISO via onChange.
    return (
      <View style={styles.input}>
        <TextInput
          testID={testID}
          value={text}
          onChangeText={handleType}
          placeholder={placeholder || "MM/DD/YYYY"}
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="numeric"
          maxLength={10}
          style={{
            flex: 1,
            color: theme.colors.textPrimary,
            fontSize: 11,
            paddingTop: 4,
            paddingBottom: 4,
            // @ts-ignore — web-only
            outline: "none" as any,
          }}
        />
        {value ? (
          <TouchableOpacity onPress={() => { onChange(""); setText(""); }} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="calendar-outline" size={18} color={theme.colors.textSecondary} />
        )}
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
            fontSize: 11,
            flex: 1,
          }}
        >
          {display || placeholder || "MM/DD/YYYY"}
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
  // Sync the iOS spinner picker with the user's chosen theme. Previously this
  // was hardcoded to "dark" — in Light mode the highlighted month became
  // black-on-light-gray and was unreadable. (User report #5.)
  const { mode } = useThemeMode();
  const colors = useColors();
  const isDark = mode === "dark";

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
            themeVariant={isDark ? "dark" : "light"}
            textColor={colors.textPrimary}
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

const styles = themedStyles((c) => ({
  input: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    gap: 8,
  
    ...(theme.elevation.input as object),
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: c.bgSecondary,
    padding: 20,
    borderRadius: theme.radii.md,
    borderTopWidth: 2,
    borderTopColor: c.accent,
  },
  modalTitle: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 12,
  },
  btn: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.accent,
    borderRadius: theme.radii.sm,
  },
  btnText: { color: "#000", fontWeight: "800", letterSpacing: 2 },
  btnGhost: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: theme.radii.sm,
  },
  btnGhostText: {
    color: c.textPrimary,
    fontWeight: "800",
    letterSpacing: 2,
  },
}));
