import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { theme } from "../theme";
import { api } from "../api";
import { useIntroFinished } from "../introState";

// One-time flag for the post-demo "choose your theme" popup. Shown once, right
// after the user dismisses the demo-data intro on a fresh account.
const THEME_INTRO_KEY = "tbv_theme_intro_seen";

/**
 * Prefilled Demo System surface for the Dashboard.
 *
 * Renders two things while the account still holds seeded demo data:
 *   1. A one-time, dismissible intro popup (only until `intro_seen`).
 *   2. A small persistent banner that stays until the user removes the demo
 *      data from Account → "Delete Prefilled Information".
 *
 * Self-contained: it fetches `/demo/status` on focus, so once the data is
 * deleted (and the user returns to the dashboard) both the popup and banner
 * vanish permanently.
 */
export function DemoBanner() {
  const router = useRouter();
  const introDone = useIntroFinished();
  const [present, setPresent] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [showThemeIntro, setShowThemeIntro] = useState(false);
  // The welcome popup is a native Modal, so it would draw over the intro
  // video. We remember that it WANTS to open, then reveal it only once the
  // intro overlay is gone (see the effect below).
  const [pendingIntro, setPendingIntro] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.demoStatus({ forceFresh: true });
      setPresent(!!s?.present);
      setPendingIntro(!!s?.present && !s?.intro_seen);
    } catch {
      // not logged in / backend down — stay silent
      setPresent(false);
      setPendingIntro(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Open the queued welcome popup only after the intro video finishes.
  useEffect(() => {
    if (introDone && pendingIntro) {
      setShowIntro(true);
      setPendingIntro(false);
    }
  }, [introDone, pendingIntro]);

  const dismissIntro = useCallback(async () => {
    setShowIntro(false);
    try {
      await api.demoIntroSeen();
    } catch {
      /* best-effort — it will retry-mark on next dismiss */
    }
  }, []);

  const goManage = useCallback(async () => {
    await dismissIntro();
    router.push({ pathname: "/(tabs)/more", params: { openPrefilled: "1" } } as any);
  }, [dismissIntro, router]);

  // Primary "GOT IT" on the demo popup → dismiss demo intro, then (one time
  // only) chain into the "choose your theme" popup for fresh accounts.
  const onGotItDemo = useCallback(async () => {
    setShowIntro(false);
    try {
      await api.demoIntroSeen();
    } catch {
      /* best-effort */
    }
    try {
      const seen = await AsyncStorage.getItem(THEME_INTRO_KEY);
      if (seen !== "1") setShowThemeIntro(true);
    } catch {
      setShowThemeIntro(true);
    }
  }, []);

  // Theme popup OK → mark seen, close, jump to Vault with the Theme accordion
  // pre-opened so the user can pick a theme immediately.
  const startTheming = useCallback(async () => {
    setShowThemeIntro(false);
    try {
      await AsyncStorage.setItem(THEME_INTRO_KEY, "1");
    } catch {
      /* best-effort */
    }
    router.push({ pathname: "/(tabs)/more", params: { openTheme: "1" } } as any);
  }, [router]);

  if (!present) return null;

  return (
    <>
      {/* Persistent banner */}
      <TouchableOpacity
        testID="demo-banner"
        activeOpacity={0.85}
        onPress={() => setShowIntro(true)}
        style={styles.banner}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="sparkles" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>DEMO DATA LOADED</Text>
          <Text style={styles.bannerSub} numberOfLines={2}>
            Sample tools, dealers & claims fill the app so you can explore. Tap
            to learn how to remove it.
          </Text>
        </View>
        <Ionicons name="information-circle" size={20} color="#fff" />
      </TouchableOpacity>

      {/* One-time intro popup */}
      <Modal
        visible={showIntro}
        transparent
        animationType="fade"
        onRequestClose={dismissIntro}
      >
        <View style={styles.overlay}>
          <View style={styles.card} testID="demo-intro-modal">
            <View style={styles.cardHeader}>
              <Ionicons name="sparkles" size={26} color={theme.colors.accent} />
              <Text style={styles.cardTitle}>Welcome — Demo Data Loaded</Text>
            </View>

            <ScrollView style={styles.cardBodyScroll} bounces={false}>
              <Text style={styles.cardBody}>
                To help you explore every corner of the app, we&apos;ve
                prefilled your account with a realistic sample workshop:
              </Text>
              {[
                "~15 inventory items — including checked-out, lost, stolen, broken, for-sale & sold tools",
                "A bundled \"Set\" and contacts who borrow tools",
                "Dealer accounts with balances, routes & payment schedules",
                "Warranty claims (open + history) and maintenance alerts",
                "A full insurance claim with evidence, plus a wishlist",
              ].map((line) => (
                <View key={line} style={styles.bulletRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={theme.colors.success}
                    style={{ marginTop: 1 }}
                  />
                  <Text style={styles.bulletText}>{line}</Text>
                </View>
              ))}
              <Text style={[styles.cardBody, { marginTop: 12 }]}>
                Ready to start fresh? Remove it anytime from{" "}
                <Text style={styles.bodyStrong}>
                  Vault → Data Management → Remove Preloaded Data
                </Text>
                . You&apos;ll choose whether to wipe everything or keep your
                dealers, locations, tags &amp; categories.
              </Text>
            </ScrollView>

            <TouchableOpacity
              testID="demo-intro-manage"
              activeOpacity={0.85}
              onPress={goManage}
              style={styles.secondaryBtn}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.secondaryBtnText}>Remove Preloaded Data</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="demo-intro-dismiss"
              activeOpacity={0.85}
              onPress={onGotItDemo}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>GOT IT — START EXPLORING</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Second one-time popup — theme customization, shown right after the
          demo intro on a fresh account. OK → jump to Vault with Theme open. */}
      <Modal
        visible={showThemeIntro}
        transparent
        animationType="fade"
        onRequestClose={startTheming}
      >
        <View style={styles.overlay}>
          <View style={styles.card} testID="theme-intro-modal">
            <View style={styles.cardHeader}>
              <Ionicons name="color-palette" size={26} color={theme.colors.accent} />
              <Text style={styles.cardTitle}>Make It Yours</Text>
            </View>
            <Text style={styles.cardBody}>
              Toolbox Vault offers{" "}
              <Text style={styles.bodyStrong}>6 different theme styles</Text> to
              suit your needs. Choose your desired theme to get started.
            </Text>
            <TouchableOpacity
              testID="theme-intro-choose"
              activeOpacity={0.85}
              onPress={startTheming}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>CHOOSE MY THEME</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1F5E63",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8A23C",
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: { color: "#fff", fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  bannerSub: { color: "rgba(255,255,255,0.92)", fontSize: 12, marginTop: 2, lineHeight: 16 },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "82%",
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 22,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  cardTitle: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  cardBodyScroll: { flexGrow: 0 },
  cardBody: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  bodyStrong: { color: theme.colors.textPrimary, fontWeight: "800" },
  bulletRow: { flexDirection: "row", gap: 8, marginTop: 10, paddingRight: 4 },
  bulletText: { flex: 1, color: theme.colors.textSecondary, fontSize: 13, lineHeight: 18 },

  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
  },
  secondaryBtnText: { color: theme.colors.textSecondary, fontSize: 14, fontWeight: "700" },
  primaryBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
  },
  primaryBtnText: {
    color: theme.colors.textOnAccent,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
