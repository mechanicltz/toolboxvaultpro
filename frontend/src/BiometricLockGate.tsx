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
} from "./biometric";
import { useAuth } from "./AuthContext";

export function BiometricLockGate({ children }: { children: React.ReactNode }) {
  const { user, logout, login } = useAuth();
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
      if (on && user) {
        setLocked(true);
      }
    })();
  }, [user, refreshEnabled]);

  // Foreground: re-prompt every time the app comes back from background.
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (next: AppStateStatus) => {
      if (next === "active") {
        const on = await refreshEnabled();
        if (on && user) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, [user, refreshEnabled]);

  // When locked → fire the biometric prompt. On success, unlock. On
  // cancel, keep the lock overlay up so the user can either retry or
  // tap "Use password".
  const runUnlock = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const creds = await tryBiometricLogin(`Unlock Toolbox Vault with ${label}`);
      if (creds) {
        // Optional: refresh the JWT against the backend in case the
        // saved session expired while the app was backgrounded. This
        // keeps the user logged in cleanly. Failures fall back to the
        // login screen.
        try {
          await login(creds.email, creds.password);
        } catch {
          /* token still works; ignore */
        }
        setLocked(false);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, label, login]);

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
