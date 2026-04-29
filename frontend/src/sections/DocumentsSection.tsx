import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  Image,
  ScrollView,
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

function base64ToBytes(b64: string): Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = (globalThis as any).window;
  const binary = w.atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type RenderedPage = { src: string; w: number; h: number };

/**
 * Web-only PDF viewer.
 *
 * Renders each PDF page off-screen via pdf.js into a temporary <canvas>,
 * captures the result as a data URL, and then displays them as <Image>
 * components inside a ScrollView.  This avoids:
 *   - iframe + blob URL (blocked by parent CSP / sandbox)
 *   - imperative DOM mutation inside React's tree (caused removeChild crashes)
 *   - import.meta in Metro (bypassed via runtime dynamic import from CDN)
 */
function PdfCanvasViewer({ doc }: { doc: any }) {
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    setPages([]);
    setLoading(true);
    setError("");
    setProgress({ done: 0, total: 0 });

    (async () => {
      try {
        // Load pdf.js from CDN at runtime via `new Function` to evade Metro's
        // static analysis (which otherwise breaks `import.meta` inside pdfjs-dist).
        const PDFJS_VERSION = "4.10.38";
        const dynImport = new Function("u", "return import(u)");
        const pdfjsLib: any = await dynImport(
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`,
        );
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

        const bytes = base64ToBytes(doc.data);
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        setProgress({ done: 0, total: pdf.numPages });

        const w: any = (globalThis as any).window;
        const dpr = Math.min(2, w.devicePixelRatio || 1);
        const renderScale = 1.6 * dpr; // good readability on most screens

        const out: RenderedPage[] = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          if (cancelled) return;
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: renderScale });
          const offscreen = w.document.createElement("canvas");
          offscreen.width = Math.floor(viewport.width);
          offscreen.height = Math.floor(viewport.height);
          const ctx = offscreen.getContext("2d");
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          const src = offscreen.toDataURL("image/png");
          out.push({ src, w: offscreen.width, h: offscreen.height });
          setProgress({ done: p, total: pdf.numPages });
        }
        if (cancelled) return;
        // Single state update at the end avoids rapid React re-render churn.
        setPages(out);
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        console.error("PDF render error:", e);
        setError(e?.message || "Failed to render PDF");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#1a1a1a" }}
      contentContainerStyle={{ paddingVertical: 12, alignItems: "center" }}
    >
      {loading && (
        <View style={{ padding: 24, alignItems: "center" }}>
          <ActivityIndicator color={theme.colors.accent} size="large" />
          <Text style={{ color: "#ccc", marginTop: 12, fontSize: 13 }}>
            {progress.total > 0
              ? `Rendering page ${progress.done} / ${progress.total}...`
              : "Loading PDF..."}
          </Text>
        </View>
      )}
      {!!error && (
        <View style={{ padding: 32, alignItems: "center" }}>
          <Ionicons name="alert-circle" size={42} color={theme.colors.danger} />
          <Text
            style={{
              color: "#E94E3F",
              marginTop: 12,
              fontSize: 13,
              fontFamily: Platform.OS === "web" ? "monospace" : undefined,
              textAlign: "center",
            }}
          >
            {`Error: ${error}`}
          </Text>
        </View>
      )}
      {pages.map((pg, idx) => (
        <View
          key={`p${idx}`}
          style={{
            width: "95%",
            maxWidth: 900,
            aspectRatio: pg.h > 0 ? pg.w / pg.h : 0.77,
            backgroundColor: "#fff",
            marginVertical: 8,
            borderRadius: 4,
            overflow: "hidden",
            ...Platform.select({
              web: {
                // @ts-expect-error web-only style
                boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
              },
              default: {},
            }),
          }}
        >
          <Image
            source={{ uri: pg.src }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        </View>
      ))}
      {!loading && !error && pages.length > 0 && (
        <Text
          style={{
            color: "#999",
            fontSize: 11,
            letterSpacing: 1,
            marginVertical: 16,
          }}
        >
          {`${pages.length} PAGE${pages.length > 1 ? "S" : ""}`}
        </Text>
      )}
    </ScrollView>
  );
}

export function DocumentsSection({
  tool,
  onChange,
}: {
  tool: any;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<any>(null);
  const [imageUri, setImageUri] = useState<string>("");
  const [nativeError, setNativeError] = useState<string>("");
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
    const ok = await confirm("Delete Document", `Remove "${doc.name}"?`, "Delete", true);
    if (!ok) return;
    try {
      await api.deleteDocument(tool.id, doc.id);
      onChange();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  /** Web: trigger a real download via an anchor click */
  const downloadDocWeb = (doc: any) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w: any = (globalThis as any).window;
      const bytes = base64ToBytes(doc.data);
      const blob = new Blob([bytes], {
        type: doc.mime_type || "application/octet-stream",
      });
      const url = w.URL.createObjectURL(blob);
      const a = w.document.createElement("a");
      a.href = url;
      a.download = doc.name || "document";
      w.document.body.appendChild(a);
      a.click();
      w.document.body.removeChild(a);
      setTimeout(() => w.URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Download failed");
    }
  };

  const closeViewer = () => {
    if (imageUri) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w: any = (globalThis as any).window;
        w.URL.revokeObjectURL(imageUri);
      } catch {
        /* ignore */
      }
    }
    setImageUri("");
    setViewerDoc(null);
  };

  const openDoc = async (doc: any) => {
    setNativeError("");
    try {
      if (Platform.OS === "web") {
        const mime = (doc.mime_type || "").toLowerCase();
        if (mime.startsWith("image/")) {
          // Image: build blob URL for <Image>
          const bytes = base64ToBytes(doc.data);
          const blob = new Blob([bytes], { type: mime });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w: any = (globalThis as any).window;
          setImageUri(w.URL.createObjectURL(blob));
          setViewerDoc(doc);
          return;
        }
        if (mime.includes("pdf")) {
          // PDF: render via pdf.js canvas (handled by PdfCanvasViewer)
          setViewerDoc(doc);
          return;
        }
        // Other formats (Word, Excel, etc): download directly
        downloadDocWeb(doc);
        return;
      }

      // ====== NATIVE (iOS / Android) ======
      const safeName = (doc.name || "document").replace(/[^a-zA-Z0-9._-]/g, "_");
      const cacheDir = (FileSystem as any).cacheDirectory;
      if (!cacheDir) {
        setNativeError("Cache directory unavailable on this device.");
        setViewerDoc(doc);
        return;
      }
      const dest = `${cacheDir}${safeName}`;
      try {
        await FileSystem.writeAsStringAsync(dest, doc.data, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (writeErr: any) {
        setNativeError(`Could not write file: ${writeErr?.message || writeErr}`);
        setViewerDoc(doc);
        return;
      }

      const can = await Sharing.isAvailableAsync();
      if (!can) {
        setNativeError(
          "Sharing/preview is not available on this device. The document was saved to app cache.",
        );
        setViewerDoc(doc);
        return;
      }

      try {
        await Sharing.shareAsync(dest, {
          mimeType: doc.mime_type,
          UTI:
            (doc.mime_type || "").toLowerCase().includes("pdf")
              ? "com.adobe.pdf"
              : doc.mime_type,
          dialogTitle: doc.name || "Document",
        });
      } catch (shareErr: any) {
        setNativeError(`Open failed: ${shareErr?.message || shareErr}`);
        setViewerDoc(doc);
      }
    } catch (e: any) {
      setNativeError(e?.message || "Could not open document");
      setViewerDoc(doc);
    }
  };

  const renderViewerBody = () => {
    if (!viewerDoc) return null;
    const mime = (viewerDoc.mime_type || "").toLowerCase();

    // Native error fallback panel
    if (Platform.OS !== "web" && nativeError) {
      return (
        <ScrollView contentContainerStyle={vstyles.errorWrap}>
          <Ionicons name="alert-circle" size={48} color={theme.colors.danger} />
          <Text style={vstyles.errorTitle}>Cannot preview here</Text>
          <Text style={vstyles.errorMsg}>{nativeError}</Text>
          <TouchableOpacity
            style={[vstyles.actionBtn, { marginTop: 18 }]}
            onPress={() => openDoc(viewerDoc)}
          >
            <Ionicons name="refresh" size={16} color="#000" />
            <Text style={vstyles.actionText}>RETRY</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    if (Platform.OS !== "web") {
      // On native, opening the share sheet replaces this modal in practice.
      // If we get here, show a placeholder.
      return (
        <View style={vstyles.errorWrap}>
          <ActivityIndicator color={theme.colors.accent} size="large" />
          <Text style={vstyles.errorMsg}>Opening...</Text>
        </View>
      );
    }

    // ===== WEB =====
    if (mime.startsWith("image/")) {
      return (
        <Image
          source={{ uri: imageUri }}
          style={{ flex: 1, width: "100%", height: "100%" }}
          resizeMode="contain"
        />
      );
    }
    if (mime.includes("pdf")) {
      return <PdfCanvasViewer doc={viewerDoc} />;
    }
    return (
      <View style={vstyles.errorWrap}>
        <Ionicons name="document" size={48} color={theme.colors.textMuted} />
        <Text style={vstyles.errorMsg}>
          Preview not supported for this file type. Please download to view.
        </Text>
      </View>
    );
  };

  // Only show modal on web, OR on native when there's a nativeError to display
  const showModal = !!viewerDoc && (Platform.OS === "web" || !!nativeError);

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
              {Platform.OS === "web" && (
                <TouchableOpacity
                  testID={`doc-download-${d.id}`}
                  onPress={() => downloadDocWeb(d)}
                  hitSlop={10}
                  style={{ padding: 8 }}
                >
                  <Ionicons name="download-outline" size={18} color={theme.colors.accent} />
                </TouchableOpacity>
              )}
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

      {/* Inline document viewer modal (web preview, plus native error fallback) */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={closeViewer}
      >
        <View style={vstyles.overlay}>
          <View style={vstyles.bar}>
            <Ionicons name="document-text" size={18} color={theme.colors.accent} />
            <Text style={vstyles.title} numberOfLines={1}>
              {viewerDoc?.name || "Document"}
            </Text>
            {Platform.OS === "web" && viewerDoc && (
              <TouchableOpacity
                onPress={() => downloadDocWeb(viewerDoc)}
                style={vstyles.actionBtn}
                testID="doc-download-btn"
              >
                <Ionicons name="download" size={16} color="#000" />
                <Text style={vstyles.actionText}>DOWNLOAD</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={closeViewer}
              style={vstyles.closeBtn}
              testID="doc-viewer-close"
            >
              <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={vstyles.frameWrap}>{renderViewerBody()}</View>
        </View>
      </Modal>
    </View>
  );
}

const vstyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionText: { color: "#000", fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: theme.colors.bgSecondary,
  },
  frameWrap: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    alignItems: "stretch",
    justifyContent: "flex-start",
  },
  errorWrap: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  errorTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 8,
  },
  errorMsg: {
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
});

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
