import { useCallback, useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Image,
  ActivityIndicator,
  LayoutChangeEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { confirm } from "../../src/confirm";

export default function ToolboxDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [layout, setLayout] = useState<any>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [editingDrawer, setEditingDrawer] = useState<any>(null);
  const [activeDrawerId, setActiveDrawerId] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [l, t] = await Promise.all([api.getLayout(id), api.listTools()]);
      setLayout(l);
      setTools(t);
    } catch {
      router.back();
    }
  }, [id, router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!layout) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const runAi = async () => {
    setAnalyzing(true);
    try {
      // Strip data: prefix
      let img = layout.photo;
      if (img.startsWith("data:")) img = img.split(",", 2)[1];
      const res = await api.analyzeToolbox(img);
      const sd = res.suggested_drawers || 0;
      if (sd === 0) {
        Alert.alert("AI couldn't detect drawers", res.notes || "Try a clearer photo.");
        return;
      }
      Alert.alert(
        "AI suggests " + sd + " drawer" + (sd > 1 ? "s" : ""),
        (res.notes || "") + (res.confidence ? `\nConfidence: ${res.confidence}` : "") + "\n\nCreate them now?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Create",
            onPress: async () => {
              const newDrawers: any[] = [];
              const total = sd;
              for (let i = 0; i < total; i++) {
                const label = res.labels?.[i] || `Drawer ${i + 1}`;
                // create matching Location
                const loc = await api.createLocation({
                  name: `${layout.name} - ${label}`,
                  parent_layout_id: layout.id,
                  drawer_index: i,
                });
                newDrawers.push({
                  id: `d-${Date.now()}-${i}`,
                  name: label,
                  x: 0.05,
                  y: i / total + 0.02,
                  width: 0.9,
                  height: 1 / total - 0.04,
                  location_id: loc.id,
                });
              }
              await api.updateLayout(layout.id, { drawers: newDrawers });
              load();
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("AI error", e.message || "Could not analyze");
    } finally {
      setAnalyzing(false);
    }
  };

  const addDrawer = async () => {
    const idx = (layout.drawers || []).length;
    const loc = await api.createLocation({
      name: `${layout.name} - Drawer ${idx + 1}`,
      parent_layout_id: layout.id,
      drawer_index: idx,
    });
    const drawers = [...(layout.drawers || [])];
    drawers.push({
      id: `d-${Date.now()}`,
      name: `Drawer ${idx + 1}`,
      x: 0.1,
      y: 0.1 + idx * 0.08,
      width: 0.8,
      height: 0.08,
      location_id: loc.id,
    });
    await api.updateLayout(layout.id, { drawers });
    load();
  };

  const removeDrawer = async (drawerId: string) => {
    if (!(await confirm("Remove drawer?", "Tools assigned to it keep the location.", "Remove", true))) return;
    const drawers = (layout.drawers || []).filter((d: any) => d.id !== drawerId);
    await api.updateLayout(layout.id, { drawers });
    load();
  };

  const saveDrawer = async () => {
    if (!editingDrawer) return;
    const drawers = (layout.drawers || []).map((d: any) =>
      d.id === editingDrawer.id ? { ...d, ...editingDrawer } : d
    );
    if (editingDrawer.location_id) {
      // update location name to match
      await api.createLocation({
        name: `${layout.name} - ${editingDrawer.name}`,
        parent_layout_id: layout.id,
      }).catch(() => {});
    }
    await api.updateLayout(layout.id, { drawers });
    setEditingDrawer(null);
    load();
  };

  const removeLayout = async () => {
    if (!(await confirm("Delete this toolbox?", "Drawers/locations stay but are unlinked.", "Delete", true))) return;
    await api.deleteLayout(layout.id);
    router.back();
  };

  const onImgLayout = (e: LayoutChangeEvent) => {
    setImgSize({
      w: e.nativeEvent.layout.width,
      h: e.nativeEvent.layout.height,
    });
  };

  const activeDrawer = (layout.drawers || []).find((d: any) => d.id === activeDrawerId);
  const toolsInDrawer = activeDrawer
    ? tools.filter((t) => t.location_id === activeDrawer.location_id)
    : [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{layout.name.toUpperCase()}</Text>
        <TouchableOpacity onPress={removeLayout} hitSlop={10}>
          <Ionicons name="trash-outline" size={22} color={theme.colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.imgWrap} onLayout={onImgLayout}>
          <Image source={{ uri: layout.photo }} style={styles.img} resizeMode="contain" />
          {(layout.drawers || []).map((d: any) => (
            <TouchableOpacity
              key={d.id}
              testID={`drawer-marker-${d.id}`}
              style={[
                styles.marker,
                {
                  left: `${d.x * 100}%`,
                  top: `${d.y * 100}%`,
                  width: `${d.width * 100}%`,
                  height: `${d.height * 100}%`,
                  borderColor: activeDrawerId === d.id ? theme.colors.success : theme.colors.accent,
                },
              ]}
              onPress={() => setActiveDrawerId(d.id)}
            >
              <Text style={styles.markerLabel} numberOfLines={1}>{d.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity testID="ai-analyze-btn" style={styles.aiBtn} onPress={runAi} disabled={analyzing}>
            {analyzing ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : (
              <Ionicons name="sparkles" size={18} color={theme.colors.accent} />
            )}
            <Text style={styles.aiBtnText}>{analyzing ? "ANALYZING..." : "AI ANALYZE"}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="add-drawer-btn" style={styles.addDrawerBtn} onPress={addDrawer}>
            <Ionicons name="add" size={18} color="#000" />
            <Text style={styles.addDrawerText}>ADD DRAWER</Text>
          </TouchableOpacity>
        </View>

        {activeDrawer && (
          <View style={styles.drawerInfo}>
            <Text style={styles.drawerHead}>
              <Ionicons name="cube" size={14} color={theme.colors.accent} /> {activeDrawer.name.toUpperCase()}
            </Text>
            <Text style={styles.drawerSub}>
              {toolsInDrawer.length} tool{toolsInDrawer.length === 1 ? "" : "s"}
              {toolsInDrawer.length > 0
                ? ` · $${toolsInDrawer.reduce((s, t) => s + (t.cost || 0), 0).toFixed(2)}`
                : ""}
            </Text>
            {toolsInDrawer.length === 0 ? (
              <Text style={styles.empty}>
                No tools here yet. When adding/editing a tool, choose location "{layout.name} - {activeDrawer.name}".
              </Text>
            ) : (
              toolsInDrawer.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  testID={`drawer-tool-${t.id}`}
                  style={styles.drawerTool}
                  onPress={() => router.push(`/tool/${t.id}`)}
                >
                  <Ionicons name="construct" size={16} color={theme.colors.accent} />
                  <Text style={styles.drawerToolName}>{t.name}</Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <Text style={styles.sectionLabel}>DRAWERS ({(layout.drawers || []).length})</Text>
        {(layout.drawers || []).map((d: any) => (
          <View key={d.id} style={styles.drawerRow}>
            <Ionicons name="cube-outline" size={18} color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.drawerName}>{d.name}</Text>
              <Text style={styles.drawerMeta}>
                {`${(d.x * 100).toFixed(0)},${(d.y * 100).toFixed(0)}  ·  ${(d.width * 100).toFixed(0)}×${(d.height * 100).toFixed(0)}`}
              </Text>
            </View>
            <TouchableOpacity
              testID={`edit-drawer-${d.id}`}
              onPress={() => setEditingDrawer({ ...d })}
              hitSlop={6}
            >
              <Ionicons name="create-outline" size={18} color={theme.colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              testID={`del-drawer-${d.id}`}
              onPress={() => removeDrawer(d.id)}
              hitSlop={6}
            >
              <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {editingDrawer && (
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>EDIT DRAWER</Text>
            <Text style={styles.lbl}>NAME</Text>
            <TextInput
              testID="drawer-name-input"
              style={styles.input}
              value={editingDrawer.name}
              onChangeText={(v) => setEditingDrawer({ ...editingDrawer, name: v })}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lbl}>X (0–1)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={String(editingDrawer.x)}
                  onChangeText={(v) => setEditingDrawer({ ...editingDrawer, x: parseFloat(v) || 0 })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lbl}>Y (0–1)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={String(editingDrawer.y)}
                  onChangeText={(v) => setEditingDrawer({ ...editingDrawer, y: parseFloat(v) || 0 })}
                />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lbl}>W</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={String(editingDrawer.width)}
                  onChangeText={(v) => setEditingDrawer({ ...editingDrawer, width: parseFloat(v) || 0.1 })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lbl}>H</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={String(editingDrawer.height)}
                  onChangeText={(v) => setEditingDrawer({ ...editingDrawer, height: parseFloat(v) || 0.1 })}
                />
              </View>
            </View>
            <Text style={styles.helper}>
              X/Y/W/H are 0–1 ratios of the photo. Adjust to match the drawer's position.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setEditingDrawer(null)}>
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="save-drawer-btn" style={styles.btn} onPress={saveDrawer}>
                <Text style={styles.btnText}>SAVE</Text>
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
  title: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: "900", letterSpacing: 2, flex: 1, textAlign: "center" },
  imgWrap: { width: "100%", height: 360, backgroundColor: "#000" },
  img: { width: "100%", height: "100%" },
  marker: {
    position: "absolute",
    borderWidth: 2,
    backgroundColor: "rgba(255,179,0,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  markerLabel: {
    color: "#000",
    fontWeight: "900",
    fontSize: 11,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    letterSpacing: 1,
  },
  actionsRow: { flexDirection: "row", gap: 8, padding: 16 },
  aiBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    height: 44,
    borderRadius: 4,
    backgroundColor: "rgba(255,179,0,0.08)",
  },
  aiBtnText: { color: theme.colors.accent, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  addDrawerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: theme.colors.accent,
    height: 44,
    borderRadius: 4,
  },
  addDrawerText: { color: "#000", fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  drawerInfo: {
    margin: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.success,
    backgroundColor: "rgba(34,197,94,0.05)",
    borderRadius: 4,
  },
  drawerHead: { color: theme.colors.textPrimary, fontWeight: "900", letterSpacing: 1, fontSize: 14 },
  drawerSub: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 },
  drawerTool: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  drawerToolName: { color: theme.colors.textPrimary, flex: 1, fontWeight: "600" },
  empty: { color: theme.colors.textMuted, fontStyle: "italic", marginTop: 8 },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  drawerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
  },
  drawerName: { color: theme.colors.textPrimary, fontWeight: "700" },
  drawerMeta: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
  modalBg: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 20,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
    borderRadius: 4,
  },
  modalTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: "900", letterSpacing: 2, marginBottom: 12 },
  lbl: { color: theme.colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 2, marginBottom: 4 },
  input: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 4,
    marginBottom: 10,
    fontSize: 14,
  },
  helper: { color: theme.colors.textMuted, fontSize: 11, fontStyle: "italic" },
  btn: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
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
