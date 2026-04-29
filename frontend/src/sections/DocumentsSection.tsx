import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { theme } from "../theme";
import { api } from "../api";
import { confirm } from "../confirm";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function iconForMime(mime: string): { name: any; color: string } {
  const m = (mime || "").toLowerCase();
  if (m.includes("pdf")) return { name: "document-text", color: "#E94E3F" };
  if (m.startsWith("image/")) return { name: "image", color: "#27AE60" };
  if (m.includes("word") || m.includes("officedoc")) return { name: "document", color: "#2B6CB0" };
  if (m.includes("sheet") || m.includes("excel")) return { name: "grid", color: "#27AE60" };
  return { name: "document-attach", color: theme.colors.accent };
}

function prettySize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function DocumentsSection({
  tool,
  onChange,
}: {
  tool: any;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const docs: any[] = tool?.documents || [];

  const pickAndUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      if (!asset) return;
      if (asset.size && asset.size > MAX_BYTES) {
        Alert.alert("Too Large", "File must be under 5 MB.");
        return;
      }
      setBusy(true);
      let base64: string;
      if (Platform.OS === "web") {
        // On web, asset.uri is a blob: URL — fetch + read as data URL
        const blob = await (await fetch(asset.uri)).blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const r = reader.result as string;
            resolve(r.split(",")[1] || r);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      await api.addDocument(tool.id, {
        name: asset.name,
        data: base64,
        mime_type: asset.mimeType || "application/octet-stream",
        size: asset.size || 0,
      });
      onChange();
    } catch (e: any) {
      Alert.alert("Upload Failed", e.message || "Could not upload document");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (doc: any) => {
    const ok = await confirm(
      "Delete Document",
      `Remove "${doc.name}"?`,
      "Delete",
      true,
    );
    if (!ok) return;
    try {
      await api.deleteDocument(tool.id, doc.id);
      onChange();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const openDoc = async (doc: any) => {
    try {
      if (Platform.OS === "web") {
        // Modern browsers block opening large data: URIs in new tabs.
        // Convert to a Blob URL and open that — the standard pattern.
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w: any = (globalThis as any).window;
          const byteChars = w.atob(doc.data);
          const byteNumbers = new Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteNumbers[i] = byteChars.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: doc.mime_type || "application/octet-stream" });
          const url = w.URL.createObjectURL(blob);

          // Try to open in a new tab. If the browser blocks the popup,
          // fall back to triggering a download.
          const newWin = w.open(url, "_blank");
          if (!newWin || newWin.closed || typeof newWin.closed === "undefined") {
            // Popup blocked — trigger a download instead
            const a = w.document.createElement("a");
            a.href = url;
            a.download = doc.name || "document";
            w.document.body.appendChild(a);
            a.click();
            w.document.body.removeChild(a);
          }
          // Revoke after a delay so the new tab/download can finish loading
          setTimeout(() => w.URL.revokeObjectURL(url), 60_000);
        } catch (err) {
          Alert.alert("Error", "Could not open document. Please try downloading it again.");
        }
        return;
      }
      // Native — write to cache and share
      const safeName = (doc.name || "document").replace(/[^a-zA-Z0-9._-]/g, "_");
      const dest = `${FileSystem.cacheDirectory}${safeName}`;
      await FileSystem.writeAsStringAsync(dest, doc.data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const can = await Sharing.isAvailableAsync();
      if (can) {
        await Sharing.shareAsync(dest, {
          mimeType: doc.mime_type,
          UTI: doc.mime_type,
        });
      } else {
        Alert.alert("Unavailable", "Sharing is not available on this device.");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not open document");
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>
          DOCUMENTS{docs.length > 0 ? ` (${docs.length})` : ""}
        </Text>
        <TouchableOpacity
          testID="add-document-btn"
          style={styles.addBtn}
          onPress={pickAndUpload}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <>
              <Ionicons name="cloud-upload" size={14} color="#000" />
              <Text style={styles.addBtnText}>UPLOAD</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      {docs.length === 0 ? (
        <Text style={styles.empty}>
          No documents yet. Upload manuals, receipts, or warranty papers.
        </Text>
      ) : (
        docs.map((d: any) => {
          const ic = iconForMime(d.mime_type);
          return (
            <View key={d.id} style={styles.docRow}>
              <TouchableOpacity
                testID={`doc-open-${d.id}`}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
                onPress={() => openDoc(d)}
              >
                <Ionicons name={ic.name} size={26} color={ic.color} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.docName} numberOfLines={1}>
                    {d.name}
                  </Text>
                  <Text style={styles.docMeta}>
                    {(d.mime_type || "file").split("/").pop()}  ·  {prettySize(d.size || 0)}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                testID={`doc-delete-${d.id}`}
                onPress={() => remove(d)}
                hitSlop={10}
                style={{ padding: 8 }}
              >
                <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionLabel: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 4,
  },
  addBtnText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1.5,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontStyle: "italic",
    paddingVertical: 8,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
    marginBottom: 6,
    gap: 6,
  },
  docName: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  docMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
});
