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

export default function PdfViewerScreen(): React.ReactElement {
  const router = useRouter();
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

  const onShare = async () => {
    if (!uri) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) return;
      await Sharing.shareAsync(uri, {
        mimeType: mime,
        dialogTitle: title,
        UTI: isPdf ? "com.adobe.pdf" : undefined,
      });
    } catch {
      /* user dismissed sheet — non-fatal */
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <Stack.Screen
        options={{
          title,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.textPrimary,
          headerTitleStyle: { color: theme.colors.textPrimary, fontWeight: "700" },
          headerRight: () => (
            <TouchableOpacity
              testID="pdf-share-btn"
              onPress={onShare}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
              accessibilityLabel="Share"
            >
              <Ionicons name="share-outline" size={24} color={theme.colors.accent} />
            </TouchableOpacity>
          ),
        }}
      />

      {!uri ? (
        <View style={styles.empty}>
          <Ionicons name="document-text-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyText}>No file to preview.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>GO BACK</Text>
          </TouchableOpacity>
        </View>
      ) : Platform.OS === "web" ? (
        // Web: react-native-web doesn't render PDFs in WebView reliably.
        // <iframe> is the universally-supported viewer.
        // @ts-ignore — iframe is fine in RN-Web context
        <iframe
          src={uri}
          style={{
            flex: 1,
            border: 0,
            width: "100%",
            height: "100%",
            backgroundColor: theme.colors.background,
          }}
          title={title}
        />
      ) : (
        <WebView
          testID="pdf-webview"
          // Loading file:// URIs needs allowFileAccess. originWhitelist
          // allows the file scheme on Android.
          source={{ uri }}
          style={{ flex: 1, backgroundColor: theme.colors.background }}
          originWhitelist={["*"]}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={theme.colors.accent} />
              <Text style={styles.loaderText}>Loading {title}…</Text>
            </View>
          )}
          // iOS uses native PDFKit when the source is a PDF file — no extra
          // setup needed. Android downloads it; modern WebView supports inline.
        />
      )}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    backgroundColor: "transparent",
    marginTop: 8,
  },
  backBtnText: {
    color: theme.colors.accent,
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
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  footer: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
  },
  shareBtnText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 1,
  },
});
