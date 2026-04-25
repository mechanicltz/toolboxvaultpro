import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";

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
  const [name, setName] = useState("");

  const fetcher = {
    categories: { list: api.listCategories, create: api.createCategory, del: api.deleteCategory },
    tags: { list: api.listTags, create: api.createTag, del: api.deleteTag },
    locations: { list: api.listLocations, create: api.createLocation, del: api.deleteLocation },
  } as const;

  const load = useCallback(async () => {
    const data = await fetcher[k].list();
    setItems(data);
  }, [k]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const add = async () => {
    if (!name.trim()) return;
    await fetcher[k].create({ name: name.trim() });
    setName("");
    load();
  };

  const remove = (id: string, n: string) => {
    Alert.alert(`Delete "${n}"?`, "Existing tools will keep the name as text.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await fetcher[k].del(id);
          load();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>{TITLES[k]}</Text>
        <View style={{ width: 26 }} />
      </View>
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
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {items.length === 0 ? (
          <Text style={styles.empty}>None yet. Add one above.</Text>
        ) : (
          items.map((i) => (
            <View key={i.id} style={styles.row}>
              <Ionicons
                name={
                  k === "categories" ? "folder" : k === "tags" ? "pricetag" : "location"
                }
                size={18}
                color={theme.colors.accent}
              />
              <Text style={styles.rowText}>{i.name}</Text>
              <TouchableOpacity testID={`del-${i.id}`} onPress={() => remove(i.id, i.name)} hitSlop={8}>
                <Ionicons name="close" size={20} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: 2 },
  addRow: { flexDirection: "row", padding: 16, gap: 8 },
  input: {
    flex: 1,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: "#fff",
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 4,
    fontSize: 15,
  },
  addBtn: {
    width: 48,
    height: 48,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 4,
  },
  rowText: { color: "#fff", fontSize: 15, fontWeight: "600", flex: 1 },
  empty: { color: theme.colors.textMuted, fontStyle: "italic", padding: 24, textAlign: "center" },
});
