import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { theme } from "../../src/theme";
import { api } from "../../src/api";

export default function ToolboxList() {
  const router = useRouter();
  const [layouts, setLayouts] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [showName, setShowName] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api.listLayouts();
    setLayouts(d);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startNew = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      const galleryPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted && !galleryPerm.granted) {
        Alert.alert("Permission needed", "Camera or photo library access required.");
        return;
      }
      Alert.alert("Add Toolbox Photo", "Choose a source:", [
        { text: "Cancel", style: "cancel" },
        { text: "Camera", onPress: () => pick(true) },
        { text: "Gallery", onPress: () => pick(false) },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const pick = async (camera: boolean) => {
    const opts: any = { quality: 0.7, base64: true, allowsEditing: false };
    const res = camera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync({ ...opts, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!res.canceled && res.assets[0]?.base64) {
      setPendingPhoto(`data:image/jpeg;base64,${res.assets[0].base64}`);
      setName("");
      setShowName(true);
    }
  };

  const create = async () => {
    if (!pendingPhoto || !name.trim()) return;
    setBusy(true);
    try {
      const lay = await api.createLayout({ name: name.trim(), photo: pendingPhoto, drawers: [] });
      setShowName(false);
      setPendingPhoto(null);
      setName("");
      router.push(`/toolbox/${lay.id}`);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>TOOLBOX PHOTOS</Text>
        <TouchableOpacity testID="new-toolbox-btn" onPress={startNew} hitSlop={10}>
          <Ionicons name="add" size={26} color={theme.colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {layouts.length === 0 && (
          <View style={styles.intro}>
            <Ionicons name="cube-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.introTitle}>MAP YOUR TOOLBOX</Text>
            <Text style={styles.introText}>
              Take a photo of your toolbox. AI suggests drawer count + names. Then tap to mark each drawer's region.
              Tap drawers later to see what's inside.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={startNew}>
              <Ionicons name="camera" size={20} color="#000" />
              <Text style={styles.btnText}>ADD PHOTO</Text>
            </TouchableOpacity>
          </View>
        )}
        {layouts.map((l) => (
          <TouchableOpacity
            key={l.id}
            testID={`layout-${l.id}`}
            style={styles.card}
            onPress={() => router.push(`/toolbox/${l.id}`)}
          >
            <Image source={{ uri: l.photo }} style={styles.cardImg} />
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{l.name}</Text>
              <Text style={styles.cardMeta}>
                {l.drawers?.length || 0} drawer{(l.drawers?.length || 0) === 1 ? "" : "s"} mapped
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {showName && (
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>NAME THIS TOOLBOX</Text>
            <TextInput
              testID="layout-name-input"
              placeholder="e.g. Main Toolbox, Side Cabinet"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={name}
              onChangeText={setName}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => {
                  setShowName(false);
                  setPendingPhoto(null);
                }}
              >
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="layout-create-btn" style={styles.btn} onPress={create} disabled={busy}>
                {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>CREATE</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
  title: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: "900", letterSpacing: 2 },
  intro: { padding: 24, alignItems: "center" },
  introTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: "900", letterSpacing: 2, marginTop: 16 },
  introText: { color: theme.colors.textSecondary, textAlign: "center", marginTop: 8, marginBottom: 24, lineHeight: 20 },
  card: {
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
    borderRadius: 4,
    overflow: "hidden",
  },
  cardImg: { width: "100%", height: 180, resizeMode: "cover" },
  cardInfo: { padding: 14 },
  cardName: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 16, letterSpacing: 1 },
  cardMeta: { color: theme.colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 4 },
  modalBg: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 24,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
    borderRadius: 4,
  },
  modalTitle: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: "900", letterSpacing: 2, marginBottom: 16 },
  input: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 4,
    marginBottom: 12,
    fontSize: 15,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: theme.colors.accent,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    gap: 8,
  },
  btnText: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  btnGhostText: { color: theme.colors.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 14 },
});
