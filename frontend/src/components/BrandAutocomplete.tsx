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
 * Smart Brand field. A single-value text box that suggests brands the user has
 * used before (autocomplete) and remembers any new brand typed (the backend
 * upserts the brand when the tool is saved). Modeled after the Tags UX but for
 * a single value.
 */
export function BrandAutocomplete({
  value,
  onChange,
  inputStyle,
  placeholder = "DeWalt",
  testID,
}: {
  value: string;
  onChange: (v: string) => void;
  inputStyle?: StyleProp<TextStyle>;
  placeholder?: string;
  testID?: string;
}) {
  const [brands, setBrands] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listBrands()
      .then((rows: any[]) => {
        if (alive) setBrands((rows || []).map((b) => String(b.name || "")).filter(Boolean));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const suggestions = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    // Show matches, but hide the single exact match (nothing left to pick).
    const list = brands.filter((b) => {
      const lb = b.toLowerCase();
      if (!q) return true;
      return lb.includes(q) && lb !== q;
    });
    // De-dupe (case-insensitive) and cap the list height.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const b of list) {
      const k = b.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(b);
      if (out.length >= 6) break;
    }
    return out;
  }, [brands, value]);

  const showDrop = focused && suggestions.length > 0;

  return (
    <View>
      <View style={[inputStyle as StyleProp<ViewStyle>, styles.inputRow]}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          // Delay hide so a suggestion tap registers first.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.inputText}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {value ? (
          <TouchableOpacity onPress={() => onChange("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="pricetag-outline" size={16} color={theme.colors.textSecondary} />
        )}
      </View>

      {showDrop && (
        <View style={styles.drop}>
          {suggestions.map((b) => (
            <TouchableOpacity
              key={b}
              style={styles.dropRow}
              onPress={() => {
                onChange(b);
                setFocused(false);
              }}
              testID={`brand-suggest-${b}`}
            >
              <Ionicons name="pricetag" size={13} color={theme.colors.accent} />
              <Text style={styles.dropText} numberOfLines={1}>
                {b}
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
