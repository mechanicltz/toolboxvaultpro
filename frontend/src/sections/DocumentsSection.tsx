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
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { theme } from "../theme";
import { api } from "../api";
import { confirm } from "../confirm";

import { themedStyles } from "../themeContext";

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

type PageMeta = { pageNum: number; w: number; h: number };

/**
 * Web-only PDF viewer.
 *
 * Loads pdf.js from a CDN at runtime (via `new Function('u','return import(u)')`
 * so Metro can't statically analyze + break it on `import.meta`) and uses a
 * VIRTUALIZED FlatList to render pages on-demand.  This keeps memory usage
 * bounded — only the small window of pages currently in / near the viewport
 * is rasterized at any time, even for 100+ page documents.
 *
 * Each page is rendered to JPEG (quality 0.7) instead of PNG to keep each
 * page's data URL small (typically ~50–150 KB vs ~500 KB–2 MB for PNG).
 */
function PdfCanvasViewer({ doc }: { doc: any }) {
  const [meta, setMeta] = useState<PageMeta[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState("Loading PDF...");
  const [error, setError] = useState("");
  const pdfRef = useRef<any>(null);
  // Serialize page rendering through a single chain to avoid clobbering the
  // shared canvas context / overwhelming the worker on rapid scrolls.
  const renderQueueRef = useRef<Promise<any>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setLoading(true);
    setError("");
    setLoadMsg("Loading PDF...");
    pdfRef.current = null;

    (async () => {
      try {
        const PDFJS_VERSION = "4.10.38";
        const dynImport = new Function("u", "return import(u)");
        const pdfjsLib: any = await dynImport(
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`,
        );
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

        if (cancelled) return;
        setLoadMsg("Parsing document...");
        const bytes = base64ToBytes(doc.data);
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        pdfRef.current = pdf;

        setLoadMsg(`Indexing ${pdf.numPages} pages...`);
        // Fetch every page's viewport (cheap — just metadata, no rasterization)
        const m: PageMeta[] = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          if (cancelled) return;
          const page = await pdf.getPage(p);
          const vp = page.getViewport({ scale: 1 });
          m.push({ pageNum: p, w: vp.width, h: vp.height });
        }
        if (cancelled) return;
        setMeta(m);
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        console.error("PDF load error:", e);
        setError(e?.message || "Failed to load PDF");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      // Best-effort cleanup of pdf.js document
      try {
        pdfRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  // Schedule a single page render against the shared queue.
  const enqueueRender = (pageNum: number, scale: number): Promise<string | null> => {
    const next = renderQueueRef.current.then(async () => {
      const pdf = pdfRef.current;
      if (!pdf) return null;
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const w: any = (globalThis as any).window;
        const canvas = w.document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        // JPEG keeps each page small (≈50–150 KB) vs PNG (≈500 KB–2 MB)
        const url = canvas.toDataURL("image/jpeg", 0.7);
        // Clear canvas to free memory ASAP
        canvas.width = 0;
        canvas.height = 0;
        return url;
      } catch (e) {
        console.warn(`Page ${pageNum} render failed:`, e);
        return null;
      }
    });
    renderQueueRef.current = next.catch(() => undefined);
    return next;
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a1a" }}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
        <Text style={{ color: "#ccc", marginTop: 14, fontSize: 10 }}>{loadMsg}</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ flex: 1, padding: 32, alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a1a" }}>
        <Ionicons name="alert-circle" size={42} color={theme.colors.danger} />
        <Text
          style={{
            color: "#E94E3F",
            marginTop: 12,
            fontSize: 10,
            fontFamily: Platform.OS === "web" ? "monospace" : undefined,
            textAlign: "center",
          }}
        >
          {`Error: ${error}`}
        </Text>
      </View>
    );
  }
  if (!meta) return null;

  return (
    <FlatList
      data={meta}
      keyExtractor={(item) => `p${item.pageNum}`}
      style={{ flex: 1, backgroundColor: "#1a1a1a" }}
      contentContainerStyle={{ paddingVertical: 12, alignItems: "center" }}
      // Virtualization knobs — keep rendered window small for big PDFs
      initialNumToRender={3}
      maxToRenderPerBatch={2}
      windowSize={5}
      // NOTE: removeClippedSubviews disabled because it doesn't behave on
      // react-native-web for tall content — would leave blank gaps.
      removeClippedSubviews={false}
      renderItem={({ item }) => (
        <PdfPageItem meta={item} requestRender={enqueueRender} />
      )}
      ListFooterComponent={
        <Text
          style={{
            color: "#999",
            fontSize: 8,
            letterSpacing: 1,
            marginVertical: 16,
            textAlign: "center",
          }}
        >
          {`${meta.length} PAGE${meta.length > 1 ? "S" : ""}`}
        </Text>
      }
    />
  );
}

/**
 * Single PDF page in the FlatList. Renders itself lazily on mount
 * (FlatList only mounts items near the viewport, so this is naturally
 *  windowed) and clears its data URL on unmount so memory stays bounded.
 */
function PdfPageItem({
  meta,
  requestRender,
}: {
  meta: PageMeta;
  requestRender: (pageNum: number, scale: number) => Promise<string | null>;
}) {
  const [src, setSrc] = useState<string>("");
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setFailed(false);
    setSrc("");

    // Pick a render scale based on screen DPR but capped to keep mem in check
    const w: any = (globalThis as any).window;
    const dpr = Math.min(2, w?.devicePixelRatio || 1);
    const scale = 1.4 * dpr;

    requestRender(meta.pageNum, scale)
      .then((url) => {
        if (cancelled) return;
        if (url) {
          setSrc(url);
        } else {
          setFailed(true);
        }
        setBusy(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setBusy(false);
      });

    return () => {
      cancelled = true;
      // Memory hint: drop the data URL so GC can reclaim the JPEG bytes
      // when this page scrolls out of FlatList's window
      setSrc("");
    };
  }, [meta.pageNum, requestRender]);

  // Compute concrete pixel dimensions so the row height is stable in
  // FlatList's virtualization layout (aspectRatio alone collapses inside
  // FlatList on web in some cases).
  const w: any = (globalThis as any).window;
  const screenW = Math.max(320, Math.min(w?.innerWidth || 800, 1100));
  const targetW = Math.min(900, Math.floor(screenW * 0.94));
  const ratio = meta.h > 0 ? meta.h / meta.w : 1.3;
  const targetH = Math.floor(targetW * ratio);

  return (
    <View
      style={{
        width: targetW,
        height: targetH,
        backgroundColor: "#fff",
        marginVertical: 8,
        borderRadius: 4,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        ...Platform.select({
          web: {
            // @ts-ignore web-only style
            boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
          },
          default: {},
        }),
      }}
    >
      {src ? (
        <Image
          source={{ uri: src }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="contain"
        />
      ) : (
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          {busy && <ActivityIndicator color="#888" size="small" />}
          {failed && (
            <Text style={{ color: "#888", fontSize: 9, marginTop: 6 }}>
              {`Page ${meta.pageNum} failed to render`}
            </Text>
          )}
          {!failed && (
            <Text style={{ color: "#bbb", fontSize: 8, marginTop: 8, letterSpacing: 1 }}>
              {`PAGE ${meta.pageNum}`}
            </Text>
          )}
        </View>
      )}
    </View>
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
      const blob = new Blob([bytes as BlobPart], {
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
          const blob = new Blob([bytes as BlobPart], { type: mime });
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
            <ActivityIndicator color={theme.colors.accent} size="small" />
          ) : (
            <>
              <Ionicons name="add-circle" size={12} color={theme.colors.accent} />
              <Text style={styles.addBtnText}>ADD DOCUMENT</Text>
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

const vstyles = themedStyles((c) => ({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  title: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "700",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionText: { color: "#000", fontWeight: "900", fontSize: 8, letterSpacing: 1 },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: c.bgSecondary,
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
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  errorMsg: {
    color: c.textMuted,
    fontSize: 10,
    textAlign: "center",
    lineHeight: 14,
  },
}));

const styles = themedStyles((c) => ({
  section: { marginTop: 18 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionLabel: {
    color: c.textPrimary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
  },
  // Outline orange ADD button — matches user IMG_6430.png reference
  // (2026-05-27): borderColor accent, transparent fill, orange + icon
  // + uppercase orange text.
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: "transparent",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  addBtnText: {
    color: c.accent,
    fontWeight: "900",
    fontSize: 8,
    letterSpacing: 1.5,
  },
  empty: {
    color: c.textMuted,
    fontSize: 10,
    fontStyle: "italic",
    paddingVertical: 4,
    lineHeight: 14,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 4,
    marginBottom: 6,
    gap: 6,
  
    ...(theme.elevation.md as object),
  },
  docName: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "700",
  },
  docMeta: {
    color: c.textMuted,
    fontSize: 8,
    marginTop: 2,
  },
}));
