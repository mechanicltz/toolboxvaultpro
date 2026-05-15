import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { useAuth } from "../src/AuthContext";

import { themedStyles } from "../src/themeContext";

const FILL_DURATION_MS = 7500; // total animation length (5–10s spec → 7.5s)
const SEGMENT_COUNT = 18; // number of vertical segments visible across the bar

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [err, setErr] = useState("");

  // Animated fill (0 → 1)
  const fillAnim = useRef(new Animated.Value(0)).current;
  // Bubble pulse (decorative)
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showProgress) return;
    // Subtle continuous pulse for the green glow
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [showProgress, pulseAnim]);

  // Mirror the animated value to a JS state for the % readout
  useEffect(() => {
    const id = fillAnim.addListener(({ value }) => {
      setProgressPct(Math.round(value * 100));
    });
    return () => fillAnim.removeListener(id);
  }, [fillAnim]);

  const beginDeletion = async () => {
    setErr("");
    if (!password) {
      setErr("Please enter your password to confirm.");
      return;
    }
    setBusy(true);
    setShowProgress(true);
    fillAnim.setValue(0);

    // Start the visual fill animation in parallel with the API call.
    const animPromise = new Promise<void>((resolve) => {
      Animated.timing(fillAnim, {
        toValue: 1,
        duration: FILL_DURATION_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start(() => resolve());
    });

    try {
      const apiPromise = api.deleteAccount(password);
      // Wait for both: the deletion to finish AND the animation to play out.
      await Promise.all([apiPromise, animPromise]);
      // Success — show confirmation, then sign out (which navigates to /login)
      Alert.alert(
        "Account Deleted",
        "Your account and all associated data have been permanently destroyed. You will now be returned to the login screen.",
        [
          {
            text: "OK",
            onPress: async () => {
              try {
                await logout();
              } catch {
                /* logout always succeeds locally */
              }
            },
          },
        ],
        { cancelable: false },
      );
    } catch (e: any) {
      // Stop animation and surface the error
      fillAnim.stopAnimation();
      setShowProgress(false);
      setBusy(false);
      const msg = String(e?.message || e?.detail || e || "Could not delete account.");
      if (msg.toLowerCase().includes("password")) {
        setErr("Incorrect password. Please try again.");
      } else {
        setErr(msg);
      }
    }
  };

  const confirmAndDelete = () => {
    // No second alert — the first prompt on the MORE screen + the on-screen
    // FINAL WARNING banner above is enough confirmation.
    beginDeletion();
  };

  // Animated styles
  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const glowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  });
  const glowRadius = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 22],
  });

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Delete Account",
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.danger,
          headerTitleStyle: { fontWeight: "900" },
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.body}>
          {/* DANGER banner */}
          <View style={styles.warnCard}>
            <Ionicons name="warning" size={36} color={theme.colors.danger} />
            <Text style={styles.warnTitle}>FINAL WARNING</Text>
            <Text style={styles.warnSub}>
              Confirming below will permanently destroy your account and{" "}
              <Text style={{ fontWeight: "900" }}>ALL DATA</Text>: tools, photos,
              receipts, dealers, transactions, locations, tags, borrowers,
              warranty claims, maintenance schedules, reports, preferences —
              everything.
            </Text>
            <Text style={styles.warnNote}>
              THIS CANNOT BE UNDONE. There is no recovery and no backup.
            </Text>
          </View>

          {/* Password input */}
          <Text style={styles.label}>ENTER YOUR PASSWORD TO CONFIRM</Text>
          <TextInput
            testID="delete-password-input"
            style={styles.input}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (err) setErr("");
            }}
            placeholder="Your password"
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          {!!err && <Text style={styles.errText}>{err}</Text>}

          {!showProgress && (
            <>
              <TouchableOpacity
                testID="delete-account-confirm"
                style={[styles.dangerBtn, busy && { opacity: 0.5 }]}
                onPress={confirmAndDelete}
                disabled={busy}
                activeOpacity={0.8}
              >
                <Ionicons name="skull" size={18} color="#fff" />
                <Text style={styles.dangerBtnText}>DESTROY MY ACCOUNT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="delete-account-cancel"
                style={styles.cancelBtn}
                onPress={() => router.back()}
                disabled={busy}
              >
                <Text style={styles.cancelBtnText}>CANCEL — KEEP MY ACCOUNT</Text>
              </TouchableOpacity>
            </>
          )}

          {showProgress && (
            <View style={styles.progressWrap}>
              {/* === Segmented neon progress bar — matches reference === */}
              <View style={styles.barFrame}>
                {/* Top header strip: LCD label on left, status LEDs on right */}
                <View style={styles.barHeader}>
                  <View style={styles.lcdBox}>
                    <Text style={styles.lcdText}>DELETING</Text>
                  </View>
                  <View style={styles.notchRow}>
                    <View style={styles.notch} />
                    <View style={styles.notch} />
                    <View style={styles.notch} />
                    <View style={styles.notch} />
                  </View>
                  <View style={styles.ledRow}>
                    <Animated.View style={[styles.led, { opacity: glowOpacity }]} />
                    <Animated.View style={[styles.led, { opacity: glowOpacity }]} />
                    <Animated.View style={[styles.led, { opacity: glowOpacity }]} />
                  </View>
                </View>

                {/* Bar slot */}
                <View style={styles.barSlot}>
                  {/* Animated green fill (gradient) */}
                  <Animated.View style={[styles.fillContainer, { width: fillWidth }]}>
                    <LinearGradient
                      colors={["#1d6b2a", "#33d65a", "#9bff8c", "#33d65a", "#0e4a18"]}
                      locations={[0, 0.18, 0.5, 0.82, 1]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={styles.fillGradient}
                    >
                      {/* Highlight band along the top of the fill */}
                      <View style={styles.fillShine} />
                    </LinearGradient>
                  </Animated.View>

                  {/* Trailing-edge spill: a soft green halo right after the
                      filled portion, fading into the unfilled black area. */}
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.trailingGlow,
                      { left: fillWidth, opacity: glowOpacity },
                    ]}
                  >
                    <LinearGradient
                      colors={[
                        "rgba(50,255,90,0.85)",
                        "rgba(50,255,90,0.35)",
                        "rgba(50,255,90,0)",
                      ]}
                      locations={[0, 0.4, 1]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={{ flex: 1 }}
                    />
                  </Animated.View>

                  {/* Vertical segment dividers — 19 thin dark lines on top */}
                  {Array.from({ length: SEGMENT_COUNT - 1 }).map((_, i) => (
                    <View
                      key={i}
                      pointerEvents="none"
                      style={[
                        styles.divider,
                        { left: `${((i + 1) / SEGMENT_COUNT) * 100}%` },
                      ]}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.progressMeta}>
                <Text style={styles.progressPct}>{progressPct}%</Text>
                <Text style={styles.progressHint}>
                  {progressPct < 100
                    ? "PURGING USER DATA — DO NOT CLOSE THE APP"
                    : "FINALIZING…"}
                </Text>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  body: { flex: 1, padding: 20, justifyContent: "center" },
  warnCard: {
    backgroundColor: "#2a0d0d",
    borderColor: c.danger,
    borderWidth: 2,
    borderRadius: theme.radii.md,
    paddingVertical: 22,
    paddingHorizontal: 18,
    marginBottom: 20,
    alignItems: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 380,
  },
  warnTitle: {
    color: c.danger,
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 3,
    marginTop: 8,
    marginBottom: 8,
  },
  warnSub: {
    color: c.textPrimary,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  warnNote: {
    color: c.danger,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 12,
    textAlign: "center",
  },
  label: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 6,
  },
  input: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: c.textPrimary,
    fontSize: 13,
    marginBottom: 8,
  
    ...(theme.elevation.input as object),
  },
  errText: {
    color: c.danger,
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 8,
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.danger,
    paddingVertical: 16,
    borderRadius: theme.radii.md,
    marginTop: 12,
  },
  dangerBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2.5,
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  cancelBtnText: {
    color: c.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },

  // Progress / segmented neon bar (matches reference)
  progressWrap: {
    marginTop: 28,
    alignItems: "center",
    width: "100%",
  },
  barFrame: {
    width: "100%",
    backgroundColor: "#191c1a",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: "#3a4a3f",
    ...(Platform.select({
      web: {
        boxShadow:
          "inset 0 1px 0 rgba(180,255,200,0.10), inset 0 -2px 4px rgba(0,0,0,0.65), 0 0 18px rgba(60,255,120,0.18)" as any,
      },
      default: {
        shadowColor: "#33d65a",
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
      },
    }) as object),
  },
  barHeader: {
    flexDirection: "row",
    alignItems: "center",
    height: 22,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  lcdBox: {
    backgroundColor: "#0a1410",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#2c4a36",
    alignItems: "center",
    justifyContent: "center",
  },
  lcdText: {
    color: "#7dff8c",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 3,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    textShadowColor: "#33d65a",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  notchRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginHorizontal: 8,
  },
  notch: {
    width: 8,
    height: 3,
    borderRadius: 1,
    backgroundColor: "#2a322c",
  },
  ledRow: {
    flexDirection: "row",
    gap: 3,
    alignItems: "center",
  },
  led: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#7dff8c",
    ...(Platform.select({
      web: {
        boxShadow: "0 0 6px #33d65a" as any,
      },
      default: {
        shadowColor: "#33d65a",
        shadowOpacity: 1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 0 },
      },
    }) as object),
  },
  barSlot: {
    height: 30,
    backgroundColor: "#050805",
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1a2a1f",
    position: "relative",
  },
  fillContainer: {
    height: "100%",
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
  },
  fillGradient: {
    flex: 1,
  },
  fillShine: {
    position: "absolute",
    top: 2,
    left: 2,
    right: 2,
    height: 4,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  trailingGlow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 40,
    marginLeft: -2,
  },
  divider: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1.5,
    marginLeft: -0.75,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  progressMeta: {
    marginTop: 14,
    alignItems: "center",
  },
  progressPct: {
    color: "#7dff8c",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: "#33d65a",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  progressHint: {
    color: c.textMuted,
    fontSize: 9,
    marginTop: 6,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
}));
