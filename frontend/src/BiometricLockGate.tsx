/**
 * BiometricLockGate
 * ------------------------------------------------------------------
 * When the user has enabled biometric sign-in, this gate sits over
 * the whole app and demands Face ID / Touch ID / Fingerprint on:
 *
 *   • Cold launch (app starts from killed state)
 *   • Every transition from background → foreground (so backgrounded
 *     apps re-prompt when re-opened, matching banking-app behavior)
 *
 * The user can cancel and choose "Use password" — that signs them
 * out so they land back on the login screen. On web (no hardware)
 * and for users who haven't opted in, the gate is a no-op pass-through.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  AppStateStatus,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";
import { themedStyles } from "./themeContext";
import {
  getBiometricStatus,
  tryBiometricLogin,
  disableBiometric,
  isWithinUnlockGrace,
} from "./biometric";
import { useAuth } from "./AuthContext";

export function BiometricLockGate({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [locked, setLocked] = useState(false);
  const [label, setLabel] = useState("Face ID");
  const [busy, setBusy] = useState(false);
  // Used to remember whether the gate should be active for the current
  // user. We re-read this from storage on each foreground so the user
  // can disable biometric in More without having to re-launch.
  const enabledRef = useRef(false);
  // Track whether we've performed the initial cold-launch lock so we
  // don't fire the prompt twice if AppState transitions happen during
  // mount.
  const coldLaunchHandledRef = useRef(false);
  // Tracks whether the app has been in `background` since the last
  // time it was `active`. iOS doesn't transition cleanly
  // background→active — it inserts an `inactive` step in between, so
  // a simple "prev state" check is wrong. Instead we set this flag
  // to true the moment we see background, and read+clear it when we
  // see the next active transition.
  const sawBackgroundRef = useRef(false);

  // Re-read the biometric opt-in flag.
  const refreshEnabled = useCallback(async () => {
    if (Platform.OS === "web") {
      enabledRef.current = false;
      return false;
    }
    const s = await getBiometricStatus();
    enabledRef.current = !!(s.enabled && s.hasHardware && s.isEnrolled);
    setLabel(s.label || "Face ID");
    return enabledRef.current;
  }, []);

  // Cold-launch: lock immediately if biometric is on AND there's a
  // signed-in user (no point biometric-locking the login screen — it
  // already handles auto-prompt via its own useEffect).
  useEffect(() => {
    (async () => {
      if (coldLaunchHandledRef.current) return;
      coldLaunchHandledRef.current = true;
      const on = await refreshEnabled();
      // If the user JUST unlocked (e.g. enabled biometric from More
      // moments ago, which runs an authenticateAsync), skip the
      // initial lock to avoid a redundant prompt.
      if (on && user && !(await isWithinUnlockGrace())) {
        setLocked(true);
      }
    })();
  }, [user, refreshEnabled]);

  // Foreground re-lock — but ONLY if the app actually came back from
  // BACKGROUND, not just from `inactive`. iOS uses `inactive` when:
  //   • the user pulls down Notification Center
  //   • the system shows a permission/biometric dialog
  //   • the user takes a screenshot
  //   • a phone call comes in briefly
  // None of those should re-lock the app — only an actual
  // background→active transition (user re-opened the app) should.
  //
  // iOS quirk: the transition sequence on resume from background is
  //   background → inactive → active
  // ...so we cannot just check `prev === "background"` on the active
  // event (prev will be "inactive"). Instead we track whether we've
  // ever seen "background" since the last "active", and consult that
  // flag when active fires.
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (next: AppStateStatus) => {
      if (next === "background") {
        sawBackgroundRef.current = true;
        return;
      }
      if (next !== "active") return;
      // Only treat this resume as a real re-foreground if we
      // genuinely went to background since last time.
      const wasBackgrounded = sawBackgroundRef.current;
      sawBackgroundRef.current = false;
      if (!wasBackgrounded) return;
      // Additional safety net: if a biometric prompt JUST succeeded
      // (within the suppress window), don't immediately re-lock.
      if (await isWithinUnlockGrace()) return;
      const on = await refreshEnabled();
      if (on && user) {
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, [user, refreshEnabled]);

  // When locked → fire the biometric prompt. On success, unlock. On
  // cancel, keep the lock overlay up so the user can either retry or
  // tap "Use password".
  //
  // NOTE: We do NOT re-call `login()` after a successful unlock. The
  // user's JWT in AsyncStorage is already valid (otherwise AuthGate
  // would have routed them to /login). Re-running login() would:
  //   • cause a redundant network round-trip
  //   • re-render the entire auth tree, which together with the
  //     simultaneous AppState `active` event was the root cause of the
  //     "Face ID succeeds → screen flickers → locks again" infinite
  //     loop reported by users.
  const runUnlock = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const creds = await tryBiometricLogin(`Unlock Toolbox Vault with ${label}`);
      if (creds) {
        setLocked(false);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, label]);

  useEffect(() => {
    if (locked) {
      // Fire the prompt immediately the first time the overlay shows.
      runUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  if (!locked) return <>{children}</>;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <Ionicons
        name={
          label.toLowerCase().includes("face")
            ? "scan"
            : label.toLowerCase().includes("touch") ||
              label.toLowerCase().includes("finger")
            ? "finger-print"
            : "lock-closed"
        }
        size={64}
        color={theme.colors.accent}
      />
      <Text style={styles.title}>TOOLBOX VAULT IS LOCKED</Text>
      <Text style={styles.sub}>
        Unlock with {label} to continue
      </Text>
      <TouchableOpacity
        onPress={runUnlock}
        style={styles.retryBtn}
        disabled={busy}
        testID="biometric-unlock-retry"
      >
        <Ionicons name="refresh" size={16} color="#000" />
        <Text style={styles.retryText}>UNLOCK WITH {label.toUpperCase()}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={async () => {
          // Wipe stored creds + sign out → user lands on login screen.
          await disableBiometric();
          await logout();
          setLocked(false);
        }}
        style={styles.passwordBtn}
        testID="biometric-use-password"
      >
        <Text style={styles.passwordText}>USE PASSWORD INSTEAD</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = themedStyles((c) => ({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.bg,
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: {
    color: c.textPrimary,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 2,
    marginTop: 24,
  },
  sub: {
    color: c.textMuted,
    fontSize: 10,
    marginTop: 8,
    letterSpacing: 1,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.accent,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 32,
  },
  retryText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  passwordBtn: {
    marginTop: 18,
    paddingVertical: 10,
  },
  passwordText: {
    color: c.textMuted,
    fontWeight: "700",
    fontSize: 9,
    letterSpacing: 1.5,
  },
}));
