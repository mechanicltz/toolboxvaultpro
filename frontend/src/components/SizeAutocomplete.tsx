import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import { api } from "../api";

/**
 * Smart Size field. A single-value text box that suggests sizes the user has
 * entered before (autocomplete) and remembers any new size typed (the backend
 * upserts the size when the tool is saved). Mirrors BrandAutocomplete so the
 * option list grows from the user's own input over time.
 */
export function SizeAutocomplete({
  value,
  onChange,
  inputStyle,
  placeholder = '1/2"',
  testID,
}: {
  value: string;
  onChange: (v: string) => void;
  inputStyle?: StyleProp<TextStyle>;
  placeholder?: string;
  testID?: string;
}) {
  const [sizes, setSizes] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listSizes()
      .then((rows: any[]) => {
        if (alive) setSizes((rows || []).map((s) => String(s.name || "")).filter(Boolean));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const suggestions = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    const list = sizes.filter((s) => {
      const ls = s.toLowerCase();
      if (!q) return true;
      return ls.includes(q) && ls !== q;
    });
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of list) {
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
      if (out.length >= 6) break;
    }
    return out;
  }, [sizes, value]);

  const showDrop = focused && suggestions.length > 0;

  return (
    <View>
      <View style={[inputStyle as StyleProp<ViewStyle>, styles.inputRow]}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.inputText}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {value ? (
          <TouchableOpacity onPress={() => onChange("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="resize-outline" size={16} color={theme.colors.textSecondary} />
        )}
      </View>

      {showDrop && (
        <View style={styles.drop}>
          {suggestions.map((s) => (
            <TouchableOpacity
              key={s}
              style={styles.dropRow}
              onPress={() => {
                onChange(s);
                setFocused(false);
              }}
              testID={`size-suggest-${s}`}
            >
              <Ionicons name="resize" size={13} color={theme.colors.accent} />
              <Text style={styles.dropText} numberOfLines={1}>
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 13,
    padding: 0,
  },
  drop: {
    marginTop: 2,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    backgroundColor: theme.colors.bgSecondary,
    overflow: "hidden",
  },
  dropRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  dropText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    flex: 1,
  },
});
