import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";
import { api } from "./api";

type Item = { id: string; name: string };

export function TagInput({
  selected,
  onChange,
}: {
  selected: Item[];
  onChange: (items: Item[]) => void;
}) {
  const [all, setAll] = useState<Item[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    api.listTags().then(setAll).catch(() => {});
  }, []);

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const selectedIds = new Set(selected.map((s) => s.id));
    return all
      .filter(
        (t) =>
          !selectedIds.has(t.id) && t.name.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [text, all, selected]);

  const exists = useMemo(
    () =>
      all.some((t) => t.name.toLowerCase() === text.trim().toLowerCase()) ||
      selected.some(
        (t) => t.name.toLowerCase() === text.trim().toLowerCase()
      ),
    [all, selected, text]
  );

  const addExisting = (t: Item) => {
    onChange([...selected, t]);
    setText("");
  };

  const createAndAdd = async () => {
    const name = text.trim();
    if (!name) return;
    try {
      const t = await api.createTag({ name });
      setAll((cur) => (cur.some((x) => x.id === t.id) ? cur : [...cur, t]));
      onChange([...selected, t]);
      setText("");
    } catch {}
  };

  const remove = (id: string) => {
    onChange(selected.filter((s) => s.id !== id));
  };

  return (
    <View>
      <View style={styles.chipsBox}>
        {selected.map((t) => (
          <View key={t.id} style={styles.chip} testID={`tag-chip-${t.id}`}>
            <Text style={styles.chipText}>{t.name}</Text>
            <TouchableOpacity onPress={() => remove(t.id)} hitSlop={6}>
              <Ionicons name="close" size={14} color="#000" />
            </TouchableOpacity>
          </View>
        ))}
        <TextInput
          testID="tag-input"
          placeholder={selected.length ? "Add another tag..." : "Type a tag..."}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => {
            if (suggestions.length) addExisting(suggestions[0]);
            else if (!exists && text.trim()) createAndAdd();
          }}
          autoCapitalize="none"
        />
      </View>
      {text.length > 0 && (
        <ScrollView style={styles.dropdown} keyboardShouldPersistTaps="handled">
          {suggestions.map((s) => (
            <TouchableOpacity
              key={s.id}
              testID={`tag-suggest-${s.id}`}
              style={styles.suggestion}
              onPress={() => addExisting(s)}
            >
              <Ionicons name="pricetag" size={14} color={theme.colors.accent} />
              <Text style={styles.suggestionText}>{s.name}</Text>
            </TouchableOpacity>
          ))}
          {!exists && text.trim().length > 0 && (
            <TouchableOpacity
              testID="tag-create-btn"
              style={[styles.suggestion, { borderTopWidth: suggestions.length ? 1 : 0, borderTopColor: theme.colors.border }]}
              onPress={createAndAdd}
            >
              <Ionicons name="add-circle" size={14} color={theme.colors.success} />
              <Text style={[styles.suggestionText, { color: theme.colors.success }]}>
                Create "{text.trim()}"
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}

export function CategoryPicker({
  selected,
  onChange,
}: {
  selected: Item | null;
  onChange: (item: Item | null) => void;
}) {
  const [all, setAll] = useState<Item[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    api.listCategories().then(setAll).catch(() => {});
  }, []);

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return all.slice(0, 8);
    return all.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 8);
  }, [text, all]);

  const exists = useMemo(
    () => all.some((t) => t.name.toLowerCase() === text.trim().toLowerCase()),
    [all, text]
  );

  const pick = (t: Item) => {
    onChange(t);
    setText("");
  };

  const createAndPick = async () => {
    const name = text.trim();
    if (!name) return;
    const c = await api.createCategory({ name });
    setAll((cur) => (cur.some((x) => x.id === c.id) ? cur : [...cur, c]));
    onChange(c);
    setText("");
  };

  return (
    <View>
      {selected ? (
        <View style={styles.selectedRow}>
          <Ionicons name="folder" size={16} color={theme.colors.accent} />
          <Text style={styles.selectedText}>{selected.name}</Text>
          <TouchableOpacity testID="cat-clear-btn" onPress={() => onChange(null)} hitSlop={8}>
            <Ionicons name="close" size={18} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TextInput
            testID="cat-input"
            placeholder="Type or pick a category..."
            placeholderTextColor={theme.colors.textMuted}
            style={styles.formInput}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => {
              if (suggestions.length) pick(suggestions[0]);
              else if (!exists && text.trim()) createAndPick();
            }}
            autoCapitalize="words"
          />
          <View style={styles.dropdownInline}>
            {suggestions.map((s) => (
              <TouchableOpacity
                key={s.id}
                testID={`cat-suggest-${s.id}`}
                style={styles.suggestion}
                onPress={() => pick(s)}
              >
                <Ionicons name="folder-outline" size={14} color={theme.colors.accent} />
                <Text style={styles.suggestionText}>{s.name}</Text>
              </TouchableOpacity>
            ))}
            {text.trim().length > 0 && !exists && (
              <TouchableOpacity
                testID="cat-create-btn"
                style={styles.suggestion}
                onPress={createAndPick}
              >
                <Ionicons name="add-circle" size={14} color={theme.colors.success} />
                <Text style={[styles.suggestionText, { color: theme.colors.success }]}>
                  Create "{text.trim()}"
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipsBox: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 8,
    borderRadius: 4,
    gap: 6,
    minHeight: 48,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  chipText: { color: "#000", fontSize: 12, fontWeight: "800" },
  input: {
    flex: 1,
    minWidth: 100,
    color: "#fff",
    fontSize: 14,
    paddingVertical: 6,
  },
  formInput: {
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: "#fff",
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 4,
    fontSize: 15,
  },
  dropdown: {
    maxHeight: 180,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgSecondary,
  },
  dropdownInline: {
    marginTop: 6,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
  },
  suggestionText: { color: "#fff", fontSize: 14 },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 4,
  },
  selectedText: { color: "#fff", fontWeight: "700", flex: 1 },
});
