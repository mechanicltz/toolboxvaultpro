import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Linking,
  Platform,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Share,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as MailComposer from "expo-mail-composer";
import * as ImagePicker from "expo-image-picker";
import { useAppResume } from "../src/appLifecycle";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { confirm } from "../src/confirm";
import { useAuth } from "../src/AuthContext";

import { themedStyles } from "../src/themeContext";
import { ShadowBox } from "../src/components/ShadowBox";
import { SkinPlate } from "../src/components/SkinPlate";
import { ContactIconImage } from "../src/components/ContactIcons";
import { IndustrialBanner } from "../src/components/IndustrialBanner";
import { PillButton } from "../src/components/PillButton";

const PRIORITIES = [
  { key: "low", label: "LOW", color: theme.colors.textMuted },
  { key: "normal", label: "NORMAL", color: theme.colors.accent },
  { key: "high", label: "HIGH", color: theme.colors.danger },
];

// Strip protocol + leading "www." and (for very long paths) trim with an
// ellipsis so the URL fits on one line under the item name. Examples:
//   "https://www.amazon.com/dp/B0..."    → "amazon.com/dp/B0..."
//   "https://snapon.com/cdn/products/123" → "snapon.com/cdn/products/123"
function formatUrlForDisplay(raw?: string): string {
  if (!raw) return "";
  let s = raw.trim();
  s = s.replace(/^https?:\/\//i, "");
  s = s.replace(/^www\./i, "");
  // Drop trailing slash for visual polish.
  s = s.replace(/\/$/, "");
  // FlatList truncation handles real overflow, but cap at 60 chars so
  // the row stays compact on small screens.
  if (s.length > 60) s = s.slice(0, 57) + "...";
  return s;
}

export default function WishlistScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [showPurchased, setShowPurchased] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [dealers, setDealers] = useState<any[]>([]);

  // Multi-select mode for bulk email/share. When ON, tapping a card
  // toggles its selection instead of opening the link.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [list, dl] = await Promise.all([
        api.listWishlist(),
        api.listDealers(),
      ]);
      setItems(list);
      setDealers(dl);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const visible = items.filter((i) => !!i.purchased === showPurchased);
  const totalPlanned = items.filter((i) => !i.purchased).reduce((s, i) => s + (i.price || 0), 0);
  const totalSpent = items.filter((i) => i.purchased).reduce((s, i) => s + (i.price || 0), 0);
  const openCount = items.filter((i) => !i.purchased).length;
  const doneCount = items.length - openCount;

  const openLink = async (url?: string) => {
    if (!url) return;
    let normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) normalized = "https://" + normalized;
    try {
      if (Platform.OS === "web") {
        window.open(normalized, "_blank", "noopener");
      } else {
        await Linking.openURL(normalized);
      }
    } catch (e: any) {
      Alert.alert("Could not open link", e.message || String(e));
    }
  };

  const save = async () => {
    if (!editing?.name?.trim()) {
      Alert.alert("Name required", "Give your wish a name.");
      return;
    }
    const payload: any = {
      name: editing.name.trim(),
      url: (editing.url || "").trim(),
      description: editing.description || "",
      price: editing.price ? parseFloat(editing.price) || null : null,
      dealer_id: editing.dealer_id || null,
      priority: editing.priority || "normal",
      notes: editing.notes || "",
      model_number: (editing.model_number || "").trim(),
      // Single preview photo stored as a 1-element list — matches the
      // shape of Tool.photos so the convert endpoint is a direct copy.
      photos: editing.photos || [],
    };
    try {
      if (editing.id) {
        await api.updateWishlist(editing.id, payload);
      } else {
        await api.createWishlist(payload);
      }
      setEditing(null);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not save");
    }
  };

  // Image picker for the wishlist preview photo. camera=true → camera;
  // false → photo library. Stored as a data: URI base64 string so it can
  // be copied directly to Tool.photos when the wish is converted.
  const pickWishPhoto = async (camera: boolean) => {
    try {
      const perm = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow access to add a photo.");
        return;
      }
      const opts: any = { quality: 0.5, base64: true, allowsEditing: false };
      const res = camera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync({
            ...opts,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
          });
      if (!res.canceled && res.assets[0]) {
        const a = res.assets[0];
        const dataUri = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
        setEditing({ ...editing, photos: [dataUri] });
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not load photo");
    }
  };

  const choosePhoto = () => {
    Alert.alert(
      "Add a photo",
      "Where do you want the photo from?",
      [
        { text: "Take Photo", onPress: () => pickWishPhoto(true) },
        { text: "Choose from Library", onPress: () => pickWishPhoto(false) },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true }
    );
  };

  const remove = async (item: any) => {
    if (!(await confirm("Delete wish?", item.name, "Delete", true))) return;
    await api.deleteWishlist(item.id);
    load();
  };

  // When the user taps the green check mark to mark a wish as Purchased
  // (transitioning unpurchased → purchased), offer to convert it to a
  // Tool right away.
  //   • "Just Mark Purchased" → toggles purchased but creates no tool
  //   • "Convert to Tool"     → creates a Tool, then opens the edit screen
  //   • "Cancel"              → does nothing
  // Already-purchased items just toggle back silently (no prompt).
  const togglePurchased = async (item: any) => {
    if (item.purchased) {
      await api.updateWishlist(item.id, { purchased: false });
      load();
      return;
    }

    const justPurchase = async () => {
      try {
        await api.updateWishlist(item.id, { purchased: true });
        load();
      } catch (e: any) {
        Alert.alert("Error", e?.message || "Could not update");
      }
    };

    // On web the native 3-button Alert callback isn't reliable, so fall
    // back to a yes/no confirm (Convert? OK = convert, Cancel = just mark).
    if (Platform.OS === "web") {
      const wantConvert = await confirm(
        "Mark as Purchased",
        `Do you also want to convert "${item.name}" into a tool? OK = convert, Cancel = just mark purchased.`,
        "Convert to Tool"
      );
      if (wantConvert) await convert(item, /* alreadyConfirmed */ true);
      else await justPurchase();
      return;
    }

    Alert.alert(
      "Mark as Purchased",
      `Do you also want to convert "${item.name}" into a tool in your inventory? You'll be taken to the edit screen to finish adding details.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Just Mark Purchased", onPress: justPurchase },
        {
          text: "Convert to Tool",
          style: "default",
          onPress: () => convert(item, /* alreadyConfirmed */ true),
        },
      ],
      { cancelable: true }
    );
  };

  // -------------------------------------------------------------------
  // SHARING — single item + bulk email
  // -------------------------------------------------------------------

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cancelSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const escapeHtml = (s: string) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  // Plain-text version of an item — used by SMS share + as the email
  // fallback for clients that don't render HTML.
  const itemToPlainText = (it: any): string => {
    const lines: string[] = [];
    lines.push(`🔧 ${it.name}`);
    if (it.model_number) lines.push(`Model: ${it.model_number}`);
    if (it.price) lines.push(`Price: $${Number(it.price).toFixed(2)}`);
    if (it.dealer_name) lines.push(`Dealer: ${it.dealer_name}`);
    const meta = PRIORITIES.find((p) => p.key === (it.priority || "normal"))?.label;
    if (meta && meta !== "NORMAL") lines.push(`Priority: ${meta}`);
    if (it.description) lines.push(`\n${it.description}`);
    if (it.notes) lines.push(`Notes: ${it.notes}`);
    if (it.url) {
      let u = it.url.trim();
      if (!/^https?:\/\//i.test(u)) u = "https://" + u;
      lines.push(`\n${u}`);
    }
    return lines.join("\n");
  };

  // Pretty HTML email — used for both single-item and bulk wishlist
  // exports. Styled with inline CSS so it renders identically in Gmail,
  // Outlook, Apple Mail, etc.
  const itemsToHtml = (list: any[], title: string): string => {
    const rows = list
      .map((it) => {
        let url = (it.url || "").trim();
        if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
        const prio = PRIORITIES.find((p) => p.key === (it.priority || "normal"));
        const prioBadge = prio
          ? `<span style="display:inline-block;padding:2px 8px;font-size:10px;font-weight:700;letter-spacing:1px;border:1px solid ${prio.color};color:${prio.color};border-radius:3px;margin-left:6px;">${prio.label}</span>`
          : "";
        const price = it.price
          ? `<div style="color:#f97316;font-size:16px;font-weight:800;margin-top:6px;">$${Number(it.price).toFixed(2)}</div>`
          : "";
        const dealer = it.dealer_name
          ? `<div style="color:#666;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-top:4px;">${escapeHtml(it.dealer_name)}</div>`
          : "";
        const model = it.model_number
          ? `<div style="color:#444;font-size:12px;font-weight:600;margin-top:6px;"><span style="color:#888;font-size:10px;letter-spacing:1px;">MODEL </span>${escapeHtml(it.model_number)}</div>`
          : "";
        const desc = it.description
          ? `<p style="color:#333;font-size:13px;line-height:1.5;margin:10px 0 0;">${escapeHtml(it.description)}</p>`
          : "";
        const notes = it.notes
          ? `<p style="color:#888;font-size:12px;font-style:italic;margin:6px 0 0;">${escapeHtml(it.notes)}</p>`
          : "";
        const link = url
          ? `<div style="margin-top:12px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:8px 14px;background:#f97316;color:#fff;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:1px;border-radius:4px;">VIEW PRODUCT &rarr;</a></div>`
          : "";
        return `
          <tr><td style="padding:18px;border-bottom:1px solid #eaeaea;">
            <div style="font-size:15px;font-weight:700;color:#1a1a1a;">${escapeHtml(it.name)}${prioBadge}</div>
            ${price}
            ${model}
            ${dealer}
            ${desc}
            ${notes}
            ${link}
          </td></tr>
        `;
      })
      .join("");

    const userLabel = user?.name || user?.email || "Toolbox Vault user";
    const sentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f4f4f4;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#0d0d0d;padding:24px;text-align:center;">
          <div style="color:#f97316;font-size:11px;font-weight:800;letter-spacing:3px;">TOOLBOX VAULT</div>
          <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:1px;margin-top:6px;">${escapeHtml(title)}</div>
          <div style="color:#999;font-size:11px;margin-top:6px;">Shared by ${escapeHtml(userLabel)} &middot; ${sentDate}</div>
        </td></tr>
        ${rows}
        <tr><td style="background:#fafafa;padding:18px;text-align:center;color:#999;font-size:10px;letter-spacing:0.5px;">
          Sent from the Toolbox Vault app &middot; Track tools, dealers &amp; receipts in one place.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  };

  // Per-item native share sheet (lets the user pick text / email / etc.).
  const shareItem = async (it: any) => {
    try {
      const message = itemToPlainText(it);
      await Share.share({
        title: it.name,
        message,
      });
    } catch (e: any) {
      Alert.alert("Couldn't share", e?.message || "Try again.");
    }
  };

  // Per-item email — opens Mail compose with a pretty HTML body.
  const emailItem = async (it: any) => {
    try {
      const available = await MailComposer.isAvailableAsync();
      if (!available) {
        Alert.alert("Mail unavailable", "No mail account is configured on this device.");
        return;
      }
      await MailComposer.composeAsync({
        subject: `Wishlist: ${it.name}`,
        body: itemsToHtml([it], `Tool I'm Looking At`),
        isHtml: true,
      });
    } catch (e: any) {
      Alert.alert("Couldn't open mail", e?.message || "Try again.");
    }
  };

  // Bulk email — composes a single email containing every SELECTED item.
  const emailSelected = async () => {
    const chosen = items.filter((i) => selected.has(i.id));
    if (chosen.length === 0) {
      Alert.alert("Nothing selected", "Tap one or more items, then try again.");
      return;
    }
    try {
      const available = await MailComposer.isAvailableAsync();
      if (!available) {
        Alert.alert("Mail unavailable", "No mail account is configured on this device.");
        return;
      }
      await MailComposer.composeAsync({
        subject: `My Tool Wishlist (${chosen.length} item${chosen.length === 1 ? "" : "s"})`,
        body: itemsToHtml(chosen, "My Tool Wishlist"),
        isHtml: true,
      });
      cancelSelectMode();
    } catch (e: any) {
      Alert.alert("Couldn't open mail", e?.message || "Try again.");
    }
  };

  // Helper opened from the per-item ··· menu. iOS doesn't ship with an
  // ActionSheet API in expo-go's stub, so we use Alert with buttons.
  const shareSheet = (it: any) => {
    Alert.alert(
      "Share this wish",
      it.name,
      [
        { text: "Text / Share Sheet", onPress: () => shareItem(it) },
        { text: "Email (HTML)", onPress: () => emailItem(it) },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true }
    );
  };

  // Convert a wish into a real Tool. When the user invoked this via
  // the "Mark Purchased" flow (above) we already showed a confirm,
  // so skip the second one. Otherwise still confirm first.
  const convert = async (item: any, alreadyConfirmed: boolean = false) => {
    if (!alreadyConfirmed) {
      const ok = await confirm(
        "Convert to tool?",
        `Add "${item.name}" to your inventory. You'll be taken to the edit screen to finish entering details.`,
        "Convert"
      );
      if (!ok) return;
    }
    try {
      const tool = await api.convertWishlist(item.id);
      // Refresh the wishlist in the background while we navigate so the
      // user lands on a clean edit screen straight away.
      load();
      // Open in EDIT mode so they can add brand, serial, location, etc.
      // (not the read-only detail screen).
      router.push(`/tool/edit?id=${tool.id}`);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not convert");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title={selectMode ? `SELECTED ${selected.size}` : "WISH LIST"}
        subtitle={selectMode ? "Tap items to include · email below" : "Tools you want · saved links"}
        leftSlot={
          <TouchableOpacity testID="wishlist-back" onPress={() => (selectMode ? cancelSelectMode() : router.back())} hitSlop={10}>
            <Ionicons name={selectMode ? "close" : "arrow-back"} size={22} color="#F97316" />
          </TouchableOpacity>
        }
      />
      <View style={styles.wishActionsRow}>
        {!selectMode ? (
          <TouchableOpacity
            testID="wish-select-mode"
            onPress={() => {
              setSelectMode(true);
              setSelected(new Set());
            }}
            style={styles.topBarBtn}
            hitSlop={10}
          >
            <Ionicons name="mail-outline" size={20} color={theme.colors.accent} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            testID="wish-select-all-tmp"
            style={{display:"none"}}
          ><Text>x</Text></TouchableOpacity>
        )}
      </View>
      <View style={{display: "none"}}>
          <TouchableOpacity
            testID="wish-select-all"
            onPress={() => {
              const all = visible.map((i: any) => i.id);
              if (selected.size === all.length) setSelected(new Set());
              else setSelected(new Set(all));
            }}
            style={styles.topBarBtn}
            hitSlop={10}
          >
            <Text style={styles.topBarBtnText}>
              {selected.size === visible.length && visible.length > 0 ? "NONE" : "ALL"}
            </Text>
          </TouchableOpacity>
      </View>

      <SkinPlate style={styles.statPlate} innerStyle={styles.statRowInner} padTop={11} padBottom={11}>
        <Stat label="Open" value={String(openCount)} />
        <Stat label="Planned" value={`$${totalPlanned.toFixed(0)}`} color={theme.colors.accent} />
        <Stat label="Spent" value={`$${totalSpent.toFixed(0)}`} color={theme.colors.success} />
      </SkinPlate>

      <View style={styles.toggleRow}>
        {[
          { k: false, label: "OPEN" },
          { k: true, label: "PURCHASED" },
        ].map((t) => (
          <TouchableOpacity
            key={String(t.k)}
            testID={`wish-tab-${t.k ? "done" : "open"}`}
            style={[styles.tabBtn, showPurchased === t.k && styles.tabBtnActive]}
            onPress={() => setShowPurchased(t.k)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, showPurchased === t.k && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="heart-outline" size={64} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>{showPurchased ? "NOTHING PURCHASED YET" : "WISH LIST IS EMPTY"}</Text>
              <Text style={styles.emptyText}>Tap + to save links of tools you want to buy.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const meta = PRIORITIES.find((p) => p.key === (item.priority || "normal")) || PRIORITIES[1];
          const isSelected = selected.has(item.id);
          return (
            <SkinPlate
              style={[styles.card, selectMode && isSelected && styles.cardSelected]}
              testID={`wish-card-${item.id}`}
              padX={14}
              padTop={14}
              padBottom={14}
              onPress={selectMode ? () => toggleSelected(item.id) : undefined}
            >
              {/* Top-right manage toolbar: share / edit / delete */}
              <View style={styles.cardTopActions}>
                <TouchableOpacity
                  testID={`wish-share-${item.id}`}
                  style={styles.cardIconBtn}
                  onPress={() => shareSheet(item)}
                  disabled={selectMode}
                  hitSlop={6}
                >
                  <ContactIconImage type="share" size={20} />
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`wish-edit-${item.id}`}
                  style={styles.cardIconBtn}
                  onPress={() => setEditing({ ...item, price: item.price ? String(item.price) : "" })}
                  disabled={selectMode}
                  hitSlop={6}
                >
                  <Ionicons name="create-outline" size={18} color={theme.colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`wish-delete-${item.id}`}
                  style={[styles.cardIconBtn, { borderColor: theme.colors.danger }]}
                  onPress={() => remove(item)}
                  hitSlop={6}
                >
                  <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                </TouchableOpacity>
              </View>
              <View style={styles.cardHead}>
                {selectMode && (
                  <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                    {isSelected && <Ionicons name="checkmark" size={14} color="#000" />}
                  </View>
                )}
                {!!(item.photos && item.photos[0]) && (
                  <Image source={{ uri: item.photos[0] }} style={styles.cardThumb} resizeMode="cover" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {!!item.model_number && (
                    <Text style={styles.modelText} numberOfLines={1}>
                      Model: {item.model_number}
                    </Text>
                  )}
                </View>
                <View style={[styles.priorityPill, { borderColor: meta.color }]}>
                  <Text style={[styles.priorityText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              {!!item.url && (
                <TouchableOpacity
                  testID={`wish-open-${item.id}`}
                  style={styles.urlRow}
                  onPress={() => openLink(item.url)}
                  disabled={selectMode}
                  activeOpacity={0.6}
                  hitSlop={6}
                >
                  <Ionicons name="link" size={12} color={theme.colors.accentSecondary} />
                  <Text style={styles.urlText} numberOfLines={1}>
                    {formatUrlForDisplay(item.url)}
                  </Text>
                </TouchableOpacity>
              )}
              {!!item.description && <Text style={styles.itemDesc}>{item.description}</Text>}
              <View style={styles.metaRow}>
                {!!item.price && (
                  <Text style={styles.priceText}>${item.price.toFixed(2)}</Text>
                )}
                {!!item.dealer_name && (
                  <Text style={styles.dealerText}>{item.dealer_name}</Text>
                )}
              </View>
              {!!item.notes && <Text style={styles.notesText}>{item.notes}</Text>}
              <View style={styles.cardBottomActions}>
                {!item.purchased ? (
                  <>
                    <PillButton
                      testID={`wish-convert-${item.id}`}
                      label="Convert"
                      icon="add-circle-outline"
                      variant="active"
                      compact
                      onPress={() => convert(item)}
                      style={{ flex: 1, justifyContent: "center" }}
                    />
                    <PillButton
                      testID={`wish-bought-${item.id}`}
                      label="Purchased"
                      icon="checkmark-circle"
                      variant="active"
                      compact
                      onPress={() => togglePurchased(item)}
                      style={{ flex: 1, justifyContent: "center" }}
                    />
                  </>
                ) : (
                  <PillButton
                    testID={`wish-restore-${item.id}`}
                    label="Restore to Wishlist"
                    icon="arrow-undo"
                    variant="default"
                    compact
                    onPress={() => togglePurchased(item)}
                    style={{ flex: 1, justifyContent: "center" }}
                  />
                )}
              </View>
              {item.purchased && item.converted_tool_id && (
                <TouchableOpacity
                  testID={`wish-tool-link-${item.id}`}
                  onPress={() => router.push(`/tool/${item.converted_tool_id}`)}
                  style={styles.toolLink}
                >
                  <Ionicons name="construct" size={14} color={theme.colors.accent} />
                  <Text style={styles.toolLinkText}>VIEW TOOL ›</Text>
                </TouchableOpacity>
              )}
            </SkinPlate>
          );
        }}
      />

      {!selectMode ? (
        <TouchableOpacity
          testID="add-wish-fab"
          style={styles.fab}
          onPress={() => setEditing({ name: "", url: "", description: "", price: "", priority: "normal", notes: "", dealer_id: null, model_number: "", photos: [] })}
        >
          <Ionicons name="add" size={32} color="#000" />
        </TouchableOpacity>
      ) : (
        <View style={styles.bulkBar} pointerEvents="box-none">
          <TouchableOpacity
            testID="wish-bulk-email"
            style={[styles.bulkEmailBtn, selected.size === 0 && styles.bulkEmailBtnDisabled]}
            onPress={emailSelected}
            disabled={selected.size === 0}
          >
            <Ionicons name="mail" size={18} color={selected.size === 0 ? theme.colors.textMuted : theme.colors.accent} />
            <Text style={[styles.bulkEmailText, selected.size === 0 && { color: theme.colors.textMuted }]}>
              EMAIL {selected.size > 0 ? `${selected.size} ITEM${selected.size === 1 ? "" : "S"}` : "SELECTED"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBg}
        >
          <ScrollView style={styles.modalCard} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{editing?.id ? "EDIT WISH" : "NEW WISH"}</Text>

            <Text style={styles.label}>NAME *</Text>
            <TextInput
              testID="wish-name"
              placeholder="Snap-On 1/2 Impact"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={editing?.name || ""}
              onChangeText={(v) => setEditing({ ...editing, name: v })}
              autoFocus
            />

            <Text style={styles.label}>WEBSITE LINK</Text>
            <TextInput
              testID="wish-url"
              placeholder="https://..."
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={editing?.url || ""}
              onChangeText={(v) => setEditing({ ...editing, url: v })}
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text style={styles.label}>MODEL NUMBER</Text>
            <TextInput
              testID="wish-model"
              placeholder="e.g. CTEU8810"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={editing?.model_number || ""}
              onChangeText={(v) => setEditing({ ...editing, model_number: v })}
              autoCapitalize="characters"
            />

            <Text style={styles.label}>PHOTO</Text>
            {editing?.photos && editing.photos[0] ? (
              <View style={styles.photoPreviewRow}>
                <Image source={{ uri: editing.photos[0] }} style={styles.photoPreview} resizeMode="cover" />
                <View style={{ flex: 1, gap: 8 }}>
                  <TouchableOpacity
                    testID="wish-photo-replace"
                    style={styles.photoBtn}
                    onPress={choosePhoto}
                  >
                    <Ionicons name="camera" size={16} color={theme.colors.accent} />
                    <Text style={styles.photoBtnText}>REPLACE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="wish-photo-remove"
                    style={[styles.photoBtn, { borderColor: theme.colors.danger }]}
                    onPress={() => setEditing({ ...editing, photos: [] })}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                    <Text style={[styles.photoBtnText, { color: theme.colors.danger }]}>REMOVE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                testID="wish-photo-add"
                style={styles.photoAddBtn}
                onPress={choosePhoto}
              >
                <Ionicons name="camera" size={18} color={theme.colors.accent} />
                <Text style={styles.photoAddBtnText}>ADD PHOTO</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.label}>DESCRIPTION</Text>
            <TextInput
              testID="wish-desc"
              placeholder="Why you want it / specs"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { height: 70, textAlignVertical: "top" }]}
              value={editing?.description || ""}
              onChangeText={(v) => setEditing({ ...editing, description: v })}
              multiline
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>PRICE</Text>
                <TextInput
                  testID="wish-price"
                  placeholder="$0.00"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.input}
                  value={editing?.price || ""}
                  onChangeText={(v) => setEditing({ ...editing, price: v })}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>PRIORITY</Text>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {PRIORITIES.map((p) => (
                    <TouchableOpacity
                      key={p.key}
                      testID={`wish-prio-${p.key}`}
                      style={[
                        styles.prioChip,
                        editing?.priority === p.key && { backgroundColor: p.color, borderColor: p.color },
                      ]}
                      onPress={() => setEditing({ ...editing, priority: p.key })}
                    >
                      <Text
                        style={[
                          styles.prioChipText,
                          editing?.priority === p.key && { color: "#000" },
                        ]}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={styles.label}>DEALER</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <TouchableOpacity
                style={[styles.dealerChip, !editing?.dealer_id && styles.dealerChipActive]}
                onPress={() => setEditing({ ...editing, dealer_id: null })}
              >
                <Text style={[styles.dealerChipText, !editing?.dealer_id && styles.dealerChipTextActive]}>NONE</Text>
              </TouchableOpacity>
              {dealers.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.dealerChip,
                    editing?.dealer_id === d.id && styles.dealerChipActive,
                  ]}
                  onPress={() => setEditing({ ...editing, dealer_id: d.id })}
                >
                  <Text
                    style={[
                      styles.dealerChipText,
                      editing?.dealer_id === d.id && styles.dealerChipTextActive,
                    ]}
                  >
                    {d.name?.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>NOTES</Text>
            <TextInput
              testID="wish-notes"
              placeholder="Any notes"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { height: 70, textAlignVertical: "top" }]}
              value={editing?.notes || ""}
              onChangeText={(v) => setEditing({ ...editing, notes: v })}
              multiline
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setEditing(null)}>
                <Text style={styles.btnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="wish-save-btn" style={styles.btn} onPress={save}>
                <Text style={styles.btnText}>{editing?.id ? "SAVE" : "ADD"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
    </View>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, borderBottomColor: c.border, borderBottomWidth: 1 },
  wishActionsRow: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, gap: 8 },
  title: { color: c.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 2 },
  subtitle: { color: c.accent, fontSize: 7, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 },
  statPlate: { marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  statRowInner: { flexDirection: "row", gap: 4 },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  statValue: { color: c.textPrimary, fontSize: 14, fontWeight: "900" },
  statLabel: { color: c.textMuted, fontSize: 7, fontWeight: "800", letterSpacing: 1, marginTop: 4 },
  toggleRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "rgba(12,12,12,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: theme.radii.pill,
  },
  tabBtnActive: { borderColor: c.accent, borderWidth: 2 },
  tabText: { color: c.textSecondary, fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  tabTextActive: { color: c.accent },
  empty: { alignItems: "center", marginTop: 60, paddingHorizontal: 40 },
  emptyTitle: { color: c.textPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 2, marginTop: 16 },
  emptyText: { color: c.textSecondary, fontSize: 10, textAlign: "center", marginTop: 8 },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardThumb: {
    width: 48, height: 48, borderRadius: 6,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1, borderColor: c.border,
  },
  itemName: { flex: 1, color: c.textPrimary, fontSize: 12, fontWeight: "700" },
  // Model number shown under the wish name on the card.
  modelText: {
    color: c.textMuted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  priorityPill: { paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderRadius: 3 },
  priorityText: { fontSize: 7, fontWeight: "800", letterSpacing: 1 },
  // Clickable URL row right under the item name — replaces the old "OPEN LINK"
  // button in the actions row so the actions row is less cluttered.
  urlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    paddingVertical: 2,
  },
  urlText: {
    flex: 1,
    color: c.accentSecondary,
    fontSize: 10,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  itemDesc: { color: c.textSecondary, fontSize: 10, marginTop: 6 },
  metaRow: { flexDirection: "row", gap: 14, marginTop: 8 },
  priceText: { color: c.accent, fontSize: 10, fontWeight: "800" },
  dealerText: { color: c.textMuted, fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },
  notesText: { color: c.textMuted, fontSize: 8, fontStyle: "italic", marginTop: 6 },
  actions: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 10 },
  cardTopActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 4 },
  cardIconBtn: {
    width: 34, height: 34, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: c.border, borderRadius: 8, backgroundColor: c.bg,
  },
  cardBottomActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  linkBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1,
    borderColor: c.accentSecondary, borderRadius: theme.radii.sm,
  },
  linkText: { color: c.accentSecondary, fontWeight: "800", fontSize: 8, letterSpacing: 1 },
  iconBtn: {
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: c.border, borderRadius: theme.radii.sm,
  },
  toolLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  toolLinkText: { color: c.accent, fontSize: 7, fontWeight: "800", letterSpacing: 1 },
  fab: {
    position: "absolute",
    bottom: 24, right: 24,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: c.accent,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 14,
  },
  // Select mode UI ---------------------------------------------------
  cardSelected: {
    borderColor: c.accent,
    borderWidth: 2,
    backgroundColor: c.bg,
  },
  checkbox: {
    width: 22, height: 22,
    borderRadius: 6,
    borderWidth: 2,
    // Use the accent color at low opacity so the empty checkbox stays clearly
    // visible in dark mode (the prior c.border was nearly invisible against
    // the dark card surface).
    borderColor: c.accent,
    backgroundColor: c.surfaceAlt,
    alignItems: "center", justifyContent: "center",
    marginRight: 4,
  },
  checkboxOn: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  topBarBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: theme.radii.sm,
    borderWidth: 1, borderColor: c.accent,
    backgroundColor: c.bgSecondary,
    minWidth: 44, alignItems: "center", justifyContent: "center",
  },
  topBarBtnText: {
    color: c.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1.5,
  },
  bulkBar: {
    position: "absolute",
    bottom: 16, left: 16, right: 16,
  },
  bulkEmailBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    backgroundColor: c.accent,
    borderRadius: theme.radii.md,
    ...(theme.elevation.accent as object),
  },
  bulkEmailBtnDisabled: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1, borderColor: c.border,
  },
  bulkEmailText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 11,
  },
  // Photo picker UI shown inside the wish edit modal.
  photoPreviewRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginTop: 4,
  },
  photoPreview: {
    width: 80, height: 80,
    borderRadius: 8,
    borderWidth: 1, borderColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  photoBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: c.accent,
    borderRadius: theme.radii.sm,
    backgroundColor: c.bgSecondary,
  },
  photoBtnText: {
    color: c.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1,
  },
  photoAddBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1, borderStyle: "dashed", borderColor: c.accent,
    borderRadius: theme.radii.md,
    backgroundColor: c.surfaceAlt,
    marginTop: 4,
  },
  photoAddBtnText: {
    color: c.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.5,
  },
  modalBg: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: c.bgSecondary,
    padding: 20,
    borderTopWidth: 2,
    borderTopColor: c.accent,
    maxHeight: "90%",
  },
  modalTitle: { color: c.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 2, marginBottom: 12 },
  label: { color: c.textMuted, fontSize: 7, fontWeight: "800", letterSpacing: 1.5, marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1, borderColor: c.border,
    color: c.textPrimary, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: theme.radii.sm, fontSize: 10,
  
    ...(theme.elevation.input as object),
  },
  prioChip: {
    flex: 1, paddingHorizontal: 6, paddingVertical: 10,
    borderWidth: 1, borderColor: c.border,
    borderRadius: theme.radii.sm, alignItems: "center",
  },
  prioChipText: { color: c.textSecondary, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  dealerChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: c.border,
    borderRadius: theme.radii.sm,
  },
  dealerChipActive: { backgroundColor: "transparent", borderColor: c.accent, borderWidth: 2 },
  dealerChipText: { color: c.textSecondary, fontSize: 7, fontWeight: "800", letterSpacing: 1 },
  dealerChipTextActive: { color: c.accent },
  btn: {
    flex: 1, height: 48, alignItems: "center", justifyContent: "center",
    backgroundColor: c.accent, borderRadius: theme.radii.md,
    ...(theme.elevation.accent as object),
  },
  btnText: { color: "#000", fontWeight: "800", letterSpacing: 2, fontSize: 10 },
  btnGhost: {
    flex: 1, height: 48, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: c.border, borderRadius: theme.radii.md,
  },
  btnGhostText: { color: c.textPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 10 },
}));
