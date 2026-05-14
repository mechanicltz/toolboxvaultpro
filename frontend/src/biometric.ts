/**
 * Biometric / device-unlock login helper.
 * ------------------------------------------------------------------
 * Wraps `expo-local-authentication` (Face ID / Touch ID / Fingerprint
 * / device PIN) and `expo-secure-store` (iOS Keychain / Android
 * Keystore) into a small set of high-level operations the rest of the
 * app can call. All functions degrade gracefully on web / Expo Go
 * builds where the modules return false / no-op.
 */
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SECURE_KEY_EMAIL = "tt.biometric.email";
const SECURE_KEY_PASSWORD = "tt.biometric.password";
// AsyncStorage flags (non-secret) — used so the UI can read state
// without unlocking the secure store.
const FLAG_ENABLED = "tt.biometric.enabled"; // "1" when the user has opted in
const FLAG_PROMPTED = "tt.biometric.prompted"; // "1" once we've offered the prompt at least once

export interface BiometricStatus {
  /** Device has biometric hardware (Touch ID / Face ID / Fingerprint sensor). */
  hasHardware: boolean;
  /** User has actually enrolled a biometric on the device (face, finger, etc.) */
  isEnrolled: boolean;
  /** User has opted-in to use biometric login for this app. */
  enabled: boolean;
  /** Human label for the available biometric type (e.g. "Face ID", "Touch ID"). */
  label: string;
}

/**
 * Read the device capabilities + app-side opt-in state.
 * Safe to call on web / Expo Go (returns hasHardware=false there).
 */
export async function getBiometricStatus(): Promise<BiometricStatus> {
  if (Platform.OS === "web") {
    return { hasHardware: false, isEnrolled: false, enabled: false, label: "Biometrics" };
  }
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;
    const types = hasHardware ? await LocalAuthentication.supportedAuthenticationTypesAsync() : [];
    let label = "Biometrics";
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      label = Platform.OS === "ios" ? "Face ID" : "Face Unlock";
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      label = Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      label = "Iris";
    }
    const enabled = (await AsyncStorage.getItem(FLAG_ENABLED)) === "1";
    return { hasHardware, isEnrolled, enabled, label };
  } catch {
    return { hasHardware: false, isEnrolled: false, enabled: false, label: "Biometrics" };
  }
}

/**
 * Have we already asked the user once whether they want to enable
 * biometric sign-in? Used so we don't pester them on every login.
 */
export async function hasBeenPromptedForBiometric(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FLAG_PROMPTED)) === "1";
  } catch {
    return false;
  }
}

export async function markBiometricPrompted(): Promise<void> {
  try {
    await AsyncStorage.setItem(FLAG_PROMPTED, "1");
  } catch {}
}

/**
 * Save the user's credentials in the OS secure store (Keychain /
 * Keystore) and flip the enabled flag. Subsequent calls to
 * `tryBiometricLogin()` will be able to unlock them. We store the
 * password rather than the token so the user can re-authenticate
 * against the backend (tokens may expire/rotate, passwords don't).
 */
export async function enableBiometric(email: string, password: string): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.setItemAsync(SECURE_KEY_EMAIL, email, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(SECURE_KEY_PASSWORD, password, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await AsyncStorage.setItem(FLAG_ENABLED, "1");
  await AsyncStorage.setItem(FLAG_PROMPTED, "1");
}

/**
 * Wipe the saved credentials and turn the toggle off.
 */
export async function disableBiometric(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_KEY_EMAIL);
  } catch {}
  try {
    await SecureStore.deleteItemAsync(SECURE_KEY_PASSWORD);
  } catch {}
  try {
    await AsyncStorage.removeItem(FLAG_ENABLED);
  } catch {}
}

/**
 * Prompts the user with Face ID / Touch ID. On success, returns the
 * stored credentials so the caller can complete a normal login flow.
 * Returns `null` on cancel / failure / unavailability.
 */
export async function tryBiometricLogin(
  promptMessage?: string,
): Promise<{ email: string; password: string } | null> {
  if (Platform.OS === "web") return null;
  try {
    const status = await getBiometricStatus();
    if (!status.enabled || !status.hasHardware || !status.isEnrolled) return null;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || `Unlock Toolbox Vault with ${status.label}`,
      cancelLabel: "Use Password",
      // CRITICAL: Disable the iOS "Enter iPhone Passcode" fallback. If
      // Face ID fails, we want the user routed back to our own password
      // screen — NOT to the OS device-passcode dialog (which confuses
      // users into entering their account password and getting locked
      // out of iOS).
      disableDeviceFallback: true,
    });
    if (!result.success) return null;
    const email = await SecureStore.getItemAsync(SECURE_KEY_EMAIL);
    const password = await SecureStore.getItemAsync(SECURE_KEY_PASSWORD);
    if (!email || !password) return null;
    return { email, password };
  } catch {
    return null;
  }
}

/** Sugar — does the user currently have biometric login enabled? */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FLAG_ENABLED)) === "1";
  } catch {
    return false;
  }
}
