/**
 * Forgot / Reset Password — Toolbox Vault industrial reskin (Phase 1).
 *
 * Visual language matches the LOCKED login screen (same skins + sizing rules:
 * measured-width column, content-driven panel height, image skins). The
 * FUNCTIONAL flow is UNCHANGED — a secure 2-step 6-digit code reset:
 *   1) request : enter email   -> /auth/forgot-password (emails a 6-digit code)
 *   2) verify  : code + new pw  -> /auth/reset-password  -> signed in
 *
 * NOTE: the app uses a 6-digit CODE (not a magic link), so the primary button
 * reads "SEND RESET CODE".
 */
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  ImageBackground,
  Image,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFonts as useGoogleFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import {
  Rajdhani_500Medium,
  Rajdhani_600SemiBold,
  Rajdhani_700Bold,
} from "@expo-google-fonts/rajdhani";
import { Exo2_400Regular, Exo2_500Medium, Exo2_700Bold } from "@expo-google-fonts/exo-2";
import { api, setToken } from "../src/api";
import { useAuth } from "../src/AuthContext";
import { SKIN, AR, TBV, clamp } from "../src/tbv/skins";
import { TbvHeader } from "../src/tbv/TbvHeader";
import { useTbvSkinsReady } from "../src/tbv/useTbvSkins";

