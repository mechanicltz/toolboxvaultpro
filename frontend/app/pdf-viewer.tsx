/**
 * In-App PDF Preview Screen
 * --------------------------
 * Users expect to SEE the report before being asked what to do with it. The
 * previous behavior fired the iOS share sheet the instant a PDF was rendered,
 * so the user never got to verify the content first. This screen embeds the
 * generated PDF in a WebView and exposes a single SHARE button in the header.
 *
 * Routed to via `router.push({ pathname: "/pdf-viewer", params: { ... } })`
 * with these params:
 *   uri      — file:// URI of the rendered PDF (required)
 *   title    — optional title shown in the nav bar (default "Report")
 *   mime     — defaults to "application/pdf"
 *   subject  — optional, used for email sharing
 *   body     — optional, used for email sharing
 *
 * Works on iOS, Android, and Web. Web falls back to <iframe>.
 */
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import * as Sharing from "expo-sharing";
import { theme } from "../src/theme";
import { themedStyles, useSkin, useColors, useThemeMode } from "../src/themeContext";
import { TBV } from "../src/tbv/skins";

export default function PdfViewerScreen(): React.ReactElement {
  const router = useRouter();
  useSkin(); // subscribe so the SKIN proxy re-resolves on theme/variant change
  const c = useColors();
  const { mode } = useThemeMode();
  const isLight = mode === "light";
  const params = useLocalSearchParams<{
    uri?: string;
    title?: string;
    mime?: string;
    subject?: string;
    body?: string;
  }>();

  const uri = String(params.uri || "");
  const title = String(params.title || "Report");
  const mime = String(params.mime || "application/pdf");

  const isPdf = useMemo(() => mime.includes("pdf"), [mime]);

  // Callers sometimes pass a raw download filename (e.g.
  // "New_test_item-1782357005.pdf"). Show a clean, human title instead.
  const prettyTitle = useMemo(() => {
    let t = title.replace(/\.(pdf|csv|xlsx?)$/i, "");
    t = t.replace(/[-_]\d{8,}.*$/, "");
    t = t.replace(/[_]+/g, " ").trim();
    return t || "Report";
  }, [title]);

  const onShare = async () => {
    if (!uri) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) return;
      await Sharing.shareAsync(uri, {
        mimeType: mime,
        dialogTitle: prettyTitle,
        UTI: isPdf ? "com.adobe.pdf" : undefined,
      });
    } catch {
      /* user dismissed sheet — non-fatal */
    }
  };

  // Robust back: previously the system's default header back button worked
  // the FIRST time a PDF was viewed but broke on subsequent previews. The
  // root cause is that every report tap calls `router.push("/pdf-viewer",
  // ...)` (see /app/frontend/src/reportRunner.ts), which STACKS a fresh
  // PDF screen on top of the previous one. On 2nd+ taps you have
  // [reports → pdfA → pdfB] and the default back arrow can pop pdfB into
  // pdfA (still rendered behind) — making it look like nothing happens.
  //
  // Fix: provide an explicit headerLeft that calls `router.back()`. If
  // the previous route is ALSO a /pdf-viewer (which happens after
  // multiple previews), keep popping until we land back on something
  // else. This guarantees the X always returns to the reports tab.
  const handleBack = React.useCallback(() => {
    // Pop exactly ONE screen so we return to wherever the PDF was opened from
    // (claim detail, reports list, etc.) — NOT all the way to a main tab.
    // Only fall back to the reports tab when there's genuinely nothing to pop
    // (e.g. the viewer was opened via a cold deep-link).
    try {
      if ((router as any).canGoBack?.()) {
        router.back();
      } else {
        router.replace("/(tabs)/reports");
      }
    } catch {
      try {
        router.replace("/(tabs)/reports");
      } catch {
        /* swallow */
      }
    }
  }, [router]);

  return (
    <SafeAreaView style={[styles.container, isLight && styles.containerLight]} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom themed header — replaces the native nav bar so the back/share
          buttons + bar colour follow the active theme (no out-of-theme iOS
          glass-button ovals). */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          testID="pdf-back-btn"
          onPress={handleBack}
          style={styles.headerBtn}
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={c.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{prettyTitle}</Text>
        <TouchableOpacity
          testID="pdf-share-btn"
          onPress={onShare}
          style={styles.headerBtn}
          accessibilityLabel="Share"
        >
          <Ionicons name="share-outline" size={22} color={c.accent} />
        </TouchableOpacity>
      </View>

      <View style={[styles.bgArea, isLight && styles.bgAreaLight]}>
        {!uri ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>No file to preview.</Text>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backBtnText}>GO BACK</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.pdfArea}>
            {/* Clean white "page" floating on a soft backdrop with a subtle
                drop shadow — a modern document-viewer look (no clunky bezel). */}
            <View style={styles.pdfShadow}>
              <View style={styles.pdfCard}>
                {Platform.OS === "web" ? (
                  // @ts-ignore — iframe is fine in RN-Web context
                  <iframe
                    src={uri}
                    style={{
                      border: 0,
                      flex: 1,
                      width: "100%",
                      height: "100%",
                      backgroundColor: "#ffffff",
                    }}
                    title={prettyTitle}
                  />
                ) : (
                  <WebView
                    testID="pdf-webview"
                    source={{ uri }}
                    style={{ flex: 1, backgroundColor: "#ffffff" }}
                    originWhitelist={["*"]}
                    allowFileAccess
                    allowFileAccessFromFileURLs
                    allowUniversalAccessFromFileURLs
                    startInLoadingState
                    renderLoading={() => (
                      <View style={styles.loader}>
                        <ActivityIndicator size="large" color={theme.colors.accent} />
                        <Text style={styles.loaderText}>Loading {prettyTitle}…</Text>
                      </View>
                    )}
                  />
                )}
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Persistent SHARE button at the bottom as a backup affordance for
          users who don't notice the header icon. */}
      <View style={styles.footer}>
        <TouchableOpacity
          testID="pdf-share-footer"
          style={styles.shareBtn}
          onPress={onShare}
          activeOpacity={0.85}
        >
          <Ionicons name="share-outline" size={20} color="#000" />
          <Text style={styles.shareBtnText}>SHARE / SAVE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: {
    flex: 1,
    backgroundColor: TBV.ink,
  },
  containerLight: {
    backgroundColor: "#FFFFFF",
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 15,
  },
  bgArea: {
    flex: 1,
    backgroundColor: "#1F2227",
  },
  bgAreaLight: {
    backgroundColor: "#ECEEF2",
  },
  pdfArea: {
    flex: 1,
    padding: 16,
  },
  pdfShadow: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  pdfCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.10)",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyText: {
    color: c.textMuted,
    fontSize: 14,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: c.accent,
    backgroundColor: "transparent",
    marginTop: 8,
  },
  backBtnText: {
    color: c.accent,
    fontWeight: "900",
    letterSpacing: 1,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loaderText: {
    color: c.textMuted,
    fontSize: 13,
  },
  footer: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.bg,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.accent,
    paddingVertical: 14,
    borderRadius: 10,
  },
  shareBtnText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 1,
  },
}));
