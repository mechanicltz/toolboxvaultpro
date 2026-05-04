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

const FILL_DURATION_MS = 7500; // total animation length (5–10s spec → 7.5s)

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
              <Text style={styles.progressLabel}>PURGING USER DATA</Text>

              {/* Glass tube + green nuclear fluid */}
              <View style={styles.tube}>
                {/* Outer glass border highlight */}
                <View pointerEvents="none" style={styles.tubeHighlight} />
                {/* Animated fluid fill */}
                <Animated.View style={[styles.fluidContainer, { width: fillWidth }]}>
                  {/* Outer glow shadow layer (under the gradient) */}
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.glowShadow,
                      {
                        opacity: glowOpacity,
                        shadowRadius: glowRadius,
                      },
                    ]}
                  />
                  <LinearGradient
                    colors={[
                      "#0aff5a",
                      "#39ff7a",
                      "#7dff9a",
                      "#39ff7a",
                      "#0aff5a",
                    ]}
                    locations={[0, 0.25, 0.5, 0.75, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.fluid}
                  >
                    {/* Highlight band (top sheen) */}
                    <View style={styles.fluidShine} />
                    {/* Mini bubbles for bio-hazard look */}
                    <View style={[styles.bubble, { left: 12, bottom: 6, opacity: 0.7 }]} />
                    <View style={[styles.bubble, { left: 36, bottom: 12, width: 4, height: 4, opacity: 0.5 }]} />
                    <View style={[styles.bubble, { left: 60, bottom: 4, width: 3, height: 3, opacity: 0.5 }]} />
                    <View style={[styles.bubble, { left: 92, bottom: 10, width: 5, height: 5, opacity: 0.6 }]} />
                  </LinearGradient>
                </Animated.View>
              </View>

              <View style={styles.progressMeta}>
                <Text style={styles.progressPct}>{progressPct}%</Text>
                <Text style={styles.progressHint}>
                  {progressPct < 100
                    ? "Wiping records — do not close the app"
                    : "Finalizing…"}
                </Text>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  body: { flex: 1, padding: 20, justifyContent: "center" },
  warnCard: {
    backgroundColor: "#2a0d0d",
    borderColor: theme.colors.danger,
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
    color: theme.colors.danger,
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 3,
    marginTop: 8,
    marginBottom: 8,
  },
  warnSub: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  warnNote: {
    color: theme.colors.danger,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 12,
    textAlign: "center",
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    fontSize: 13,
    marginBottom: 8,
  },
  errText: {
    color: theme.colors.danger,
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 8,
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.danger,
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
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },

  // Progress / glass tube + green fluid
  progressWrap: {
    marginTop: 28,
    alignItems: "center",
  },
  progressLabel: {
    color: "#0aff5a",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 3,
    marginBottom: 14,
    textShadowColor: "#0aff5a",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  tube: {
    width: "100%",
    height: 38,
    borderRadius: 22,
    backgroundColor: "rgba(8, 18, 14, 0.85)",
    borderWidth: 1.5,
    borderColor: "rgba(150, 255, 200, 0.35)",
    overflow: "hidden",
    // Glass highlight (web boxShadow)
    ...(Platform.select({
      web: {
        boxShadow:
          "inset 0 1px 4px rgba(255,255,255,0.18), inset 0 -2px 6px rgba(0,0,0,0.7), 0 0 16px rgba(20,200,80,0.25)" as any,
      },
      default: {
        shadowColor: "#0aff5a",
        shadowOpacity: 0.25,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 8,
      },
    }) as object),
  },
  tubeHighlight: {
    position: "absolute",
    top: 2,
    left: 14,
    right: 14,
    height: 6,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  fluidContainer: {
    height: "100%",
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    overflow: "hidden",
  },
  glowShadow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: "#0aff5a",
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
    backgroundColor: Platform.OS === "web" ? undefined : "transparent",
    ...(Platform.select({
      web: {
        boxShadow:
          "0 0 12px #0aff5a, 0 0 22px rgba(10,255,90,0.7), 0 0 36px rgba(10,255,90,0.4)" as any,
      },
      default: {},
    }) as object),
  },
  fluid: {
    flex: 1,
    justifyContent: "center",
  },
  fluidShine: {
    position: "absolute",
    top: 4,
    left: 6,
    right: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.30)",
  },
  bubble: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  progressMeta: {
    marginTop: 14,
    alignItems: "center",
  },
  progressPct: {
    color: "#0aff5a",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: "#0aff5a",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  progressHint: {
    color: theme.colors.textMuted,
    fontSize: 10,
    marginTop: 6,
    letterSpacing: 1.5,
  },
});
