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
import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import * as Sharing from "expo-sharing";
import { setStatusBarStyle } from "expo-status-bar";
import { useSkin, useThemeMode } from "../src/themeContext";

// Universal, theme-independent report viewer palette. EVERY user sees the exact
// same clean "document viewer" chrome regardless of their app theme.
const UI = {
  pageBg: "#FFFFFF",
  surface: "#FFFFFF",
  backdrop: "#ECEEF2",
  border: "#E2E5EA",
  text: "#13161B",
  muted: "#6B7280",
  cta: "#2563EB",
  ctaText: "#FFFFFF",
};

export default function PdfViewerScreen(): React.ReactElement {
  const router = useRouter();
  // Subscribe to theme so we can restore the user's status-bar style on exit.
  const { skin } = useSkin();
  const { mode } = useThemeMode();

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

  // This is a LIGHT, theme-independent surface, so force dark status-bar glyphs
  // (clock/battery) while it's focused, then restore the user's themed style.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("dark", true);
      return () => {
        const themed =
          skin === "industrial" ? "light" : mode === "light" ? "dark" : "light";
        setStatusBarStyle(themed as any, true);
      };
    }, [skin, mode]),
  );

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

  const handleBack = useCallback(() => {
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
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Clean, fixed light header — identical for every theme. */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          testID="pdf-back-btn"
          onPress={handleBack}
          style={styles.headerBtn}
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={UI.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{prettyTitle}</Text>
        <TouchableOpacity
          testID="pdf-share-btn"
          onPress={onShare}
          style={styles.headerBtn}
          accessibilityLabel="Share"
          hitSlop={8}
        >
          <Ionicons name="share-outline" size={22} color={UI.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.bgArea}>
        {!uri ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={UI.muted} />
            <Text style={styles.emptyText}>No file to preview.</Text>
            <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
              <Text style={styles.backBtnText}>GO BACK</Text>
            </TouchableOpacity>
          </View>
        ) : (
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
                    <ActivityIndicator size="large" color={UI.cta} />
                    <Text style={styles.loaderText}>Loading {prettyTitle}…</Text>
                  </View>
                )}
              />
            )}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          testID="pdf-share-footer"
          style={styles.shareBtn}
          onPress={onShare}
          activeOpacity={0.85}
        >
          <Ionicons name="share-outline" size={20} color={UI.ctaText} />
          <Text style={styles.shareBtnText}>SHARE / SAVE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI.surface,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: UI.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: UI.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.backdrop,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: UI.text,
    fontWeight: "800",
    fontSize: 17,
  },
  bgArea: {
    flex: 1,
    backgroundColor: UI.backdrop,
  },
  pdfCard: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyText: {
    color: UI.muted,
    fontSize: 14,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: UI.cta,
    backgroundColor: "transparent",
    marginTop: 8,
  },
  backBtnText: {
    color: UI.cta,
    fontWeight: "900",
    letterSpacing: 1,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#ffffff",
  },
  loaderText: {
    color: UI.muted,
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: UI.border,
    backgroundColor: UI.surface,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: UI.cta,
    paddingVertical: 15,
    borderRadius: 12,
  },
  shareBtnText: {
    color: UI.ctaText,
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 1,
  },
});
