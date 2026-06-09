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
  Image,
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
import { ContactIconImage } from "../src/components/ContactIcons";
import { theme } from "../src/theme";
import { themedStyles, useSkin } from "../src/themeContext";
import { SKIN, CAP, TBV } from "../src/tbv/skins";

export default function PdfViewerScreen(): React.ReactElement {
  const router = useRouter();
  useSkin(); // subscribe so the SKIN proxy re-resolves on theme/variant change
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
    try {
      router.back();
      // If after backing we're STILL inside a pdf-viewer (multiple
      // stacked previews), keep going. We schedule one extra pop on
      // next tick so React Navigation has time to update the stack.
      setTimeout(() => {
        try {
          // expo-router 5+ exposes canGoBack; fall back to a raw back call.
          // @ts-ignore
          if ((router as any).canGoBack?.()) {
            // Heuristic: try to dismiss any remaining pdf-viewer in stack.
            // If we're already on a non-pdf route this is harmless.
            // @ts-ignore
            (router as any).dismissAll?.();
          }
        } catch {
          /* ignore */
        }
      }, 0);
    } catch {
      try {
        router.replace("/(tabs)/reports");
      } catch {
        /* swallow */
      }
    }
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <Stack.Screen
        options={{
          title,
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerTitleStyle: { color: theme.colors.textPrimary, fontWeight: "700" },
          headerLeft: () => (
            <TouchableOpacity
              testID="pdf-back-btn"
              onPress={handleBack}
              style={{ paddingHorizontal: 12, paddingVertical: 6, marginLeft: -4 }}
              accessibilityLabel="Back"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={26} color={theme.colors.accent} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              testID="pdf-share-btn"
              onPress={onShare}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
              accessibilityLabel="Share"
            >
              <ContactIconImage type="share" size={30} />
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.metalBg}>
        {/* Metal texture sits BEHIND everything (explicit first child so it
            never paints over the PDF — RN-Web's ImageBackground does). */}
        <Image
          source={SKIN.bg}
          resizeMode="cover"
          fadeDuration={0}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
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
            {/* Beveled metal bezel framing the white document. Flex layout so it
                renders reliably on web & native (no fragile absolute sizing). */}
            <View style={styles.pdfBezel}>
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
                    title={title}
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
                        <Text style={styles.loaderText}>Loading {title}…</Text>
                      </View>
                    )}
                  />
                )}
              </View>
            </View>
            {/* iOS: overlay the ornate window frame (bolts/corners) — capInsets
                9-slices perfectly on native. Web omits it (capInsets unsupported)
                and relies on the bezel above. Non-interactive. */}
            {Platform.OS === "ios" && (
              <Image
                source={SKIN.window}
                capInsets={CAP.window}
                resizeMode="stretch"
                fadeDuration={0}
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              />
            )}
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
          <ContactIconImage type="share" size={24} />
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
  metalBg: {
    flex: 1,
    backgroundColor: TBV.ink,
  },
  pdfArea: {
    flex: 1,
    position: "relative",
    padding: 14,
  },
  pdfBezel: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: "#878d96",
    backgroundColor: "#2b2e33",
    padding: 3,
  },
  pdfCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 3,
    overflow: "hidden",
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
