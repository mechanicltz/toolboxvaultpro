import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { theme } from "../../src/theme";
import { api } from "../../src/api";

export default function ToolEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [cost, setCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [condition, setCondition] = useState("Good");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [documents, setDocuments] = useState<{ name: string; data: string; mime_type?: string }[]>([]);

  const [locations, setLocations] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [loc, tg] = await Promise.all([api.listLocations(), api.listTags()]);
      setLocations(loc);
      setTags(tg);
      if (isEdit && id) {
        const t = await api.getTool(id);
        setName(t.name);
        setDescription(t.description || "");
        setBrand(t.brand || "");
        setModel(t.model || "");
        setSerial(t.serial_number || "");
        setCost(t.cost ? String(t.cost) : "");
        setPurchaseDate(t.purchase_date || "");
        setCondition(t.condition || "Good");
        setLocationId(t.location_id);
        setLocationName(t.location_name || "");
        setTagIds(t.tag_ids || []);
        setPhotos(t.photos || []);
        setDocuments(t.documents || []);
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

  const pickPhoto = async (fromCamera: boolean) => {
    try {
      let res;
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Camera access required.");
          return;
        }
        res = await ImagePicker.launchCameraAsync({
          quality: 0.5,
          base64: true,
          allowsEditing: false,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Photo library access required.");
          return;
        }
        res = await ImagePicker.launchImageLibraryAsync({
          quality: 0.5,
          base64: true,
          allowsEditing: false,
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });
      }
      if (!res.canceled && res.assets[0]) {
        const a = res.assets[0];
        const dataUri = a.base64
          ? `data:image/jpeg;base64,${a.base64}`
          : a.uri;
        setPhotos((p) => [...p, dataUri]);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const removePhoto = (i: number) => {
    setPhotos((p) => p.filter((_, idx) => idx !== i));
  };

  const pickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets[0]) {
        const a = res.assets[0];
        let base64 = "";
        if (Platform.OS === "web" && (a as any).file) {
          // For web, read as base64
          const file = (a as any).file as File;
          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const r = reader.result as string;
              resolve(r.split(",")[1] || "");
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        } else {
          base64 = await FileSystem.readAsStringAsync(a.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        setDocuments((d) => [
          ...d,
          { name: a.name, data: base64, mime_type: a.mimeType || "application/octet-stream" },
        ]);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not pick document");
    }
  };

  const removeDocument = (i: number) => {
    setDocuments((d) => d.filter((_, idx) => idx !== i));
  };

  const toggleTag = (tagId: string) => {
    setTagIds((cur) =>
      cur.includes(tagId) ? cur.filter((t) => t !== tagId) : [...cur, tagId]
    );
  };

  const save = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Required", "Please enter a tool name.");
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description,
      brand,
      model,
      serial_number: serial,
      cost: parseFloat(cost) || 0,
      purchase_date: purchaseDate,
      condition,
      location_id: locationId,
      location_name: locationName,
      tag_ids: tagIds,
      tag_names: tags.filter((t) => tagIds.includes(t.id)).map((t) => t.name),
      photos,
      documents,
    };
    try {
      if (isEdit && id) {
        await api.updateTool(id, payload);
      } else {
        await api.createTool(payload);
      }
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }, [name, description, brand, model, serial, cost, purchaseDate, condition, locationId, locationName, tagIds, tags, photos, documents, isEdit, id, router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.topBar}>
          <TouchableOpacity testID="cancel-btn" onPress={() => router.back()}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>{isEdit ? "EDIT TOOL" : "NEW TOOL"}</Text>
          <TouchableOpacity testID="save-tool-btn" onPress={save} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : (
              <Text style={styles.saveText}>SAVE</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <Text style={styles.label}>NAME *</Text>
          <TextInput
            testID="name-input"
            placeholder="Cordless Drill"
            placeholderTextColor={theme.colors.textMuted}
            value={name}
            onChangeText={setName}
            style={styles.input}
          />

          <Text style={styles.label}>DESCRIPTION</Text>
          <TextInput
            testID="desc-input"
            placeholder="Detailed notes..."
            placeholderTextColor={theme.colors.textMuted}
            value={description}
            onChangeText={setDescription}
            style={[styles.input, { height: 90, textAlignVertical: "top" }]}
            multiline
          />

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>BRAND</Text>
              <TextInput
                testID="brand-input"
                placeholder="DeWalt"
                placeholderTextColor={theme.colors.textMuted}
                value={brand}
                onChangeText={setBrand}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>MODEL</Text>
              <TextInput
                testID="model-input"
                placeholder="DCD777"
                placeholderTextColor={theme.colors.textMuted}
                value={model}
                onChangeText={setModel}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>SERIAL #</Text>
              <TextInput
                testID="serial-input"
                placeholder="ABC-1234"
                placeholderTextColor={theme.colors.textMuted}
                value={serial}
                onChangeText={setSerial}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>COST ($)</Text>
              <TextInput
                testID="cost-input"
                placeholder="0.00"
                placeholderTextColor={theme.colors.textMuted}
                value={cost}
                onChangeText={setCost}
                style={styles.input}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>PURCHASED</Text>
              <TextInput
                testID="purchase-input"
                placeholder="2024-05-15"
                placeholderTextColor={theme.colors.textMuted}
                value={purchaseDate}
                onChangeText={setPurchaseDate}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>CONDITION</Text>
              <TextInput
                testID="condition-input"
                placeholder="Good"
                placeholderTextColor={theme.colors.textMuted}
                value={condition}
                onChangeText={setCondition}
                style={styles.input}
              />
            </View>
          </View>

          <Text style={styles.label}>LOCATION</Text>
          {locations.length === 0 ? (
            <Text style={styles.helper}>No locations yet. Add some in Settings.</Text>
          ) : (
            <View style={styles.chipWrap}>
              {locations.map((l) => (
                <TouchableOpacity
                  key={l.id}
                  testID={`pick-loc-${l.id}`}
                  style={[styles.chip, locationId === l.id && styles.chipActive]}
                  onPress={() => {
                    setLocationId(l.id);
                    setLocationName(l.name);
                  }}
                >
                  <Text
                    style={[styles.chipText, locationId === l.id && styles.chipTextActive]}
                  >
                    {l.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.label}>TAGS</Text>
          {tags.length === 0 ? (
            <Text style={styles.helper}>No tags yet. Add some in Settings.</Text>
          ) : (
            <View style={styles.chipWrap}>
              {tags.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  testID={`pick-tag-${t.id}`}
                  style={[styles.chip, tagIds.includes(t.id) && styles.chipActive]}
                  onPress={() => toggleTag(t.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      tagIds.includes(t.id) && styles.chipTextActive,
                    ]}
                  >
                    {t.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.label}>PHOTOS ({photos.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {photos.map((p, i) => (
              <View key={i} style={styles.photoWrap}>
                <Image source={{ uri: p }} style={styles.photo} />
                <TouchableOpacity
                  testID={`remove-photo-${i}`}
                  style={styles.photoRemove}
                  onPress={() => removePhoto(i)}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              testID="add-photo-camera-btn"
              style={styles.photoAdd}
              onPress={() => pickPhoto(true)}
            >
              <Ionicons name="camera" size={28} color={theme.colors.accent} />
              <Text style={styles.photoAddText}>CAMERA</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="add-photo-gallery-btn"
              style={styles.photoAdd}
              onPress={() => pickPhoto(false)}
            >
              <Ionicons name="images" size={28} color={theme.colors.accent} />
              <Text style={styles.photoAddText}>GALLERY</Text>
            </TouchableOpacity>
          </ScrollView>

          <Text style={styles.label}>DOCUMENTS ({documents.length})</Text>
          {documents.map((d, i) => (
            <View key={i} style={styles.docRow}>
              <Ionicons name="document" size={20} color={theme.colors.accent} />
              <Text style={styles.docName} numberOfLines={1}>{d.name}</Text>
              <TouchableOpacity testID={`remove-doc-${i}`} onPress={() => removeDocument(i)}>
                <Ionicons name="close" size={20} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity testID="add-doc-btn" style={styles.docAdd} onPress={pickDocument}>
            <Ionicons name="attach" size={20} color={theme.colors.accent} />
            <Text style={styles.docAddText}>ATTACH DOCUMENT</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  topTitle: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 2 },
  saveText: { color: theme.colors.accent, fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  label: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    borderRadius: 4,
    fontSize: 15,
  },
  row2: { flexDirection: "row", gap: 10 },
  helper: { color: theme.colors.textMuted, fontStyle: "italic", fontSize: 13 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
  },
  chipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  chipTextActive: { color: "#000" },
  photoWrap: { marginRight: 8, position: "relative" },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.7)",
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  photoAdd: {
    width: 100,
    height: 100,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    borderRadius: 4,
    gap: 4,
  },
  photoAddText: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    borderRadius: 4,
  },
  docName: { color: "#fff", flex: 1, fontSize: 13 },
  docAdd: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    paddingVertical: 14,
    borderRadius: 4,
  },
  docAddText: { color: theme.colors.accent, fontWeight: "800", letterSpacing: 1.5, fontSize: 12 },
});
