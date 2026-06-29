import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { useAppResume } from "../src/appLifecycle";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { confirm } from "../src/confirm";
import { buildLocationTree, LocationNode } from "../src/locationTree";
import { IndustrialBanner } from "../src/components/IndustrialBanner";
import { PillButton } from "../src/components/PillButton";
import { TbvListPanel } from "../src/tbv/components/TbvListPanel";
import { useIsSteel, useSteelPanelFrame } from "../src/tbv/steel";
import { SKIN, CAP } from "../src/tbv/skins";

import { themedStyles, useSkin } from "../src/themeContext";

export default function LocationsTreeScreen() {
  const router = useRouter();
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  const isSteel = useIsSteel();
  const steelPanel = useSteelPanelFrame();
  const winSrc = isSteel ? steelPanel.source : SKIN.window;
  const winCap = isSteel ? steelPanel.capInsets : CAP.window;
  const steelScale = isSteel ? steelPanel.frameScale : undefined;
  // When the user opens this screen from a tool detail page, the source
  // route includes `?highlight=<location_id>` so we can visually point
  // at the location currently assigned to that tool. Lives only for the
  // initial render — purely UX, not editable.
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const [nodes, setNodes] = useState<LocationNode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<{ parentId: string | null; parentName: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; currentName: string } | null>(null);
  const [moving, setMoving] = useState<LocationNode | null>(null);
  const [actionMenu, setActionMenu] = useState<LocationNode | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    try {
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
      setLoaded(true);
    } catch {
      // Don't reset `nodes` — keep whatever we last had so the user
      // doesn't see a flash of empty state on a transient API blip.
      setLoaded(true);
    }
  }, [expanded.size]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


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
    const isHighlighted = highlight === n.id;
    const isRoot = n.depth === 0;
    const hasChildren = n.children.length > 0;
    return (
      <View key={n.id}>
        <View
          style={[
            styles.row,
            isRoot ? styles.rowRoot : { paddingLeft: 16 + n.depth * 20 },
            !isRoot && styles.rowChild,
            isHighlighted && styles.rowHighlighted,
          ]}
        >
          {hasChildren ? (
            <TouchableOpacity testID={`expand-${n.id}`} onPress={() => toggle(n.id)} hitSlop={8}>
              <Ionicons
                name={isOpen ? "chevron-down" : "chevron-forward"}
                size={18}
                color={isRoot ? theme.colors.accent : theme.colors.textSecondary}
              />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 18 }} />
          )}
          <Ionicons
            name={hasChildren ? (isOpen ? "folder-open" : "folder") : "cube-outline"}
            size={isRoot ? 18 : 15}
            color={isRoot ? theme.colors.accent : theme.colors.textSecondary}
          />
          <Text style={[styles.rowText, isRoot && styles.rowTextRoot]} numberOfLines={1}>
            {n.name}
          </Text>
          {hasChildren && (
            <Text style={styles.countBadge}>{n.children.length}</Text>
          )}
          <TouchableOpacity
            testID={`loc-menu-${n.id}`}
            onPress={() => setActionMenu(n)}
            hitSlop={8}
            style={styles.kebabBtn}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
        {isOpen && n.children.map(renderNode)}
      </View>
    );
  };

  const ACTIONS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; danger?: boolean; run: (n: LocationNode) => void }[] = [
    { key: "add", label: "Add sub-location", icon: "add-circle-outline", run: (n) => setAdding({ parentId: n.id, parentName: n.path }) },
    { key: "rename", label: "Rename", icon: "pencil-outline", run: (n) => { setEditing({ id: n.id, currentName: n.name }); setName(n.name); } },
    { key: "move", label: "Move to…", icon: "swap-horizontal-outline", run: (n) => setMoving(n) },
    { key: "delete", label: "Delete", icon: "trash-outline", danger: true, run: (n) => remove(n) },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title="LOCATIONS"
        subtitle="Nested Storage Tree"
        onBack={() => router.back()}
      />
      <View style={styles.actionsRow}>
        <PillButton
          testID="add-root-btn"
          label="ADD LOCATION"
          icon="add"
          variant="active"
          onPress={() => setAdding({ parentId: null, parentName: "" })}
        />
      </View>
      {!loaded ? (
        <View style={styles.empty}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : nodes.length === 0 ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          <View style={styles.empty}>
            <Ionicons name="location-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>NO LOCATIONS</Text>
            <Text style={styles.emptyText}>
              Add a top-level location like “Garage” or “Workshop”, then nest sub-locations
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
        </ScrollView>
      ) : (
        <>
          {(() => {
            const tree = (
              <ScrollView
                contentContainerStyle={{ padding: isIndustrial ? 0 : 8, paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
              >
                {nodes.map(renderNode)}
              </ScrollView>
            );
            return isIndustrial ? (
              <TbvListPanel
                source={winSrc}
                capInsets={winCap}
                frameScale={steelScale}
                style={styles.listPanel}
                padX={24}
                padTop={14}
                padBottom={12}
              >
                {tree}
              </TbvListPanel>
            ) : (
              <View style={styles.listPanelPlain}>{tree}</View>
            );
          })()}
          <Text style={styles.tip}>
            Tap the <Text style={{ color: theme.colors.accent }}>⋮</Text> menu on any location to add a
            sub-location, rename, move, or delete it. Locations nest unlimited levels deep.
          </Text>
        </>
      )}

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

      {/* Per-row action menu (replaces the 4 inline buttons) */}
      <Modal visible={!!actionMenu} transparent animationType="fade" onRequestClose={() => setActionMenu(null)}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setActionMenu(null)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle} numberOfLines={1}>{actionMenu?.name}</Text>
            {actionMenu?.path && actionMenu.path !== actionMenu.name ? (
              <Text style={styles.menuPath} numberOfLines={1}>{actionMenu.path}</Text>
            ) : null}
            {ACTIONS.map((a) => (
              <TouchableOpacity
                key={a.key}
                testID={`loc-action-${a.key}`}
                style={styles.menuItem}
                onPress={() => { const n = actionMenu!; setActionMenu(null); a.run(n); }}
              >
                <Ionicons name={a.icon} size={18} color={a.danger ? theme.colors.danger : theme.colors.accent} />
                <Text style={[styles.menuItemText, a.danger && { color: theme.colors.danger }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  treeCard: {
    marginHorizontal: 16,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  listPanel: { flex: 1, marginHorizontal: 12, marginTop: 4 },
  listPanelPlain: { flex: 1, marginHorizontal: 8 },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  title: { color: c.textPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  moveOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  moveOptionText: {
    color: c.textPrimary,
    fontSize: 10,
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingRight: 8,
    borderBottomColor: c.borderSubtle,
    borderBottomWidth: 1,
  },
  rowRoot: {
    paddingLeft: 14,
    borderBottomColor: c.accent,
    marginTop: 4,
  },
  rowChild: {
    backgroundColor: "transparent",
  },
  rowHighlighted: {
    borderLeftWidth: 3,
    borderLeftColor: c.accent,
  },
  rowText: { color: c.textPrimary, fontSize: 11, flex: 1 },
  rowTextRoot: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  countBadge: {
    color: c.accent,
    fontSize: 9,
    fontWeight: "800",
    paddingHorizontal: 4,
  },
  kebabBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  // ---- per-row action menu ----
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  menuCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: c.bgSecondary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  menuTitle: {
    color: c.textPrimary,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  menuPath: {
    color: c.textMuted,
    fontSize: 10,
    paddingHorizontal: 14,
    paddingBottom: 8,
    marginTop: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  menuItemText: { color: c.textPrimary, fontSize: 13, fontWeight: "600" },
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 40 },
  emptyTitle: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 16,
  },
  emptyText: {
    color: c.textSecondary,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 14,
  },
  tip: {
    color: c.textMuted,
    fontStyle: "italic",
    fontSize: 9,
    padding: 20,
    textAlign: "center",
  },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: c.bgSecondary,
    padding: 24,
    borderTopWidth: 2,
    borderTopColor: c.accent,
  },
  modalTitle: {
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 8,
  },
  modalParent: { color: c.accent, fontSize: 9, marginBottom: 12 },
  input: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    color: c.textPrimary,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 4,
    marginBottom: 12,
    fontSize: 11,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: c.accent,
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
    borderColor: c.border,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  btnGhostText: { color: c.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 10 },
}));
