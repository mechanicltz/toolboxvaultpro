import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useAppResume } from "../../src/appLifecycle";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { confirm } from "../../src/confirm";

import { themedStyles } from "../../src/themeContext";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";

type Kind = "categories" | "tags" | "locations";

const TITLES: Record<Kind, string> = {
  categories: "CATEGORIES",
  tags: "TAGS",
  locations: "LOCATIONS",
};

export default function ManageScreen() {
  const { kind } = useLocalSearchParams<{ kind: Kind }>();
  const router = useRouter();
  const k = (kind || "categories") as Kind;
  const [items, setItems] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const fetcher = {
    categories: { list: api.listCategories, create: api.createCategory, update: api.updateCategory, del: api.deleteCategory },
    tags: { list: api.listTags, create: api.createTag, update: api.updateTag, del: api.deleteTag },
    locations: { list: api.listLocations, create: api.createLocation, update: api.updateLocation, del: api.deleteLocation },
  } as const;

  const load = useCallback(async () => {
    try {
      const data = await fetcher[k].list();
      setItems(data);
      setLoaded(true);
    } catch {
      // Keep prior items so a transient API blip doesn't show empty state.
      setLoaded(true);
    }
  }, [k]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


  const add = async () => {
    if (!name.trim()) return;
    await fetcher[k].create({ name: name.trim() });
    setName("");
    load();
  };

  const remove = async (id: string, n: string) => {
    if (!(await confirm(`Delete "${n}"?`, "Existing tools will keep the name as text.", "Delete", true))) return;
    await fetcher[k].del(id);
    load();
  };

  const startEdit = (i: any) => {
    setEditId(i.id);
    setEditValue(i.name);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditValue("");
  };

  const saveEdit = async (id: string) => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      Alert.alert("Name required");
      return;
    }
    try {
      await fetcher[k].update(id, { name: trimmed });
      cancelEdit();
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not update");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title={TITLES[k]}
        onBack={() => router.back()}
      />
      <View style={styles.addRow}>
        <TextInput
          testID="manage-name-input"
          placeholder={`Add ${k.slice(0, -1)}...`}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          value={name}
          onChangeText={setName}
          onSubmitEditing={add}
          autoCapitalize="words"
        />
        <TouchableOpacity testID="manage-add-btn" style={styles.addBtn} onPress={add}>
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {!loaded ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : items.length === 0 ? (
          <Text style={styles.empty}>None yet. Add one above.</Text>
        ) : (
          items.map((i) => {
            const isEditing = editId === i.id;
            return (
              <View key={i.id} style={styles.row}>
                <Ionicons
                  name={k === "categories" ? "folder" : k === "tags" ? "pricetag" : "location"}
                  size={18}
                  color={theme.colors.accent}
                />
                {isEditing ? (
                  <TextInput
                    testID={`edit-input-${i.id}`}
                    value={editValue}
                    onChangeText={setEditValue}
                    style={styles.editInput}
                    autoFocus
                    onSubmitEditing={() => saveEdit(i.id)}
                  />
                ) : (
                  <TouchableOpacity
                    testID={`row-${i.id}`}
                    style={{ flex: 1 }}
                    onPress={() => startEdit(i)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.rowText}>{i.name}</Text>
                  </TouchableOpacity>
                )}
                {isEditing ? (
                  <>
                    <TouchableOpacity
                      testID={`save-${i.id}`}
                      onPress={() => saveEdit(i.id)}
                      hitSlop={8}
                      style={styles.iconAction}
                    >
                      <Ionicons name="checkmark" size={20} color={theme.colors.success} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`cancel-${i.id}`}
                      onPress={cancelEdit}
                      hitSlop={8}
                      style={styles.iconAction}
                    >
                      <Ionicons name="close" size={20} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      testID={`edit-${i.id}`}
                      onPress={() => startEdit(i)}
                      hitSlop={8}
                      style={styles.iconAction}
                    >
                      <Ionicons name="create-outline" size={18} color={theme.colors.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`del-${i.id}`}
                      onPress={() => remove(i.id, i.name)}
                      hitSlop={8}
                      style={styles.iconAction}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  title: { color: c.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 2 },
  addRow: { flexDirection: "row", padding: 16, gap: 8 },
  input: {
    flex: 1,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    color: c.textPrimary,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: theme.radii.md,
    fontSize: 11,
    ...(theme.elevation.inset as object),
  },
  addBtn: {
    width: 48,
    height: 48,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.md,
    ...(theme.elevation.accent as object),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: theme.radii.md,
    ...(theme.elevation.md as object),
  },
  rowText: { color: c.textPrimary, fontSize: 11, fontWeight: "600" },
  editInput: {
    flex: 1,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.accent,
    color: c.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
    fontSize: 10,
  
    ...(theme.elevation.input as object),
  },
  iconAction: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  empty: { color: c.textMuted, fontStyle: "italic", padding: 24, textAlign: "center" },
}));
