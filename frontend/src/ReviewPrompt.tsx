/**
 * ReviewPrompt — a gentle, on-brand "leave a review" nudge.
 *
 * Counts how many times the app has been opened (once per app launch). On the
 * 6th open (and every 6 opens after, until the user reviews or opts out) it
 * shows a friendly themed card asking if they're enjoying the app. If they tap
 * "Sure!", we hand off to the platform's OFFICIAL in-app review popup (Apple's
 * StoreKit prompt / Google Play's in-app review) — the only store-approved way
 * to ask. If the system declines to show its popup that time, we simply try
 * again on a later open.
 *
 * NOTE: the official store popup only works on a REAL installed build (App
 * Store / Play Store). In Expo Go / web it silently no-ops, which is fine.
 */
import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { useColors } from "./themeContext";

const KEY_COUNT = "review_open_count";
const KEY_STATUS = "review_status"; // "pending" | "done" | "never"
const KEY_LAST = "review_last_prompt_at";

// Show first on the 6th open, then re-ask every 6 opens while still pending.
const FIRST_AT = 6;
const REPROMPT_EVERY = 6;

// Guard so a single app launch is only ever counted once, even if this
// component remounts (navigation churn / fast refresh).
let countedThisSession = false;

export function ReviewPrompt() {
  const c = useColors();
  const [visible, setVisible] = useState(false);
  const handledRef = useRef(false);

  useEffect(() => {
    if (countedThisSession || handledRef.current) return;
    countedThisSession = true;
    handledRef.current = true;
    (async () => {
      try {
        const status = (await AsyncStorage.getItem(KEY_STATUS)) || "pending";
        if (status === "done" || status === "never") return;

        const count = Number((await AsyncStorage.getItem(KEY_COUNT)) || "0") + 1;
        await AsyncStorage.setItem(KEY_COUNT, String(count));

        if (count < FIRST_AT) return;
        const last = Number((await AsyncStorage.getItem(KEY_LAST)) || "0");
        if (last > 0 && count - last < REPROMPT_EVERY) return;

        await AsyncStorage.setItem(KEY_LAST, String(count));
        // Small delay so the card never collides with the boot intro overlay.
        setTimeout(() => setVisible(true), 1800);
      } catch {
        /* storage unavailable — skip silently */
      }
    })();
  }, []);

  const close = () => setVisible(false);

  const onSure = async () => {
    close();
    try {
      await AsyncStorage.setItem(KEY_STATUS, "done");
    } catch {
      /* ignore */
    }
    try {
      const available = await StoreReview.isAvailableAsync();
      if (available) {
        await StoreReview.requestReview();
        return;
      }
      // Fallback: open the store listing directly if a URL is configured.
      const url = await StoreReview.storeUrl();
      if (url) await Linking.openURL(url);
    } catch {
      /* review API unavailable (e.g. web / Expo Go) — nothing to do */
    }
  };

  const onLater = async () => {
    close();
    // Status stays "pending" → we'll ask again ~6 opens from now.
  };

  const onNever = async () => {
    close();
    try {
      await AsyncStorage.setItem(KEY_STATUS, "never");
    } catch {
      /* ignore */
    }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onLater}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: c.accent + "22" }]}>
            <Ionicons name="star" size={30} color={c.accent} />
          </View>
          <Text style={[styles.title, { color: c.textPrimary }]}>Enjoying Toolbox Vault?</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            If the app has been keeping your tools in order, a quick review
            really helps us out. Mind leaving one?
          </Text>

          <TouchableOpacity
            testID="review-sure"
            activeOpacity={0.85}
            style={[styles.primaryBtn, { backgroundColor: c.accent }]}
            onPress={onSure}
          >
            <Text style={styles.primaryBtnText}>Sure!</Text>
          </TouchableOpacity>

          <TouchableOpacity testID="review-later" activeOpacity={0.7} style={styles.ghostBtn} onPress={onLater}>
            <Text style={[styles.ghostBtnText, { color: c.textSecondary }]}>Maybe later</Text>
          </TouchableOpacity>

          <TouchableOpacity testID="review-never" activeOpacity={0.7} style={styles.linkBtn} onPress={onNever}>
            <Text style={[styles.linkBtnText, { color: c.textMuted }]}>No thanks</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 16,
    alignItems: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
      android: { elevation: 12 },
      default: {},
    }),
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: { fontSize: 19, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, textAlign: "center", marginBottom: 22 },
  primaryBtn: {
    width: "100%",
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  ghostBtn: { width: "100%", height: 46, alignItems: "center", justifyContent: "center", marginTop: 6 },
  ghostBtnText: { fontSize: 15, fontWeight: "700" },
  linkBtn: { paddingVertical: 8, alignItems: "center", justifyContent: "center", marginTop: 2 },
  linkBtnText: { fontSize: 13, fontWeight: "600" },
});

export default ReviewPrompt;