type Step = "request" | "verify";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { refresh } = useAuth();
  const win = useWindowDimensions();

  const [fontsLoaded, fontError] = useGoogleFonts({
    BebasNeue_400Regular,
    Rajdhani_500Medium,
    Rajdhani_600SemiBold,
    Rajdhani_700Bold,
    Exo2_400Regular,
    Exo2_500Medium,
    Exo2_700Bold,
  });

  const [box, setBox] = useState({ w: win.width, h: win.height });
  const [measuredInnerH, setMeasuredInnerH] = useState(0);
  const skinsReady = useTbvSkinsReady();

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  // ---------- logic (UNCHANGED behaviour) ----------
  const submitEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert("Missing info", "Please enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await api.forgotPassword({ email: trimmed });
      setEmail(trimmed);
      setStep("verify");
      setMeasuredInnerH(0); // re-measure for the taller verify panel
      Alert.alert(
        "Check your email",
        "If that email is registered, we've sent a 6-digit code. It expires in 15 minutes.",
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not request a reset code.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    const codeTrim = code.replace(/\s+/g, "").trim();
    if (!/^\d{6}$/.test(codeTrim)) {
      Alert.alert("Missing info", "Please enter the 6-digit code from your email.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Missing info", "New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.resetPassword({ email, code: codeTrim, new_password: newPassword });
      if (res?.token) await setToken(res.token);
      await refresh();
      Alert.alert("Password reset", "Your password has been updated and you're now signed in.", [
        { text: "OK", onPress: () => router.replace("/") },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Invalid or expired code.");
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    setBusy(true);
    try {
      await api.forgotPassword({ email });
      Alert.alert("Sent", "A new 6-digit code has been sent if that email is registered.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not resend code.");
    } finally {
      setBusy(false);
    }
  };

  // ---------- responsive sizing (mirrors login) ----------
  const cw = box.w;
  const ch = box.h;
  const SCROLL_PAD_X = 8;
  const avail = Math.max(0, cw - SCROLL_PAD_X * 2);
  const WORK_W = Math.min(avail, 430);

  const logoW = Math.min(WORK_W * 0.3, 132);
  const logoH = logoW / AR.logo;
  const headerSize = clamp(WORK_W * 0.105, 30, 42);

  const panelW = WORK_W;
  // The skin's metal rails are a fixed FRACTION of the stretched art, so the
  // padding scales with the final panel height (content sits in the middle).
  const TOP_FRAC = 0.13;
  const BOT_FRAC = 0.18;
  const fallbackInnerH = step === "request" ? 235 : 430;
  const innerH = measuredInnerH > 0 ? measuredInnerH : fallbackInnerH;
  const panelH = innerH / (1 - TOP_FRAC - BOT_FRAC);
  const padTop = panelH * TOP_FRAC;
  const padBot = panelH * BOT_FRAC;
  const padX = panelW * 0.11;
  const contentW = panelW - padX * 2;
  const fieldInset = clamp(contentW * 0.04, 8, 16);
  const fieldW = contentW - fieldInset * 2;

  const inputH = clamp(WORK_W * 0.125, 46, 54);
  const btnH = clamp(WORK_W * 0.145, 52, 60);
  const innerGap = clamp(WORK_W * 0.03, 11, 15);

  const topPad = clamp(ch * 0.04, 16, 46);
  const headerGap = clamp(ch * 0.016, 10, 16);

  // ---------- font + skin gate ----------
  if ((!fontsLoaded && !fontError) || !skinsReady) {
    return (
      <ImageBackground source={SKIN.bg} style={styles.bg} resizeMode="cover">
        <View style={styles.veil} />
        <View style={styles.loading}>
          <ActivityIndicator color={TBV.orange} size="large" />
        </View>
      </ImageBackground>
    );
  }

  const goBack = () => (step === "verify" ? (setStep("request"), setMeasuredInnerH(0)) : router.back());

  const PrimaryButton = ({
    label,
    icon,
    onPress,
  }: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  }) => (
    <Pressable onPress={onPress} disabled={busy} style={{ marginTop: innerGap * 1.2 }}>
      <ImageBackground
        source={SKIN.btnPrimary}
        style={{ width: contentW, height: btnH, justifyContent: "center", alignItems: "center" }}
        imageStyle={styles.fillImage}
        resizeMode="stretch"
      >
        {busy ? (
          <ActivityIndicator color={TBV.ink} />
        ) : (
          <View style={styles.row}>
            <Ionicons name={icon} size={18} color={TBV.ink} />
            <Text style={styles.submitText}>{label}</Text>
          </View>
        )}
      </ImageBackground>
    </Pressable>
  );

  return (
    <ImageBackground source={SKIN.bg} style={styles.bg} resizeMode="cover">
      <View style={styles.veil} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View
            style={{ flex: 1 }}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (Math.abs(width - box.w) > 1 || Math.abs(height - box.h) > 1)
                setBox({ w: width, h: height });
            }}
          >
            <ScrollView
              contentContainerStyle={[
                styles.scroll,
                { minHeight: ch, gap: headerGap, paddingTop: topPad, paddingBottom: headerGap },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* logo */}
              <Image source={SKIN.masterLogo} style={{ width: logoW, height: logoH }} resizeMode="contain" />

              {/* industrial header (native steel wordmark styling) */}
              <TbvHeader
                title={step === "request" ? "FORGOT PASSWORD" : "RESET PASSWORD"}
                size={headerSize}
                onBack={goBack}
                style={{ width: WORK_W }}
              />

              {/* ===================== PANEL ===================== */}
              <View style={{ width: panelW, height: panelH, overflow: "hidden" }}>
                <Image
                  source={SKIN.panel}
                  style={{ position: "absolute", top: 0, left: 0, width: panelW, height: panelH }}
                  resizeMode="stretch"
                />
                <View
                  style={{ flex: 1, paddingHorizontal: padX, paddingTop: padTop, paddingBottom: padBot }}
                >
                  <View
                    style={styles.panelInner}
                    onLayout={(e) => {
                      const h = e.nativeEvent.layout.height;
                      if (Math.abs(h - measuredInnerH) > 0.5) setMeasuredInnerH(h);
                    }}
                  >
                    {step === "request" ? (
                      <>
                        <Text style={styles.subhead}>RESET PASSWORD</Text>
                        <Text style={styles.intro}>
                          Enter the email associated with your account and we&apos;ll send a 6-digit
                          reset code.
                        </Text>

                        <View style={[styles.fieldGroup, { marginTop: innerGap, paddingHorizontal: fieldInset }]}>
                          <Text style={styles.label}>EMAIL ADDRESS</Text>
                          <ImageBackground
                            source={SKIN.input}
                            style={{ width: fieldW, height: inputH, justifyContent: "center" }}
                            imageStyle={styles.fillImage}
                            resizeMode="stretch"
                          >
                            <View style={styles.inputInner}>
                              <Ionicons name="mail" size={18} color={TBV.orange} />
                              <TextInput
                                testID="fp-email"
                                style={styles.input}
                                placeholder="you@example.com"
                                placeholderTextColor={TBV.placeholder}
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                              />
                            </View>
                          </ImageBackground>
                        </View>

                        <PrimaryButton label="SEND RESET CODE" icon="mail" onPress={submitEmail} />
                      </>
                    ) : (
                      <>
                        <Text style={styles.intro}>
                          Enter the 6-digit code we sent to{" "}
                          <Text style={styles.introEmail}>{email}</Text>, then choose a new password.
                        </Text>

                        {/* code */}
                        <View style={[styles.fieldGroup, { marginTop: innerGap, paddingHorizontal: fieldInset }]}>
                          <Text style={styles.label}>6-DIGIT CODE</Text>
                          <ImageBackground
                            source={SKIN.input}
                            style={{ width: fieldW, height: inputH, justifyContent: "center" }}
                            imageStyle={styles.fillImage}
                            resizeMode="stretch"
                          >
                            <TextInput
                              testID="fp-code"
                              style={[styles.input, styles.codeInput]}
                              placeholder="000000"
                              placeholderTextColor={TBV.placeholder}
                              value={code}
                              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
                              keyboardType="number-pad"
                              maxLength={6}
                            />
                          </ImageBackground>
                        </View>

                        {/* new password */}
                        <View style={[styles.fieldGroup, { marginTop: innerGap, paddingHorizontal: fieldInset }]}>
                          <Text style={styles.label}>NEW PASSWORD</Text>
                          <ImageBackground
                            source={SKIN.input}
                            style={{ width: fieldW, height: inputH, justifyContent: "center" }}
                            imageStyle={styles.fillImage}
                            resizeMode="stretch"
                          >
                            <View style={styles.inputInner}>
                              <Ionicons name="lock-closed" size={18} color={TBV.orange} />
                              <TextInput
                                testID="fp-new-password"
                                style={styles.input}
                                placeholder="At least 6 characters"
                                placeholderTextColor={TBV.placeholder}
                                value={newPassword}
                                onChangeText={setNewPassword}
                                secureTextEntry={!showPw}
                                autoCapitalize="none"
                                autoCorrect={false}
                              />
                              <TouchableOpacity onPress={() => setShowPw((s) => !s)} hitSlop={10}>
                                <Ionicons
                                  name={showPw ? "eye-off" : "eye"}
                                  size={18}
                                  color={TBV.textMuted}
                                />
                              </TouchableOpacity>
                            </View>
                          </ImageBackground>
                        </View>

                        {/* confirm password */}
                        <View style={[styles.fieldGroup, { marginTop: innerGap, paddingHorizontal: fieldInset }]}>
                          <Text style={styles.label}>CONFIRM NEW PASSWORD</Text>
                          <ImageBackground
                            source={SKIN.input}
                            style={{ width: fieldW, height: inputH, justifyContent: "center" }}
                            imageStyle={styles.fillImage}
                            resizeMode="stretch"
                          >
                            <View style={styles.inputInner}>
                              <Ionicons name="lock-closed" size={18} color={TBV.orange} />
                              <TextInput
                                testID="fp-confirm-password"
                                style={styles.input}
                                placeholder="Re-enter new password"
                                placeholderTextColor={TBV.placeholder}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry={!showPw}
                                autoCapitalize="none"
                                autoCorrect={false}
                              />
                            </View>
                          </ImageBackground>
                        </View>

                        <PrimaryButton label="RESET PASSWORD" icon="checkmark-circle" onPress={submitCode} />

                        <TouchableOpacity style={styles.resendWrap} onPress={resendCode} disabled={busy} hitSlop={8}>
                          <Text style={styles.resendText}>Didn&apos;t get it?  RESEND CODE</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {/* BACK TO SIGN IN */}
                    <TouchableOpacity
                      style={styles.backLink}
                      onPress={() => router.replace("/login")}
                      hitSlop={10}
                      testID="fp-back-to-signin"
                    >
                      <Text style={styles.backLinkText}>BACK TO SIGN IN</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0A0A0A" },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.38)" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },

  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "flex-start", paddingHorizontal: 8 },

  panelInner: { width: "100%" },

  subhead: {
    alignSelf: "center",
    fontFamily: "BebasNeue_400Regular",
    fontSize: 18,
    letterSpacing: 2,
    color: TBV.orange,
    marginBottom: 4,
  },
  intro: {
    color: TBV.textMuted,
    fontFamily: "Exo2_400Regular",
    fontSize: 12.5,
    lineHeight: 17,
    textAlign: "center",
  },
  introEmail: { color: TBV.orange, fontFamily: "Exo2_700Bold" },

  fieldGroup: { width: "100%" },
  label: {
    fontFamily: "Rajdhani_700Bold",
    fontSize: 11,
    letterSpacing: 2,
    color: TBV.steelDim,
    paddingLeft: 8,
    marginBottom: 2,
  },
  inputInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 15,
    height: "100%",
  },
  input: {
    flex: 1,
    color: TBV.text,
    fontFamily: "Exo2_500Medium",
    fontSize: 15,
    paddingVertical: 0,
    includeFontPadding: false,
  },
  codeInput: {
    textAlign: "center",
    fontSize: 22,
    letterSpacing: 8,
    fontFamily: "BebasNeue_400Regular",
    paddingHorizontal: 15,
  },

  submitText: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 22,
    letterSpacing: 2.5,
    color: "#0A0A0A",
  },

  resendWrap: { alignSelf: "center", marginTop: 14 },
  resendText: {
    fontFamily: "Rajdhani_600SemiBold",
    fontSize: 12,
    letterSpacing: 1,
    color: TBV.textMuted,
  },

  backLink: { alignSelf: "center", marginTop: 16, paddingVertical: 2 },
  backLinkText: {
    fontFamily: "Rajdhani_700Bold",
    fontSize: 13,
    letterSpacing: 2,
    color: TBV.orange,
  },

  fillImage: { width: "100%", height: "100%" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
});
