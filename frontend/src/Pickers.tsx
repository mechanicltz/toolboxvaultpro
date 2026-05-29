import { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";
import { api } from "./api";
import { buildLocationTree, flattenLocationTree } from "./locationTree";

import { themedStyles } from "./themeContext";

type Item = { id: string; name: string };

/* ---------------------------- shared modal shell ---------------------------- */

function PickerModal({
  visible,
  title,
  onClose,
  searchPlaceholder,
  searchText,
  onSearchChange,
  onCreate,
  canCreate,
  children,
  createLabel,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  searchPlaceholder: string;
  searchText: string;
  onSearchChange: (s: string) => void;
  onCreate?: () => void;
  canCreate?: boolean;
  children: React.ReactNode;
  createLabel?: string;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalBg}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} testID="picker-close">
              <Ionicons
                name="close"
                size={22}
                color={theme.colors.textPrimary}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={theme.colors.textMuted} />
            <TextInput
              testID="picker-search"
              placeholder={searchPlaceholder}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.searchInput}
              value={searchText}
              onChangeText={onSearchChange}
              autoFocus
              autoCorrect={false}
            />
            {searchText.length > 0 ? (
              <TouchableOpacity onPress={() => onSearchChange("")} hitSlop={8}>
                <Ionicons
                  name="close-circle"
                  size={16}
                  color={theme.colors.textMuted}
                />
              </TouchableOpacity>
            ) : null}
          </View>
          <ScrollView
            style={styles.modalList}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          <View style={styles.footerRow}>
            {onCreate && canCreate ? (
              <TouchableOpacity
                testID="picker-create"
                style={[styles.createBtn, { flex: 1 }]}
                onPress={onCreate}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle" size={18} color="#000" />
                <Text style={styles.createBtnText}>
                  {createLabel || `Create "${searchText.trim()}"`}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              testID="picker-done"
              style={[
                styles.doneBtn,
                onCreate && canCreate ? { flex: 0, minWidth: 110 } : { flex: 1 },
              ]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-done" size={18} color="#000" />
              <Text style={styles.createBtnText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------------------------- Category picker ---------------------------- */

export function CategoryPicker({
  selected,
  onChange,
}: {
  selected: Item | null;
  onChange: (item: Item | null) => void;
}) {
  const [all, setAll] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const reload = useCallback(() => {
    api.listCategories().then(setAll).catch(() => {});
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => c.name.toLowerCase().includes(q));
  }, [text, all]);

  const exactMatch = useMemo(
    () =>
      all.some((c) => c.name.toLowerCase() === text.trim().toLowerCase()),
    [all, text],
  );

  const pick = (c: Item) => {
    onChange(c);
    setText("");
    setOpen(false);
  };
  const createAndPick = async () => {
    const name = text.trim();
    if (!name) return;
    try {
      const c = await api.createCategory({ name });
      setAll((cur) => (cur.some((x) => x.id === c.id) ? cur : [...cur, c]));
      pick(c);
    } catch {}
  };

  return (
    <>
      <TouchableOpacity
        testID="cat-picker-btn"
        style={styles.triggerRow}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="folder" size={18} color={theme.colors.accent} />
        <Text
          style={[
            styles.triggerText,
            !selected && { color: theme.colors.textMuted },
          ]}
        >
          {selected ? selected.name : "Select a category..."}
        </Text>
        {selected ? (
          <TouchableOpacity
            onPress={() => onChange(null)}
            hitSlop={8}
            testID="cat-clear-btn"
          >
            <Ionicons name="close" size={18} color={theme.colors.danger} />
          </TouchableOpacity>
        ) : (
          <Ionicons
            name="chevron-down"
            size={18}
            color={theme.colors.textMuted}
          />
        )}
      </TouchableOpacity>
      <PickerModal
        visible={open}
        title="SELECT CATEGORY"
        onClose={() => {
          setOpen(false);
          setText("");
        }}
        searchPlaceholder="Search or type a new name..."
        searchText={text}
        onSearchChange={setText}
        onCreate={createAndPick}
        canCreate={!!text.trim() && !exactMatch}
      >
        {filtered.length === 0 && !text.trim() ? (
          <Text style={styles.empty}>No categories yet — type a name below to create one.</Text>
        ) : null}
        {filtered.map((c) => (
          <TouchableOpacity
            key={c.id}
            testID={`cat-suggest-${c.id}`}
            style={[
              styles.row,
              selected?.id === c.id && styles.rowActive,
            ]}
            onPress={() => pick(c)}
          >
            <Ionicons
              name="folder-outline"
              size={16}
              color={
                selected?.id === c.id ? "#000" : theme.colors.accent
              }
            />
            <Text
              style={[
                styles.rowText,
                selected?.id === c.id && { color: theme.colors.accent, fontWeight: "900" },
              ]}
            >
              {c.name}
            </Text>
            {selected?.id === c.id ? (
              <Ionicons name="checkmark" size={18} color="#000" />
            ) : null}
          </TouchableOpacity>
        ))}
      </PickerModal>
    </>
  );
}

/* ---------------------------- Tag picker (multi) ---------------------------- */

export function TagInput({
  selected,
  onChange,
}: {
  selected: Item[];
  onChange: (items: Item[]) => void;
}) {
  const [all, setAll] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    api.listTags().then(setAll).catch(() => {});
  }, []);

  const selectedIds = useMemo(
    () => new Set(selected.map((s) => s.id)),
    [selected],
  );

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return all;
    return all.filter((t) => t.name.toLowerCase().includes(q));
  }, [text, all]);

  const exactMatch = useMemo(
    () =>
      all.some((t) => t.name.toLowerCase() === text.trim().toLowerCase()),
    [all, text],
  );

  const toggle = (t: Item) => {
    if (selectedIds.has(t.id)) {
      onChange(selected.filter((s) => s.id !== t.id));
    } else {
      onChange([...selected, t]);
    }
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

  const removeChip = (id: string) => {
    onChange(selected.filter((s) => s.id !== id));
  };

  return (
    <>
      <TouchableOpacity
        testID="tag-picker-btn"
        style={[styles.triggerRow, { minHeight: 48 }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="pricetag" size={18} color={theme.colors.accent} />
        <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {selected.length === 0 ? (
            <Text style={[styles.triggerText, { color: theme.colors.textMuted }]}>
              Add tags...
            </Text>
          ) : (
            selected.map((t) => (
              <View key={t.id} style={styles.chip} testID={`tag-chip-${t.id}`}>
                <Text style={styles.chipText}>{t.name}</Text>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    removeChip(t.id);
                  }}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={12} color="#000" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
        <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
      </TouchableOpacity>
      <PickerModal
        visible={open}
        title="SELECT TAGS"
        onClose={() => {
          setOpen(false);
          setText("");
        }}
        searchPlaceholder="Search or type a new tag..."
        searchText={text}
        onSearchChange={setText}
        onCreate={createAndAdd}
        canCreate={!!text.trim() && !exactMatch}
      >
        {filtered.length === 0 && !text.trim() ? (
          <Text style={styles.empty}>No tags yet — type a name below to create one.</Text>
        ) : null}
        {filtered.map((t) => {
          const isSel = selectedIds.has(t.id);
          return (
            <TouchableOpacity
              key={t.id}
              testID={`tag-suggest-${t.id}`}
              style={[styles.row, isSel && styles.rowActive]}
              onPress={() => toggle(t)}
            >
              <Ionicons
                name={isSel ? "checkbox" : "square-outline"}
                size={18}
                color={isSel ? "#000" : theme.colors.textMuted}
              />
              <Text style={[styles.rowText, isSel && { color: "#000" }]}>
                {t.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </PickerModal>
    </>
  );
}

/* ---------------------------- Location picker ---------------------------- */

export function LocationPicker({
  locationId,
  locationName,
  onChange,
}: {
  locationId: string | null;
  locationName: string;
  onChange: (id: string | null, path: string) => void;
}) {
  const [all, setAll] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const reload = useCallback(() => {
    api.listLocations().then(setAll).catch(() => {});
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const flat = useMemo(
    () => flattenLocationTree(buildLocationTree(all)),
    [all],
  );

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter(
      (n) =>
        n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q),
    );
  }, [text, flat]);

  const exactMatch = useMemo(
    () =>
      flat.some(
        (n) => n.name.toLowerCase() === text.trim().toLowerCase(),
      ),
    [flat, text],
  );

  const pick = (n: { id: string; path: string }) => {
    onChange(n.id, n.path);
    setText("");
    setOpen(false);
  };
  const clear = () => {
    onChange(null, "");
    setText("");
    setOpen(false);
  };
  const createAndPick = async () => {
    const name = text.trim();
    if (!name) return;
    try {
      const loc = await api.createLocation({ name });
      // Reload to include hierarchy paths
      const fresh = await api.listLocations();
      setAll(fresh);
      onChange(loc.id, loc.name);
      setText("");
      setOpen(false);
    } catch {}
  };

  return (
    <>
      <TouchableOpacity
        testID="loc-picker-btn"
        style={styles.triggerRow}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="location" size={18} color={theme.colors.accent} />
        <Text
          style={[
            styles.triggerText,
            !locationId && { color: theme.colors.textMuted },
          ]}
        >
          {locationName || "Select a location..."}
        </Text>
        {locationId ? (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              clear();
            }}
            hitSlop={8}
            testID="loc-clear-btn"
          >
            <Ionicons name="close" size={18} color={theme.colors.danger} />
          </TouchableOpacity>
        ) : (
          <Ionicons
            name="chevron-down"
            size={18}
            color={theme.colors.textMuted}
          />
        )}
      </TouchableOpacity>
      <PickerModal
        visible={open}
        title="SELECT LOCATION"
        onClose={() => {
          setOpen(false);
          setText("");
        }}
        searchPlaceholder="Search or type a new location..."
        searchText={text}
        onSearchChange={setText}
        onCreate={createAndPick}
        canCreate={!!text.trim() && !exactMatch}
      >
        <TouchableOpacity
          testID="loc-pick-none"
          style={[styles.row, !locationId && styles.rowActive]}
          onPress={clear}
        >
          <Ionicons
            name="ban"
            size={16}
            color={!locationId ? "#000" : theme.colors.textMuted}
          />
          <Text
            style={[
              styles.rowText,
              { color: !locationId ? "#000" : theme.colors.textMuted },
            ]}
          >
            NONE
          </Text>
          {!locationId ? (
            <Ionicons name="checkmark" size={18} color="#000" />
          ) : null}
        </TouchableOpacity>
        {filtered.length === 0 && !text.trim() ? (
          <Text style={styles.empty}>
            No locations yet — type a name below to create one.
          </Text>
        ) : null}
        {filtered.map((n) => {
          const isSel = locationId === n.id;
          return (
            <TouchableOpacity
              key={n.id}
              testID={`pick-loc-${n.id}`}
              style={[
                styles.row,
                { paddingLeft: 14 + n.depth * 14 },
                isSel && styles.rowActive,
              ]}
              onPress={() => pick(n)}
            >
              <Ionicons
                name={n.children.length > 0 ? "folder" : "location"}
                size={14}
                color={isSel ? "#000" : theme.colors.accent}
              />
              <Text style={[styles.rowText, isSel && { color: "#000" }]}>
                {n.name}
              </Text>
              {isSel ? (
                <Ionicons name="checkmark" size={18} color="#000" />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </PickerModal>
    </>
  );
}

/* ---------------------------- styles ---------------------------- */

const styles = themedStyles((c) => ({
  triggerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 4,
    minHeight: 48,
  
    ...(theme.elevation.md as object),
  },
  triggerText: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "600",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "transparent",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  chipText: { color: "#000", fontSize: 8, fontWeight: "800" },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: c.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    maxHeight: "85%",
    borderTopWidth: 1,
    borderColor: c.border,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  modalTitle: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    margin: 12,
    backgroundColor: c.bgSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
  
    ...(theme.elevation.md as object),
  },
  searchInput: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 10,
    padding: 0,
  },
  modalList: {
    flexGrow: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  rowActive: {
    backgroundColor: c.accent,
  },
  rowText: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "600",
  },
  empty: {
    color: c.textMuted,
    fontSize: 9,
    fontStyle: "italic",
    paddingHorizontal: 16,
    paddingVertical: 24,
    textAlign: "center",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    backgroundColor: c.accent,
    borderRadius: 8,
  },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: c.success,
    borderRadius: 8,
  },
  footerRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  createBtnText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
}));
