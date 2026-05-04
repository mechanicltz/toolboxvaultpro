import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { confirm } from "../src/confirm";
import { buildLocationTree, LocationNode } from "../src/locationTree";

export default function LocationsTreeScreen() {
  const router = useRouter();
  const [nodes, setNodes] = useState<LocationNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<{ parentId: string | null; parentName: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; currentName: string } | null>(null);
  const [moving, setMoving] = useState<LocationNode | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const flat = await api.listLocations();
    const tree = buildLocationTree(flat);
    setNodes(tree);
    // Auto-expand top-level on first load
    if (expanded.size === 0 && tree.length > 0) {
      const all = new Set<string>();
      const collectIds = (ns: LocationNode[]) => {
        ns.forEach((n) => {
          all.add(n.id);
          collectIds(n.children);
        });
      };
      collectIds(tree);
      setExpanded(all);
    }
  }, [expanded.size]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggle = (id: string) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const add = async () => {
    if (!name.trim() || !adding) return;
    await api.createLocation({
      name: name.trim(),
      parent_id: adding.parentId,
    });
    if (adding.parentId) setExpanded((cur) => new Set(cur).add(adding.parentId!));
    setName("");
    setAdding(null);
    load();
  };

  const saveRename = async () => {
    if (!editing || !name.trim()) return;
    await api.updateLocation(editing.id, { name: name.trim() });
    setName("");
    setEditing(null);
    load();
  };

  const isDescendantOf = (candidateParent: LocationNode, nodeId: string): boolean => {
    // Returns true if candidateParent is the node itself OR is in its subtree.
    if (candidateParent.id === nodeId) return true;
    for (const child of candidateParent.children) {
      if (isDescendantOf(child, nodeId)) return true;
    }
    return false;
  };

  const moveTo = async (newParentId: string | null) => {
    if (!moving) return;
    try {
      await api.updateLocation(moving.id, { parent_id: newParentId });
      if (newParentId) setExpanded((cur) => new Set(cur).add(newParentId));
      setMoving(null);
      load();
    } catch (e: any) {
      Alert.alert("Cannot move", e?.message || "Could not move this location.");
    }
  };

  const remove = async (n: LocationNode) => {
    if (n.children.length > 0) {
      const which = await new Promise<"cancel" | "promote" | "cascade">((resolve) => {
        if (typeof window !== "undefined" && typeof window.confirm === "function") {
          // web: 2-step confirm
          const yes = window.confirm(
            `Delete "${n.name}"?\n\nIt has ${n.children.length} sub-location(s).\n\nOK = move children up to parent\nCancel = abort`
          );
          if (!yes) return resolve("cancel");
          const cascade = window.confirm(
            `Also delete ALL sub-locations under "${n.name}"?\n\nOK = delete everything\nCancel = keep children, just remove this one`
          );
          return resolve(cascade ? "cascade" : "promote");
        }
        Alert.alert(
          `Delete "${n.name}"?`,
          `This has ${n.children.length} sub-location(s).`,
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve("cancel") },
            { text: "Move children up", onPress: () => resolve("promote") },
            { text: "Delete all", style: "destructive", onPress: () => resolve("cascade") },
          ]
        );
      });
      if (which === "cancel") return;
      await api.deleteLocation(n.id, which === "cascade");
    } else {
      if (!(await confirm(`Delete "${n.name}"?`, "This will remove this location.", "Delete", true))) return;
      await api.deleteLocation(n.id);
    }
    load();
  };

  const renderNode = (n: LocationNode) => {
    const isOpen = expanded.has(n.id);
    return (
      <View key={n.id}>
        <View style={[styles.row, { paddingLeft: 16 + n.depth * 18 }]}>
          {n.children.length > 0 ? (
            <TouchableOpacity testID={`expand-${n.id}`} onPress={() => toggle(n.id)} hitSlop={6}>
              <Ionicons
                name={isOpen ? "chevron-down" : "chevron-forward"}
                size={18}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 18 }} />
          )}
          <Ionicons
            name={n.children.length > 0 ? "folder" : "location"}
            size={16}
            color={theme.colors.accent}
          />
          <Text style={styles.rowText}>{n.name}</Text>
          {n.children.length > 0 && (
            <Text style={styles.countBadge}>{n.children.length}</Text>
          )}
          <TouchableOpacity
            testID={`addchild-${n.id}`}
            onPress={() => setAdding({ parentId: n.id, parentName: n.path })}
            hitSlop={6}
            style={styles.iconBtn}
          >
            <Ionicons name="add" size={18} color={theme.colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            testID={`edit-loc-${n.id}`}
            onPress={() => { setEditing({ id: n.id, currentName: n.name }); setName(n.name); }}
            hitSlop={6}
            style={styles.iconBtn}
          >
            <Ionicons name="pencil" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            testID={`move-loc-${n.id}`}
            onPress={() => setMoving(n)}
            hitSlop={6}
            style={styles.iconBtn}
          >
            <Ionicons name="move" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            testID={`del-loc-${n.id}`}
            onPress={() => remove(n)}
            hitSlop={6}
            style={styles.iconBtn}
          >
            <Ionicons name="close" size={18} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
        {isOpen && n.children.map(renderNode)}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>LOCATIONS</Text>
        <TouchableOpacity
          testID="add-root-btn"
          onPress={() => setAdding({ parentId: null, parentName: "" })}
          hitSlop={10}
        >
          <Ionicons name="add" size={26} color={theme.colors.accent} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {nodes.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="location-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>NO LOCATIONS</Text>
            <Text style={styles.emptyText}>
              Add a top-level location like "Garage" or "Workshop", then nest sub-locations
              (toolboxes → drawers → boxes) inside.
            </Text>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => setAdding({ parentId: null, parentName: "" })}
            >
              <Ionicons name="add" size={18} color="#000" />
              <Text style={styles.btnText}>ADD LOCATION</Text>
            </TouchableOpacity>
          </View>
        ) : (
          nodes.map(renderNode)
        )}
        <Text style={styles.tip}>
          Tap a row's <Text style={{ color: theme.colors.accent }}>+</Text> to add a sub-location.
          Locations can nest unlimited levels deep.
        </Text>
      </ScrollView>

      <Modal visible={!!adding} transparent animationType="slide" onRequestClose={() => setAdding(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBg}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {adding?.parentId ? "ADD SUB-LOCATION" : "NEW LOCATION"}
              </Text>
              {adding?.parentName ? (
                <Text style={styles.modalParent}>under: {adding.parentName}</Text>
              ) : null}
              <TextInput
                testID="new-loc-input"
                placeholder="e.g. Green Toolbox, Top Drawer..."
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={name}
                onChangeText={setName}
                onSubmitEditing={add}
                autoFocus
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  style={styles.btnGhost}
                  onPress={() => {
                    setAdding(null);
                    setName("");
                  }}
                >
                  <Text style={styles.btnGhostText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="save-loc-btn" style={styles.btn} onPress={add}>
                  <Text style={styles.btnText}>SAVE</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBg}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>RENAME LOCATION</Text>
              {editing?.currentName ? (
                <Text style={styles.modalParent}>current: {editing.currentName}</Text>
              ) : null}
              <TextInput
                testID="edit-loc-input"
                placeholder="New name"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={name}
                onChangeText={setName}
                onSubmitEditing={saveRename}
                autoFocus
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  style={styles.btnGhost}
                  onPress={() => {
                    setEditing(null);
                    setName("");
                  }}
                >
                  <Text style={styles.btnGhostText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="save-rename-btn" style={styles.btn} onPress={saveRename}>
                  <Text style={styles.btnText}>SAVE</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!moving} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: "80%" }]}>
            <Text style={styles.modalTitle}>MOVE LOCATION</Text>
            {moving ? (
              <Text style={styles.modalParent}>
                moving: <Text style={{ color: theme.colors.accent }}>{moving.name}</Text>
              </Text>
            ) : null}
            <Text style={[styles.modalParent, { marginTop: 6 }]}>Pick new parent:</Text>
            <ScrollView style={{ maxHeight: 340, marginTop: 8 }}>
              <TouchableOpacity
                testID="move-to-root"
                style={styles.moveOption}
                onPress={() => moveTo(null)}
              >
                <Ionicons name="home" size={16} color={theme.colors.accent} />
                <Text style={styles.moveOptionText}>(Top level — no parent)</Text>
              </TouchableOpacity>
              {(function renderOption(list: LocationNode[]): any {
                return list.map((n) => {
                  if (!moving) return null;
                  const disabled = isDescendantOf(n, moving.id) || n.id === moving.parent_id;
                  return (
                    <View key={`move-opt-${n.id}`}>
                      <TouchableOpacity
                        testID={`move-to-${n.id}`}
                        style={[
                          styles.moveOption,
                          { paddingLeft: 12 + n.depth * 16 },
                          disabled && { opacity: 0.35 },
                        ]}
                        disabled={disabled}
                        onPress={() => moveTo(n.id)}
                      >
                        <Ionicons
                          name={n.children.length > 0 ? "folder" : "location"}
                          size={14}
                          color={theme.colors.textSecondary}
                        />
                        <Text style={styles.moveOptionText}>
                          {n.name}
                          {n.id === moving.parent_id ? "  (current parent)" : ""}
                          {isDescendantOf(n, moving.id) && n.id !== moving.parent_id ? "  (can't move into itself)" : ""}
                        </Text>
                      </TouchableOpacity>
                      {renderOption(n.children)}
                    </View>
                  );
                });
              })(nodes)}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.btnGhost, { flex: 1 }]}
                onPress={() => setMoving(null)}
              >
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  title: { color: theme.colors.textPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  moveOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  moveOptionText: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingRight: 12,
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
  },
  rowText: { color: theme.colors.textPrimary, fontSize: 11, flex: 1 },
  countBadge: {
    color: theme.colors.textMuted,
    fontSize: 8,
    fontWeight: "800",
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: theme.colors.surface,
    borderRadius: 2,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
  },
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 40 },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 16,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 14,
  },
  tip: {
    color: theme.colors.textMuted,
    fontStyle: "italic",
    fontSize: 9,
    padding: 20,
    textAlign: "center",
  },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: theme.colors.bgSecondary,
    padding: 24,
    borderTopWidth: 2,
    borderTopColor: theme.colors.accent,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 8,
  },
  modalParent: { color: theme.colors.accent, fontSize: 9, marginBottom: 12 },
  input: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 4,
    marginBottom: 12,
    fontSize: 11,
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
  btnText: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 10 },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  btnGhostText: { color: theme.colors.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 10 },
});
